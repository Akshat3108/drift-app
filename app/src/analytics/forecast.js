// 6.9 — cashflowForecast() foundation.
//
// End-of-month projection from an equal-weighted ensemble of three models.
// The other two members (recurring-aware + day-of-week pattern) are deferred
// to 5.A.01 in Phase 5 — they require pieces (7.11 recurring detection +
// seasonal day-of-week) that don't fit this batch's scope.
//
// Models (all in rupees-per-month):
//
//   1. linear-weighted: exponentially weighted least-squares on the days-
//      elapsed-this-month daily totals. We weight more recent days higher
//      so a sudden uptick late in the month doesn't get drowned by quiet
//      early days. Projects forward by extending the regression line over
//      the remaining days_in_month.
//
//   2. historical-month: average end-of-month spend for the SAME calendar
//      month (e.g. May) across prior years. Captures yearly seasonality
//      (Diwali in Oct/Nov, school fees in Jun, etc). Falls back to the
//      mean of the last 3 complete months if same-calendar history is thin.
//
//   3. rolling-90d: mean daily spend over the last 90 days × days_in_month.
//      A stable, slow-moving baseline. Falls back to lifetime mean if < 90
//      days of history exists.
//
// Ensemble = arithmetic mean of the three models. Confidence band:
//   max/min ratio ≤ 1.10 → 'high', ≤ 1.25 → 'medium', else 'low'.
//
// Empty / insufficient data ⇒ { ready: false, reason } shapes so the 6.16
// UI can render an empty-state without re-running the gating.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';

const FORECAST_TTL_SEC      = 6 * 3600;          // 6h
const MIN_DAYS_ELAPSED      = 3;                 // before linear model is meaningful
const MIN_HISTORY_DAYS      = 7;                 // floor on total spend history
const LINEAR_DECAY          = 0.95;              // exponential decay constant
const HIGH_CONFIDENCE_RATIO = 1.10;
const MED_CONFIDENCE_RATIO  = 1.25;

export async function cashflowForecast() {
  return getCached(
    'cashflow_forecast_v1',
    FORECAST_TTL_SEC,
    computeForecast,
    { scope: SCOPES.FORECAST }
  );
}

