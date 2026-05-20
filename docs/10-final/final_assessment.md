# Drift — Final Assessment

> **Authored by:** Principal fintech product architect
> **Synthesis date:** 2026-05-17
> **Companion to:** `master_roadmap.md`
> **Sources:** Full `/docs` corpus (33 documents, ~12,000 lines)

This document is the final scoring and verdict on Drift's current state, the dimensions on which it should be measured, and where it lands after each phase of the master roadmap executes.

---

## 1. Executive Verdict

Drift is a **late-MVP, pre-production v1.0** product with a strong differentiated foundation (item-level OCR + true offline-first) sitting beneath a layer of architectural shortcuts that will compound into damage as the user base grows and as data accumulates.

The composite read across all seven dimensions: **5.7 / 10 today → 9.0 / 10 after the 5-phase master roadmap executes.**

The work is well-scoped, well-sequenced, and disproportionately weighted toward the early phases — Phase 1 alone eliminates the most dangerous correctness, security, and release-blocking issues.

**Stage classification:**

| Axis | Verdict |
|---|---|
| Product–market fit | Strong differentiation (item-level OCR + offline-first); under-explored |
| Engineering maturity | Late-MVP; architectural debt forming |
| Release-readiness | Not Play Store eligible today (debug keystore, perms, no minify) |
| Data correctness | Compromised (500-row cap, ASCII-only normalisation) |
| Scaling readiness | Not ready beyond ~6 months of daily use without intervention |
| Defensibility | High — the data layer (item-level + offline) is the moat |

---

## 2. Scoring Rubric

Each axis scored out of 10. Two values: **Current** (today) and **Target** (after Phase 5 of `master_roadmap.md`).

| Score | Meaning |
|---|---|
| 9–10 | Best-in-class. Industry-leading. Few competitors match |
| 7–8 | Above average. Solid for the product stage |
| 5–6 | Adequate but with material gaps |
| 3–4 | Functional but with significant deficiencies |
| 1–2 | Broken / blocking / dangerous |

---

## 3. Seven-Axis Scoring

| Axis | Current | Target | Δ | One-line read |
|---|---|---|---|---|
| **Architecture** | 5 / 10 | 9 / 10 | +4 | God context, raw repo exposure, cross-layer coupling, no DI, no service layer. Repo layer is clean. After refactor: per-feature contexts + service layer + clean dependency rules |
| **UX** | 7 / 10 | 9 / 10 | +2 | Beautiful surface, weak power-user depth, no search, no accessibility labels, mood mandatory, Save as text link. After: autocomplete, swipe actions, modal Add, undo, accessibility audit complete |
| **OCR** | 7 / 10 | 9 / 10 | +2 | India-aware 10-format pipeline, confidence model, but ASCII-only normalisation destroys Hindi names and ML Kit v1. After: ML Kit v2, Tesseract fallback, column detection, template learning, Unicode-safe pipeline |
| **Analytics** | 5 / 10 | 9 / 10 | +4 | One brilliant feature (item price tracking + same-qty comparison); everything else shallow. After: personal inflation index, lifestyle drift, 5-model forecast, reorder queue, leakage score, all 20 Tier-1 analytics |
| **Database** | 6 / 10 | 9 / 10 | +3 | Normalised 10-table schema with good FKs, but missing migrations, FTS5, rollups, audit trails, soft delete, merchant/product entities. After: 22-table schema with rollups, FTS5, triggers, audit trails |
| **Maintainability** | 4 / 10 | 8 / 10 | +4 | No TypeScript, no tests, no migrations, no in-code docs, magic numbers in three places (500 limit). After: full test suite, migrations versioned, ESLint dependency rules, OCR golden dataset |
| **Scalability** | 3 / 10 | 9 / 10 | +6 | Silent corruption past 500 expenses, N+1 queries, no virtualisation, unbounded images. After: 10-year horizon with bounded resources, virtualised lists, image pipeline, daily maintenance |

### Composite

| | Current | Target |
|---|---|---|
| **Mean** | **5.3 / 10** | **8.9 / 10** |
| **Stage** | Late-MVP / pre-production | Production-grade, differentiated |

