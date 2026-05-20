# Future Analytics Engine

A complete design for an offline-first, SQLite-native analytics system.

---

## 1. Architecture: Analytics Engine

### Design Principles
- **Zero cloud.** All computation runs in SQLite + JavaScript on-device.
- **Lazy materialization.** Expensive aggregations are cached in a dedicated `analytics_cache` table. Cache is invalidated on any write to `expenses` or `receipt_items`.
- **Incremental.** Re-compute only the affected time window, not full history.
- **Composable.** Each analytic is a pure function `(db, params) → result` in `src/analytics/`.

### Module Layout
```
src/
  analytics/
    index.js           ← registry + cache coordinator
    spend.js           ← spending velocity, variance, category mix
    items.js           ← inflation basket, cheapest merchant, reorder
    subscriptions.js   ← leakage score, hidden cost detection
    forecast.js        ← multi-model cashflow forecasting
    seasonal.js        ← heatmaps, time-of-month, day-of-week
    lifestyle.js       ← lifestyle inflation, QoQ drift
    net_worth.js       ← trajectory (requires snapshots)
    anomaly.js         ← outlier detection
    patterns.js        ← repeat purchases, reorder queue
  db/
    repo/
      analytics_cache.js ← read/write materialized results
```

---

## 2. Materialized View Strategy

### Cache Table Schema
```sql
CREATE TABLE IF NOT EXISTS analytics_cache (
  key         TEXT PRIMARY KEY,   -- e.g. 'monthly_trend:12' or 'basket_index:2026-05'
  value       TEXT NOT NULL,      -- JSON blob
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT                -- NULL = never expires, else ISO date
);
CREATE INDEX IF NOT EXISTS idx_cache_key ON analytics_cache(key);
```

### Cache Invalidation
```js
// Called in expenses.create / expenses.update / expenses.remove
async function invalidateSpendCache() {
  await exec(`DELETE FROM analytics_cache WHERE key LIKE 'monthly_%' OR key LIKE 'category_%' OR key LIKE 'velocity_%'`);
}

async function invalidateItemCache() {
  await exec(`DELETE FROM analytics_cache WHERE key LIKE 'basket_%' OR key LIKE 'item_%' OR key LIKE 'cheapest_%'`);
}
```

### Cache-Aside Pattern
```js
async function getCached(key, ttlDays, computeFn) {
  const row = await one(`SELECT value, computed_at FROM analytics_cache WHERE key = ?`, [key]);
  if (row) {
    const age = (Date.now() - new Date(row.computed_at).getTime()) / 86400000;
    if (!ttlDays || age < ttlDays) return JSON.parse(row.value);
  }
  const result = await computeFn();
  await exec(
    `INSERT OR REPLACE INTO analytics_cache (key, value, computed_at) VALUES (?, ?, datetime('now'))`,
    [key, JSON.stringify(result)]
  );
  return result;
}
```

### Which Analytics to Materialize

| Analytic | Cache Key | TTL | Trigger |
|---|---|---|---|
| 6-month monthly trend | `monthly_trend:6` | 1 day | expense write |
| 12-month monthly trend | `monthly_trend:12` | 1 day | expense write |
| Basket inflation index | `basket_index:YYYY-MM` | 7 days | item write |
| Cheapest merchant per item | `cheapest:${name}` | 3 days | item write |
| Category variance history | `variance:12` | 1 day | expense write |
| Day-of-week heatmap | `dow_heatmap` | 1 day | expense write |
| Seasonal calendar | `seasonal_calendar` | 7 days | expense write |
| Repeat purchase schedule | `reorder_queue` | 1 day | item write |
| Subscription leakage score | `sub_leakage` | 1 day | sub write |
| Spending velocity | `velocity:7d` | 6 hours | expense write |

---

## 3. Time-Series Strategy

