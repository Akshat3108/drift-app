// Income analytics.
//
// Hosts the canonical savings-rate helper. Lifted from `Home.js` (5.6) so
// PS-22 (Financial Health Score) + future PS-43 (income source breakdown)
// can share one formula and one SQL path.
//
// `savingsRatePercent(income, spend)` is pure — the Home hero uses it
// against context-derived totals so the hero stays sync. `currentSavingsRate`
// is the async SQL-backed variant used by analytics that don't sit inside
// the Expenses context (e.g. PS-22's cached score recomputes outside React).

import { one } from '../db';

export function savingsRatePercent(income, spend) {
  if (!Number.isFinite(income) || income <= 0) return 0;
  const rate = ((income - spend) / income) * 100;
  return Math.max(0, Math.min(100, Math.round(rate)));
}

// Resolves a month_key from a Date or YYYY-MM string. Defaults to current month.
function monthKeyFrom(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function currentSavingsRate({ monthKey } = {}) {
  const mk = monthKeyFrom(monthKey);
  const incomeRow = await one(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM income
      WHERE month_key = ? AND deleted_at IS NULL`,
    [mk]
  );
  const spendRow = await one(
    `SELECT COALESCE(SUM(total), 0) AS total
       FROM monthly_summary
      WHERE month_key = ?`,
    [mk]
  );
  const totalIncome = Number(incomeRow?.total) || 0;
  const totalSpend  = Number(spendRow?.total)  || 0;
  return {
    month_key: mk,
    totalIncome,
    totalSpend,
    rate: savingsRatePercent(totalIncome, totalSpend),
    saved: totalIncome - totalSpend,
  };
}
