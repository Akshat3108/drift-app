# Drift — Post-187 Task Supplement (Proposal)

> **Purpose:** Curated supplement of genuinely-novel tasks NOT already captured in the canonical 187-task tracker.
> **Status:** PROPOSAL — awaiting user approval before merge into `task_tracker.md`.
> **Created:** 2026-05-23
> **Companion to:** `task_tracker.md`, `master_roadmap.md`, `long_term_strategy.md`
> **Author note:** Produced via a curated gap-fill audit (the user picked this approach over a full ultradeep dump that would have duplicated ~75% of the existing tracker).

---

## How this list was assembled

1. Read the full 187-task tracker phase totals and currently-active line.
2. Read `master_roadmap.md`, `final_assessment.md`, `long_term_strategy.md`.
3. Read every `missing_*` doc under `docs/`: `06-features/missing_features.md` (F-01..F-32), `05-analytics/missing_analytics.md` (#1..#20), `05-analytics/dashboard_ideas.md` (Dashboards 1..10), `05-analytics/future_analytics.md`, `07-ux/missing_screens.md` (P0..P3, #1..#20).
4. Surveyed the live code: 32 applied DB migrations (v1→v32), 9 analytics modules, 18 feature folders, Android manifest, dependency manifest.
5. Cross-referenced each previously-identified gap against the 149 completed and 38 queued tasks. Items already tracked were **dropped from this supplement** (most "missing analytics" / "missing features" entries are already done or queued).
6. Industry comparison: Mint, YNAB, Monarch Money, Rocket Money, Walnut, CRED, Splitwise, Copilot Money — kept only ideas compatible with Rule 5 (offline-first, no cloud LLM, no bank API).

Genuine gaps that survived this filter: **21 candidate tasks** (vs. ~75 the generic prompt would have produced).

---

## What was deliberately excluded

| Rejected idea | Reason |
|---|---|
| Cloud bank-API account linking (Plaid / RBI AA) | Strategic decision log §8 — local-first non-negotiable |
| Cloud LLM categorization / receipt summarization | `long_term_strategy.md` §4.6 explicitly out-of-scope |
| Stock / crypto live price feeds | Requires online API; offline NAV snapshotting is in-scope (see PS-09) |
| Family / group budgets | Single-user product per §8 decision log |
| iOS port | Android-first decision; deferred per §8 |
| Multi-currency reporting beyond per-expense `currency`+`amount_home` | Per §8 decision log; reconsider if international users > 10% |
| Generic onboarding sample data | Strategic principle: cost of correctness > cost of features (don't inject fake data) |
| 5-model forecast ensemble | Already tracked as 5.A.01 |
| Anomaly Z-score detection | Already tracked as 8.13 |
| Cross-category substitution Pearson | Already tracked as 5.A.07 |
| Price elasticity per item | Already tracked as 5.A.08 |
| Encrypted backup, biometric lock, query cache | Already tracked as 8.8 / 8.11 / 8.9 |
| SQLCipher / cloud-sync spikes | Already tracked as 8.15 / 8.16 |
| Sub leakage score, reorder queue, lifestyle drift, inflation index, merchant intel, calendar heatmap | All shipped in Phase 3 (`[x]`) |

---

## How to read each task

Format mirrors `task_tracker.md`: `- [ ] **PS-XX** Title — effort · primary affected paths`. Each task body adds **Why**, **Acceptance**, and **Depends-on** where relevant. Stable IDs use the `PS-` prefix (Post-187 Supplement) to avoid collision with `QW-XX` / `1.x` / `2.x` / `2.D.xx` / `5.A.xx` / `5.F.xx` / `8.x` namespaces already in use.

Effort tags: XS = ≤ 1 hr · S = 1–4 hr · M = ½–1 day · L = 1–2 days · XL = 2–5 days.

---

## Section A — Visualization gaps

The current chart surface uses View-based cells (heatmaps, bars) plus `react-native-svg` in exactly 3 screens (`Forecast.js`, `InflationIndex.js`, `Variance.js`). The dashboard ideas doc proposed a few visualizations that never reached the tracker.

- [x] **PS-01** Sankey "money flow" diagram (Income → Category) — M · `app/src/features/analytics/screens/MoneyFlow.js`, `app/src/analytics/flow.js`
  - **Why:** `dashboard_ideas.md` Dashboard 9 specified this but no tracker task was created. Sankey is the single most powerful visualization for "where does my money go" — categorical proportions across an axis aren't conveyed as cleanly by bars or pies.
  - **Acceptance:** New `MoneyFlow.js` screen (linked from Analytics Hub card). Bundles income for the selected month into a left node, draws a Sankey to category nodes on the right with stroke width proportional to spend. Tap a flow → navigate to `PotDetail`. SVG-rendered via `react-native-svg` (already a dep). Works at zero-income (uses budget as left node fallback).
  - **Depends-on:** Income (5.5, done). React-native-svg (installed).

- [x] **PS-02** Mood × Spend analytics screen — S · `app/src/features/analytics/screens/MoodSpend.js`, `app/src/analytics/mood.js`
  - **Why:** Mood is captured per expense (Phase 1 UX) but never aggregated. `missing_screens.md` #17 and `missing_analytics.md` #14 proposed it; neither made the tracker. The query is simple — surface "you spend N× more when stressed" / "regret rate per category".
  - **Acceptance:** New `app/src/analytics/mood.js` exports `moodAggregates(filter)` returning `{mood, count, total_spend, avg_spend, category_breakdown}`. Screen renders an emoji bubble chart (X = mood, Y = avg spend, size = count) + a "biggest mood deltas" callout. Falls back to "Log a few expenses with mood to see patterns" empty state when n < 30.
  - **Depends-on:** None.

- [x] **PS-03** Carbon footprint dashboard screen — M · `app/src/features/analytics/screens/CarbonDashboard.js`
  - **Why:** Task `5.A.06` builds the carbon **model** (per-category + per-item factors replacing the 0.4 kg placeholder). It does not specify a consumer screen. Without a dashboard, the model has no surface area; with it, this becomes the first analytic that's actionable as a behavior nudge.
  - **Acceptance:** Screen accessible from Analytics Hub once `5.A.06` ships. Shows monthly CO₂ total, cumulative line for the year, top 3 emitting categories, top 5 emitting items. Optional monthly CO₂ budget (added to `categories` table or `settings`). Hidden behind a settings toggle so users who don't want it never see it.
  - **Depends-on:** `5.A.06` (carbon model). Block this until `5.A.06` ships — open a `- [!]` blocked entry today, flip to `- [ ]` when unblocked.

- [x] **PS-04** Net worth donut + assets-vs-liabilities breakdown view — S · `app/src/features/accounts/screens/NetWorth.js` (existing screen extension)
  - **Why:** Task `7.13` ships the snapshot table and trajectory chart. It does NOT include the assets vs liabilities donut, account-list balance bars, or "projected net worth at current savings rate" line — all standard in Mint/Monarch's net-worth screen and called out in `missing_screens.md` #14.
  - **Acceptance:** Extend `NetWorth.js`: add a donut chart (assets in green arc, liabilities in red arc, net = center label) and per-account balance bars sorted by absolute value. "Projected in 12 months" line using current savings rate (computed from `5.6`) × 12 + current net worth. Donut renders via `react-native-svg`.
  - **Depends-on:** `7.13` (net worth snapshot — for trajectory) and `5.6` (savings rate, done).

---

## Section B — UX gaps

- [x] **PS-05** Global month / date-range selector on Home + Trends — M · `app/src/components/primitives/MonthPicker.js`, `app/src/features/home/screens/Home.js`, `app/src/features/trends/screens/Trends.js`
  - **Why:** `missing_screens.md` ranks this **P0** but no tracker task was created. Today, all views are pinned to `currentMonth`. Reviewing January in May requires entering AllExpenses with a filter — heavy ceremony for a common need. The infra is in place (`month_key` virtual columns, `idx_exp_month_cat`, `monthly_summary` rollup) — only the navigation UX is missing.
  - **Acceptance:** Header chip on Home: tap → bottom sheet with prev/next arrows, "This month / Last month / Last 3 months / Custom" presets, custom date range pickers. Selected month flows through `useExpenses().setActiveMonth()` so Home cards, Trends, AllExpenses listen. Subtle "Viewing: April 2026" banner when not current month. Reset to current via swipe-down.
  - **Depends-on:** None.

- [x] **PS-06** Dedicated Budget Setup overview screen — M · `app/src/features/categories/screens/BudgetSetup.js`
  - **Why:** `missing_screens.md` P1 #7. Currently budgets are edited one category at a time via `EditPot.js`; there's no overview of "total budgeted vs. income," no quick +/- adjuster, no "copy from last month." For users without an income figure entered, the total-budget line is the closest thing they have to a target.
  - **Acceptance:** New screen reachable from Home (tap "Budget Remaining" hero) and Profile. Lists every category with its budget and a quick +/-₹500 stepper. Header shows `Σ budget` vs `last 3-month avg income` and a delta. "Copy from last month" button uses each category's last-month-spent rounded to the next ₹500.
  - **Depends-on:** Income (5.5, done) for the comparison line.

- [x] **PS-07** Trip expense detail screen — M · `app/src/features/travel/screens/TripDetail.js`
  - **Why:** `missing_screens.md` #15. `expenses.trip_id` exists (migration v6, task 3.5) but no screen ties expenses to a trip. Currently `Travel.js` shows trip plans only; trip-level reconciliation is invisible.
  - **Acceptance:** Tapping a trip in `Travel.js` opens `TripDetail`: trip budget (if set) vs actual, per-day breakdown bar, expense list filtered by `trip_id`. "Tag selected expenses to this trip" multi-select bottom-action via existing batch-select (`5.8`). Currency converter strip if trip currency ≠ home currency (FX rate already stored per expense).
  - **Depends-on:** Trip ID on expenses (3.5, done), batch select (5.8, done).

- [x] **PS-08** Notification Center / in-app activity feed — M · `app/src/features/notifications/screens/Activity.js`
  - **Why:** Task `7.1` writes `notification_log` and schedules push notifications, but there's no in-app feed. Users who miss a notification at the OS level have no way to recover it. `missing_screens.md` #12 specified this.
  - **Acceptance:** Bell icon in Home header opens `Activity.js`: chronological list of every entry from `notification_log`, grouped by day, with type-specific emoji + tap-to-navigate target. Unread count badge on the bell. "Mark all read" via long-press. Pull-to-refresh to re-evaluate budget thresholds in case a budget changed.
  - **Depends-on:** `7.1` (done).

- [x] **PS-09** User-defined Quick-Entry Templates — M · `app/src/features/expenses/screens/QuickTemplates.js`, migration v33 (new table `expense_templates`)
  - **Why:** `missing_screens.md` #19. Users log the same recurring expense ("Rent ₹28k, 1st of month, Housing") manually every month even though `recurring` is captured. A 1-tap template-driven add reduces friction below the merchant-autocomplete path.
  - **Acceptance:** New table `expense_templates` (id, label, amount, category_id, payment_method, default_day_of_month, icon). New screen `QuickTemplates.js` to CRUD templates. Templates surface on Add screen as a horizontal chip row above the amount field. Tapping a chip prefills all fields; user only confirms. Optional toggle: "Auto-create on day X" runs a foreground check at app open.
  - **Depends-on:** Payment method (5.4, done), Categories (done). Migration v33 should be batched with other v33 candidates if any arise (per `task_tracker.md` Decision log convention).

---

## Section C — Power-user / fintech feature gaps

- [x] **PS-10** Investment holdings + manual NAV snapshot tracker — XL · migration v33, `app/src/features/investments/{repo,context,screens}/*`
  - **Why:** `accounts` covers cash/liabilities; net worth (7.13) snapshots account balances. Neither models a portfolio: SIP/MF units, equity holdings, gold weight + price, FD principal + maturity date. Per `long_term_strategy.md` cloud-LLM/bank APIs are out, but **manual entry of holdings + periodic user-entered NAVs** is offline-compatible and unlocks a true net-worth view for any user with > 30% of wealth outside savings.
  - **Acceptance:** New table `holdings` (id, kind enum: `mf|equity|gold|fd|rd|nps|ppf|other`, label, units REAL, unit_cost REAL, current_nav REAL, last_updated, account_id NULL, deleted_at). Screen: `Holdings.js` list + `EditHolding.js`. Net worth screen (PS-04) consumes holdings → SUM(units × current_nav). Notification reminder once per month to update NAVs (single notif, not per-holding). No automated price fetching.
  - **Depends-on:** PS-04 useful but not blocking. Schema migration.

- [x] **PS-11** Insurance premium tracker — L · migration v33, `app/src/features/insurance/{repo,context,screens}/*`
  - **Why:** LIC / term / health / vehicle insurance are recurring large lumps. Today they'd be logged either as subscriptions (loses premium-vs-sum-assured semantics) or as one-off expenses (loses renewal-date awareness). Modeling them properly enables maturity reminders + 80C calculation alongside PS-12.
  - **Acceptance:** New table `insurance_policies` (id, kind enum: `life|term|health|vehicle|other`, label, provider, premium_amount, premium_frequency enum: `monthly|quarterly|half_yearly|yearly`, next_due, sum_assured, maturity_date NULL, account_id, deleted_at). Screen: `Insurance.js` list + edit. Renewal notification reuses `7.1` scheduler. Premium payments link to expenses via `expense.insurance_policy_id` (column added in same migration).
  - **Depends-on:** Notifications (7.1, done).

- [x] **PS-12** Loan tax-benefit (80C / 24B) + prepayment simulator — L · `app/src/features/emi/screens/{EMI,TaxBenefit}.js`
  - **Why:** Task `7.5` ships EMI tracking + amortization. `missing_features.md` F-27 explicitly proposed extending it with tax-benefit calculations + prepayment simulator; this never made the tracker. For a home loan of ₹40L this is the most consequential single calculation Drift could surface.
  - **Acceptance:** Extend `emi_loans` schema with `kind` enum (`home|car|personal|education`) and `tax_eligible BOOLEAN`. New screen `TaxBenefit.js` aggregates: annual principal paid (80C cap ₹1.5L), annual interest paid (24B cap ₹2L for self-occupied), savings at 30% slab. Prepayment simulator: extra principal ₹X today shows revised tenure / interest saved with a forked amortization line chart.
  - **Depends-on:** EMI (7.5, done).

- [x] **PS-13** FASTag transaction tracking — L · migration v33, `app/src/features/fastag/{repo,context,screens}/*`
  - **Why:** `missing_features.md` F-23, never tracked. NHAI portal offers CSV download; the parser is small. Frequent drivers accumulate ₹4–10k/month in tolls that today land as opaque wallet recharges.
  - **Acceptance:** New table `fastag_accounts` (id, vehicle_id, tag_id, bank, current_balance, last_synced). New screen `FASTag.js` list + import-from-CSV flow (reuses `7.15` CSV import infrastructure when it ships). Toll txns become `expenses` with `vehicle_id` set. Per-route grouping deferred.
  - **Depends-on:** Vehicles (7.6, done), CSV import (7.15, queued).

- [x] **PS-14** ITR / tax-year export bundle — S · `app/src/features/expenses/screens/Export.js` (existing extension)
  - **Why:** Task `5.7` ships generic CSV/JSON/PDF export. For Indian users this isn't enough at tax time — they need an April–March slice with category roll-ups mapped to ITR sections (80C, 80D, 80G, business expenses, GST input credit). `missing_features.md` F-07 mentions this; never explicitly tracked.
  - **Acceptance:** Add a "Tax year (FY YYYY-YY)" preset to Export. Output PDF includes: category subtotals, GST input credit totals (already persisted per `5.11`), 80C-eligible items (insurance premiums from PS-11, principal from PS-12), 80D-eligible (health insurance from PS-11), itemized line for amounts > ₹50k. Compatible with what an accountant would actually request.
  - **Depends-on:** Export (5.7, done). PS-11, PS-12 enrich it but not strict prerequisites.

---

## Section D — Android-native integration

- [x] **PS-15** Android launcher app shortcuts — S · `app/android/app/src/main/AndroidManifest.xml`, `app/android/app/src/main/res/xml/shortcuts.xml`, `app/src/navigation/index.js`
  - **Why:** Long-press the Drift launcher icon → "Add Expense / Scan Receipt / Search" — zero-touch entry for the three most common actions. Standard Android pattern since API 25 (2017). Not tracked.
  - **Acceptance:** `shortcuts.xml` declares 3 static shortcuts that deep-link into `drift://add`, `drift://scan`, `drift://search`. Add an `intent-filter` for the deep-link scheme in `MainActivity`. Navigation listens for the initial URL and routes accordingly. Manual QA: long-press launcher icon, see 3 shortcuts, each opens the right screen with cold start.
  - **Depends-on:** None.

- [x] **PS-16** Share-target intent (Gallery → Drift creates draft scan) — M · `app/android/app/src/main/AndroidManifest.xml`, `app/src/features/scan/ScanService.js`
  - **Why:** Users often receive bills as images on WhatsApp / email. Today they must save the image, open Drift, hit Scan, choose from gallery. A `SEND` intent-filter lets them long-press the image in WhatsApp → Share → Drift → review screen — one step.
  - **Acceptance:** Manifest adds `<intent-filter android:name="android.intent.action.SEND">` with `mimeType="image/*"` on MainActivity. JS reads `Intent.getInitialURL()` equivalent for shared content (Expo: `expo-linking` + `expo-intent-launcher` or RN's `Linking.getInitialURL` extended). Pipes the URI into `ScanService.scanAndProcess`. Falls back gracefully if the URI is no longer readable.
  - **Depends-on:** ScanService (2.13, done).

- [x] **PS-17** Android home-screen widget — XL · new native module `app/android/app/src/main/java/.../DriftWidgetProvider.kt`
  - **Why:** Cred-style "this month's budget burndown" 4×1 widget. The data is a single rollup query against `monthly_summary` (already maintained by triggers). Native-Kotlin widget reads SQLite directly via the same DB file. Highest-friction-reducing Android-native investment.
  - **Acceptance:** `DriftWidgetProvider.kt` updates every 30 min. Reads `monthly_summary` for the current month, computes `(spent / Σ budgets) × 100`, renders a horizontal bar + delta from yesterday. Tapping the widget cold-opens Drift. Optional 2×2 variant shows top 3 categories with mini-bars.
  - **Depends-on:** `monthly_summary` rollup (3.11, done). Acceptance includes verification that the widget does not hold a write-lock that blocks the app's DB writes.

---

## Section E — Maintainability / quality scaffolding

The final_assessment scores Maintainability at 4/10 (target 8/10). Migrations are done (lifting it partway), but TypeScript adoption, test runner, and dependency-layer lint enforcement are explicitly mentioned in the target state and not in the tracker.

- [x] **PS-18** Adopt TypeScript across `features/` incrementally — XL · `app/tsconfig.json`, `app/babel.config.js`, per-feature `.ts` files
  - **Why:** Strategic decision log (`long_term_strategy.md` §8) explicitly says "REVISIT — Currently a productivity choice. Reconsider if Phase 2 architecture refactor exposes too many implicit-contract bugs." Phase 2 is done. The tracker has no follow-up task to revisit the decision.
  - **Acceptance:** Add `tsconfig.json` with strict mode + `allowJs: true`. Convert one feature folder (suggest: `core/`) end-to-end as a pilot. **Stop and reassess** after the pilot — this task ships only the pilot. A separate post-187 task should fan out remaining features.
  - **Depends-on:** None — but pause before fanning out.

- [x] **PS-19** Jest test runner + golden tests for analytics/OCR/repos — XL · `app/jest.config.js`, `app/__tests__/**`
  - **Why:** Zero tests today (`final_assessment` debt rank #12). `long_term_strategy.md` §7.2 specifies the target test layers (OCR golden, repos, services, analytics, migrations, triggers). No tracker task captures this.
  - **Acceptance:** `jest.config.js` configured for Expo / RN; `@testing-library/react-native` installed; in-memory `expo-sqlite` mock or `node:sqlite` backend for repo tests. Ship 3 seed tests: (a) `monthly_summary` triggers stay consistent on insert+update+soft-delete, (b) `inflationBasket()` returns a known value on a fixed fixture, (c) `parseReceipt` on one golden OCR fixture extracts expected items. CI gate deferred to a follow-up.
  - **Depends-on:** None.

- [x] **PS-20** ESLint dependency-layer rules (enforce ocr/, core/, features/ boundaries) — M · `app/.eslintrc.cjs`, `app/.eslint-plugin-drift/`
  - **Why:** `long_term_strategy.md` §1.2 specifies "Enforced by ESLint rules (`eslint-plugin-import` + a custom rule), failing CI on any violation." No tracker task captures it. Without enforcement, cross-layer drift (the same kind that produced the Phase 1 god-context refactor) will recur.
  - **Acceptance:** Project-level `.eslintrc.cjs` with `eslint-plugin-import` configured + a small custom rule (or `eslint-plugin-boundaries`) that fails on: `ocr/* → features/*`, `core/* → features/*`, `features/X/* → features/Y/*`. Add `npm run lint` script. No CI yet; ship as a developer guardrail.
  - **Depends-on:** None.

---

## Section F — Privacy / trust

- [x] **PS-21** Privacy mask mode + FLAG_SECURE + amount peek-resistance — M · `app/android/.../MainActivity.kt`, `app/src/features/profile/screens/Profile.js`, `app/src/core/state/PrivacyContext.js`
  - **Why:** Task `8.11` covers biometric/PIN lock (entry-time). It does not cover: (a) blank-on-recents-screen (FLAG_SECURE makes the screenshot in the app-switcher solid black so amounts aren't visible when handing the phone over), (b) "hide amounts" toggle that masks ₹ amounts to `₹•••` on home screens without locking the app, (c) auto-blur on `AppState=inactive`. These are standard in banking apps and trivially compatible with offline-first.
  - **Acceptance:** Native: `MainActivity.onCreate` sets `WindowManager.LayoutParams.FLAG_SECURE` when the user has enabled "Block screenshots" in settings. JS: `PrivacyContext` toggles a `amountsHidden` flag; every component that renders `formatCurrency()` checks this flag and renders `₹•••` instead. `AppState=inactive` listener hides amounts immediately. Settings UI in Profile: 3 toggles ("Hide amounts when minimized", "Block screenshots", "Mask amounts always").
  - **Depends-on:** None. Stacks well with `8.11` (biometric lock).

---

## Proposed merge plan (if approved)

Two reasonable paths:

**Path A — Defer until tracker hits 100%.** Keep the existing 38-task queue (Phase 4 + Phase 5) as-is. Move this supplement into the tracker AFTER 5.F.01 closes. Pure Rule 13 application.

**Path B — Interleave selectively.** Pick ≤ 5 supplement items that materially unlock current work or close critical UX gaps, splice them into the existing roadmap, defer the rest. Recommended picks if you go this way:
- PS-05 (month picker) — used by every other screen, low-cost, plugs the #1 P0 UX gap.
- PS-15 (app shortcuts) — XS effort, immediate user-facing win, no schema risk.
- PS-08 (notification center) — closes the loop on 7.1, low effort, completes a story already 90% built.
- PS-20 (ESLint layer rules) — prevents future drift; cheap insurance for the refactor work already done.
- PS-19 (Jest test runner pilot) — closes the biggest maintainability gap (4/10 → 6/10 just from this).

**Path C — Full append.** Merge all 21 into `task_tracker.md` as Phase 6 (rename Phase 5 → Phase 5a, group these as Phase 5b, or open a Phase 6 section). Update the totals table to 208 leaf tasks (187 + 21). Requires re-stamping the phase boundaries in the `task_tracker.md` Phase totals table.

---

## What the user should decide

1. Approve / reject this supplement as a whole, or per-item.
2. Pick a merge path (A, B, or C).
3. If B: confirm which 5 to splice in.

Once decided, I'll merge the approved items into `docs/10-final/task_tracker.md` following the file's conventions (checkbox lines under a new heading; phase totals table updated; Completion log untouched until tasks ship; Decision log appended with one line citing this supplement). Until that approval, `task_tracker.md` stays exactly as it is.
