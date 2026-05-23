// 6.10 — seasonal pattern analytics.
//
// Three pure SQL aggregations against `expenses` (soft-delete-aware, the
// list-query convention from db/predicates.js). Each function exposes a
// cacheable async API matching the rest of the analytics surface.
//
//   seasonalCalendar({ months })      — 12-cell month-of-year heatmap
//   dayOfWeekPattern({ months })      — 7-cell Sun..Sat heatmap
//   dayOfMonthHistogram({ months })   — 31-bin day-of-month histogram
//
// Defaults:
//   seasonalCalendar  → 36 months (3 years; surfaces yearly seasonality)
//   dayOfWeek         → 12 months (recent year — habits change)
//   dayOfMonth        → 12 months
//
// Empty / not-enough-data → { ready: false, reason } shape.
// `seasonalCalendar` needs ≥ 12 months of history; the others render
// meaningfully on a few months so they just gate on "any data".

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';

const SEASONAL_TTL_SEC = 24 * 3600; // 24h — the surface is slow-moving
const MIN_MONTHS_SEASONAL_CALENDAR = 12;

// ─── seasonalCalendar ────────────────────────────────────────────────────
//
// For each calendar month (1..12) — average spend per occurrence of that
// month over the last N months of history, plus sample count.
//
// The aggregation rolls expenses → per-(year, month) totals, then averages
// across years. This is more meaningful than averaging raw daily expense
// rows (which would over-weight months with more rows).

export async function seasonalCalendar({ months = 36 } = {}) {
  const key = `seasonal_calendar_v1_m${months}`;
  return getCached(key, SEASONAL_TTL_SEC, () => computeSeasonalCalendar(months),
    { scope: SCOPES.SEASONAL });
}

async function computeSeasonalCalendar(months) {
  const distinctMonths = await one(
    `SELECT COUNT(DISTINCT month_key) AS n
       FROM expenses
      WHERE deleted_at IS NULL
        AND month_key >= strftime('%Y-%m', date('now', '-' || ? || ' month'))`,
    [months]
  );
  const monthsAvailable = distinctMonths?.n ?? 0;
  if (monthsAvailable < MIN_MONTHS_SEASONAL_CALENDAR) {
    return {
      ready: false,
      reason: 'not_enough_months',
      months_available: monthsAvailable,
      months_required: MIN_MONTHS_SEASONAL_CALENDAR,
    };
  }

  const rows = await all(
    `SELECT CAST(substr(month_key, 6, 2) AS INTEGER) AS month,
            month_key,
            SUM(amount)                              AS month_total
       FROM expenses
      WHERE deleted_at IS NULL
        AND month_key >= strftime('%Y-%m', date('now', '-' || ? || ' month'))
      GROUP BY month_key`,
    [months]
  );

  const byMonth = new Map();
  for (const r of rows) {
    const arr = byMonth.get(r.month) || [];
    arr.push(r.month_total);
    byMonth.set(r.month, arr);
  }

  const cells = [];
  let maxAvg = 0;
  for (let m = 1; m <= 12; m++) {
    const totals = byMonth.get(m) || [];
    const avg = totals.length > 0
      ? totals.reduce((s, v) => s + v, 0) / totals.length
      : null;
    if (avg != null && avg > maxAvg) maxAvg = avg;
    cells.push({
      month: m,
      avg_spend: avg,
      sample_count: totals.length,
    });
  }

  return {
    ready: true,
    months_window: months,
    months_available: monthsAvailable,
    max_avg: maxAvg,
    cells,
  };
}

// ─── dayOfWeekPattern ────────────────────────────────────────────────────
//
// SQLite's strftime('%w', date) returns 0..6 with 0=Sunday. Each cell:
// avg spend per occurrence of that weekday + txn count over the window.

export async function dayOfWeekPattern({ months = 12 } = {}) {
  const key = `dow_pattern_v1_m${months}`;
  return getCached(key, SEASONAL_TTL_SEC, () => computeDayOfWeek(months),
    { scope: SCOPES.SEASONAL });
}

async function computeDayOfWeek(months) {
  const rows = await all(
    `SELECT CAST(strftime('%w', expense_date) AS INTEGER) AS dow,
            COUNT(*)        AS txn_count,
            COUNT(DISTINCT expense_date) AS day_count,
            SUM(amount)     AS sum
       FROM expenses
      WHERE deleted_at IS NULL
        AND expense_date >= date('now', '-' || ? || ' month')
      GROUP BY dow
      ORDER BY dow`,
    [months]
  );

  if (rows.length === 0) {
    return { ready: false, reason: 'no_expenses', months_window: months };
  }

  // Materialise all 7 cells (Sun..Sat) so the UI can grid 7-wide without
  // sparse-array handling. day_count is the number of distinct calendar
  // dates that landed on that weekday inside the window — used to compute
  // a per-occurrence average (Sundays show 4-5 occurrences/month).
  const byDow = new Map(rows.map((r) => [r.dow, r]));
  const days = [];
  let maxAvg = 0;
  for (let d = 0; d < 7; d++) {
    const row = byDow.get(d);
    const sum       = row?.sum ?? 0;
    const txn_count = row?.txn_count ?? 0;
    const day_count = row?.day_count ?? 0;
    const avg_spend = day_count > 0 ? sum / day_count : 0;
    if (avg_spend > maxAvg) maxAvg = avg_spend;
    days.push({ dow: d, txn_count, avg_spend, sum, day_count });
  }

  return {
    ready: true,
    months_window: months,
    max_avg: maxAvg,
    days,
  };
}

// ─── dayOfMonthHistogram ─────────────────────────────────────────────────
//
// Histogram across calendar days 1..31. Useful for spotting "I overspend
// right after payday" patterns. avg_amount = average transaction size
// (not per-day average), since pay-day spikes show as bigger txns, not
// just more txns.

export async function dayOfMonthHistogram({ months = 12 } = {}) {
  const key = `dom_histogram_v1_m${months}`;
  return getCached(key, SEASONAL_TTL_SEC, () => computeDayOfMonth(months),
    { scope: SCOPES.SEASONAL });
}

async function computeDayOfMonth(months) {
  const rows = await all(
    `SELECT CAST(strftime('%d', expense_date) AS INTEGER) AS dom,
            COUNT(*)    AS txn_count,
            SUM(amount) AS sum,
            AVG(amount) AS avg_amount
       FROM expenses
      WHERE deleted_at IS NULL
        AND expense_date >= date('now', '-' || ? || ' month')
      GROUP BY dom
      ORDER BY dom`,
    [months]
  );

  if (rows.length === 0) {
    return { ready: false, reason: 'no_expenses', months_window: months };
  }

  const byDom = new Map(rows.map((r) => [r.dom, r]));
  const days = [];
  let maxTxnCount = 0;
  let maxSum = 0;
  for (let d = 1; d <= 31; d++) {
    const row = byDom.get(d);
    const txn_count  = row?.txn_count  ?? 0;
    const sum        = row?.sum        ?? 0;
    const avg_amount = row?.avg_amount ?? 0;
    if (txn_count > maxTxnCount) maxTxnCount = txn_count;
    if (sum > maxSum) maxSum = sum;
    days.push({ dom: d, txn_count, sum, avg_amount });
  }

  return {
    ready: true,
    months_window: months,
    max_txn_count: maxTxnCount,
    max_sum: maxSum,
    days,
  };
}
