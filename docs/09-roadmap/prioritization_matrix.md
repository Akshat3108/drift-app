# Drift — Feature Prioritization Matrix

> Companion to `execution_roadmap.md`
> Synthesis date: 2026-05-17
> All features evaluated on identical seven-axis criteria for direct comparison

---

## Scoring Rubric

| Axis | Scale | Notes |
|---|---|---|
| User Value | 1–5 | Daily-frustration impact + retention impact |
| Technical Complexity | 1–5 | 1 = an afternoon, 5 = a month with risk |
| Storage Impact | S / M / L | S < 100 KB / 1k users · M < 5 MB · L ≥ 5 MB or unbounded |
| Performance Impact | S / M / L | S = imperceptible, L = visible UI freeze if naive |
| Offline Feasibility | ✓ / ✓+ / ⚠ | ✓ = pure local, ✓+ = needs OS API (camera, SMS, notifications), ⚠ = some component requires server |
| Maintenance Cost | Low / Med / High | Ongoing cost: bank format churn, model updates, etc. |
| Priority Tier | Critical / High ROI / Power-user / Advanced / Experimental | Final assignment |

---

## Feature Categorization

### CRITICAL — Ship or the product is broken at scale

These features address current correctness, security, or fundamental capability gaps. The product cannot ship a v1.0 release without them.

| ID | Feature | User Value | Tech Complexity | Storage | Performance | Offline | Maintenance | Priority |
|---|---|---|---|---|---|---|---|---|
| F-17 | Schema Migration System | 5 | 1 | S | S | ✓ | Low | **Critical** |
| arch | Release Signing Config + R8 Minify | 5 | 1 | S | S | ✓ | Low | **Critical** |
| arch | Fix 500-row hard cap (SQL summary) | 5 | 2 | S | M | ✓ | Low | **Critical** |
| arch | Error Boundaries on every screen | 5 | 1 | S | S | ✓ | Low | **Critical** |
| arch | WAL + tuned PRAGMAs | 4 | 1 | S | L | ✓ | Low | **Critical** |
| arch | God Context → per-feature contexts | 5 | 4 | S | M | ✓ | Med | **Critical** |
| F-01 | Full-text Search (FTS5) | 5 | 1 | S | S | ✓ | Low | **Critical** |
| F-03 | Payment Method Tracking | 5 | 1 | S | S | ✓ | Low | **Critical** |
| F-02 | Advanced Multi-Dimension Filters | 5 | 2 | S | S | ✓ | Low | **Critical** |
| F-07 | Data Export (CSV/JSON/PDF) | 5 | 2 | S | S | ✓ | Low | **Critical** |
| F-25 | Receipt Image Viewer + Permanent Storage | 4 | 2 | L | M | ✓ | Med | **Critical** |
| arch | Receipt Image Pipeline (WebP + Thumb + EXIF) | 5 | 3 | L | M | ✓ | Med | **Critical** |
| arch | Migrate ASCII-only `normalizeName` → Unicode-safe | 5 | 1 | S | S | ✓ | Low | **Critical** |

### HIGH ROI — Massive value for moderate effort, India-first wins

These features deliver disproportionate value relative to their implementation cost, particularly for Indian users.

