import { all, one } from '../index';

export const items = {
  async listByExpense(expenseId) {
    return all(
      'SELECT * FROM receipt_items WHERE expense_id = ? ORDER BY id',
      [expenseId]
    );
  },

  async trackedItems({ kind = 'all' } = {}) {
    const params = [];
    let where = '';
    if (kind !== 'all') {
      where = 'WHERE kind = ?';
      params.push(kind);
    }
    const rows = await all(
      `SELECT
         normalized_name,
         MAX(name)            AS display_name,
         MAX(kind)            AS kind,
         MAX(canonical_unit)  AS canonical_unit,
         COUNT(*)             AS points_count,
         COALESCE(
           (SELECT SUM(canonical_qty) FROM receipt_items r2
             WHERE r2.normalized_name = r.normalized_name
               AND date(r2.purchase_date) >= date('now', '-30 days')),
           0)                 AS total_qty_30d
       FROM receipt_items r
       ${where}
       GROUP BY normalized_name
       ORDER BY MAX(purchase_date) DESC, MAX(id) DESC`,
      params
    );
    for (const r of rows) {
      const hist = await all(
        `SELECT unit_price, qty, unit, purchase_date
         FROM receipt_items
         WHERE normalized_name = ?
         ORDER BY purchase_date DESC, id DESC
         LIMIT 8`,
        [r.normalized_name]
      );
      r.last_unit_price = hist[0]?.unit_price ?? 0;
      r.prev_unit_price = hist[1]?.unit_price ?? null;
      r.last_qty = hist[0]?.qty ?? null;
      r.last_qty_unit = hist[0]?.unit ?? null;
      r.change_pct = r.prev_unit_price && r.prev_unit_price > 0
        ? ((r.last_unit_price - r.prev_unit_price) / r.prev_unit_price) * 100
        : null;
      r.spark = hist.slice().reverse().map(h => h.unit_price);
    }
    return rows;
  },

  async priceHistory(normalizedName) {
    return all(
      `SELECT r.*, e.merchant
       FROM receipt_items r
       LEFT JOIN expenses e ON e.id = r.expense_id
       WHERE r.normalized_name = ?
       ORDER BY r.purchase_date ASC, r.id ASC`,
      [normalizedName]
    );
  },

  async consumption(normalizedName, { bucket = 'month', range = 12 } = {}) {
    const fmt = bucket === 'week'
      ? `strftime('%Y-W%W', purchase_date)`
      : bucket === 'year'
        ? `substr(purchase_date, 1, 4)`
        : `substr(purchase_date, 1, 7)`;
    const since = bucket === 'week'
      ? `date('now', '-' || ? || ' months')`
      : bucket === 'year'
        ? `date('now', '-' || ? || ' years')`
        : `date('now', '-' || ? || ' months')`;
    const rangeArg = bucket === 'week' ? Math.max(3, Math.ceil(range / 4)) : range;
    return all(
      `SELECT ${fmt} AS period, SUM(canonical_qty) AS qty_canonical
       FROM receipt_items
       WHERE normalized_name = ?
         AND date(purchase_date) >= ${since}
       GROUP BY period
       ORDER BY period`,
      [normalizedName, rangeArg]
    );
  },

  async stats(normalizedName) {
    return one(
      `SELECT
         MIN(unit_price) AS min_price,
         MAX(unit_price) AS max_price,
         AVG(unit_price) AS avg_price,
         SUM(canonical_qty) AS total_qty,
         MAX(canonical_unit) AS canonical_unit
       FROM receipt_items
       WHERE normalized_name = ?`,
      [normalizedName]
    );
  },

  async topMover() {
    const tracked = await this.trackedItems({ kind: 'produce' });
    const movers = tracked.filter(t => t.change_pct !== null && Math.abs(t.change_pct) > 5);
    if (!movers.length) return null;
    movers.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
    return movers[0];
  },
};
