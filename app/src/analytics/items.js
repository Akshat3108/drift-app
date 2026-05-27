// Item-level analytics — 6.4, 6.5, 6.6.
//
// All three functions read directly from `receipt_items` (filtered through
// `deleted_at IS NULL`) so they reflect the full purchase history rather
// than item_summary's last-seen snapshot. The `idx_items_name_date` index
// (normalized_name, purchase_date) covers the access pattern for 6.4 + 6.6.
// 6.5 joins to `expenses` for the merchant string and uses the implicit
// expense_id index.
//
// Minimum-data gating per function (see inline). Returns `{ ready: false,
// reason }` shapes when data is insufficient so 6.12 UI can render an
// empty-state without recomputing the gating logic.

import { all, one } from '../db';
import { getCached, SCOPES } from './cache';

// ─── 6.5 — cheapestMerchantPerItem ───────────────────────────────────────
//
// GROUP BY (normalized_name, merchant) with avg + min unit_price + sample
// count + last_seen. Requires sample_count >= 2 per merchant (single-sample
// is noise — one bad OCR line could declare a merchant 'cheapest'). Returns
// a map keyed by normalized_name; each value is the top-3 cheapest merchants
// for that item, sorted by avg unit_price ascending.
//
// `limit_items` lets the caller bound result size (Hub default = 50).

export async function cheapestMerchantPerItem({ limitItems = 50, topN = 3, normalizedName = null } = {}) {
  // 6.14 — optional normalizedName scopes the result to a single item.
  // ItemTrend's "Cheapest" tab passes the current item's name to keep the
  // query bounded; the Hub passes nothing and gets the full top-N list.
  // Done as an additive optional param to preserve all existing callers.
  const params = [];
  let nameFilter = '';
  if (normalizedName && typeof normalizedName === 'string') {
    nameFilter = ' AND r.normalized_name = ?';
    params.push(normalizedName);
  }
  const rows = await all(`
    SELECT
      r.normalized_name,
      e.merchant,
      COUNT(*)              AS samples,
      AVG(r.unit_price)     AS avg_unit_price,
      MIN(r.unit_price)     AS min_unit_price,
      MAX(r.purchase_date)  AS last_seen
    FROM receipt_items r
    JOIN expenses e ON e.id = r.expense_id
                   AND e.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.unit_price > 0
      ${nameFilter}
    GROUP BY r.normalized_name, e.merchant
    HAVING samples >= 2
    ORDER BY r.normalized_name, avg_unit_price ASC
  `, params);

  // Bucket into per-item arrays. Rows are already ordered by name then
  // price ASC, so we just take the first `topN` per name.
  const byItem = new Map();
  for (const r of rows) {
    const arr = byItem.get(r.normalized_name) || [];
    if (arr.length < topN) {
      arr.push({
        merchant: r.merchant,
        samples: r.samples,
        avg_unit_price: r.avg_unit_price,
        min_unit_price: r.min_unit_price,
        last_seen: r.last_seen,
      });
      byItem.set(r.normalized_name, arr);
    }
  }

  // Rank items by total observed samples — most-purchased items first.
  const items = [...byItem.entries()]
    .map(([normalized_name, merchants]) => ({
      normalized_name,
      merchants,
      total_samples: merchants.reduce((s, m) => s + m.samples, 0),
    }))
    .sort((a, b) => b.total_samples - a.total_samples)
    .slice(0, limitItems);

  return { ready: items.length > 0, items };
}

// ─── 6.6 — reorderQueue ──────────────────────────────────────────────────
//
// For each item with >= 3 distinct purchase dates: compute avg interval
// between consecutive purchase dates, then `due_in_days = last_seen +
// avg_interval - today`. Sorted by due_in_days ascending. Status buckets:
// overdue (<0), imminent (≤3), upcoming.
//
// Date math is JS-side (parsed via Date) — SQLite's date() supports the
// arithmetic but JS keeps the code shorter and there's no perf concern at
// this scale (item count is bounded by item_summary.points_count gating).

