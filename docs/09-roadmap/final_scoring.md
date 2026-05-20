# Drift — Final Scoring & Strategic Top-10s

> Companion to `execution_roadmap.md`, `prioritization_matrix.md`, `quick_wins.md`, `long_term_strategy.md`
> Synthesis date: 2026-05-17

---

## SECTION 1 — Scoring Methodology

Each axis is scored out of 10 against the following rubric:

| Score | Meaning |
|---|---|
| 9–10 | Best-in-class. Industry-leading. Few competitors match |
| 7–8 | Above average. Solid for the product stage |
| 5–6 | Adequate but with material gaps |
| 3–4 | Functional but with significant deficiencies |
| 1–2 | Broken / blocking / dangerous |

Two scores are given per axis: **Current** (today) and **Target** (after full execution of the roadmap through Phase 8).

---

## SECTION 2 — Drift Today: Nine-Axis Scoring

| Axis | Current | Target | Δ | Rationale |
|---|---|---|---|---|
| **Architecture** | 5 / 10 | 9 / 10 | +4 | God context, raw repo exposure, cross-layer coupling, no DI, no service layer. Repo layer is clean. After refactoring: per-feature contexts + service layer + clean dependency rules. |
| **Maintainability** | 4 / 10 | 8 / 10 | +4 | No TypeScript, no tests, no migrations, no docs in code, magic numbers in three places (500 limit). After: full test suite, migrations versioned, ESLint dependency rules. |
| **UX** | 7 / 10 | 9 / 10 | +2 | Beautiful surface, weak power-user depth, no search, no accessibility labels, mood mandatory, Save as text link. After: merchant autocomplete, swipe actions, modal Add, undo, accessibility audit complete. |
| **OCR** | 7 / 10 | 9 / 10 | +2 | India-aware 10-format pipeline, confidence model, but ASCII-only normalization destroys Hindi names and ML Kit v1. After: ML Kit v2, Tesseract fallback, column detection, template learning, Unicode-safe pipeline. |
| **Analytics** | 5 / 10 | 9 / 10 | +4 | One brilliant feature (item price tracking + same-qty), everything else shallow. After: personal inflation index, lifestyle drift, 5-model forecast, reorder queue, leakage score, all 20 missing analytics. |
| **Database Design** | 6 / 10 | 9 / 10 | +3 | Normalized 10-table schema with good FKs, but missing migrations, no FTS5, no rollups, no audit trails, no soft delete, no merchant/product entities. After: 22-table schema with rollups, FTS5, triggers, audit trails. |
| **Scalability** | 3 / 10 | 9 / 10 | +6 | Silent corruption past 500 expenses, N+1 queries, no virtualization, unbounded images. After: 10-year horizon with bounded resources, virtualized lists, image pipeline, daily maintenance. |
| **Offline-first Quality** | 9 / 10 | 10 / 10 | +1 | Already excellent. Every feature works offline; backend exists but is dormant. After: encrypted backup keeps the local-first promise complete. |
| **Extensibility** | 4 / 10 | 9 / 10 | +5 | God context makes adding any new domain costly; cross-layer imports prevent reuse. After: per-feature modules with clear interfaces; new features add a directory, not modify a god file. |

### Composite Score

| | Current | Target |
|---|---|---|
| **Mean** | **5.6 / 10** | **9.0 / 10** |
| **Verdict** | Late-MVP, pre-production | Production-grade, differentiated |

---

## SECTION 3 — Detailed Axis Commentary

### 3.1 Architecture — 5/10

**Strengths:**
- Repository layer is well-encapsulated (one file per entity, async, composable)
- OCR module is structurally isolated as a pipeline pattern
- React Navigation correctly configured (stack + tabs)
- Foreign keys + cascade behavior is explicit and correct

**Weaknesses:**
- `useAppState.js` is a 178-line god context holding 8 entities, 30+ mutations, derived state, theme, and raw repos
- `refresh()` reloads everything on minor mutations (profile name change → 500 expense rows + all trips + all subs + all goals)
- `repos: { items, expenses, accounts, trips }` exposed raw on context — two paths to the same data
- `db/repo/items.js` imports `ocr/units.js` (data layer → OCR layer)
- `components/ItemRows.js` imports from `ocr/` (UI → OCR)
- `navigation/index.js` consumes `useApp()` (navigation → application state)
- No service / use-case layer; Scan.js orchestrates 5 OCR modules directly

