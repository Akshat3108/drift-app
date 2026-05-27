// 6.9 — cashflowForecast() — 5-model ensemble (5.A.01 completes the lineup).
// 5.A.02 — approxNormalCDF + probabilityOverBudget.
// 5.A.03 — cashflowLookahead3 (3-month multi-horizon projection).
//
// End-of-current-month projection from an equal-weighted ensemble of FIVE
// models. The two models added in 5.A.01 (`recurring` + `dow`) plug into
// the same {min, max, ensemble, confidence} shape as the foundation three —
// existing consumers of `models.linear/historical/rolling` keep working.
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
//   4. recurring-aware (5.A.01): currentSpend + Σ(expected − already-logged)
//      across `recurringCandidates()`. Only adds expected amounts for
//      candidates that (a) are not yet logged this month AND (b) have a
//      projected_date_this_month >= today. Falls back to the linear-
//      degenerate flat extrapolation when no recurring history exists, so
//      a brand-new user doesn't see this model drag the ensemble down to
//      `currentSpend`.
//
//   5. day-of-week pattern (5.A.01): currentSpend + Σ(remaining_dow_count[d]
//      × avg_spend_per_occurrence[d]) using `dayOfWeekPattern({months:12})`.
//      Counts how many Mondays/Tuesdays/… remain in the month, multiplies
//      by per-weekday average spend. Returns `null` (filtered out of the
//      ensemble) when `dayOfWeekPattern.ready === false`.
//
// Ensemble = arithmetic mean of finite, non-negative model values.
// Confidence band: max/min ratio ≤ 1.10 → 'high', ≤ 1.25 → 'medium', else
// 'low'.
//
// Empty / insufficient data ⇒ { ready: false, reason } shapes so the 6.16
// UI can render an empty-state without re-running the gating.
//
// 5.A.02 — approxNormalCDF: Abramowitz & Stegun 7.1.26 erf approximation
// (max error 1.5e-7). probabilityOverBudget(budget) sits on top: pulls the
// cached forecast, fits N(ensemble, sample_stddev(model_values)), returns
// 1 − Φ(budget). The 5-model spread is the σ proxy.
//
// 5.A.03 — cashflowLookahead3: 3-month forward projection. Per-month
// projected = baseline_MM × trend_factor × seasonal_factor, where
//   baseline_MM     = same-calendar-month historical mean (excl. current),
//   trend_factor    = 1 + (slope_per_month × months_ahead) / baseline_MM,
//                     clamped to [0.5, ∞] to prevent negative projections,
//   seasonal_factor = seasonalCalendar cell for target month / global avg.
// Per-month envelope {projected, min, max} via residual σ around the
// 6-month slope-fit line.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';
import { recurringCandidates } from './patterns';
import { dayOfWeekPattern, seasonalCalendar } from './seasonal';

const FORECAST_TTL_SEC      = 6 * 3600;          // 6h
const LOOKAHEAD_TTL_SEC     = 24 * 3600;         // 24h — multi-horizon is slow-moving
const MIN_DAYS_ELAPSED      = 3;                 // before linear model is meaningful
const MIN_HISTORY_DAYS      = 7;                 // floor on total spend history
const MIN_MONTHS_LOOKAHEAD  = 12;                // 5.A.03: matches seasonalCalendar gate
const LOOKAHEAD_SLOPE_WINDOW = 6;                // months for slope + residual σ
const LINEAR_DECAY          = 0.95;              // exponential decay constant
const TREND_FACTOR_FLOOR    = 0.5;               // never project below 50% of baseline
const HIGH_CONFIDENCE_RATIO = 1.10;
const MED_CONFIDENCE_RATIO  = 1.25;

