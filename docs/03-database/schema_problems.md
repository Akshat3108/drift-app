# Schema Problems — Drift

This document catalogs all structural, relational, performance, and architectural problems found in the current schema. Issues are grouped by severity.

---

## Critical Problems

### P1 — No Migration System

**Affected files:** `schema.js`, `db/index.js`

The schema uses `CREATE TABLE IF NOT EXISTS` exclusively. Adding a new column, changing a constraint, or adding an index to an existing installation requires manually running `ALTER TABLE` statements — but there is no mechanism to do so. The app has no version number stored in the database, no migration runner, and no rollback capability.

**Consequence:** Any schema change in a future release will either silently fail on existing installs (column not added) or crash (if code references a column that doesn't exist yet). This is a shipping blocker for every future feature that touches the schema.

---

### P2 — `expenses.recurring` Is Orphaned

**Affected files:** `schema.js`, `expenses.js`

The `expenses` table has a `recurring INTEGER` boolean flag. The `subscriptions` table tracks recurring services. But there is no foreign key from `expenses` to `subscriptions`. The two systems are completely disconnected.

**Consequence:**
- No way to know which expense records represent subscription payments.
- No way to auto-generate an expense when a subscription's `next_bill` date arrives.
- No way to compute "actual vs. budgeted" for a subscription.
- The `recurring` flag has no semantic definition — it is set arbitrarily.

---

### P3 — `accounts` Are Not Linked to `expenses`

**Affected files:** `schema.js`, `accounts.js`, `expenses.js`

`accounts.balance` is a static snapshot value the user types in manually. There is no foreign key from `expenses` to `accounts` to record which account was debited/credited. Payments do not update balances.

**Consequence:**
- Net worth is permanently stale as soon as any transaction occurs.
- Cash flow analysis (income vs. outflow per account) is impossible.
- Account balance history does not exist.
- Double-entry bookkeeping is impossible.

---

### P4 — `trips` Are Not Linked to `expenses`

**Affected files:** `schema.js`, `trips.js`

`trip_categories.amount` is a manually entered value. There is no FK from `expenses` to `trips`. The app cannot determine which expense records belong to a trip.

**Consequence:**
- Trip actual spend cannot be computed from transactions — only from manual entry.
- Multi-currency trip expenses (tracked in dest currency) cannot be reconciled against home-currency totals.
- Per-merchant or per-category breakdowns for a trip are impossible.

---

### P5 — `goals.saved_amount` Has No Audit Trail

**Affected files:** `schema.js`, `goals.js`

`saved_amount` is a single REAL column updated in-place via `saved_amount = saved_amount + ?`. There is no `goal_contributions` table recording when each contribution was made.

**Consequence:**
- Deleting the goal deletes all contribution history.
- Cannot show a timeline of contributions.
- Cannot tie a contribution to an expense record ("moved ₹500 from Groceries savings to House goal").
- `saved_amount` can become negative or inconsistent with no validation.

---

## High-Severity Problems

### P6 — N+1 Query in `items.trackedItems()`

**Affected file:** `items.js:12–56`

```js
// Outer query returns N rows of tracked items
const rows = await all(`SELECT ... FROM receipt_items r GROUP BY normalized_name ...`);

// Then for each row, a separate query executes
for (const r of rows) {
  const hist = await all(
    `SELECT unit_price, qty, unit, purchase_date FROM receipt_items
     WHERE normalized_name = ? ORDER BY purchase_date DESC LIMIT 8`,
    [r.normalized_name]
  );
  // ... populate r.spark, r.last_unit_price, etc.
}
```

If there are 100 tracked items, this fires 101 queries sequentially. SQLite on mobile can handle this for small datasets, but it introduces latency that scales linearly with item count.

---

### P7 — Correlated Subqueries in `items.suggest()`

**Affected file:** `items.js:123–148`

The suggest query has three correlated subqueries per row:

```sql
SELECT
  (SELECT unit       FROM receipt_items r2 WHERE r2.normalized_name = r.normalized_name ORDER BY ... LIMIT 1) AS last_unit,
  (SELECT unit_price FROM receipt_items r2 WHERE r2.normalized_name = r.normalized_name ORDER BY ... LIMIT 1) AS last_unit_price,
  (SELECT canonical_unit FROM receipt_items r2 WHERE r2.normalized_name = r.normalized_name ORDER BY ... LIMIT 1) AS last_canonical_unit,
FROM receipt_items r WHERE normalized_name LIKE ?
GROUP BY normalized_name
```

With N matching items, this executes 3N+1 index lookups. For a user with 500 unique items, this is 1,500+ sub-lookups per keystroke in the search field.

---

### P8 — Global State Reloads 500 Rows on Every Mutation

**Affected file:** `useAppState.js:82–93`

Every mutation (add/update/remove expense) calls:

```js
setExpenses(await expRepo.list({ limit: 500 }));
```

This fetches 500 full rows — including JOIN to categories — from SQLite into JavaScript memory on every single write. On a device with 3 years of data (1,000+ expenses), the limit raises to produce a silent truncation or must be raised further, amplifying the problem.

---

### P9 — No Merchant Normalization

**Affected file:** `schema.js` (expenses.merchant)

`merchant` is a free-text column with no normalization, deduplication, or canonical entity. "Zepto", "zepto", "ZEPTO", "Zepto (Mumbai)" are four distinct merchants in the data.

**Consequence:**
- Per-merchant analytics are fragmented.
- Merchant autocomplete requires fuzzy matching that doesn't exist.
- Merchant-level inflation analysis is impossible.
- No merchant categorization intelligence.

---

### P10 — `trip_categories.amount` Cannot Exceed Trip Budget Without Warning

The schema has no constraint ensuring `SUM(trip_categories.amount) <= trips.budget`. Amounts can be over-allocated without any app feedback.

---

### P11 — `subscriptions.cancelled` Has No Timestamp

```sql
cancelled  INTEGER NOT NULL DEFAULT 0
```

No `cancelled_at TEXT` column. The date of cancellation is permanently lost. Subscription cost analysis (monthly cost at any past date) cannot be reconstructed.

---

### P12 — `categories.budget` Is Implicitly Monthly With No Period Field

The UI and all queries assume `budget` is a monthly figure (`substr(expense_date,1,7) = ?`). There is no `budget_period` column. Weekly budgeters, biweekly pay-cycle users, and annual budget planners cannot be supported without breaking the current implicit assumption.

---

## Medium-Severity Problems

### P13 — Missing Composite Index: `(category_id, expense_date)`

`summaryByCategory()` runs:

```sql
SELECT ... FROM categories c
LEFT JOIN expenses e ON e.category_id = c.id
  AND substr(e.expense_date, 1, 7) = ?
GROUP BY c.id
```

The existing `idx_expenses_category` index covers `category_id` but not the date filter. The database must fetch all rows for a category and then post-filter by month. A composite index `(category_id, expense_date)` would allow the date range to be filtered at the index level.

---

### P14 — Missing Index: `expenses.merchant`

Any merchant grouping or analytics query (e.g., "top merchants this month") performs a full scan of the expenses table. With growing datasets, this degrades.

---

### P15 — Missing Index: `subscriptions.next_bill`

A "upcoming bills this week" view would scan all subscriptions. An index on `next_bill` is needed for calendar-style billing notifications.

---

### P16 — `substr(expense_date, 1, 7)` Prevents Index Usage

Queries like:

```sql
WHERE substr(e.expense_date, 1, 7) = '2025-05'
```

Apply a function to the indexed column `expense_date`, which defeats the index. The correct form is a range:

```sql
WHERE e.expense_date >= '2025-05-01' AND e.expense_date < '2025-06-01'
```

This pattern appears in `summaryByCategory()`, `list({ month })`, and `monthlyTrend()`.

---

### P17 — `canonical_qty` / `canonical_unit` Are Computed at Write Time in App Code

The unit conversion logic in `ocr/units.js` runs in JavaScript before INSERT. If conversion factors are corrected (e.g., a unit alias bug fix), all historical rows retain the old calculated values. There is no way to recompute without a full re-scan.

---

### P18 — `receipt_items.purchase_date` Is Copied From `expenses.expense_date`

This is denormalized data. If an expense's `expense_date` is updated, `receipt_items.purchase_date` is NOT updated (the `update()` function in `expenses.js` does not propagate). The price history and consumption charts will show data on the wrong dates.

---

### P19 — `trips.dest_rate` Is a Single Static Rate

Multi-day trips span days with different exchange rates. The single `dest_rate` field collapses all rate variation. There is no `exchange_rate_history` table.

---

### P20 — No Full-Text Search

Item names use `LIKE ?%` prefix matching in `suggest()`. This cannot:
- Match mid-word (e.g., searching "milk" won't find "whole milk")
- Handle misspellings
- Support multi-language normalization

SQLite has a built-in FTS5 virtual table extension that would solve this.

---

### P21 — No Soft Delete

All deletes are hard (`DELETE FROM ...`). Deleted expenses, categories, and items are permanently gone. There is no `deleted_at` column or recycle bin.

---

## Low-Severity / Design Concerns

### P22 — `accounts.category` Is a Free-Text Grouping Label

The `category` field on accounts (bank/investment/property/etc.) is unvalidated free text. A closed enum would enable structured net worth breakdowns (liquid vs. illiquid assets, etc.).

---

### P23 — `goals.eta` Is Unformatted Text

The ETA field accepts any string. No date parsing is enforced. "2025", "December", "eventually", and `NULL` are all valid. Time-based goal projections require a proper `DATE` field.

---

### P24 — `settings` Cannot Support Multi-Currency Expenses

The app has one global currency setting. A user who shops in both INR and USD (e.g., international shopping) cannot record expenses in multiple currencies. Amounts are stored in a single `amount` REAL with no `currency` column on `expenses`.

---

### P25 — `receipt_items.kind` Is Not Constrained

`kind` defaults to `'other'` but there is no CHECK constraint. Any string is valid. The `trackedItems({ kind })` filter would silently return empty if a typo is introduced during OCR classification.

---

## Summary Table

| ID | Severity | Category | Description |
|---|---|---|---|
| P1 | Critical | Architecture | No migration system |
| P2 | Critical | Relationship | `recurring` flag not linked to subscriptions |
| P3 | Critical | Relationship | Accounts isolated from expenses |
| P4 | Critical | Relationship | Trips isolated from expenses |
| P5 | Critical | Integrity | Goals have no contribution log |
| P6 | High | Performance | N+1 queries in `trackedItems()` |
| P7 | High | Performance | Correlated subqueries in `suggest()` |
| P8 | High | Performance | Full 500-row reload on every mutation |
| P9 | High | Analytics | No merchant normalization |
| P10 | High | Integrity | Trip category over-allocation not prevented |
| P11 | High | Integrity | Subscription cancel date not stored |
| P12 | High | Feature | Budget period is implicit monthly only |
| P13 | Medium | Performance | Missing composite index on `(category_id, expense_date)` |
| P14 | Medium | Performance | Missing index on `expenses.merchant` |
| P15 | Medium | Performance | Missing index on `subscriptions.next_bill` |
| P16 | Medium | Performance | `substr()` defeats expense_date index |
| P17 | Medium | Integrity | Canonical unit values not recomputable |
| P18 | Medium | Integrity | `purchase_date` not updated on expense edit |
| P19 | Medium | Feature | Single exchange rate per trip |
| P20 | Medium | Feature | No full-text search |
| P21 | Medium | Feature | No soft delete / undo |
| P22 | Low | Design | `accounts.category` is unvalidated free text |
| P23 | Low | Design | `goals.eta` is unformatted string |
| P24 | Low | Feature | Single-currency constraint on expenses |
| P25 | Low | Integrity | `receipt_items.kind` unconstrained |
