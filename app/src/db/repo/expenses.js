import { exec, all, one, getDB } from '../index';

export const expenses = {
  async list({ limit = 200, offset = 0, categoryId, month } = {}) {
    const params = [];
    let where = '1=1';
    if (categoryId) {
      where += ' AND e.category_id = ?';
      params.push(categoryId);
    }
    if (month) {
      where += ' AND substr(e.expense_date, 1, 7) = ?';
      params.push(month);
    }
    params.push(limit, offset);
    return all(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE ${where}
       ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      params
    );
  },

  async get(id) {
    return one(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.id = ?`,
      [id]
    );
  },

  async create({ category_id, merchant, amount, mood, carbon = 0, recurring = false, notes, receipt_uri, expense_date }) {
    const res = await exec(
      `INSERT INTO expenses (category_id, merchant, amount, mood, carbon, recurring, notes, receipt_uri, expense_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')))`,
      [
        category_id ?? null,
        merchant,
        amount,
        mood ?? null,
        carbon ?? 0,
        recurring ? 1 : 0,
        notes ?? null,
        receipt_uri ?? null,
        expense_date ?? null,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE expenses SET
        category_id = ?, merchant = ?, amount = ?, mood = ?,
        carbon = ?, recurring = ?, notes = ?, receipt_uri = ?, expense_date = ?
       WHERE id = ?`,
      [
        next.category_id ?? null,
        next.merchant,
        next.amount,
        next.mood ?? null,
        next.carbon ?? 0,
        next.recurring ? 1 : 0,
        next.notes ?? null,
        next.receipt_uri ?? null,
        next.expense_date,
        id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec('DELETE FROM expenses WHERE id = ?', [id]);
  },

  async createWithItems({ expense, items }) {
    const db = await getDB();
    let createdId = null;
    await db.withTransactionAsync(async () => {
      const res = await db.runAsync(
        `INSERT INTO expenses (category_id, merchant, amount, mood, carbon, recurring, notes, receipt_uri, expense_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')))`,
        [
          expense.category_id ?? null,
          expense.merchant,
          expense.amount,
          expense.mood ?? null,
          expense.carbon ?? 0,
          expense.recurring ? 1 : 0,
          expense.notes ?? null,
          expense.receipt_uri ?? null,
          expense.expense_date ?? null,
        ]
      );
      createdId = res.lastInsertRowId;
      const dateStr = expense.expense_date || new Date().toISOString().slice(0, 10);
      for (const it of items) {
        await db.runAsync(
          `INSERT INTO receipt_items
             (expense_id, name, normalized_name, kind, qty, unit,
              canonical_qty, canonical_unit, unit_price, price, purchase_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            createdId,
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
          ]
        );
      }
    });
    return this.get(createdId);
  },

  async summaryByCategory(month) {
    const m = month || new Date().toISOString().slice(0, 7);
    return all(
      `SELECT c.id, c.name, c.emoji, c.color, c.budget,
              COALESCE(SUM(e.amount), 0) AS spent
       FROM categories c
       LEFT JOIN expenses e
              ON e.category_id = c.id
             AND substr(e.expense_date, 1, 7) = ?
       GROUP BY c.id
       ORDER BY c.sort_order, c.id`,
      [m]
    );
  },

  async monthlyTrend(months = 6) {
    return all(
      `SELECT substr(expense_date, 1, 7) AS month_key,
              SUM(amount) AS total
       FROM expenses
       WHERE date(expense_date) >= date('now', '-' || ? || ' months')
       GROUP BY month_key
       ORDER BY month_key`,
      [months]
    );
  },

  async streakDays() {
    const rows = await all(
      `SELECT expense_date AS d, SUM(amount) AS total
       FROM expenses
       WHERE date(expense_date) >= date('now', '-60 days')
       GROUP BY expense_date
       ORDER BY expense_date DESC`
    );
    const budgetRow = await one('SELECT COALESCE(SUM(budget), 0) AS total FROM categories');
    const monthlyBudget = budgetRow?.total || 0;
    if (monthlyBudget <= 0) return 0;
    const daily = monthlyBudget / 30;
    const map = new Map(rows.map(r => [r.d, r.total]));
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const spent = map.get(key) || 0;
      if (spent <= daily) streak++;
      else break;
    }
    return streak;
  },
};
