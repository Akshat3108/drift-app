# Drift — Final Execution Roadmap

> Author: Principal fintech product strategist / technical program architect
> Synthesis date: 2026-05-17
> Inputs: full /docs corpus (33 documents, ~12,000 lines)
> Horizon: 10+ years of data, 100k+ expenses, 500k+ receipt items, single-user offline-first

---

## SECTION 1 — CURRENT STATE ASSESSMENT

### 1.1 Current Maturity Level

**Stage: Late-MVP / Pre-production v1.0**

Drift has crossed the threshold from prototype to product: 21 screens, 10 SQLite tables, a sophisticated multi-format OCR pipeline, and a coherent visual identity. It is *not* yet production-grade. The app ships with a debug-signed release APK, no test suite, no schema migrations, an in-memory cap that produces silent data corruption past ~500 expenses, and roughly a dozen architectural smells that compound as the dataset grows.

It is a single-developer / small-team product at the inflection point where every additional feature now costs more than the last because the foundation has not yet been hardened.

| Dimension | Score / 10 | One-line read |
|---|---|---|
| Functional breadth | 8 | 32 features inventoried, ~24 working end-to-end |
| Architectural soundness | 5 | Repository layer clean; everything above it is a god context |
| Production-readiness | 3 | Release signing, no tests, no migrations, no error boundaries |
| OCR sophistication | 7 | India-aware, 10 formats, confidence scoring — but ASCII-only + ML Kit v1 |
| Analytics depth | 5 | Item-level price tracking is class-leading; everything else is 6 months only |
| UX polish | 7 | Beautiful surface, weak power-user depth |
| Long-term scaling readiness | 3 | Hard caps and N+1 patterns will bite within 6 months of active use |

### 1.2 Biggest Strengths

1. **Truly offline-first.** No network dependency anywhere in the user-facing flows. The privacy/sovereignty story is genuine.
2. **Item-level OCR intelligence.** Storing `normalized_name + canonical_qty + canonical_unit + unit_price` per receipt line, with indexes on `(normalized_name, purchase_date)`, is the architectural differentiator. No competing Indian expense app has this depth.
3. **Sophisticated receipt parser.** 10-format detection, 50 brand patterns, 4 item extraction strategies, 7-component confidence model. The pipeline is well-engineered for Indian receipt complexity.
4. **Clean repository layer.** `db/repo/*.js` files are small, focused, composable. The cleanest part of the codebase.
5. **Well-placed indexes (for current schema).** The four custom indexes cover the dominant access patterns without over-indexing.
6. **FK + cascade discipline.** Foreign keys enabled; cascades behave correctly (`receipt_items` with `expenses`, `trip_categories` with `trips`).
7. **Dual-OCR architectural scaffold.** Backend `/receipt` endpoint with Gemini fallback exists; the parsed result shape mirrors what a cloud-OCR would return — the seam for a future fallback is already in place.
8. **Coherent visual identity.** Flow/botanical aesthetic, coral accent, cream surfaces — distinctive and consistent across all 21 screens.

### 1.3 Biggest Weaknesses

1. **God Context (`useAppState.js`)** — every entity, every mutation, every derived value in one file. Any change re-renders every subscribed screen. Untestable in slices.
2. **500-row hard cap** — silent data corruption after ~5–6 months of daily use. `summary`, `totalSpend`, and per-category aggregates all begin to lie.
3. **No migration system** — `CREATE TABLE IF NOT EXISTS` means no schema change can ever ship to existing installs. Every Tier-1 feature is blocked.
4. **No test suite anywhere** — 600+ lines of regex-driven OCR parsing has zero regression coverage.
5. **Zero search** — power-user productivity collapses past 100 expenses.
6. **No export / no backup** — single device wipe = total data loss. Violates the local-first contract.
7. **`receipt_uri` stores volatile paths** — images live in `cacheDirectory` or `content://`, can disappear under storage pressure; deleted expenses leak orphan images.
8. **OCR ASCII-only** — `normalizeName` strips all non-Latin characters, destroying Hindi product names and brands with accents.
9. **No FTS5** — no scalable text search, no merchant deduplication.
10. **Release-blockers** — debug keystore in release build, unminified APK, unnecessary `RECORD_AUDIO` / `SYSTEM_ALERT_WINDOW` permissions, deprecated `WRITE_EXTERNAL_STORAGE`.

### 1.4 Most Dangerous Technical Debt

Ranked by blast radius × likelihood of triggering:

| Rank | Debt | Why it's dangerous |
|---|---|---|
| 1 | **No migration system** | Blocks every schema-touching feature; once shipped, irreversible without elaborate fallback |
| 2 | **500-row hard cap + JS-side `summary`** | Silent correctness bug — wrong totals shown without any error surfaced |
| 3 | **God Context with raw `repos` exposed** | Every screen has two paths to the same data, state consistency is impossible to guarantee |
| 4 | **N+1 in `items.trackedItems()` and `trips.listWithCategories()`** | Performance cliff at 50+ tracked items; runs on every refresh |
| 5 | **ASCII-only normalization** | Permanent data quality loss — Hindi names cannot be recovered from saved `normalized_name` later |
| 6 | **`receipt_uri` volatility** | Receipt images silently disappear; user trust collapses on first noticed loss |
| 7 | **Schema divergence between app SQLite and backend Postgres** | Future sync rewrites one or both from scratch |
| 8 | **Carbon hardcoded to 0.4 kg** | Misleading feature actively damages product credibility |
| 9 | **Cross-layer imports (`db/repo/items.js → ocr/units.js`, `components/ItemRows.js → ocr/*`)** | Makes the OCR module immovable and the repo untestable |
| 10 | **`getDB()` `_opening` never reset on failure** | One DB-open failure → app frozen forever, no error surfaced |

### 1.5 Scalability Readiness

**Verdict: not ready beyond ~6 months of daily use.**

| Trigger | What breaks |
|---|---|
| > 500 lifetime expenses | `PotDetail`, `AllExpenses`, `summary`, `totalSpend` all wrong |
| > 50 tracked items | Items screen freezes 1–2 s on each focus (N+1) |
| > 1k tracked items | 5+ second freeze on Items tab |
| > 3k rows in any list | OOM crashes on mid-tier Android (no virtualization) |
| > 30k–50k expenses | JS heap exhaustion (full context hydration) |
| > 1k receipts | App storage > 5 GB; volatile URIs cause silent loss |
| Any schema change | Existing installs cannot receive new columns |

The schema itself is sound enough to scale to 10+ years of data once: rollups are added, generated `month_key` columns replace `substr()`, virtualized lists replace `ScrollView+map`, and receipt images are pipelined through a proper storage layer. None of these require an architectural rewrite — only disciplined refactoring.

### 1.6 OCR Maturity

**Score: 7/10. Class-leading for an offline single-developer app; below state-of-the-art.**

Strengths: 10-format classification, 50 brand patterns, 4 extraction strategies, confidence scoring with 7 components, GST/HSN parsing, canonical unit conversion at write time, normalized item naming.

Gaps: ML Kit v1 (no Devanagari/Tamil/Telugu); ASCII-only normalization (destroys Hindi names); no image preprocessing (no deskew, no CLAHE, no Sauvola binarization for thermal receipts); per-element OCR confidence not consumed; no fallback OCR engine; no column detection (multi-column pharmacy/DMart receipts misread); no duplicate-receipt fingerprinting; no per-merchant template learning; pharmacy batch/expiry not extracted; no fuel single-item extraction; SKIP_RE over-matches item names ("Total Care Soap" → skipped); date regex has no day/month range validation.

The pipeline architecture is *correct*. The data flowing through it is being silently corrupted at multiple stages.

### 1.7 Analytics Maturity

**Score: 5/10. One brilliant feature, surrounded by shallow defaults.**

The item price tracking + same-quantity merchant comparison is genuinely class-leading — no Indian competitor has it. Everything else is at MVP depth:

- Monthly trend capped at 6 months
- Category analytics current-month-only (no historical variance, no QoQ drift)
- No merchant analytics (free-text merchant field, no aggregation queries)
- No seasonal/day-of-week/time-of-month patterns
- No personal inflation basket index (despite having all the raw data)
- No reorder prediction (despite having `purchase_date` + repeat-purchase detection trivially derivable)
- No cashflow forecasting beyond a linear `× daysInMonth / dayOfMonth` extrapolation
- No anomaly detection
- No lifestyle inflation detection
- No subscription leakage score
- Carbon tracking is a placeholder (0.4 kg per expense, always)
- Net worth is a static snapshot — no trajectory

