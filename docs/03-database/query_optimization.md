# Query Optimization — Drift

This document covers all non-trivial queries in the codebase, analyzes their current performance characteristics, identifies problems, and provides optimized rewrites.

---

## Query Inventory

| Query | File | Access Pattern | Current Issue |
|---|---|---|---|
| `list({ month })` | expenses.js:4 | Timeline + optional month filter | `substr()` defeats index |
| `summaryByCategory()` | expenses.js:133 | Aggregate per category per month | Missing composite index; `substr()` |
| `monthlyTrend()` | expenses.js:148 | Group by month over N months | `substr()` in GROUP BY |
| `streakDays()` | expenses.js:160 | Rolling 60-day per-day totals | Acceptable; small range |
| `trackedItems()` | items.js:12 | Group + N+1 history subqueries | N+1 query problem |
| `priceHistory()` | items.js:58 | Full history for one product | Acceptable |
| `consumption()` | items.js:69 | Group by time bucket | `substr()` in GROUP BY |
| `stats()` | items.js:92 | Aggregate for one product | Acceptable |
| `sameQtyHistory()` | items.js:106 | Range scan on canonical_qty | Acceptable |
| `suggest()` | items.js:123 | Prefix LIKE + correlated subqueries | 3 correlated subqueries per row |
| `netWorth()` | accounts.js:31 | CASE SUM aggregate | Acceptable (small table) |
| `trips.listWithCategories()` | trips.js:13 | N+1 category fetches per trip | N+1 for trips |

---

## Optimized Rewrites

### 1. `expenses.list({ month })` — Fix substr predicate

**Current (index-defeating):**
```sql
WHERE substr(e.expense_date, 1, 7) = ?     -- ? = '2025-05'
```

**Optimized:**
```sql
-- In the JS layer, compute range from month string:
-- const [y, m] = month.split('-');
-- const start = `${y}-${m}-01`;
-- const end   = new Date(y, m, 1).toISOString().slice(0, 10); // first day of next month

WHERE e.expense_date >= ? AND e.expense_date < ?
```

This allows `idx_expenses_date` to be used as a range scan. SQLite can seek directly to `expense_date >= '2025-05-01'` and stop at `< '2025-06-01'` without scanning the full table.

**JS helper:**
```js
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end   = `${String(nextY).padStart(4,'0')}-${String(nextM).padStart(2,'0')}-01`;
  return { start, end };
}
```

---

### 2. `summaryByCategory()` — Fix composite index + predicate

**Current:**
```sql
SELECT c.id, c.name, c.emoji, c.color, c.budget,
       COALESCE(SUM(e.amount), 0) AS spent
FROM categories c
LEFT JOIN expenses e
       ON e.category_id = c.id
      AND substr(e.expense_date, 1, 7) = ?
GROUP BY c.id
ORDER BY c.sort_order, c.id
```

Problems:
- `substr()` on indexed column defeats `idx_expenses_category`
- No composite index covering `(category_id, expense_date)` together

**Optimized:**
```sql
-- Requires: CREATE INDEX idx_expenses_cat_date ON expenses(category_id, expense_date DESC)
--           WHERE deleted_at IS NULL;

SELECT c.id, c.name, c.emoji, c.color, c.budget,
       COALESCE(SUM(e.amount), 0) AS spent
FROM categories c
LEFT JOIN expenses e
       ON e.category_id = c.id
      AND e.expense_date >= ?           -- '2025-05-01'
      AND e.expense_date < ?            -- '2025-06-01'
      AND e.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.sort_order, c.id
```

The composite index `(category_id, expense_date DESC)` now covers both the JOIN condition and the date range, allowing a bounded index range scan per category rather than a full-category fetch with post-filtering.

---

### 3. `monthlyTrend()` — Fix substr in GROUP BY + SELECT

**Current:**
```sql
SELECT substr(expense_date, 1, 7) AS month_key,
       SUM(amount) AS total
FROM expenses
WHERE date(expense_date) >= date('now', '-' || ? || ' months')
GROUP BY month_key
ORDER BY month_key
```