**Path to 9/10:** Phase 2 (Architecture Refactoring) addresses every point above. The work is well-scoped (~11 dev-days) and well-understood; the only risk is the size of the diff.

### 3.2 Maintainability — 4/10

**Strengths:**
- File structure is small enough that a developer can read everything in a day
- Code style is consistent
- No dead code beyond two unused dependencies

**Weaknesses:**
- Zero automated tests in 12,000+ lines of code
- Zero TypeScript — every function contract is implicit
- `CREATE TABLE IF NOT EXISTS` means no migration path
- Carbon tracking is a deliberate placeholder that misleads users
- 500-row limit hardcoded in three places
- No prop types or runtime validation
- Empty `catch {}` blocks silently swallow failures
- `_opening` race condition in `getDB()`

**Path to 8/10:** Phase 1 (Foundation) fixes the worst offenders; Phase 2 adds tests. Long-term: adopt TypeScript across `features/` (revisit decision after Phase 2 lands).

### 3.3 UX — 7/10

**Strengths:**
- Distinctive visual identity (Flow/botanical, coral accent, cream)
- Glanceable Home dashboard with right primary metric
- Custom numpad fast
- OCR review UX with confidence badge + per-item editing
- Onboarding scope is correct (3 steps)
- Strong typography hierarchy

**Weaknesses:**
- No search anywhere
- No merchant autocomplete (users retype "Zepto" hundreds of times)
- No date range filter (locked to current month)
- Save as a small header link, not a bottom CTA
- Add screen opens as a tab (destroys context)
- ISO date `TextInput` on Scan review
- `Alert.alert("Saved!")` interrupts after Scan save
- No swipe-to-delete, no batch ops, no undo
- Long-press as the only edit affordance on Subs (hidden)
- Mood picker mandatory on every entry
- Accessibility: no labels, contrast issues, no touch-target enforcement
- Category auto-guess bug (produce vs non-produce paths identical)
- Empty state after onboarding has no guidance

**Path to 9/10:** Phase 5 fixes the daily-friction items; Phase 7 ships subscription calendar, notifications, calendar view; Phase 8 adds biometric lock and widget support. Accessibility audit is a sub-project of Phase 7.

### 3.4 OCR — 7/10

**Strengths:**
- 10 format types detected (quick commerce, food delivery, online retail, restaurant, departmental, pharmacy, fuel, transport, utility, handwritten)
- 50 brand patterns
- 4 item extraction strategies (card, tabular, permissive, totals-only)
- Canonical unit conversion at write time (g→kg, mL→L, dozen→pcs)
- 7-component weighted confidence model
- GSTIN + order ID extraction
- Tax/fee/discount extraction with priority lists
- Spatial row merging via y-overlap

**Weaknesses:**
- ML Kit v1 → no Devanagari, Tamil, Telugu, Kannada, Bengali
- `[^a-z\s]` normalization destroys all non-ASCII characters (Hindi names → empty)
- No image preprocessing (no deskew, no CLAHE, no Sauvola binarization)
- No per-element OCR confidence consumption
- No fallback OCR engine
- No column detection for multi-column pharmacy/DMart
- No duplicate-receipt fingerprinting
- SKIP_RE over-matches item names ("Total Care Soap" → skipped)
- Date regex has no day/month validation
- Decimal quantities lost from `qty × rate = total` derivation
- `produceList.js` has only English names (no `tamatar`, `aloo`, `pyaaz`)
- No per-item GST rate extraction
- No template learning per merchant
- Pharmacy batch/expiry not extracted
- Fuel single-item not extracted
- GSTIN parsed but not persisted

**Path to 9/10:** Phase 4A fixes the quick wins (Unicode normalization, Hindi synonyms, regex bugs). Phase 4B upgrades the engine (ML Kit v2 + confidence + column detection + dedup). Phase 4C adds native preprocessing + Tesseract fallback + template learning.

### 3.5 Analytics — 5/10

**Strengths:**
- Item-level price tracking with sparklines
- Per-item consumption tracking with week/month/year buckets
- Same-quantity merchant comparison (clever, differentiated)
- Top price mover surfaced on Home
- 6-month monthly trend
- Budget vs actual per category (current month)
- Subscription monthly cost summary
- Net worth snapshot