### Problem
SQLite has no native time-series engine. Windows functions require SQLite 3.25+ (Expo's bundled version is typically 3.39+, so window functions are safe).

### Time Bucket Abstraction
```js
// src/analytics/timebucket.js
const BUCKETS = {
  day:    { fmt: `date(expense_date)`,               since: n => `date('now', '-${n} days')` },
  week:   { fmt: `strftime('%Y-W%W', expense_date)`,  since: n => `date('now', '-${n*7} days')` },
  month:  { fmt: `substr(expense_date, 1, 7)`,        since: n => `date('now', '-${n} months')` },
  quarter:{ fmt: `strftime('%Y-Q', expense_date, ...)`,since: n => `date('now', '-${n*3} months')` },
  year:   { fmt: `substr(expense_date, 1, 4)`,        since: n => `date('now', '-${n} years')` },
};

function bucketQuery(bucket, n) {
  const { fmt, since } = BUCKETS[bucket];
  return { fmtExpr: fmt, sinceExpr: since(n) };
}
```

### Rolling Aggregates (Window Functions)
```sql
-- 7-day rolling spend
WITH daily AS (
  SELECT date(expense_date) AS d, SUM(amount) AS amount
  FROM expenses
  WHERE date(expense_date) >= date('now', '-90 days')
  GROUP BY d
)
SELECT d,
  amount,
  AVG(amount) OVER (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7d,
  AVG(amount) OVER (ORDER BY d ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS rolling_30d
FROM daily
ORDER BY d
```

### Gap Filling
SQLite doesn't generate date series natively. Fill gaps in JS:
```js
function fillDateGaps(rows, bucket = 'month') {
  // Build a map from period → value, then iterate the full date range
  // inserting 0-value entries for missing periods
  const map = new Map(rows.map(r => [r.period, r]));
  const filled = [];
  // iterate from min to max period by bucket increment
  // ...
  return filled;
}
```

### Trend Line (Linear Regression — in JS)
```js
function linearRegression(points) {
  // points: [{x: epoch_ms, y: amount}]
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept, predict: x => slope * x + intercept };
}
```

---

## 4. Aggregation Pipelines

### Pipeline 1: Monthly Category Heatmap
```
Input: expenses × categories, last N months
Step 1: GROUP BY month, category → spend totals
Step 2: JOIN with category.budget → compute variance %
Step 3: Normalise variance per cell: clamp to [-1, +1]
Step 4: Map to color intensity (green → red)
Output: Matrix[month][category] = {spend, budget, variancePct, color}
```

### Pipeline 2: Personal Inflation Basket
```
Input: receipt_items, all time
Step 1: Rank items by purchase_count DESC → take top-20
Step 2: For each item, compute avg_unit_price per month
Step 3: For each month: weighted_index = Σ(weight_i × price_i_m / price_i_base)
        where weight_i = purchase_count_i / total_purchases
Step 4: Index base = first month with data for ≥5 items = 100
Output: [{month, index, yoy_change_pct}]
```

### Pipeline 3: Merchant Comparison Per Item
```
Input: receipt_items JOIN expenses, specific normalized_name
Step 1: GROUP BY merchant → min_price, avg_price, purchase_count
Step 2: Sort by avg_price ASC
Step 3: Compute savings_vs_worst = (worst_price - best_price) / worst_price × 100
Output: [{merchant, min_price, avg_price, count, savings_pct}]
```

### Pipeline 4: Reorder Queue
```
Input: receipt_items with COUNT > 1
Step 1: For each normalized_name: avg_days_between, last_buy
Step 2: predicted_next = last_buy + avg_days_between
Step 3: Filter: predicted_next BETWEEN today-3 AND today+14
Step 4: Sort by urgency (overdue first)
Output: [{name, last_buy, avg_interval, predicted_next, days_until, urgency}]
```

### Pipeline 5: Spending Velocity
```
Input: expenses, last 30 days
Step 1: GROUP BY date → daily_totals
Step 2: Rolling 7-day sums for today and 7 days ago
Step 3: velocity_pct = (rolling_7d_today - rolling_7d_prev) / rolling_7d_prev × 100
Step 4: Classify: < -10% = decelerating, -10 to +10% = stable, > +10% = accelerating
Output: {velocity_pct, classification, rolling_7d_today, rolling_7d_prev}
```

### Pipeline 6: Lifestyle Inflation
```
Input: expenses, last 8 quarters
Step 1: GROUP BY year+quarter, category_id → quarterly_avg_monthly
Step 2: For each category: compute QoQ change %
Step 3: Flag categories with 3+ consecutive QoQ increases
Step 4: Compute "lifestyle inflation score" = weighted avg of flagged category drifts
Output: {score, flagged_categories: [{name, drift_pct, quarters_rising}]}
```

### Pipeline 7: Subscription Leakage
```
Input: subscriptions, expenses (last 3 months avg)
Step 1: Normalise all subs to monthly: yr/12, mo×1
Step 2: total_sub_monthly = SUM
Step 3: avg_monthly_spend = last 3 months AVG from expenses
Step 4: leakage_rate = total_sub_monthly / avg_monthly_spend
Step 5: wasted_monthly = SUM WHERE verdict='cancel' AND NOT cancelled
Step 6: potential_savings_yr = wasted_monthly × 12
Output: {total_monthly, leakage_rate_pct, wasted_monthly, potential_savings_yr}
```

---

## 5. Filter/Search Architecture

### Global Filter Context
```js
// src/analytics/filterContext.js
const DEFAULT_FILTER = {
  dateRange: { preset: 'last_6_months', from: null, to: null },
  categories: [],        // empty = all
  merchants: [],         // empty = all
  amountRange: { min: null, max: null },
  itemKind: 'all',       // produce | dairy | staples | other | all
  bucket: 'month',       // day | week | month | quarter | year
};
```

### Filter Application Layer
All analytics queries accept a `filter` param. A shared `buildWhereClause(filter)` helper produces:
```js
function buildWhereClause(filter) {
  const conds = [];
  const params = [];
  if (filter.dateRange.from) { conds.push(`expense_date >= ?`); params.push(filter.dateRange.from); }
  if (filter.dateRange.to)   { conds.push(`expense_date <= ?`); params.push(filter.dateRange.to); }
  if (filter.categories.length) {
    conds.push(`category_id IN (${filter.categories.map(() => '?').join(',')})`);
    params.push(...filter.categories);
  }
  if (filter.merchants.length) {
    conds.push(`merchant IN (${filter.merchants.map(() => '?').join(',')})`);
    params.push(...filter.merchants);
  }
  if (filter.amountRange.min != null) { conds.push(`amount >= ?`); params.push(filter.amountRange.min); }
  if (filter.amountRange.max != null) { conds.push(`amount <= ?`); params.push(filter.amountRange.max); }
  return { where: conds.length ? conds.join(' AND ') : '1=1', params };
}
```

### Search Architecture (Items)
Current: `LIKE prefix%` on `normalized_name`. 
Advanced: Add FTS5 virtual table for full-text item search across merchant + normalized_name:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  normalized_name,
  merchant,
  content='receipt_items',
  content_rowid='id'
);
-- Populate trigger on INSERT
CREATE TRIGGER items_ai AFTER INSERT ON receipt_items BEGIN
  INSERT INTO items_fts(rowid, normalized_name, merchant)
  SELECT NEW.id, NEW.normalized_name,
    (SELECT merchant FROM expenses WHERE id = NEW.expense_id);
