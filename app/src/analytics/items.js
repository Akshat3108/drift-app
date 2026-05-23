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
