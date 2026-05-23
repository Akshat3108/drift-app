// 6.11 — categoryVarianceMatrix()
//
// Per-category × per-month spend matrix over the last N months, plus per-
// row mean / stddev / coefficient-of-variation / extremes. Feeds the 6.19
// variance heatmap and the 6.12 Hub's "which categories are most volatile?"
// question.
//
// Reads `monthly_summary` (already aggregated by category × month_key via
// v12 triggers — soft-delete aware). The "0" category sentinel is mapped to
// the "Uncategorised" label to match lifestyle.js's convention.
//
// Returns:
//   {
//     ready, months_window, months: ['YYYY-MM', ...],
//     categories: [
//       { id, name, emoji, color,
//         monthly: { 'YYYY-MM': total, ... },
//         total, mean, stddev, cv,
//         max_month, max_value, min_month, min_value }
//     ]
//   }
//
// cv (coefficient of variation = stddev / mean) is the variance heatmap's
// colour-intensity driver — it's dimensionless so a small category with
// 30% swings reads as "volatile" alongside a large category with 30% swings.
// stddev uses Bessel-corrected (n − 1) so the screen-reader value matches
// what a stats-savvy user expects from `stdev()` in a spreadsheet.
//
// Single-month rows: stddev = null, cv = null (can't compute variance from
// one sample). max_month and min_month point at the only month.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';

const VARIANCE_TTL_SEC = 24 * 3600;
const DEFAULT_MONTHS   = 6;

export async function categoryVarianceMatrix({ months = DEFAULT_MONTHS } = {}) {
  const key = `category_variance_v1_m${months}`;
  return getCached(key, VARIANCE_TTL_SEC, () => computeVariance(months),
    { scope: SCOPES.SPEND });
}

async function computeVariance(months) {
  // Resolve the month window in SQLite so DST/end-of-month math matches
  // the rest of the analytics layer.
  const range = await one(
    `SELECT strftime('%Y-%m', date('now', '-' || ? || ' month')) AS start_month,
            strftime('%Y-%m', date('now'))                         AS end_month`,
    [months - 1]
  );
  const startMonth = range.start_month;
  const endMonth   = range.end_month;

  // Pull every (month, category) row inside the window plus the joined
  // category meta. LEFT JOIN keeps the "Uncategorised" bucket (category_id
  // = 0 sentinel or referenced category soft-deleted) intact.
  const rows = await all(
    `SELECT ms.month_key,
            ms.category_id,
            ms.total,
            ms.txn_count,
            c.name   AS cat_name,
            c.emoji  AS cat_emoji,
            c.color  AS cat_color
       FROM monthly_summary ms
       LEFT JOIN categories c
              ON c.id = ms.category_id
             AND c.deleted_at IS NULL
      WHERE ms.month_key BETWEEN ? AND ?
      ORDER BY ms.category_id, ms.month_key`,
    [startMonth, endMonth]
  );

  if (rows.length === 0) {
    return {
      ready: false,
      reason: 'no_data',
      months_window: months,
    };
  }

  // Build the full ordered month list inside the window so the matrix has
  // a stable column ordering regardless of which months actually have data.
  const months_list = buildMonthList(startMonth, endMonth);

  // Bucket rows by category_id.
  const byCat = new Map();
  for (const r of rows) {
    let entry = byCat.get(r.category_id);
    if (!entry) {
      entry = {
        id: r.category_id,
        name:  r.cat_name  || 'Uncategorised',
        emoji: r.cat_emoji || '🗂',
        color: r.cat_color || 'cream',
        monthly: {},
        present_count: 0,
      };
      byCat.set(r.category_id, entry);
    }
    entry.monthly[r.month_key] = r.total;
    entry.present_count++;
  }

  const categories = [...byCat.values()].map((entry) => {
    // Materialise the row across the full month window. Missing months
    // count as 0 spend for the purposes of mean/stddev — that's the most
    // honest reading: a quiet month is still data.
    const series = months_list.map((m) => entry.monthly[m] ?? 0);

    const total = series.reduce((s, v) => s + v, 0);
    const mean  = total / series.length;

    let stddev = null;
    let cv     = null;
    if (series.length >= 2) {
      const sqDiff = series.reduce((s, v) => s + (v - mean) * (v - mean), 0);
      stddev = Math.sqrt(sqDiff / (series.length - 1));
      cv = mean > 0 ? stddev / mean : null;
    }

    let max_month = null, max_value = -Infinity;
    let min_month = null, min_value = Infinity;
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v > max_value) { max_value = v; max_month = months_list[i]; }
      if (v < min_value) { min_value = v; min_month = months_list[i]; }
    }
    if (!Number.isFinite(max_value)) max_value = 0;
    if (!Number.isFinite(min_value)) min_value = 0;

    return {
      id: entry.id,
      name: entry.name,
      emoji: entry.emoji,
      color: entry.color,
      monthly: entry.monthly,
      total,
      mean,
      stddev,
      cv,
      max_month,
      max_value,
      min_month,
      min_value,
    };
  });

  // Sort by total descending — the screen's heatmap reads top-down by
  // category importance.
  categories.sort((a, b) => b.total - a.total);

  return {
    ready: true,
    months_window: months,
    months: months_list,
    categories,
  };
}

// Build a list of YYYY-MM strings from startMonth..endMonth inclusive.
// Uses date arithmetic in JS — month_key strings are zero-padded so a
// lexicographic sort works, but generation needs real calendar math.
function buildMonthList(startMonth, endMonth) {
  const [sy, sm] = startMonth.split('-').map((n) => parseInt(n, 10));
  const [ey, em] = endMonth.split('-').map((n) => parseInt(n, 10));
  const list = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    list.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (list.length > 240) break; // safety: 20-year cap
  }
  return list;
}