| ID | Feature | User Value | Tech Complexity | Storage | Performance | Offline | Maintenance | Priority |
|---|---|---|---|---|---|---|---|---|
| F-09 | Merchant Analytics + Autocomplete | 5 | 2 | S | S | ✓ | Low | **High ROI** |
| F-28 | Predictive Amount Input | 5 | 1 | S | S | ✓ | Low | **High ROI** |
| F-30 | Smart Merchant Auto-Category (1k bundled) | 5 | 2 | S | S | ✓ | Med | **High ROI** |
| F-08 | Batch Operations on Expenses | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| F-13 | GST Invoice Persistence | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| F-12 | Tags / Custom Labels | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| F-04 | Income Tracking | 5 | 3 | S | S | ✓ | Low | **High ROI** |
| F-26 | Savings Rate / Cash Flow | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| F-05 | Push Notifications + Budget Alerts | 5 | 2 | S | S | ✓+ | Med | **High ROI** |
| F-10 | Subscription Calendar + Smart Alerts | 4 | 2 | S | S | ✓+ | Low | **High ROI** |
| F-11 | Recurring Expense Auto-Detection | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| F-20 | Calendar Spend View | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| ocr | Hindi/Regional Synonym Dictionary | 5 | 1 | S | S | ✓ | Low | **High ROI** |
| ocr | ML Kit v2 Devanagari Upgrade | 5 | 1 | M | S | ✓ | Low | **High ROI** |
| ocr | Per-Element OCR Confidence | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ocr | Duplicate Receipt Detection (FNV-1a) | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ocr | Jaro-Winkler Merchant Dedup | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ocr | Per-Item GST Rate Extraction | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| analytics | Personal Inflation Basket Index | 5 | 2 | S | S | ✓ | Low | **High ROI** |
| analytics | Cheapest Merchant Per Item | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| analytics | Spending Velocity Widget | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| analytics | Reorder Queue | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| analytics | Subscription Leakage Score | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| analytics | Day-of-Week + Day-of-Month Heatmaps | 3 | 1 | S | S | ✓ | Low | **High ROI** |
| analytics | Category × Month Variance Heatmap | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| analytics | 5-Model Cashflow Forecast | 5 | 3 | S | S | ✓ | Low | **High ROI** |
| analytics | Lifestyle Inflation Detection | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| analytics | Net Worth Trajectory (with snapshots) | 4 | 2 | S | S | ✓ | Low | **High ROI** |
| ux | Merchant Autocomplete | 5 | 1 | S | S | ✓ | Low | **High ROI** |
| ux | Date Picker on Scan Review | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ux | Toast instead of Alert on Save | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ux | Swipe-to-delete on lists | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ux | Add screen as modal (not tab) | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ux | Pull-to-refresh on Home & AllExpenses | 4 | 1 | S | S | ✓ | Low | **High ROI** |
| ux | Save as bottom CTA on Add | 4 | 1 | S | S | ✓ | Low | **High ROI** |

### POWER USER — High value for serious financial managers

Features that turn Drift from a logging app into a financial intelligence platform.