**Weaknesses:**
- No time-series beyond 6 months
- No merchant analytics
- No personal inflation index (all the data exists)
- No reorder prediction
- No seasonal patterns
- No day-of-week / day-of-month
- No cashflow forecast beyond linear extrapolation
- No anomaly detection
- No lifestyle inflation
- No subscription leakage score
- No category × month variance heatmap
- No year-over-year compare
- Net worth has no trajectory (no snapshots)
- Carbon hardcoded to 0.4 kg

**Path to 9/10:** Phase 6 ships all 20 Tier-1 analytics features. The unlock is engineering, not data — the item-level receipt data is already captured.

### 3.6 Database Design — 6/10

**Strengths:**
- Normalized 10-table schema
- Foreign keys enabled and used correctly
- Cascade behavior explicit (`receipt_items` cascade with `expenses`)
- Canonical unit columns alongside raw on `receipt_items`
- Four well-placed indexes
- Singleton enforcement via `CHECK id = 1`

**Weaknesses:**
- No migration runner
- `expenses.recurring` orphaned from `subscriptions`
- `accounts` not linked to `expenses` (net worth perpetually stale)
- `trips` not linked to `expenses` (trip actual spend cannot be derived)
- `goals.saved_amount` has no contribution audit trail
- No merchant entity (free-text only)
- No product entity (string-keyed `normalized_name` only)
- No CHECK constraints on enum-style columns
- `subscriptions.cancelled` has no `cancelled_at`
- `categories.budget` is implicitly monthly (no `budget_period`)
- No soft delete columns
- No FTS5
- No rollup tables
- No multi-currency support on `expenses`
- `receipt_uri` stores volatile paths
- `receipt_items(expense_id)` index missing
- `substr(expense_date, 1, 7)` predicates defeat indexes
- `subscriptions.verdict` has no CHECK
- `receipt_items.kind` has no CHECK
- `purchase_date` denormalized but not propagated on expense edit
- `trips.dest_rate` is a single static rate
- No deletion → image cleanup

**Path to 9/10:** Phase 3 (Database Evolution) ships all 14+ migrations described in `03-database/future_schema.md`. The schema becomes 22 tables with rollups, audit trails, soft delete, FTS5, and proper linkages.

### 3.7 Scalability — 3/10

**Strengths:**
- Schema is normalized in a way that *could* scale
- Indexes cover dominant access patterns
- expo-sqlite is non-blocking on the native side
- Cascade behavior is correct

**Weaknesses:**
- 500-row hard cap in three places — silent data corruption past ~5 months of daily use
- Every mutation re-fetches 500 rows + all 8 entities
- `summary` `useMemo` scans all expenses in JS on every mutation
- N+1 in `items.trackedItems()` — 1k items = 1k+ queries
- N+1 in `trips.listWithCategories()`
- Correlated subqueries in `items.suggest()` — 3N+1 lookups per keystroke
- No virtualization anywhere (ScrollView + .map() on every list)
- Unbounded receipt images (~20 GB at year 10)
- No WAL — writes block reads
- No FTS5 — text search will require full-table LIKE
- Default `synchronous=FULL` is overkill, slows writes
- No maintenance job (VACUUM, ANALYZE never run)
- No pagination contract on any repo
- `mergeIntoRows()` is O(n²)
- OCR parse on the JS thread blocks rendering

**Path to 9/10:** Phases 1, 3, and 8 collectively address every point above. After execution, the app handles 100k+ expenses smoothly on mid-tier Android.

### 3.8 Offline-first Quality — 9/10

**Strengths:**
- Zero network calls in any user-facing flow
- All OCR on-device (ML Kit)
- All data in local SQLite
- All analytics computed locally
- Backend exists but is dormant
- No telemetry, no third-party SDKs, no analytics services
- Privacy is genuine, not marketing

**Weaknesses:**
- Receipt URIs can point to volatile storage (loss without warning)
- No backup mechanism (single device wipe = total loss)
- No biometric / PIN lock (anyone with the device sees everything)

**Path to 10/10:** Encrypted `.driftbackup` (Phase 8) + biometric lock (Phase 8) close the remaining gap. The local-first promise becomes complete.

