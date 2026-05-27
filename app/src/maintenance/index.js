// 8.7 — Maintenance job orchestrator.
//
// Fires once per AppState background → active transition (wired in App.js),
// rate-limited to ≥24h since the last successful run (durable timestamp on
// settings.last_maintenance_at, v40).
//
// Tasks run sequentially (same DB connection, same filesystem); each is
// independently fault-tolerant — a task throw is logged and the loop
// continues. The settings timestamp updates even on per-task failures so
// the rate-limit protects against constant-retry loops; the user-visible
// signal that something went wrong is the logError emission, not a
// blocked re-run.
//
// Per-task work caps live inside the task modules (e.g. hashBackfill
// processes ≤50 rows per run). Caps spread the work across days so the
// bg→fg transition stays snappy; correctness is preserved because the
// next run picks up where we left off.

import { getDB } from '../db';
import { logError, logInfo } from '@core/utils/log';
import oldJpegSweep         from './tasks/oldJpegSweep';
import hashBackfill         from './tasks/hashBackfill';
import orphanGc             from './tasks/orphanGc';
import analyze              from './tasks/analyze';
import accountSnapshot      from './tasks/accountSnapshot';
import monthlySummaryAudit  from './tasks/monthlySummaryAudit';
import archiveOldRows       from './tasks/archiveOldRows';
import trimDbStats          from './tasks/trimDbStats';

const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

// Order matters: oldJpegSweep RENAMES files (legacy flat → partitioned),
// hashBackfill READS file bytes (needs current paths), orphanGc DELETES
// files (needs the post-rename layout). Putting any of them out of order
// produces phantom-orphan races.
const TASKS = [
  oldJpegSweep,
  hashBackfill,
  orphanGc,
  analyze,
  // 8.12 — stamps today's net-worth snapshot when AccountsProvider hasn't
  // already done so (the user hasn't opened the app today). Sits between
  // ANALYZE (fresh stats) and the rollup audit (reads the just-stamped
  // snapshot count as part of its sanity surface in future revisions).
  accountSnapshot,
  monthlySummaryAudit,
  // 5.F.01 — yearly archive of cold expenses. Internally gated on
  // settings.last_archive_at ≥365 days; cheap no-op the other ~364 runs.
  // Placed AFTER monthlySummaryAudit so the audit sees the pre-archive
  // state (the audit compares live rows vs the stored monthly_summary,
  // and archive's DELETE fires trg_exp_ad which decrements the rollup —
  // running audit first means today's audit isn't confused by a fresh
  // archive batch). One cycle of skew is acceptable; the next run audits
  // the post-archive state.
  archiveOldRows,
  // 8.10 — trim runs last so the slow-log row inserted by the upserts
  // above (which themselves go through `exec()`/`one()`) is included in
  // the next cycle's window, not this one.
  trimDbStats,
];

// Pure — exported so the validation harness can test the gate without
// touching the DB.
export function isDue(lastRunAt, nowMs) {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return true;        // malformed → treat as never-run
  if (last > nowMs) return false;                  // future timestamp (clock skew) — wait it out
  return (nowMs - last) >= RATE_LIMIT_MS;
}

export async function runMaintenanceIfDue() {
  let db;
  try {
    db = await getDB();
  } catch (e) {
    logError('maintenance:getDB', e);
    return { ran: false, error: e.message };
  }

  let lastRunAt = null;
  try {
    const row = await db.getFirstAsync(`SELECT last_maintenance_at FROM settings WHERE id = 1`);
    lastRunAt = row?.last_maintenance_at ?? null;
  } catch (e) {
    // Pre-v40 install or settings row missing — treat as never-run.
    logError('maintenance:read-last-run', e);
  }

  if (!isDue(lastRunAt, Date.now())) {
    return { ran: false, skipped: 'rate-limit' };
  }

  const results = [];
  for (const task of TASKS) {
    const t0 = Date.now();
    try {
      const r = await task.run({ db });
      results.push({ task: task.name, ok: true, ms: Date.now() - t0, ...(r || {}) });
    } catch (e) {
      logError(`maintenance:${task.name}`, e);
      results.push({ task: task.name, ok: false, ms: Date.now() - t0, error: e.message });
    }
  }

  // Stamp the run timestamp regardless of per-task failures — the gate
  // protects against constant-retry on every bg→fg; per-task errors get
  // their own logError emissions above.
  try {
    await db.runAsync(`UPDATE settings SET last_maintenance_at = ? WHERE id = 1`,
                      [new Date().toISOString()]);
  } catch (e) {
    logError('maintenance:stamp', e);
  }

  logInfo('maintenance', `done: ${results.map(r => `${r.task}:${r.ok ? 'ok' : 'err'}(${r.ms}ms)`).join(' ')}`);
  return { ran: true, results };
}
