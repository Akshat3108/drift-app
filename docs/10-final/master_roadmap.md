# Drift — Final Master Roadmap

> **Authored by:** Principal fintech product architect
> **Synthesis date:** 2026-05-17
> **Inputs:** Full `/docs` corpus (01-current-analysis → 09-roadmap, 33+ documents, ~12,000 lines)
> **Horizon:** v1.0 hardening → v3.0 differentiated India-first finance intelligence platform
> **Constraint frame:** Local-first, offline-only, single-user, Android-first, expo-sqlite, on-device OCR

This document is the canonical roadmap. It supersedes the staging in `09-roadmap/execution_roadmap.md` by collapsing the eight execution phases into the five strategic phases requested for the final plan. The detailed task-level tables in `09-roadmap/*` remain the implementation contract — this document is the architectural and product-strategy contract above them.

---

## 1. Executive Summary

Drift today is a **late-MVP / pre-production v1.0** product that has crossed the threshold from prototype to product but has not crossed the threshold from product to production. It ships:

- 21 working screens with a coherent Flow/botanical visual identity
- A 10-table normalised SQLite schema with the cleanest part of the codebase (the repository layer) sitting directly on top of it
- A sophisticated India-aware OCR pipeline (10 receipt formats, 50 brand patterns, 4 extraction strategies, 7-component confidence model, canonical unit conversion, GSTIN/HSN extraction)
- A genuinely offline-first architecture — zero network calls in any user-facing flow, no telemetry, no third-party SDKs

It is, at the same time, blocked by ~12 architectural shortcuts that compound into damage as the dataset and user base grow:

- A debug-signed release APK, ~3 unnecessary Android permissions, no R8 minification
- A 178-line "god context" (`useAppState.js`) that re-renders every screen on every mutation
- A 500-row hard cap that produces **silent data corruption** past ~5 months of daily use
- `CREATE TABLE IF NOT EXISTS` DDL with no migration runner — every future schema change is blocked
- Zero automated tests in 12,000+ lines of code
- Three cross-layer imports that make the OCR module and data layer immobile
- ASCII-only normalisation that permanently destroys Hindi product names
- Receipt URIs stored in volatile paths — images silently disappear under storage pressure
- N+1 queries in `items.trackedItems()` and `trips.listWithCategories()`
- A correlated-subquery `items.suggest()` that runs 3N+1 lookups per keystroke
- Carbon tracking hardcoded to 0.4 kg — a misleading placeholder

**The strategic frame.** Drift's enduring competitive moat is the combination of **item-level receipt OCR** with **true offline-first commitment** — no Indian competitor (Walnut, Money Manager, ETMONEY, Cred Money) has the first; none has the second. The roadmap below preserves both, in five phases, while moving the composite quality score from **5.6 / 10 → 9.0 / 10** over ~6 months of focused work.

**The shipping discipline that matters.**

1. **Phase 1 (Foundation) is non-negotiable.** Until it ships, no further feature work is justified. It eliminates every release-blocker and correctness bug; without it, the Play Store release is impossible and silent data loss is inevitable.
2. **Phases 2 (Core Intelligence) and 3 (Analytics Expansion) deliver the differentiation.** Together they convert captured data into intelligence no competitor surfaces.
3. **Phase 4 (Power-user systems) is the willingness-to-pay layer.** EMI, fuel, SMS import, tags, splits, notifications — the features power users name when they say "I'd pay for this."
4. **Phase 5 (Advanced forecasting) is the long-horizon platform.** Multi-model ensemble forecasts, anomaly detection, encrypted backup, biometric lock, 10-year scaling. Ongoing, opportunistic, but architecturally seeded by every prior phase.

**Composite trajectory:** 5.6 / 10 today → 9.0 / 10 after Phase 5. Six months of focused single-developer work. No decision in the roadmap commits the product to a path it cannot reverse.

---

## 2. Current Maturity Assessment

Drift sits at the inflection point where every additional feature now costs more than the last because the foundation has not yet been hardened.

| Dimension | Score | Read |
|---|---|---|
| **Functional breadth** | 8 / 10 | 32 features inventoried; ~24 working end-to-end |
| **Architectural soundness** | 5 / 10 | Repository layer is clean; everything above it is a god context |
| **Production-readiness** | 3 / 10 | Release signing, no tests, no migrations, no error boundaries |
| **OCR sophistication** | 7 / 10 | India-aware, 10 formats, confidence scoring — but ASCII-only + ML Kit v1 |
| **Analytics depth** | 5 / 10 | Item-level price tracking is class-leading; everything else is 6 months only |
| **Database design** | 6 / 10 | Sound normalisation; missing migrations, FTS5, rollups, audit trails |
| **UX polish** | 7 / 10 | Beautiful surface; weak power-user depth |
| **Long-term scaling readiness** | 3 / 10 | Hard caps and N+1 patterns will bite within 6 months of active use |
| **Offline-first quality** | 9 / 10 | Genuine — no network in any user-facing path |
| **Extensibility** | 4 / 10 | God context makes adding any new domain costly |
| **Maintainability** | 4 / 10 | Zero tests, zero TS, no migrations, magic numbers in three places |

**Stage verdict:** Late-MVP / pre-production v1.0. The product is delightful for the first 30 days and frustrating thereafter — exactly inverted from where a long-lived finance app needs to land.

### Scalability triggers — when current architecture breaks

| Trigger | What breaks |
|---|---|
| > 500 lifetime expenses | `PotDetail`, `AllExpenses`, `summary`, `totalSpend` all silently wrong |
| > 50 tracked items | Items screen freezes 1–2 s on each focus (N+1) |
| > 1k tracked items | 5+ second freeze on Items tab |
| > 3k rows in any list | OOM crashes on mid-tier Android (no virtualisation) |
| > 30k–50k expenses | JS heap exhaustion (full context hydration) |
| > 1k receipts | App storage > 5 GB; volatile URIs cause silent loss |
| Any schema change | Existing installs cannot receive new columns |

---

## 3. Top Architectural Problems

Ranked by blast-radius reduction unlocked by fixing them.

| # | Problem | Where | Why it's dangerous |
|---|---|---|---|
| 1 | **No schema migration system** | `db/schema.js` (`CREATE TABLE IF NOT EXISTS`) | Blocks every schema-touching feature; once shipped, irreversible without elaborate fallback |
| 2 | **God context (`useAppState.js`)** | `hooks/useAppState.js` (178 lines) | Owns 8 entities, 30+ mutations, derived state, theme, raw repos. Any change re-renders every screen. Untestable in slices |
| 3 | **Hardcoded 500-row cap** | `useAppState.js:34,83,84,87,92` | Silent correctness bug — wrong totals shown without any error surfaced |
| 4 | **Nuclear `refresh()`** | `useAppState.js:29-48` | Profile name change → reloads 500 expense rows + all trips + all subs + all goals |
| 5 | **Raw `repos` exposed on context** | `useAppState.js:163-164` | Two paths to the same data; state consistency impossible to guarantee |
| 6 | **Cross-layer imports** | `db/repo/items.js → ocr/units.js`; `components/ItemRows.js → ocr/*`; `navigation/index.js → useApp()` | Makes OCR module immovable; UI coupled to data; navigation cannot exist without app state |
| 7 | **No service / use-case layer** | `screens/Scan.js` (467 lines) orchestrates 5 OCR modules directly | OCR orchestration is untestable |
| 8 | **N+1 in `items.trackedItems()` and `trips.listWithCategories()`** | `db/repo/items.js:12-56`, `db/repo/trips.js:13-18` | Performance cliff at 50+ tracked items; runs on every refresh |
| 9 | **Correlated subqueries in `items.suggest()`** | `db/repo/items.js` | 3N+1 lookups per keystroke; autocomplete will not scale |
| 10 | **No Error Boundaries; empty `catch {}` blocks** | All screens | Any uncaught error crashes full app; async failures silently swallowed |
| 11 | **`getDB()` `_opening` never reset on failure** | `db/index.js:8-17` | One DB-open failure → app frozen forever, no error surfaced |
| 12 | **No path aliases** | All imports use `../../..` | Refactoring is painful; module moves are high-friction |
| 13 | **Module-level mutable row-key counter** | `components/ItemRows.js:7-8` | Hot-reload key collisions; React anti-pattern |
| 14 | **Backend schema diverges from app schema** | `backend/src/db/` | Cloud sync, if ever attempted, requires rewriting one or both from scratch |
| 15 | **No automated tests** | Entire codebase | 600+ lines of regex-driven OCR parsing has zero regression coverage |

---

## 4. Top UX Problems