### 3.9 Extensibility — 4/10

**Strengths:**
- Repo layer is small and easy to extend
- OCR module is structurally isolated
- Theme tokens are centralized

**Weaknesses:**
- Adding any new domain entity requires modifying `useAppState.js` (god context)
- Cross-layer imports prevent moving the OCR module
- Screens flat-imported from `screens/` — no feature boundaries
- No path aliases — every import is `../../..`
- No DI / no mockability
- `ItemRows.js` is a UI component that does normalization + suggestion queries

**Path to 9/10:** Phase 2 (Architecture) ships path aliases, per-feature directories, service layer, and clean dependency rules. After: a new feature is a new directory, not a modification.

---

## SECTION 4 — Top 10 Biggest Future Opportunities

Opportunities are *what could be*, given the foundation. Ranked by combined potential value and feasibility.

| # | Opportunity | Why it matters | Phase |
|---|---|---|---|
| 1 | **Personal inflation basket index** | No competing Indian app has it. Cheap to build, high-WOW. Anchors the differentiated analytics position. | 6 |
| 2 | **UPI / Bank SMS auto-import** | Removes the #1 reason finance apps are abandoned in India. ~80% of daily transactions become zero-tap entries. | 7 |
| 3 | **Receipt template learning per merchant** | Compounding improvement: each scan of the same merchant gets more accurate. Creates a moat that grows with use. | 4C |
| 4 | **GST input tax credit tracking** | Freelancers + small business owners need this for ITR-3. A dedicated GST export pack is sellable. | 5 |
| 5 | **Item-level reorder predictions + smart shopping list** | Combines pantry + consumption rate + purchase history. Crosses from "track" to "plan". | 6 + 7 |
| 6 | **5-model cashflow forecast with confidence cone** | Replaces a wildly inaccurate single-line forecast with a banded prediction users can act on. | 6 |
| 7 | **Multi-script OCR (Devanagari + Tamil + Telugu + Kannada)** | Unlocks a user segment that competing apps can't serve. Especially Tier 2/3 cities. | 4B |
| 8 | **Encrypted local backup + restore (`.driftbackup`)** | Closes the local-first loop. Users can switch phones without losing 5 years of receipts. | 8 |
| 9 | **Subscription leakage score + smart cancel calendar** | The single most-shared insight in finance apps ("you waste ₹X/month"). Drives word-of-mouth growth. | 6 + 7 |
| 10 | **Drift as a household financial knowledge graph** | Merchants × products × prices × people × time. Once the schema is in place, every future feature compounds. | 3 + 6 + 7 |

---

## SECTION 5 — Top 10 Biggest Risks

Risks are *what could go wrong*, even with strong execution. Ranked by likelihood × impact.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **500-row cap silently corrupts data** | Certain (every user past month 6) | High | Phase 1 fix is mandatory before any Play Store release |
| 2 | **No migration system blocks every future schema-touching feature** | Certain | High | Phase 1 ships the migration runner first |
| 3 | **Release-signed APK with debug keystore prevents Play Store release** | Certain | Critical | Phase 1 generates production keystore + secrets management |
| 4 | **OCR ASCII-only normalization permanently corrupts historical Hindi names** | Certain (already happening) | High | Phase 4A fixes immediately; re-scan optional for users |
| 5 | **Receipt images stored in volatile paths disappear under storage pressure** | High | High | Phase 5 + 8 image pipeline copies to permanent storage |
| 6 | **God context refactor introduces subtle state-consistency bugs** | Medium | High | Phase 2 ships behind a compatibility shim; gradual migration |
| 7 | **SMS import permission rejected by Google Play** | High | Medium-High | Sensitive Permission declaration; offline-only fallback works |
| 8 | **Bank SMS format churn** | High (ongoing) | Medium | Template registry user-editable; community curation |
| 9 | **Scope creep blows out the 6-month roadmap** | High | Medium | Phases are independently shippable; cut Phase 7 features by tier if needed |
| 10 | **Single-developer execution risk** | Medium-High | High | Phase 1 + Phase 2 are non-negotiable; everything else is opportunistic |

---

## SECTION 6 — Top 10 Most Important Refactors