export async function reorderQueue({ minOccurrences = 3, limit = 40 } = {}) {
  // First pass: which normalized_names qualify? item_summary.points_count
  // already counts live rows (v12 triggers maintain it).
  const eligible = await all(`
    SELECT normalized_name, display_name, points_count, last_seen
      FROM item_summary
     WHERE points_count >= ?
  `, [minOccurrences]);

  if (eligible.length === 0) return { ready: false, reason: 'no_repeat_items', items: [] };

  // Second pass: pull every live purchase_date for those items in one query.
  const names = eligible.map((e) => e.normalized_name);
  const placeholders = names.map(() => '?').join(',');
  const purchases = await all(
    `SELECT normalized_name, purchase_date
       FROM receipt_items
      WHERE deleted_at IS NULL
        AND normalized_name IN (${placeholders})
      ORDER BY normalized_name, purchase_date`,
    names
  );

  // Bucket purchase dates per item.
  const datesByName = new Map();
  for (const p of purchases) {
    const arr = datesByName.get(p.normalized_name) || [];
    arr.push(p.purchase_date);
    datesByName.set(p.normalized_name, arr);
  }

  const todayMs = startOfDayMs(new Date());
  const items = [];
  for (const meta of eligible) {
    const dates = datesByName.get(meta.normalized_name);
    if (!dates || dates.length < minOccurrences) continue;

    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const dPrev = parseISODate(dates[i - 1]);
      const dCur  = parseISODate(dates[i]);
      if (dPrev == null || dCur == null) continue;
      const days = Math.round((dCur - dPrev) / 86400000);
      if (days > 0) intervals.push(days);
    }
    if (intervals.length === 0) continue;

    const avg_interval_days = Math.round(
      intervals.reduce((s, n) => s + n, 0) / intervals.length
    );
    const lastMs = parseISODate(meta.last_seen);
    if (lastMs == null) continue;

    const dueMs = lastMs + avg_interval_days * 86400000;
    const due_in_days = Math.round((dueMs - todayMs) / 86400000);

    let status;
    if (due_in_days < 0)      status = 'overdue';
    else if (due_in_days <= 3) status = 'imminent';
    else                       status = 'upcoming';

    items.push({
      normalized_name: meta.normalized_name,
      display_name:    meta.display_name,
      points_count:    meta.points_count,
      last_seen:       meta.last_seen,
      avg_interval_days,
      due_in_days,
      status,
    });
  }

  items.sort((a, b) => a.due_in_days - b.due_in_days);
  return { ready: true, items: items.slice(0, limit) };
}

// ─── 6.4 — inflationBasket ───────────────────────────────────────────────
//
// Personal inflation index. Algorithm:
//   1. Per-month avg unit price per item (`receipt_items` with unit_price > 0).
//   2. Top-N items by total occurrences (default 20) form the basket.
//   3. Each item's weight = min(0.10, frequency_share); weights renormalised
//      to sum to 1 across the basket. The 10% cap prevents one heavily
//      purchased item (e.g. milk) from dominating the index.
//   4. Base month = first month containing >= 5 of the top-N basket items.
//      If no such month exists, return ready:false.
//   5. For each month from base onward: index = Σ(w_i · p_i,m / p_i,base)
//      over items present in BOTH that month and base, divided by Σ(w_i)
//      to normalise for partial-presence months. Base month index = 1.
//
// Cap = 0.10 per item and N = 20 are roadmap-stipulated (Phase 3 risk
// "personal inflation index is dominated by 1–2 items"). minBasketSize = 5
// is the qualifier for a usable base month.

const INFLATION_TOP_N             = 20;
const INFLATION_ITEM_WEIGHT_CAP   = 0.10;
const INFLATION_MIN_BASKET_PRESENT = 5;