(Adding the two supplementary axes from the existing `09-roadmap/final_scoring.md` — Offline-first quality (9 → 10) and Extensibility (4 → 9) — moves the composite to 5.6 → 9.0. The seven required axes alone produce 5.3 → 8.9.)

---

## 4. Detailed Axis Commentary

### 4.1 Architecture — 5 / 10 (target 9 / 10)

**Strengths**
- Repository layer is well-encapsulated (one file per entity, async, composable) — the cleanest part of the codebase
- OCR module is structurally isolated as a pipeline pattern
- React Navigation correctly configured (stack + tabs)
- Foreign keys + cascade behaviour are explicit and correct (`receipt_items` cascade with `expenses`, `trip_categories` with `trips`)
- Dual-OCR architectural scaffold present — backend `/receipt` endpoint mirrors the cloud-OCR shape, so the seam for a future fallback exists

**Weaknesses**
- `useAppState.js` is a 178-line god context holding 8 entities, 30+ mutations, derived state, theme, and raw repos
- `refresh()` reloads everything on minor mutations — profile name change → 500 expense rows + all trips + all subs + all goals
- `repos: { items, expenses, accounts, trips }` exposed raw on context — two paths to the same data
- Cross-layer imports: `db/repo/items.js → ocr/units.js`; `components/ItemRows.js → ocr/*`; `navigation/index.js → useApp()`
- No service / use-case layer; `Scan.js` (467 lines) orchestrates 5 OCR modules directly
- No path aliases, no DI, no mockability
- Backend schema diverged from app schema — 4 of 10 entities have no backend home

**Path to 9 / 10:** Phase 1 (Foundation Fixes — architecture sub-phase) addresses every point above. The work is well-scoped (~11 dev-days for the architecture refactor alone) and well-understood; the only risk is the size of the diff. Compatibility shim retained until every screen is migrated.

### 4.2 UX — 7 / 10 (target 9 / 10)

**Strengths**
- Distinctive visual identity (Flow / botanical aesthetic, coral accent, cream)
- Glanceable Home dashboard with the right primary metric (budget remaining)
- Custom numpad is fast; amount-first paradigm matches mental model
- OCR review UX with confidence badge + format label + per-item editing
- Onboarding scope is correct (3 steps); Goals contribution flow is clean
- Strong typography hierarchy (52 → 28 → 18 → 13 → 11 px) with appropriate colour stepping

**Weaknesses**
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
- Accessibility: no labels, contrast issues (`F.ink3` on `F.cream` ≈ 3.2:1, AA needs 4.5:1), no touch-target enforcement, no font-size scaling
- Category auto-guess bug (produce vs non-produce paths identical)
- Empty state after onboarding has no guidance
- Subs occupies prime tab real estate (manage-once feature in daily-use slot)
- Notifications, widgets, keyboard shortcuts all absent

**Path to 9 / 10:** Phase 2 fixes daily-friction items (autocomplete, modal Add, toast, date picker, swipe actions, undo, search, filters); Phase 4 ships subscription calendar, notifications, calendar view; Phase 5 adds biometric lock and widget support. Accessibility audit is a sub-project of Phase 2.

### 4.3 OCR — 7 / 10 (target 9 / 10)

**Strengths**
- 10 receipt format types detected (quick commerce, food delivery, online retail, restaurant, departmental, pharmacy, fuel, transport, utility, handwritten)
- 50 brand patterns
- 4 item extraction strategies (card, tabular, permissive, totals-only)
- Canonical unit conversion at write time (g → kg, mL → L, dozen → pcs)
- 7-component weighted confidence model
- GSTIN + order ID extraction
- Tax/fee/discount extraction with priority lists
- Spatial row merging via y-overlap