Problems:
- `date(expense_date)` wraps the indexed column, defeating `idx_expenses_date`
- `substr(expense_date, 1, 7)` in GROUP BY is fine (it's not in WHERE), but the WHERE predicate is not index-usable

**Optimized:**
```sql
-- Precompute the cutoff date in JS: 
-- const since = new Date(); since.setMonth(since.getMonth() - months);
-- const sinceStr = since.toISOString().slice(0, 10);  // '2024-11-17'

SELECT substr(expense_date, 1, 7) AS month_key,
       SUM(amount) AS total
FROM expenses
WHERE expense_date >= ?           -- sinceStr (literal, no function wrapping)
  AND deleted_at IS NULL
GROUP BY month_key
ORDER BY month_key
```

The literal comparison `expense_date >= '2024-11-17'` is index-sargable. SQLite can seek to the first matching row in `idx_expenses_date` and scan forward, reading only rows from the last N months.

---

### 4. `items.trackedItems()` — Eliminate N+1

**Current pattern:**
```js
const rows = await all(`SELECT ... GROUP BY normalized_name`);   // 1 query
for (const r of rows) {
  const hist = await all(
    `SELECT ... WHERE normalized_name = ? LIMIT 8`, [r.normalized_name]
  );  // N queries — one per tracked item
  r.spark = hist.map(h => h.unit_price);
}
```

**Optimized — use a window function (SQLite 3.25+ supports these):**

SQLite 3.25+ (included in modern Expo SDK) supports `ROW_NUMBER()` and `RANK()` window functions. We can retrieve the last 8 price points for all items in a single query using a CTE:

```sql
WITH ranked AS (
  SELECT
    normalized_name,
    name,
    kind,
    unit_price,
    qty,
    unit,
    canonical_unit,
    purchase_date,
    ROW_NUMBER() OVER (
      PARTITION BY normalized_name
      ORDER BY purchase_date DESC, id DESC
    ) AS rn
  FROM receipt_items
  WHERE deleted_at IS NULL
),
summary AS (
  SELECT
    normalized_name,
    MAX(name)            AS display_name,
    MAX(kind)            AS kind,
    MAX(canonical_unit)  AS canonical_unit,
    COUNT(*)             AS points_count
  FROM receipt_items
  WHERE deleted_at IS NULL
  GROUP BY normalized_name
)
SELECT
  s.*,
  r.unit_price,
  r.qty,
  r.unit,
  r.purchase_date,
  r.rn
FROM summary s
JOIN ranked r ON r.normalized_name = s.normalized_name
WHERE r.rn <= 8
ORDER BY s.normalized_name, r.rn
```

Then reassemble in JavaScript:
```js
const rows = await all(cteSql, params);
const map = new Map();
for (const r of rows) {
  if (!map.has(r.normalized_name)) {
    map.set(r.normalized_name, { ...r, spark: [] });
  }
  map.get(r.normalized_name).spark.push(r.unit_price);
}
return [...map.values()].map(item => ({
  ...item,
  last_unit_price: item.spark[0] ?? 0,
  prev_unit_price: item.spark[1] ?? null,
  change_pct: item.spark[1] && item.spark[1] > 0
    ? ((item.spark[0] - item.spark[1]) / item.spark[1]) * 100
    : null,
}));
```

This reduces N+1 to exactly **2 queries** (one for summary counts, one for ranked history), or **1 query** with a well-structured CTE.

---

### 5. `items.suggest()` — Eliminate Correlated Subqueries

**Current:**
```sql
SELECT
  normalized_name,
  MAX(name) AS display_name,
  (SELECT unit       FROM receipt_items r2 WHERE r2.normalized_name = r.normalized_name ORDER BY r2.purchase_date DESC, r2.id DESC LIMIT 1) AS last_unit,
  (SELECT unit_price FROM receipt_items r2 WHERE r2.normalized_name = r.normalized_name ORDER BY r2.purchase_date DESC, r2.id DESC LIMIT 1) AS last_unit_price,
  (SELECT canonical_unit FROM receipt_items r2 WHERE r2.normalized_name = r.normalized_name ORDER BY r2.purchase_date DESC, r2.id DESC LIMIT 1) AS last_canonical_unit,
  MAX(purchase_date) AS last_seen
FROM receipt_items r
WHERE normalized_name LIKE ?
GROUP BY normalized_name
ORDER BY last_seen DESC
LIMIT ?
```

Three correlated subqueries per row = 3N index lookups.

**Optimized — use FIRST_VALUE window function:**

```sql
WITH latest AS (
  SELECT
    normalized_name,
    MAX(name) AS display_name,
    MAX(kind) AS kind,
    MAX(purchase_date) AS last_seen,
    FIRST_VALUE(unit)          OVER w AS last_unit,
    FIRST_VALUE(unit_price)    OVER w AS last_unit_price,
    FIRST_VALUE(canonical_unit) OVER w AS last_canonical_unit,
    ROW_NUMBER()               OVER w AS rn
  FROM receipt_items
  WHERE normalized_name LIKE ?
  WINDOW w AS (PARTITION BY normalized_name ORDER BY purchase_date DESC, id DESC)
)
SELECT normalized_name, display_name, kind, last_seen,
       last_unit, last_unit_price, last_canonical_unit
FROM latest
WHERE rn = 1
  AND normalized_name LIKE ?
ORDER BY last_seen DESC
LIMIT ?
```

This resolves all three "last" values in a single pass over the partition window with no correlated subqueries.

---

### 6. `trips.listWithCategories()` — Eliminate N+1

**Current:**
```js
const list = await this.list();              // 1 query
for (const t of list) {
  t.categories = await all(
    'SELECT * FROM trip_categories WHERE trip_id = ? ORDER BY id', [t.id]
  );  // N queries
}
```

**Optimized — single LEFT JOIN:**
```sql
SELECT
  t.*,
  tc.id     AS tc_id,
  tc.label  AS tc_label,
  tc.emoji  AS tc_emoji,
  tc.amount AS tc_amount
FROM trips t
LEFT JOIN trip_categories tc ON tc.trip_id = t.id
ORDER BY t.start_date IS NULL, t.start_date, t.id, tc.id
```

Then reassemble in JavaScript:
```js
const rows = await all(sql);
const tripsMap = new Map();
for (const r of rows) {
  if (!tripsMap.has(r.id)) {
    tripsMap.set(r.id, { ...extractTripFields(r), categories: [] });
  }
  if (r.tc_id) {
    tripsMap.get(r.id).categories.push({
      id: r.tc_id, label: r.tc_label, emoji: r.tc_emoji, amount: r.tc_amount
    });
  }
}
return [...tripsMap.values()];
```

---

### 7. `useAppState` Global Reload — Replace with Targeted Refreshes

**Current pattern:**
```js
const addExpense = useCallback(async (data) => {
  await expRepo.create(data);
  setExpenses(await expRepo.list({ limit: 500 }));  // full reload every time
}, []);
```

**Problem:** For a user with 1,000 expenses this fetches 500 rows (silently truncating the rest), processes the JOIN for all of them, and pushes the result into React state — on every single add, update, or delete.

**Better pattern — optimistic + targeted update:**

For adds (most common):
```js
const addExpense = useCallback(async (data) => {
  const created = await expRepo.create(data);
  setExpenses(prev => [created, ...prev].slice(0, 500));  // prepend + trim
}, []);
```

For updates:
```js
const updateExpense = useCallback(async (id, patch) => {
  const updated = await expRepo.update(id, patch);
  setExpenses(prev => prev.map(e => e.id === id ? updated : e));
}, []);
```

For deletes:
```js
const removeExpense = useCallback(async (id) => {
  await expRepo.remove(id);
  setExpenses(prev => prev.filter(e => e.id !== id));
}, []);
```

This eliminates the DB round-trip for list refresh entirely on the common paths. Only `refresh()` (full reload, called on app boot and explicit pull-to-refresh) needs the full query.

---

### 8. `streakDays()` — Minor Optimization

**Current:** Fetches 60 days of per-day aggregates, then iterates in JS to compute streak.

```sql
SELECT expense_date AS d, SUM(amount) AS total
FROM expenses
WHERE date(expense_date) >= date('now', '-60 days')
GROUP BY expense_date
ORDER BY expense_date DESC
```

The `date()` wrapper on `expense_date` defeats the index. This query will full-scan the expenses table and post-filter.

**Optimized:**
```sql
-- Compute cutoff in JS: const since = new Date(); since.setDate(since.getDate()-60); since.toISOString().slice(0,10)

SELECT expense_date AS d, SUM(amount) AS total
FROM expenses
WHERE expense_date >= ?          -- literal cutoff date
  AND deleted_at IS NULL
GROUP BY expense_date
ORDER BY expense_date DESC
```

---

## Aggregation Strategy

For features requiring long-range aggregations (monthly totals, yearly inflation, multi-year category trends), precomputed summary tables will eventually outperform on-the-fly aggregation:

```sql
-- Monthly spend summary (updated after each expense write)
CREATE TABLE monthly_summaries (
  year_month   TEXT NOT NULL,    -- 'YYYY-MM'
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  total        REAL NOT NULL DEFAULT 0,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year_month, category_id)
);

-- Triggered or updated explicitly after each expense insert/update/delete
```

**When to introduce:** When `monthlyTrend()` or `summaryByCategory()` is called for multi-year date ranges (24+ months), or when the total expense count exceeds ~5,000 rows.

**Until then:** The optimized range-predicate queries above are sufficient.

---

## Query EXPLAIN Checklist

Before shipping any new query, verify with:

```sql
EXPLAIN QUERY PLAN
SELECT ...
```

Look for:
- `SCAN TABLE expenses` (bad — missing index or function-wrapped column)
- `SEARCH TABLE expenses USING INDEX idx_... (expense_date>? AND expense_date<?)` (good — index range scan)
- `USE TEMP B-TREE FOR ORDER BY` (bad — sort not covered by index)
- `SCAN TABLE ... USING COVERING INDEX` (good — all needed columns in the index)

In the app, you can run EXPLAIN during development:
```js
const plan = await all('EXPLAIN QUERY PLAN ' + yourSql, params);
console.table(plan);
```

---

## Performance Targets (Mobile SQLite)

| Query type | Target latency | When exceeded |
|---|---|---|
| Single row by PK | < 1 ms | Never exceeded |
| Month expense list (< 100 rows) | < 5 ms | Index range scan required |
| Category summary (current month) | < 10 ms | Composite index required |
| Monthly trend (12 months) | < 20 ms | Range predicate required |
| trackedItems() (< 500 items) | < 50 ms | CTE/window approach required |
| suggest() autocomplete | < 20 ms | Window function approach required |
| Full app boot (all tables) | < 200 ms | Targeted loads, not 500-row bulk |
