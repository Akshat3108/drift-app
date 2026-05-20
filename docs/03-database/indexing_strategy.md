# Indexing Strategy — Drift

This document covers current indexes, their effectiveness, missing indexes, and a complete recommended index plan with rationale for each.

---

## Current Indexes

| Index | Table | Definition | Status |
|---|---|---|---|
| `idx_expenses_date` | expenses | `(expense_date DESC)` | Effective for timeline queries |
| `idx_expenses_category` | expenses | `(category_id)` | Partially effective — see P13 |
| `idx_items_name_date` | receipt_items | `(normalized_name, purchase_date)` | Effective for per-product history |
| `idx_items_kind_date` | receipt_items | `(kind, purchase_date)` | Effective for category browse |

---

## Effectiveness Analysis of Current Indexes

### `idx_expenses_date`

**Query:** `ORDER BY expense_date DESC LIMIT ? OFFSET ?`  
**Verdict:** Effective. The index allows the default timeline query to avoid a full-table sort. DESC ordering matches the index direction.

**Partial problem:** The `list({ month })` filter uses:
```sql
WHERE substr(e.expense_date, 1, 7) = '2025-05'
```
Applying `substr()` to the indexed column defeats the index entirely — SQLite cannot use it for this predicate. The index is still used for the ORDER BY but not the WHERE.

**Fix:** Replace with range predicate:
```sql
WHERE e.expense_date >= '2025-05-01' AND e.expense_date < '2025-06-01'
```

---

### `idx_expenses_category`

**Query:** `summaryByCategory()` joins `expenses ON e.category_id = c.id AND substr(e.expense_date, 1, 7) = ?`  
**Verdict:** Partially effective. The index covers the `category_id` equality but the `expense_date` filter requires post-filtering all rows in the category. For a user with 3 years of "Food & Drink" expenses, this reads ~1,000+ rows to find the ~30 from the current month.

**Fix:** Replace with a composite index `(category_id, expense_date)` and use range predicates.

---

### `idx_items_name_date`

**Query:** `WHERE normalized_name = ? ORDER BY purchase_date ASC`  
**Verdict:** Effective. This is the primary price history query and the index directly covers both the equality and the sort.

---

### `idx_items_kind_date`

**Query:** `WHERE kind = ? ... ORDER BY MAX(purchase_date) DESC`  
**Verdict:** Partially effective. The outer `GROUP BY normalized_name` query in `trackedItems()` does not filter by `kind` in the main query — it's applied as `WHERE kind = ?` optionally. The index helps when filtering, but the `GROUP BY` aggregation still requires scanning all matching rows.

---

## Missing Indexes

### M1 — Composite `(category_id, expense_date)` on `expenses`

**Replaces:** `idx_expenses_category`

```sql
CREATE INDEX idx_expenses_cat_date ON expenses(category_id, expense_date DESC)
  WHERE deleted_at IS NULL;
```

**Why:** `summaryByCategory()` filters by both `category_id` (equality) and `expense_date` (month range). A composite index allows SQLite to use an index range scan that is bounded by both conditions, dramatically reducing rows read for monthly reports.

**Impact:** High. Used on every Home screen load, Trends screen load, and PotDetail screen.

---

### M2 — `expenses(merchant_id, expense_date DESC)`

```sql
CREATE INDEX idx_expenses_merchant ON expenses(merchant_id, expense_date DESC);
```

**Why:** Merchant analytics (top merchants, per-merchant trend, merchant compare) require grouping by merchant. Without an index, every merchant aggregation is a full table scan sorted in memory.

**Impact:** High for analytics features. Low currently (merchant queries not yet implemented).

---

### M3 — `expenses(account_id, expense_date DESC)`

```sql
CREATE INDEX idx_expenses_account ON expenses(account_id, expense_date DESC)
  WHERE account_id IS NOT NULL;
```

**Why:** Account ledger view (all expenses from a specific account sorted by date) requires this. The partial index (`WHERE account_id IS NOT NULL`) excludes uncategorized expenses and keeps the index small.

---

### M4 — `expenses(trip_id)` — Partial

```sql
CREATE INDEX idx_expenses_trip ON expenses(trip_id)
  WHERE trip_id IS NOT NULL;
```

**Why:** Querying all expenses for a trip is a common view operation. Without this index, every trip detail page does a full expenses scan. The partial index only covers rows that actually have a trip association.

---

### M5 — `subscriptions(next_bill)` — Partial

```sql
CREATE INDEX idx_subs_next_bill ON subscriptions(next_bill)
  WHERE cancelled = 0 AND next_bill IS NOT NULL;
```

**Why:** A "upcoming bills" feature needs to efficiently find subscriptions with `next_bill` between today and next N days. Without this, every such query scans all active subscriptions. The partial index excludes cancelled subs and NULL dates.

---

### M6 — `account_transactions(account_id, txn_date DESC)`

```sql
CREATE INDEX idx_acctxn_account_date ON account_transactions(account_id, txn_date DESC);
```

**Why:** The account ledger view will show transactions sorted by date per account. This is the primary access pattern for the new `account_transactions` table.

---

### M7 — `goal_contributions(goal_id, contributed_at DESC)`

```sql
CREATE INDEX idx_goal_contrib_goal ON goal_contributions(goal_id, contributed_at DESC);
```

**Why:** Goal contribution history timeline. Covers both the equality (which goal) and sort (latest first).

---

### M8 — `receipt_items(product_id, purchase_date DESC)` — Partial