Ordered by daily-friction impact, taken from `07-ux/ux_audit.md` and the seven journey maps in `user_journeys.md`.

| # | Problem | Where | Daily impact |
|---|---|---|---|
| 1 | **No merchant autocomplete from history** | `Add.js`, `EditExpense.js` | Users retype "Zepto" hundreds of times — 5+ extra sec per repeat-merchant entry |
| 2 | **No search anywhere** | App-wide | "Where did X go?" has no answer path past 100 expenses |
| 3 | **No date range filter on AllExpenses** | `AllExpenses.js` | Locked to current month — can't review January from May |
| 4 | **Save as a small header text link, not a bottom CTA** | `Add.js` | Primary action has the visual weight of a footnote |
| 5 | **Add screen opens as a tab, not a modal** | `navigation/index.js` | Destroys background context every time |
| 6 | **ISO date `TextInput` on Scan review** | `Scan.js` | Non-engineers cannot type `YYYY-MM-DD` |
| 7 | **`Alert.alert("Saved!")` after Scan save** | `Scan.js:135` | Interruptive — should be a toast |
| 8 | **No swipe-to-delete, no batch ops, no undo** | `AllExpenses.js`, `Subs.js` | Power users blocked from bulk operations |
| 9 | **Long-press as the only edit affordance on Subs** | `Subs.js` | Hidden gesture; discoverability ≈ 0 |
| 10 | **Mood picker mandatory on every entry** | `Add.js` | Cognitive load on every entry; should be optional |
| 11 | **Category auto-guess bug** | `Scan.js:66` | Produce vs non-produce branches identical — OCR category accuracy regression |
| 12 | **Empty state after onboarding has no guidance** | Post-`Onboarding.js` | Cold start onto a blank Home; no "next step" CTA |
| 13 | **Subs occupies prime tab real estate** | `navigation/index.js` | A manage-once feature sits where daily-use Search or Analytics should be |
| 14 | **No accessibility labels; contrast issues** | All screens | Screen reader users blocked; `F.ink3 on F.cream` ≈ 3.2:1 (AA needs 4.5:1) |
| 15 | **No pull-to-refresh; "data feels stale" confusion** | Home, AllExpenses | No indication that the latest state has been loaded |
| 16 | **No export / no backup** | App-wide | Single device wipe = total data loss; violates local-first contract |
| 17 | **Items / NetWorth / Goals have inconsistent entry points** | Multiple | Items: Profile + Trends; Goals: Trends-only; NetWorth: Home-card-only |
| 18 | **Color-only signaling of over/under budget** | `PotDetail.js`, Home | Fails for colour-blind users; no pattern/icon backup |
| 19 | **Touch targets below 44 px on some pill buttons** | `components/UI.js` | Fails platform accessibility guidance |
| 20 | **No notifications, no widgets, no keyboard shortcuts** | App-wide | Power-user surface area missing |

---

## 5. Top Database Problems

Ranked by impact on correctness, scalability, and future-feature unlock.

| # | Problem | Why it matters |
|---|---|---|
| 1 | **No migration runner; idempotent `CREATE TABLE IF NOT EXISTS` only** | No schema change can ever ship to existing installs |
| 2 | **`expenses` not linked to `subscriptions / accounts / trips`** | Net worth perpetually stale; trip actual spend cannot be derived; sub spend invisible to category analytics |
| 3 | **`receipt_items(expense_id)` index missing** | Cascade delete is O(N) — 500-item receipt takes ~500 ms to delete |
| 4 | **`substr(expense_date, 1, 7)` predicates defeat indexes** | All month-filtered queries run full-table scans |
| 5 | **No FTS5 virtual tables** | Search will require full-table LIKE; cannot scale past ~1k rows |
| 6 | **No rollup tables (`monthly_summary`, `item_summary`)** | Home and Trends scan base tables on every render |
| 7 | **No `merchant` entity (free text only)** | No merchant aggregation; no merchant deduplication; analytics impossible |
| 8 | **No `product` entity (string-keyed `normalized_name` only)** | No barcode, no brand, no canonical metadata |
| 9 | **No soft delete columns (`deleted_at`)** | No undo; no recovery; deletions are irreversible |
| 10 | **No audit trail on `goals.saved_amount`, `accounts.balance`** | Cache values can drift from truth with no recoverable source |
| 11 | **No CHECK constraints on enum-style columns** | `subscriptions.verdict`, `receipt_items.kind`, `accounts.kind`, `categories.budget_period` accept invalid values |
| 12 | **`subscriptions.cancelled` has no `cancelled_at`** | Cancellation date is permanently lost |
| 13 | **`categories.budget` is implicitly monthly** | No `budget_period` for weekly/yearly budgets |
| 14 | **No multi-currency support on `expenses`** | International transactions cannot be reconciled |
| 15 | **`receipt_uri` stores volatile paths** | Images live in `cacheDirectory` or `content://` — silently disappear under storage pressure |
| 16 | **No receipt fingerprint columns** | Duplicate detection impossible; same receipt scanned twice = two expenses |
| 17 | **`trips.dest_rate` is a single static rate** | Currency-rate change over a long trip is unrepresentable |
| 18 | **No GSTIN / HSN / IGST persistence** | OCR parses these but nothing reads them — wasted work |
| 19 | **`purchase_date` denormalised but not propagated on expense edit** | Item history can drift from expense date silently |
| 20 | **No deletion → image cleanup** | Orphan receipt files accumulate; disk grows unboundedly |

---

## 6. Top OCR Problems

Catalogued from `04-ocr/problems.md` and `04-ocr/normalization_strategy.md`. The pipeline architecture is correct; the data flowing through it is being silently corrupted at multiple stages.

| # | Problem | Layer | Impact |
|---|---|---|---|
| 1 | **ASCII-only `normalizeName`** — `[^a-z\s]` strips all non-Latin | Normalisation | Hindi product names → empty strings; permanent data corruption |
| 2 | **ML Kit v1** — no Devanagari, Tamil, Telugu, Kannada, Bengali | Engine | ~30% of Indian household receipts unparseable |
| 3 | **No image preprocessing** (no deskew, no CLAHE, no Sauvola binarisation) | Capture | Thermal/crumpled/perspective-distorted receipts misread |
| 4 | **No per-element OCR confidence consumed** | Engine | High-confidence parse score can coexist with silently wrong prices (₹174 vs ₹1,740) |
| 5 | **No fallback OCR engine** | Engine | Single ML Kit call; empty result → zero items, no retry |
| 6 | **No column detection for multi-column pharmacy/DMart** | Row merging | Net price + MRP merged; date overrides corrupted from batch number |
| 7 | **No duplicate-receipt fingerprinting** | Persistence | Same receipt scanned twice = two expenses; no warning |
| 8 | **SKIP_RE over-matches item names** ("Total Care Soap" → skipped) | Classification | Legitimate items dropped |
| 9 | **Date regex has no day/month validation** | Parsing | `13/45/2026` accepted; future dates accepted |
| 10 | **Decimal quantities lost from `qty × rate = total` derivation** | Parsing | `0.5 kg @ ₹80 = ₹40` → quantity rounded to 1 |
| 11 | **`produceList.js` has only English names** | Normalisation | `tamatar`, `aloo`, `pyaaz` not recognised |
| 12 | **No per-item GST rate extraction** | Parsing | CGST/SGST/IGST per line not captured |
| 13 | **No template learning per merchant** | Compounding | Each scan starts from zero; no improvement with use |
| 14 | **Pharmacy batch/expiry not extracted** | Parsing | Mandatory metadata for drug tracking lost |
| 15 | **Fuel single-item not extracted** | Parsing | Volume/rate/amount not captured |
| 16 | **GSTIN parsed but not persisted** | Persistence | Required for ITC tracking — currently dropped |
| 17 | **`itemBandTop = 10%` is wrong for app-generated receipts** | Item extraction | Blinkit/Zepto headers occupy 25–40% — phantom items extracted from address text |
| 18 | **`findNameBackward()` stops on SKIP_RE row** | Item extraction | Pharmacy receipts with batch-number rows between name and price lose the name |
| 19 | **Single-image capture (no multi-frame fusion / stitching)** | Capture | Long DMart/pharmacy receipts (30–40 items) cannot be fully captured |
| 20 | **`looksHandwritten` heuristic is naive** | Format detection | Small café printed bills classified as handwritten → permissive strategy → garbage |

---

## 7. Top Analytics Gaps

Everything below is computable from the existing schema with zero cloud dependency. The data is captured; the engineering to surface it is the gap.