**Weaknesses**
- ML Kit v1 — no Devanagari, Tamil, Telugu, Kannada, Bengali
- `[^a-z\s]` normalisation destroys all non-ASCII characters (Hindi names → empty)
- No image preprocessing (no deskew, no CLAHE, no Sauvola binarisation)
- No per-element OCR confidence consumed
- No fallback OCR engine — single ML Kit call; empty result → zero items
- No column detection for multi-column pharmacy/DMart
- No duplicate-receipt fingerprinting
- SKIP_RE over-matches item names ("Total Care Soap" → skipped)
- Date regex has no day/month range validation
- Decimal quantities lost from `qty × rate = total` derivation
- `produceList.js` has only English names (no `tamatar`, `aloo`, `pyaaz`)
- No per-item GST rate extraction
- No template learning per merchant
- Pharmacy batch/expiry not extracted
- Fuel single-item not extracted
- GSTIN parsed but not persisted
- `itemBandTop = 10%` is wrong for app-generated receipts (Blinkit/Zepto headers occupy 25–40 %)
- `findNameBackward()` stops on SKIP_RE — pharmacy receipts with batch-number rows lose the name
- Single-image capture; no multi-frame stitching for long receipts

**Path to 9 / 10:** Phase 1 fixes the quick wins (Unicode normalisation, Hindi synonyms, regex bugs, image quality). Phase 2 upgrades the engine (ML Kit v2 + per-element confidence + column detection + duplicate detection + Jaro-Winkler merchant dedup + Tesseract fallback + native preprocessing + template learning).

Per-format accuracy targets after execution:

| Receipt type | Today | After Phase 2 |
|---|---|---|
| Quick commerce / food delivery digital | 85 % | 95 % |
| Restaurant printed (laser) | 75 % | 90 % |
| DMart POS thermal | 65 % | 85 % |
| Pharmacy (small font, 5 columns) | 45 % | 80 % |
| Handwritten kirana | 40 % | 65 % |
| Hindi-only kirana | 5 % | 75 % |
| Crumpled thermal | 30 % | 70 % |

### 4.4 Analytics — 5 / 10 (target 9 / 10)

**Strengths**
- Item-level price tracking with sparklines — class-leading; no Indian competitor has this
- Per-item consumption tracking with week/month/year buckets
- Same-quantity merchant comparison (clever, differentiated)
- Top price mover surfaced on Home
- 6-month monthly trend
- Budget vs actual per category (current month)
- Subscription monthly cost summary
- Net worth snapshot

**Weaknesses**
- No time-series beyond 6 months
- No merchant analytics (merchant is free text; no aggregation)
- No personal inflation index (despite all the data being captured)
- No reorder prediction (despite `purchase_date` + repeat-purchase being trivially derivable)
- No seasonal patterns
- No day-of-week / day-of-month
- No cashflow forecast beyond a linear `× daysInMonth / dayOfMonth` extrapolation
- No anomaly detection
- No lifestyle inflation detection
- No subscription leakage score
- No category × month variance heatmap
- No year-over-year compare
- Net worth has no trajectory (no snapshots)
- Carbon hardcoded to 0.4 kg — misleading placeholder

**Path to 9 / 10:** Phase 3 ships all Tier-1 analytics (inflation index, cheapest merchant, velocity, lifestyle inflation, leakage, seasonal, heatmaps, variance, calendar, foundation forecast). Phase 5 completes the advanced layer (5-model ensemble, anomaly detection, price prediction). The unlock is engineering, not data — the item-level receipt data is already captured.

### 4.5 Database — 6 / 10 (target 9 / 10)

**Strengths**
- Normalised 10-table schema
- Foreign keys enabled and used correctly
- Cascade behaviour explicit (`receipt_items` cascade with `expenses`)
- Canonical unit columns alongside raw on `receipt_items`
- Four well-placed indexes
- Singleton enforcement via `CHECK id = 1`

