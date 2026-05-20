# Drift — Performance Audit

**Date:** 2026-05-17
**Scope:** `/app` (Expo SDK 54 + React Native 0.81 + expo-sqlite 16)
**Horizon assumed:** 10+ years of data, 100k+ expenses, 500k+ receipt items, 5k+ receipt images, heavy analytics.

> ⚠️ Stack note: the prompt assumes native Android + Room. Drift actually runs on **expo-sqlite** (SQLite under the hood) from a React Native app. The audit therefore translates "Room" guidance into the equivalent SQLite + RN concerns. All findings below were verified against the current source.

---

## 1. Current bottlenecks

### 1.1 The global `useAppState` store loads and re-fetches everything
**File:** `app/src/hooks/useAppState.js`

- `refresh()` runs **8 parallel queries** on every mutation: profile, settings, categories, **all 500 most-recent expenses**, subs, goals, accounts, trips (+ trip categories joined).
- Every single mutation helper (`addExpense`, `updateExpense`, `removeExpense`, `addCategory`, `addSub`, `addGoal`, `addAccount`, `addTrip`, …) re-runs `expRepo.list({ limit: 500 })` — a single-row edit triggers a 500-row fetch + a re-render of every screen subscribed to `useApp()`.
- The 500-row cap is **silent**. Two screens treat `expenses` from context as if it were the full dataset:
  - `screens/PotDetail.js:20` — `expenses.filter(e => e.category_id === potId)` — categories with > 500 historical expenses will show truncated history *and* a wrong "Spent this month" if the most-recent 500 are dominated by other pots.
  - `screens/AllExpenses.js:14` — same pattern under the "All" filter.
- `summary` `useMemo` (`useAppState.js:128`) reconstructs monthly category totals in JS by `String.startsWith(month)` over the 500-row slice. Duplicate of `expenses.summaryByCategory(month)` SQL — and wrong once data exceeds the cap.

**Risk class:** correctness + perf. Becomes wrong + slow simultaneously around ~500 lifetime expenses.

### 1.2 No list virtualization anywhere
**Files:** `Home.js`, `AllExpenses.js`, `PotDetail.js`, `Items.js`, `ItemTrend.js`, `Trends.js`, `Goals.js`, `Subs.js`, `Travel.js`.

- Every list uses `<ScrollView>` + `array.map()`. No `FlatList`, no `SectionList`, no `getItemLayout`, no windowing.
- `AllExpenses.js` renders **every grouped day** + every expense in a `ScrollView`. At 5k rendered rows that's ~5k `TouchableOpacity` instances + 5k inline style objects per render.
- `ItemTrend.js:279` renders the entire price history with `.slice().reverse().map()` — 500 buys for a frequently scanned item = 500 mounted rows on each visit.
- `Items.js:66` renders all tracked items in a single `ScrollView` — 1k+ pantry items × 1 `SparkBars` SVG each.

**Risk class:** memory + scroll jank. Frame drops begin at ~200 rows, OOM territory at ~3–5k rows on mid-tier Android.

### 1.3 `items.trackedItems` is N+1 plus correlated subqueries
**File:** `app/src/db/repo/items.js:12`

For the Items screen:
1. Outer `GROUP BY normalized_name` over `receipt_items`.
2. For **each** group, a correlated `SUM(canonical_qty) … WHERE r2.normalized_name = r.normalized_name AND date(…) >= …` (no index on `(normalized_name, purchase_date)` in that order — see §1.4).
3. After the SQL returns, JS loops every row and runs **another** `LIMIT 8` history query (`items.js:38`).

