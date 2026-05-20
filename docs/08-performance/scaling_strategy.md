# Drift — Scaling Strategy

**Date:** 2026-05-17
**Pairs with:** `performance_audit.md`, `optimization_plan.md`

This document describes the *target* architecture once the optimization plan is complete. It is descriptive, not yet implemented.

---

## 1. Data access architecture

### 1.1 Replace the "global cache of all expenses" with bounded slices

The current store (`hooks/useAppState.js`) holds the most-recent 500 expenses and uses them as if they were the full dataset. Target shape:

- Context keeps only **small, always-needed** entities: `profile`, `settings`, `categories`, `subs`, `goals`, `accounts`, `trips` (each capped or in the low hundreds).
- **Expenses, receipt_items, and per-screen analytics are fetched on demand** by the screen that needs them, paginated, with a `staleTime` cache (see §2).
- `summary` (the monthly per-category rollup used by Home & Trends) is computed by **SQL** (`expenses.summaryByCategory`) and cached in memory for the current month, invalidated on any expense mutation that affects the current month.

### 1.2 Mutations no longer fan out to "refresh everything"

Today: `addExpense` → `setExpenses(await expRepo.list({limit:500}))` → every screen re-renders.

Target: mutation returns the affected row. The store applies an **optimistic patch** to in-memory caches and emits a per-table invalidation signal. Screens that subscribed to the affected table refetch their paginated window; everyone else is untouched.

Concretely (no new dependency required), wrap state in a tiny event-bus pattern:

```
const events = new EventTarget();
emit('expenses:mutated', { id, monthKey })
useExpensesPage({ filter }) → subscribes, refetches on matching events
```

Or adopt `@tanstack/react-query` (one dep, ~13 KB gzipped) to get `staleTime`, `queryKey`-based invalidation, focus refetch, and cancellation for free.

### 1.3 Pagination contracts

Every list repo grows a cursor-based form:

```js
expenses.page({ before: cursor, limit: 50, categoryId, month })
   → { rows, nextCursor }
```

Cursor is `(expense_date, id)` tuple, enabling key-set pagination (no `OFFSET`, which is O(N) in SQLite). Same shape for `receipt_items.priceHistoryPage`.

### 1.4 Background jobs

Drift is an offline-first single-process app — there is no server. "Background" means **deferred** work outside the render path. Use:

- **Boot warmup:** after `getDB()`, schedule `InteractionManager.runAfterInteractions(() => warmupCaches())` — pre-materialize current-month summary, top-5 categories, monthly trend.
- **Post-write coalescing:** writes within 250 ms are batched; a single transaction commits them. Already partially true for `createWithItems`; extend to category/account batch edits.
- **Maintenance job (idle/once-per-day):** `VACUUM` if `freelist_count > threshold`, `ANALYZE` after every 1000 mutations, GC orphan receipt images, rebuild monthly_summary if drift detected.
- **OCR pipeline:** move `parseReceipt` into a worker. React Native has no Web Workers, but the parser is pure JS and can be wrapped in `setImmediate` chunks (parse N lines at a time, yield to the UI). Long-term: rewrite the hot regex loop as a native module (TurboModule) if profiling shows the parser remains the bottleneck.

---

## 2. Caching architecture

Three layers, each with a clearly defined lifetime.

### Layer A — SQL-level (page cache + mmap)

PRAGMAs set once on DB open:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA temp_store   = MEMORY;
PRAGMA cache_size   = -20000;   -- 20 MB page cache (negative = KiB)
PRAGMA mmap_size    = 268435456; -- 256 MB mmap window
PRAGMA foreign_keys = ON;
PRAGMA wal_autocheckpoint = 1000;
```

Effect: writes commit in ~1 ms instead of ~10 ms; aggregations stream through memory; reads no longer block writes.

### Layer B — Materialized rollups (in-DB)

Two small tables maintained by triggers:

```sql
CREATE TABLE monthly_summary (
  month_key    TEXT NOT NULL,           -- 'YYYY-MM'
  category_id  INTEGER,
  total        REAL NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (month_key, category_id)
);

