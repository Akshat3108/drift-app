import * as SQLite from 'expo-sqlite';
import { migrations, TABLES, V1_REQUIRED_TABLES } from './schema';
import { logError, logInfo } from '../core/utils/log';

let _db = null;
let _opening = null;

export async function getDB() {
  if (_db) return _db;
  if (_opening) return _opening;
  _opening = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('drift.db');
      // Runtime PRAGMAs — per-connection settings, must run before any transaction
      // or first read. foreign_keys is a per-connection PRAGMA (not DDL), so it
      // lives here, not inside a migration.
      await db.execAsync(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -20000;
        PRAGMA mmap_size = 268435456;
        PRAGMA wal_autocheckpoint = 1000;
      `);
      await runMigrations(db);
      _db = db;
      return db;
    } finally {
      _opening = null;
    }
  })();
  return _opening;
}

async function runMigrations(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const head = await db.getFirstAsync(
    'SELECT COALESCE(MAX(version), 0) AS v FROM schema_version'
  );
  let currentVersion = head?.v || 0;

  // Legacy stamp: an install from before this runner existed has every v1 table
  // already, but no schema_version row. Record v1 without re-running v1.up.
  if (currentVersion === 0) {
    const placeholders = V1_REQUIRED_TABLES.map(() => '?').join(',');
    const existing = await db.getAllAsync(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
      V1_REQUIRED_TABLES
    );
    if (existing.length === V1_REQUIRED_TABLES.length) {
      await db.runAsync(
        'INSERT INTO schema_version (version, name) VALUES (?, ?)',
        [1, 'initial-schema (legacy stamp)']
      );
      currentVersion = 1;
      logInfo('migration', 'stamped legacy install as v1 (no DDL run)');
    }
  }

  for (const mig of migrations) {
    if (mig.version <= currentVersion) continue;
    try {
      if (mig.transactionless) {
        // The migration owns its own transaction discipline. Needed when the
        // body must toggle PRAGMAs (e.g. foreign_keys) that SQLite ignores
        // inside a multi-statement transaction. The migration is responsible
        // for being idempotent on retry — if up() commits but the stamp insert
        // below fails, the next boot will re-run up().
        await mig.up(db);
        await db.runAsync(
          'INSERT INTO schema_version (version, name) VALUES (?, ?)',
          [mig.version, mig.name]
        );
      } else {
        await db.withTransactionAsync(async () => {
          await mig.up(db);
          await db.runAsync(
            'INSERT INTO schema_version (version, name) VALUES (?, ?)',
            [mig.version, mig.name]
          );
        });
      }
      logInfo('migration', `applied v${mig.version} ${mig.name}`);
    } catch (e) {
      logError(`migration:v${mig.version}`, e);
      throw e;
    }
  }
}

// 8.8 — Release the SQLite handle so a restore can swap the file underneath.
// After calling this, the next getDB() will reopen on whatever drift.db is
// at SQLite/drift.db at the time (i.e. the restored file). Safe to call
// even when no handle is open (no-op). Restore flow ALWAYS pairs closeDB()
// with a subsequent getDB() — leaving _db null mid-flight is fine for the
// brief atomic-flip window because no other code path reads during it.
export async function closeDB() {
  if (!_db) return;
  const handle = _db;
  _db = null;
  try { await handle.closeAsync(); } catch (e) { logError('closeDB', e); }
}

export async function resetAll() {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    for (const t of TABLES) {
      await db.execAsync(`DELETE FROM ${t};`);
    }
  });
}

// 8.10 — Perf observability wrapper.
//
// Threshold for "slow" query: ≥ 50 ms increments `slow_count` AND
// (dev-only) appends a full-SQL row to `db_slow_log`. Aggregate counters
// in `db_stats` are always-on (release builds too) — one upsert per
// query is cheap and gives the Diagnostics screen data when tap-debugging
// a production install. Release builds intentionally skip the slow-log
// SQL row so user-readable SQL (which may contain merchant names from
// search queries) never persists to disk in plaintext.
//
// Label extraction: SQL verb + first table identifier (from FROM / INTO /
// UPDATE / TABLE). Sufficient bucketing for the aggregate view.
//
// recordStats() calls db.runAsync DIRECTLY (the raw SQLite handle), not
// the wrapped exec()/all()/one() — so there is no recursion risk and no
// reentrancy guard is needed.

const SLOW_QUERY_MS = 50;

function deriveLabel(sql) {
  if (typeof sql !== 'string') return 'UNKNOWN';
  const trimmed = sql.trim();
  const m = /^(SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH|EXPLAIN|PRAGMA|ANALYZE|VACUUM|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)\b/i
    .exec(trimmed);
  if (!m) return 'OTHER';
  const verb = m[1].toUpperCase();
  const tableM = /(?:FROM|INTO|UPDATE|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/i.exec(trimmed);
  return tableM ? `${verb} ${tableM[1]}` : verb;
}

async function recordStats(db, label, durationMs, sql) {
  try {
    const isSlow = durationMs >= SLOW_QUERY_MS ? 1 : 0;
    await db.runAsync(
      `INSERT INTO db_stats (label, call_count, total_ms, max_ms, slow_count, last_run_at)
       VALUES (?, 1, ?, ?, ?, datetime('now'))
       ON CONFLICT(label) DO UPDATE SET
         call_count  = call_count + 1,
         total_ms    = total_ms + excluded.total_ms,
         max_ms      = MAX(max_ms, excluded.max_ms),
         slow_count  = slow_count + excluded.slow_count,
         last_run_at = excluded.last_run_at`,
      [label, durationMs, durationMs, isSlow]
    );
    if (isSlow && typeof __DEV__ !== 'undefined' && __DEV__) {
      await db.runAsync(
        `INSERT INTO db_slow_log (label, sql, duration_ms) VALUES (?, ?, ?)`,
        [label, sql, durationMs]
      );
    }
  } catch (e) {
    // Pre-v42 install (DB hasn't migrated yet) or table missing for any
    // other reason — silently skip. Stats are observability, not
    // correctness; their failure must never break a user-facing query.
    logError('perf:recordStats', e);
  }
}

async function timed(method, sql, params) {
  const db = await getDB();
  const t0 = Date.now();
  const result = await db[method](sql, params);
  const dt = Date.now() - t0;
  // Fire-and-forget — stats write does NOT block the caller's promise.
  recordStats(db, deriveLabel(sql), dt, sql);
  return result;
}

export async function exec(sql, params = []) {
  return timed('runAsync', sql, params);
}

export async function all(sql, params = []) {
  return timed('getAllAsync', sql, params);
}

export async function one(sql, params = []) {
  return timed('getFirstAsync', sql, params);
}

// Exported for the Diagnostics screen + the validation harness.
export const _perf = {
  SLOW_QUERY_MS,
  deriveLabel,
};