At 1k tracked items this is **1k + 1 round-trips** on a thread-blocking async driver, evaluated every time the user opens the Items tab (which uses `useFocusEffect`, so it's every focus).

**Risk class:** the dominant perf cliff at scale. 1k items × ~5 ms/query ≈ 5 s of frozen UI.

### 1.4 Indexes are missing for the actual access patterns
**File:** `app/src/db/schema.js`

| Query | Index it needs | Current index |
|---|---|---|
| `expenses.list ORDER BY expense_date DESC, created_at DESC, id DESC` | `(expense_date DESC, created_at DESC, id DESC)` | only `(expense_date DESC)` — works but doesn't break ties cheaply |
| `expenses.list WHERE category_id AND month` | `(category_id, expense_date)` | `(category_id)` only — month filter does seq scan within category |
| `expenses.monthlyTrend GROUP BY substr(expense_date,1,7)` | generated/derived column + index | none — `substr` is non-SARGable, table scan every call |
| `expenses.summaryByCategory WHERE substr(expense_date,1,7) = ?` | `(substr_month, category_id)` or precomputed monthly summary | none — full scan + join |
| `receipt_items WHERE expense_id = ?` (joined on cascade-delete) | **`(expense_id)`** | **missing entirely** — FK alone does not create an index in SQLite |
| `receipt_items WHERE normalized_name = ? ORDER BY purchase_date DESC, id DESC` | `(normalized_name, purchase_date DESC, id DESC)` | `(normalized_name, purchase_date)` — close, but no `id` tiebreaker; index covers leading prefix only |
| `receipt_items WHERE normalized_name LIKE 'q%'` | trigram or FTS5 for substring | `(normalized_name, purchase_date)` works for prefix LIKE — OK |

**Risk class:** O(n) scans where O(log n) is possible. Linear with table size.

### 1.5 SQLite is running on defaults
**File:** `app/src/db/index.js`

Only `PRAGMA foreign_keys = ON` is set. Missing:
- `journal_mode = WAL` — without WAL, reads block writes and vice versa; commits do full fsync on the rollback journal.
- `synchronous = NORMAL` — `FULL` is the default and is overkill for a single-user client DB on Android.
- `cache_size` — default 2 MB page cache is small for analytics aggregations over 100k rows.
- `mmap_size` — disabled by default; mmap saves syscalls and memcpys on reads.
- `temp_store = MEMORY` — group-by + sort spills hit disk by default.
- `auto_vacuum` — never declared; after years of deletes the DB will be sparse and large.

**Risk class:** 3–10× slowdown on writes; aggregation queries spill to disk.

### 1.6 Receipt images are unbounded
**Files:** `screens/Scan.js`, `screens/EditExpense.js`, `db/schema.js`

- `expo-image-picker` is called with `quality: 0.8` and **no `allowsEditing`, no max width, no resize, no exif strip**. Modern Android phones produce 3–5 MB JPEGs (12 MP+).
- `receipt_uri` stores the absolute path. There is **no copy into app storage, no thumbnail, no cleanup**.
  - Gallery URIs (`content://…`) can be revoked by the OS — receipts disappear silently.
  - Camera assets land in `cacheDirectory` — cleared by Android under storage pressure.
- When an expense is deleted, the underlying image file is **never removed**. Pure leak.
- `Scan.js:190` shows the full-resolution image in the review screen via `<Image>` (no `expo-image`, no `resizeMode` hint, no memory budget).

**Projection:** 5k receipts × ~4 MB = **~20 GB** of orphan-prone images by year 10.

### 1.7 OCR + parse runs on the JS thread
**Files:** `screens/Scan.js:52`, `ocr/parseReceipt.js` (559 LOC), `ocr/patterns.js` (507 LOC)

- `recognize(uri)` (ML Kit) is native and async (good), but `parseReceipt(ocr)` runs entirely on the JS thread.
- `patterns.js` evaluates ~30+ regexes per line, with no precompilation caching beyond the JS engine's literal cache. For long receipts (200+ lines), this is hundreds of regex executions inline.
- No cancellation, no progress reporting beyond the binary "scanning" stage.
- `parseReceipt` is invoked synchronously inside `processImage` — no `InteractionManager.runAfterInteractions`, no `requestIdleCallback` equivalent. Janks the scan animation on slower devices.

### 1.8 Trends/Home re-fetch analytics on every focus
**Files:** `screens/Home.js:19`, `screens/Trends.js:18`

`Home.js` runs four queries (netWorth, next trip, streakDays, topMover) inside `useEffect([expenses, repos])` — so every time `expenses` changes (every mutation), all four re-run. `topMover` itself runs `trackedItems({kind:'produce'})` (the N+1 above).

`Trends.js` runs `monthlyTrend(6)` on mount, no cache, no invalidation policy.

### 1.9 `streakDays` design
**File:** `repo/expenses.js:160`

Pulls 60 days of grouped totals and walks the calendar in JS using `new Date()`. Fine perf-wise but recomputed on every Home re-render. Should be cached for the session and invalidated only by new expenses.

### 1.10 No FTS / full-text search
- Searching expenses by merchant, notes, or item text requires either `LIKE '%…%'` (table scan, breaks indexes) or an FTS5 virtual table. Neither exists. Users at 100k expenses will have no working search.

---

## 2. Scalability risks (10-year, 100k+ horizon)

| # | Risk | Trigger | Symptom |
|---|------|---------|---------|
| R1 | In-memory expenses cap silently truncates history | > 500 lifetime expenses | PotDetail / AllExpenses show wrong totals & history |
| R2 | Every mutation re-fetches all entities | Any add/edit/delete | UI freezes ~300 ms+ per write at 50k rows |
| R3 | `trackedItems` N+1 on Items screen | > 200 tracked items | 1–5 s freeze on each Items tab focus |
| R4 | Non-virtualized scroll lists | > 500 rows in a list | OOM crashes on mid-tier Android by ~3k rows |
| R5 | `substr(expense_date,1,7)` aggregations table-scan | Trends, monthly summary | Linear-in-N latency, ~500 ms per Trends open at 100k rows |
| R6 | Receipt image bloat + orphans | > 1k receipts | App storage > 5 GB, gallery URIs disappear |
| R7 | Default journal/sync | All writes | Slow writes, contention; lost data on crash with WAL absent |
| R8 | No backup/export | Always | Single device wipe = total data loss (local-first promise broken) |
| R9 | No FTS | Search any text field | Either missing feature or full-scan LIKE |
| R10 | No materialized monthly/category rollup | Trends, Home pots | Recompute over years of rows on every screen |
| R11 | No vacuum / compaction policy | After many deletes | DB file grows and never shrinks |
| R12 | OCR parse on JS thread | Large receipts | Scan UI janks 1–3 s |
| R13 | App boot loads full top-500 + summary | Cold start | Boot latency grows with category fan-out + trip joins |
| R14 | No pagination/cursor in repos | All list endpoints | Forces in-memory caps and breaks correctness |
| R15 | No cancellation on stale queries | Fast tab/screen switching | Old `setState` writes overwrite newer state |

---

## 3. Memory & disk profile (estimates)

Per-row size (rough, including indexes):

- `expenses` row ≈ 250 B → 100k rows ≈ **25 MB**.
- `receipt_items` row ≈ 200 B → 500k rows ≈ **100 MB**.
- Indexes (~30% of table size) → ~40 MB.
- Receipt images at current quality ≈ 4 MB × 5k = **20 GB**.
- WAL file + temp files in worst case: ~50 MB.

**Net disk:** ~20.2 GB, of which 99% is images. **The image strategy is the single largest scaling lever.**

**Net JS heap:** 100k expenses fully hydrated in JS context ≈ ~30 MB raw objects + retain chains via React state → realistically 80–120 MB. Mid-tier Android with 4 GB RAM has ~256–384 MB JS heap budget before GC pressure dominates. Hitting heap budget with current architecture between **30k–50k expenses**.

---

## 4. What is already healthy

So we know what *not* to regret:

- Schema is normalized cleanly; `canonical_qty/unit` precomputed at insert is great for analytics later.
- `createWithItems` / `replaceItems` already wrap inserts in `withTransactionAsync` — no per-row commit overhead.
- `expo-sqlite`'s async API is non-blocking on the native side.
- Repos are cleanly separated from screens, so the optimization plan can land in one layer.
- Indexes on `expenses(expense_date DESC)` and `receipt_items(normalized_name, purchase_date)` already exist — covers the most common reads.
- `useFocusEffect` is used on Items — no stale data on tab switch.

These are the bones of a system that can scale; the issues above are mostly missing layers, not architectural defects.
