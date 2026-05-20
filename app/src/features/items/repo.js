import { all, one, getDB } from '../../db';
import { NOT_DELETED, NOT_DELETED_R } from '../../db/predicates';
import { toCanonical } from '@core/domain/units';
import { sanitizeFtsQuery } from '@features/expenses/search';
import { buildWhere } from '@features/expenses/filters';

export const items = {
  async listByExpense(expenseId) {
    return all(
      `SELECT * FROM receipt_items
       WHERE expense_id = ? AND ${NOT_DELETED}
       ORDER BY id`,
      [expenseId]
    );
  },

  async trackedItems({ kind = 'all' } = {}) {
    // 3.16 — invariants read from item_summary rollup. The rollup is maintained
    // soft-delete-aware by triggers (v12), so no deleted_at predicate on its
    // side. total_qty_30d is time-windowed (sliding) and stays a live query
    // against receipt_items. Per-item spark history (LIMIT 8) is fetched lazily
    // per row using idx_items_name_date.
    const params = [];
    let where = '1=1';
    if (kind !== 'all') {
      where = 'kind = ?';
      params.push(kind);
    }
    const rows = await all(
      `SELECT
         normalized_name,
         display_name,
         kind,
         canonical_unit,
         last_unit_price,
         last_qty,
         last_unit,
         last_canonical_unit,
         last_seen,
         points_count
       FROM item_summary
       WHERE ${where}
       ORDER BY last_seen DESC, normalized_name`,
      params
    );
    for (const r of rows) {
      const hist = await all(
        `SELECT unit_price, qty, unit, purchase_date
         FROM receipt_items
         WHERE normalized_name = ? AND ${NOT_DELETED}
         ORDER BY purchase_date DESC, id DESC
         LIMIT 8`,
        [r.normalized_name]
      );
      const sum30 = await one(
        `SELECT COALESCE(SUM(canonical_qty), 0) AS s
         FROM receipt_items
         WHERE normalized_name = ?
           AND ${NOT_DELETED}
           AND date(purchase_date) >= date('now', '-30 days')`,
        [r.normalized_name]
      );
      r.total_qty_30d  = sum30?.s ?? 0;
      r.prev_unit_price = hist[1]?.unit_price ?? null;
      r.last_qty_unit   = r.last_unit;
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
       WHERE r.normalized_name = ? AND ${NOT_DELETED_R}
       ORDER BY r.purchase_date ASC, r.id ASC`,
      [normalizedName]
    );
  },

  async consumption(normalizedName, { bucket = 'month', range = 12 } = {}) {
    // 3.15 — month bucket reads the indexed month_key generated column; week
    // and year still use strftime/substr-4 (no v3 generated column for those).
    const fmt = bucket === 'week'
      ? `strftime('%Y-W%W', purchase_date)`
      : bucket === 'year'
        ? `substr(purchase_date, 1, 4)`
        : `month_key`;
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
         AND ${NOT_DELETED}
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
       WHERE normalized_name = ? AND ${NOT_DELETED}`,
      [normalizedName]
    );
  },

  async sameQtyHistory(normalizedName, qty, unit, { tolerance = 0.2, limit = 8 } = {}) {
    if (!normalizedName || !isFinite(qty) || qty <= 0) return [];
    const { canonical_qty } = toCanonical(qty, unit);
    const low  = canonical_qty * (1 - tolerance);
    const high = canonical_qty * (1 + tolerance);
    return all(
      `SELECT r.*, e.merchant
       FROM receipt_items r
       LEFT JOIN expenses e ON e.id = r.expense_id
       WHERE r.normalized_name = ?
         AND r.canonical_qty BETWEEN ? AND ?
         AND ${NOT_DELETED_R}
       ORDER BY r.purchase_date DESC, r.id DESC
       LIMIT ?`,
      [normalizedName, low, high, limit]
    );
  },

  // 5.2 — FTS5 search over item_fts (name + normalized_name). Joins to
  // receipt_items + expenses so the result row carries enough context for
  // the search UI (display name, when, where, how much). Soft-delete-aware
  // on both the item and its parent expense.
  async search({ query, limit = 100 } = {}) {
    const q = sanitizeFtsQuery(query);
    if (!q) return [];
    return all(
      `SELECT r.id, r.expense_id, r.name, r.normalized_name, r.kind,
              r.qty, r.unit, r.unit_price, r.price, r.purchase_date,
              e.merchant, e.expense_date, e.amount AS expense_amount,
              c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
       FROM item_fts f
       JOIN receipt_items r ON r.id = f.rowid
       JOIN expenses e ON e.id = r.expense_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE item_fts MATCH ?
         AND ${NOT_DELETED_R}
         AND e.deleted_at IS NULL
       ORDER BY r.purchase_date DESC, r.id DESC
       LIMIT ?`,
      [q, limit]
    );
  },

  async suggest(prefix, { limit = 6 } = {}) {
    // 3.17 — reads from item_summary, which already stores display_name, kind,
    // last_unit, last_unit_price, last_canonical_unit, last_seen per
    // normalized_name. Strictly simpler than FIRST_VALUE OVER receipt_items
    // (same goal: no correlated subqueries) and the rollup is soft-delete-aware
    // so we don't need a predicate.
    const q = String(prefix || '').trim().toLowerCase();
    if (q.length < 1) return [];
    return all(
      `SELECT
         normalized_name,
         display_name,
         kind,
         last_unit            AS last_unit,
         last_unit_price      AS last_unit_price,
         last_canonical_unit  AS last_canonical_unit,
         last_seen
       FROM item_summary
       WHERE normalized_name LIKE ?
       ORDER BY last_seen DESC
       LIMIT ?`,
      [`${q}%`, limit]
    );
  },

  async remove(id) {
    const db = await getDB();
    await db.runAsync(
      `UPDATE receipt_items SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    const db = await getDB();
    await db.runAsync('UPDATE receipt_items SET deleted_at = NULL WHERE id = ?', [id]);
  },

  async replaceItems(expenseId, items, purchaseDate) {
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM receipt_items WHERE expense_id = ?', [expenseId]);
      const dateStr = purchaseDate || new Date().toISOString().slice(0, 10);
      for (const it of items) {
        await db.runAsync(
          `INSERT INTO receipt_items
             (expense_id, name, normalized_name, kind, qty, unit,
              canonical_qty, canonical_unit, unit_price, price, purchase_date,
              hsn, cgst_rate, sgst_rate, igst_rate,
              batch_no, expiry_date, mfg_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            expenseId,
            it.name,
            it.normalized_name,
            it.kind || 'other',
            it.qty,
            it.unit,
            it.canonical_qty,
            it.canonical_unit,
            it.unit_price,
            it.price,
            dateStr,
            it.hsn ?? null,
            it.cgst_rate ?? null,
            it.sgst_rate ?? null,
            it.igst_rate ?? null,
            it.batch_no ?? null,
            it.expiry_date ?? null,
            it.mfg_date ?? null,
          ]
        );
      }
    });
  },

  async topMover() {
    const tracked = await this.trackedItems({ kind: 'produce' });
    const movers = tracked.filter(t => t.change_pct !== null && Math.abs(t.change_pct) > 5);
    if (!movers.length) return null;
    movers.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
    return movers[0];
  },

  // 5.7 — flat join of receipt_items with their parent expense for export.
  // Applies the same WHERE-builder against the parent expenses table so the
  // Export screen and the 5.8 batch-export path filter both surfaces through
  // one criteria object. Soft-delete-aware on the item row (NOT_DELETED_R);
  // the parent's deleted_at predicate is added by buildWhere itself.
  async listForExport({ criteria, limit = 5000 } = {}) {
    const { whereSql, params } = buildWhere(criteria, { tableAlias: 'e' });
    return all(
      `SELECT r.id, r.expense_id, r.name, r.normalized_name, r.kind,
              r.qty, r.unit, r.canonical_qty, r.canonical_unit,
              r.unit_price, r.price, r.purchase_date,
              r.hsn, r.cgst_rate, r.sgst_rate, r.igst_rate,
              r.batch_no, r.expiry_date, r.mfg_date,
              e.merchant, e.expense_date,
              c.name AS category_name
         FROM receipt_items r
         JOIN expenses e ON e.id = r.expense_id
    LEFT JOIN categories c ON c.id = e.category_id
        WHERE ${whereSql}
          AND ${NOT_DELETED_R}
        ORDER BY r.purchase_date DESC, r.expense_id DESC, r.id
        LIMIT ?`,
      [...params, limit]
    );
  },
};
