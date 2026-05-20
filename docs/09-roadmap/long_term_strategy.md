# Drift — Long-Term Strategy

> Companion to `execution_roadmap.md`
> Synthesis date: 2026-05-17
> Horizon: 10+ years of single-user financial data on a single mid-tier Android device

---

## Strategic Frame

Drift's enduring strategic position is **the only personal finance app that combines item-level OCR intelligence with a true offline-first commitment**. Competing Indian apps (Walnut, Money Manager, ETMONEY, Cred Money) optimize for SMS-based aggregation, syncing to the cloud, and product-promotion economics. Drift's moat is the opposite: every receipt scan enriches an on-device knowledge graph of the user's purchases, prices, and consumption — none of which leaves the device.

The long-term strategy preserves this moat as data grows, hardware capabilities improve, and feature scope expands. Three principles govern every choice in this document:

1. **Local-first is non-negotiable.** Any feature that requires the cloud as a hard dependency must be re-scoped or rejected. Cloud sync is opt-in, end-to-end-encrypted, and architecturally optional.
2. **Schema-first scaling.** The data model is the long-term asset. Migrations, rollups, and audit trails matter more than UI patterns; UI can change yearly, schema cannot.
3. **Cost of correctness > cost of features.** A wrong total in budget rollover is worse than a missing feature. Every feature ships with verification (rollup drift checks, integrity checks, fingerprint-based dedup).

---

## SECTION 1 — Suggested Target Architecture

### 1.1 High-Level Layered Architecture (v2)