| # | Missing analytic | Why valuable | Effort |
|---|---|---|---|
| 1 | **Personal inflation basket index** | Differentiator — no Indian app has it. "Your personal inflation: +8.2% YoY" | M |
| 2 | **Cheapest merchant per item** | "Save 32% — D-Mart vs Nature's Basket on Toor Dal" | S |
| 3 | **5-model cashflow forecast with confidence cone** | Replaces wildly inaccurate linear extrapolation; the most-asked PF question | L |
| 4 | **Reorder queue / due-soon items** | "Buy milk Tuesday" — more actionable than any chart | S |
| 5 | **Lifestyle inflation per category (QoQ drift)** | "Dining crept up 28% across 3 quarters" | M |
| 6 | **Spending velocity (rolling 7-day slope)** | "⚡ Spending 12% faster this week" | S |
| 7 | **Subscription leakage score** | "🔴 22% of spend goes to subs; ₹820/mo potentially wasted" | S |
| 8 | **Category × month variance heatmap** | Budget adherence per category per month at a glance | M |
| 9 | **Day-of-week + day-of-month spend patterns** | "You spend 34% of budget in the first 5 days" | S |
| 10 | **Seasonal calendar (12-cell month-of-year)** | "You spend most in November (Diwali)" | S |
| 11 | **Year-over-year monthly comparison** | 2025 vs 2026 grouped bars | XS |
| 12 | **Top merchants leaderboard + per-merchant detail** | Top 10 merchants by spend, count, avg basket | S |
| 13 | **Spending calendar (date-cell intensity)** | Calendar-shaped heat overlay; tap day → expenses | M |
| 14 | **Mood × spend correlation** | "You spend 2.3× more when 😔" | S |
| 15 | **Anomaly detection (Z-score)** | "⚠️ March 15 was 3.2× your normal day" | S |
| 16 | **Net worth trajectory (requires `account_snapshots`)** | Area line chart over time | M |
| 17 | **Repeat purchase interval per item** | "Toor Dal — every 18 days on avg" | S |
| 18 | **Top price movers dashboard (beyond produce)** | All items with > 5% price change in last 30 days | XS |
| 19 | **Multi-item compare on ItemTrend (overlay 2–3 price lines)** | Compare Onion vs Tomato in one chart | M |
| 20 | **3-month cashflow lookahead** | historical-month baseline × 6-month slope × seasonal multiplier | M |

Beyond Tier 1: cross-category substitution detection, price elasticity per item, seasonal decomposition, Sankey spending flow — all addressable in Phases 3 and 5.

---

## 8. Top Missing Features

From `06-features/missing_features.md`, ranked by combined user-value × implementation-feasibility.

### Critical (ship-blocking gaps)

| ID | Feature | Why critical |
|---|---|---|
| F-17 | **Schema migration system** | Unblocks every future schema-touching feature |
| arch | **Release signing config + R8 minify** | Without this, no Play Store release |
| arch | **Fix 500-row hard cap (SQL summary)** | Stops silent data corruption |
| arch | **Error Boundaries on every screen** | Prevents full-app crashes |
| F-01 | **Full-text search (FTS5)** | Essential at 100+ expenses |
| F-02 | **Multi-dimension filters** | AllExpenses unusable at scale without it |
| F-03 | **Payment method tracking** | Cash/UPI/Card split is universal in India |
| F-07 | **Data export (CSV/JSON/PDF)** | Trust feature; portability is mandatory |
| F-25 | **Receipt image viewer + permanent storage** | Closes "stored but unviewable" gap; stops silent loss |
| arch | **Unicode-safe `normalizeName`** | Stops permanent Hindi data corruption |

### High ROI (massive value for moderate effort)

| ID | Feature |
|---|---|
| F-09 | Merchant analytics + autocomplete |
| F-28 | Predictive amount input |
| F-30 | Smart merchant auto-category (~1k bundled map) |
| F-08 | Batch operations on expenses |
| F-13 | GST invoice persistence (uses already-parsed OCR data) |
| F-12 | Tags / custom labels |
| F-04 | Income tracking |
| F-26 | Savings rate / cash flow |
| F-05 | Push notifications + budget alerts |
| F-10 | Subscription calendar + smart alerts |
| F-11 | Recurring expense auto-detection |
| F-20 | Calendar spend view |
| ocr | Hindi/regional synonym dictionary |
| ocr | ML Kit v2 Devanagari upgrade |
| ocr | Per-element OCR confidence |
| ocr | Duplicate receipt detection (FNV-1a) |
| ocr | Jaro-Winkler merchant dedup |
| analytics | Personal inflation basket index |
| analytics | 5-model cashflow forecast |
| analytics | Reorder queue, leakage score, velocity, heatmaps, variance matrix |

### Power-user

EMI tracking (F-14), fuel/vehicle (F-16), pantry (F-18), price alerts (F-19), rollover budgets (F-21), split expenses (F-22), utility bill tracking (F-24), home widgets, undo snackbar, biometric/PIN lock, encrypted backup, daily maintenance, virtualised FlatList migration, OCR off the JS thread, query cache.

### Advanced / India-first

UPI/Bank SMS auto-import (F-06), credit card statement import (F-15), FASTag (F-23), receipt template learning, Tesseract LSTM fallback, native Kotlin preprocessing (CLAHE/Sauvola/deskew), SQLCipher encryption-at-rest, Account Aggregator integration.

### Experimental

Anomaly detection (full ML), item price prediction, on-device LLM receipt summarisation, voice entry, cloud sync (CRDT or LWW), PaddleOCR Lite, FastText product classification.

---

## 9. Recommended Target Architecture

The architecture preserves the offline-first commitment while removing every cross-layer dependency that prevents the codebase from scaling to 100k+ expenses and 10+ years of data.

### 9.1 Layered architecture (v2)

