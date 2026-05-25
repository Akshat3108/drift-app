import { exec, all, one, getDB } from '../../db';
import { merchants } from '@features/expenses/merchants.repo';

// 7.12 — Utility accounts + bills repos.
//
// Two parallel repos. `utility_accounts` is a thin reference table (one row
// per recurring utility); `utility_bills` is the time-series billing log.
// A bill is always 1-to-1 with an `expenses` row (UNIQUE FK) so create/update
// go through a shared transaction helper (mirrors 7.6 fuel pattern).

const KIND_ICONS = {
  electricity: '⚡',
  gas:         '🔥',
  water:       '💧',
  internet:    '📡',
  mobile:      '📱',
  dth:         '📺',
  other:       '💡',
};

export function defaultIconForKind(kind) {
  return KIND_ICONS[kind] || KIND_ICONS.other;
}

export const utilityAccountsRepo = {
  async listLive() {
    return all(
      `SELECT * FROM utility_accounts
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`
    );
  },

  async get(id) {
    return one('SELECT * FROM utility_accounts WHERE id = ?', [id]);
  },

  async create({
    name, kind = 'other', provider = null, account_number = null,
    icon = null, color = '#888', billing_day = null, notes = null,
  }) {
    if (!name) throw new Error('utilityAccountsRepo.create: name required');
    const res = await exec(
      `INSERT INTO utility_accounts
         (name, kind, provider, account_number, icon, color, billing_day, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, kind, provider, account_number,
        icon || defaultIconForKind(kind),
        color, billing_day, notes,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE utility_accounts SET
         name = ?, kind = ?, provider = ?, account_number = ?,
         icon = ?, color = ?, billing_day = ?, notes = ?
       WHERE id = ?`,
      [
        next.name, next.kind, next.provider, next.account_number,
        next.icon || defaultIconForKind(next.kind),
        next.color || '#888',
        next.billing_day, next.notes,
        id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE utility_accounts SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE utility_accounts SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

export const utilityBillsRepo = {
  async listByAccount(accountId) {
    if (accountId == null) return [];
    return all(
      `SELECT * FROM utility_bills
        WHERE deleted_at IS NULL AND utility_account_id = ?
        ORDER BY period_end DESC, id DESC`,
      [accountId]
    );
  },

  async get(id) {
    return one('SELECT * FROM utility_bills WHERE id = ?', [id]);
  },

  async getByExpense(expenseId) {
    if (expenseId == null) return null;
    return one('SELECT * FROM utility_bills WHERE expense_id = ?', [expenseId]);
  },

  // Per-account roll-up for the Utilities list hero — last bill total +
  // last period_end + total-this-year. Returns a Map keyed by account id.
  async aggregatesByAccount() {
    const rows = await all(
      `SELECT utility_account_id AS aid,
              COUNT(*) AS bill_count,
              MAX(period_end) AS last_period_end,
              SUM(CASE WHEN period_end >= date('now', '-12 months') THEN total ELSE 0 END) AS year_total,
              (SELECT total FROM utility_bills
                WHERE utility_account_id = ub.utility_account_id
                  AND deleted_at IS NULL
                ORDER BY period_end DESC, id DESC LIMIT 1) AS last_total
         FROM utility_bills ub
        WHERE deleted_at IS NULL
     GROUP BY utility_account_id`
    );
    const out = new Map();
    for (const r of rows) out.set(r.aid, r);
    return out;
  },

  // Consumption + rate trend for the per-account chart. Returns oldest→newest
  // so the renderer can drop it straight into an SVG Polyline.
  async consumptionTrend(accountId, { months = 12 } = {}) {
    if (accountId == null) return [];
    const rows = await all(
      `SELECT id, period_start, period_end,
              units_consumed, rate_per_unit, total
         FROM utility_bills
        WHERE deleted_at IS NULL
          AND utility_account_id = ?
          AND period_end >= date('now', '-' || ? || ' months')
        ORDER BY period_end ASC, id ASC`,
      [accountId, months]
    );
    return rows;
  },

  // Atomic dual-write: create the expense row, then the bill that links to it.
  // Wrapped in withTransactionAsync so a failure on either side rolls both
  // rows back. Mirrors 7.6 fillupsRepo.createWithExpense.
  async createWithExpense({ expense, bill }) {
    const db = await getDB();
    let createdExpenseId = null;
    let createdBillId    = null;
    await db.withTransactionAsync(async () => {
      const merchantId = expense.merchant_id != null
        ? expense.merchant_id
        : await merchants.resolve(expense.merchant);
      const expRes = await db.runAsync(
        `INSERT INTO expenses
           (category_id, merchant, merchant_id, amount, mood, carbon, recurring,
            notes, receipt_uri, expense_date, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?)`,
        [
          expense.category_id ?? null,
          expense.merchant,
          merchantId,
          expense.amount,
          expense.mood ?? null,
          expense.carbon ?? 0,
          expense.recurring ? 1 : 0,
          expense.notes ?? null,
          expense.receipt_uri ?? null,
          expense.expense_date ?? null,
          expense.payment_method ?? null,
        ]
      );
      createdExpenseId = expRes.lastInsertRowId;
      const billRes = await db.runAsync(
        `INSERT INTO utility_bills
           (utility_account_id, period_start, period_end,
            units_consumed, rate_per_unit, base_charge, taxes,
            total, due_date, expense_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bill.utility_account_id,
          bill.period_start,
          bill.period_end,
          bill.units_consumed ?? null,
          bill.rate_per_unit ?? null,
          bill.base_charge ?? null,
          bill.taxes ?? null,
          bill.total,
          bill.due_date ?? null,
          createdExpenseId,
          bill.notes ?? null,
        ]
      );
      createdBillId = billRes.lastInsertRowId;
    });
    return { expense_id: createdExpenseId, bill_id: createdBillId };
  },

  // Update both rows in one transaction. Either may be omitted to update just
  // one side.
  async updatePair(billId, { expense: expensePatch, bill: billPatch }) {
    const cur = await this.get(billId);
    if (!cur) return null;
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      if (expensePatch && cur.expense_id != null) {
        const fields = [];
        const values = [];
        for (const [k, v] of Object.entries(expensePatch)) {
          fields.push(`${k} = ?`);
          values.push(v);
        }
        if (fields.length) {
          values.push(cur.expense_id);
          await db.runAsync(
            `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`,
            values
          );
        }
      }
      if (billPatch) {
        const next = { ...cur, ...billPatch };
        await db.runAsync(
          `UPDATE utility_bills SET
             period_start = ?, period_end = ?, units_consumed = ?,
             rate_per_unit = ?, base_charge = ?, taxes = ?,
             total = ?, due_date = ?, notes = ?
           WHERE id = ?`,
          [
            next.period_start, next.period_end, next.units_consumed,
            next.rate_per_unit, next.base_charge, next.taxes,
            next.total, next.due_date, next.notes,
            billId,
          ]
        );
      }
    });
    return this.get(billId);
  },

  async remove(id) {
    // Soft-delete the bill. The linked expense stays live unless the caller
    // hard-deletes it separately — matches the soft-delete convention used
    // elsewhere in the repo layer.
    await exec(
      `UPDATE utility_bills SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE utility_bills SET deleted_at = NULL WHERE id = ?', [id]);
  },
};