The latent analytics potential is enormous because the receipt-item data has been captured cleanly. The unlock is engineering, not data acquisition.

### 1.8 UX Maturity

**Score: 7/10 surface, 4/10 power-user depth.**

Strong: visual identity, dashboard hierarchy, OCR review UX, item editor sheet, custom numpad, theme system. Onboarding is the right scope (3 steps).

Weak: no search, no merchant autocomplete, no date range filter, no swipe actions, no batch ops, no keyboard shortcuts, no widget support, no notifications, mood picker mandatory on every entry, Add screen opens as a tab (destroys context), Save is a small header link instead of a bottom CTA, no undo on delete, Alert dialogs interrupt instead of toasts, ISO date input in Scan review, category auto-guess has a duplicated-branch bug, accessibility labels absent everywhere, color-only signaling of over/under budget.

The app is delightful for the first 30 days and frustrating thereafter — exactly inverted from where a long-lived finance app needs to land.

### 1.9 Database Maturity

**Score: 6/10. Good bones, missing infrastructure.**

Good: normalized 10-table schema, FK + cascade discipline, single-row singleton enforcement (`CHECK id=1`), canonical units stored alongside raw on `receipt_items`, four well-placed indexes.

Missing:
- Migration runner + `schema_version` table
- WAL journal mode + tuned PRAGMAs
- Generated `month_key` columns (so `substr()` predicates can use indexes)
- Composite `(category_id, expense_date)` index
- `receipt_items(expense_id)` index (cascade deletes are O(N))
- FTS5 virtual tables for merchant + item search
- Rollup tables (`monthly_summary`, `item_summary`)
- Soft delete (`deleted_at` columns)
- Audit trails (`goal_contributions`, `account_transactions`)
- Merchant entity (currently free-text)
- Product entity (currently `normalized_name` string coupling)
- Multi-currency support on `expenses`
- Linkage between `expenses` and `subscriptions / accounts / trips / goals`
- CHECK constraints on `subscriptions.verdict`, `receipt_items.kind`
- `subscriptions.cancelled_at` (cancellation date is permanently lost today)
- Receipt fingerprint columns (for duplicate detection)
- Permanent receipt image path columns (current `receipt_uri` is volatile)

The schema *could* be the kind of data layer that powers a 10-year-of-data analytics app. Today it's the schema of a 6-month MVP.

---

## SECTION 2 — PRIORITIZED EXECUTION ROADMAP

The roadmap is staged into **eight phases**. Each phase is independently shippable, gated by acceptance criteria, and ordered so that no phase depends on a later phase. The first three phases are non-negotiable foundation; phases 4–7 build the differentiated product; phase 8 is the long-horizon scaling preparation.

```
Phase 1  Foundation Stabilization         (1–2 weeks)   [BLOCKING for everything]
Phase 2  Architecture Refactoring         (2–3 weeks)
Phase 3  Database Evolution               (1–2 weeks)
Phase 4  OCR Intelligence                 (3–6 weeks)
Phase 5  Expense Intelligence             (3–4 weeks)
Phase 6  Analytics Engine                 (3–4 weeks)
Phase 7  Power User Features              (4–6 weeks)
Phase 8  Long-Term Scaling                (ongoing)
```

Total horizon: ~6 months to v2.0 with a single full-time developer; ~3 months with two developers running phases in parallel where dependencies permit.

---

### PHASE 1 — FOUNDATION STABILIZATION

**Duration: 1–2 weeks**
**Goal: Eliminate every release-blocker, correctness bug, and shipping foot-gun before adding a single new feature.**

#### Goals

1. The app can be released to the Play Store without disqualifying issues.
2. No silent data corruption — every wrong-data scenario surfaces an error.
3. Every schema change from this point forward is safe for existing installs.
4. Errors are caught, logged, and surfaced — never silently swallowed.

#### Features Delivered

