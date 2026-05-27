// 8.7 — Maintenance task: monthly_summary integrity audit.
//
// monthly_summary is kept in sync by AFTER INSERT/UPDATE/DELETE triggers
// on expenses (v6 + v12 soft-delete-aware variants). The triggers are
// correct by construction — but in a 10-year app a defensive audit is
// cheap insurance against a missed trigger refactor or a hand-edit gone
// wrong.
//
// Recomputes per-(month_key, category_id): SUM(amount) and COUNT(*) over
// LIVE expenses (deleted_at IS NULL). Compares against the stored rollup
// row. Logs discrepancies via logError but does NOT auto-fix — silently
// repairing would mask the underlying bug. The signal is the log line.
//
// Pure helper exported for the harness.

import { logError } from '@core/utils/log';

// Compare two arrays of {month_key, category_id, total, txn_count}. Returns
// discrepancies as: { kind: 'total'|'count'|'missing'|'extra', month_key,
// category_id, live, summary }. `live` is the recomputed value, `summary`
// is the stored. ~1 cent rounding tolerance on the SUM since SQLite REAL
// arithmetic can drift sub-cent.
export function auditMonthlySummary(liveRows, summaryRows) {
  const key = (r) => `${r.month_key}|${r.category_id ?? 'null'}`;
  const liveMap = new Map(liveRows.map(r => [key(r), r]));
  const sumMap  = new Map(summaryRows.map(r => [key(r), r]));
  const out = [];

  for (const [k, live] of liveMap) {
    const stored = sumMap.get(k);
    if (!stored) {
      out.push({ kind: 'missing', month_key: live.month_key, category_id: live.category_id, live, summary: null });
      continue;
    }
    if (Math.abs((stored.total ?? 0) - (live.total ?? 0)) > 0.01) {
      out.push({ kind: 'total', month_key: live.month_key, category_id: live.category_id, live, summary: stored });
    }
    if ((stored.txn_count ?? 0) !== (live.txn_count ?? 0)) {
      out.push({ kind: 'count', month_key: live.month_key, category_id: live.category_id, live, summary: stored });
    }
  }
  for (const [k, stored] of sumMap) {
    if (!liveMap.has(k)) {
      // Skip rows where the summary correctly carries 0/0 — that's an
      // intentional residue from a category that once had expenses and
      // now has none.
      if ((stored.total ?? 0) === 0 && (stored.txn_count ?? 0) === 0) continue;
      out.push({ kind: 'extra', month_key: stored.month_key, category_id: stored.category_id, live: null, summary: stored });
    }
  }
  return out;
}

export default {
  name: 'monthlySummaryAudit',
  async run({ db }) {
    const liveRows = await db.getAllAsync(`
      SELECT month_key,
             category_id,
             ROUND(SUM(amount), 2) AS total,
             COUNT(*)              AS txn_count
        FROM expenses
       WHERE deleted_at IS NULL
       GROUP BY month_key, category_id
    `);
    const summaryRows = await db.getAllAsync(`
      SELECT month_key, category_id, total, txn_count FROM monthly_summary
    `);

    const discrepancies = auditMonthlySummary(liveRows, summaryRows);

    if (discrepancies.length > 0) {
      // One log line summarising; per-discrepancy detail rolled into the
      // error payload for grep-ability without spamming the log.
      logError('monthlySummaryAudit:discrepancy',
        new Error(`${discrepancies.length} discrepancies: ${
          discrepancies.slice(0, 5).map(d =>
            `${d.kind}@${d.month_key}/${d.category_id}`).join(', ')
        }${discrepancies.length > 5 ? ' …' : ''}`));
    }

    return { discrepancies: discrepancies.length, liveGroups: liveRows.length, summaryRows: summaryRows.length };
  },
};
