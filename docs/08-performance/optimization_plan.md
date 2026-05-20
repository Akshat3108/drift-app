# Drift — Optimization Plan

**Date:** 2026-05-17
**Pairs with:** `performance_audit.md`, `scaling_strategy.md`
**Status:** Plan only. No code changed.

The plan is staged so each step is independently shippable and reversible. Steps are ordered by **ratio of impact to effort**, not by where they sit in the audit.

Effort key: **S** = ≤ 1 day, **M** = 2–3 days, **L** = 3–5 days.

---

## Phase 0 — Free wins (do first)

These cost almost nothing and unlock everything else.

### P0-1 — SQLite PRAGMAs on DB open  **(S)**
**Files:** `app/src/db/index.js`
After `openDatabaseAsync('drift.db')` and **before** `execAsync(SCHEMA)`, run:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA temp_store   = MEMORY;
PRAGMA cache_size   = -20000;
PRAGMA mmap_size    = 268435456;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA foreign_keys = ON;
```
Add `PRAGMA optimize` on app background.

**Risk:** very low. WAL is supported on every Android API ≥ 21.
**Wins:** R7 from the audit, ~3–10× write throughput, reads never block writes.

### P0-2 — Add the missing `receipt_items(expense_id)` index  **(S)**
**File:** `db/schema.js`
```sql
CREATE INDEX IF NOT EXISTS idx_items_expense ON receipt_items(expense_id);
```
The foreign key alone does not create one; cascade-delete on a 500k-row table is currently O(N).
**Wins:** R7. Deleting one expense at 500k items: ~500 ms → < 5 ms.

### P0-3 — Stop refreshing the whole world on each mutation  **(M)**
**File:** `hooks/useAppState.js`
Replace each mutation's `setExpenses(await expRepo.list({ limit: 500 }))` with:
- For `add/update`: optimistically splice the returned row into the in-memory cache.
- For `remove`: filter the row out.
- Refetch list only on **screen focus** of a list-bearing screen, not on every write.

This unblocks Phase 1 and immediately makes the UI feel instant.
**Wins:** R2.

---

## Phase 1 — Correctness at scale

Risks R1, R5, and R10 are also **correctness** risks. Fix before R4 (which is "only" a perf issue).

### P1-1 — Add `month_key` generated columns + month indexes  **(S)**
**File:** `db/schema.js`, with a schema_version bump and migration in `db/index.js`.
```sql
ALTER TABLE expenses       ADD COLUMN month_key TEXT GENERATED ALWAYS AS (substr(expense_date, 1, 7)) STORED;
ALTER TABLE receipt_items  ADD COLUMN month_key TEXT GENERATED ALWAYS AS (substr(purchase_date, 1, 7)) STORED;
CREATE INDEX idx_exp_month       ON expenses(month_key);
CREATE INDEX idx_exp_month_cat   ON expenses(month_key, category_id);
CREATE INDEX idx_items_month     ON receipt_items(month_key);
```
Rewrite `repo/expenses.list` and `summaryByCategory` to use `month_key = ?` instead of `substr(...) = ?`.
**Wins:** R5. Indexed lookup replaces full-scan substr.

### P1-2 — Add the missing covering indexes  **(S)**
```sql
CREATE INDEX idx_exp_date_id     ON expenses(expense_date DESC, id DESC);
CREATE INDEX idx_exp_cat_date    ON expenses(category_id, expense_date DESC);
CREATE INDEX idx_items_name_date_id ON receipt_items(normalized_name, purchase_date DESC, id DESC);
```
Drop the now-redundant `idx_expenses_date` and `idx_items_name_date`.
Add `ANALYZE;` to the migration.

### P1-3 — Build the rollup tables + triggers  **(M)**
**Files:** new `db/schema.js` blocks, new `db/repo/summary.js`.

Create `monthly_summary` and `item_summary` as in `scaling_strategy.md §2`. Triggers:
```sql
CREATE TRIGGER trg_exp_ai AFTER INSERT ON expenses BEGIN
  INSERT INTO monthly_summary(month_key, category_id, total, count)
    VALUES (NEW.month_key, NEW.category_id, NEW.amount, 1)
  ON CONFLICT(month_key, category_id) DO UPDATE SET
    total = total + NEW.amount,
    count = count + 1;