export async function inflationBasket({
  topN = INFLATION_TOP_N,
  itemWeightCap = INFLATION_ITEM_WEIGHT_CAP,
  minBasketPresent = INFLATION_MIN_BASKET_PRESENT,
} = {}) {
  // Per-item per-month avg price. Pulled in one query — index covers it.
  const rows = await all(`
    SELECT
      normalized_name,
      substr(purchase_date, 1, 7) AS month_key,
      AVG(unit_price) AS avg_price,
      COUNT(*)        AS samples
    FROM receipt_items
    WHERE deleted_at IS NULL
      AND unit_price > 0
    GROUP BY normalized_name, month_key
    ORDER BY normalized_name, month_key
  `);
  if (rows.length === 0) return { ready: false, reason: 'no_priced_items' };

  // Rank items by total occurrences across history.
  const itemTotals = new Map();
  for (const r of rows) {
    itemTotals.set(r.normalized_name, (itemTotals.get(r.normalized_name) || 0) + r.samples);
  }
  const basket = [...itemTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  if (basket.length === 0) return { ready: false, reason: 'no_basket' };

  // Frequency-based weights, capped at itemWeightCap then renormalised.
  const totalBasketOccurrences = basket.reduce((s, [, n]) => s + n, 0);
  const rawWeights = basket.map(([name, n]) =>
    [name, Math.min(itemWeightCap, n / totalBasketOccurrences)]);
  const weightSum = rawWeights.reduce((s, [, w]) => s + w, 0);
  const weights = new Map(rawWeights.map(([name, w]) => [name, w / weightSum]));
  const basketNames = new Set(weights.keys());

  // Per-item per-month price table (filtered to basket).
  const priceByItemMonth = new Map(); // name -> Map(month_key -> avg_price)
  const monthsSet = new Set();
  for (const r of rows) {
    if (!basketNames.has(r.normalized_name)) continue;
    monthsSet.add(r.month_key);
    let m = priceByItemMonth.get(r.normalized_name);
    if (!m) { m = new Map(); priceByItemMonth.set(r.normalized_name, m); }
    m.set(r.month_key, r.avg_price);
  }

  const months = [...monthsSet].sort();

  // Find base month: first with >= minBasketPresent basket items present.
  let baseMonth = null;
  for (const m of months) {
    let present = 0;
    for (const [, mMap] of priceByItemMonth) {
      if (mMap.has(m)) present++;
    }
    if (present >= minBasketPresent) { baseMonth = m; break; }
  }
  if (!baseMonth) {
    return { ready: false, reason: 'no_base_month',
             months_seen: months.length, basket_size: basket.length };
  }

  // Items present in baseMonth (with their base price). Items missing from
  // base month are excluded — they cannot contribute a ratio.
  const baseItems = [];
  for (const [name, mMap] of priceByItemMonth) {
    const p = mMap.get(baseMonth);
    if (p != null && p > 0) baseItems.push({ name, base_price: p });
  }
  if (baseItems.length < minBasketPresent) {
    return { ready: false, reason: 'base_month_thin' };
  }

  // Compute monthly indices (only months >= baseMonth).
  const monthly = [];
  for (const m of months) {
    if (m < baseMonth) continue;
    let weightedSum = 0;
    let weightUsed  = 0;
    const contributing = [];
    for (const { name, base_price } of baseItems) {
      const p = priceByItemMonth.get(name)?.get(m);
      if (p == null || p <= 0) continue;
      const w = weights.get(name);
      const ratio = p / base_price;
      weightedSum += w * ratio;
      weightUsed  += w;
      contributing.push(name);
    }
    if (weightUsed === 0) continue;
    monthly.push({
      month_key: m,
      index: weightedSum / weightUsed, // normalised: missing items don't drag toward 0
      contributing_items: contributing.length,
    });
  }

  return {
    ready: true,
    base_month: baseMonth,
    items: baseItems.map(({ name, base_price }) => ({
      normalized_name: name,
      weight: weights.get(name),
      base_price,
    })),
    monthly,
  };
}

// ─── 8.14 — pricePrediction ──────────────────────────────────────────────
//
// Per-item linear regression on (days_since_first_purchase, unit_price).
// Goal: surface a single "next price" projection on ItemTrend for items
// with enough history to make the slope meaningful.
//
// Gate: `months_observed >= MIN_MONTHS` where months_observed = distinct
// substr(purchase_date,1,7) count. 12 months floor matches the roadmap.
// Choosing distinct months (not row count) is robust against a "12 buys in
// one big shop" outlier — slope on a single-day cluster would be undefined
// or wildly noisy.
//
// Method: simple OLS — slope = Σ((x-x̄)(y-ȳ)) / Σ((x-x̄)²), intercept =
// ȳ - slope·x̄. Residual sample stddev (n-2 d.f.) becomes the ±band shown
// next to the prediction. n-2 because two parameters (slope + intercept)
// were estimated from the same data.
//
// `predicted_next_date = last_seen + avg_interval_days` (same convention
// as reorderQueue's "due" math) → predicted_next_price = intercept + slope·x.
// Avg interval falls back to MIN_INTERVAL_DAYS when only one purchase exists
// (degenerate, but the months_observed gate makes this unreachable in
// practice — defensive only).
//
// Caching: SCOPES.ITEMS at 24h. Key includes normalized_name so each item
// gets its own cell. The blob is tiny (~12 numbers); no LRU concern.

const PREDICTION_TTL_SEC  = 24 * 3600;
const MIN_MONTHS_PRED     = 12;
const MIN_INTERVAL_DAYS   = 7;   // fallback when only one purchase exists

export async function pricePrediction(normalizedName, { minMonths = MIN_MONTHS_PRED } = {}) {
  if (!normalizedName || typeof normalizedName !== 'string') {
    return { ready: false, reason: 'no_name' };
  }
  const key = `price_pred_v1_${normalizedName}_m${minMonths}`;
  return getCached(key, PREDICTION_TTL_SEC,
    () => computePricePrediction(normalizedName, minMonths),
    { scope: SCOPES.ITEMS });
}

async function computePricePrediction(normalizedName, minMonths) {
  const rows = await all(
    `SELECT unit_price, purchase_date
       FROM receipt_items
      WHERE normalized_name = ?
        AND deleted_at IS NULL
        AND unit_price > 0
      ORDER BY purchase_date ASC, id ASC`,
    [normalizedName]
  );
  if (rows.length < 2) {
    return { ready: false, reason: 'insufficient_points', points: rows.length };
  }

  const monthsSet = new Set();
  for (const r of rows) monthsSet.add(r.purchase_date.slice(0, 7));
  const months_observed = monthsSet.size;
  if (months_observed < minMonths) {
    return { ready: false, reason: 'insufficient_months',
             months_observed, min_months: minMonths };
  }

  // Build (x = days since first purchase, y = unit_price) pairs.
  const firstMs = parseISODate(rows[0].purchase_date);
  if (firstMs == null) {
    return { ready: false, reason: 'bad_first_date' };
  }
  const xs = new Array(rows.length);
  const ys = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const ms = parseISODate(rows[i].purchase_date);
    if (ms == null) {
      return { ready: false, reason: 'bad_date_row' };
    }
    xs[i] = Math.round((ms - firstMs) / 86400000);
    ys[i] = rows[i].unit_price;
  }
  const n = xs.length;
  const xMean = xs.reduce((s, v) => s + v, 0) / n;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;

  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    sxx += dx * dx;
    sxy += dx * (ys[i] - yMean);
  }
  if (sxx === 0) {
    // All purchases on the same day — slope undefined.
    return { ready: false, reason: 'no_x_variance' };
  }
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;

  // Residual stddev with (n-2) d.f. (slope + intercept consumed two).
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const fit = intercept + slope * xs[i];
    const resid = ys[i] - fit;
    sse += resid * resid;
  }
  const residual_stddev = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;

  // Avg interval between consecutive purchase dates (in days). Mirrors the
  // reorderQueue logic; positive intervals only.
  const intervals = [];
  for (let i = 1; i < n; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) intervals.push(d);
  }
  const avg_interval_days = intervals.length > 0
    ? Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length)
    : MIN_INTERVAL_DAYS;

  const lastX = xs[n - 1];
  const nextX = lastX + avg_interval_days;
  const last_unit_price = ys[n - 1];
  const last_seen = rows[n - 1].purchase_date;
  const predicted_next_price = Math.max(0, intercept + slope * nextX);
  const predicted_next_date  = isoFromMs(firstMs + nextX * 86400000);

  return {
    ready: true,
    normalized_name: normalizedName,
    points: n,
    months_observed,
    first_seen: rows[0].purchase_date,
    last_seen,
    last_unit_price,
    avg_interval_days,
    slope_per_day: slope,
    intercept,
    residual_stddev,
    predicted_next_date,
    predicted_next_price,
  };
}

