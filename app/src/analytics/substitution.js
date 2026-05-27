// 5.A.07 — Cross-category substitution detection (Pearson correlation).
//
// Goal: surface category pairs whose monthly spend moves inversely ("when
// Dining rises, Groceries drops") — those are the substitution candidates a
// downstream UI can highlight. Co-moving pairs (positive r) are also returned
// because they're equally useful as a "lifestyle bundle" signal (Transport +
// Food & Drink rising together = more outings).
//
// Reads from monthly_summary (already soft-delete aware via v12 triggers) —
// same source as variance.js. Window default: 12 months — matches the 5.A.08
// elasticity gate so the two analytics functions present compatible histories.
//
// Algorithm:
//   1. Pull (month_key, category_id, total) rows for the last N months. JOIN
//      categories LEFT-side so soft-deleted categories collapse to the
//      "Uncategorised" sentinel exactly like variance.js does.
//   2. Build the N-month column list once (lex-sort works on YYYY-MM).
//   3. For each category, materialise its monthly series 0-padded for missing
//      months. Apply the activity floor: a category enters the pairwise stage
//      only if it has non-zero spend in ≥ MIN_PRESENT_MONTHS of the window.
//      This kills the all-zeros-with-one-spike pathological correlation case.
//   4. For each unordered category pair (i < j): compute Pearson r on the
//      full N-month 0-padded series. Pearson on two zero-variance series is
//      undefined — skipped.
//   5. Split into top_substitutions (r ≤ -SIGNAL_THRESHOLD, sorted r asc)
//      and top_co_movements (r ≥ +SIGNAL_THRESHOLD, sorted r desc). Both
//      capped at TOP_N entries so the UI consumer has a bounded payload.
//
// Cache: SCOPES.SPEND, TTL 24h. Same scope as variance/lifestyle so a single
// invalidate(['spend']) wipe clears all three after a bulk mutation.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';

const SUBSTITUTION_TTL_SEC = 24 * 3600;
const DEFAULT_MONTHS       = 12;
const MIN_PRESENT_MONTHS   = 6;   // category must spend in ≥ 6 of N months
const SIGNAL_THRESHOLD     = 0.5; // |r| cutoff for top lists
const TOP_N                = 10;  // per side (substitution / co-movement)

export async function categorySubstitution({ months = DEFAULT_MONTHS } = {}) {
  const key = `category_substitution_v1_m${months}`;
  return getCached(key, SUBSTITUTION_TTL_SEC, () => compute(months),
    { scope: SCOPES.SPEND });
}

async function compute(months) {
  const range = await one(
    `SELECT strftime('%Y-%m', date('now', '-' || ? || ' month')) AS start_month,
            strftime('%Y-%m', date('now'))                         AS end_month`,
    [months - 1]
  );
  const startMonth = range.start_month;
  const endMonth   = range.end_month;

  const rows = await all(
    `SELECT ms.month_key,
            ms.category_id,
            ms.total,
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
    return { ready: false, reason: 'no_data', months_window: months };
  }

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
    if (r.total > 0) {
      entry.monthly[r.month_key] = r.total;
      entry.present_count++;
    }
  }

  // Apply activity floor + materialise the full N-month series.
  const qualifying = [];
  for (const entry of byCat.values()) {
    if (entry.present_count < MIN_PRESENT_MONTHS) continue;
    const series = months_list.map((m) => entry.monthly[m] ?? 0);
    qualifying.push({
      id: entry.id,
      name: entry.name,
      emoji: entry.emoji,
      color: entry.color,
      present_months: entry.present_count,
      series,
    });
  }

  if (qualifying.length < 2) {
    return {
      ready: false,
      reason: 'not_enough_categories',
      months_window: months,
      months: months_list,
      qualifying: qualifying.length,
      min_present_months: MIN_PRESENT_MONTHS,
    };
  }

  // Pairwise Pearson r.
  const pairs = [];
  for (let i = 0; i < qualifying.length; i++) {
    for (let j = i + 1; j < qualifying.length; j++) {
      const a = qualifying[i];
      const b = qualifying[j];
      const r = pearson(a.series, b.series);
      if (r == null) continue; // zero-variance side
      pairs.push({
        a_id: a.id, a_name: a.name, a_emoji: a.emoji,
        b_id: b.id, b_name: b.name, b_emoji: b.emoji,
        r,
        n: months_list.length,
      });
    }
  }

  if (pairs.length === 0) {
    return {
      ready: false,
      reason: 'insufficient_overlap',
      months_window: months,
      months: months_list,
    };
  }

  const top_substitutions = pairs
    .filter((p) => p.r <= -SIGNAL_THRESHOLD)
    .sort((a, b) => a.r - b.r)
    .slice(0, TOP_N);
  const top_co_movements = pairs
    .filter((p) => p.r >= SIGNAL_THRESHOLD)
    .sort((a, b) => b.r - a.r)
    .slice(0, TOP_N);

  return {
    ready: true,
    months_window: months,
    months: months_list,
    signal_threshold: SIGNAL_THRESHOLD,
    min_present_months: MIN_PRESENT_MONTHS,
    categories: qualifying.map(({ id, name, emoji, color, present_months }) =>
      ({ id, name, emoji, color, present_months })),
    pairs,
    top_substitutions,
    top_co_movements,
  };
}

// Pearson r over equal-length numeric series. Returns null when either side
// has zero variance (denominator would be 0). Uses the standard two-pass
// (mean-then-deviation) form; numerical-stability fine at our scale.
function pearson(xs, ys) {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function buildMonthList(startMonth, endMonth) {
  const [sy, sm] = startMonth.split('-').map((n) => parseInt(n, 10));
  const [ey, em] = endMonth.split('-').map((n) => parseInt(n, 10));
  const list = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    list.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (list.length > 240) break; // 20-year safety cap
  }
  return list;
}