| ID | Feature | User Value | Tech Complexity | Storage | Performance | Offline | Maintenance | Priority |
|---|---|---|---|---|---|---|---|---|
| F-14 | EMI Tracking + Amortization | 4 | 3 | S | S | ✓ | Low | **Power-user** |
| F-16 | Fuel & Vehicle Tracking | 3 | 3 | S | S | ✓ | Low | **Power-user** |
| F-18 | Pantry / Household Inventory | 3 | 4 | S | S | ✓ | Med | **Power-user** |
| F-19 | Item Price Alerts | 3 | 2 | S | S | ✓+ | Low | **Power-user** |
| F-21 | Rollover Budgets | 3 | 2 | S | S | ✓ | Low | **Power-user** |
| F-22 | Split Expenses | 3 | 3 | S | S | ✓ | Low | **Power-user** |
| F-24 | Utility Bill Unit-Rate Tracking | 3 | 3 | S | S | ✓ | Low | **Power-user** |
| F-27 | Loan / Mortgage Tracking | 4 | 4 | S | S | ✓ | Low | **Power-user** |
| ocr | Column Detection + Columnar Strategy | 4 | 3 | S | S | ✓ | Med | **Power-user** |
| ocr | Receipt Template Learning | 4 | 3 | S | S | ✓ | Med | **Power-user** |
| ocr | Pharmacy Batch/Expiry Extraction | 3 | 3 | S | S | ✓ | Med | **Power-user** |
| ocr | Fuel Single-Item Extraction | 3 | 2 | S | S | ✓ | Low | **Power-user** |
| ocr | Multi-Image Receipt Stitching | 3 | 4 | S | M | ✓ | Med | **Power-user** |
| analytics | Mood × Spend Correlation | 3 | 1 | S | S | ✓ | Low | **Power-user** |
| analytics | Carbon Footprint (real model, F-32) | 2 | 3 | S | S | ✓ | Med | **Power-user** |
| analytics | Year-over-Year Comparison | 4 | 1 | S | S | ✓ | Low | **Power-user** |
| analytics | Category vs Category Compare | 3 | 1 | S | S | ✓ | Low | **Power-user** |
| analytics | Sankey Spending Flow | 3 | 3 | S | S | ✓ | Low | **Power-user** |
| analytics | Anomaly Detection (Z-score) | 3 | 2 | S | S | ✓ | Low | **Power-user** |
| ux | Keyboard Shortcuts (tablet) | 3 | 2 | S | S | ✓ | Low | **Power-user** |
| ux | Home Screen Widgets | 4 | 4 | S | S | ✓ | Med | **Power-user** |
| ux | Undo Snackbar System | 4 | 1 | S | S | ✓ | Low | **Power-user** |
| ux | Notification / Activity Feed | 3 | 2 | S | S | ✓+ | Low | **Power-user** |
| ux | Day-0 Orientation Screen | 3 | 1 | S | S | ✓ | Low | **Power-user** |
| ux | Quick-Repeat / Template Expenses | 4 | 2 | S | S | ✓ | Low | **Power-user** |
| ux | Biometric / PIN Lock | 4 | 1 | S | S | ✓+ | Low | **Power-user** |
| arch | Encrypted Backup (.driftbackup) | 5 | 3 | M | S | ✓ | Low | **Power-user** |
| arch | Daily Maintenance Job | 4 | 2 | S | S | ✓ | Low | **Power-user** |
| arch | Virtualized FlatList Migration | 4 | 2 | S | L | ✓ | Low | **Power-user** |
| arch | OCR Off the JS Thread (chunked) | 3 | 2 | S | M | ✓ | Low | **Power-user** |
| arch | Query Cache with Tag Invalidation | 3 | 2 | S | M | ✓ | Med | **Power-user** |

### ADVANCED — Specialty features for niche but valuable use cases

Features that are particularly Indian or domain-specific. High user value within a smaller user segment.

| ID | Feature | User Value | Tech Complexity | Storage | Performance | Offline | Maintenance | Priority |
|---|---|---|---|---|---|---|---|---|
| F-06 | UPI / Bank SMS Auto-Import | 5 | 5 | M | S | ✓+ | **High** | **Advanced** |
| F-15 | Credit Card Statement Import (CSV) | 4 | 4 | S | S | ✓ | **High** | **Advanced** |
| F-15p | Credit Card Statement Import (PDF) | 4 | 5 | M | M | ⚠ (PDF parse may need cloud) | **High** | **Advanced** |
| F-23 | FASTag Transaction Import | 2 | 4 | S | S | ✓ | Med | **Advanced** |
| ocr | Tesseract LSTM Fallback (eng+hin) | 4 | 4 | L | M | ✓ | Med | **Advanced** |
| ocr | Native Kotlin Preprocessing (CLAHE, Sauvola, Deskew) | 4 | 5 | S | M | ✓ | Med | **Advanced** |
| analytics | Cross-Category Substitution Detection | 3 | 3 | S | S | ✓ | Low | **Advanced** |
| analytics | Price Elasticity per Item | 3 | 3 | S | S | ✓ | Low | **Advanced** |
| analytics | Seasonal Decomposition | 3 | 4 | S | S | ✓ | Low | **Advanced** |
| arch | SQLCipher Encryption-at-Rest | 4 | 4 | S | L (perf hit) | ✓ | Med | **Advanced** |
| arch | Account Aggregator Integration (RBI AA framework) | 5 | 5 | S | S | ⚠ (requires server) | High | **Advanced** |

### EXPERIMENTAL — Research-grade, ML-dependent, high uncertainty

Features whose impact depends on data volume or unproven techniques.