CREATE TABLE item_summary (
  normalized_name TEXT PRIMARY KEY,
  last_seen       TEXT NOT NULL,
  last_unit_price REAL,
  prev_unit_price REAL,
  buys_count      INTEGER NOT NULL,
  total_qty_30d   REAL NOT NULL,
  total_qty_all   REAL NOT NULL,
  kind            TEXT,
  canonical_unit  TEXT
);
```

`monthly_summary` is updated by triggers on `expenses` (AFTER INSERT/UPDATE/DELETE). `item_summary` is refreshed by the same transaction that writes `receipt_items`. Both can be rebuilt from scratch with a single SQL statement, so a corruption-recovery path is cheap (`/optimization_plan.md` step F).

This is what kills the N+1 in `trackedItems`: instead of 1k subqueries it becomes one indexed read of `item_summary`.

### Layer C — In-memory app cache

A small `Map<queryKey, { data, fetchedAt, monthKey? }>` keyed by `(repo, method, args)`:

- `staleTime` per key:
  - profile/settings: ∞ (mutation-invalidated only).
  - categories: ∞ (mutation-invalidated only).
  - `summaryByCategory(thisMonth)`: 30 s after last write; invalidated by any same-month expense mutation.
  - `monthlyTrend(6)`: 60 s; invalidated by any expense mutation.
  - `trackedItems`: 30 s; invalidated by `receipt_items` mutations.
  - `priceHistory(name)`: 60 s; invalidated only when that `normalized_name` is touched.
  - `expenses.page`: 10 s; invalidated by any expense mutation.
- `cacheTime` (kept after staleness): 5 min, then GC'd.
- Bounded total entries (LRU, ~64 keys) so the cache itself can't grow unbounded.

This can be the bus from §1.2, or `@tanstack/react-query`. Either works.

### Cache invariants

- Every write path emits one invalidation tag (e.g. `'expense'`, `'expense:2026-05'`, `'item:tomato'`).
- Layer-C entries declare which tags they listen to.
- Layer-B is invariant under correct trigger maintenance; only the daily-maintenance job verifies it (see §1.4).

---

## 3. Indexing architecture

The schema needs both the **right indexes** and a **generated column** so `substr(expense_date,1,7)` can be indexed without changing call sites.

### 3.1 Generated columns

```sql
ALTER TABLE expenses
  ADD COLUMN month_key TEXT
  GENERATED ALWAYS AS (substr(expense_date, 1, 7)) STORED;

ALTER TABLE receipt_items
  ADD COLUMN month_key TEXT
  GENERATED ALWAYS AS (substr(purchase_date, 1, 7)) STORED;
```

(SQLite supports `GENERATED ALWAYS AS … STORED` since 3.31. Expo SDK 54 ships SQLite ≥ 3.45, so this is safe.)

### 3.2 Target index set

```sql
-- expenses
CREATE INDEX idx_exp_date_id     ON expenses(expense_date DESC, id DESC);
CREATE INDEX idx_exp_cat_date    ON expenses(category_id, expense_date DESC);
CREATE INDEX idx_exp_month       ON expenses(month_key);
CREATE INDEX idx_exp_month_cat   ON expenses(month_key, category_id);
CREATE INDEX idx_exp_recurring   ON expenses(recurring) WHERE recurring = 1; -- partial

-- receipt_items
CREATE INDEX idx_items_expense   ON receipt_items(expense_id);          -- missing today; cascade-delete needs it
CREATE INDEX idx_items_name_date ON receipt_items(normalized_name, purchase_date DESC, id DESC);
CREATE INDEX idx_items_kind_date ON receipt_items(kind, purchase_date DESC);
CREATE INDEX idx_items_month     ON receipt_items(month_key);

-- monthly_summary, item_summary indexes
CREATE INDEX idx_summary_month   ON monthly_summary(month_key);
CREATE INDEX idx_item_summary_last ON item_summary(last_seen DESC);
```

### 3.3 Full-text search

```sql
CREATE VIRTUAL TABLE expense_fts USING fts5(
  merchant, notes, content='expenses', content_rowid='id'
);
-- INSERT/UPDATE/DELETE triggers to keep it in sync

CREATE VIRTUAL TABLE item_fts USING fts5(
  name, normalized_name, content='receipt_items', content_rowid='id'
);
```

Powers a real Drift search bar over merchants, notes, and item names. ~5% disk overhead, sub-10 ms lookups at 1M rows.

### 3.4 Index hygiene

- `ANALYZE` automatically after every 1000 mutations (use `PRAGMA analysis_limit=400` to bound cost).
- `PRAGMA optimize` on app close.
- After each schema bump, validate every query of interest with `EXPLAIN QUERY PLAN` — fail the migration test if any new "SCAN TABLE" appears on a query in the hot path.

---

## 4. Image strategy

The single largest scaling lever. Target: **< 1 MB of storage per receipt** on average, with cleanup guarantees.

### 4.1 Storage layout

```
${FileSystem.documentDirectory}drift/
  receipts/
    full/  yyyy/mm/<uuid>.webp     # compressed full-res, ~400–800 KB
    thumb/ yyyy/mm/<uuid>.webp     # 320 px wide, ~30–60 KB
```

- Always **copy** the picked/captured image into app storage before persisting the URI. Never store `content://` URIs (gallery) or `cacheDirectory` paths (volatile).
- Generate the thumbnail at copy time using `expo-image-manipulator` (resize to 1600 px max long edge for "full", 320 px for "thumb", quality 0.7, WebP format if available else JPEG).
- Strip EXIF on copy.

### 4.2 Schema additions

```sql
ALTER TABLE expenses ADD COLUMN receipt_path  TEXT; -- relative path under documentDirectory
ALTER TABLE expenses ADD COLUMN receipt_thumb TEXT;
ALTER TABLE expenses ADD COLUMN receipt_bytes INTEGER;
ALTER TABLE expenses ADD COLUMN receipt_hash  TEXT; -- sha-1 of full image, for dedup
```