**Weaknesses**
- No migration runner — `CREATE TABLE IF NOT EXISTS` blocks every future schema change
- `expenses.recurring` orphaned from `subscriptions`
- `accounts` not linked to `expenses` (net worth perpetually stale)
- `trips` not linked to `expenses` (trip actual spend cannot be derived)
- `goals.saved_amount` has no contribution audit trail
- No merchant entity (free text only)
- No product entity (string-keyed `normalized_name` only)
- No CHECK constraints on enum-style columns
- `subscriptions.cancelled` has no `cancelled_at`
- `categories.budget` is implicitly monthly (no `budget_period`)
- No soft delete columns
- No FTS5 — text search will require full-table LIKE
- No rollup tables (`monthly_summary`, `item_summary`)
- No multi-currency support on `expenses`
- `receipt_uri` stores volatile paths
- `receipt_items(expense_id)` index missing — cascade delete is O(N)
- `substr(expense_date, 1, 7)` predicates defeat indexes
- `subscriptions.verdict`, `receipt_items.kind`, `accounts.kind`, `categories.budget_period` have no CHECK
- `purchase_date` denormalised but not propagated on expense edit
- `trips.dest_rate` is a single static rate
- No deletion → image cleanup
- No GSTIN / HSN / IGST persistence

**Path to 9 / 10:** Phase 1's database sub-phase ships migrations v2..vN that bring the schema to 22 tables with rollups, audit trails, soft delete, FTS5, and proper linkages. The schema then hosts every Phase 2–4 feature without further structural change.

### 4.6 Maintainability — 4 / 10 (target 8 / 10)

**Strengths**
- File structure is small enough that a developer can read everything in a day
- Code style is consistent
- No dead code beyond two unused dependencies

**Weaknesses**
- Zero automated tests in 12,000+ lines of code
- Zero TypeScript — every function contract is implicit
- `CREATE TABLE IF NOT EXISTS` means no migration path
- Carbon tracking is a deliberate placeholder that misleads users
- 500-row limit hardcoded in three places
- No prop types or runtime validation
- Empty `catch {}` blocks silently swallow failures
- `_opening` race condition in `getDB()`
- No in-code documentation; no ADRs
- No CI/CD pipeline (no `EXPLAIN QUERY PLAN` assertions, no linting beyond defaults)
- Backend Postgres schema diverged from app SQLite schema — sync is blocked

**Path to 8 / 10:** Phase 1 fixes the worst offenders (migrations, error logging, error boundaries); Phase 2 adds Jest + `react-native-testing-library` + OCR golden dataset + EXPLAIN QUERY PLAN assertions in CI. Long-term: adopt TypeScript across `features/` after Phase 1 lands (revisit decision based on how much the architecture refactor exposes implicit-contract bugs).

Why not 9 or 10? Reaching that requires TypeScript across the entire codebase, full unit + integration + visual regression coverage, and an established release-discipline regime (phased rollout, crash-free rate target, schema-version pinning in CI). These are aspirational, not part of the 6-month roadmap.

### 4.7 Scalability — 3 / 10 (target 9 / 10)

**Strengths**
- Schema is normalised in a way that *could* scale
- Indexes cover dominant access patterns
- expo-sqlite is non-blocking on the native side
- Cascade behaviour is correct
- expo-sqlite ships SQLite 3.45+ with WAL, FTS5, generated columns, window functions — all the primitives needed

**Weaknesses**
- 500-row hard cap in three places — silent data corruption past ~5 months of daily use
- Every mutation re-fetches 500 rows + all 8 entities
- `summary` `useMemo` scans all expenses in JS on every mutation
- N+1 in `items.trackedItems()` — 1k items = 1k+ queries
- N+1 in `trips.listWithCategories()`
- Correlated subqueries in `items.suggest()` — 3N+1 lookups per keystroke
- No virtualisation anywhere (ScrollView + `.map()` on every list)
- Unbounded receipt images (~20 GB at year 10)
- No WAL — writes block reads
- No FTS5 — text search will require full-table LIKE
- Default `synchronous=FULL` is overkill, slows writes
- No maintenance job (VACUUM, ANALYZE never run)
- No pagination contract on any repo
- `mergeIntoRows()` is O(n²)
- OCR parse on the JS thread blocks rendering

**Path to 9 / 10:** Phases 1, 3, and 5 collectively address every point above. After execution, the app handles 100k+ expenses smoothly on mid-tier Android.

Resource budget targets at year 10 (after Phase 5):

