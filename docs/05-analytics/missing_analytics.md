# Missing Analytics

Everything listed here is computable from the existing SQLite schema with zero cloud dependency.

---

## Tier 1 — High Value, Low Implementation Cost

### 1. Spending Velocity
**What:** Rate of change of spend — are you accelerating or decelerating?  
**Signal:** Rolling 7-day spend slope vs. previous 7-day slope. Positive slope = burning faster.  
**SQL:**
```sql
SELECT
  expense_date,
  SUM(amount) OVER (
    ORDER BY expense_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rolling_7d
FROM (
  SELECT expense_date, SUM(amount) AS amount
  FROM expenses
  GROUP BY expense_date
)
```
**Derived:** `velocity = (rolling_7d_today - rolling_7d_7d_ago) / rolling_7d_7d_ago * 100`  
**Display:** Velocity badge on Home — "⚡ +12% pace" or "🌱 slowing down"

---

### 2. Budget Variance History
**What:** How well did you stay within budget, for each past month, per category?  
**Why missing:** `summaryByCategory` only queries current month. Need to parameterise month.  
**SQL:**
```sql
SELECT
  substr(e.expense_date, 1, 7)  AS month,
  c.id, c.name, c.budget,
  COALESCE(SUM(e.amount), 0)    AS spent,
  c.budget - COALESCE(SUM(e.amount), 0) AS variance
FROM categories c
LEFT JOIN expenses e ON e.category_id = c.id
  AND substr(e.expense_date, 1, 7) = ?
GROUP BY month, c.id
ORDER BY month DESC
```
**Display:** Category × Month grid heatmap. Red = over, green = under.

---

### 3. Merchant Intelligence
**What:** Rank merchants by total spend, visit frequency, avg basket size, category spread.  
**SQL:**
```sql
SELECT
  merchant,
  COUNT(*)          AS visits,
  SUM(amount)       AS total_spend,
  AVG(amount)       AS avg_basket,
  MIN(expense_date) AS first_visit,
  MAX(expense_date) AS last_visit,
  COUNT(DISTINCT category_id) AS category_spread
FROM expenses
WHERE expense_date >= date('now', '-12 months')
GROUP BY merchant
ORDER BY total_spend DESC
```
**Display:** Merchant leaderboard, bar chart of top 10, avg basket trend per merchant.

---

### 4. Cheapest Merchant Per Item
**What:** For each tracked item, which store charged the least per canonical unit?  
**SQL:**
```sql
SELECT
  ri.normalized_name,
  e.merchant,
  MIN(ri.unit_price) AS best_price,
  MAX(ri.unit_price) AS worst_price,
  COUNT(*)           AS purchase_count,
  MAX(ri.canonical_unit) AS unit
FROM receipt_items ri
JOIN expenses e ON e.id = ri.expense_id
GROUP BY ri.normalized_name, e.merchant
ORDER BY ri.normalized_name, best_price ASC
```
**Display:** Per-item view — "Cheapest: D-Mart ₹42/kg  |  Most expensive: Nature's Basket ₹78/kg"

---

### 5. Repeat Purchase Detection
**What:** Items bought more than once — detect purchase frequency, last bought, avg interval.  
**SQL:**
```sql
SELECT
  normalized_name,
  MAX(name)         AS display_name,
  COUNT(*)          AS purchase_count,
  MIN(purchase_date) AS first_buy,
  MAX(purchase_date) AS last_buy,
  ROUND(
    JULIANDAY(MAX(purchase_date)) - JULIANDAY(MIN(purchase_date))
  ) / MAX(1, COUNT(*) - 1) AS avg_days_between
FROM receipt_items
GROUP BY normalized_name
HAVING COUNT(*) > 1
ORDER BY last_buy DESC
```
**Display:** "Toor Dal — every 18 days on avg. Last bought 12 days ago → due in ~6 days"

---

### 6. Subscription Leakage Score
**What:** Subscriptions as % of total monthly spend; unused subs cost per month.  
**Derived:**
```
total_sub_monthly = SUM(amount WHERE period='mo') + SUM(amount WHERE period='yr') / 12
leakage_rate = total_sub_monthly / avg_monthly_spend * 100
wasted = SUM(amount WHERE verdict='cancel' AND NOT cancelled)
```
**Display:** "🔴 Subscription leakage: 23% of spend. ₹820/mo potentially wasted."

---

### 7. Day-of-Week Spend Heatmap
**What:** Which days do you spend most? Calendar heatmap of spend intensity.  
**SQL:**
```sql
SELECT
  CAST(strftime('%w', expense_date) AS INTEGER) AS dow,  -- 0=Sun
  AVG(daily_total) AS avg_spend
FROM (
  SELECT expense_date, SUM(amount) AS daily_total
  FROM expenses
  GROUP BY expense_date
) GROUP BY dow
```
**Display:** 7-cell weekly heatmap. Weekend vs weekday total comparison strip.

---