`receipt_uri` stays as a legacy column during migration; reads prefer the new fields.

### 4.3 Lifecycle

- `ON DELETE` of an expense: queue the underlying paths for unlink in the next maintenance job (deferred so deletion stays atomic & fast).
- Maintenance job also scans `receipts/` and unlinks anything not referenced in `expenses.receipt_path|receipt_thumb`.
- Optional retention policy: "delete receipt images older than N years" — opt-in, exposed in Settings.

### 4.4 Display

- **`expo-image`** instead of `<Image>`: memory-cached, disk-cached, faster decoding, supports `placeholder`/`recyclingKey`.
- Receipt thumbnails in lists; full-res only when the user opens Detail and zooms.
- Always set explicit width/height; never let `<Image>` decode at intrinsic size.

### 4.5 OCR pipeline

- Resize-to-1600 px happens **before** OCR — speeds ML Kit by ~2× without measurable accuracy loss for printed receipts.
- Two-stage parse:
  1. ML Kit (native, async, off the JS thread already).
  2. `parseReceipt` runs in chunks (`setImmediate` between phases: header → items → footer → confidence). UI gets `'scanning' → 'parsing 30%' → …` instead of one frozen stage.
- Cancellable: store the latest scan request id in a ref, drop stale results.

### 4.6 Disk budget

- 5000 receipts × (800 KB full + 50 KB thumb) ≈ **4.25 GB**, vs. ~20 GB today — a 5× reduction.
- Settings shows total receipt storage and offers a "compress originals further" / "delete pre-202X originals" lever once the user crosses, say, 2 GB.

---

## 5. Analytics optimization

### 5.1 Move every aggregation to SQL on the rollup tables

Hot screens and the queries they should issue:

| Screen | Today | Target |
|---|---|---|
| Home — pots | JS reducer over 500-row slice | `SELECT * FROM monthly_summary WHERE month_key = ?` |
| Home — streak | 60-day fetch + JS loop | Same, but cached in Layer C for 60 s |
| Home — top mover | `trackedItems({kind:'produce'})` N+1 | `SELECT … FROM item_summary WHERE kind='produce' ORDER BY ABS(change_pct) DESC LIMIT 1` |
| Trends — monthly trend | `substr` aggregation, table scan | `SELECT month_key, SUM(total) FROM monthly_summary GROUP BY month_key ORDER BY month_key DESC LIMIT 6` |
| Trends — by category | JS reducer | `monthly_summary` indexed read |
| Items — tracked items | N+1 over distinct names | `SELECT … FROM item_summary ORDER BY last_seen DESC LIMIT 50` |
| ItemTrend — history | full scan of normalized_name | indexed `(normalized_name, purchase_date DESC, id DESC)`, **paged** |
| ItemTrend — consumption | `substr` group-by on every open | Layer-C cached 60 s, indexed on `month_key` |

### 5.2 Pre-aggregate, don't post-aggregate

Anything visible on Home or the first paint of Trends must come from a single indexed read of a rollup table, not from `GROUP BY` over the base table. Base-table queries are reserved for drill-downs (PotDetail, ItemTrend) where the dataset is already narrow.

### 5.3 Time-range strategy

For "last N months" / "last N years":

- `monthly_summary` is the source of truth for months ≥ 12.
- For the *current* month, query base table (because the rollup lags within-month writes by one trigger). Combine the two in JS — cheap.
- Year buckets are derived from monthly_summary at query time (`GROUP BY substr(month_key, 1, 4)`); no separate yearly table needed unless > 30 years.

### 5.4 Chart data sampling

Once a chart needs > 100 buckets, downsample server-side (LTTB or simple stride). All charts currently cap at 12 buckets, so this only kicks in for future "all-time" views.

---

## 6. Backup & data integrity

Local-first means *the user's device is the only copy* unless we build otherwise. Recommended layers:

1. **One-tap export** (Settings → Export): zips `drift.db` + `receipts/` into a single `.driftbackup` file, shareable via `expo-sharing`. Encrypted with a user-set passphrase (AES-GCM via `expo-crypto`).
2. **Restore** path that imports a `.driftbackup`, verifies schema_version compatibility, and atomically swaps DBs.
3. **Optional cloud sync** (later): not part of this audit, but the design above keeps the DB + image blobs cleanly separable so any object-storage backend works.
4. **DB integrity check** on each launch via `PRAGMA quick_check` (fast). If it fails, surface a recovery flow rather than crashing.

---

## 7. Observability hooks

The audit was possible only by reading code. Add lightweight runtime telemetry so future audits are data-driven:

- A dev-only timing helper around every repo method that logs queries > 50 ms with the SQL + params.
- A `__DEV__`-gated React Profiler wrapper on the four heaviest screens (Home, Trends, AllExpenses, Items).
- Persist `db_stats` in the DB itself: row counts per table, image bytes, last vacuum date — surface in a hidden "Diagnostics" screen.

None of this ships to users; it's the tooling that makes the next round of optimization data-driven.
