import { exec, all, one } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

// 5.5 — income repo. Mirrors expenses' API surface: list / get / create /
// update / remove plus a couple of aggregates 5.6 + future 6.x rely on.
// Soft-delete discipline is identical (NOT_DELETED predicate on every list).
export const income = {
  async list({ limit = 200, offset = 0, month } = {}) {
    const params = [];
    let where = `${NOT_DELETED}`;
    if (month) {
      where += ' AND month_key = ?';
      params.push(month);
    }
    return all(
      `SELECT * FROM income
       WHERE ${where}
       ORDER BY received_date DESC, created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
  },

  async get(id) {
    return one(`SELECT * FROM income WHERE id = ?`, [id]);
  },

  async create({ source, amount, recurring = false, notes, received_date }) {
    const res = await exec(
      `INSERT INTO income (source, amount, recurring, notes, received_date)
       VALUES (?, ?, ?, ?, COALESCE(?, date('now')))`,
      [source, amount, recurring ? 1 : 0, notes ?? null, received_date ?? null]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE income SET source = ?, amount = ?, recurring = ?, notes = ?, received_date = ?
       WHERE id = ?`,
      [
        next.source,
        next.amount,
        next.recurring ? 1 : 0,
        next.notes ?? null,
        next.received_date,
        id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec('DELETE FROM income WHERE id = ?', [id]);
  },

  // 5.6 — current-month denominator for the savings widget. Returns 0 when no
  // income recorded; the Home widget hides itself on the falsy path.
  async monthlyTotal(month) {
    const m = month || new Date().toISOString().slice(0, 7);
    const row = await one(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM income
        WHERE month_key = ? AND ${NOT_DELETED}`,
      [m]
    );
    return row?.total || 0;
  },

  // Parallels expenses.monthlyTrend (3.19). No rollup table for income yet —
  // a small GROUP BY over a single-user table is cheap. Bumps to a rollup when
  // 6.x analytics demands it.
  async monthlyTrend(months = 6) {
    return all(
      `SELECT month_key, SUM(amount) AS total
         FROM income
        WHERE month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
          AND ${NOT_DELETED}
        GROUP BY month_key
        ORDER BY month_key`,
      [months]
    );
  },

  // 5.7 — list income rows for export. Only the `dateRange` axis of the
  // shared `criteria` object is applied here — income doesn't share columns
  // with expenses, so categoryIds/merchantIds/ids/etc. are silently ignored.
  // 5.8 batch-export never passes income ids (selection mode is AllExpenses-
  // only), so we don't need an income ids axis.
  async listForExport({ criteria, limit = 5000 } = {}) {
    const params = [];
    const frags = [NOT_DELETED];
    if (criteria && criteria.dateRange) {
      const { from, to } = criteria.dateRange;
      if (from && to) {
        frags.push('received_date BETWEEN ? AND ?');
        params.push(from, to);
      } else if (from) {
        frags.push('received_date >= ?');
        params.push(from);
      } else if (to) {
        frags.push('received_date <= ?');
        params.push(to);
      }
    }
    return all(
      `SELECT id, source, amount, recurring, notes, received_date, created_at
         FROM income
        WHERE ${frags.join(' AND ')}
        ORDER BY received_date DESC, id DESC
        LIMIT ?`,
      [...params, limit]
    );
  },
};