| ID | Feature | User Value | Tech Complexity | Storage | Performance | Offline | Maintenance | Priority |
|---|---|---|---|---|---|---|---|---|
| F-29 | Anomaly Detection (full ML) | 3 | 4 | S | S | ✓ | Med | **Experimental** |
| F-31 | Item Price Prediction (12+ months data) | 3 | 5 | S | S | ✓ | High | **Experimental** |
| F-32 | Proper Carbon Footprint Model | 2 | 3 | S | S | ✓ | Med | **Experimental** |
| ocr | PaddleOCR Lite Integration | 3 | 5 | L | M | ✓ | High | **Experimental** |
| ocr | FastText Lite Product Classification | 2 | 4 | L | M | ✓ | High | **Experimental** |
| ocr | On-Device LLM Receipt Summarization | 3 | 5 | L | L | ✓ | High | **Experimental** |
| ux | Voice Entry ("Spent 200 on tea") | 3 | 5 | S | M | ✓+ | High | **Experimental** |
| ux | Mood Analytics Dashboard | 2 | 2 | S | S | ✓ | Low | **Experimental** |
| analytics | Multi-Item Comparison in ItemTrend | 3 | 2 | S | S | ✓ | Low | **Experimental** |
| arch | Cloud Sync (CRDT or LWW) | 4 | 5 | L | M | ⚠ (requires server) | High | **Experimental** |

---

## Per-Feature Deep Dive (Critical & High-ROI Only)

### F-17 — Schema Migration System

- **User value**: Implicit. Users never see this directly, but every future feature depends on it.
- **Technical complexity**: 1/5. ~50 lines of code (`schema_version` table + `runMigrations()` runner).
- **Storage impact**: ~50 bytes for `_meta` row.
- **Performance impact**: Negligible. Migrations run once per version bump on app start.
- **Offline feasibility**: ✓ (purely local).
- **Maintenance cost**: Low. Each migration is one ALTER TABLE.
- **Suggested priority**: **CRITICAL — Sprint 0, day 1.**

### F-01 — Full-Text Search (FTS5)

- **User value**: 5/5. Becomes essential at ~100 expenses; absolutely required at 500+.
- **Technical complexity**: 1/5 (with FTS5) / 3/5 (with `LIKE` fallback). FTS5 already bundled in expo-sqlite.
- **Storage impact**: ~15% of `expenses` table size for the FTS index. < 1 MB for 5k rows.
- **Performance impact**: Sub-10 ms queries at 1M rows. Imperceptible.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low — keep FTS in sync via triggers.
- **Suggested priority**: **CRITICAL — Phase 5 Sprint 1.**

### F-03 — Payment Method Tracking

- **User value**: 5/5. Indians split spending across UPI / Cash / Credit Card / Debit Card / Wallet routinely. Filtering and analytics on this dimension is universally requested.
- **Technical complexity**: 1/5. Single column addition + picker UI.
- **Storage impact**: ~20 bytes per expense.
- **Performance impact**: None.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **CRITICAL — Phase 5 Sprint 1.**

### F-09 — Merchant Analytics + Autocomplete

- **User value**: 5/5. Repeat merchants drive 80%+ of daily entries. Autocomplete alone halves entry friction.
- **Technical complexity**: 2/5. New `MerchantDetailScreen`; merchant aliases table; merchant entity rolls up in Phase 3.
- **Storage impact**: ~5 KB for aliases table.
- **Performance impact**: GROUP BY merchant on 5k rows < 20 ms with index.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 5.**

### F-28 — Predictive Amount Input

- **User value**: 5/5. Saves ~5 seconds per repeat-merchant entry.
- **Technical complexity**: 1/5. Single SQL query on merchant input.
- **Storage impact**: None.
- **Performance impact**: < 5 ms query.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 5.**

### F-30 — Smart Merchant Auto-Category

- **User value**: 5/5. New-user friction reduction; first-time scan/entry auto-categorizes correctly.
- **Technical complexity**: 2/5. Bundled JSON (~50 KB, ~1k entries); user overrides persisted to aliases table.
- **Storage impact**: 50 KB bundled.
- **Performance impact**: O(1) hash lookup.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Medium — initial map curation + ongoing additions.
- **Suggested priority**: **HIGH ROI — Phase 5.**