```
┌─────────────────────────────────────────────────────────────────┐
│                          UI LAYER                                │
│  features/{feature}/screens/  +  components/primitives/          │
│  Stateless presentational where possible; React.memo everywhere  │
└─────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌─────────────────────────────────────────────────────────────────┐
│                     FEATURE HOOKS LAYER                          │
│  features/{feature}/use{Feature}.js                              │
│  One context per domain entity; emits invalidation events        │
└─────────────────────────────────────────────────────────────────┘
                              ▲ calls
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE / USE-CASE LAYER                      │
│  features/{feature}/{Feature}Service.js                          │
│  ScanService — composes camera + OCR + parse + save              │
│  AnalyticsService — composes repos + cache + aggregations        │
│  ExportService, BackupService, NotificationService, ...          │
└─────────────────────────────────────────────────────────────────┘
                              ▲ calls
┌─────────────────────────────────────────────────────────────────┐
│                     REPOSITORY LAYER                             │
│  features/{feature}/repo.js                                      │
│  Pure functions: (db, params) → rows. No React, no UI.           │
└─────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌─────────────────────────────────────────────────────────────────┐
│                  CORE / DOMAIN LAYER                             │
│  core/domain/ — units, normalize, produce, currencies            │
│  core/utils/  — format, date, fuzzy match, hashing               │
│  core/theme/  — tokens + ThemeContext                            │
└─────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌─────────────────────────────────────────────────────────────────┐
│                     DATA / DB LAYER                              │
│  core/db/index.js — getDB, exec, all, one                        │
│  core/db/schema.js — migrations, indexes, triggers               │
│  core/db/cache.js — analytics_cache helpers                      │
└─────────────────────────────────────────────────────────────────┘
                              ▲ uses
┌─────────────────────────────────────────────────────────────────┐
│         PLATFORM LAYER (expo-sqlite + native modules)            │
│  expo-sqlite (WAL, FTS5, generated cols, windows)                │
│  ImagePreprocess.kt — native Kotlin OpenCV bridge                │
│  SmsReader.native.js — native SMS inbox access (Android only)    │
│  Tesseract — fallback OCR engine                                 │
│  expo-image, expo-notifications, expo-file-system, expo-crypto   │
└─────────────────────────────────────────────────────────────────┘
                              ▲ isolated peer
┌─────────────────────────────────────────────────────────────────┐
│                       OCR PIPELINE                               │
│  ocr/ — pure JS, zero React, depends on core/domain only         │
│  textRecognition → preprocess → mergeRows → detectFormat →       │
│  detectColumns → extractItems → normalize → confidence →         │
│  fingerprint                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Module dependency rules (enforced via ESLint)

```
ocr/         → core/domain only.  NEVER imports features/* or components/*
core/        → core/* only.       NEVER imports anything above
features/X/  → core/* + components/primitives + features/X/* only
                (NEVER imports features/Y for X≠Y; cross-feature via events only)
components/  → core/theme only
navigation/  → features/* (screen refs) + core/theme (ThemeContext) only
```

CI fails on any violation. `eslint-plugin-import` + a small custom rule.

### 9.3 State architecture

```
App root
  ProfileProvider
   └ SettingsProvider
      └ ThemeProvider                   ← navigation reads ThemeContext only
         └ ExpensesProvider
            └ CategoriesProvider
               └ ItemsProvider
                  └ MerchantsProvider
                     └ SubsProvider
                        └ GoalsProvider
                           └ AccountsProvider
                              └ TravelProvider
                                 └ TagsProvider
                                    └ AnalyticsProvider   ← lazy-mounted
                                       └ <Navigation />
```

Each provider owns paginated in-memory state for its entity, exposes named mutation functions (no raw repo access), and emits invalidation events for the cache layer. Total re-renders on a single mutation: only the providers whose data changed.

### 9.4 Three-layer cache

| Layer | What it caches | Invalidation |
|---|---|---|
| A — SQL page cache + mmap | Hot pages of base tables and indexes (20 MB cache, 256 MB mmap) | LRU; managed by SQLite |
| B — Materialised rollups | `monthly_summary` per category-month, `item_summary` per product | Triggers on base table writes; daily verification |
| C — In-memory `useQuery` cache | Query results per `(repo, method, args)` | Tag-based, emitted by every mutation; LRU 64 keys |

### 9.5 OCR target architecture

Three tiers, each falling forward when the prior fails:

1. **Tier 1 (always):** ML Kit v2 (Latin + Devanagari + Tamil/Telugu/Kannada/Bengali) with per-element confidence ≥ 0.60. 3–6 MB bundled language models.
2. **Tier 2 (fallback):** Tesseract 5 LSTM (eng+hin) when ML Kit mean confidence < 0.5. 11 MB language data (Play Feature Delivery for size).
3. **Tier 3 (learning):** Per-merchant `receipt_templates` — column maps, header/footer fractions, item-section keywords. Updated on every user-corrected save; activated when `sample_count >= 3`. Compounding moat — every scan improves future scans.

Native Kotlin preprocessing module: resize → grayscale → CLAHE → perspective correction → deskew → Sauvola binarisation → thermal inversion detection → noise removal.

### 9.6 Database — target shape

22 tables (vs current 10). Major additions:

- **Singletons:** + `schema_version`
- **Entities:** + `merchants`, `products`, `vehicles`, `people`, `tags`
- **Transactions:** + `income`, `account_transactions`, `goal_contributions`
- **Recurring:** + `emi_loans`, `fuel_fillups`, `utility_bills`, `budget_rollover`
- **Inventory:** + `pantry_items`, `price_snapshots`
- **Alerts:** + `price_alerts`, `notification_log`
- **Grouping:** + `expense_tags`, `expense_splits`
- **Rollups:** + `monthly_summary`, `item_summary`, `analytics_cache`
- **Search:** + `expense_fts`, `item_fts`, `product_fts` (FTS5)
- **Learning:** + `merchant_aliases`, `receipt_templates`
- **Backup/import:** + `sms_import_log`, `import_sessions`, `account_snapshots`

Schema principles: additive migrations only; `deleted_at` on every financial entity; audit trails for every long-lived value; generated columns for non-SARGable predicates; CHECK constraints on enum-style columns; rollups maintained by triggers and verified by a daily job; FTS5 shadowing text-heavy columns; UUID columns reserved (not used) on every table to keep the door to future cloud sync open without a PK migration.

---

## 10. Recommended Package / Module Structure

```
app/src/
  ── CORE ──────────────────────────────────────────────────────────
  core/
    db/
      index.js              getDB, exec, all, one
      schema.js             baseline + migration registry
      cache.js              analytics_cache helpers
    domain/
      units.js              ← MOVED from ocr/units.js
      normalize.js          ← MOVED from ocr/normalizeName.js  (Unicode-safe v2)
      produce.js            ← MOVED from ocr/produceList.js   (+ Hindi synonyms)
      currencies.js         ← split from data/constants.js
      categories.js         ← split from data/constants.js
      avatars.js            ← split from data/constants.js
    theme/
      tokens.js             ← MOVED from theme/index.js
      ThemeContext.js       ← NEW lightweight context (navigation-consumable)
      useTheme.js           ← NEW hook
    utils/
      format.js             formatShort, shorten, daysUntil, formatCurrency
      date.js               toYYYYMM, monthRange, daysInMonth
      hash.js               FNV-1a, soft fingerprint
      fuzzy.js              Jaro-Winkler, trigram

  ── FEATURES ──────────────────────────────────────────────────────
  features/
    expenses/      Context, useExpenses, repo, screens/{Add,Edit,All,Detail}
    categories/    Context, useCategories, repo, screens/{EditPot,PotDetail}
    items/         Context, useItems, repo, screens/{Items,ItemTrend}
    merchants/     Context, useMerchants, repo, screens/{MerchantDetail}
    scan/          ScanService, screens/Scan
    subscriptions/ Context, useSubs, repo, screens/{Subs,EditSub,SubsCalendar}
    goals/         Context, useGoals, repo, screens/{Goals,EditGoal}
    accounts/      Context, useAccounts, repo, screens/{NetWorth,EditAccount}
    travel/        Context, useTravel, repo, screens/{Travel,EditTrip}
    profile/       Context, useProfile, repo, screens/{Profile,Onboarding}
    tags/          Context, useTags, repo
    splits/        Context, useSplits, repo, screens/{Split}
    notifications/ NotificationService
    exports/       ExportService, screens/Export
    backup/        BackupService, screens/Backup
    home/          useHomeDashboard, screens/Home
    analytics/
      AnalyticsService, useAnalytics
      modules/{spend,items,subscriptions,forecast,seasonal,
              lifestyle,anomaly,patterns,net_worth}.js
      screens/{AnalyticsHub,Inflation,Forecast,Reorder,Calendar,
              Variance,Lifestyle,Merchant}

  ── INFRASTRUCTURE ────────────────────────────────────────────────
  navigation/
    index.js          route config only — no UI
    CustomTabBar.js   extracted; accepts theme as prop
  components/
    primitives/{Card,Button,Chip,ProgressBar,Toggle,MoodPicker,...}.js
    charts/{SparkBars,BarChart,AreaChart,HeatmapGrid,Sankey,DonutChart,
            LineChartWithConfidenceBand}.js
  ocr/                pure JS pipeline; depends on core/domain only
  maintenance/        daily job (vacuum/analyze/orphan-gc/rollup-drift)
  media/              receipt image pipeline (compress, thumb, EXIF strip)
```

Babel module-resolver aliases: `@core`, `@features`, `@ocr`, `@components`, `@navigation`.

---

## 11. Phased Roadmap

Five phases. Each is independently shippable, gated by acceptance criteria, and ordered so that no phase depends on a later phase. Phase 1 is non-negotiable; Phases 2–4 build the differentiated product; Phase 5 is long-horizon platform work.

Effort key: **XS** ≤ 1 hr · **S** 1–4 hr · **M** ½–1 day · **L** 1–2 days · **XL** 2–5 days

```
Phase 1  Foundation Fixes                (3–5 weeks)   [BLOCKING for everything]
Phase 2  Core Intelligence               (6–8 weeks)
Phase 3  Analytics Expansion             (3–4 weeks)
Phase 4  Power-User Systems              (5–7 weeks)
Phase 5  Advanced Forecasting & Platform (ongoing)
```

Total horizon: ~6 months to v3.0 with a single full-time developer; ~3.5 months with two developers running phases in parallel where dependencies permit.

---

### PHASE 1 — FOUNDATION FIXES

**Duration:** 3–5 weeks · **Effort:** ~28 dev-days · **Priority:** P0 — blocks everything

#### Goals

1. The app can be released to the Play Store without disqualifying issues.
2. No silent data corruption — every wrong-data scenario surfaces an error.
3. Every schema change from this point forward is safe for existing installs.
4. The god context is dismantled; per-feature contexts own per-feature state.
5. The database schema reaches the shape needed to host every Phase 2–4 feature.
6. OCR's most damaging bugs (Unicode normalisation, image quality, regex over-matches) are fixed.

#### Features delivered

**Release & stability**
- Schema migration runner with version tracking (`F-17`)
- WAL journal + tuned SQLite PRAGMAs (synchronous=NORMAL, mmap 256 MB, cache 20 MB)
- React Error Boundaries on every screen feature tree
- Release signing config (production keystore, secrets management)
- R8 minification + resource shrinking
- Unnecessary Android permissions removed (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE`)
- `getDB()` error recovery (`_opening` reset on failure)
- `receipt_items(expense_id)` index
- 500-row cap fix: `summary` moves to SQL aggregate
- Unused deps removed (`@react-native-async-storage/async-storage`)
- Carbon hardcoded value removed from UI (deferred to Phase 5 for real implementation)

**Architecture refactor**
- `useAppState.js` split into per-feature providers (Expenses, Categories, Items, Subs, Goals, Accounts, Travel, Profile, Settings) behind a compatibility shim
- Raw `repos` removed from context; every call site replaced with named action creators
- `ocr/units.js`, `ocr/normalizeName.js`, `ocr/produceList.js` moved to `core/domain/`
- `data/constants.js` split into `core/domain/{currencies,categories,avatars}.js`
- `core/theme/ThemeContext.js` extracted; navigation reads it instead of `useApp()`
- `CustomTabBar` extracted from `navigation/index.js`
- `formatShort`, `shorten`, `daysUntil` lifted into `core/utils/format.js`
- `ScanService` extracted from `Scan.js`; the screen becomes a thin consumer
- `useHomeDashboard()` hook encapsulates Home's cross-feature queries with a 30 s cache
- `components/UI.js` split into `components/primitives/*`
- Babel module-resolver aliases (`@core`, `@features`, `@ocr`, `@components`)
- React.memo on every leaf screen; row-key counter in `ItemRows.js` replaced with `useRef`

**Database evolution**
- Migrations v2–v14 add: `deleted_at` on every financial entity; generated `month_key` columns; `merchants` + `products` tables; `account_id`, `trip_id`, `subscription_id`, `merchant_id`, `currency`, `amount_home`, `fx_rate`, `receipt_path`, `receipt_thumb`, `receipt_hash`, `receipt_soft_hash` on `expenses`; `account_transactions`; `goal_contributions`; `subscriptions.cancelled_at` + `linked_category_id` + CHECK on `verdict`; `categories.budget_period`; `monthly_summary` + `item_summary` + maintaining triggers; FTS5 virtual tables (`expense_fts`, `item_fts`); CHECK constraints on enum columns
- Repo rewrite: `substr(date,1,7)` predicates → range predicates / `month_key`; `items.trackedItems()` reads `item_summary`; `items.suggest()` uses `FIRST_VALUE()` window; `trips.listWithCategories()` collapses to a single LEFT JOIN; Home and Trends derive monthly metrics from `monthly_summary`
- Soft-delete predicate helper; one-shot backfill for rollups + FTS

**OCR — immediate (Phase 4A in the underlying execution plan)**
- `[^a-z\s]` → `[^\p{L}\p{N}\s]u` in `normalize.js` (Unicode NFC)
- Bundle `hindi_product_map.json` (~50 KB) + `product_synonyms.json` (~80 KB)
- Image picker `quality: 1.0` + PNG output
- Scan.js produce-vs-non-produce category-guess bug fixed
- Date regex validates day 1–31, month 1–12, year 2000–2099
- `classifyRow` → `classifyRowWithContext` respecting price position
- `deriveQtyFromRate()` with decimal-fraction tolerance
- Persist GSTIN, invoice_number, CGST/SGST/IGST, HSN on save

#### Dependencies

None. This phase has no prerequisites and unblocks everything downstream.

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration runner bug → corrupt schema | Low | Each migration in `withTransactionAsync`; idempotency-tested |
| Splitting god context introduces state-consistency bugs | High | Compatibility shim retained until every screen migrated; gradual migration; React Profiler validation |
| R8 minification breaks Reanimated/Hermes | Medium | Official Expo proguard config; real-device smoke test |
| Production keystore committed by accident | Low | Pulled from `~/.gradle/gradle.properties` or env vars |
| Generated columns unsupported on bundled SQLite | Low | Expo 54 ships SQLite 3.45+; probe query at boot |
| Trigger logic off-by-one on `UPDATE` (old vs new month_key) | Medium | Triggers explicitly handle both buckets; daily verification job |
| Soft-delete predicate forgotten in a query | High | Repo helper enforces it; code review for every list query |
| File-move PRs create diffs that obscure logic changes | Low | `git mv` + separate PRs for moves vs logic |

#### Acceptance gate

Release-signed AAB uploads to Play Console; migrations run cleanly on every fixture (empty, 100, 500, 5k rows); no silent errors; WAL active; React Profiler shows targeted re-renders only; `EXPLAIN QUERY PLAN` shows no `SCAN TABLE` on Home/Trends queries; OCR golden dataset accuracy ≥ baseline; Hindi names preserved in normalised form.

#### Priority

**P0 — non-negotiable.** Until this ships, no further feature work is justified.

---

### PHASE 2 — CORE INTELLIGENCE

**Duration:** 6–8 weeks · **Effort:** ~43 dev-days · **Priority:** P1 — the differentiation surface

#### Goals

1. Users find any expense in under 3 taps.
2. Repeat-merchant Quick Adds take ≤ 6 taps (was ~12).
3. OCR lifts from "good for English printed receipts" to "great for India-first multi-script messy receipts with confidence-aware fallback."
4. Power users can correct mistakes in bulk and export their data.
5. Income vs expense becomes the canonical savings-rate primitive.
6. GST data already parsed by OCR is finally persisted and surfaced.
7. Receipt images move from volatile cache paths to permanent storage.

#### Features delivered

**Expense intelligence (was Phase 5)**
- F-01 Full-text search (FTS5) — expenses, items, subs
- F-02 Multi-dimension FilterSheet (date range, amount, payment, merchant, mood, recurring, tag) + saved filters
- F-03 Payment method tracking (Cash / UPI / Credit / Debit / Wallet / EMI)
- F-04 Income tracking + savings rate widget on Home
- F-07 Data export — CSV / JSON / PDF
- F-08 Batch operations on expenses (long-press, multi-select, batch recategorise/delete/export)
- F-09 Merchant analytics + autocomplete + MerchantDetailScreen
- F-13 GST invoice persistence + Detail-screen GST breakdown UI
- F-25 Receipt image viewer modal (pan/zoom) + receipt gallery section
- F-26 Savings rate / cash flow widget
- F-28 Predictive amount input — "Last time: ₹X" chip on merchant input
- F-30 Smart merchant auto-category (~1k bundled `merchantMap.json`) + `merchant_aliases` persistence

**OCR intelligence (was Phase 4B + 4C)**
- ML Kit v2 upgrade with Devanagari + Tamil + Telugu + Kannada + Bengali models
- Per-element confidence surfaced into `confidence.js` as a new component
- `lightPreprocess()` via `expo-image-manipulator` (resize 1800 px + PNG)
- Column detection in `mergeIntoRows()` (x-axis density gap analysis)
- New `columnar` item extraction strategy for multi-column pharmacy/DMart
- Duplicate receipt detection (FNV-1a fingerprint + soft fingerprint)
- Jaro-Winkler merchant deduplication against `merchants` table
- Fuel single-item extraction (volume, rate, amount)
- Per-item GST rate extraction; `cgst_rate`, `sgst_rate` on `receipt_items`
- Dynamic confidence reconciliation tolerance: `max(0.03, min(0.10, 3/itemCount))`
- OCR golden dataset (50 anonymised receipt scans + expected outputs)
- Native Kotlin `ImagePreprocessModule.kt`: grayscale → CLAHE → Sauvola → deskew → thermal inversion detection (P2 within phase)
- Tesseract 5 LSTM as fallback engine (eng+hin) when ML Kit mean confidence < 0.5 (P2; Play Feature Delivery for language data)
- Receipt template learning: `receipt_templates` table; updated on user-corrected save; activated at `sample_count >= 3` (P2)
- Pharmacy-specific extraction strategy (drug, batch, expiry per item) (P2)

**UX polish (from `quick_wins.md` UX list)**
- Add screen as modal sheet (not tab)
- Save as bottom CTA button
- Toast instead of `Alert.alert` after Scan save
- Date picker on Scan review (replaces ISO `TextInput`)
- Mood picker collapsible/optional
- Pull-to-refresh on Home, AllExpenses
- Swipe-to-delete on AllExpenses, Subs, item rows
- Long-press to enter multi-select
- Undo snackbar on delete
- Auto-select last-used category on Add
- Edit button on Subs row (not long-press only)
- "Mark as cancelled (reminder only)" label replacement on Subs
- Sort options on Subs list
- Search input on Items list
- Day-0 orientation screen after onboarding + first-expense celebration

**Receipt image pipeline (foundation; completed in Phase 5)**
- Copy to `documentDirectory/drift/receipts/{full,thumb}/`
- Generate 320 px thumbnail; strip EXIF; compute sha-1 hash
- Lazy migration of legacy `receipt_uri` records on first read

#### Dependencies

Phase 1 complete (migrations, per-feature contexts, `merchants` table, FTS5, soft-delete columns, payment_method column, receipt path columns).

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bundled merchant map produces wrong categories for ambiguous merchants ("Swiggy Instamart") | Medium | User override always wins; persisted to `merchant_aliases` |
| ML Kit v2 Devanagari model breaks Latin recognition | Low | Both models loadable; verified with golden dataset |
| Native Kotlin module increases APK size significantly | Medium | Module is small; OpenCV optional (~4 MB) |
| Tesseract data files push APK over 100 MB threshold | High | Use Play Feature Delivery for language data |
| Column detection produces false splits on narrow receipts | Medium | Conservative gap threshold; fall back to existing logic |
| Template learning over-fits to bad samples | Medium | Require `sample_count >= 3`; user-disable per template |
| Duplicate detection false-positives on legitimate recurring purchases | Low | Soft fingerprint is a warning, not a block |
| Receipt image migration loses data | Medium | Copy, don't move; old URI retained until copy verified |
| PDF generation slow on large date ranges | Medium | Cap at 12 months per export; progress UI |

#### Acceptance gate

Repeat-merchant Quick Add takes ≤ 6 taps; FTS5 search returns < 100 ms at 100k rows; CSV export round-trips bytes-identical; OCR per-format accuracy targets met (Hindi-only kirana 60%+, pharmacy 60%+, crumpled thermal 55%+); Devanagari/Tamil/Telugu sample receipts parse correctly; GST fields persisted on every Scan save.

#### Priority

**P1 — the user-visible quality leap.** Without Phase 2, Drift remains a logging app. With it, Drift becomes a personal expense intelligence platform.

---

### PHASE 3 — ANALYTICS EXPANSION

**Duration:** 3–4 weeks · **Effort:** ~17 dev-days · **Priority:** P1 — the differentiated moat

#### Goals

1. Item-level OCR data already captured is promoted into the analytics moat.
2. A dedicated Analytics Hub becomes the cross-cutting insights surface.
3. Personal inflation index — the single differentiator no Indian competitor ships.
4. Cheapest-merchant-per-item analysis, lifestyle inflation, seasonal patterns, calendar view.
5. Foundation cashflow models (the full 5-model ensemble lands in Phase 5).
6. All Tier-1 analytics in `05-analytics/missing_analytics.md` ship behind a single hub.

#### Features delivered

- `analytics_cache` table + `getCached()` helper with TTL
- `src/analytics/` module structure (index, spend, items, subscriptions, forecast, seasonal, lifestyle, anomaly, patterns)
- **Personal inflation basket index** — top-N item weighted index per month with cap 0.10/item and base = first month with ≥ 5 items
- **Cheapest merchant per item** — `GROUP BY normalized_name, merchant`
- **Spending velocity** — rolling 7-day slope vs prior 7-day slope; classifier
- **Lifestyle inflation per category (QoQ drift)** — quarter-over-quarter detection
- **Subscription leakage score** — total monthly subs / total monthly spend
- **Seasonal calendar (12-cell month-of-year)**
- **Day-of-week heatmap** (7-cell strip)
- **Day-of-month histogram** (31-bar)
- **Category × month variance heatmap**
- **Year-over-year and month-over-month comparison toggles in Trends**
- **Reorder queue** — repeat-purchase detection with avg interval; "Due Tuesday: Toor Dal, Rice, Milk"
- **Top price movers dashboard** (not just produce)
- **Multi-item compare on ItemTrend** (overlay 2–3 price lines)
- **Spending calendar view** (date-cell intensity heat overlay)
- **Mood × spend correlation**
- **Merchant intelligence screen** (top merchants leaderboard + per-merchant detail)
- **Foundation cashflow forecast** — weighted linear + historical month + rolling 90d (3 of the 5 ensemble models; remaining 2 in Phase 5)
- **Analytics Hub screen** — entry point with cards for velocity, inflation, lifestyle drift, sub leakage, reorder queue
- **Tab bar restructure** — Home / Capture / + / Analytics / You
- **Chart components consolidated** into `components/charts/`

#### Dependencies

Phase 1 (rollup tables make queries cheap; `merchants` entity for merchant analytics).
Phase 2 (income for cashflow accuracy; merchant entity populated with real data; FTS5 for search inside analytics).

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Forecast inaccurate for users with < 3 months data | Medium | Show only models with enough data; degrade gracefully |
| Personal inflation dominated by 1–2 items | Medium | Cap weight per item at 10%; require ≥ 5 distinct items |
| Lifestyle inflation flags legitimate upgrades | Low | Frame as "drift" not "problem" |
| Analytics cache invalidation bugs leave stale data | Medium | Tag-based invalidation; daily verification job |
| Too many screens overwhelm users | Medium | Analytics Hub is entry; drill-downs hidden by default |

#### Acceptance gate

Analytics Hub renders < 200 ms; inflation index computed from real data; foundation forecast MAE < 20 % on holdout test; every Tier-1 analytic queryable in < 50 ms with rollups; tab bar restructured.

#### Priority

**P1 — the moat.** The data is already captured by Phase 1 + Phase 2 OCR. Phase 3 is engineering, not data acquisition. Highest "wow per dev-day" in the roadmap.

---

### PHASE 4 — POWER-USER SYSTEMS

**Duration:** 5–7 weeks · **Effort:** ~37 dev-days · **Priority:** P2 — willingness-to-pay layer

#### Goals

1. Notifications activate the inert `next_bill` field and turn the app from active checking into passive monitoring.
2. Subscription calendar + 3-day reminders save real money.
3. Tags / custom labels provide orthogonal classification beyond category.
4. Calendar view, EMI tracking, fuel & vehicle, pantry, splits, rollover budgets, utility unit-rate tracking become first-class.
5. UPI / Bank SMS auto-import removes manual entry for the most common Indian transaction type (the highest-impact India-specific feature, scoped last to absorb scope pressure).
6. CSV credit-card statement import enables reconciliation.

#### Features delivered

| ID | Feature |
|---|---|
| F-05 | Push notifications + budget alerts (`expo-notifications`; `notification_log` table) |
| F-10 | Subscription calendar screen + 3-day-before reminder schedule |
| F-11 | Recurring expense auto-detection (pattern detection + "Expected this month" widget) |
| F-12 | Tags table + UI in Add/EditExpense + filter integration |
| F-20 | Calendar view screen |
| F-14 | EMI tracking + amortization (`emi_loans` table; JS amortization; EMI + EditEMI screens; payments linked to expenses) |
| F-16 | Fuel & vehicle tracking (`vehicles` + `fuel_fillups` tables; OCR fuel-format integration) |
| F-18 | Pantry / household inventory (`pantry_items` table; auto-populate from scans; depletion UX; shopping-list query; low-stock notification) |
| F-19 | Item price alerts (`price_alerts` table; check on scan; alert UI) |
| F-21 | Rollover budgets (`budget_rollover` table; end-of-month job; per-category alert threshold) |
| F-22 | Split expenses (`people` + `expense_splits` tables; split screen; balance tracker) |
| F-24 | Utility bill unit-rate tracking (`utility_accounts` + `utility_bills` tables; consumption + rate trends) |
| Net Worth | Snapshot trajectory (`account_snapshots` nightly job + chart) |
| F-06 | UPI / Bank SMS auto-import (native module, READ_SMS permission, 30+ bank templates, draft review UI, duplicate dedup) — last to ship |
| F-15 | Credit-card statement CSV import (HDFC, SBI, ICICI formats; reconciliation UI) |

#### Dependencies

Phase 1 (migrations, soft-delete, contexts).
Phase 2 (`merchants` table, payment_method, receipt storage, OCR template learning helps utility bill recognition).
Phase 3 (recurring detection informs notifications; analytics base shared with leakage score).

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `READ_SMS` permission rejected by Google Play | High | Google Play Sensitive Permission declaration; offline-only fallback works |
| SMS template churn (banks change formats) | High | User-editable template registry; community curation; feature flag for kill-switch |
| Pantry manual depletion gets ignored | High | Auto-deplete from consumption rate as fallback |
| EMI amortization off-by-one (banking rounding varies per bank) | Medium | User can override `emi_amount`; flag drift |
| Split expense becomes a sub-product (settlement integrations) | Medium | Scope to: record splits + show balance. Defer settlement to Phase 5+ |
| Background notifications unreliable on Xiaomi/OnePlus (battery savers) | Medium | Foreground checks as backup; explicit user guidance for battery whitelist |

#### Acceptance gate

All Tier-1 power features ship behind feature flags; SMS import handles 5+ banks with > 90 % parse accuracy; notification scheduling correct + non-duplicate; EMI amortization matches user-validated schedules; split balance correct across 3-way fixtures.

#### Priority

**P2 — high willingness-to-pay.** These are the features users name when they say "I'd pay for this." Phase 4 is the layer that defines what a paid tier could look like (if monetisation is ever considered).

---

### PHASE 5 — ADVANCED FORECASTING & PLATFORM

**Duration:** ongoing, opportunistic · **Effort:** ~30 dev-days spread over months · **Priority:** P2/P3 — long-horizon platform

#### Goals

1. The 5-model cashflow forecast ensemble lands in full, with a confidence cone and probability of going over budget.
2. Anomaly detection (Z-score), price prediction (linear regression per item with 12+ months data), and lifestyle decomposition complete the analytics platform.
3. Virtualisation of every long list; OCR off the JS critical path; receipt image pipeline complete (WebP, thumbnails, lifecycle GC).
4. Daily maintenance job (`PRAGMA optimize`, `ANALYZE`, `VACUUM`, orphan cleanup, rollup-drift verification, integrity check).
5. One-tap encrypted backup + restore (`.driftbackup`, AES-GCM zip).
6. Biometric / PIN lock closes the local-first loop.
7. Query cache layer (`useQuery` with `staleTime` + tag invalidation).
8. Observability scaffold (dev-only query timing, persistent `db_stats`, React Profiler wrappers).
9. Cloud-sync architectural spike (no implementation) — decision deferred until user demand justifies it.
10. SQLCipher feasibility spike — go/no-go decision.

#### Features delivered

**Forecasting & advanced analytics**
- 5-model cashflow ensemble: weighted linear + historical month + rolling 90d + recurring-aware + day-of-week pattern
- Confidence cone visualisation (`react-native-svg`) on Forecast screen
- 3-month lookahead = historical-month baseline × 6-month slope × seasonal multiplier
- **Anomaly detection** — per-category µ ± 2σ from 90-day rolling; flag in Detail screen
- **Price prediction stub** — linear regression per item (requires 12+ months data); surfaced in ItemTrend
- **Carbon footprint** — proper category-mapped CO₂ model (replaces the hardcoded 0.4 kg)
- **Cross-category substitution detection** (Pearson correlation)
- **Price elasticity per item** (price vs quantity over time)

**Platform / scaling**
- Virtualised FlatList / SectionList on AllExpenses, PotDetail, Items, ItemTrend, Trends, Subs, Goals, Travel
- `expo-image` replaces `<Image>` with `recyclingKey={uri}`
- OCR parse chunking — yield after each stage via `setImmediate`; cancellable via `scanRequestId` ref
- Receipt image pipeline complete: WebP at 1600 px / 320 px thumb, EXIF stripped, sha-1 hash, partitioned `documentDirectory/drift/receipts/{full,thumb}/yyyy/mm/<uuid>.webp`
- Daily maintenance service (background→foreground transition, rate-limited daily)
- Custom `useQuery` hook with staleTime + tag invalidation + LRU bound 64 keys
- Dev-only `withTiming(repoMethod)` wrapper; React Profiler wrappers on Home / Trends / AllExpenses / Items
- Persistent `db_stats` row; hidden Diagnostics screen
- Encrypted `.driftbackup` zip (DB + receipts; AES-GCM via `expo-crypto`; user passphrase; atomic restore)
- Biometric / PIN lock via `expo-local-authentication`; settings toggle
- `account_snapshots` nightly job (overlaps Phase 4; finalised here)

**Architectural spikes (decision docs only)**
- SQLCipher encryption-at-rest — feasibility + perf measurement → go/no-go
- Cloud-sync architectural spike — CRDT vs LWW, conflict resolution, identity model → design doc only

**Archive mode (if needed at year 10)**
- `archive_expenses` + `archive_receipt_items` tables
- Yearly job moves rows older than 2 years from active to archive
- AllExpenses gets a "View archive" toggle; archive results visually distinct

#### Dependencies

Phases 1, 2, 3 complete.
Phase 4 (EMI/utility/income are useful inputs to the recurring-aware forecast model).
Some tasks (FlatList migration, image pipeline, daily maintenance) can land opportunistically in Phases 2–4 as soon as they unblock something else.

#### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| FlatList migration introduces row layout shifts | Medium | `getItemLayout` everywhere; visual regression tests |
| OCR chunking introduces stale-result race | Medium | `scanRequestId` ref; discard if mismatched |
| Receipt image pipeline blocks save UX | Medium | Compression runs async; record path optimistically |
| Backup file size grows to GBs with full receipt set | Medium | "Metadata-only" backup option; DB-without-receipts mode |
| SQLCipher kills perf 30 %+ | High | Spike first; defer unless threat model justifies |
| Cloud sync becomes a creeping commitment | Medium | Strictly design-doc-only in this phase; gate implementation on user demand |
| 5-model ensemble too complex to explain | Medium | UI shows only "best / likely / worst" + probability; models internal |
| Price prediction misleads on volatile items | Medium | Show confidence band; suppress for items with high variance |

#### Acceptance gate

100k-row dataset renders smoothly on a Pixel 6a (Home < 100 ms, AllExpenses scrolls 60 fps, Items tab opens < 200 ms); backup round-trip is byte-identical (DB + receipts); biometric lock guards app launch; forecast MAE < 15 % on holdout; anomaly detection flags ≤ 5 false-positives per 1k expenses on a synthetic baseline.

#### Priority

**P2 — sustained quality.** Phase 5 is what keeps Drift's quality from regressing as data grows from year 1 to year 10. Many tasks here are opportunistic; some (FlatList, image pipeline) should not wait for "phase 5 time."

---

## Cross-Phase Dependency Map

```
Phase 1 (Foundation)
   ├── unblocks → Phase 2 (Core Intelligence)
   ├── unblocks → Phase 3 (Analytics Expansion)
   ├── unblocks → Phase 4 (Power-User Systems)
   └── unblocks → every schema-touching feature everywhere

Phase 2 (Core Intelligence)
   ├── enables  → Phase 3 (merchants table populated, FTS5, income for forecast)
   └── enables  → Phase 4 (payment method, receipt storage, OCR template learning)

Phase 3 (Analytics Expansion)
   └── informs  → Phase 4 (recurring detection feeds notifications, leakage score)

Phase 4 (Power-User Systems)
   └── enriches → Phase 5 (EMI/utility/income flow into 5-model forecast)

Phase 5 (Advanced)
   └── ongoing — opportunistic, parallel to 2–4 where capacity allows
```

## Aggregate Timing

| Phase | Effort (dev-days) | Calendar weeks (1 dev) | Calendar weeks (2 devs in parallel where possible) |
|---|---|---|---|
| 1 — Foundation Fixes | 28 | 5–6 | 3.5 |
| 2 — Core Intelligence | 43 | 8–9 | 5.5 |
| 3 — Analytics Expansion | 17 | 3.5 | 2.5 |
| 4 — Power-User Systems | 37 | 7.5 | 5 |
| 5 — Advanced (initial scope) | 30 | 6 | 4 |
| **Total** | **155** | **~30 weeks (~7 months)** | **~20 weeks (~4.5–5 months)** |

---

## Top 20 Quickest Wins

Each item below ships in a single PR, ≤ 2 days, low risk. Ratio of value to implementation cost is the ordering. These are what to ship in a single "stabilisation" sprint before any new feature work.

| # | Win | Effort | Lands in |
|---|---|---|---|
| 1 | Fix `getDB()` — reset `_opening = null` on open failure | XS | Phase 1 |
| 2 | Fix `ItemRows.js` module-level row key counter → `useRef` | XS | Phase 1 |
| 3 | Fix Scan.js produce vs non-produce category-guess (duplicated-branch bug) | XS | Phase 1 |
| 4 | Set image picker `quality: 1.0`, PNG output | XS | Phase 1 |
| 5 | Set SQLite PRAGMAs: WAL, NORMAL sync, MEMORY temp, 20 MB cache, mmap 256 MB | XS | Phase 1 |
| 6 | Add `idx_items_expense` on `receipt_items(expense_id)` | XS | Phase 1 |
| 7 | Remove `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE` permissions | XS | Phase 1 |
| 8 | Remove unused `@react-native-async-storage/async-storage` | XS | Phase 1 |
| 9 | Fix `[^a-z\s]` → `[^\p{L}\p{N}\s]u` in `normalizeName.js` | XS | Phase 1 |
| 10 | Move `ocr/units.js`, `ocr/normalizeName.js`, `ocr/produceList.js` → `core/domain/` | S | Phase 1 |
| 11 | Add `idx_exp_cat_date` composite index `(category_id, expense_date DESC)` | XS | Phase 1 |
| 12 | Replace `Alert.alert("Saved!")` after Scan save → inline toast | S | Phase 2 |
| 13 | Replace ISO date `TextInput` in Scan review with date picker | S | Phase 2 |
| 14 | Move `Add` screen to `presentation: 'modal'` in nav stack | S | Phase 2 |
| 15 | Save as bottom CTA button on Add screen | S | Phase 2 |
| 16 | Pull-to-refresh on Home + AllExpenses | S | Phase 2 |
| 17 | Auto-select last-used category on Add | XS | Phase 2 |
| 18 | Replace empty `catch {}` blocks with `logError(ctx, e)` | S | Phase 1 |
| 19 | `React.memo` on `CustomTabBar`, `ProgressBar`, `Toggle`, `MoodPicker` | S | Phase 1 |
| 20 | Wrap each feature screen in an `ErrorBoundary` | M | Phase 1 |

**Combined effort: ~3 dev-days.** This batch alone produces a release-eligible APK, fixes the worst correctness bug, preserves Hindi names, and removes the worst daily-friction UX bugs.

---

## Top 20 Highest-ROI Features

Ordered by user-value × frequency-of-impact ÷ effort. These are the changes that move retention and satisfaction the most.

| # | Feature | Effort | Lands in | Why high ROI |
|---|---|---|---|---|
| 1 | Schema migration system | XS | Phase 1 | Unblocks every subsequent schema-touching feature |
| 2 | Merchant autocomplete from history | M | Phase 2 | Saves ~5 sec per repeat-merchant entry; affects 80 % of daily entries |
| 3 | Full-text search across expenses/items/subs (FTS5) | M | Phase 2 | Essential at 100+ expenses; unanswered "where did X go" |
| 4 | Hindi/regional synonym dictionary in `normalizeName` | S | Phase 1 | Recovers ~30 % of currently corrupted Indian receipts |
| 5 | Payment method tracking | S | Phase 2 | Unblocks payment-method analytics + filtering |
| 6 | Predictive amount input + smart auto-category | M | Phase 2 | Halves Add taps for repeat merchants |
| 7 | ML Kit v2 upgrade + Devanagari model | M | Phase 2 | Unlocks Hindi script support for kirana receipts |
| 8 | CSV/JSON export | M | Phase 2 | Trust feature; data portability mandatory |
| 9 | Permanent receipt image storage | M | Phase 2 | Stops silent receipt loss |
| 10 | Personal inflation basket index | M | Phase 3 | Differentiator — no Indian app has it |
| 11 | 5-model cashflow forecast | L | Phase 3 + 5 | Replaces wildly inaccurate linear extrapolation |
| 12 | Reorder queue (item due predictions) | M | Phase 3 | Actionable — "buy milk Tuesday" |
| 13 | Date range filter + multi-dim FilterSheet on AllExpenses | M | Phase 2 | Power-user productivity unlock |
| 14 | Income tracking + savings rate widget | M | Phase 2 | The most-asked metric in personal finance |
| 15 | Subscription calendar + 3-day reminder notification | M | Phase 4 | Activates the inert `next_bill` field |
| 16 | Smart merchant-to-category map (~1k bundled entries) | M | Phase 2 | New-user friction reduction |
| 17 | Swipe-to-delete with undo toast | M | Phase 2 | Replaces 2-step alert dialog with 1-step gesture |
| 18 | Cheapest merchant per item | S | Phase 3 | "Save 32 % — D-Mart vs Nature's Basket on Toor Dal" |
| 19 | Subscription leakage score | S | Phase 3 | "🔴 22 % of spend goes to subs; ₹820/mo potentially wasted" |
| 20 | Receipt image viewer modal + GST breakdown UI | S | Phase 2 | Closes the "stored but unviewable" gap; surfaces parsed GST |

**Combined effort: ~30 dev-days.** Together these account for ~70 % of perceived product improvement.

---

## Top 20 Long-Term Opportunities

These are the moves that compound: each is enabled by the prior phases and creates options that did not exist before. Most are Phase 4 or Phase 5; some are deferred decisions kept architecturally open.

| # | Opportunity | Why it matters | Horizon |
|---|---|---|---|
| 1 | **Personal inflation basket index productised as a public benchmark** | Drift's index becomes the only personal-CPI dataset for Indian households. PR moat | Year 1 |
| 2 | **UPI / Bank SMS auto-import** | Removes the #1 reason finance apps are abandoned in India. ~80 % of daily transactions become zero-tap | Phase 4 |
| 3 | **Receipt template learning per merchant** | Compounding moat — each scan of the same merchant gets more accurate. Grows with use | Phase 2 / 4 |
| 4 | **GST input tax credit tracking + quarterly export pack** | Freelancers + small businesses need this for ITR-3. Sellable as a "GST pack" | Phase 2 → 4 |
| 5 | **Item-level reorder predictions + smart shopping list** | Combines pantry + consumption rate + purchase history. Crosses from "track" to "plan" | Phase 3 + 4 |
| 6 | **5-model cashflow forecast with confidence cone** | Replaces wildly inaccurate single-line forecast with a banded prediction users can act on | Phase 3 + 5 |
| 7 | **Multi-script OCR (Devanagari + Tamil + Telugu + Kannada + Bengali)** | Unlocks Tier 2/3 cities and the segment competing apps cannot serve | Phase 2 |
| 8 | **Encrypted local backup + restore (`.driftbackup`)** | Closes the local-first loop. Users can switch phones without losing 5 years of receipts | Phase 5 |
| 9 | **Subscription leakage score + smart cancel calendar** | The single most-shared insight in finance apps. Drives word-of-mouth growth | Phase 3 + 4 |
| 10 | **Drift as a household financial knowledge graph** | Merchants × products × prices × people × time. Every future feature compounds on the schema | Phase 1 onwards |
| 11 | **Item price prediction (12+ months of data)** | The natural next step beyond inflation index — actionable forecasts per item | Phase 5 |
| 12 | **Native Kotlin preprocessing (CLAHE, Sauvola, deskew)** | Lifts pharmacy and thermal-receipt accuracy by 20–30 percentage points | Phase 2 |
| 13 | **Biometric / PIN lock + SQLCipher encryption-at-rest** | Closes the privacy posture; supports power users who store sensitive financial data | Phase 5 |
| 14 | **Optional opt-in encrypted cloud sync (CRDT or LWW)** | Multi-device tolerance without compromising local-first; deferred until demand justifies | Phase 5+ |
| 15 | **Family / household mode (designed but not built)** | Joint-family + flatmate finances are common in India. Shared budgets without sharing accounts | Year 2+ |
| 16 | **Account Aggregator (RBI AA framework) integration** | The long-term solution to bank-data sync, regulated and consented | Year 2+ |
| 17 | **On-device LLM receipt summarisation + categorisation** | When mid-tier devices reach sub-100 ms inference latency, this replaces rule-based categorisation | Year 2+ |
| 18 | **Anomaly + lifestyle-drift alerts as proactive notifications** | "You spent 3× your average yesterday" delivered the morning after, not when user opens the app | Phase 4 + 5 |
| 19 | **Per-merchant analytics → merchant deal-finding** | Cheapest-merchant-per-item generalised into "where to shop this week for your basket" | Phase 3 |
| 20 | **Investment portfolio tracking (Phase 6+)** | Currently out of scope; the schema (`accounts`, `account_transactions`, `account_snapshots`) is ready to host it | Year 2+ |

---

## Out of Scope (Explicit Non-Goals)

These are deliberately not in any phase, to keep the architecture and product focus tight:

- Multi-user / family sharing (single-user only for v1–v3)
- Real-time cloud sync (deferred; architectural doors kept open in Phase 5)
- iOS app (RN architecture supports it, but execution is Android-first)
- Server-side OCR (Gemini backend remains a future fallback, not a primary path)
- Investment portfolio tracking (possibly v4)
- Real bank API integrations (RBI Account Aggregator framework) — deferred
- Multi-tenant backend (irrelevant to local-first product)

---

## Closing Note

Drift is a year away from being best-in-class for its market segment. The work to get there is described, sequenced, sized, and risk-assessed in five phases. The next decision is whether to start Phase 1 day 1.

The five-phase plan above maps cleanly to the eight-phase execution staging in `09-roadmap/execution_roadmap.md`. The detailed task tables in the underlying docs (`09-roadmap/execution_roadmap.md`, `09-roadmap/prioritization_matrix.md`, `09-roadmap/quick_wins.md`, `09-roadmap/long_term_strategy.md`) remain the implementation contract; this document is the strategic contract above them.
