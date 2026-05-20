# Current Analytics Audit

**App:** Drift (React Native / Expo SQLite)  
**DB:** SQLite via expo-sqlite — fully offline  
**Date:** 2026-05-17

---

## Schema Surface Available for Analytics

| Table | Key Columns | Analytics Potential |
|---|---|---|
| `expenses` | amount, merchant, category_id, mood, carbon, recurring, expense_date | Core spend ledger |
| `receipt_items` | normalized_name, kind, qty, unit, canonical_qty, canonical_unit, unit_price, price, purchase_date | Item-level price intelligence |
| `categories` | budget, name, color | Budget vs actual |
| `subscriptions` | amount, period, used_freq, verdict, cancelled | Recurring cost analysis |
| `accounts` | kind (asset/liability), balance | Net worth snapshot |
| `goals` | target_amount, saved_amount, eta | Savings progress |
| `trips` | budget, home_currency, dest_currency, dest_rate, start_date, end_date | Travel spend |

---

## Existing Analytics Inventory

### 1. Monthly Spending Trend (Trends.js)
- **What:** 6-month rolling total spend bar chart
- **Query:** `expenses.monthlyTrend(6)` — `GROUP BY substr(expense_date,1,7)`
- **UI:** Tappable bar chart; selected month shows total
- **Delta:** Month-over-month % change badge (current vs previous month only)
- **Gap:** Only 6 months. No YoY. No category breakdown across months.

### 2. Category Spend vs Budget (Trends.js + Home.js)
- **What:** Current month spend per category, budget progress bar, over-budget flag
- **Query:** `expenses.summaryByCategory(month)` — LEFT JOIN categories on current month
- **UI:** Progress bars with % used, remaining amount, "over" badge
- **Gap:** Only current month. No historical category performance. No trend per category.

### 3. Month-End Forecast (Home.js)
- **What:** Simple linear extrapolation: `totalSpend × daysInMonth / dayOfMonth`
- **UI:** "On this pace, you'll end at ₹X — about ₹Y under/over budget"
- **Gap:** Ignores weekday/weekend pattern, seasonality, recurring expenses. Pure linear only.

### 4. Under-Budget Streak (Home.js + expenses.js)
- **What:** Consecutive days where daily spend ≤ `monthlyBudget / 30`
- **Query:** `expenses.streakDays()` — last 60 days, grouped by date
- **Gap:** Doesn't account for lumpy expenses (rent, bills). No streak history chart.

### 5. Item Price History (ItemTrend.js)
- **What:** Per-item unit price over time (last 12 data points), bar chart
- **Query:** `items.priceHistory(normalizedName)` — all purchases ASC
- **Stats:** min, max, avg unit price; overall price change %
- **Gap:** No trendline, no regression, no price forecast.

### 6. Item Consumption (ItemTrend.js)
- **What:** Canonical quantity consumed per week/month/year
- **Query:** `items.consumption(normalizedName, {bucket, range})`
- **Gap:** No reorder prediction, no consumption rate trend.

### 7. Same-Quantity Price Comparison (ItemTrend.js)
- **What:** Past purchases of the same item at ±20% of the same quantity, showing price and merchant
- **Query:** `items.sameQtyHistory()` — canonical_qty BETWEEN low AND high
- **Gap:** Only compares a single item at a time. No cross-merchant ranking. No "cheapest store" summary.

### 8. Top Price Mover (Home.js)
- **What:** Single produce item with the biggest recent unit price % change
- **Query:** `items.topMover()` — filters kind='produce', change_pct > 5%
- **Gap:** Only surfaces one item. No dashboard of all movers. Only produce kind.

### 9. Subscription Cost Summary (Subs.js)
- **What:** Total monthly cost across active subscriptions, annualised total, cancellation suggestions
- **Logic:** Filter `verdict === 'cancel'`, surface "cancel all" CTA
- **Gap:** No spend-over-time for subs. No subscription leakage score. No detection from expense data.

### 10. Net Worth Snapshot (NetWorth.js, Home.js)
- **What:** Sum of assets minus liabilities from `accounts` table
- **Query:** `accounts.netWorth()` — GROUP BY kind
- **Gap:** No net worth over time (balances are point-in-time only, no history table).

---

## Analytics Queries Currently in repos

| Function | File | What it does |
|---|---|---|
| `expenses.monthlyTrend(n)` | expenses.js | SUM amount GROUP BY YYYY-MM |
| `expenses.summaryByCategory(month)` | expenses.js | Per-category spend vs budget for a month |
| `expenses.streakDays()` | expenses.js | Under-budget daily streak |
| `items.trackedItems({kind})` | items.js | All items: latest price, price delta, sparkline |
| `items.priceHistory(name)` | items.js | Full purchase history for one item |
| `items.consumption(name, opts)` | items.js | Qty consumed by time bucket |
| `items.stats(name)` | items.js | min/max/avg price for one item |
| `items.sameQtyHistory(name, qty, unit)` | items.js | Same-size purchases for apples-to-apples |
| `items.topMover()` | items.js | Biggest unit price % change in produce |

---

## What the UI Actually Shows

| Screen | Analytics Present |
|---|---|
| Home | Today's spend, budget left, simple forecast, net worth, streak, top price mover, recent 5 transactions |
| Trends | 6-month bar chart, category breakdown with progress bars, goals progress |
| Items | Item list with sparklines, price deltas, kind filters |
| ItemTrend | Price chart, consumption chart, stats row, same-qty comparisons |
| Subs | Total monthly cost, cancel recommendations |
| NetWorth | Asset/liability split |
| PotDetail | Category transactions (drill-down) |

---

## Summary: What's Working Well

- Item-level price tracking from OCR is strong and unique.
- Budget vs actual with visual feedback is solid UX.
- Same-quantity merchant comparison is a clever feature.
- Top mover surfacing on home screen drives engagement.

## Summary: Structural Gaps

1. No time-series analytics beyond 6 months total
2. No cross-category trend (share of wallet over time)
3. No merchant analytics at all
4. No seasonal / calendar analytics
5. No cashflow forecasting beyond linear extrapolation
6. No inflation index (basket comparison over time)
7. No reorder prediction or consumption velocity
8. No lifestyle inflation detection
9. No budget variance history (only current month)
10. No spending velocity (acceleration/deceleration of spend rate)