| Resource | Year-10 target | Hard ceiling |
|---|---|---|
| DB size | < 150 MB | 500 MB |
| Image storage | < 8 GB | 20 GB |
| JS heap steady-state | < 120 MB | 200 MB |
| App cold start | < 600 ms | 1.5 s |
| Home render | < 150 ms | 300 ms |

Beyond Year-10 ceilings: archive-mode (older expenses moved to a secondary DB and surfaced via search/export).

---

## 5. Most Dangerous Technical Debt (Ranked)

Ranked by blast radius × likelihood of triggering. From `01-current-analysis/risk_analysis.md` and cross-validated against the architecture and database audits.

| Rank | Debt | Why it's dangerous |
|---|---|---|
| 1 | **No migration system** | Blocks every schema-touching feature; once shipped, irreversible without elaborate fallback |
| 2 | **500-row hard cap + JS-side `summary`** | Silent correctness bug — wrong totals shown without any error surfaced |
| 3 | **Release-signed APK with debug keystore** | Prevents Play Store release |
| 4 | **God Context with raw `repos` exposed** | Every screen has two paths to the same data; state consistency impossible |
| 5 | **N+1 in `items.trackedItems()` and `trips.listWithCategories()`** | Performance cliff at 50+ tracked items; runs on every refresh |
| 6 | **ASCII-only normalisation** | Permanent data quality loss — Hindi names cannot be recovered later |
| 7 | **`receipt_uri` volatility** | Receipt images silently disappear; user trust collapses on first noticed loss |
| 8 | **Schema divergence between app SQLite and backend Postgres** | Future sync rewrites one or both from scratch |
| 9 | **Carbon hardcoded to 0.4 kg** | Misleading feature actively damages product credibility |
| 10 | **Cross-layer imports** (`db/repo/items.js → ocr/units.js`; `components/ItemRows.js → ocr/*`) | Makes OCR module immovable and repo untestable |
| 11 | **`getDB()` `_opening` never reset on failure** | One DB-open failure → app frozen forever, no error surfaced |
| 12 | **No tests** | 600+ lines of OCR regex have zero regression coverage |

All 12 are addressed by Phase 1 of the master roadmap.

---

## 6. Strategic Risks

Risks are *what could go wrong even with strong execution.* Ranked by likelihood × impact.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | 500-row cap silently corrupts data | Certain | High | Phase 1 fix is mandatory before any Play Store release |
| 2 | No migration system blocks every future schema-touching feature | Certain | High | Phase 1 ships the migration runner first |
| 3 | Release-signed APK with debug keystore blocks Play Store | Certain | Critical | Phase 1 generates production keystore + secrets management |
| 4 | OCR ASCII-only normalisation permanently corrupts Hindi names | Certain (already happening) | High | Phase 1 fixes immediately; re-scan optional for users |
| 5 | Receipt images stored in volatile paths disappear | High | High | Phase 2 + 5 image pipeline copies to permanent storage |
| 6 | God context refactor introduces subtle state-consistency bugs | Medium | High | Phase 1 ships behind compatibility shim; gradual migration |
| 7 | SMS import permission rejected by Google Play | High | Medium-High | Sensitive Permission declaration; offline-only fallback works |
| 8 | Bank SMS format churn | High (ongoing) | Medium | User-editable template registry; community curation |
| 9 | Scope creep blows out the 6-month roadmap | High | Medium | Phases are independently shippable; cut Phase 4 by tier if needed |
| 10 | Single-developer execution risk | Medium-High | High | Phases 1 + 2 are non-negotiable; everything else is opportunistic |

---

## 7. What Drift Does Better Than Anyone

The features below already differentiate Drift today, even at MVP quality. The roadmap deepens each.