END;
-- mirror AFTER UPDATE OF amount,category_id,expense_date and AFTER DELETE
```
And a one-shot rebuild routine: `summary.rebuildAll()` runs in a transaction; can be triggered from a hidden "Diagnostics" screen and from migrations.

**Wins:** R5, R10. Home/Trends drop from `SUM(amount)` table-scan to single-row reads.

### P1-4 — Reroute Home & Trends to the rollup  **(S)**
**Files:** `hooks/useAppState.js` (`summary` useMemo → SQL), `screens/Trends.js` (`monthlyTrend` reads rollup), `repo/expenses.js`.

After this step, "global expenses cache" in context can be **deleted entirely**. PotDetail and AllExpenses fetch paged data themselves.

**Wins:** R1, R13.

### P1-5 — Convert PotDetail & AllExpenses to paginated queries  **(M)**
**Files:** `screens/PotDetail.js`, `screens/AllExpenses.js`, `repo/expenses.js` (add `page({ before, limit, categoryId, month })` with `(expense_date, id)` keyset cursor).

Each screen owns its own list state; subscribes to `expenses:mutated` (or react-query invalidation).

**Wins:** R1, R14.

### P1-6 — Kill the `trackedItems` N+1 with `item_summary`  **(M)**
**Files:** `repo/items.js` (`trackedItems` → single `SELECT … FROM item_summary ORDER BY last_seen DESC LIMIT ?`), trigger to maintain `item_summary` on `receipt_items` insert/update/delete.

Spark history (8 points) can stay JS-side but loaded **lazily** per visible row via `onViewableItemsChanged` once we switch to FlatList in Phase 2.

**Wins:** R3.

---

## Phase 2 — UI scalability

### P2-1 — Virtualize every long list  **(M)**
**Files:** `AllExpenses.js`, `PotDetail.js`, `Items.js`, `ItemTrend.js` history list, `Trends.js` per-category list, `Subs.js`, `Goals.js`, `Travel.js`.

Migrate `<ScrollView>{rows.map(...)}</ScrollView>` to `<FlatList />` (or `<SectionList />` for day-grouped views). Set:
- `keyExtractor` to stable id.
- `getItemLayout` when row height is constant (most rows are).
- `initialNumToRender={20}`, `windowSize={7}`.
- `removeClippedSubviews={true}`.
- Memoize row components with `React.memo` + identity-stable props.

**Wins:** R4. Bounded memory regardless of dataset size.

### P2-2 — Drop `expo-image-picker`'s raw asset for `expo-image`  **(S)**
**Files:** `package.json`, all list and detail screens that render emoji-only thumbnails — only `Scan.js:190` and `Detail.js` show actual user images today, but `expo-image` is faster across the board.
Replace `<Image>` with `<Image>` from `expo-image`, set `recyclingKey={uri}` in lists.

**Wins:** lower memory, faster decode.

### P2-3 — Move OCR parse off the critical render path  **(S)**
**Files:** `screens/Scan.js:52`, `ocr/parseReceipt.js`.

Wrap `parseReceipt(ocr)` in:
```js
await new Promise(r => InteractionManager.runAfterInteractions(r));
const parsed = await parseInChunks(ocr); // setImmediate between stages
```
Track a `scanRequestId` ref to discard stale results if the user retakes.

**Wins:** R12.

---

## Phase 3 — Storage

### P3-1 — Receipt image pipeline  **(L)**
**Files:** new `app/src/media/receipts.js`, edits to `Scan.js`, `EditExpense.js`, `repo/expenses.js`, schema.

Implement what `scaling_strategy.md §4` describes:
- Copy into `documentDirectory/drift/receipts/...`
- Compress full to 1600 px WebP @ 0.7 quality
- Generate 320 px thumbnail
- Strip EXIF
- Add `receipt_path`, `receipt_thumb`, `receipt_bytes`, `receipt_hash` columns; migrate existing `receipt_uri` lazily on first read of each row.
- Soft-delete via deferred unlink queue; reclaim in maintenance job.

**Wins:** R6. 5× disk reduction; no more orphaned/disappearing receipts.

### P3-2 — Maintenance job  **(M)**
**Files:** new `app/src/maintenance/index.js`, called from `App.js` on background → foreground transitions, but rate-limited to once per day.

Tasks:
1. `PRAGMA optimize`.
2. `ANALYZE` if mutation counter > 1000 since last analyze.
3. `VACUUM` if `freelist_count > 1000 AND idle > 30s`.
4. Reclaim orphan receipt files.
5. Verify rollup table totals match base table (sample one random month); rebuild if drift.
6. `PRAGMA quick_check`; surface a recovery banner if it fails.

**Wins:** R11, long-term DB bloat avoidance.

### P3-3 — Export / restore backup  **(M)**
**Files:** new `app/src/backup/`, Settings UI hook.

`.driftbackup` = AES-GCM-encrypted zip of `drift.db` (post-WAL-checkpoint) + `receipts/`. Restore is atomic: write to a sibling DB, swap on success.

**Wins:** R8.

---

## Phase 4 — Power features

### P4-1 — FTS5 for merchants, notes, and items  **(M)**
Add `expense_fts` and `item_fts` virtual tables and the maintenance triggers (`scaling_strategy.md §3.3`). Add a global search bar; switch any existing `LIKE` searches to FTS.

**Wins:** R9.

### P4-2 — Layer-C query cache  **(M)**
Either a tiny custom `useQuery({key, staleTime, fetcher})` hook, or `@tanstack/react-query`. Define per-key staleness as in `scaling_strategy.md §2 Layer C`.

**Wins:** structural; converts ad-hoc `useEffect`+`useState` patterns into invalidation-driven refetches. Removes redundant re-queries during navigation.

### P4-3 — Observability  **(S)**
Dev-only query timing wrapper around `exec/all/one`, logs anything > 50 ms with SQL + params. Persist row counts and image bytes into a `db_stats` row at boot.

**Wins:** future audits become data-driven.

---

## Phase-to-risk traceability

| Risk (audit §2) | Addressed by |
|---|---|
| R1 truncated context | P0-3, P1-4, P1-5 |
| R2 fan-out refresh | P0-3, P4-2 |
| R3 trackedItems N+1 | P1-6 |
| R4 non-virtualized lists | P2-1 |
| R5 substr aggregations | P1-1, P1-3 |
| R6 image bloat | P3-1 |
| R7 default journal/sync + missing index | P0-1, P0-2 |
| R8 no backup | P3-3 |
| R9 no FTS | P4-1 |
| R10 no rollups | P1-3, P1-4 |
| R11 no vacuum/compaction | P3-2 |
| R12 OCR on JS thread | P2-3 |
| R13 boot loads too much | P1-4 (after rollup, context shrinks) |
| R14 no pagination | P1-5 |
| R15 stale-query races | P4-2 (query cache cancels) |

---

## Suggested ordering (one-paragraph version)

Land **P0-1, P0-2, P0-3** in a single PR to remove the obvious foot-guns. Then **P1-1 → P1-6** as a single mini-epic; this is the largest unlock because it fixes both correctness and the heaviest queries. **P2-1** next — it's the most visible UX improvement to the user. **P3-1** as soon as P2 is stable, because the longer it's deferred the more orphaned images accumulate. **P3-2 and P3-3** ship together (maintenance + backup). Phase 4 is opportunistic; FTS is high user value, the query cache is a structural cleanup, observability pays for itself in the next audit.

## Acceptance gates (per phase)

- **Phase 0:** boot succeeds, all existing screens unchanged, mutation latency p50 < 30 ms on a synthetic 50k-row DB.
- **Phase 1:** Home + Trends render < 100 ms with a synthetic 100k-row DB; `EXPLAIN QUERY PLAN` shows no `SCAN TABLE` for any hot query; rollup totals match base table totals (rebuild check passes).
- **Phase 2:** AllExpenses scrolls smoothly with 100k rows (60 fps target, mid-tier Android); memory steady-state on Items screen < 80 MB JS heap.
- **Phase 3:** disk usage at 5k receipts < 5 GB; orphan-scan removes test files; backup/restore round-trips byte-identical DB.
- **Phase 4:** FTS search latency p95 < 50 ms at 100k rows; query cache hit rate > 70% during routine navigation.

## Out of scope (intentionally)

- Migrating to native Android + Room (would require rewriting the whole app; the audit shows expo-sqlite + the changes above are sufficient for the stated 100k/10y target).
- Cloud sync.
- Multi-currency historical FX backfills.
- Server-side OCR.

Revisit these only if telemetry from Phase 4 shows we've outgrown the local-first envelope.