### 8. Lifestyle Inflation Detector
**What:** Is your baseline spending creeping up quarter-over-quarter?  
**Derived:** Compare avg monthly spend in Q1 vs Q2 vs Q3 vs Q4 for each category.  
**SQL:**
```sql
SELECT
  CASE
    WHEN CAST(strftime('%m', expense_date) AS INT) BETWEEN 1 AND 3 THEN 'Q1'
    WHEN CAST(strftime('%m', expense_date) AS INT) BETWEEN 4 AND 6 THEN 'Q2'
    WHEN CAST(strftime('%m', expense_date) AS INT) BETWEEN 7 AND 9 THEN 'Q3'
    ELSE 'Q4'
  END AS quarter,
  strftime('%Y', expense_date) AS year,
  category_id,
  SUM(amount) / 3.0 AS avg_monthly
FROM expenses
GROUP BY quarter, year, category_id
ORDER BY year, quarter
```
**Display:** Line chart per category: "Dining out: Q1 ₹4.2k → Q2 ₹5.8k → Q3 ₹6.4k 📈"

---

### 9. Inflation Basket Index
**What:** Track the cost of a "personal basket" of frequently bought items over time.  
**Derived:** Pick top-N items by purchase count. Compute their weighted average unit price per month. Index against oldest month = 100.  
**SQL (basket price per month):**
```sql
SELECT
  substr(purchase_date, 1, 7) AS month,
  normalized_name,
  AVG(unit_price) AS avg_unit_price
FROM receipt_items
WHERE normalized_name IN (/* top-N items */)
GROUP BY month, normalized_name
```
**Derived:** Weighted index = SUM(weight_i × price_i_month / price_i_base)  
**Display:** "Your personal inflation: +8.2% vs 12 months ago" with a line chart.

---

## Tier 2 — High Value, Moderate Complexity

### 10. Seasonal Expense Patterns
**What:** Month-of-year heatmap — does spending spike in November (Diwali), March (Q4), December?  
**SQL:** GROUP BY CAST(strftime('%m', expense_date) AS INT) across all years.  
**Display:** 12-cell ring calendar, cell size = average monthly spend for that calendar month.

---

### 11. Spending by Time-of-Month
**What:** Do you front-load spending at month start or back-load it?  
**SQL:**
```sql
SELECT
  CAST(strftime('%d', expense_date) AS INT) AS day_of_month,
  AVG(daily_amount) AS avg_spend
FROM (
  SELECT expense_date,
         CAST(strftime('%d', expense_date) AS INT) AS day_of_month,
         SUM(amount) AS daily_amount
  FROM expenses
  GROUP BY expense_date
) GROUP BY day_of_month
```
**Display:** 31-bar histogram. "You spend 34% of budget in the first 5 days."

---

### 12. Category Share of Wallet Over Time
**What:** How has the proportional mix of spending changed month over month?  
**Derived:** Per month: category_spend / total_spend. Stack as 100% stacked bar chart.  
**Display:** Sankey diagram showing flow from months → categories, or 100% stacked bars.

---

### 13. Reorder Prediction
**What:** "This item is probably due" — based on avg_days_between from repeat purchase detection.  
**Derived:** `predicted_next = last_buy + avg_days_between`. Flag items where `predicted_next BETWEEN today AND today+7`.  
**Display:** "🛒 Due soon: Toor Dal, Rice, Olive Oil"

---

### 14. Mood × Spend Correlation
**What:** Do you spend more on "stressed" vs "happy" days?  
**SQL:**
```sql
SELECT mood, COUNT(*) AS txn_count, AVG(amount) AS avg_spend, SUM(amount) AS total_spend
FROM expenses
WHERE mood IS NOT NULL
GROUP BY mood
ORDER BY avg_spend DESC
```
**Display:** Emoji grid with avg spend per mood. "You spend 2.3× more when 😔"

---

### 15. Carbon Spend Tracker
**What:** Carbon footprint associated with expenses (field exists, rarely populated).  
**Note:** Currently `carbon` is always 0 unless set manually. Needs baseline carbon-per-category mapping.  
**Quick win:** Map category emoji/name → CO₂ estimate if carbon=0.  
**Display:** Monthly carbon budget vs actual, cumulative CO₂ line.

---

## Tier 3 — Advanced, Requires More Data Over Time

### 16. Cashflow Forecasting (Multi-Model)
See `forecasting.md` for full treatment.

### 17. Net Worth Trajectory
**What:** Net worth change over time.  
**Blocker:** `accounts` stores only current balance. Need a `account_snapshots` table with `(account_id, balance, snapshot_date)`.  
**Schema addition:**
```sql
CREATE TABLE account_snapshots (
  account_id   INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  balance      REAL NOT NULL,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  PRIMARY KEY (account_id, snapshot_date)
);
```

### 18. Spending Anomaly Detection
**What:** Days with unusually high spend flagged automatically.  
**Derived:** µ = avg daily spend over 90 days, σ = stddev. Flag days where spend > µ + 2σ.  
**SQLite note:** No STDDEV function — compute in JS from raw daily totals.  
**Display:** "⚠️ March 15 was 3.2× your normal day"

### 19. Price Elasticity (Item vs Frequency)
**What:** When milk price rises, does consumption drop?  
**Derived:** Correlate unit_price with canonical_qty purchased per period for same item.  
**Display:** Scatter plot: price on X, quantity on Y per item.

### 20. Cross-Category Substitution
**What:** When "Dining" spend rises, does "Groceries" drop? Detect category substitution patterns.  
**Derived:** Pearson correlation between monthly category totals.  
**Display:** Correlation matrix heatmap (category × category).