```
┌───────────────────────────────────────────────────────────────────────┐
│                            UI LAYER                                    │
│  features/{feature}/screens/  +  components/primitives/                │
│  Stateless presentational where possible; React.memo on every screen   │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌───────────────────────────────────────────────────────────────────────┐
│                       FEATURE HOOKS LAYER                              │
│  features/{feature}/use{Feature}.js                                    │
│  One context per domain entity; emits invalidation events              │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ calls
┌───────────────────────────────────────────────────────────────────────┐
│                      SERVICE / USE-CASE LAYER                          │
│  features/{feature}/{Feature}Service.js                                │
│  features/scan/ScanService — composes camera + OCR + parse + save     │
│  features/analytics/* — composes repos + cache + aggregations         │
│  features/exports/* — composes repos + serializers + sharing          │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ calls
┌───────────────────────────────────────────────────────────────────────┐
│                       REPOSITORY LAYER                                 │
│  features/{feature}/repo.js                                            │
│  Pure functions: (db, params) → rows                                   │
│  No React, no UI dependencies. Testable in isolation                   │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌───────────────────────────────────────────────────────────────────────┐
│                    CORE / DOMAIN LAYER                                 │
│  core/domain/ — units, normalize, produce, currencies, constants       │
│  core/utils/ — format, date, fuzzy match, hashing                      │
│  core/theme/ — tokens + ThemeContext                                   │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌───────────────────────────────────────────────────────────────────────┐
│                       DATA / DB LAYER                                  │
│  core/db/index.js — getDB, exec, all, one                              │
│  core/db/schema.js — migrations, indexes, triggers                     │
│  core/db/cache.js — analytics_cache helpers                            │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌───────────────────────────────────────────────────────────────────────┐
│           PLATFORM LAYER (expo-sqlite + native modules)                │
│  - expo-sqlite — SQLite 3.45+ (WAL, FTS5, generated cols, windows)     │
│  - ImagePreprocess.kt — native Kotlin OpenCV bridge                    │
│  - SmsReader.native.js — native SMS inbox access (Android only)        │
│  - Tesseract — fallback OCR engine                                     │
│  - expo-image — image rendering with mem+disk cache                    │
│  - expo-notifications — local notifications                            │
│  - expo-file-system — permanent receipt storage                        │
│  - expo-crypto — AES-GCM for backups                                   │
└───────────────────────────────────────────────────────────────────────┘
                              ▲ isolated peer
┌───────────────────────────────────────────────────────────────────────┐
│                          OCR PIPELINE                                  │
│  ocr/ — pure JS, zero React, depends on core/domain only               │
│  textRecognition → preprocess → mergeRows → detectFormat →             │
│  detectColumns → extractItems → normalize → confidence → fingerprint   │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 Module Dependency Rules (Enforced)

```
ocr/         → core/domain only. NEVER imports features/* or components/*
core/        → core/* only. NEVER imports anything above
features/X/  → core/* + components/primitives + features/X/* only
                (NEVER imports features/Y for any X≠Y, except via events)
components/  → core/theme only
navigation/  → features/* (screen refs) + core/theme (ThemeContext) only
```

Enforced by ESLint rules (`eslint-plugin-import` + a custom rule), failing CI on any violation.

### 1.3 State Architecture (v2)

```
App root
  ProfileProvider
    SettingsProvider
      ThemeProvider                            ← navigation reads ThemeContext only
        ExpensesProvider
          CategoriesProvider
            ItemsProvider
              MerchantsProvider
                SubsProvider
                  GoalsProvider
                    AccountsProvider
                      TravelProvider
                        TagsProvider
                          AnalyticsProvider    ← lazy-mounted; reads cache layer
                            <Navigation />
```

Each Provider is responsible for:
- Owning the in-memory state for its entity (paginated, not full)
- Exposing mutations as named functions (no raw repo access)
- Emitting invalidation events for the cache layer
- Subscribing to cross-entity events that affect its data

Total re-renders on a single mutation: only the providers whose data changed.

### 1.4 Query Cache Layer (`useQuery`)

A tiny custom hook (~80 lines) keyed by `(repo, method, args)`:

```js
const { data, isLoading, error } = useQuery({
  key: ['expenses', 'page', { month: '2026-05' }],
  fetcher: () => expensesRepo.page({ month: '2026-05' }),
  staleTime: 30_000,
  tags: ['expense', 'expense:2026-05'],
});
```

- `staleTime` per key (configured in a registry)
- `tags`: write paths emit `invalidate(['expense'])`; entries with matching tags refetch
- LRU-bounded at 64 entries
- Optional adoption of `@tanstack/react-query` if the custom hook grows complex

### 1.5 Service Layer Composition

```
ScanService.processReceipt(uri)
  └── ImagePreprocess.preprocess(uri)             [Native Kotlin]
        └── ML Kit v2 recognize(preprocessed)     [Native]
              └── parseReceipt(ocr, config)        [JS, chunked]
                    └── normalizeName_v2(item)     [JS, Unicode-safe]
                          └── matchProduct(name)   [Trie + Trigram]
                                └── resolveMerchant(text, gstin) [Jaro-Winkler]
                                      └── fingerprintReceipt(parsed) [FNV-1a]
                                            └── duplicateCheck(hash)
                                                  └── return parsed
```

Screens consume `ScanService.processReceipt(uri)` — they never orchestrate the pipeline directly.

### 1.6 Background / Deferred Work Architecture

Drift has no server, so "background" means deferred-out-of-render-path. Mechanisms:

| Layer | Purpose | Trigger |
|---|---|---|
| **InteractionManager.runAfterInteractions** | UI yields after every animation frame; OCR chunks, large list pre-renders | After every screen mount |
| **setImmediate chunks** | Long synchronous work (OCR parse stages) | Inside services |
| **AppState background → foreground hook** | Daily maintenance, snapshot jobs | OS transition |
| **Local notifications scheduler** | Future-dated reminders (sub due, budget alert, price alert) | On entity write |
| **Coalesced writes** | Batch DB writes within 250ms window | Inside services |

No threads (RN has none); no Web Workers (no support). Where parallelism matters, native modules (`ImagePreprocess.kt`, `SmsReader.kt`) run off the JS thread.

---

## SECTION 2 — Suggested Final Database Strategy

### 2.1 The Target Schema

A 22-table schema (vs current 10) that supports every feature in the roadmap. Full DDL is in `03-database/future_schema.md`. Summary:

```
SINGLETONS
  profile (id=1), settings (id=1), schema_version (id=1)

ENTITIES
  merchants, products, categories, accounts, vehicles, people

TRANSACTIONS
  expenses        (with merchant_id, account_id, trip_id, subscription_id,
                   emi_loan_id, currency, amount_home, fx_rate, receipt_path,
                   receipt_thumb, receipt_hash, deleted_at)
  receipt_items   (with product_id, cgst_rate, sgst_rate, hsn, deleted_at)
  income          (with category, recurring)
  account_transactions  (ledger-style append-only)
  goal_contributions    (audit trail)

RECURRING / SCHEDULES
  subscriptions   (with cancelled_at, linked_category_id)
  emi_loans       (with amortization schedule, link to expenses)
  fuel_fillups
  utility_bills
  budget_rollover
  trip_categories

INVENTORY
  pantry_items
  price_snapshots

PREDICTIONS / ALERTS
  price_alerts
  notification_log

GROUPING / ORG
  tags, expense_tags
  expense_splits

MATERIALIZED ROLLUPS
  monthly_summary  (auto-maintained via triggers)
  item_summary
  analytics_cache  (lazy, with TTL)

SEARCH INDEXES
  expense_fts (FTS5)
  item_fts (FTS5)
  product_fts (FTS5)

LEARNING
  merchant_aliases (user-curated, supplements bundled merchantMap.json)
  receipt_templates (learned per merchant)

BACKUP / IMPORT
  sms_import_log
  import_sessions
  account_snapshots (nightly net worth snapshots)
```

### 2.2 Schema Principles for the Long Term

1. **Additive migrations only.** Never drop a column in a production database. Use `deleted_at` for soft delete; deprecate columns by ceasing writes, not by dropping.
2. **Every financial entity has `deleted_at TEXT`.** Soft delete enables undo and protects against UX accidents.
3. **Every long-lived value has an audit trail.** `goals.saved_amount` is the cache; the truth is in `goal_contributions`. `accounts.balance` is the cache; truth is `account_transactions`.
4. **Generated columns for non-SARGable predicates.** Anything wrapped in `substr()`, `strftime()`, etc., gets a stored generated column with an index.
5. **CHECK constraints on every enum-style column.** `subscriptions.verdict`, `accounts.kind`, `receipt_items.kind`, `categories.budget_period`, `expense_splits.direction`.
6. **Rollups maintained by triggers, verified by a daily job.** `monthly_summary` and `item_summary` are derived data — corruption is recoverable from base tables.
7. **FTS5 virtual tables shadow text-heavy columns.** No `LIKE '%...%'` in production code paths.
8. **Foreign keys with explicit cascade behavior.** `expense_id` → CASCADE delete of receipt_items. `category_id` → SET NULL on category delete (preserve history). `merchant_id` → SET NULL (analytics tolerates missing merchants).
9. **UUID-ready, not UUID-now.** Stay on `INTEGER AUTOINCREMENT` PKs for local-first; reserve UUID columns (`uuid TEXT` with unique index) on every table to enable future cloud sync without a PK migration.

### 2.3 Migration Discipline

```js
// db/migrations/index.js
export const MIGRATIONS = [
  // v1 — initial baseline (must match what shipped in v1.0)
  { version: 1, sql: BASELINE_SCHEMA, description: 'Initial baseline schema' },

  // v2..vN — every change additive
  { version: 2, sql: `ALTER TABLE expenses ADD COLUMN deleted_at TEXT`, description: 'Soft delete on expenses' },
  // ...
];

export async function runMigrations(db) {
  const { version } = await db.getFirstAsync('SELECT version FROM schema_version WHERE id = 1');
  for (const migration of MIGRATIONS.filter(m => m.version > version)) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.runAsync('UPDATE schema_version SET version = ? WHERE id = 1', [migration.version]);
    });
  }
}
```

Every migration is:
- Idempotent (`IF NOT EXISTS`)
- Transaction-wrapped
- Tested against a fixture DB at the previous version
- Versioned in source control with a description
- Never edited after release (only new migrations are added)

### 2.4 Scaling the Schema to 10+ Years

| Year | Expenses | Items | Receipts (images) | DB size | Image storage |
|---|---|---|---|---|---|
| 1 | ~3k | ~15k | ~1k | ~10 MB | ~800 MB |
| 3 | ~10k | ~50k | ~3k | ~30 MB | ~2.4 GB |
| 5 | ~18k | ~90k | ~5k | ~55 MB | ~4 GB |
| 10 | ~36k | ~180k | ~10k | ~110 MB | ~8 GB |

(Receipt images dominate disk by 50–100×. Image pipeline is the single biggest scaling lever.)

DB performance projection at year 10 (with rollups + indexes + WAL):
- Home render: < 100 ms (rollup hit)
- AllExpenses month query: < 50 ms (indexed range scan)
- Trends 12-month: < 80 ms (rollup hit)
- Items tab: < 100 ms (item_summary hit, lazy spark)
- FTS5 merchant search: < 50 ms on 100k rows
- Add expense: < 50 ms (optimistic patch + transaction)

### 2.5 Data Integrity Guarantees

- `PRAGMA foreign_keys = ON` (already set)
- `PRAGMA quick_check` on every boot; recovery flow if it fails
- Daily integrity job verifies a random month's rollup against base table; rebuilds on drift
- `account_transactions` is append-only with a CHECK on `direction IN ('in','out')`
- `goal_contributions` is append-only with `amount > 0` constraint
- Soft delete predicate is enforced via repo helper, not hand-written in each query

---

## SECTION 3 — Suggested Indexing / Search Strategy

### 3.1 Target Index Set (Complete)

```sql
-- Expenses: time-series + dimension filters
CREATE INDEX idx_exp_date_id      ON expenses(expense_date DESC, id DESC)
                                  WHERE deleted_at IS NULL;
CREATE INDEX idx_exp_month_cat    ON expenses(month_key, category_id)
                                  WHERE deleted_at IS NULL;
CREATE INDEX idx_exp_cat_date     ON expenses(category_id, expense_date DESC)
                                  WHERE deleted_at IS NULL;
CREATE INDEX idx_exp_merchant     ON expenses(merchant_id, expense_date DESC);
CREATE INDEX idx_exp_account      ON expenses(account_id, expense_date DESC)
                                  WHERE account_id IS NOT NULL;
CREATE INDEX idx_exp_trip         ON expenses(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX idx_exp_sub          ON expenses(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_exp_emi          ON expenses(emi_loan_id) WHERE emi_loan_id IS NOT NULL;
CREATE INDEX idx_exp_recurring    ON expenses(recurring) WHERE recurring = 1;
CREATE INDEX idx_exp_payment      ON expenses(payment_method, expense_date DESC);
CREATE UNIQUE INDEX idx_exp_hash  ON expenses(receipt_hash) WHERE receipt_hash IS NOT NULL;

-- Receipt items: price history + cascade delete
CREATE INDEX idx_items_expense    ON receipt_items(expense_id);
CREATE INDEX idx_items_name_date  ON receipt_items(normalized_name, purchase_date DESC, id DESC)
                                  WHERE deleted_at IS NULL;
CREATE INDEX idx_items_kind_date  ON receipt_items(kind, purchase_date DESC);
CREATE INDEX idx_items_month      ON receipt_items(month_key);
CREATE INDEX idx_items_product    ON receipt_items(product_id, purchase_date DESC)
                                  WHERE product_id IS NOT NULL;

-- Merchants, products, accounts, tags
CREATE UNIQUE INDEX idx_merchants_canonical ON merchants(canonical_name COLLATE NOCASE);
CREATE UNIQUE INDEX idx_products_name       ON products(normalized_name);
CREATE INDEX idx_acctxn_account_date        ON account_transactions(account_id, txn_date DESC);
CREATE INDEX idx_goal_contrib_goal          ON goal_contributions(goal_id, contributed_at DESC);
CREATE INDEX idx_expense_tags_tag           ON expense_tags(tag_id);

-- Subscriptions + alerts
CREATE INDEX idx_subs_next_bill   ON subscriptions(next_bill)
                                  WHERE cancelled = 0 AND next_bill IS NOT NULL;
CREATE INDEX idx_price_alerts_active ON price_alerts(normalized_name)
                                     WHERE enabled = 1;

-- Pantry + price snapshots
CREATE UNIQUE INDEX idx_pantry_product ON pantry_items(product_id);
CREATE INDEX idx_price_snap_product_date ON price_snapshots(product_id, snapshot_date DESC);

-- Rollups
CREATE INDEX idx_summary_month    ON monthly_summary(month_key);
CREATE INDEX idx_item_summary_last ON item_summary(last_seen DESC);
```

### 3.2 Full-Text Search Strategy

Two FTS5 virtual tables shadow the text-heavy base tables:

```sql
CREATE VIRTUAL TABLE expense_fts USING fts5(
  merchant_text, notes,
  content='expenses', content_rowid='id'
);

CREATE VIRTUAL TABLE item_fts USING fts5(
  name, normalized_name,
  content='receipt_items', content_rowid='id'
);

CREATE VIRTUAL TABLE product_fts USING fts5(
  display_name, brand,
  content='products', content_rowid='id'
);
```

Kept in sync via triggers `AFTER INSERT/UPDATE/DELETE` on the base tables.

Search latency targets:
- Expense merchant/notes search: < 20 ms at 100k rows
- Item name search: < 20 ms at 500k rows
- Combined (search both): < 50 ms

### 3.3 Index Hygiene

```sql
-- After every 1000 mutations
PRAGMA analysis_limit = 400;
ANALYZE;

-- After app idle (on background → foreground)
PRAGMA optimize;

-- Daily, if freelist_count > 1000 AND idle > 30s
VACUUM;
```

Runs from `app/src/maintenance/index.js`, rate-limited to once per day.

### 3.4 Query Plan Validation in CI

Every hot query has an `EXPLAIN QUERY PLAN` assertion in tests:

```js
test('summaryByCategory uses index', async () => {
  const plan = await db.all('EXPLAIN QUERY PLAN ' + SUMMARY_BY_CATEGORY_SQL, [...]);
  expect(plan.join(' ')).not.toContain('SCAN TABLE expenses');
  expect(plan.join(' ')).toContain('idx_exp_month_cat');
});
```

CI fails if any new "SCAN TABLE" appears on a hot-path query.

---

## SECTION 4 — Suggested Analytics Engine Strategy

### 4.1 Three-Layer Cache Architecture

```
Layer A — SQL page cache + mmap (PRAGMAs, 20 MB page cache, 256 MB mmap)
Layer B — Materialized rollup tables maintained by triggers (always fresh)
Layer C — In-memory query cache (Map keyed by query, tag-based invalidation)
```

| Layer | What it caches | Invalidation |
|---|---|---|
| A | Hot pages of base tables and indexes | LRU; managed by SQLite |
| B | `monthly_summary` (per category per month), `item_summary` (per product) | Triggers on base table writes; daily integrity check |
| C | Query results per (repo, method, args) | Tag-based; emitted by every mutation |

### 4.2 Analytics Module Layout

```
src/analytics/
  index.js            — registry of analytics + cache coordinator
  spend.js            — velocity, variance, category mix
  items.js            — inflation basket, cheapest merchant, reorder, price prediction
  subscriptions.js    — leakage score, hidden cost detection
  forecast.js         — 5-model ensemble + 3-month lookahead
  seasonal.js         — heatmaps, time-of-month, day-of-week
  lifestyle.js        — QoQ drift, lifestyle inflation
  anomaly.js          — Z-score outlier detection
  patterns.js         — repeat purchases, reorder queue
  net_worth.js        — trajectory from account_snapshots
```

Each module exports pure functions `(db, params) → result`. None depend on React or feature contexts. All are individually testable.

### 4.3 Forecasting Engine

5 models in ensemble, ensemble-weighted by confidence:

| Model | What it captures | Min data needed | Confidence weight |
|---|---|---|---|
| `weighted_linear` | Recent days weight higher | Current month | 0.5 |
| `historical_month` | Same calendar month, prior years | 1 prior year | 0.7 |
| `rolling_90d` | 90-day smoothed daily rate | 90 days | 0.65 |
| `recurring_aware` | Separates known recurring from variable spend | 3 months | 0.75 |
| `dow_pattern` | Adjusts daily rate by historical day-of-week | 90 days | 0.7 |

Output: `{best_case, likely, worst_case, prob_over_budget}` with a confidence cone.

3-month lookahead: historical-month baseline × 6-month trend slope × seasonal multiplier.

### 4.4 Inflation Basket Index

```
Index = SUM(weight_i × current_unit_price_i / base_unit_price_i)
where weight_i = purchase_count_i / total_purchases (capped at 0.10)
and base = first month with data for ≥ 5 items, indexed at 100
```

Cached for 7 days; recomputed on item write.

### 4.5 Reorder Queue

Simple statistical predictor:
```
predicted_next = last_purchase + avg_interval_days
urgency = (predicted_next - today)
```

Cached for 1 day; recomputed on item write. Surfaces items with urgency ≤ 14 days.

### 4.6 What NOT to Do

Explicitly out-of-scope: cloud LLM APIs, server-side ML, third-party CPI feeds, online recommendation engines. The analytics moat is the user's own data, computed on-device with simple statistics. Sophisticated ML adds maintenance burden without proportional accuracy improvement at this data scale.

The exception is a small, bundled FastText-lite embedding model for product categorization (Phase 8+), where on-device inference at 50–200 ms latency is acceptable and the alternative (rule-based) is failing at scale.

---

## SECTION 5 — Suggested OCR Evolution Strategy

### 5.1 Three-Tier OCR Stack

```
Tier 1 (always) — ML Kit v2 (Latin + Devanagari + Tamil/Telugu/Kannada/Bengali)
                  Per-element confidence threshold 0.60
                  3–6 MB language models, bundled

Tier 2 (fallback) — Tesseract 5 LSTM (eng+hin)
                    Triggered when ML Kit mean confidence < 0.5
                    11 MB language data, bundled (or Play Feature Delivery)
                    Merges results: ML Kit for Latin, Tesseract for non-Latin

Tier 3 (optional, learning) — Per-merchant receipt templates
                              Learned from user-corrected scans
                              Stored in receipt_templates table
                              Activated when sample_count >= 3
```

### 5.2 Preprocessing Pipeline (Native Kotlin)

Order of operations:

```
raw camera capture
  → resize to 2000px max dimension (preserve aspect)
  → grayscale conversion
  → CLAHE (Contrast Limited Adaptive Histogram Equalization)
  → perspective correction (4-corner document detection)
  → deskew (Hough line transform for rotation angle)
  → adaptive binarization (Sauvola for thermal paper)
  → thermal inversion detection (if mean brightness > 0.92, invert)
  → noise removal (median filter 3×3)
  → output: preprocessed PNG → OCR
```

Implementation: `ImagePreprocessModule.kt` wrapping `android.graphics.Bitmap` + optional OpenCV Mobile (~4 MB APK).

### 5.3 Parsing Strategy

Five extraction strategies, dispatched by detected format:

| Strategy | Used for | Approach |
|---|---|---|
| `card` | Quick commerce, food delivery | Name/qty/price on adjacent lines; backward search for name |
| `tabular` | Restaurant, retail | Multi-column with qty × rate = total validation |
| `columnar` (new) | Pharmacy, DMart | Column boundaries detected from x-axis density gaps |
| `permissive` | Handwritten | Loose numeric matching; relaxed name requirements |
| `fuel` (new) | Petrol/diesel/CNG | Single product type with volume/rate/amount |
| `totals-only` | Transport, utility | No items; surface total only |

### 5.4 Normalization Pipeline (Unicode-Safe)

```
raw item name
  → preclean (Unicode NFC, strip controls, fix OCR digit confusions)
  → detect script (Devanagari / Tamil / Telugu / Latin)
  → Hindi/regional synonym lookup (tamatar → tomato, etc.)
  → parseUnitToken (qty + unit, decimal-tolerant)
  → multi-token unit patterns ("2 x 500g")
  → portion words (half, quarter)
  → strip leading SKU codes, stray numbers
  → display_name (preserved case)
  → normalized_name (Unicode letter+number, singularized, lowercase)
  → fuzzy produce classification (exact → word-level → trigram)
  → kind dictionary fallback (dairy, meat, bakery, beverage)
```

### 5.5 Merchant Resolution

```
extracted merchant text
  → match against KNOWN_BRANDS list (current)
  → look up by GSTIN (if extracted) → merchants table
  → Jaro-Winkler against merchants.canonical_name (≥ 0.88 confidence)
  → fall back to cleaned raw text (new merchant candidate)
  → user can confirm or override; canonical name persisted
```

### 5.6 Confidence Model (v2)

9 components, total weight 100%:

| Component | Weight | What it measures |
|---|---|---|
| currency | 8% | Currency symbol detected |
| date | 8% | Valid date parsed (ranges validated) |
| merchant | 8% | Non-"Unknown" merchant |
| format | 8% | Format signature confidence |
| items | 18% | ≥ 1 item extracted |
| total | 18% | Total > 0 |
| reconcile | 18% | sum(items + fees + tax − discounts) ≈ total (tolerance dynamic by item count) |
| ocr_quality | 10% | Mean per-element ML Kit confidence |
| column_detect | 4% | Column structure successfully detected |

Duplicate penalty: soft fingerprint match → score × 0.5.
Dynamic tolerance: `max(0.03, min(0.10, 3 / itemCount))`.

### 5.7 Duplicate Detection

```js
// Exact (FNV-1a hash)
fingerprint = hashFNV1a(
  merchant.toLowerCase() + '|' +
  date + '|' +
  total.toFixed(2) + '|' +
  items.map(i => `${i.normalized_name}:${i.price.toFixed(2)}`).sort().join('|')
);

// Soft (tolerates minor OCR variation)
softFingerprint = [
  merchant.slice(0, 15).toLowerCase().replace(/[^a-z]/g, ''),
  date,
  Math.round(total / 5) * 5,  // round to nearest 5
].join(':');
```

Both stored on `expenses`. Before save: exact match → block as duplicate; soft match → warn user.

### 5.8 Template Learning

```sql
CREATE TABLE receipt_templates (
  id INTEGER PK,
  merchant_id INTEGER REFERENCES merchants(id),
  format TEXT,
  column_map TEXT,            -- JSON array of x-ranges
  header_frac REAL,
  footer_frac REAL,
  item_start_keyword TEXT,
  item_end_keyword TEXT,
  sample_count INTEGER,
  created_at, updated_at
);
```

After each user-corrected save: update the template (running average of fractions). After 3 samples: future scans of that merchant apply the template before generic format detection.

This creates a feedback loop — the more a merchant is scanned, the more accurate future scans become. No cloud required.

### 5.9 Per-Format Accuracy Targets

| Receipt Type | Current | Phase 4B Target | Phase 4C Target | Year 2 Target |
|---|---|---|---|---|
| Quick commerce / food delivery digital | 85% | 90% | 95% | 97% |
| Restaurant printed (laser) | 75% | 82% | 90% | 93% |
| DMart POS thermal | 65% | 75% | 85% | 90% |
| Pharmacy (small font, 5 columns) | 45% | 60% | 80% | 85% |
| Handwritten kirana | 40% | 45% | 65% | 75% |
| Hindi-only kirana | 5% | 60% | 75% | 80% |
| Crumpled thermal | 30% | 55% | 70% | 75% |

Accuracy = correctly extracted items (name + price) / total items on receipt × 100.

---

## SECTION 6 — Suggested Scaling Strategy for 10+ Years of Data

### 6.1 Boundaries to Stay Local-First Within

| Resource | Year 1 target | Year 10 target | Hard ceiling |
|---|---|---|---|
| DB size | < 15 MB | < 150 MB | 500 MB |
| Image storage | < 1 GB | < 8 GB | 20 GB |
| JS heap steady-state | < 60 MB | < 120 MB | 200 MB |
| App cold start | < 400 ms | < 600 ms | 1.5 s |
| Home render | < 100 ms | < 150 ms | 300 ms |

Beyond Year-10 ceilings: archive-mode (older expenses moved to a secondary DB and surfaced only via search/export).

### 6.2 The Single Largest Scaling Lever — Images

Receipt images dominate disk by 50–100× over relational data. Target: < 1 MB average per receipt.

```
Today: 4 MB raw JPEG × 5k = 20 GB at year 10
Target: 800 KB compressed + 50 KB thumb × 10k = 8.5 GB at year 10
```

The pipeline:
1. Capture at quality 1.0
2. Resize to 1600px max long edge
3. Convert to WebP at quality 0.7 (with JPEG fallback)
4. Strip EXIF
5. Generate 320px thumbnail
6. Compute sha-1 hash for dedup
7. Store under `documentDirectory/drift/receipts/{full,thumb}/yyyy/mm/<uuid>.webp`
8. Settings exposes "compress originals further" and "delete pre-202X originals" controls once > 2 GB

### 6.3 List Virtualization — Hard Requirement at Scale

Every list rendering > 100 rows MUST use `FlatList` or `SectionList` with:
- `keyExtractor` stable
- `getItemLayout` when row height is constant
- `initialNumToRender = 20`, `windowSize = 7`
- `removeClippedSubviews = true`
- Row component wrapped in `React.memo` with shallow-equal props

This caps memory regardless of dataset size. Without it, mid-tier Android (4 GB RAM) crashes between 3k–5k rendered rows.

### 6.4 Archive Mode (Year 10+)

If total expenses exceed 50k, introduce an opt-in "archive" of pre-2-years data:

```
archive_expenses (mirrors expenses schema, populated by yearly job)
archive_receipt_items (mirrors receipt_items)
```

Hot path (Home, Add, current-month Trends) reads `expenses` only.
Historical search (FTS5) UNIONs `expenses` + `archive_expenses`.
Yearly job moves rows older than 2 years from active to archive.

User-visible: a "View archive" toggle in AllExpenses; archive results visually distinct (slightly faded).

### 6.5 Background Maintenance (Daily)

```js
async function dailyMaintenance() {
  if (lastRun && Date.now() - lastRun < 24 * 3600_000) return;

  await db.execAsync('PRAGMA optimize');
  if (mutationsSinceAnalyze > 1000) await db.execAsync('ANALYZE');
  if (freelistCount > 1000 && idleFor > 30_000) await db.execAsync('VACUUM');
  await reclaimOrphanReceiptFiles();
  await verifyRollupDrift();
  await pruneStaleAnalyticsCache();
  const check = await db.getFirstAsync('PRAGMA quick_check');
  if (check.quick_check !== 'ok') surfaceRecoveryBanner();

  lastRun = Date.now();
}
```

Triggered by `AppState.addEventListener('change', state => state === 'active' && dailyMaintenance())`.

### 6.6 Backup & Restore

`.driftbackup` format: encrypted zip of DB + receipts.

```
backup-2026-05-17-15-30.driftbackup
  ├── drift.db (post-WAL-checkpoint)
  ├── receipts/full/...
  ├── receipts/thumb/...
  └── manifest.json (schema_version, item_count, size_bytes, checksum)
```

- Encryption: AES-GCM via `expo-crypto`, user-supplied passphrase
- Restore: atomic — extract to sibling DB; verify schema_version compatibility; swap files on success
- Share via `expo-sharing` (system share sheet → Files / Drive / email)

### 6.7 Observability for Future Audits

Lightweight runtime telemetry (dev-only):

- `withTiming(repoMethod)` wrapper logs queries > 50 ms with SQL + params
- `React.Profiler` wrappers on Home, Trends, AllExpenses, Items
- Persistent `db_stats` row in DB: row counts per table, image bytes, last_vacuum, last_analyze
- Hidden "Diagnostics" screen (accessible via long-press on Profile avatar) surfaces these

None of this ships to users; it makes the next audit data-driven.

### 6.8 Optional Cloud Sync (Long-Term, Opt-In)

If user demand emerges (3+ years horizon), cloud sync design must satisfy:

1. **End-to-end encryption.** User passphrase derives key (Argon2id or PBKDF2-SHA256). Server stores ciphertext only.
2. **CRDT or last-write-wins per row.** No server-side merge logic; client resolves conflicts.
3. **UUID-keyed rows.** Schema is UUID-ready from v2 (Section 2.2 above). PK migration deferred to sync time.
4. **Delta sync, not full sync.** Track `updated_at` per row; sync only changed rows.
5. **Multi-device tolerant.** Two phones can edit simultaneously; conflicts resolved by timestamp.
6. **Sync layer is a separate module.** Local-first behavior unchanged when sync is disabled.

The backend (`/backend`) is the future home of this sync service. The schema alignment work (TD-003 in technical debt) is the prerequisite — current backend Postgres schema must be brought in line with the app's SQLite schema.

This is explicitly out-of-scope for the 6-month roadmap. The architectural seams are kept open; the feature is not built until user demand justifies it.

---

## SECTION 7 — Risk Reduction & Resilience

### 7.1 Failure Modes & Recovery

| Failure mode | Detection | Recovery |
|---|---|---|
| DB file corruption | `PRAGMA quick_check` on boot | Surface recovery banner; offer restore-from-backup |
| Rollup drift (trigger bug) | Daily verification job sums random month | Rebuild rollup from base tables |
| Orphan receipt files | Daily maintenance scan | Unlink files not referenced in DB |
| Stuck `_opening` promise | Reset on any error | Already implemented in Phase 1 |
| OCR engine model loading failure | Catch in `recognize()` | Show "Try again" + fall back to manual entry |
| Background notification not delivered (battery saver) | Detect by checking `last_fired_at` on foreground | Foreground check + nudge user toward battery whitelist |
| Migration partially applies (process killed mid-way) | Transaction wrapping | SQLite rollback; on next boot the migration is retried |
| Backup encryption key forgotten | n/a (no recovery) | Document this risk in the restore UI |
| Storage full on save | Detect via `Image.getInfoAsync` | Show clear error; offer compression of older images |

### 7.2 Test Infrastructure for the Long Term

| Layer | Tool | Coverage |
|---|---|---|
| OCR pipeline | Jest + golden dataset of 50+ receipt scans | Regression < 2% accuracy drop gate |
| Repos | Jest with in-memory expo-sqlite | All query methods, all permutations |
| Feature hooks | `@testing-library/react-native` | Mount each hook with mocked repo |
| Service layer | Jest | `ScanService.processReceipt` end-to-end with fixtures |
| Analytics | Jest with synthetic 1-year dataset | Each analytic asserts specific output |
| Migration runner | Jest fixture DBs at every version | Forward migration only, idempotent |
| Trigger correctness | Jest with manual inserts | Assert `monthly_summary` after every event |
| Visual regression | Detox or manual | Top 4 screens against baseline |
| Performance | Custom harness | Cold start, scroll fps, query latency at 100k rows |

### 7.3 Release Discipline

- **Feature flags** for any Phase 7+ feature (especially SMS import — must be killable remotely if a bank changes format)
- **Phased rollout** via Play Console (5% → 25% → 100%)
- **Crash-free user rate** target: > 99.5%
- **Schema version pinning** in CI: any new migration must be flagged with a description + tested forward

---

## SECTION 8 — Strategic Decision Log

Decisions that should stay decided unless evidence forces a re-think.

| Decision | Rationale | Reconsider if… |
|---|---|---|
| Stay on React Native + Expo (don't rewrite to native Android + Room) | The data layer, not the UI framework, is the long-term asset. RN is good enough; rewriting is a multi-month detour | Performance audit shows RN as the actual bottleneck (not currently true) |
| Stay on expo-sqlite (don't migrate to native SQLite via libsql) | expo-sqlite ships SQLite 3.45+ with WAL, FTS5, generated cols, window functions — everything needed | A future SDK version regresses or expo deprecates |
| Stay on JavaScript (don't add TypeScript) — **REVISIT** | Currently a productivity choice. TypeScript would help refactors substantially | Phase 2 architecture refactor exposes too many implicit-contract bugs. If it does, adopt TypeScript across `features/` first |
| Local-first, no required cloud | Privacy + offline are differentiators | Users explicitly demand sync; even then, opt-in only |
| ML Kit + Tesseract, not cloud OCR | Receipt scanning must work in airplane mode | Accuracy ceiling for Indian receipts proves uncrossable without a cloud model |
| No real bank API integration | Account Aggregator requires regulated infra; adds compliance burden | RBI AA framework matures and consumer trust shifts |
| Custom analytics over LLM | Statistics are cheaper, faster, more correct at this scale | On-device LLMs reach < 100 ms latency for receipt summarization |
| Single-user, single-device | Family/group sharing is a separate product | User research shows >30% of users want family budgets |
| Android-first, iOS-deferred | Indian market is Android-dominant | iOS user growth > 20% of base |
| No multi-currency reporting | Most users transact in INR only | International user base exceeds 10% |

---

## Summary — The 10-Year Vision

In 10 years, Drift is:

1. **The default offline expense intelligence app in India** — chosen by users who want item-level price tracking, GST handling, and a privacy guarantee.
2. **A 100% offline core with optional encrypted cloud sync** — the data lives on the device; cloud is an opt-in backup, not a dependency.
3. **A learning OCR pipeline that improves every scan** — receipt template learning, fuzzy merchant matching, per-merchant column maps make it strictly better with use.
4. **A personal financial knowledge graph** — merchants, products, prices, consumption patterns, EMIs, subscriptions, fuel, utilities, splits — all queryable, all exportable.
5. **A 10-year archive** — receipt images, expense history, item prices over years, with search, export, and backup that just works.

The architecture above supports all five. The roadmap (Phases 1–8) sequences the work in a way that the most important wins land first and the most experimental work is deferred until it is justified. No single decision in the roadmap commits the product to a path it cannot reverse.