// ─── 5.A.08 — priceElasticity ────────────────────────────────────────────
//
// Per-item own-price elasticity of demand. β in the log-log OLS
//   ln(qty_m) = α + β · ln(price_m) + ε
// where (price_m, qty_m) is one observation per calendar month: price_m =
// AVG(unit_price) across rows in that month, qty_m = SUM(canonical_qty)
// across rows in that month. canonical_qty (not raw qty) is used so 500g vs
// 1kg packs of the same item are commensurable.
//
// Interpretation of β:
//   β < -1   → elastic       (price ↑ 1% ⇒ qty ↓ more than 1%)
//   -1 < β < 0 → inelastic   (price ↑ 1% ⇒ qty ↓ less than 1%)
//   |β| ≈ 1  → unit-elastic  (within ±0.1)
//   β > 0    → giffen        (descriptive; usually means stock-up-when-cheap
//                             rather than true Giffen-good behaviour)
//
// Gate (matches 8.14 pricePrediction):
//   - ≥ MIN_MONTHS distinct purchase months (default 12)
//   - ≥ 2 distinct prices across those months (no x-variance ⇒ undefined β)
//
// Caching: SCOPES.ITEMS, 24h, keyed per normalized_name.

const ELASTICITY_TTL_SEC = 24 * 3600;
const MIN_MONTHS_ELAST   = 12;
const UNIT_BAND          = 0.1;   // |β| within 0.9..1.1 ⇒ unit-elastic