export async function cashflowForecast() {
  // Cache key bumped to v2 — the cached JSON shape now includes
  // `models.recurring` and `models.dow`. Existing v1 rows are stale.
  return getCached(
    'cashflow_forecast_v2',
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

  const [linearModel, historicalModel, rollingModel, recurringModel, dowModel] = await Promise.all([
    computeLinearWeighted(asofMonth, daysElapsed, daysInMonth, currentSpend),
    computeHistoricalMonth(asofMonth),
    computeRolling90d(daysInMonth, totalHistoryDays),
    computeRecurringAware(asofMonth, today.today_str, daysElapsed, daysInMonth, currentSpend),
    computeDayOfWeekModel(asofMonth, today.today_str, daysInMonth, currentSpend),
  ]);

  const models = {
    linear:     linearModel,
    historical: historicalModel,
    rolling:    rollingModel,
    recurring:  recurringModel,
    dow:        dowModel,
  };
  const values = Object.values(models)
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

// ─── model 4 — recurring-aware (5.A.01) ──────────────────────────────────
//
// Sums the expected_amount of recurring candidates that have NOT yet fired
// this month AND whose projected_date_this_month is today-or-later. Adds
// the result to currentSpend.
//
// The asOf is reconstructed from SQLite's today_str so this model agrees
// with the rest of the function on what "now" means.
//
// Empty-recurring fallback: returns the same flat extrapolation the linear
// model uses on degenerate input — `(currentSpend / daysElapsed) × daysInMonth`.
// Without this, an account with no recurring history would force this model
// to return `currentSpend` (a strictly-too-low value) and drag the ensemble
// down by ~20%.

async function computeRecurringAware(monthKey, todayStr, daysElapsed, daysInMonth, currentSpend) {
  const asOf = parseISO(todayStr);
  if (!asOf) {
    return (currentSpend / Math.max(daysElapsed, 1)) * daysInMonth;
  }

  let result;
  try {
    result = await recurringCandidates({ asOf });
  } catch (_) {
    return (currentSpend / Math.max(daysElapsed, 1)) * daysInMonth;
  }
  const candidates = (result && result.ready) ? (result.candidates || []) : [];
  if (candidates.length === 0) {
    return (currentSpend / Math.max(daysElapsed, 1)) * daysInMonth;
  }

  let expectedRemaining = 0;
  for (const c of candidates) {
    if (c.logged_this_month_id != null) continue;
    const projected = c.projected_date_this_month;
    if (typeof projected === 'string' && projected < todayStr) continue;
    const amt = Number(c.expected_amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    expectedRemaining += amt;
  }

  return currentSpend + expectedRemaining;
}

// ─── model 5 — day-of-week pattern (5.A.01) ──────────────────────────────
//
// For each weekday remaining in the month (today+1 .. days_in_month),
// add that weekday's per-occurrence average spend. Returns null when
// dayOfWeekPattern is gated (no data) so the ensemble skips it.

async function computeDayOfWeekModel(monthKey, todayStr, daysInMonth, currentSpend) {
  let result;
  try {
    result = await dayOfWeekPattern({ months: 12 });
  } catch (_) {
    return null;
  }
  if (!result || !result.ready || !Array.isArray(result.days)) return null;

  // Build dow → avg_spend lookup (0=Sun).
  const avgByDow = new Map(result.days.map((d) => [d.dow, Number(d.avg_spend) || 0]));

  // Iterate remaining days in the month, day-of-week-aware. Use a UTC
  // calendar derived from the today_str — DST doesn't apply to IST + a
  // pure date-string + we only need day-of-week parity, which is timezone-
  // independent for ISO dates.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr || '');
  if (!m) return null;
  const year  = Number(m[1]);
  const month = Number(m[2]); // 1..12
  const today = Number(m[3]);

  let sum = 0;
  for (let d = today + 1; d <= daysInMonth; d++) {
    // Date.UTC + getUTCDay so the host TZ can't shift the weekday.
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = dt.getUTCDay();
    sum += avgByDow.get(dow) || 0;
  }

  return currentSpend + sum;
}

// ─── 5.A.02 — approxNormalCDF + probabilityOverBudget ────────────────────

// Abramowitz & Stegun 7.1.26 — erf approximation (max error ≈ 1.5e-7).
// Pure JS, no Math.erf in older RN engines.
function erfApprox(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t  = 1 / (1 + p * ax);
  const y  = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

// Φ(x; µ, σ). Degenerate σ → step function at µ (1 if x≥µ, else 0).
export function approxNormalCDF(x, mu, sigma) {
  if (!Number.isFinite(x) || !Number.isFinite(mu)) return NaN;
  if (!Number.isFinite(sigma) || sigma <= 0) return x >= mu ? 1 : 0;
  return 0.5 * (1 + erfApprox((x - mu) / (sigma * Math.SQRT2)));
}

// Bessel-corrected sample stddev (n-1). Matches what `=STDEV(range)` returns
// in Excel/Sheets — the same convention 6.11 variance uses.
function sampleStdDev(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  const n = finite.length;
  if (n < 2) return 0;
  const m = finite.reduce((s, v) => s + v, 0) / n;
  let ss = 0;
  for (const v of finite) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (n - 1));
}

// Probability that end-of-current-month spend exceeds the supplied budget.
// Treats the 5 model values as samples of an underlying spend distribution:
// µ = ensemble (already the mean), σ = sample stddev across the values.
//
// Returns `{ ready, asof_month_key, budget, ensemble, sigma, p_over,
// headroom }` on success or `{ ready: false, reason }` when the forecast
// or the budget is unusable.

export async function probabilityOverBudget(budget) {
  const fc = await cashflowForecast();
  if (!fc.ready) {
    return { ready: false, reason: fc.reason, asof_month_key: fc.asof_month_key };
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    return { ready: false, reason: 'invalid_budget', asof_month_key: fc.asof_month_key };
  }
  const vals = Object.values(fc.models).filter((v) => Number.isFinite(v) && v >= 0);
  if (vals.length === 0) {
    return { ready: false, reason: 'models_unresolved', asof_month_key: fc.asof_month_key };
  }
  const mu = fc.ensemble;
  const sigma = sampleStdDev(vals);
  const cdf = approxNormalCDF(budget, mu, sigma);
  const p_over = 1 - cdf;
  return {
    ready: true,
    asof_month_key: fc.asof_month_key,
    budget,
    ensemble: mu,
    sigma,
    p_over,                 // 0..1 probability we exceed `budget`
    headroom: mu - budget,  // negative = projected under; positive = over
  };
}

// ─── 5.A.03 — cashflowLookahead3 (3-month multi-horizon) ─────────────────
//
// Per-month projected = baseline_MM × trend_factor × seasonal_factor.
//
//   baseline_MM     = mean of monthly_summary totals for the matching
//                     calendar month across history (current month excluded).
//                     Tier-A/B/C fallback mirrors `computeHistoricalMonth`.
//   trend_factor    = 1 + (slope_per_month × months_ahead) / baseline_MM,
//                     clamped to [TREND_FACTOR_FLOOR, ∞]. slope_per_month
//                     comes from a least-squares fit to the last 6
//                     complete-month totals.
//   seasonal_factor = seasonalCalendar.cells[targetMM].avg_spend / globalAvg,
//                     1.0 when missing.
//
// Per-month envelope: {projected, min, max} where min/max = projected ± σ,
// σ = sample stddev of residuals around the 6-month slope-fit line.
//
// Gates on ≥ 12 distinct months of history (matches `seasonalCalendar`).

export async function cashflowLookahead3() {
  return getCached(
    'cashflow_lookahead3_v1',
    LOOKAHEAD_TTL_SEC,
    computeLookahead3,
    { scope: SCOPES.FORECAST }
  );
}

async function computeLookahead3() {
  const today = await one(`
    SELECT strftime('%Y-%m', date('now')) AS asof_month_key
  `);
  const asofMonth = today.asof_month_key;

  // Pull every monthly_summary row prior to the current month, oldest first.
  const monthRows = await all(
    `SELECT month_key, SUM(total) AS total
       FROM monthly_summary
      WHERE month_key < ?
      GROUP BY month_key
      ORDER BY month_key ASC`,
    [asofMonth]
  );
  if (monthRows.length < MIN_MONTHS_LOOKAHEAD) {
    return {
      ready: false,
      reason: 'not_enough_months',
      asof_month_key: asofMonth,
      months_available: monthRows.length,
      months_required:  MIN_MONTHS_LOOKAHEAD,
    };
  }

  // Slope window: last N complete months. Index 0..N-1 with x = month
  // position. Mean of the window doubles as the trend denominator.
  const window = monthRows.slice(-LOOKAHEAD_SLOPE_WINDOW);
  const xs = window.map((_, i) => i);
  const ys = window.map((r) => r.total);
  const { slope, intercept } = leastSquares(xs, ys);
  const windowMean = ys.reduce((s, v) => s + v, 0) / ys.length;

  // Residual σ on the slope-fit line.
  const residuals = window.map((r, i) => r.total - (intercept + slope * i));
  const sigma = sampleStdDev(residuals);

  // Same-calendar-month baseline + seasonal multiplier need full history.
  const seasonal = await seasonalCalendar({ months: 36 });
  const seasonalReady = seasonal && seasonal.ready;
  const globalAvg = seasonalReady
    ? mean(seasonal.cells.map((c) => c.avg_spend).filter((v) => Number.isFinite(v) && v > 0))
    : 0;

  // Build month_key → total lookup for tier-B/C fallback inside baseline.
  const allMonthsLifetime = monthRows; // already < asofMonth, oldest first
  const lifetimeMean = allMonthsLifetime.length
    ? allMonthsLifetime.reduce((s, r) => s + r.total, 0) / allMonthsLifetime.length
    : 0;
  const last3Mean = allMonthsLifetime.slice(-3).length
    ? allMonthsLifetime.slice(-3).reduce((s, r) => s + r.total, 0) / allMonthsLifetime.slice(-3).length
    : 0;

  const months = [];
  for (let ahead = 1; ahead <= 3; ahead++) {
    const targetMonthKey = shiftMonthKey(asofMonth, ahead);
    const targetMM = targetMonthKey.slice(5, 7);

    // Baseline tier A: same-MM mean across history (excl. current month).
    const sameMM = allMonthsLifetime
      .filter((r) => r.month_key.slice(5, 7) === targetMM)
      .map((r) => r.total);
    let baseline;
    if (sameMM.length >= 1) {
      baseline = mean(sameMM);
    } else if (last3Mean > 0) {
      baseline = last3Mean;
    } else {
      baseline = lifetimeMean;
    }

    // Trend factor: slope-per-month relative to window mean, scaled by
    // monthsAhead. Floors at TREND_FACTOR_FLOOR.
    const slopePerMonth = slope;
    const denom = Math.max(windowMean, 1);
    const trendFactor = Math.max(TREND_FACTOR_FLOOR, 1 + (slopePerMonth * ahead) / denom);

    // Seasonal factor: month cell avg / global avg.
    let seasonalFactor = 1.0;
    if (seasonalReady && globalAvg > 0) {
      const cell = seasonal.cells.find((c) => c.month === Number(targetMM));
      if (cell && Number.isFinite(cell.avg_spend) && cell.avg_spend > 0) {
        seasonalFactor = cell.avg_spend / globalAvg;
      }
    }

    const projected = Math.max(0, baseline * trendFactor * seasonalFactor);
    const min = Math.max(0, projected - sigma);
    const max = projected + sigma;

    months.push({
      month_key: targetMonthKey,
      months_ahead: ahead,
      baseline,
      trend_factor: trendFactor,
      seasonal_factor: seasonalFactor,
      projected,
      min,
      max,
    });
  }

  return {
    ready: true,
    asof_month_key: asofMonth,
    months_available: allMonthsLifetime.length,
    slope_per_month: slope,
    slope_pct_per_month: windowMean > 0 ? slope / windowMean : 0,
    window_mean: windowMean,
    sigma,
    seasonal_global_avg: globalAvg,
    seasonal_ready: !!seasonalReady,
    months,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function leastSquares(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  if (den === 0) return { slope: 0, intercept: meanY };
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX };
}

function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function shiftMonthKey(monthKey, delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]) + delta;
  while (mo > 12) { mo -= 12; y += 1; }
  while (mo < 1)  { mo += 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, '0')}`;
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