| Differentiator | What it is | Why it matters |
|---|---|---|
| **Item-level OCR intelligence** | Per-item `normalized_name` + canonical units + unit price + indexed `(normalized_name, purchase_date)` | No competing Indian app captures this depth. Enables every analytics feature in Phase 3 |
| **Truly offline-first** | Zero network in any user-facing flow; no telemetry; no third-party SDKs | Privacy/sovereignty is genuine, not marketing copy |
| **India-aware OCR** | 10 receipt formats × 50 brand patterns × 4 extraction strategies × confidence scoring | Designed for Indian receipt complexity, not adapted from a US-built parser |
| **Visual identity** | Flow / botanical aesthetic, coral accent, cream surfaces, custom numpad | Distinctive and consistent across 21 screens |
| **Same-quantity merchant comparison** | "Same 1 kg toor dal at D-Mart vs Reliance Fresh" | A unique class-leading micro-feature |
| **GSTIN + tax extraction architecture** | OCR already parses CGST/SGST/IGST, HSN, GSTIN, invoice numbers | Persistence is missing (Phase 2) but the hard parsing work is done |
| **Sophisticated repository layer** | Per-entity files, async, composable, FK-aware, cascade-correct | The cleanest part of the codebase — sound foundation for the rest |

---

## 8. What Drift Must Become

The five strategic moves that define the next 6 months:

1. **A correctness-first foundation.** Phase 1 makes Drift a Play-Store-releasable, data-correct, schema-evolvable, error-bounded app. Without this, nothing else matters.
2. **A power-user expense intelligence layer.** Phase 2 (search, autocomplete, filters, batch ops, export, payment method, income, GST persistence, multi-script OCR) turns Drift from a logging app into an expense intelligence platform.
3. **The differentiated analytics moat.** Phase 3 ships personal inflation, lifestyle drift, reorder queue, leakage score, cheapest-merchant, velocity, calendar/heatmap views — features no Indian competitor has.
4. **The willingness-to-pay layer.** Phase 4 ships notifications, sub calendar, EMI, fuel/vehicle, pantry, splits, tags, rollover budgets, utility tracking, SMS import — the features users name when they say "I'd pay for this."
5. **The 10-year platform.** Phase 5 ships the 5-model forecast, anomaly detection, biometric lock, encrypted backup, virtualised lists, the daily maintenance job, and keeps the cloud-sync architectural door open without committing.

---

## 9. Composite Trajectory

| Phase | Mean Score | Stage |
|---|---|---|
| Today (pre-Phase-1) | 5.3 / 10 | Late-MVP, pre-production |
| After Phase 1 | 6.8 / 10 | Production-ready v1.0 |
| After Phase 2 | 7.6 / 10 | Differentiated user-facing v1.5 |
| After Phase 3 | 8.2 / 10 | Analytics moat established |
| After Phase 4 | 8.6 / 10 | Power-user / paid-tier-ready v2.0 |
| After Phase 5 | 8.9 / 10 | Production-grade, 10-year-scalable v3.0 |

(Numbers are means across the seven required axes — Architecture, UX, OCR, Analytics, Database, Maintainability, Scalability.)

The shape of the curve matters more than any single number: **Phase 1 alone moves Drift from 5.3 to 6.8** — a 1.5-point jump for the smallest scope of work in the entire roadmap. This is the largest correctness-and-stability gain available anywhere in the plan, and it is non-negotiable.

---

## 10. Strategic Conclusion

Drift is approximately **one year of focused work** away from being best-in-class for its market segment.

The differentiated assets — item-level OCR, offline-first, India-aware parsing, visual identity, the clean repository layer — are real and present today. The architectural shortcuts that prevent those assets from compounding are well-understood, well-bounded, and addressable in five sequenced phases.

The next decision is not *what to build* — that is fully specified across `01-current-analysis/` through `09-roadmap/`. The next decision is simply whether to start Phase 1, day 1.

**Recommended next action:** ship the Top-20-Quickest-Wins batch from `master_roadmap.md` (Section: *Top 20 Quickest Wins*). Three developer-days of work that produces a release-eligible APK, fixes the worst correctness bug, preserves Hindi names, and removes the worst daily-friction UX bugs — without requiring any schema migration. That batch is the proof-of-execution that justifies the rest of Phase 1.

After that, the path is described, sequenced, sized, and risk-assessed. The work to get Drift to 9 / 10 across every dimension is real, but it is no longer ambiguous.
