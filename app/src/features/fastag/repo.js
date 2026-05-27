import { exec, all, one } from '../../db';

// PS-13 — FASTag accounts repo.
//
// Each row models one FASTag tied to a vehicle. Toll-charge expenses pull
// in via expenses.fastag_account_id (FK SET NULL). Balance is user-edited
// (or maintained by a future NHAI CSV import); no automatic deduction
// from toll-tagged expenses to keep this simple — the user can re-stamp
// after each recharge.

export const fastagRepo = {
  async list() {
    return all(
      `SELECT * FROM fastag_accounts
        WHERE deleted_at IS NULL
        ORDER BY sort_order, id`
    );
  },

  async get(id) {
    return one('SELECT * FROM fastag_accounts WHERE id = ?', [id]);
  },

  async create({
    vehicle_id = null, tag_id = null, bank = null, label,
    current_balance = 0, last_synced = null, notes = null,
    icon = null, color = null, sort_order = null,
  }) {
    let nextOrder = sort_order;
    if (nextOrder == null) {
      const r = await one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM fastag_accounts WHERE deleted_at IS NULL');
      nextOrder = r?.n ?? 0;
    }
    const res = await exec(
      `INSERT INTO fastag_accounts
         (vehicle_id, tag_id, bank, label, current_balance, last_synced,
          notes, icon, color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle_id, tag_id, bank, label, current_balance, last_synced,
        notes, icon || '🛣️', color || '#b09c8a', nextOrder,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE fastag_accounts SET
         vehicle_id = ?, tag_id = ?, bank = ?, label = ?,
         current_balance = ?, last_synced = ?, notes = ?,
         icon = ?, color = ?, sort_order = ?
       WHERE id = ?`,
      [
        next.vehicle_id, next.tag_id, next.bank, next.label,
        next.current_balance, next.last_synced, next.notes,
        next.icon, next.color, next.sort_order, id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE fastag_accounts SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE fastag_accounts SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // YTD toll spend grouped by account.
  async ytdSpend({ fyStart } = {}) {
    const start = fyStart || `${new Date().getFullYear()}-01-01`;
    return all(
      `SELECT fastag_account_id AS account_id,
              COUNT(*) AS txns,
              COALESCE(SUM(amount), 0) AS total
         FROM expenses
        WHERE deleted_at IS NULL
          AND fastag_account_id IS NOT NULL
          AND expense_date >= ?
        GROUP BY fastag_account_id`,
      [start]
    );
  },

  async linkedExpenses(accountId, { limit = 100 } = {}) {
    if (accountId == null) return [];
    return all(
      `SELECT id, merchant, amount, expense_date, category_id, payment_method
         FROM expenses
        WHERE deleted_at IS NULL
          AND fastag_account_id = ?
        ORDER BY expense_date DESC, id DESC
        LIMIT ?`,
      [accountId, limit]
    );
  },
};
