// 8.13 — Per-category anomaly detection (µ ± 2σ over 90-day rolling window).
//
// Goal: surface a small banner on the Detail screen when an expense is
// statistically unusual for its category. HIGH-side only (matches the user
// intuition "why did Groceries cost so much THIS time?"). LOW-side and refund
// flagging is deliberately out of scope.
//
// Algorithm:
//   1. For each category with >= MIN_SAMPLES expenses in the last 90 days,
//      compute n, mean, Bessel-corrected (n-1) stddev across raw `amount`
//      values. Index `idx_exp_cat_date` covers the GROUP BY.
//   2. Threshold = mean + 2σ. Persist {n, mean, stddev, threshold_high}
//      per category in a single JSON blob cached for 24h via SCOPES.ANOMALY.
//   3. `classifyExpenseAnomaly(amount, stats)` is the pure consumer: given
//      a single expense amount and its category stats, returns null when
//      below threshold, otherwise { z, mean, stddev, multiple, severity }
//      where severity = 'severe' when z >= 3, else 'mild'.
//
// SQL trick: variance via `SUM(x²) - n·x̄²` divided by (n-1). One pass; no
// correlated subqueries; one row per category. Stddev fixed at JS layer
// because SQLite's stdev() isn't built-in to expo-sqlite.
//
// MIN_SAMPLES = 8 — below that, sample stddev is too noisy to trust. The
// roadmap is silent on the floor; 8 matches the "small but usable" rule of
// thumb used elsewhere (variance.js uses series.length >= 2 only because it
// reads from the already-aggregated monthly_summary, which is a different
// regime). For raw per-expense data, n=2 or 3 would produce embarrassing
// false positives — a single ₹500 expense in an "n=2, mean=₹250, σ=₹100"
// bucket would z-score at 2.5 and flag, when it's actually one of three
// noisy data points.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';

const ANOMALY_TTL_SEC  = 24 * 3600;
const ANOMALY_WINDOW   = 90;
const MIN_SAMPLES      = 8;
const Z_FLAG_THRESHOLD = 2;    // µ + 2σ = the line above which we flag
const Z_SEVERE         = 3;    // z >= 3 ⇒ severity 'severe'

export async function categoryAnomalyStats({ days = ANOMALY_WINDOW } = {}) {
  const key = `anomaly_stats_v1_d${days}`;
  return getCached(key, ANOMALY_TTL_SEC, () => computeStats(days),
    { scope: SCOPES.ANOMALY });
}

async function computeStats(days) {
  const asof = await one(`SELECT date('now') AS today`);
  const rows = await all(
    `SELECT e.category_id,
            c.name  AS cat_name,
            c.emoji AS cat_emoji,
            COUNT(*)             AS n,
            AVG(e.amount)        AS mean,
            SUM(e.amount*e.amount) AS sum_sq
       FROM expenses e
       LEFT JOIN categories c
              ON c.id = e.category_id
             AND c.deleted_at IS NULL
      WHERE e.deleted_at IS NULL
        AND e.category_id IS NOT NULL
        AND date(e.expense_date) >= date('now', '-' || ? || ' days')
      GROUP BY e.category_id
     HAVING n >= ?`,
    [days, MIN_SAMPLES]
  );

  if (rows.length === 0) {
    return { ready: false, reason: 'no_eligible_categories',
             days_window: days, asof: asof?.today, byCategory: {} };
  }

  const byCategory = {};
  for (const r of rows) {
    // Bessel-corrected sample stddev: σ = sqrt( (Σx² - n·μ²) / (n-1) )
    // Numerical-stability note: at our scale (amounts in rupees, n ≤ ~thousands)
    // the two-pass-equivalent computed-moments form is fine; we never approach
    // float-cancellation territory.
    const n = r.n;
    const mean = r.mean;
    const variance = Math.max(0, (r.sum_sq - n * mean * mean) / (n - 1));
    const stddev = Math.sqrt(variance);
    byCategory[r.category_id] = {
      category_id:    r.category_id,
      name:           r.cat_name  || 'Uncategorised',
      emoji:          r.cat_emoji || '🗂',
      n,
      mean,
      stddev,
      threshold_high: mean + Z_FLAG_THRESHOLD * stddev,
    };
  }

  return {
    ready: true,
    days_window: days,
    asof: asof?.today,
    sample_floor: MIN_SAMPLES,
    byCategory,
  };
}

// Pure classifier. `amount` is the expense being inspected; `stats` is the
// entry for its category from byCategory (or null/undefined when the category
// didn't qualify). Returns null when not flagged so callers can short-circuit
// rendering with a single truthy check.
export function classifyExpenseAnomaly(amount, stats) {
  if (!stats || !Number.isFinite(amount) || amount <= 0) return null;
  if (!Number.isFinite(stats.stddev) || stats.stddev <= 0) return null;
  if (amount <= stats.threshold_high) return null;

  const z = (amount - stats.mean) / stats.stddev;
  const multiple = stats.mean > 0 ? amount / stats.mean : null;

  return {
    z,
    mean:     stats.mean,
    stddev:   stats.stddev,
    multiple,
    severity: z >= Z_SEVERE ? 'severe' : 'mild',
    n:        stats.n,
  };
}