async function computeForecast() {
  // Anchor every comparison to SQLite's `date('now')` so the function reads
  // the same "today" the velocity/lifestyle queries do.
  const today = await one(`
    SELECT
      date('now')                                AS today_str,
      strftime('%Y-%m', date('now'))             AS asof_month_key,
      strftime('%d',    date('now'))             AS day_of_month_str,
      strftime('%d', date('now','start of month','+1 month','-1 day'))
                                                  AS days_in_month_str
  `);
  const asofMonth = today.asof_month_key;
  const daysElapsed = parseInt(today.day_of_month_str, 10);
  const daysInMonth = parseInt(today.days_in_month_str, 10);

  // Current-month spend so far. Live expenses only.
  const monthSoFar = await one(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
      WHERE deleted_at IS NULL
        AND month_key = ?`,
    [asofMonth]
  );
  const currentSpend = monthSoFar?.total ?? 0;

  // Total history days — distinct expense_date count across all live rows.
  const history = await one(`
    SELECT COUNT(DISTINCT expense_date) AS days
      FROM expenses
     WHERE deleted_at IS NULL
  `);
  const totalHistoryDays = history?.days ?? 0;

  if (currentSpend === 0 && totalHistoryDays === 0) {
    return readyFalse('no_expenses', asofMonth, daysElapsed, daysInMonth);
  }
  if (totalHistoryDays < MIN_HISTORY_DAYS) {
    return readyFalse('insufficient_history', asofMonth, daysElapsed, daysInMonth, {
      current_spend: currentSpend,
      history_days: totalHistoryDays,
    });
  }
  if (daysElapsed < MIN_DAYS_ELAPSED) {
    return readyFalse('insufficient_month', asofMonth, daysElapsed, daysInMonth, {
      current_spend: currentSpend,
      history_days: totalHistoryDays,
    });
  }

  const [linearModel, historicalModel, rollingModel] = await Promise.all([
    computeLinearWeighted(asofMonth, daysElapsed, daysInMonth, currentSpend),
    computeHistoricalMonth(asofMonth),
    computeRolling90d(daysInMonth, totalHistoryDays),
  ]);

  const models = { linear: linearModel, historical: historicalModel, rolling: rollingModel };
  const values = [linearModel, historicalModel, rollingModel]
    .filter((v) => Number.isFinite(v) && v >= 0);

  if (values.length === 0) {
    return readyFalse('models_unresolved', asofMonth, daysElapsed, daysInMonth);
  }

  const ensemble = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  let confidence;
  if (min > 0 && max / min <= HIGH_CONFIDENCE_RATIO)      confidence = 'high';
  else if (min > 0 && max / min <= MED_CONFIDENCE_RATIO)  confidence = 'medium';
  else                                                     confidence = 'low';

  return {
    ready: true,
    asof_month_key: asofMonth,
    days_elapsed:   daysElapsed,
    days_in_month:  daysInMonth,
    current_spend:  currentSpend,
    history_days:   totalHistoryDays,
    models,
    ensemble,
    range: { min, max },
    confidence,
  };
}

// ─── model 1 — linear-weighted ───────────────────────────────────────────
//
// Exponentially weighted linear regression on (day_of_month, daily_total)
// for days 1..daysElapsed. Project to end-of-month:
//   intercept + slope · daysInMonth.
// Falls back to (currentSpend / daysElapsed) × daysInMonth when too few
// distinct days have spend (the slope is unstable on 1 or 2 points).

async function computeLinearWeighted(monthKey, daysElapsed, daysInMonth, currentSpend) {
  const rows = await all(
    `SELECT CAST(strftime('%d', expense_date) AS INTEGER) AS dom,
            SUM(amount) AS total
       FROM expenses
      WHERE deleted_at IS NULL
        AND month_key = ?
      GROUP BY dom
      ORDER BY dom`,
    [monthKey]
  );

  if (rows.length === 0) return 0;
  if (rows.length < 3) {
    // Degenerate slope on ≤ 2 points — fall back to a flat extrapolation.
    return (currentSpend / Math.max(daysElapsed, 1)) * daysInMonth;
  }

  // Fill in zero days so the regression sees the actual rhythm (a quiet
  // day still informs the slope).
  const points = [];
  let cursor = 0;
  for (let d = 1; d <= daysElapsed; d++) {
    if (cursor < rows.length && rows[cursor].dom === d) {
      points.push({ x: d, y: rows[cursor].total });
      cursor++;
    } else {
      points.push({ x: d, y: 0 });
    }
  }

  // Weights decay exponentially with recency: w_i = α^(daysElapsed - x_i).
  const n = points.length;
  let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
  for (const p of points) {
    const w = Math.pow(LINEAR_DECAY, daysElapsed - p.x);
    sumW   += w;
    sumWX  += w * p.x;
    sumWY  += w * p.y;
    sumWXX += w * p.x * p.x;
    sumWXY += w * p.x * p.y;
  }
  const denom = sumW * sumWXX - sumWX * sumWX;
  if (denom === 0) return (currentSpend / Math.max(daysElapsed, 1)) * daysInMonth;

  const slope     = (sumW * sumWXY - sumWX * sumWY) / denom;
  const intercept = (sumWY - slope * sumWX) / sumW;

  // Integral of the line from 1..daysInMonth (the daily extrapolation)
  // approximated as area under the trapezoid.
  // We project end-of-month total via (avg projected daily) × daysInMonth
  // where avg-daily = intercept + slope · ((1 + daysInMonth) / 2).
  const avgDaily = intercept + slope * ((1 + daysInMonth) / 2);
  const projected = avgDaily * daysInMonth;

  // Clamp to >= currentSpend (we've already spent that, the model can't
  // project less than reality) and >= 0.
  return Math.max(projected, currentSpend, 0);
}

// ─── model 2 — historical-month ──────────────────────────────────────────
//
// Same-calendar-month end-of-month total averaged across prior years.
// Fallback chain (each tier triggers when the previous returns < 1 sample):
//   tier A: same calendar month (e.g. all prior Mays)
//   tier B: last 3 complete months
//   tier C: lifetime average month (sum / months_seen)
// All tiers operate on monthly_summary (rolled, indexed, soft-delete-aware).

async function computeHistoricalMonth(monthKey) {
  const calendarMonth = monthKey.slice(5, 7); // 'MM'

  // Tier A: average end-of-month total for matching MM across history,
  // excluding the current month so the model doesn't reference its own
  // truth.
  const tierA = await all(
    `SELECT month_key, SUM(total) AS total
       FROM monthly_summary
      WHERE substr(month_key, 6, 2) = ?
        AND month_key != ?
      GROUP BY month_key`,
    [calendarMonth, monthKey]
  );
  if (tierA.length >= 1) {
    return mean(tierA.map((r) => r.total));
  }

  // Tier B: last 3 complete months (anything before the current month).
  const tierB = await all(
    `SELECT month_key, SUM(total) AS total
       FROM monthly_summary
      WHERE month_key < ?
      GROUP BY month_key
      ORDER BY month_key DESC
      LIMIT 3`,
    [monthKey]
  );
  if (tierB.length >= 1) {
    return mean(tierB.map((r) => r.total));
  }

  // Tier C: lifetime average month (excluding current month).
  const tierC = await one(
    `SELECT SUM(total) AS sum, COUNT(DISTINCT month_key) AS months
       FROM monthly_summary
      WHERE month_key < ?`,
    [monthKey]
  );
  if (tierC && tierC.months > 0) {
    return tierC.sum / tierC.months;
  }
  return 0;
}

// ─── model 3 — rolling 90d ───────────────────────────────────────────────
//
// Mean daily spend over the last 90 live days × daysInMonth.
// Falls back to lifetime daily mean if < 90 days of history. The "× days
// in month" framing is deliberate: it answers "if the next month spends
// at the recent daily pace, how much is that?".

async function computeRolling90d(daysInMonth, totalHistoryDays) {
  const window = Math.min(90, Math.max(totalHistoryDays, 1));
  const row = await one(
    `SELECT COALESCE(SUM(amount), 0) AS sum,
            COUNT(DISTINCT expense_date) AS active_days
       FROM expenses
      WHERE deleted_at IS NULL
        AND expense_date >= date('now', '-' || ? || ' day')
        AND expense_date <= date('now')`,
    [window - 1]
  );
  // Divide by window (not active_days) so quiet days drag the average
  // down — matches the "if next month looked like the last 90d" framing.
  const sum = row?.sum ?? 0;
  if (sum === 0) return 0;
  return (sum / window) * daysInMonth;
}

// ─── helpers ─────────────────────────────────────────────────────────────

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function readyFalse(reason, asofMonth, daysElapsed, daysInMonth, extra = {}) {
  return {
    ready: false,
    reason,
    asof_month_key: asofMonth,
    days_elapsed:   daysElapsed,
    days_in_month:  daysInMonth,
    ...extra,
  };
}