### F-04 — Income Tracking

- **User value**: 5/5. Unlocks savings rate, cash flow, complete personal finance picture.
- **Technical complexity**: 3/5. New table, repo, UI toggle, Home widget.
- **Storage impact**: Comparable to expenses (likely much smaller).
- **Performance impact**: Negligible.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 5.**

### F-05 — Push Notifications + Budget Alerts

- **User value**: 5/5. Passive safety net; turns "active checking" into "passive monitoring".
- **Technical complexity**: 2/5. `expo-notifications` integration; local-only.
- **Storage impact**: < 1 KB for notification_log.
- **Performance impact**: Background check < 50 ms.
- **Offline feasibility**: ✓+ (OS notification API needed).
- **Maintenance cost**: Medium — aggressive battery savers on Xiaomi/OnePlus require workarounds.
- **Suggested priority**: **HIGH ROI — Phase 7 (early).**

### F-07 — Data Export (CSV/JSON/PDF)

- **User value**: 5/5. Trust feature; data portability is mandatory.
- **Technical complexity**: 2/5. `expo-sharing` + `expo-print`.
- **Storage impact**: Transient.
- **Performance impact**: 5k expenses → CSV < 200 ms; PDF 2–5 s.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **CRITICAL — Phase 5 Sprint 2.**

### F-13 — GST Invoice Persistence

- **User value**: 4/5 (in India). Mandatory metadata for freelancers + business users. ITC tracking.
- **Technical complexity**: 2/5. OCR already parses everything; just need columns + persistence.
- **Storage impact**: ~60 bytes per expense.
- **Performance impact**: None.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 5.**

### F-02 — Advanced Multi-Dimension Filters

- **User value**: 5/5. Without filtering, AllExpenses is useless at scale.
- **Technical complexity**: 2/5. FilterSheet + WHERE clause builder + saved filters table.
- **Storage impact**: Negligible.
- **Performance impact**: Date+amount range queries are indexed.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **CRITICAL — Phase 5 Sprint 1.**

### F-25 — Receipt Image Viewer + Permanent Storage

- **User value**: 4/5. Receipt images are useful for warranties, reimbursements. Currently stored but unviewable.
- **Technical complexity**: 2/5 viewer; 3/5 permanent storage pipeline.
- **Storage impact**: Large — managed by image pipeline (Phase 8).
- **Performance impact**: Medium without `expo-image`.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Medium — cleanup/orphan management.
- **Suggested priority**: **CRITICAL — Phase 5 + Phase 8.**

### Hindi/Regional Synonym Dictionary

- **User value**: 5/5 for the segment with Hindi-script kirana receipts. Currently 0% of these scan correctly.
- **Technical complexity**: 1/5. Bundle a JSON (~80 KB) + lookup function.
- **Storage impact**: 80 KB.
- **Performance impact**: O(1) lookup.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low (initial curation).
- **Suggested priority**: **HIGH ROI — Phase 4A.**

### Personal Inflation Basket Index

- **User value**: 5/5. The single differentiator no Indian app has. Real, personal, actionable.
- **Technical complexity**: 2/5. SQL + JS calculation; no ML.
- **Storage impact**: Negligible (cached aggregate).
- **Performance impact**: Cached for 7 days; recomputed on item write.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 6 (anchor feature).**

### 5-Model Cashflow Forecast

- **User value**: 5/5. "How much will I spend this month?" is the most-asked question; current linear extrapolation is wildly inaccurate.
- **Technical complexity**: 3/5. 5 SQL models + ensemble + confidence cone visualization.
- **Storage impact**: Negligible.
- **Performance impact**: < 100 ms total.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 6.**

### Reorder Queue

- **User value**: 4/5. "Buy milk Tuesday" is more actionable than any analytics chart.
- **Technical complexity**: 1/5. Single SQL + JS predictor.
- **Storage impact**: Negligible (cached).
- **Performance impact**: < 50 ms.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 6.**

