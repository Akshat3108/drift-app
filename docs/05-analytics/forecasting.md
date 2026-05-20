# Cashflow Forecasting — Offline, No Cloud AI

All models below run entirely in JavaScript + SQLite on-device. Zero API calls.

---

## Current Forecasting (Baseline)

```js
// Home.js — line 33
const forecast = dayOfMonth > 0 ? +(totalSpend * daysInMonth / dayOfMonth).toFixed(0) : 0;
```

**Model:** Simple linear extrapolation  
**Assumes:** Every day costs the same  
**Fails when:** Rent hits on day 1, weekend spending spikes, lumpy bills  
**Accuracy:** ±25-40% in practice

---

## Forecasting Architecture

### Design Goals
1. Multiple models running in parallel → ensemble the predictions
2. No external dependencies
3. Show uncertainty bands, not just a point estimate
4. Improve automatically as more data accumulates

### Where it Lives
```
src/analytics/forecast.js
```

---

## Model 1: Weighted Linear Extrapolation (Enhanced Baseline)

Improvement over current: weight recent days more, handle "already paid" recurring expenses.

```js
async function weightedLinearForecast(db) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  // Daily spends this month
  const rows = await db.all(
    `SELECT date(expense_date) AS d, SUM(amount) AS amt
     FROM expenses
     WHERE substr(expense_date,1,7) = ?
     GROUP BY d
     ORDER BY d`,
    [today.toISOString().slice(0,7)]
  );

  // Exponential weighting: more recent days weigh more
  let weightedSum = 0, totalWeight = 0;
  rows.forEach((r, i) => {
    const weight = Math.pow(1.2, i); // more recent = higher index = higher weight
    weightedSum += r.amt * weight;
    totalWeight += weight;
  });

  const weightedAvgDaily = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const projected = rows.reduce((s, r) => s + r.amt, 0) + weightedAvgDaily * daysLeft;

  return { model: 'weighted_linear', projected, confidence: 0.5 };
}
```

---

## Model 2: Historical Same-Month Average

"What did I spend in May in previous years?"

```js
async function historicalMonthForecast(db) {
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();

  // Same calendar month in prior years
  const rows = await db.all(
    `SELECT strftime('%Y', expense_date) AS yr, SUM(amount) AS total
     FROM expenses
     WHERE CAST(strftime('%m', expense_date) AS INT) = ?
       AND strftime('%Y', expense_date) != ?
     GROUP BY yr
     ORDER BY yr DESC
     LIMIT 3`,
    [currentMonth, String(currentYear)]
  );

  if (rows.length === 0) return null;

  // Weighted avg of prior years (most recent weighs 50%)
  const weights = [0.5, 0.3, 0.2].slice(0, rows.length);
  const totalW = weights.reduce((s, w) => s + w, 0);
  const projected = rows.reduce((s, r, i) => s + r.total * (weights[i] / totalW), 0);

  return { model: 'historical_month', projected, confidence: 0.7, sampleYears: rows.length };
}
```

**Accuracy:** Best when you have 2+ years of data. Captures seasonality.

---

## Model 3: Rolling 90-Day Daily Rate

Smooths over monthly lumps. Takes the 90-day daily average and projects it.

```js
async function rolling90DayForecast(db) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  // Exclude recurring/subscription-like expenses for smoother baseline
  const { avg_daily } = await db.one(
    `SELECT SUM(amount) / 90.0 AS avg_daily
     FROM expenses
     WHERE date(expense_date) >= date('now', '-90 days')
       AND recurring = 0`
  );

  // Current month spend so far
  const { spent_so_far } = await db.one(
    `SELECT COALESCE(SUM(amount), 0) AS spent_so_far
     FROM expenses
     WHERE substr(expense_date,1,7) = ?`,
    [today.toISOString().slice(0,7)]
  );

  const projected = spent_so_far + avg_daily * daysLeft;
  return { model: 'rolling_90d', projected, confidence: 0.65 };
}
```

---

## Model 4: Recurring-Aware Forecast

Separates "known" recurring expenses from variable spend.

