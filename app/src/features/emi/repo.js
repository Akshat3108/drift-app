import { exec, all, one } from '../../db';

// 7.5 — EMI loans repo.
//
// Soft-delete via `deleted_at` (matches the project convention; restored by
// resetting to NULL). `listLive()` uses the partial index `idx_emi_loans_live`.
//
// Amortization schedule is NOT stored — it's derived on demand by
// `amortization.buildSchedule()`. So the repo only cares about the loan's
// terms; computed values (next due date, outstanding, EMI) come from
// `projectState()` at read time.

const ICONS = ['🏦', '🏠', '🚗', '🎓', '💳', '💼'];
const COLORS = ['#888', '#7d6555', '#e88373', '#6a8d73', '#b09c8a', '#a3c7e9'];

function pickIcon(idx) { return ICONS[(idx % ICONS.length + ICONS.length) % ICONS.length]; }
function pickColor(idx) { return COLORS[(idx % COLORS.length + COLORS.length) % COLORS.length]; }

export const emiRepo = {
  async listLive() {
    return all(
      `SELECT * FROM emi_loans
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`
    );
  },

  async get(id) {
    return one('SELECT * FROM emi_loans WHERE id = ?', [id]);
  },

  async create({
    name, lender = null, principal, annual_rate_pct, tenure_months,
    start_date, installments_paid = 0, emi_override = null,
    bill_day = 1, notes = null, icon = null, color = null,
    kind = null, tax_eligible = null,
  }) {
    const existing = await all('SELECT COUNT(*) AS n FROM emi_loans');
    const fallbackIdx = (existing?.[0]?.n ?? 0);
    const res = await exec(
      `INSERT INTO emi_loans
         (name, lender, principal, annual_rate_pct, tenure_months,
          start_date, installments_paid, emi_override, bill_day,
          notes, icon, color, kind, tax_eligible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, lender, principal, annual_rate_pct, tenure_months,
        start_date, installments_paid, emi_override, bill_day,
        notes,
        icon  || pickIcon(fallbackIdx),
        color || pickColor(fallbackIdx),
        kind,
        tax_eligible == null ? null : (tax_eligible ? 1 : 0),
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE emi_loans SET
         name = ?, lender = ?, principal = ?, annual_rate_pct = ?,
         tenure_months = ?, start_date = ?, installments_paid = ?,
         emi_override = ?, bill_day = ?, notes = ?, icon = ?, color = ?,
         kind = ?, tax_eligible = ?
       WHERE id = ?`,
      [
        next.name, next.lender, next.principal, next.annual_rate_pct,
        next.tenure_months, next.start_date, next.installments_paid,
        next.emi_override, next.bill_day, next.notes, next.icon, next.color,
        next.kind ?? null,
        next.tax_eligible == null ? null : (next.tax_eligible ? 1 : 0),
        id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE emi_loans SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE emi_loans SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // Per-loan linked expenses (the user-tagged payment rows). Live expenses
  // only (NOT_DELETED applied via deleted_at IS NULL).
  async linkedExpenses(loanId) {
    if (loanId == null) return [];
    return all(
      `SELECT id, merchant, amount, expense_date, category_id, payment_method
         FROM expenses
        WHERE deleted_at IS NULL
          AND emi_loan_id = ?
        ORDER BY expense_date DESC, id DESC`,
      [loanId]
    );
  },

  // Cheap COUNT for the EMI list "X of N paid" progress sub-line. Live only.
  async linkedCount(loanId) {
    if (loanId == null) return 0;
    const row = await one(
      `SELECT COUNT(*) AS n FROM expenses
        WHERE deleted_at IS NULL AND emi_loan_id = ?`,
      [loanId]
    );
    return row?.n || 0;
  },

  // Bulk variant for the list screen — single query returns counts per loan.
  async linkedCountsAll() {
    const rows = await all(
      `SELECT emi_loan_id AS loan_id, COUNT(*) AS n
         FROM expenses
        WHERE deleted_at IS NULL AND emi_loan_id IS NOT NULL
        GROUP BY emi_loan_id`
    );
    const map = {};
    for (const r of rows) map[r.loan_id] = r.n;
    return map;
  },
};
