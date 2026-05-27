import { exec, all, one } from '../../db';

// PS-11 — Insurance policy repo.
//
// Renewal notifications: a checker in features/notifications evaluates each
// live policy's `next_due` and schedules at 09:00 local on
// (next_due - lead_days) when lead_days > 0. The provider re-schedules on
// every create/update and cancels on remove (identifier prefix
// `insurance:<id>`).
//
// `monthlyEquivalent(row)` is a pure helper exported so screens can sum
// "monthly insurance commitment" without inlining the cadence math.

export const INSURANCE_KINDS = ['life', 'term', 'health', 'vehicle', 'other'];

export const KIND_META = {
  life:    { label: 'Life / endowment', icon: '🛡️' },
  term:    { label: 'Term', icon: '📑' },
  health:  { label: 'Health', icon: '🏥' },
  vehicle: { label: 'Vehicle', icon: '🚗' },
  other:   { label: 'Other', icon: '📂' },
};

export const FREQUENCY_FACTORS = {
  monthly:     1,
  quarterly:   3,
  half_yearly: 6,
  yearly:      12,
};

export function monthlyEquivalent(row) {
  if (!row) return 0;
  const months = FREQUENCY_FACTORS[row.premium_frequency] || 12;
  const amt = Number(row.premium_amount) || 0;
  if (months <= 0) return 0;
  return amt / months;
}

// Helper used by the renewal checker. Returns days from `now` to next_due.
// Negative = overdue; null when no due date is set.
export function daysUntilDue(row, now = new Date()) {
  if (!row?.next_due) return null;
  const t = Date.parse(row.next_due);
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now.getTime()) / (24 * 60 * 60 * 1000));
}

export const insuranceRepo = {
  async list() {
    return all(
      `SELECT * FROM insurance_policies
        WHERE deleted_at IS NULL
        ORDER BY sort_order, id`
    );
  },

  async get(id) {
    return one('SELECT * FROM insurance_policies WHERE id = ?', [id]);
  },

  async create({
    kind, label, provider = null, premium_amount = 0,
    premium_frequency = 'yearly', next_due = null, sum_assured = null,
    maturity_date = null, account_id = null, policy_number = null,
    notes = null, icon = null, color = null, sort_order = null,
  }) {
    if (!INSURANCE_KINDS.includes(kind)) {
      throw new Error(`Invalid insurance kind: ${kind}`);
    }
    let nextOrder = sort_order;
    if (nextOrder == null) {
      const r = await one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM insurance_policies WHERE deleted_at IS NULL');
      nextOrder = r?.n ?? 0;
    }
    const meta = KIND_META[kind] || KIND_META.other;
    const res = await exec(
      `INSERT INTO insurance_policies
         (kind, label, provider, premium_amount, premium_frequency,
          next_due, sum_assured, maturity_date, account_id, policy_number,
          notes, icon, color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kind, label, provider, premium_amount, premium_frequency,
        next_due, sum_assured, maturity_date, account_id, policy_number,
        notes, icon || meta.icon, color || '#a3c7e9', nextOrder,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    if (!INSURANCE_KINDS.includes(next.kind)) {
      throw new Error(`Invalid insurance kind: ${next.kind}`);
    }
    await exec(
      `UPDATE insurance_policies SET
         kind = ?, label = ?, provider = ?, premium_amount = ?,
         premium_frequency = ?, next_due = ?, sum_assured = ?,
         maturity_date = ?, account_id = ?, policy_number = ?,
         notes = ?, icon = ?, color = ?, sort_order = ?
       WHERE id = ?`,
      [
        next.kind, next.label, next.provider, next.premium_amount,
        next.premium_frequency, next.next_due, next.sum_assured,
        next.maturity_date, next.account_id, next.policy_number,
        next.notes, next.icon, next.color, next.sort_order, id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE insurance_policies SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE insurance_policies SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // Linked expenses (paid premiums).
  async linkedExpenses(policyId) {
    if (policyId == null) return [];
    return all(
      `SELECT id, merchant, amount, expense_date, category_id, payment_method
         FROM expenses
        WHERE deleted_at IS NULL
          AND insurance_policy_id = ?
        ORDER BY expense_date DESC, id DESC`,
      [policyId]
    );
  },

  async linkedCount(policyId) {
    if (policyId == null) return 0;
    const row = await one(
      `SELECT COUNT(*) AS n FROM expenses
        WHERE deleted_at IS NULL AND insurance_policy_id = ?`,
      [policyId]
    );
    return row?.n || 0;
  },

  async linkedCountsAll() {
    const rows = await all(
      `SELECT insurance_policy_id AS policy_id, COUNT(*) AS n
         FROM expenses
        WHERE deleted_at IS NULL AND insurance_policy_id IS NOT NULL
        GROUP BY insurance_policy_id`
    );
    const map = {};
    for (const r of rows) map[r.policy_id] = r.n;
    return map;
  },

  // For PS-14 (FY tax export) — paid premiums per FY by kind.
  async premiumsByFY(fyStart, fyEnd) {
    if (!fyStart || !fyEnd) return [];
    return all(
      `SELECT p.id AS policy_id, p.kind, p.label, p.provider,
              COALESCE(SUM(e.amount), 0) AS paid
         FROM insurance_policies p
         LEFT JOIN expenses e
           ON e.insurance_policy_id = p.id
          AND e.deleted_at IS NULL
          AND e.expense_date >= ?
          AND e.expense_date <  ?
        WHERE p.deleted_at IS NULL
        GROUP BY p.id`,
      [fyStart, fyEnd]
    );
  },
};