```js
async function recurringAwareForecast(db) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // Recurring expenses not yet seen this month (expected but not yet logged)
  const avgRecurring = await db.one(
    `SELECT AVG(monthly_recurring) AS avg FROM (
       SELECT substr(expense_date,1,7) AS month,
              SUM(amount) AS monthly_recurring
       FROM expenses
       WHERE recurring = 1
       GROUP BY month
       ORDER BY month DESC
       LIMIT 6
     )`
  );

  // Variable spend rate from last 30 days (non-recurring)
  const { daily_variable } = await db.one(
    `SELECT SUM(amount) / 30.0 AS daily_variable
     FROM expenses
     WHERE date(expense_date) >= date('now', '-30 days')
       AND recurring = 0`
  );

  // Month spend so far
  const { spent } = await db.one(
    `SELECT COALESCE(SUM(amount), 0) AS spent
     FROM expenses WHERE substr(expense_date,1,7) = ?`,
    [today.toISOString().slice(0,7)]
  );

  // Add only the unspent portion of expected recurring
  const projRecurring = avgRecurring.avg || 0;
  const projected = spent + daily_variable * (daysInMonth - dayOfMonth) + Math.max(0, projRecurring - spent);

  return { model: 'recurring_aware', projected, confidence: 0.75 };
}
```

---

## Model 5: Day-of-Week Pattern Forecast

Not all days are equal. Adjust daily rate by historical day-of-week spend pattern.

```js
async function dowPatternForecast(db) {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // Historical avg spend per day of week (0=Sun, 6=Sat)
  const dowRows = await db.all(
    `SELECT CAST(strftime('%w', expense_date) AS INT) AS dow,
            AVG(daily_total) AS avg_spend
     FROM (
       SELECT expense_date,
              CAST(strftime('%w', expense_date) AS INT) AS dow,
              SUM(amount) AS daily_total
       FROM expenses
       WHERE date(expense_date) >= date('now', '-90 days')
       GROUP BY expense_date
     )
     GROUP BY dow`
  );

  const dowMap = new Map(dowRows.map(r => [r.dow, r.avg_spend]));
  const overallAvg = dowRows.reduce((s, r) => s + r.avg_spend, 0) / Math.max(1, dowRows.length);

  // Remaining days with their dow multipliers
  let additionalProjected = 0;
  for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d);
    const dow = date.getDay();
    const dayRate = dowMap.get(dow) ?? overallAvg;
    additionalProjected += dayRate;
  }

  const { spent } = await db.one(
    `SELECT COALESCE(SUM(amount), 0) AS spent FROM expenses WHERE substr(expense_date,1,7) = ?`,
    [today.toISOString().slice(0,7)]
  );

  return { model: 'dow_pattern', projected: spent + additionalProjected, confidence: 0.7 };
}
```

---

## Ensemble: Combining Models

```js
async function ensembleForecast(db) {
  const models = await Promise.all([
    weightedLinearForecast(db),
    historicalMonthForecast(db),
    rolling90DayForecast(db),
    recurringAwareForecast(db),
    dowPatternForecast(db),
  ]);

  const valid = models.filter(Boolean);
  if (!valid.length) return null;

  // Weighted by confidence
  const totalConf = valid.reduce((s, m) => s + m.confidence, 0);
  const ensemble = valid.reduce((s, m) => s + m.projected * (m.confidence / totalConf), 0);

  // Spread = ±1 stddev of model outputs
  const mean = valid.reduce((s, m) => s + m.projected, 0) / valid.length;
  const variance = valid.reduce((s, m) => s + Math.pow(m.projected - mean, 2), 0) / valid.length;
  const stddev = Math.sqrt(variance);

  return {
    best_case:   Math.round(ensemble - stddev),
    likely:      Math.round(ensemble),
    worst_case:  Math.round(ensemble + stddev),
    models:      valid,
    confidence:  Math.min(0.95, totalConf / valid.length),
  };
}
```

**Output:**
```js
{
  best_case: 28400,
  likely: 32200,
  worst_case: 36800,
  models: [
    { model: 'weighted_linear', projected: 31800, confidence: 0.5 },
    { model: 'historical_month', projected: 33100, confidence: 0.7 },
    { model: 'rolling_90d', projected: 32400, confidence: 0.65 },
    { model: 'recurring_aware', projected: 31200, confidence: 0.75 },
    { model: 'dow_pattern', projected: 32500, confidence: 0.7 },
  ],
  confidence: 0.66
}
```

---

## 3-Month Lookahead Forecast

For a 3-month forward view, combine:
1. **Historical same month** (prior year or 2-year avg)
2. **Trend adjustment**: apply current-month growth rate to historical baseline
3. **Seasonal multiplier**: if month X historically runs 20% higher, apply that