- Schema migration runner with version tracking (`F-17`)
- WAL journal + tuned SQLite PRAGMAs
- React Error Boundaries on every screen feature tree
- Release signing config (production keystore)
- R8 minification + resource shrinking enabled
- Unnecessary Android permissions removed (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE`)
- `getDB()` error recovery (reset `_opening` on failure)
- `receipt_items(expense_id)` index (eliminates O(N) cascade delete)
- 500-row cap fix: `summary` moves to SQL aggregate
- Unused deps removed (`@react-native-async-storage/async-storage`, `expo-camera` if confirmed unused)

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 1.1 | Create `schema_version` table + `runMigrations()` runner in `db/index.js` | 0.5 d |
| 1.2 | Bake initial schema as migration v1; future schema changes use additive `ALTER TABLE` migrations only | 0.5 d |
| 1.3 | Add `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`, `temp_store=MEMORY`, `cache_size=-20000`, `mmap_size=268435456`, `wal_autocheckpoint=1000` to `getDB()` | 0.25 d |
| 1.4 | Fix `getDB()` to reset `_opening = null` on open failure | 0.1 d |
| 1.5 | Add `CREATE INDEX idx_items_expense ON receipt_items(expense_id)` migration | 0.1 d |
| 1.6 | Replace `setExpenses(await expRepo.list({limit:500}))` pattern with optimistic in-memory patching for add/update/remove | 1 d |
| 1.7 | Rewrite `summary` `useMemo` to call `expRepo.summaryByCategory(currentMonth)` via SQL | 0.5 d |
| 1.8 | Add a top-level `ErrorBoundary` plus per-feature boundaries on Home, Trends, Scan, Add, AllExpenses, Items | 0.5 d |
| 1.9 | Replace empty `catch {}` blocks with a `logError(context, error)` helper | 0.5 d |
| 1.10 | Generate production keystore; configure `signingConfigs.release` in `app/android/app/build.gradle`; document the secrets management approach | 0.5 d |
| 1.11 | Set `enableMinifyInReleaseBuilds = true`; verify with R8/proguard rules for Reanimated, Hermes | 0.5 d |
| 1.12 | Remove `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE` from `AndroidManifest.xml`; rebuild & verify | 0.25 d |
| 1.13 | Remove `@react-native-async-storage/async-storage` from `package.json`; confirm `expo-camera` is/isn't needed (Scan.js uses image-picker only) | 0.25 d |
| 1.14 | Pin the `_opening` race; add tests | included in 1.4 |

#### Refactors Required

- Mutation pattern in `useAppState.js` rewritten to be optimistic + targeted (no full reload)
- `summary` derivation moves from in-memory reduce to SQL aggregate
- Schema DDL pattern moves from idempotent `CREATE TABLE IF NOT EXISTS` to versioned migrations

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration runner has a bug; users land on a corrupt schema | Low | Wrap each migration in `withTransactionAsync`; never run two at once; manual test on a copy DB |
| WAL mode incompatible with some Android <5 devices | Very Low | `minSdk` is already API 24+; WAL works on all supported versions |
| R8 minification breaks Reanimated or Hermes call paths | Medium | Use the official Expo proguard config; test on a real device build |
| Production keystore committed to git by accident | Low | Use `secrets` block in build.gradle pulling from `~/.gradle/gradle.properties` or env vars |

#### Dependencies

None. This phase has no prerequisites.

#### Suggested Implementation Order

1.1 → 1.2 → 1.4 → 1.3 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10 → 1.11 → 1.12 → 1.13

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Implementation complexity | **Low** — well-understood patterns |
| Risk of regression | **Medium** — touches DB layer and the global context |
| Effort | **~7 developer-days** |

#### Recommended Testing Strategy

- Manual test on a fresh install + an existing install with synthetic data at 100, 500, 5000 expense rows
- Snapshot test of the migration runner: run all migrations against an empty DB, then run them again (idempotent verification)
- Capture `EXPLAIN QUERY PLAN` output of `summaryByCategory` before/after; assert that an index range scan replaces the full-table scan
- Android release build smoke test on a real device (Play-Store-eligible APK)
- Add a `PRAGMA quick_check` call at boot to confirm DB integrity

---

### PHASE 2 — ARCHITECTURE REFACTORING

**Duration: 2–3 weeks**
**Goal: Eliminate the god context, decouple cross-layer imports, introduce a service layer, group code by feature.**

#### Goals

1. Each domain (expenses, categories, items, subs, goals, accounts, trips, profile) owns its own context, hook, and repo — no shared god object.
2. The OCR module has zero outbound dependencies on `features/` or `components/`.
3. Theme, navigation, and global state are separated. Navigation cannot consume application state.
4. Screens are physically grouped by feature directory.
5. The Scan screen delegates OCR orchestration to a `ScanService`.

#### Features Delivered

- Per-feature contexts (`ExpensesContext`, `CategoriesContext`, etc.) with targeted re-renders
- `core/domain/units.js`, `core/domain/normalize.js`, `core/domain/produce.js` (moved from `ocr/`)
- `core/theme/ThemeContext.js` (lightweight, navigation-consumable)
- `features/scan/ScanService.js` (camera → OCR → parse → normalize composition)
- `features/home/useHomeDashboard.js` (composes the 4 cross-feature queries Home needs)
- `core/utils/format.js` (formatShort, daysUntil, shorten lifted from screens)
- Babel module-resolver aliases (`@core`, `@features`, `@ocr`, `@components`)
- React.memo + memoized selectors on every screen
- Custom tab bar extracted from navigation config

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 2.1 | Add `babel-plugin-module-resolver` with `@core`, `@features`, `@ocr`, `@components` aliases | 0.25 d |
| 2.2 | Move `ocr/units.js` → `core/domain/units.js`; update all 5 importers | 0.5 d |
| 2.3 | Move `ocr/normalizeName.js` → `core/domain/normalize.js` | 0.25 d |
| 2.4 | Move `ocr/produceList.js` → `core/domain/produce.js` | 0.1 d |
| 2.5 | Split `data/constants.js` into `core/domain/currencies.js`, `core/domain/categories.js`, `core/domain/avatars.js` | 0.25 d |
| 2.6 | Lift `formatShort`, `shorten`, `daysUntil` from Home.js into `core/utils/format.js`; replace inline usages | 0.5 d |
| 2.7 | Create `core/theme/ThemeContext.js` + `useTheme()`; update navigation/index.js to use it instead of `useApp()` | 0.5 d |
| 2.8 | Extract `CustomTabBar` from `navigation/index.js` into `navigation/CustomTabBar.js`; accept theme as prop | 0.5 d |
| 2.9 | Split `useAppState.js` into per-feature hooks: ExpensesProvider, CategoriesProvider, ItemsProvider, SubsProvider, GoalsProvider, AccountsProvider, TravelProvider, ProfileProvider. Compose at app root. Keep a deprecated `useApp()` shim that assembles the legacy shape during transition | 3 d |
| 2.10 | Remove `repos` from any context value; replace each `repos.*` call site with an explicit named action creator on the appropriate feature hook | 1 d |
| 2.11 | Group screens into `features/expenses/screens/`, `features/categories/screens/`, etc.; update navigation imports | 0.5 d |
| 2.12 | Move repos into their owning feature: `features/expenses/repo.js`, etc. | 0.5 d |
| 2.13 | Create `features/scan/ScanService.js` exporting `processReceipt(uri)`; Scan.js becomes a thin consumer | 1 d |
| 2.14 | Create `features/home/useHomeDashboard.js` to encapsulate net worth, next trip, streak, top mover queries with a 30s cache | 0.5 d |
| 2.15 | Split `components/UI.js` into `components/primitives/{Card, Button, Chip, ProgressBar, Toggle, MoodPicker, ...}.js` | 0.5 d |
| 2.16 | Update `components/ItemRows.js` to import from `core/domain/` not `ocr/` | 0.25 d |
| 2.17 | Add `React.memo` to every leaf screen and to `CustomTabBar`, `ProgressBar`, `Toggle`, `MoodPicker`; verify with React Profiler | 0.5 d |
| 2.18 | Module-level row key counter in `ItemRows.js` replaced with `useRef` or `crypto.randomUUID()` | 0.1 d |

#### Refactors Required

- The biggest single-PR refactor in the entire roadmap: splitting `useAppState.js`. Land behind a compatibility shim; remove the shim only after every screen is migrated and tested.
- Physical file moves into `features/` — touches every screen import path. Path aliases (Task 2.1) must land first.

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Splitting `useAppState.js` introduces subtle state-consistency bugs | High | Keep the `useApp()` shim until every screen is migrated; gate behind a feature flag |
| Path-alias change breaks Metro / Jest config | Medium | Test on a clean clone; update `metro.config.js` and Jest config in same PR |
| File moves create huge git diffs that obscure logic changes | Low | Land moves and logic changes in separate PRs; use `git mv` |
| Performance regression on first paint (more providers in the tree) | Low | Composition is cheap; `React.memo` on screens prevents the cascade |

#### Dependencies

- Phase 1 complete (migrations must exist before any schema-touching change in Phase 3)

#### Suggested Implementation Order

2.1 → (2.2, 2.3, 2.4, 2.5 in parallel) → 2.6 → 2.7 → 2.8 → 2.18 → 2.16 → 2.15 → 2.13 → 2.14 → 2.12 → 2.11 → 2.9 → 2.10 → 2.17

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Implementation complexity | **High** — touches every screen |
| Risk of regression | **High** — state plumbing changes globally |
| Effort | **~11 developer-days** |

#### Recommended Testing Strategy

- Add Jest with `react-native-testing-library`. Write smoke tests for: each new feature hook can mount in isolation; each screen renders given a mocked feature hook
- Snapshot tests on `Home`, `Trends`, `Scan` after migration
- Manual exploratory testing of every mutation path (add expense, edit, delete, add category, etc.)
- React Profiler before/after: count re-renders on a single `addExpense` action; expectation drops from "every screen" to "expense-list screens only"

---

### PHASE 3 — DATABASE EVOLUTION

**Duration: 1–2 weeks**
**Goal: Bring the schema to a state that can host every Tier-1 feature and scale to 10 years of data.**

#### Goals

1. Generated `month_key` columns + composite indexes — every `substr(date,1,7)` predicate becomes an indexed lookup.
2. Soft delete columns (`deleted_at`) on every financial entity.
3. Audit-trail tables: `goal_contributions`, `account_transactions`.
4. Entity tables: `merchants`, `products`.
5. Linkage columns on `expenses`: `merchant_id`, `account_id`, `trip_id`, `subscription_id`.
6. Rollup tables: `monthly_summary`, `item_summary` (maintained by triggers).
7. FTS5 virtual tables on expenses (merchant, notes) and receipt_items (name, normalized_name).
8. CHECK constraints on enum-style columns (`subscriptions.verdict`, `receipt_items.kind`, `accounts.kind`, `categories.budget_period`).
9. Multi-currency support: `expenses.currency`, `amount_home`, `fx_rate`.
10. Permanent receipt path columns: `receipt_path`, `receipt_thumb`, `receipt_bytes`, `receipt_hash`.

#### Features Delivered

- Migration v2..vN containing every schema addition listed above
- Indexes covering merchant, account, trip, subscription, month, FTS5 search
- Rollup-backed Home and Trends queries (Home renders from `monthly_summary` not from a 500-row in-memory scan)
- N+1 elimination in `trips.listWithCategories()` (single JOIN) and `items.trackedItems()` (single CTE with window function or `item_summary` read)
- `items.suggest()` rewritten with `FIRST_VALUE()` window function (no correlated subqueries)
- Range-predicate refactor: all `WHERE substr(expense_date,1,7) = ?` rewritten to `WHERE expense_date >= ? AND expense_date < ?`

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 3.1 | Migration v2: `ALTER TABLE expenses ADD COLUMN deleted_at TEXT`, repeat for `receipt_items`, `categories`, `accounts`, `subscriptions`, `goals` | 0.25 d |
| 3.2 | Migration v3: generated `month_key` columns on `expenses` and `receipt_items`; `CREATE INDEX idx_exp_month`, `idx_exp_month_cat`, `idx_items_month` | 0.5 d |
| 3.3 | Migration v4: `CREATE TABLE merchants`, `idx_merchants_canonical` (unique, NOCASE); `ALTER TABLE expenses ADD COLUMN merchant_id` | 0.5 d |
| 3.4 | Migration v5: `CREATE TABLE products`, `idx_products_name`, `products_fts`; `ALTER TABLE receipt_items ADD COLUMN product_id` | 0.5 d |
| 3.5 | Migration v6: `ALTER TABLE expenses ADD COLUMN account_id`, `trip_id`, `subscription_id`, `currency`, `amount_home`, `fx_rate`; add indexes `idx_expenses_account`, `idx_expenses_trip`, `idx_expenses_sub` (partial where NOT NULL) | 0.5 d |
| 3.6 | Migration v7: `ALTER TABLE expenses ADD COLUMN receipt_path, receipt_thumb, receipt_bytes, receipt_hash, receipt_soft_hash` | 0.25 d |
| 3.7 | Migration v8: `CREATE TABLE account_transactions`, `idx_acctxn_account_date` | 0.25 d |
| 3.8 | Migration v9: `CREATE TABLE goal_contributions`, `idx_goal_contrib_goal` | 0.25 d |
| 3.9 | Migration v10: `ALTER TABLE subscriptions ADD COLUMN cancelled_at, linked_category_id, currency`; CHECK constraint on `verdict` (rebuild table via `CREATE TABLE _new + INSERT + DROP + RENAME`); index `idx_subs_next_bill` | 0.5 d |
| 3.10 | Migration v11: `ALTER TABLE categories ADD COLUMN budget_period TEXT DEFAULT 'month' CHECK (...)` | 0.25 d |
| 3.11 | Migration v12: `CREATE TABLE monthly_summary`, `item_summary`; triggers `trg_exp_ai`, `trg_exp_au`, `trg_exp_ad`, `trg_items_ai`, `trg_items_au`, `trg_items_ad` | 1 d |
| 3.12 | Migration v13: `CREATE VIRTUAL TABLE expense_fts USING fts5(merchant, notes, content='expenses', content_rowid='id')`; corresponding triggers to keep FTS in sync | 0.5 d |
| 3.13 | Migration v14: `CREATE VIRTUAL TABLE item_fts USING fts5(name, normalized_name, content='receipt_items', content_rowid='id')`; sync triggers | 0.5 d |
| 3.14 | One-shot data backfill: populate `monthly_summary` and `item_summary` from existing rows; populate FTS tables from existing rows | 0.5 d |
| 3.15 | Repo rewrite: every query that uses `substr(expense_date,1,7)` switched to `month_key = ?` OR `expense_date >= ? AND expense_date < ?` | 1 d |
| 3.16 | Repo rewrite: `items.trackedItems()` reads `item_summary` for the summary and lazily fetches spark history via `(normalized_name, purchase_date DESC, id DESC)` index | 0.5 d |
| 3.17 | Repo rewrite: `items.suggest()` rewritten with `FIRST_VALUE()` OVER window | 0.5 d |
| 3.18 | Repo rewrite: `trips.listWithCategories()` collapses to a single LEFT JOIN | 0.25 d |
| 3.19 | Repo rewrite: Home and Trends derive monthly metrics from `monthly_summary` not from base table | 0.5 d |

#### Refactors Required

- Every repo method that used `substr()` or N+1 patterns is rewritten
- Home / Trends data layer is reshaped to consume rollups
- Soft delete adds a `WHERE deleted_at IS NULL` predicate to every list query (factor into a helper)

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Generated column unsupported on Expo SDK 54's bundled SQLite | Low | Expo 54 ships SQLite 3.45+; generated columns work since 3.31. Verify with a probe query in the migration |
| Trigger logic has subtle off-by-one on `UPDATE` (old vs new month_key) | Medium | Triggers explicitly handle both buckets; rebuild check on app start; unit-test trigger correctness with a synthetic fixture |
| FTS5 not available in the bundled SQLite | Very low | Confirmed available in expo-sqlite; probe at boot and fall back to `LIKE` if missing |
| Data backfill mis-counts on rebuild | Medium | Add a checksum query that compares `SUM(amount) FROM expenses WHERE month_key=?` against `SELECT total FROM monthly_summary WHERE month_key=?`. Daily maintenance job re-verifies and rebuilds if drift |
| Soft-delete predicate forgotten in a query | High | Add a lint rule / repo helper that prepends the predicate; code review for every list query |

#### Dependencies

- Phase 1 (migration runner must exist)

Architecture refactoring (Phase 2) is *not* strictly blocking but **strongly preferred to land first** — repo rewrites are dramatically easier inside per-feature directories.

#### Suggested Implementation Order

3.1 → 3.2 → 3.15 → 3.10 → 3.3 → 3.4 → 3.5 → 3.6 → 3.9 → 3.7 → 3.8 → 3.11 → 3.14 → 3.19 → 3.16 → 3.17 → 3.18 → 3.12 → 3.13

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Implementation complexity | **High** — many migrations, trigger correctness |
| Risk of regression | **Medium** — well-bounded to data layer |
| Effort | **~10 developer-days** |

#### Recommended Testing Strategy

- Migration tests: synthetic DB at each version, assert all migrations apply cleanly
- Trigger correctness: insert / update / delete an expense, assert `monthly_summary` reflects the change; same for items
- `EXPLAIN QUERY PLAN` on every hot query — fail CI if any new SCAN TABLE appears
- Backfill correctness: load 1k synthetic expenses; run backfill; assert `SUM(monthly_summary.total) = SUM(expenses.amount)`
- FTS5 round-trip: insert a row, search for a substring, expect a hit

---

### PHASE 4 — OCR INTELLIGENCE

**Duration: 3–6 weeks (phased: P0 in days, P1 in weeks, P2 in months)**
**Goal: Lift OCR from "good for English-only printed receipts" to "great for India-first multi-script messy receipts with confidence-aware fallback."**

#### Goals

1. **Phase 4A (P0, days):** Stop destroying Hindi names. Capture sharper images. Fix the obvious bugs.
2. **Phase 4B (P1, weeks):** ML Kit v2 + per-element confidence + light preprocessing + column detection + duplicate detection.
3. **Phase 4C (P2, months):** Tesseract LSTM fallback, native Kotlin preprocessing (CLAHE, Sauvola), template learning, pharmacy/fuel extraction.

#### Features Delivered

**Phase 4A — Immediate Fixes**
- `[^a-z\s]` → `[^\p{L}\p{N}\s]u` in `normalize.js` (preserves Devanagari, Tamil, Telugu, accented characters)
- Hindi / regional product synonym dictionary (`hindi_product_map.json`, `product_synonyms.json`)
- `quality: 1.0` + PNG output in image picker
- Fix `pots.find(/grocer/i)` duplicated-branch bug in Scan.js (produce vs non-produce now diverge)
- Date regex validates day 1–31, month 1–12, year 2000–2099
- `SKIP_RE` over-match fix: classification considers price-position context
- Decimal-tolerant `deriveQtyFromRate()` (captures 0.5kg, 2.5L)
- `_opening` reset on DB failure (already in Phase 1)
- Persist GSTIN, invoice_number, CGST, SGST, IGST, HSN to `expenses` (schema in Phase 3)

**Phase 4B — Core Improvements**
- Upgrade `@react-native-ml-kit/text-recognition` to v2 with Devanagari language model
- Read per-element confidence; surface in `confidence.js` as a new component
- `lightPreprocess()` via `expo-image-manipulator` (resize to 1800px + PNG)
- Column detection in `mergeIntoRows()` (x-axis density gaps → column boundaries)
- New `'columnar'` item extraction strategy for multi-column pharmacy/DMart receipts
- Duplicate receipt detection: FNV-1a fingerprint + soft fingerprint on every save
- Jaro-Winkler merchant deduplication against `merchants` table
- Fuel single-item extraction (volume, rate, amount)
- Per-item GST rate extraction (CGST/SGST/IGST regex per item line)
- Dynamic confidence reconciliation tolerance: `max(0.03, min(0.10, 3/itemCount))`

**Phase 4C — Advanced**
- Native Kotlin `ImagePreprocessModule.kt`: grayscale, CLAHE, Sauvola binarization, deskew, thermal inversion detection
- Tesseract 5 LSTM as fallback engine for low-confidence ML Kit results (eng+hin language data bundled, ~11MB APK addition)
- Receipt template learning: per-merchant `receipt_templates` table that records column structure, header/footer fractions, item-section keywords. Updated on every user-corrected save
- Pharmacy strategy: drug name, strength, form, batch, expiry per item
- Multi-image stitching for long receipts

#### Technical Tasks

| # | Task | Phase | Effort |
|---|---|---|---|
| 4.1 | Fix `[^a-z\s]` → `[^\p{L}\p{N}\s]u`; add Unicode NFC normalize | 4A | 0.25 d |
| 4.2 | Bundle `product_synonyms.json` (~80 KB) + `hindi_product_map.json` (~50 KB) | 4A | 1 d |
| 4.3 | Set image picker `quality: 1.0`, PNG output | 4A | 0.1 d |
| 4.4 | Fix Scan.js produce vs non-produce category guess (currently identical) | 4A | 0.1 d |
| 4.5 | Add `validateDateParts(d, m, y)` to date regex consumers | 4A | 0.25 d |
| 4.6 | Refactor `classifyRow` to use `classifyRowWithContext(text)` that respects price position | 4A | 0.5 d |
| 4.7 | Implement `deriveQtyFromRate()` with common-fraction tolerance | 4A | 0.25 d |
| 4.8 | Persist GSTIN, invoice_number, CGST/SGST/IGST, HSN in Scan.js save path | 4A | 0.5 d |
| 4.9 | Upgrade ML Kit to v2; configure Devanagari model | 4B | 0.5 d |
| 4.10 | `extractLines()` reads `el.confidence` per element; line confidence = mean | 4B | 0.25 d |
| 4.11 | `lightPreprocess(uri)` wrapper around `expo-image-manipulator` (resize+PNG) | 4B | 0.25 d |
| 4.12 | `detectColumns(rows)` — x-axis density gap analysis | 4B | 1 d |
| 4.13 | New `extractItemsColumnar()` strategy | 4B | 1 d |
| 4.14 | `fingerprintReceipt(parsed)` + `softFingerprint(parsed)`; check before save; "possible duplicate" UI | 4B | 0.5 d |
| 4.15 | `jaroWinkler()` implementation; merchant resolution against `merchants` table | 4B | 0.5 d |
| 4.16 | `extractFuelItem()` for `itemStrategy: 'fuel'` | 4B | 0.5 d |
| 4.17 | Per-item GST rate extraction; persist `cgst_rate`, `sgst_rate` on `receipt_items` (migration) | 4B | 1 d |
| 4.18 | Dynamic reconciliation tolerance in `confidence.js` | 4B | 0.1 d |
| 4.19 | OCR golden dataset: 50 anonymized receipt scans + expected outputs | 4B | 2 d |
| 4.20 | Native Kotlin `ImagePreprocessModule.kt` (grayscale → CLAHE → Sauvola → deskew); JS bridge `preprocessReceiptImage(uri)` | 4C | 4 d |
| 4.21 | Bundle Tesseract 5 LSTM + `react-native-tesseract-ocr`; trigger fallback when ML Kit conf < 0.5 | 4C | 3 d |
| 4.22 | `receipt_templates` table + learning loop | 4C | 2 d |
| 4.23 | Pharmacy-specific extraction strategy (drug, batch, expiry per item) | 4C | 2 d |
| 4.24 | Multi-image receipt stitching UI + parser merge | 4C | 3 d |

#### Refactors Required

- `normalizeName.js` rewritten to be Unicode-safe, with script detection and synonym table lookups
- `confidence.js` gains an `ocr_quality` component sourced from per-element confidence
- `parseReceipt.js` gains a `columnar` dispatch branch
- Image capture path adds a `lightPreprocess(uri)` call before recognition

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ML Kit v2 Devanagari model breaks Latin recognition | Low | Both models can be loaded; verify with the golden dataset |
| Native Kotlin module increases APK size significantly | Medium | Module is small; OpenCV is optional (~4 MB if included) |
| Tesseract data files push APK over 100 MB threshold | High | Use Play Feature Delivery to ship language data as on-demand modules |
| Column detection produces false splits on narrow receipts | Medium | Conservative gap threshold; fall back to existing logic if `detectColumns` returns null |
| Template learning over-fits to bad samples | Medium | Require `sample_count >= 3` before applying; user can disable per-template |
| Duplicate detection false-positives on legitimate recurring purchases at the same merchant on the same day | Low | Soft fingerprint is a warning, not a block; user confirms |

#### Dependencies

- Phase 1 (migration runner needed for GST persistence and `receipt_templates` table)
- Phase 3 (`merchants` table, FTS5, soft delete columns)

#### Suggested Implementation Order

**Phase 4A (ship in week 1):** 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8
**Phase 4B (ship over weeks 2–4):** 4.19 (golden dataset first) → 4.9 → 4.10 → 4.11 → 4.14 → 4.15 → 4.18 → 4.12 → 4.13 → 4.16 → 4.17
**Phase 4C (months 2–3, opportunistic):** 4.20 → 4.21 → 4.22 → 4.23 → 4.24

#### Estimated Complexity & Effort

| Sub-phase | Complexity | Effort |
|---|---|---|
| 4A — immediate fixes | Low | ~3 days |
| 4B — core improvements | Medium-High | ~8 days |
| 4C — advanced | High (native module work) | ~14 days |
| **Total** | | **~25 days** |

#### Recommended Testing Strategy

- **OCR golden dataset is mandatory.** 50 anonymized receipts with ground-truth (merchant, date, items, total). Any change to `patterns.js`, `normalizeName.js`, `parseReceipt.js` must not reduce dataset accuracy by more than 2%
- Unit tests on every regex in `patterns.js` against 20+ real fragments per pattern
- Unit tests on `parseUnitToken`, `toCanonical`, `normalizeName_v2` for Hindi / mixed-script / unit edge cases
- Integration test: full pipeline with synthetic receipt generators
- Per-format accuracy targets (see `04-ocr/offline_ocr_stack.md`)
- Manual: Devanagari kirana receipt, faded thermal, perspective-distorted shot

---

### PHASE 5 — EXPENSE INTELLIGENCE

**Duration: 3–4 weeks**
**Goal: Unlock the 80% of daily friction — search, autocomplete, payment tracking, merchant intelligence, income, GST, batch ops, exports.**

#### Goals

1. Users can find any expense in under 3 taps.
2. Repeat merchants take ~6 taps to log, not ~12.
3. Power users can correct mistakes in bulk.
4. Income vs expense = savings rate.
5. GST data captured by OCR is finally persisted.
6. Data is portable (CSV/JSON/PDF export).

#### Features Delivered

| Feature ID | Feature |
|---|---|
| F-01 | Full-text search (expenses, items, subs) via FTS5 |
| F-02 | Advanced multi-dimension filters (date range, amount, payment method, merchant, mood, recurring) |
| F-03 | Payment method tracking (Cash / UPI / Credit / Debit / Wallet / EMI) |
| F-04 | Income tracking |
| F-07 | Data export — CSV, JSON, PDF |
| F-08 | Batch operations on expenses |
| F-09 | Merchant analytics + autocomplete |
| F-13 | GST invoice persistence |
| F-25 | Receipt image viewer + permanent storage |
| F-26 | Savings rate / cash flow |
| F-28 | Predictive amount input |
| F-30 | Smart merchant auto-category (bundled merchant map ~1,000 entries) |

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 5.1 | Migration: payment_method column on `expenses` (handled in Phase 3) | — |
| 5.2 | Search screen with FTS5 query, debounced TextInput, recent searches | 1.5 d |
| 5.3 | FilterSheet bottom sheet component + WHERE clause builder + saved_filters table | 2 d |
| 5.4 | Payment method picker in Add/EditExpense; payment badge in Detail/AllExpenses | 0.5 d |
| 5.5 | Income table migration + repo + Add screen Income/Expense toggle | 1.5 d |
| 5.6 | Savings rate widget on Home | 0.5 d |
| 5.7 | Export screen + CSV / JSON / PDF generators (via `expo-sharing`, `expo-print`) | 2 d |
| 5.8 | Batch select mode on AllExpenses (long-press, action bar, batch recategorize, batch delete, batch export) | 2 d |
| 5.9 | MerchantDetailScreen + top-merchants query + merchant autocomplete in Add | 2 d |
| 5.10 | `merchant_aliases` table; bundled `merchantMap.json` (~1k entries); auto-category logic in Add | 1.5 d |
| 5.11 | GST persistence in Scan.js + Detail screen GST breakdown UI | 1 d |
| 5.12 | Receipt image pipeline: copy to `documentDirectory/drift/receipts/`, generate thumbnail, strip EXIF, schema columns (handled in Phase 3) | 2 d |
| 5.13 | Receipt image viewer modal (pan/zoom) on Detail; receipt gallery section | 0.5 d |
| 5.14 | Predictive amount: on merchant input, query last amount + show "Last time: ₹X" chip | 0.5 d |
| 5.15 | Replace volatile `receipt_uri` with permanent `receipt_path` + `receipt_thumb`; lazy migrate existing records on first read | 1 d |

#### Refactors Required

- Add screen gains an Income/Expense toggle + merchant autocomplete + predictive amount chip + payment method picker
- AllExpenses gains FilterSheet, search bar, batch-select mode
- Scan persistence path now writes GST fields and uses permanent receipt storage
- New top-level Search tab or header icon

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bundled merchant map produces wrong categories for ambiguous merchants ("Swiggy Instamart" → food or groceries?) | Medium | User override always wins; persists to `merchant_aliases` |
| Predictive amount feels intrusive | Low | Chip is dismissible; only show after 3+ history matches |
| PDF generation slow on large date ranges | Medium | Cap at 12 months per export; show progress |
| Receipt image migration loses data | Medium | Migration copies, doesn't move; old `receipt_uri` retained until verified copy succeeds |
| Income tracking introduces a second top-level entity to every analytics surface | Low | Gate behind a settings flag for users who don't want it |

#### Dependencies

- Phase 1 (migrations)
- Phase 2 (clean per-feature contexts; otherwise income forces another god-context expansion)
- Phase 3 (`merchants` table, FTS5, receipt path columns, payment_method column)

#### Suggested Implementation Order

5.4 → 5.2 → 5.3 → 5.11 → 5.13 → 5.12 → 5.15 → 5.14 → 5.10 → 5.9 → 5.5 → 5.6 → 5.7 → 5.8

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Complexity | **Medium** |
| Risk of regression | **Low-Medium** |
| Effort | **~18 developer-days** |

#### Recommended Testing Strategy

- FTS5 search correctness: insert a row, search for substrings, assert hits
- Filter combinator: combinatorial test of 5 dimensions on a 1k-row synthetic dataset; assert correct row counts
- Export round-trip: export CSV → re-import → expect identical record set
- Batch ops: 50-row recategorize + delete; assert atomicity
- Receipt migration: legacy `receipt_uri` → new `receipt_path`, assert image still viewable
- Manual UX testing of Add flow speed for a power user (target: 6 taps for a repeat merchant)

---

### PHASE 6 — ANALYTICS ENGINE

**Duration: 3–4 weeks**
**Goal: Promote item-level OCR data into the analytics moat. Ship features that no competing Indian app has.**

#### Goals

1. A dedicated Analytics tab/hub surfacing cross-cutting insights.
2. Personal inflation basket index — the differentiator.
3. Cheapest-merchant-per-item analysis (already partially possible from `sameQtyHistory`).
4. Spending velocity, lifestyle inflation, seasonal patterns.
5. Multi-model cashflow forecasting (5-model ensemble).
6. Reorder prediction queue.
7. Subscription leakage score.
8. Day-of-week + day-of-month heatmaps.
9. Calendar spend view.
10. Category × month variance heatmap.

#### Features Delivered

- Analytics Hub screen (`features/analytics/screens/AnalyticsHub.js`)
- Inflation index screen
- Cheapest merchant per item view (extends `ItemTrend`)
- Spending velocity widget on Home
- Lifestyle inflation screen (QoQ drift detection)
- Seasonal patterns (12-month heatmap)
- Day-of-week + day-of-month heatmaps
- Cashflow forecast screen with 5-model ensemble + confidence cone
- Reorder queue screen
- Subscription leakage score widget
- Calendar spend view (`SpendingCalendar.js`)
- Category variance heatmap (`CategoryMonthMatrix.js`)
- Merchant intelligence screen (top merchants, avg basket, monthly trend per merchant)
- `analytics_cache` table for lazy materialization with TTL

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 6.1 | `analytics_cache` table migration + `getCached()` helper | 0.5 d |
| 6.2 | `src/analytics/` module structure: index.js, spend.js, items.js, subscriptions.js, forecast.js, seasonal.js, lifestyle.js, anomaly.js, patterns.js | 1 d |
| 6.3 | `spendingVelocity()` — rolling 7-day slope + classifier | 0.5 d |
| 6.4 | `inflationBasket()` — top-N item weighted index per month | 1 d |
| 6.5 | `cheapestMerchantPerItem()` — GROUP BY normalized_name, merchant | 0.5 d |
| 6.6 | `reorderQueue()` — repeat purchase detection with avg interval | 0.5 d |
| 6.7 | `lifestyleInflation()` — QoQ category drift detection | 1 d |
| 6.8 | `subscriptionLeakage()` — total monthly subs / total monthly spend | 0.5 d |
| 6.9 | `cashflowForecast()` — ensemble of 5 models (weighted linear, historical month, rolling 90d, recurring-aware, dow-pattern); `approxNormalCDF()` for probability of going over budget | 2 d |
| 6.10 | `seasonalCalendar()` — 12-cell month-of-year heatmap; `dayOfWeekPattern()`; `dayOfMonthHistogram()` | 1 d |
| 6.11 | `categoryVarianceMatrix()` — category × month grid | 0.5 d |
| 6.12 | Analytics Hub screen with cards: velocity, inflation, lifestyle drift, sub leakage, reorder queue | 1.5 d |
| 6.13 | Inflation index screen with line chart + top risers/fallers | 1 d |
| 6.14 | Cheapest merchant tab on ItemTrend | 0.5 d |
| 6.15 | Lifestyle inflation screen | 0.5 d |
| 6.16 | Forecast screen with 5-model display + confidence cone (`react-native-svg`) | 1.5 d |
| 6.17 | Reorder queue screen | 0.5 d |
| 6.18 | Spending calendar screen | 1 d |
| 6.19 | Category variance heatmap screen | 0.5 d |
| 6.20 | Merchant intelligence screen (top merchants leaderboard + per-merchant detail) | 1 d |
| 6.21 | Tab bar restructure: Home / Capture / Analytics / Subs (or "You") | 0.5 d |
| 6.22 | Year-over-year and month-over-month comparison toggles in Trends | 0.5 d |

#### Refactors Required

- New top-level "Analytics" tab replaces "Trends" or sits alongside it
- Tab bar restructure (Home / Capture / + / Analytics / You)
- Chart components consolidated into `components/charts/` (SparkBars, BarChart, AreaChart, HeatmapGrid, Sankey, DonutChart, LineChart with confidence band)

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ensemble forecast has high error for users with < 3 months of data | Medium | Show only the model(s) that have enough data; degrade gracefully to weighted linear |
| Personal inflation index is dominated by 1–2 items | Medium | Cap weight per item at 10%; require ≥ 5 distinct items |
| Lifestyle inflation flags users who legitimately upgraded their lifestyle | Low | This is a feature, not a bug; framing as "drift" not "problem" |
| Analytics cache invalidation bugs leave stale data on screen | Medium | Tag-based invalidation; daily verification job |
| Too many screens overwhelm users | Medium | Analytics Hub is the entry point; everything else is a drill-down |

#### Dependencies

- Phase 3 (rollup tables make many of these queries cheap)
- Phase 5 (merchant analytics needs `merchants` entity, income needed for accurate forecast)

#### Suggested Implementation Order

6.1 → 6.2 → 6.3 → 6.8 → 6.6 → 6.10 → 6.11 → 6.5 → 6.14 → 6.4 → 6.13 → 6.7 → 6.15 → 6.20 → 6.9 → 6.16 → 6.17 → 6.18 → 6.19 → 6.12 → 6.22 → 6.21

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Complexity | **Medium-High** (mostly SQL + charts) |
| Risk of regression | **Low** (additive surface) |
| Effort | **~17 developer-days** |

#### Recommended Testing Strategy

- Unit tests on each analytics function with a known synthetic dataset; assert specific output values
- Snapshot tests on each new screen
- Forecast accuracy harness: holdout 2 months of historical data; run ensemble against the rest; assert MAE < 15%
- Cache invalidation: trigger every mutation type; assert affected cache keys are evicted
- Chart visual regression: take screenshots on a stable dataset; compare against baseline

---

### PHASE 7 — POWER USER FEATURES

**Duration: 4–6 weeks**
**Goal: The features users name when they say "I'd pay for this." India-first depth.**

#### Goals

1. Notifications (subscription due, budget overrun, price spike).
2. Subscription calendar + smart alerts.
3. Tags / custom labels.
4. Calendar view.
5. EMI tracking.
6. Fuel & vehicle tracking.
7. UPI / Bank SMS auto-import (the highest-impact India-specific feature).
8. Credit card statement import (CSV phase 1).
9. Pantry / household inventory.
10. Item price alerts.
11. Split expenses.
12. Rollover budgets.
13. Recurring expense detection.
14. Utility bill unit-rate tracking.
15. Net worth trajectory (requires `account_snapshots`).

#### Features Delivered

| ID | Feature |
|---|---|
| F-05 | Push notifications + budget alerts |
| F-10 | Subscription calendar + alerts |
| F-11 | Recurring expense auto-detection |
| F-12 | Tags |
| F-14 | EMI tracking + amortization |
| F-16 | Fuel & vehicle tracking |
| F-18 | Pantry / inventory |
| F-19 | Item price alerts |
| F-20 | Calendar spend view (overlaps Phase 6) |
| F-21 | Rollover budgets |
| F-22 | Split expenses |
| F-24 | Utility bill unit-rate tracking |
| F-06 | UPI / Bank SMS import |
| F-15 | Credit card statement import (CSV) |
| Net Worth | Snapshot trajectory |

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 7.1 | Notifications: integrate `expo-notifications`; budget threshold checker; sub-due scheduler; price alert checker; `notification_log` table | 2 d |
| 7.2 | Subscription calendar screen + 3-day-before reminder schedule | 1.5 d |
| 7.3 | Tags table + UI in Add/EditExpense + filter integration | 1.5 d |
| 7.4 | Calendar view screen | 1.5 d |
| 7.5 | EMI tracking: `emi_loans` table; amortization JS function; EMI screen; EditEMI screen; link payments to expenses | 3 d |
| 7.6 | Fuel & vehicle tracking: `vehicles` + `fuel_fillups` tables; OCR integration to suggest fill-up from fuel format | 3 d |
| 7.7 | Pantry: `pantry_items` table; auto-populate from scanned receipt; depletion UX; shopping list query; low-stock notification | 4 d |
| 7.8 | Item price alerts: `price_alerts` table; check on scan; alert UI | 1.5 d |
| 7.9 | Split expenses: `people` + `expense_splits` tables; split screen; balance tracker | 2 d |
| 7.10 | Rollover budgets: `budget_rollover` table; end-of-month job; UI for alert threshold per category | 1.5 d |
| 7.11 | Recurring expense detection: pattern detection query; "Expected this month" widget | 1.5 d |
| 7.12 | Utility bill tracking: `utility_accounts` + `utility_bills` tables; consumption + rate trends | 3 d |
| 7.13 | Net worth snapshot: `account_snapshots` table; nightly snapshot job; trajectory chart | 1 d |
| 7.14 | UPI / Bank SMS import: native module for inbox access; 30+ bank templates; parser; draft review UI; duplicate dedup | 6 d |
| 7.15 | CSV statement import (HDFC, SBI, ICICI Credit Card formats); reconciliation UI | 4 d |

#### Refactors Required

- New top-level "Subs" or "Money" tab now hosts: subscriptions, EMIs, vehicles, utilities (or merge into "You" tab as in the proposed IA)
- Notification service wired into AppContext (or per-feature hooks)
- SMS import requires Android `READ_SMS` permission — opt-in flow

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `READ_SMS` permission rejected by Google Play unless usage policy is met | High | Use `BIND_NOTIFICATION_LISTENER_SERVICE` alternative; file Google Play Console "Sensitive Permission" declaration |
| SMS template churn (banks change format) | High | Templates configurable; user can submit a sample to expand the registry |
| Pantry manual depletion gets ignored | High | Depletion is optional; auto-deplete from consumption rate as fallback |
| EMI amortization off-by-one (Indian banking rounds differently per bank) | Medium | Allow user to override `emi_amount`; flag drift |
| Split expense becomes a sub-product (settlement, integrations…) | Medium | Scope to: record splits + show balance. Defer settlement integration to Phase 8 |
| Background notifications unreliable on aggressive battery savers (Xiaomi, OnePlus) | Medium | Use foreground checks as backup; explicit user guidance |

#### Dependencies

- Phase 3 (most features add tables)
- Phase 4 (OCR template learning helps utility bill recognition)
- Phase 5 (`merchants` table, payment_method, receipt storage)

#### Suggested Implementation Order

7.1 → 7.2 → 7.3 → 7.4 → 7.11 → 7.10 → 7.13 → 7.5 → 7.6 → 7.8 → 7.7 → 7.9 → 7.12 → 7.15 → 7.14

The order intentionally puts the highest-effort/highest-risk SMS import last so a v1.7 ships without it if scope pressure rises.

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Complexity | **Medium-High** (SMS import is High) |
| Risk of regression | **Medium** |
| Effort | **~37 developer-days** |

#### Recommended Testing Strategy

- Notification scheduling: assert correct fire time + non-duplicate firing
- SMS parser: per-bank fixture set of 20 real (anonymized) SMS messages per bank; assert correct extraction
- EMI amortization: snapshot test against a known schedule
- Pantry auto-deplete: assert quantities decrease correctly across consumption events
- Split expense balance: synthetic group of 3 with multiple splits; assert running balance is correct
- Real-device test on Xiaomi (aggressive battery saver) for notifications

---

### PHASE 8 — LONG-TERM SCALING

**Duration: ongoing, opportunistic**
**Goal: Bring the app to a state where it scales to 10+ years of data and remains responsive on mid-tier Android.**

#### Goals

1. Virtualize every long list (`FlatList`/`SectionList`).
2. Move OCR parse off the JS critical path (chunked `setImmediate`).
3. Receipt image pipeline complete: WebP, thumbnails, lifecycle GC.
4. Daily maintenance job: `PRAGMA optimize`, `ANALYZE`, `VACUUM`, orphan receipt cleanup, rollup-drift verification, `PRAGMA quick_check`.
5. One-tap encrypted backup + restore (`.driftbackup` AES-GCM zip).
6. Query cache layer (custom hook or `@tanstack/react-query`) with tag-based invalidation.
7. Observability: dev-only query timing, persistent `db_stats`, React Profiler wrappers on the four heaviest screens.
8. Biometric / PIN lock (P1 security feature).
9. SQLCipher encryption-at-rest evaluation (deferred decision).
10. Cloud sync architecture (deferred decision — only if user demand emerges; design keeps doors open).
11. Anomaly detection (Z-score-based, P3 from `missing_analytics.md`).
12. Price prediction (12+ months of item data required; P3).

#### Features Delivered

- Virtualized FlatList migration on AllExpenses, PotDetail, Items, ItemTrend history, Trends per-category list, Subs, Goals, Travel
- `expo-image` replaces `<Image>` everywhere
- OCR parse runs in chunks with `InteractionManager.runAfterInteractions` + `setImmediate` between phases
- Receipt image pipeline: `documentDirectory/drift/receipts/{full,thumb}/`, WebP at 1600px / 320px, EXIF stripped, sha-1 hash for dedup
- Daily maintenance service
- `.driftbackup` encrypted backup + atomic restore
- Custom `useQuery` hook with `staleTime`, `cacheTime`, tag-based invalidation
- Dev-only query timing wrapper around `exec/all/one`
- Biometric / PIN lock via `expo-local-authentication`
- `account_snapshots` nightly job for net worth trajectory

#### Technical Tasks

| # | Task | Effort |
|---|---|---|
| 8.1 | Migrate `AllExpenses.js` to `SectionList` (grouped by day) with `getItemLayout` | 1 d |
| 8.2 | Migrate `PotDetail`, `Items`, `ItemTrend` history, `Trends` per-category, `Subs`, `Goals`, `Travel` to `FlatList` | 2 d |
| 8.3 | `React.memo` audit on every list row component | 0.5 d |
| 8.4 | Adopt `expo-image`; set `recyclingKey={uri}` in lists | 0.5 d |
| 8.5 | OCR parse chunking: yield after header, items, footer, confidence stages; cancellable via `scanRequestId` ref | 1 d |
| 8.6 | Receipt image pipeline: `app/src/media/receipts.js`, copy + compress + thumbnail + EXIF strip + hash on every save; migrate `receipt_uri` lazily | 3 d |
| 8.7 | Maintenance job: `app/src/maintenance/index.js`; runs on background→foreground transition, rate-limited daily | 2 d |
| 8.8 | Encrypted backup: zip `drift.db` + `receipts/`; AES-GCM via `expo-crypto`; user-supplied passphrase; restore via atomic DB swap | 3 d |
| 8.9 | Custom `useQuery` hook with `Map<queryKey, {data, fetchedAt}>`; `staleTime` per key; tag-based invalidation; LRU bound of ~64 keys | 2 d |
| 8.10 | Dev-only `withTiming(repoMethod)` wrapper; logs slow queries; React Profiler wrappers on Home / Trends / AllExpenses / Items | 0.5 d |
| 8.11 | Biometric / PIN lock via `expo-local-authentication`; settings toggle | 1 d |
| 8.12 | `account_snapshots` table + nightly snapshot job + net worth trajectory chart | 1.5 d |
| 8.13 | Anomaly detection: per-category µ ± 2σ from 90-day rolling; flag in Detail screen | 1.5 d |
| 8.14 | Price prediction stub: linear regression per item; surface in ItemTrend (requires 12+ months data per item) | 2 d |
| 8.15 | SQLCipher feasibility spike (encryption-at-rest); decide go/no-go | 1 d |
| 8.16 | Cloud sync architectural spike (CRDT or last-write-wins, conflict resolution, identity model); design doc only | 2 d |

#### Refactors Required

- Image rendering migrates to `expo-image`
- All long lists migrate to FlatList/SectionList
- OCR parse refactors to a stage-chunked async generator
- Receipt path replaces volatile `receipt_uri` everywhere

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| FlatList migration introduces row layout shifts | Medium | `getItemLayout` everywhere row height is fixed; visual regression tests |
| OCR chunking introduces stale-result race | Medium | `scanRequestId` ref; discard if mismatched on completion |
| Receipt image pipeline blocks save UX | Medium | Compression runs async; save records the path optimistically and updates after compression completes |
| Backup file size grows to GBs with full receipt set | Medium | Offer "metadata only" backup option; export only DB without receipts |
| SQLCipher kills perf 30%+ | High | Spike first; defer unless threat model justifies |

#### Dependencies

- Phase 1, 2, 3 complete
- Many tasks here can land in any order; they're scoped as "ongoing"

#### Suggested Implementation Order

8.7 → 8.5 → 8.6 → 8.4 → 8.1 → 8.2 → 8.3 → 8.9 → 8.10 → 8.8 → 8.11 → 8.12 → 8.13 → 8.14 → 8.15 → 8.16

#### Estimated Complexity & Effort

| Axis | Score |
|---|---|
| Complexity | **Medium-High** (image pipeline, backup, query cache) |
| Risk of regression | **Medium** (touches data, image, list rendering) |
| Effort | **~24 developer-days** spread over months |

#### Recommended Testing Strategy

- Load test: synthetic 100k-expense DB; assert Home renders < 100 ms, AllExpenses scrolls at 60 fps, Items tab opens < 200 ms
- Memory leak detection: enter/exit AllExpenses 20× in a row; assert JS heap stable
- Backup round-trip: create backup, wipe app data, restore, assert byte-identical DB + all receipts viewable
- Encryption check on backup: tamper a byte; assert decryption fails cleanly
- Query cache hit rate: navigate Home → Trends → Home; assert ≥ 70% hit rate
- Real-device performance test on Pixel 6a (mid-tier reference)

---

## Cross-Phase Dependencies

```
Phase 1 (Foundation)
   ├── unblocks → Phase 2 (Architecture)
   ├── unblocks → Phase 3 (Database)
   └── unblocks → every schema-touching feature in Phases 4–7

Phase 2 (Architecture)
   ├── strongly recommended before → Phase 3 (cleaner repo placement)
   └── strongly recommended before → Phase 5 (new contexts cleanly add income, etc.)

Phase 3 (Database)
   ├── enables → Phase 4 (template learning needs tables)
   ├── enables → Phase 5 (merchants table, FTS5, soft delete)
   ├── enables → Phase 6 (rollups make analytics cheap)
   └── enables → Phase 7 (every Power-User feature is a new entity)

Phase 4 (OCR)
   └── enriches → Phase 5 (GST persistence), Phase 6 (item-level data quality)

Phase 5 (Expense Intel)
   └── enables → Phase 6 (merchant analytics, income for forecast)

Phase 6 (Analytics)
   └── informs → Phase 7 (recurring detection, anomaly base)

Phase 7 (Power Features)
   └── completes the differentiated v2 surface

Phase 8 (Scaling)
   └── ongoing — opportunistic, parallel to 4–7 where capacity allows
```

---

## Aggregate Timing & Resource Plan

| Phase | Effort (dev-days) | Calendar weeks (1 dev) | Calendar weeks (2 devs in parallel where possible) |
|---|---|---|---|
| 1 — Foundation | 7 | 1.5 | 1 |
| 2 — Architecture | 11 | 2.5 | 1.5 |
| 3 — Database | 10 | 2 | 1.5 |
| 4 — OCR | 25 | 5 | 3.5 |
| 5 — Expense Intel | 18 | 4 | 2.5 |
| 6 — Analytics | 17 | 3.5 | 2.5 |
| 7 — Power Features | 37 | 7.5 | 5 |
| 8 — Scaling | 24 | 5 | 3 |
| **Total** | **149 dev-days** | **~31 weeks (~7 months)** | **~20 weeks (~5 months)** |

The ordering above is conservative. Phases 4 (4A only) and 8 (selected tasks) can run partly in parallel with Phases 5–7 once Phase 3 lands.

---

## Acceptance Criteria Per Phase (Gating)

| Phase | Phase passes when… |
|---|---|
| 1 | Release-signed AAB uploads to Play Console; migrations run cleanly on every existing-data fixture; no silent errors; WAL active |
| 2 | `useApp()` shim removed; React Profiler shows targeted re-renders only; `EXPLAIN QUERY PLAN` shows no SCAN TABLE on Home queries |
| 3 | All hot queries use indexes; rollup totals match base table totals; FTS5 search latency < 50 ms at 100k rows |
| 4A | OCR golden dataset accuracy ≥ baseline; Hindi names preserved in normalized form; duplicate detection fires on test fixture |
| 4B/C | Per-format accuracy targets met (see `04-ocr/offline_ocr_stack.md`); Devanagari + Tamil + Telugu sample receipts parse correctly |
| 5 | A repeat-merchant Quick Add takes ≤ 6 taps; Search returns results in < 100 ms at 100k rows; CSV export round-trips bytes-identical |
| 6 | Analytics Hub renders < 200 ms; inflation index computed from real data; forecast MAE < 15% on holdout test |
| 7 | All Tier-1 power features ship behind feature flags; SMS import handles 5+ banks with > 90% parse accuracy |
| 8 | 100k-row dataset renders smoothly; backup/restore byte-identical; biometric lock guards app launch |

---

## Out of Scope (Explicit Non-Goals)

- Multi-user / family sharing (single-user only)
- Real-time cloud sync (deferred — design keeps doors open in Phase 8)
- iOS app (architecture is RN, but execution is Android-first)
- Server-side OCR (Gemini backend remains a future fallback, not a primary path)
- Investment portfolio tracking (out of scope for v2; possibly v3)
- Real bank API integrations (Account Aggregator framework) — deferred
- Multi-tenant backend (irrelevant to local-first product)