### F-06 — UPI / Bank SMS Auto-Import

- **User value**: 5/5. Eliminates manual entry for the most common transaction type in India.
- **Technical complexity**: 5/5. Requires native module, READ_SMS permission, 30+ bank templates, Google Play Sensitive Permission declaration.
- **Storage impact**: < 50 KB template cache.
- **Performance impact**: < 50 ms per SMS.
- **Offline feasibility**: ✓+ (requires Android API).
- **Maintenance cost**: HIGH — banks change SMS formats regularly.
- **Suggested priority**: **ADVANCED — Phase 7 (last, scope-flex).**

### F-15 — Credit Card Statement Import (CSV/PDF)

- **User value**: 4/5 for users with active credit cards. Reconciliation is mandatory for serious budgeters.
- **Technical complexity**: 4/5 (CSV) / 5/5 (PDF — likely needs OCR or cloud).
- **Storage impact**: Transient.
- **Performance impact**: PDF parse 2–5 s per page.
- **Offline feasibility**: ✓ (CSV) / ⚠ (PDF often needs cloud OCR).
- **Maintenance cost**: HIGH — each bank's format varies and changes.
- **Suggested priority**: **ADVANCED — Phase 7 (CSV only initially).**

### F-12 — Tags / Custom Labels

- **User value**: 4/5 for power users. Orthogonal classification beyond category.
- **Technical complexity**: 2/5. Tags + junction table + UI.
- **Storage impact**: ~50 bytes per association.
- **Performance impact**: JOIN on small junction table.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 7 (early).**

### F-08 — Batch Operations on Expenses

- **User value**: 4/5. Essential for fixing imported batches or mis-categorizations.
- **Technical complexity**: 2/5. Multi-select state + action bar.
- **Storage impact**: None.
- **Performance impact**: None.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **HIGH ROI — Phase 5.**

### F-14 — EMI Tracking

- **User value**: 4/5 for the ~60% of urban Indians with at least one active EMI.
- **Technical complexity**: 3/5. New table, amortization function, calendar view.
- **Storage impact**: < 1 MB per user (10 loans × 120 months).
- **Performance impact**: Amortization runs in JS; sub-millisecond.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low.
- **Suggested priority**: **POWER-USER — Phase 7.**

### F-18 — Pantry / Household Inventory

- **User value**: 3/5. Powerful when combined with reorder queue + consumption rate.
- **Technical complexity**: 4/5. New table, depletion UX, shopping list generator.
- **Storage impact**: < 50 KB.
- **Performance impact**: Negligible.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Medium — user adoption of depletion gestures is uncertain.
- **Suggested priority**: **POWER-USER — Phase 7.**

### F-22 — Split Expenses

- **User value**: 3/5 (high in specific use cases — flatmates, group trips).
- **Technical complexity**: 3/5.
- **Storage impact**: Negligible.
- **Performance impact**: Negligible.
- **Offline feasibility**: ✓.
- **Maintenance cost**: Low (no settlement integration in v1).
- **Suggested priority**: **POWER-USER — Phase 7.**

---

## Value × Effort Quadrant Visualization

```
                  HIGH VALUE
                       │
   Tier 1 — Do First   │   Tier 2 — Plan & Resource
   (high value, low    │   (high value, high effort)
    effort)            │
                       │
   F-17 F-01 F-03      │   F-06 (SMS Import)
   F-02 F-07 F-25      │   F-15 (Statement Import)
   F-09 F-28 F-30      │   F-14 (EMI)
   F-08 F-13 F-12      │   F-04 (Income)
   F-26 F-05 F-11      │   F-18 (Pantry)
   F-20  (calendar)    │   F-22 (Splits)
   ocr-A fixes         │   ocr-C native preprocessing
   analytics tier 1    │   ML Kit v2 upgrade
   ───────────────────┼───────────────────
   Tier 3 — Background │   Tier 4 — Defer
   (low value, low     │   (low value, high effort)
    effort)            │
                       │
   ux polish details   │   F-23 (FASTag)
   mood analytics      │   F-27 (Loan/Mortgage)
   keyboard shortcuts  │   F-29 (Anomaly)
   undo snackbar       │   F-31 (Price Prediction)
   day-0 orientation   │   F-32 (Carbon model)
   biometric/PIN       │   cloud sync
                       │   voice entry
                       │   AA framework
                       │
                  LOW VALUE
        LOW EFFORT          HIGH EFFORT
```