```sql
CREATE INDEX idx_items_product ON receipt_items(product_id, purchase_date DESC)
  WHERE product_id IS NOT NULL;
```

**Why:** Once `product_id` FK is introduced, all product-level history queries should use the canonical product entity rather than `normalized_name`. This index covers those queries.

---

### M9 — `price_snapshots(product_id, snapshot_date DESC)`

```sql
CREATE INDEX idx_price_snap_product_date ON price_snapshots(product_id, snapshot_date DESC);
```

**Why:** Inflation analysis and per-product price chart queries will primarily filter by `product_id` and sort by date. This covers the most common access pattern.

---

### M10 — `merchants(canonical_name)` — Unique

```sql
CREATE UNIQUE INDEX idx_merchants_canonical ON merchants(canonical_name COLLATE NOCASE);
```

**Why:** Merchant lookup-or-create during expense entry needs fast deduplication. `COLLATE NOCASE` ensures "zepto" and "Zepto" map to the same merchant.

---

## Full Recommended Index Set

```sql
-- Expenses timeline (keep, fix substr problem)
CREATE INDEX idx_expenses_date
  ON expenses(expense_date DESC)
  WHERE deleted_at IS NULL;

-- Expenses by category + date (replace single-column idx_expenses_category)
CREATE INDEX idx_expenses_cat_date
  ON expenses(category_id, expense_date DESC)
  WHERE deleted_at IS NULL;

-- Expenses by merchant + date
CREATE INDEX idx_expenses_merchant
  ON expenses(merchant_id, expense_date DESC);

-- Expenses by account (partial: only linked expenses)
CREATE INDEX idx_expenses_account
  ON expenses(account_id, expense_date DESC)
  WHERE account_id IS NOT NULL;

-- Expenses linked to trips (partial)
CREATE INDEX idx_expenses_trip
  ON expenses(trip_id)
  WHERE trip_id IS NOT NULL;

-- Expenses linked to subscriptions (partial)
CREATE INDEX idx_expenses_sub
  ON expenses(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Receipt items: product history (partial: only linked items)
CREATE INDEX idx_items_product
  ON receipt_items(product_id, purchase_date DESC)
  WHERE product_id IS NOT NULL;

-- Receipt items: normalized name history (existing, keep)
CREATE INDEX idx_items_name_date
  ON receipt_items(normalized_name, purchase_date)
  WHERE deleted_at IS NULL;

-- Receipt items: kind + date browse (existing, keep)
CREATE INDEX idx_items_kind_date
  ON receipt_items(kind, purchase_date)
  WHERE deleted_at IS NULL;

-- Subscriptions: upcoming billing
CREATE INDEX idx_subs_next_bill
  ON subscriptions(next_bill)
  WHERE cancelled = 0 AND next_bill IS NOT NULL;

-- Account transactions: per-account ledger
CREATE INDEX idx_acctxn_account_date
  ON account_transactions(account_id, txn_date DESC);

-- Goal contributions: per-goal timeline
CREATE INDEX idx_goal_contrib_goal
  ON goal_contributions(goal_id, contributed_at DESC);

-- Price snapshots: per-product history
CREATE INDEX idx_price_snap_product_date
  ON price_snapshots(product_id, snapshot_date DESC);

-- Merchants: canonical deduplication
CREATE UNIQUE INDEX idx_merchants_canonical
  ON merchants(canonical_name COLLATE NOCASE);

-- Products: normalized name lookup
CREATE UNIQUE INDEX idx_products_name
  ON products(normalized_name);
```

---

## FTS5 Virtual Tables

SQLite's FTS5 module provides full-text search with O(log n) lookup, ranking, prefix matching, and phrase search — all built into the SQLite binary included in expo-sqlite.

```sql
-- Merchant full-text search (content table = expenses, but merchant text is denormalized here)
CREATE VIRTUAL TABLE expenses_fts USING fts5(
  merchant_text,
  content='expenses',
  content_rowid='id'
);

-- Product name search (enables "milk" to match "whole milk", "oat milk", etc.)
CREATE VIRTUAL TABLE products_fts USING fts5(
  display_name,
  brand,
  content='products',
  content_rowid='id'
);
```

**Keeping FTS in sync:** Use triggers or explicit updates at write time:

```sql
-- After inserting a new product
INSERT INTO products_fts(rowid, display_name, brand) VALUES (new.id, new.display_name, new.brand);

-- After updating a product
INSERT INTO products_fts(products_fts, rowid, display_name, brand) VALUES ('delete', old.id, old.display_name, old.brand);
INSERT INTO products_fts(rowid, display_name, brand) VALUES (new.id, new.display_name, new.brand);
```

Or use the simpler `content=` mode (read-only FTS, content read from the base table on query).

---

## Index Size Estimate

For a typical 3-year user dataset:
- ~1,500 expense rows
- ~8,000 receipt_item rows
- ~200 unique products
- ~50 merchants

SQLite indexes for this dataset are in the 20–200 KB range — negligible on mobile storage. All queries will execute in under 5 ms even without indexes at this scale. Indexes matter at 10,000+ expenses and 50,000+ items, which is achievable after 5+ years of active use.

---

## Partial Index Strategy

Partial indexes (with `WHERE` clause) are used throughout because:
1. They exclude `deleted_at IS NOT NULL` rows from indexes, keeping indexes smaller.
2. They exclude NULLs (e.g., `WHERE trip_id IS NOT NULL`), so the index only covers rows that actually have the FK populated.
3. SQLite uses partial indexes when the query's WHERE clause logically implies the index's WHERE clause.