export async function priceElasticity(normalizedName, { minMonths = MIN_MONTHS_ELAST } = {}) {
  if (!normalizedName || typeof normalizedName !== 'string') {
    return { ready: false, reason: 'no_name' };
  }
  const key = `price_elasticity_v1_${normalizedName}_m${minMonths}`;
  return getCached(key, ELASTICITY_TTL_SEC,
    () => computePriceElasticity(normalizedName, minMonths),
    { scope: SCOPES.ITEMS });
}

async function computePriceElasticity(normalizedName, minMonths) {
  const rows = await all(
    `SELECT substr(purchase_date, 1, 7) AS month_key,
            AVG(unit_price)             AS price,
            SUM(canonical_qty)          AS qty,
            COUNT(*)                    AS samples,
            MAX(purchase_date)          AS last_in_month
       FROM receipt_items
      WHERE normalized_name = ?
        AND deleted_at IS NULL
        AND unit_price    > 0
        AND canonical_qty > 0
      GROUP BY month_key
      ORDER BY month_key ASC`,
    [normalizedName]
  );

  const n = rows.length;
  if (n < minMonths) {
    return { ready: false, reason: 'insufficient_months',
             n_months: n, min_months: minMonths };
  }

  // Distinct-price floor — elasticity is undefined when the item never moved
  // in price (β denominator is 0).
  const distinctPrices = new Set(rows.map((r) => +r.price.toFixed(4)));
  if (distinctPrices.size < 2) {
    return { ready: false, reason: 'no_price_variance',
             n_months: n, distinct_prices: distinctPrices.size };
  }

  // Build log-log pairs. Both price and qty are > 0 (enforced by WHERE).
  const xs = new Array(n);
  const ys = new Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = Math.log(rows[i].price);
    ys[i] = Math.log(rows[i].qty);
  }
  const xMean = xs.reduce((s, v) => s + v, 0) / n;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;

  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0) {
    // Defensive — distinctPrices floor should already prevent this.
    return { ready: false, reason: 'no_log_x_variance' };
  }
  const beta  = sxy / sxx;
  const alpha = yMean - beta * xMean;

  // Residual sum of squares + R² + std err β (n-2 d.f.).
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const fit = alpha + beta * xs[i];
    const r   = ys[i] - fit;
    sse += r * r;
  }
  const r2           = syy > 0 ? 1 - sse / syy : 0;
  const residualVar  = n > 2 ? sse / (n - 2) : 0;
  const std_err_beta = sxx > 0 ? Math.sqrt(residualVar / sxx) : 0;

  let kind;
  if (beta > 0)                          kind = 'giffen';
  else if (Math.abs(Math.abs(beta) - 1) <= UNIT_BAND) kind = 'unit_elastic';
  else if (Math.abs(beta) > 1)           kind = 'elastic';
  else                                   kind = 'inelastic';

  const last = rows[n - 1];
  return {
    ready: true,
    normalized_name: normalizedName,
    n_months: n,
    first_month: rows[0].month_key,
    last_month:  last.month_key,
    last_price:  last.price,
    last_qty:    last.qty,
    elasticity:  beta,
    alpha,
    r2,
    std_err_beta,
    kind,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function parseISODate(s) {
  if (!s || typeof s !== 'string') return null;
  // SQLite returns either 'YYYY-MM-DD' (date) or 'YYYY-MM-DD HH:MM:SS' (datetime).
  // Both parse via Date when we anchor to midnight UTC.
  const day = s.slice(0, 10);
  const parts = day.split('-');
  if (parts.length !== 3) return null;
  const y = +parts[0], mo = +parts[1] - 1, d = +parts[2];
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return Date.UTC(y, mo, d);
}

function startOfDayMs(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoFromMs(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