Refactors are *what to change*, regardless of new feature work. Ranked by blast radius reduction.

| # | Refactor | Phase | Effort | Why critical |
|---|---|---|---|---|
| 1 | **Schema migration system** | 1 | XS | Unblocks every subsequent schema change |
| 2 | **God context → per-feature contexts** | 2 | L | Eliminates global re-renders; enables per-feature testing |
| 3 | **500-row cap fix + SQL summary** | 1 | M | Stops silent data corruption |
| 4 | **Generated `month_key` + range predicates** | 3 | M | Makes every date-filtered query indexable |
| 5 | **Materialized rollup tables (`monthly_summary`, `item_summary`)** | 3 | M | Eliminates N+1 in trackedItems + replaces JS-side aggregations |
| 6 | **Unicode-safe `normalizeName`** | 4A | XS | Stops permanent data corruption for Hindi receipts |
| 7 | **Receipt image pipeline (WebP, thumbnails, permanent paths, EXIF strip, hash)** | 5 + 8 | M | Stops silent image loss + cuts disk by 5× |
| 8 | **Move OCR domain utilities out of `ocr/`** | 2 | XS | Breaks db → ocr and components → ocr coupling |
| 9 | **`ScanService` extraction from Scan.js** | 2 | M | Makes OCR orchestration testable; thins the screen |
| 10 | **List virtualization (FlatList everywhere)** | 8 | M | Bounded memory at scale; prevents OOM crashes |

---

## SECTION 7 — Top 10 Most Valuable Features

Features ranked by user value × frequency of use, independent of effort.

| # | Feature | Why valuable | Phase |
|---|---|---|---|
| 1 | **Full-text search (FTS5)** | Becomes essential at 100 expenses; mandatory at 500+ | 5 |
| 2 | **Merchant autocomplete from history** | Saves ~5 sec per repeat-merchant entry × dozens of daily entries | 5 |
| 3 | **UPI / Bank SMS auto-import** | Removes manual entry for the most common Indian transaction type | 7 |
| 4 | **Payment method tracking + filtering** | Unlocks credit card reconciliation, UPI vs cash analytics | 5 |
| 5 | **Personal inflation basket index** | Differentiated insight no competitor has | 6 |
| 6 | **Smart merchant auto-category (1k bundled map)** | New-user friction reduction; correct first-time categorization | 5 |
| 7 | **5-model cashflow forecast** | Answers the most-asked personal finance question with usable accuracy | 6 |
| 8 | **Reorder queue / shopping list** | Converts logging into planning | 6 + 7 |
| 9 | **Subscription calendar + 3-day reminder notifications** | Activates the inert `next_bill` field; saves users money | 7 |
| 10 | **Item-level GST tracking + quarterly export** | Niche but high-value for freelancers; willingness to pay is highest here | 5 |

---

## SECTION 8 — Strategic Conclusion

Drift is a late-MVP product with a strong differentiated foundation (item-level OCR + offline-first) sitting beneath a layer of architectural shortcuts that will compound into damage as the user base grows and as data accumulates.

The roadmap converts that foundation into a defensible, 10-year-scalable, India-first personal finance intelligence platform. The work is well-scoped, well-sequenced, and disproportionately weighted toward the early phases — Phase 1 alone (7 days of work) eliminates the most dangerous correctness, security, and release-blocking issues.

**The shipping discipline that matters:**
1. Phase 1 is non-negotiable. Until it ships, no further feature work is justified.
2. Phase 2 + Phase 3 should land within the first 8 weeks. They are the foundation for everything else.
3. Phase 4A (immediate OCR fixes) can ship inside Phase 1's window. Highest user-visible improvement per developer-hour in the entire roadmap.
4. Phases 5–7 are independently shippable. Cut features by tier (Critical → High ROI → Power-user) if scope pressure rises.
5. Phase 8 is ongoing. Image pipeline and FlatList migration should not wait for "phase 8 time" — land them as soon as they unblock something else.

**The composite trajectory:** 5.6/10 today → 9.0/10 after Phase 8. Six months of focused work. No single decision in the roadmap commits the product to a path it cannot reverse.

The product is a year away from being best-in-class for its market segment. The work to get there is described, sequenced, sized, and risk-assessed in the four companion documents. The next decision is whether to start with Phase 1 day 1.