```js
async function threeMonthLookahead(db) {
  const today = new Date();
  const results = [];

  for (let offset = 1; offset <= 3; offset++) {
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const targetMonth = target.getMonth() + 1;
    const targetYear = target.getFullYear();

    // Average spending in this calendar month across all past data
    const { avg } = await db.one(
      `SELECT AVG(monthly_total) AS avg FROM (
         SELECT SUM(amount) AS monthly_total
         FROM expenses
         WHERE CAST(strftime('%m', expense_date) AS INT) = ?
           AND strftime('%Y', expense_date) < ?
         GROUP BY substr(expense_date,1,7)
       )`,
      [targetMonth, String(targetYear)]
    );

    // 6-month trend slope to adjust the historical average
    const trend = await computeMonthlySlope(db); // returns ₹/month slope
    const adjusted = (avg || 0) + trend * offset;

    results.push({
      month: `${targetYear}-${String(targetMonth).padStart(2,'0')}`,
      projected: Math.max(0, Math.round(adjusted)),
    });
  }

  return results;
}
```

---

## Accuracy Improvement Over Time

| Data Available | Best Model | Expected Error |
|---|---|---|
| < 1 month | weighted_linear | ±30% |
| 1-3 months | rolling_90d + dow_pattern | ±20% |
| 3-6 months | recurring_aware + ensemble | ±15% |
| 6-12 months | ensemble (all 5 models) | ±10% |
| 12+ months | ensemble + historical_month | ±8% |

---

## Confidence Band Display

In `Forecast.js`:
```
₹28,400 ─── best ─── ₹32,200 ─── likely ─── ₹36,800 worst
             [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]
             Budget: ₹30,000
             ⚠️  62% chance of going over
```

Compute "probability over budget":
```js
// Assume normal distribution between best/worst
// P(X > budget) ≈ based on how far budget is from likely vs spread
const z = (budget - likely) / ((worst_case - best_case) / 4);
// Approximate CDF for a normal — no math libraries needed
const probOver = 1 - approxNormalCDF(z);
```

Simple approxNormalCDF (no dependencies):
```js
function approxNormalCDF(z) {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - phi * poly;
  return z >= 0 ? cdf : 1 - cdf;
}
```

---

## Reorder Prediction

A separate time-series problem: predicting *when* a specific item will be purchased next.

```js
async function reorderQueue(db) {
  const items = await db.all(
    `SELECT
       normalized_name,
       MAX(name) AS display_name,
       COUNT(*) AS n,
       MIN(purchase_date) AS first_buy,
       MAX(purchase_date) AS last_buy,
       ROUND(
         (JULIANDAY(MAX(purchase_date)) - JULIANDAY(MIN(purchase_date)))
         / MAX(1.0, COUNT(*) - 1)
       ) AS avg_interval_days
     FROM receipt_items
     GROUP BY normalized_name
     HAVING COUNT(*) >= 2
     ORDER BY last_buy DESC`
  );

  const today = new Date();
  return items
    .map(item => {
      const lastBuy = new Date(item.last_buy + 'T00:00:00');
      const predictedNext = new Date(lastBuy);
      predictedNext.setDate(predictedNext.getDate() + item.avg_interval_days);
      const daysUntil = Math.round((predictedNext - today) / 86400000);

      return {
        ...item,
        predicted_next: predictedNext.toISOString().slice(0, 10),
        days_until: daysUntil,
        urgency: daysUntil < 0 ? 'overdue' : daysUntil <= 3 ? 'soon' : daysUntil <= 7 ? 'this_week' : 'upcoming',
      };
    })
    .filter(item => item.days_until <= 14) // only show near-term
    .sort((a, b) => a.days_until - b.days_until);
}
```

---

## What NOT to Do (No Cloud AI Needed)

| Problem | Cloud AI temptation | Offline solution |
|---|---|---|
| Spend forecast | GPT to predict | Ensemble of 5 statistical models |
| Reorder timing | LLM to guess | Avg purchase interval from history |
| Category classification | LLM to tag | Rule-based keyword map + user override |
| Inflation tracking | External CPI API | Personal basket index from own receipts |
| Anomaly detection | ML model | µ + 2σ outlier rule on daily totals |
| Seasonal patterns | Time-series model | GROUP BY month-of-year across years |
| Trend prediction | Prophet / ML | Linear regression on monthly totals |

All of these are solvable with simple statistics on the data the user has already entered. The app has a significant data advantage: it has the user's *actual* itemised receipts, not just transaction totals.
