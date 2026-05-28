// PS-22 — Financial Health Score (composite 0–100).
//
// Equal-weight blend of six on-device signals. Each component independently
// returns a 0–100 sub-score (or null when its inputs are missing); the final
// score is the mean of non-null components, so a fresh install with no
// subscriptions or no EMI doesn't drag the score to 0.
//
// Components and their mapping rationale:
//   1. budget_adherence   — Σ min(total, budget) / Σ budget for live budgets.
//   2. savings_rate       — 20%+ rate maps to 100 (industry rule of thumb).
//   3. sub_leakage        — 25%+ of monthly outflow on subs maps to 0.
//   4. emergency_fund     — coverage_months = reserve / 3-mo avg burn; 3 mo = 100.
//   5. debt_service       — DSR = monthly EMI / monthly income; 40% = 0.
//   6. nw_trajectory      — slope of recent net-worth snapshots (≥ 2 rows).
//
// Empty-state: if the earliest live expense is < 30 days ago, return null and
// let the UI suppress the surface.
//
// All SQL runs against the existing rollups (`monthly_summary`,
// `account_snapshots`) and live tables — no schema change. Cached for 12 h
// via `analytics_cache` under scope `'health'`.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';
import { currentSavingsRate } from './income';
import { subscriptionLeakage } from './subscriptions';

const TWELVE_HOURS_SEC = 12 * 3600;
const EMERGENCY_CATEGORY_RX = /(cash|saving|emergency|liquid|fd|sweep)/i;

