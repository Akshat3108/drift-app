import { all, one, getDB } from '../../db';

// 7.10 — Rollover budgets repo.
//
// Lazy compute: pots() reads ensureRolloverForMonth(monthKey) before its
// SELECT so the budget_rollover row for the current month is always present
// (when the category has rollover_enabled=1 and any prior history exists).
//
// Rule:
//   rollover_in(M) = (current_budget + rollover_in(M-1)) - spend(M-1)
// Skipped (no row inserted, rollover_in is treated as 0 on read) when prev
// month has no monthly_summary row AND no budget_rollover row — avoids
// gifting a free extra budget to brand-new categories on second-month.
//
// INSERT OR REPLACE makes the compute idempotent: every pots() call regenerates
// the current row from the freshest prev-month state, so a retroactive edit
// to a prior-month expense propagates forward on next read.

export function prevMonthKey(monthKey) {
  if (typeof monthKey !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  mo -= 1;
  if (mo === 0) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export const rolloverRepo = {
  // Refresh budget_rollover rows for all rollover-enabled categories for the
  // given month. Idempotent. Returns the count of rows upserted.
  async ensureRolloverForMonth(monthKey) {
    if (!monthKey) return 0;
    const prev = prevMonthKey(monthKey);
    if (!prev) return 0;
    const cats = await all(
      `SELECT id, budget FROM categories
        WHERE deleted_at IS NULL AND rollover_enabled = 1`
    );
    if (!cats.length) return 0;
    const db = await getDB();
    let n = 0;
    await db.withTransactionAsync(async () => {
      for (const cat of cats) {
        const prevSpend = await db.getFirstAsync(
          `SELECT total FROM monthly_summary WHERE month_key = ? AND category_id = ?`,
          [prev, cat.id]
        );
        const prevRoll = await db.getFirstAsync(
          `SELECT rollover_in FROM budget_rollover WHERE month_key = ? AND category_id = ?`,
          [prev, cat.id]
        );
        // No prior history at all → don't seed a row. Skipping here means
        // pots() reads rollover_in as 0 via LEFT JOIN.
        if (!prevSpend && !prevRoll) continue;
        const prevBudget = Number(cat.budget) || 0;
        const prevRollIn = Number(prevRoll?.rollover_in) || 0;
        const prevTotal  = Number(prevSpend?.total) || 0;
        const rolloverIn = (prevBudget + prevRollIn) - prevTotal;
        await db.runAsync(
          `INSERT INTO budget_rollover (category_id, month_key, rollover_in, computed_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT (category_id, month_key) DO UPDATE SET
             rollover_in = excluded.rollover_in,
             computed_at = excluded.computed_at`,
          [cat.id, monthKey, rolloverIn]
        );
        n += 1;
      }
    });
    return n;
  },

  async rolloverForMonth(monthKey) {
    if (!monthKey) return new Map();
    const rows = await all(
      `SELECT category_id, rollover_in FROM budget_rollover WHERE month_key = ?`,
      [monthKey]
    );
    return new Map(rows.map(r => [r.category_id, Number(r.rollover_in) || 0]));
  },

  async getForCategory(categoryId, monthKey) {
    if (!categoryId || !monthKey) return null;
    return one(
      `SELECT * FROM budget_rollover WHERE category_id = ? AND month_key = ?`,
      [categoryId, monthKey]
    );
  },
};