END;
```

---

## 6. Chart & Visualization Recommendations

All charts should be rendered with **react-native-svg** (already common in Expo apps) or **Victory Native**. Keep it offline — no chart CDN.

### Recommended Chart Library Stack
```
Primary:  react-native-svg  (custom components — most flexible, pure offline)
Option B: victory-native    (batteries-included, works with Expo)
Heatmaps: Custom SVG grid   (calendar/matrix heatmaps are easier DIY)
```

### Chart Types by Analytic

| Analytic | Chart Type | Notes |
|---|---|---|
| Monthly trend | Segmented bar chart | Already exists, extend to 12 months + category stack |
| Spending velocity | Sparkline + badge | Arrow up/down with acceleration % |
| Budget variance history | Matrix heatmap | Category × Month, red/green cells |
| Category mix over time | 100% stacked bar | "Share of wallet" per month |
| Merchant leaderboard | Horizontal bar | Sorted by spend DESC |
| Day-of-week pattern | 7-cell heatmap strip | Darker = more spend |
| Seasonal calendar | 12-circle calendar ring | Area = avg monthly spend that month |
| Item price history | Line chart with dots | Replace bar chart; add regression line |
| Inflation basket index | Area line chart | Shaded from 100 baseline |
| Cheapest merchant | Grouped bar per item | Merchant on X, price on Y |
| Lifestyle inflation | Multi-line chart | One line per category, QoQ |
| Cashflow forecast | Line chart + cone | Solid past, dashed future with confidence cone |
| Reorder queue | Card list | Color-coded urgency (red/amber/green) |
| Sankey flow | Custom SVG Sankey | Month → Category flow |
| Subscription leakage | Donut chart | Wasted vs useful vs essential |
| Net worth trajectory | Area line | Requires snapshots table |
| Mood × spend | Emoji bubble chart | Emoji on X, avg spend on Y, size = count |
| Anomaly detection | Scatter + threshold line | Points above threshold in red |

---

## 7. Drill-Down Analytics Architecture

### Hierarchy
```
Home (summary)
  └── Trends (monthly overview)
        ├── PotDetail (category → transaction list)
        │     └── Detail (single transaction + items)
        ├── MerchantDetail [NEW] (merchant → visits, items, trend)
        ├── CategoryTrend [NEW] (single category 12-month bar)
        └── SpendingCalendar [NEW] (full heatmap calendar)

Items (item list)
  └── ItemTrend (item detail)
        ├── MerchantComparison [NEW] (cheapest merchant table)
        └── ReorderQueue [NEW] (due soon list)

Analytics [NEW SCREEN]
  ├── InflationIndex (basket chart)
  ├── LifestyleInflation (QoQ drift)
  ├── Velocity (rolling spend chart)
  ├── SeasonalPatterns (12-month heatmap)
  └── Forecasting (cashflow projection)
```

### Drill-Down State Pattern
```js
// Each analytics card is touchable and passes context forward
<TouchableOpacity onPress={() => navigation.navigate('CategoryTrend', {
  categoryId: cat.id,
  categoryName: cat.name,
  months: 12,
})}>
```

---

## 8. Comparison Views

### Year-over-Year
```sql
SELECT
  CAST(strftime('%m', expense_date) AS INT) AS month,
  strftime('%Y', expense_date) AS year,
  SUM(amount) AS total
FROM expenses
WHERE strftime('%Y', expense_date) IN ('2025', '2026')
GROUP BY month, year
ORDER BY month, year
```
Display: Grouped bar chart, current year vs prior year, per month.

### Category vs Category
```sql
SELECT
  substr(expense_date, 1, 7) AS month,
  SUM(CASE WHEN category_id = ? THEN amount ELSE 0 END) AS cat_a,
  SUM(CASE WHEN category_id = ? THEN amount ELSE 0 END) AS cat_b
FROM expenses
GROUP BY month
ORDER BY month
```
Display: Dual-line chart with category colors.

### Merchant vs Merchant (for same item)
Already partially implemented via `sameQtyHistory`. Extend to show per-merchant stats across all time.