function monthKeyFrom(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function pct(n) { return clamp(Math.round(n), 0, 100); }

async function dataAgeDays() {
  const row = await one(
    `SELECT MIN(expense_date) AS earliest FROM expenses WHERE deleted_at IS NULL`
  );
  if (!row?.earliest) return 0;
  const ms = Date.now() - Date.parse(row.earliest + 'T00:00:00');
  return Math.max(0, Math.floor(ms / 86400000));
}

async function budgetAdherence(monthKey) {
  const rows = await all(
    `SELECT c.id, c.budget,
            COALESCE((SELECT total FROM monthly_summary
                       WHERE month_key = ? AND category_id = c.id), 0) AS spend
       FROM categories c
      WHERE c.budget > 0`,
    [monthKey]
  );
  if (rows.length === 0) return null;
  let budgetSum = 0, withinSum = 0, overCount = 0;
  for (const r of rows) {
    const b = Number(r.budget) || 0;
    const s = Number(r.spend) || 0;
    budgetSum += b;
    withinSum += Math.min(s, b);
    if (s > b) overCount += 1;
  }
  if (budgetSum <= 0) return null;
  const score = pct((withinSum / budgetSum) * 100);
  return {
    name: 'budget_adherence',
    label: 'Budget adherence',
    value: score,
    raw: { budgetSum, withinSum, overCount, potCount: rows.length },
    rationale: `${overCount} of ${rows.length} pots over budget this month`,
    direction: 'higher_better',
    drill: 'BudgetSetup',
  };
}

async function savingsRateComponent(monthKey) {
  const sr = await currentSavingsRate({ monthKey });
  if (sr.totalIncome <= 0) return null;
  // 20% rate maps to 100; linear below that.
  const score = pct(sr.rate * 5);
  return {
    name: 'savings_rate',
    label: 'Savings rate',
    value: score,
    raw: sr,
    rationale: `${sr.rate}% of ${sr.totalIncome.toLocaleString()} income saved`,
    direction: 'higher_better',
    drill: 'Trends',
  };
}

async function subLeakageComponent() {
  const leak = await subscriptionLeakage();
  if (leak.monthly_spend_total <= 0 || leak.leakage_ratio == null) return null;
  // 25%+ leakage maps to 0; 0% maps to 100.
  const score = pct((1 - leak.leakage_ratio * 4) * 100);
  return {
    name: 'sub_leakage',
    label: 'Subscription load',
    value: score,
    raw: leak,
    rationale: `${(leak.leakage_ratio * 100).toFixed(1)}% of outflow on ${leak.subs_count} subs`,
    direction: 'lower_better',
    drill: 'Subs',
  };
}

async function emergencyFundComponent(monthKey) {
  // Sum live assets matching the emergency-reserve heuristic.
  const reserveRows = await all(
    `SELECT balance, category FROM accounts
      WHERE kind = 'asset'`
  );
  const reserve = reserveRows
    .filter((r) => EMERGENCY_CATEGORY_RX.test(String(r.category || '')))
    .reduce((sum, r) => sum + (Number(r.balance) || 0), 0);

  // 3-month average outflow from the last 3 closed months (excluding monthKey).
  const burnRows = await all(
    `SELECT month_key, SUM(total) AS total
       FROM monthly_summary
      WHERE month_key < ?
      GROUP BY month_key
      ORDER BY month_key DESC
      LIMIT 3`,
    [monthKey]
  );
  if (burnRows.length === 0) return null;
  const avgBurn = burnRows.reduce((s, r) => s + (Number(r.total) || 0), 0) / burnRows.length;
  if (avgBurn <= 0) return null;

  const months = reserve / avgBurn;
  // 3 months = 100; cap there.
  const score = pct((months / 3) * 100);
  return {
    name: 'emergency_fund',
    label: 'Emergency fund',
    value: score,
    raw: { reserve, avgBurn, months, samples: burnRows.length },
    rationale: reserve > 0
      ? `${months.toFixed(1)} mo cover · ${burnRows.length}-mo burn ₹${Math.round(avgBurn).toLocaleString()}`
      : 'No accounts tagged cash/savings yet',
    direction: 'higher_better',
    drill: 'NetWorth',
  };
}

async function debtServiceComponent(monthKey) {
  const emiRow = await one(
    `SELECT COALESCE(SUM(
              CASE WHEN emi_override IS NOT NULL AND emi_override > 0
                   THEN emi_override
                   ELSE 0 END), 0) AS total_override,
            COUNT(*) AS n
       FROM emi_loans
      WHERE deleted_at IS NULL`
  );
  if (!emiRow || emiRow.n === 0) {
    // No EMIs → perfect debt-service score.
    return {
      name: 'debt_service',
      label: 'Debt service',
      value: 100,
      raw: { totalEmi: 0, monthlyIncome: 0, dsr: 0, count: 0 },
      rationale: 'No active EMIs',
      direction: 'lower_better',
      drill: 'EMI',
    };
  }
  const incomeRow = await one(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM income
      WHERE month_key = ? AND deleted_at IS NULL`,
    [monthKey]
  );
  const monthlyIncome = Number(incomeRow?.total) || 0;
  if (monthlyIncome <= 0) return null;
  const totalEmi = Number(emiRow.total_override) || 0;
  const dsr = totalEmi / monthlyIncome;
  // 40% DSR maps to 0; 0% maps to 100.
  const score = pct((1 - dsr * 2.5) * 100);
  return {
    name: 'debt_service',
    label: 'Debt service',
    value: score,
    raw: { totalEmi, monthlyIncome, dsr, count: emiRow.n },
    rationale: `${(dsr * 100).toFixed(1)}% of income to ${emiRow.n} EMI${emiRow.n === 1 ? '' : 's'}`,
    direction: 'lower_better',
    drill: 'EMI',
  };
}

async function nwTrajectoryComponent() {
  // Slope of net worth over the last 30 snapshots. Need ≥ 2 to compute.
  const rows = await all(
    `SELECT snapshot_date, net FROM account_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 30`
  );
  if (rows.length < 2) return null;
  // Reverse to chronological for slope math.
  const series = rows.slice().reverse();
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map((r) => Number(r.net) || 0);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const ref = Math.max(Math.abs(meanY), 1);
  // Slope normalised by |meanY|. +1% per step → +25 swing; cap at ±50 around 50.
  const swing = clamp((slope / ref) * 2500, -50, 50);
  const score = pct(50 + swing);
  return {
    name: 'nw_trajectory',
    label: 'Net-worth trend',
    value: score,
    raw: { slope, meanY, samples: n, latest: ys[n - 1], earliest: ys[0] },
    rationale: slope >= 0
      ? `Trending up over ${n} snapshots`
      : `Trending down over ${n} snapshots`,
    direction: 'higher_better',
    drill: 'NetWorth',
  };
}

async function computeScore(monthKey) {
  const ageDays = await dataAgeDays();
  if (ageDays < 30) {
    return { score: null, components: [], data_age_days: ageDays, month_key: monthKey };
  }
  const components = (await Promise.all([
    budgetAdherence(monthKey),
    savingsRateComponent(monthKey),
    subLeakageComponent(),
    emergencyFundComponent(monthKey),
    debtServiceComponent(monthKey),
    nwTrajectoryComponent(),
  ])).filter(Boolean);
  if (components.length === 0) {
    return { score: null, components: [], data_age_days: ageDays, month_key: monthKey };
  }
  const weight = 1 / components.length;
  for (const c of components) c.weight = weight;
  const score = Math.round(
    components.reduce((s, c) => s + c.value, 0) / components.length
  );
  return { score, components, data_age_days: ageDays, month_key: monthKey };
}

export async function financialHealthScore({ monthKey, force = false } = {}) {
  const mk = monthKeyFrom(monthKey);
  if (force) return computeScore(mk);
  return getCached(
    `health:${mk}`,
    TWELVE_HOURS_SEC,
    () => computeScore(mk),
    { scope: SCOPES.HEALTH }
  );
}

// Exposed for /tmp/ validation harnesses.
export const __testables = {
  savingsRateComponent,
  budgetAdherence,
  subLeakageComponent,
  emergencyFundComponent,
  debtServiceComponent,
  nwTrajectoryComponent,
  computeScore,
};