---

## Priority Tier Distribution

| Tier | Count | % of total | Effort allocation |
|---|---|---|---|
| Critical | 13 | 12% | Phase 1 + Phase 5 Sprint 1 |
| High ROI | 35 | 33% | Phases 4A, 5, 6 |
| Power-user | 31 | 30% | Phase 7 + selected Phase 8 |
| Advanced | 11 | 10% | Phase 7 (later) + opportunistic Phase 8 |
| Experimental | 10 | 10% | Phase 8 onwards, opportunistic |
| Already shipping | ~5 | 5% | Audit captured (e.g., onboarding existing) |
| **Total** | **~105** | | |

---

## India-Specific Priority Overlay

The following features have **elevated priority** for the Indian market specifically. The user base, transaction patterns, and regulatory environment make these higher-impact in India than they would be in a US/EU market.

| Feature | India-specific reason |
|---|---|
| F-06 (UPI SMS) | UPI = >70% of consumer transactions; manual entry is the #1 app killer |
| F-13 (GST persistence) | Mandatory for every business purchase; freelancers need ITC |
| F-16 (Fuel/Vehicle) | 2-wheelers dominate household transport; ₹3–8k/month |
| F-23 (FASTag) | Mandatory for highway travel |
| F-14 (EMI) | ~60% urban households have one active EMI |
| F-30 (Auto-category) | Indian merchant names are diverse; manual categorization is friction |
| ocr Hindi synonyms | Kirana receipts often in Hindi |
| ocr ML Kit v2 Devanagari | Required for ~30% of household receipts |
| F-22 (Splits) | Joint-family + flatmate finances are common |
| utility tracking | Electricity/water billing varies widely by state |
| Account Aggregator | RBI's AA framework is the long-term solution to bank sync |

---

## Monetization Alignment (If Freemium Considered)

| Tier | Features |
|---|---|
| **Free** | All Critical features; F-07, F-08, F-12, F-25, F-26, F-28; basic analytics (Trends, Items, ItemTrend); manual subscription tracking |
| **Pro** (~₹199/year) | F-04, F-05, F-09, F-10, F-13, F-19, F-21, F-30; Analytics Hub (inflation index, forecast, lifestyle, velocity); merchant intelligence; reorder queue; calendar view; tags |
| **Premium** (~₹499/year) | F-06, F-14, F-15, F-16, F-18, F-22, F-24; receipt template learning; Tesseract fallback; encrypted backup; SQLCipher |
| **Enterprise** (~₹999/year) | GST quarterly export packs; multi-account; future cloud sync |

The free tier is intentionally generous because Drift's competitive moat is item-level OCR intelligence, not feature paywalls. The tiering above is a possible business model, not a recommended one.

---

## Dependency Graph Summary

```
F-17 (migrations) → unblocks every schema-touching feature
F-03 (payment method) → F-06, F-09, F-15
F-09 (merchant) → F-15 (reconciliation), F-30 (auto-category)
F-05 (notifications) → F-10, F-19, F-21, F-18 (low-stock)
F-04 (income) → F-26 (cash flow)
F-14 (EMI) → F-27 (loan/mortgage)
F-16 (vehicle) → F-23 (FASTag)
F-18 (pantry) → F-31 (price prediction)
ocr Hindi normalization → all Hindi-name analytics (price tracking, dedup)
ocr per-element conf → confidence component, dynamic tolerance
rollups + month_key index → cheap analytics queries → every Phase 6 feature
```
