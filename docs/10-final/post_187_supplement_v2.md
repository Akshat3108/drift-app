# Drift — Post-187 Task Supplement v2 (Proposal)

> **Purpose:** Curated second-round supplement of genuinely-novel tasks NOT already captured in the canonical 187-task tracker OR the first Post-187 supplement (PS-01..PS-21).
> **Status:** PROPOSAL — awaiting user approval before merge into `task_tracker.md`.
> **Created:** 2026-05-27
> **Companion to:** `task_tracker.md`, `post_187_supplement.md`, `master_roadmap.md`, `long_term_strategy.md`
> **Author note:** Produced from a full multi-axis codebase audit (architecture · analytics · DB · features · UX · OCR · scaling), industry-benchmarked against Mint / YNAB / Monarch / Rocket Money / Walnut / CRED / Splitwise / Copilot, then strictly filtered through the offline-first / on-device-only charter (Rule 5 of `PROMPT.md`, §8 of `long_term_strategy.md`).

---

## Strategic frame for v2

The first supplement (PS-01..PS-21, all shipped by 2026-05-27) closed every gap that was previously identified by the inline `missing_*` docs but had escaped the 187-task tracker. The starting point for v2 was therefore much narrower: **what does a world-class fintech app surface that Drift today still cannot, even after PS-01..PS-21?**

The audit pass that produced this list:

1. Walked the live schema — 49 migrations · 47 tables · 6 FTS5/rollup tables · 6 triggers · 12 maintenance tasks.
2. Walked the analytics surface — 15 modules (`spend`, `items`, `lifestyle`, `subscriptions`, `forecast`, `seasonal`, `variance`, `patterns`, `anomaly`, `carbon`, `substitution`, `flow`, `mood`, plus `cache` + the public re-export hub).
3. Walked the navigation surface — 4-tab + 50+ stack screens · 24 feature folders.
4. Cross-referenced every candidate gap against the 211 closed tasks (187 + 21 supplement) AND the 4 still-open tasks (1.14, 4.19, 4.20, 7.14) to suppress duplicates.
5. Industry comparison kept only ideas that pass the offline-first / on-device / single-user / Android-first filter — cloud LLMs, bank-API sync, Plaid-style aggregation, multi-device family mode, and live market feeds are explicitly excluded (matches the v1 supplement's exclusion table; restated below).

Genuine gaps that survived this filter: **29 candidate tasks**, PS-22 through PS-50.

---

## What was deliberately excluded (additive to v1 exclusion table)

| Rejected idea | Reason |
|---|---|
| Live MF / equity / gold price feeds | Online API call; out of charter per §8 + v1-supplement exclusion. PS-31's NAV-history table accepts MANUALLY-entered NAV snapshots — same model as PS-10. |
| Cloud LLM categorisation (GPT/Claude on receipt text) | Charter violation. Local rule engine (PS-35) covers the same surface. |
| RBI Account Aggregator / Plaid-style bank sync | §8 decision log: deferred indefinitely. CSV statement import (7.15) is the offline-compatible substitute. |
| Multi-currency reporting beyond per-expense `currency` + `amount_home` | Already declined in v1 supplement. Trip-level FX history (PS-31 sibling) reconsidered but deferred — `expenses.fx_rate` captured at save time is sufficient for single-user travel. |
| Family / shared budgets / friend feeds | Single-user product per §8. |
| Voice expense entry | Out of scope until on-device voice models reach <100 ms latency on mid-tier Android. |
| Geographic merchant clustering / map view | No location capture — privacy decision. |
| Barcode lookup against bundled OFF subset | Considered; rejected for v2 because the bundled product corpus (50–80 MB) would exceed the offline storage budget. Reconsider in Phase 7 if OCR proves insufficient. |
| Auto-savings transfer / direct debit | Requires bank integration; offline-incompatible. |
| Auto-reminder via SMS reply (Truecaller-style) | Out of charter — needs network. |
| AI insights "your spending personality" via cloud LLM | Cloud LLM rejected; local heuristics (PS-22 health score + PS-23 streaks) cover the behavioural-nudge surface. |

---

## How to read each task

Format mirrors PS-01..PS-21 in `post_187_supplement.md`:
`- [ ] **PS-XX** Title — effort · primary affected paths`

Body: `Why` (the gap, with industry benchmark + offline-first compatibility statement) · `Acceptance` (concrete deliverable + schema/SQL/JS shape) · `Depends-on` (prerequisite task IDs).

Effort tags: **XS** ≤ 1 hr · **S** 1–4 hr · **M** ½–1 day · **L** 1–2 days · **XL** 2–5 days.

Schema additions all target migration **v50+** — every new column/table below is additive (no rebuild) unless explicitly flagged.

---

## Section A — Financial health & behavioural analytics

The first supplement added Sankey (PS-01), mood × spend (PS-02), carbon (PS-03), and the NW donut (PS-04). v2 closes the behavioural-feedback and composite-score gaps that Mint / Rocket Money / Truebill all centre their home screens on.

- [ ] **PS-22** Financial Health Score (composite 0–100) — M · `app/src/analytics/health.js`, `app/src/features/analytics/screens/HealthDetail.js`, Home hero extension
  - **Why:** No single-number rollup of overall financial health exists today. Mint's "Credit Score + Net Worth Snapshot" anchored its home screen for a decade; the offline-compatible variant is a weighted blend of: budget adherence (from `monthly_summary` vs `categories.budget`), savings rate (5.6), subscription leakage (6.8), emergency-fund coverage (`accounts` kind=asset where `category='cash'` ÷ 3-month avg burn), debt service ratio (sum `emi_loans.emi_override`/income), and NW trajectory direction (PS-04 line slope). All seven inputs are on-device.
  - **Acceptance:** New `health.js` exports `financialHealthScore()` returning `{score, components: {name, value, weight, direction}[]}`. Home gets a 28-px pill chip ("✿ Health: 72/100") below the budget hero. Tap → new `HealthDetail.js` screen breaks down each component with sparkline + one-tap drill-in to the source surface (budget → BudgetSetup, leakage → Subs, etc.). Score recomputes via `getCached()` with a 12-hour TTL. Empty-state when < 30 days of data.
  - **Depends-on:** PS-04 (NW), 5.6 (savings rate), 6.8 (leakage), 7.5 (EMI), 7.13 (NW snapshot). No new schema.

- [ ] **PS-23** No-spend / in-budget streak tracker — S · `app/src/analytics/streaks.js`, Home chip, `SpendCalendar.js` extension
  - **Why:** Behavioural nudge that compounds: a 12-day streak under daily budget motivates the 13th day. Every data input is already in `monthly_summary` + `expenses` by day. Today there is no streak surface anywhere in the app.
  - **Acceptance:** New `streaks.js` exports `currentStreak({mode: 'no_spend' | 'in_budget'})` and `bestStreak(...)`. Home renders a "🔥 12-day in-budget streak" chip when current streak ≥ 3 (suppressed otherwise — no shaming UX). SpendCalendar overlays a tiny "·" mark on no-spend days. Stored only in cache; no schema. Streak recomputes daily via the existing maintenance job (8.7).
  - **Depends-on:** 8.7 (maintenance), 3.11 (monthly_summary).

- [ ] **PS-24** Year-in-Review retrospective screen — M · `app/src/features/analytics/screens/YearInReview.js`, Export extension
  - **Why:** End-of-year storytelling. Spotify Wrapped popularised it; Truebill/Mint adopted it. Drift has all the inputs (top categories, top merchants, top items, biggest single spend, longest streak, savings rate trend, YoY delta) but no curated narrative surface today.
  - **Acceptance:** New `YearInReview.js` reachable from Analytics Hub once the current month ≥ October. Sections: total spent/income/savings-rate hero · top 5 categories with bars · top 5 merchants · top 5 items · biggest single splurge with date · longest streak · YoY delta vs prior year · "your year in 3 numbers" call-out. Single-page PDF export (extends 5.7) so the user can keep a yearly artefact.
  - **Depends-on:** 5.7 (PDF export), 6.20 (merchant intelligence), 3.11 (rollups).

- [ ] **PS-25** Time-of-day spend pattern heatmap — M · migration v50 adds `expenses.expense_time TEXT NULL`, `app/src/analytics/timeOfDay.js`, Spending-Calendar extension
  - **Why:** 6.10 ships day-of-week + day-of-month. Hour-of-day is the missing third axis. Catches "I overspend on late-night Swiggy" patterns invisible to daily aggregations. Quick-Templates (PS-09) + Add screen capture date; time is dropped today.
  - **Acceptance:** Migration v50 adds `expense_time TEXT NULL` (HH:MM, captured only when Add screen has the field active — opt-in setting `capture_expense_time` default OFF to avoid friction). New `timeOfDay.js` exports `hourOfDayHistogram(monthKey?)`. Spending Calendar screen gets a third tab "By hour" with a 24-cell heat strip. Empty-state when < 50 timestamped expenses.
  - **Depends-on:** None. Schema migration v50.

- [ ] **PS-26** Budget recommendation engine — M · `app/src/analytics/budgetSuggest.js`, BudgetSetup extension
  - **Why:** PS-06 ships BudgetSetup with "copy from last month" (rounds spend up to next ₹500). That fails for seasonal users (Diwali, weddings) and underestimates for chronic overspenders. A p75-rolling + seasonality multiplier suggestion is more honest.
  - **Acceptance:** New `budgetSuggest.js` exports `suggestBudgets()` returning `{category_id, suggestion, rationale}[]`. Algorithm per category: `p75(last 6 months of monthly_summary.total) × seasonalMultiplier(currentMonthIndex)`. BudgetSetup gains a "Smart suggest" button that fills the +/- steppers with values; per-category rationale chip ("p75 of last 6 mo × 1.1 Diwali buffer"). User reviews + applies; nothing auto-writes.
  - **Depends-on:** PS-06, 3.11 (monthly_summary), 6.10 (seasonal multipliers — reuse `seasonalCalendar()` ratios).

---

## Section B — Unified cash-flow & forecasting

cashflowForecast() (6.9 + 5.A.01) is the strongest engine in the app, but its surface is total-only. Per-category breakdowns + unified outflow projection across subs/EMI/insurance/utility are the next intelligence layer.

- [ ] **PS-27** Unified forward outflow calendar — L · `app/src/features/analytics/screens/CashflowCalendar.js`, Hub report row
  - **Why:** Drift today has 5 separate forward-looking calendars: SubCalendar (7.2), EMI installments (7.5), insurance renewals (PS-11 reuses notif scheduler), utility next-bill (7.12 estimates from billing_day), recurring expense projection (7.11). No single grid shows the full burn for a user planning the next 30/60/90 days. Monarch + YNAB both centre this view.
  - **Acceptance:** New `CashflowCalendar.js` overlays all 5 streams into a single month-grid with per-day totals + chip stacking ("📺 Netflix · 🏦 HDFC EMI · 💡 Adani"). Tap a day → bottom-sheet with full event list. Toggle: 30 / 60 / 90 day horizons. Net cell colour = (projected outflow > projected income? coral : sage). Pull-to-refresh re-projects via existing repos — no new schema, no caching.
  - **Depends-on:** 7.1, 7.2, 7.5, 7.11, 7.12, PS-11.

- [ ] **PS-28** Per-category cashflow forecast — M · `app/src/analytics/forecast.js` extension, PotDetail extension, Variance extension
  - **Why:** `cashflowForecast()` is whole-month-total only. A per-category forecast would let users see "Food projected ₹14k vs ₹12k budget — over by day 21" before it happens. The 5-model ensemble is composable; only the SQL filter changes.
  - **Acceptance:** `forecast.js` adds `categoryCashflowForecast(categoryId)` reusing the existing 5-model ensemble scoped to one category. PotDetail screen gets a "Projected month-end: ₹X (₹Y over budget)" line + a confidence-cone mini-chart below the daily-spend strip. Variance screen extends with a "Forecast vs actual" column. Cache scope: `forecast:cat:<id>:<month_key>`.
  - **Depends-on:** 6.9, 5.A.01, 6.11 (variance).

- [ ] **PS-29** Subscription price-change detection — S · `app/src/analytics/subDrift.js`, Subs screen pill, notif checker
  - **Why:** When a recurring expense linked via `expenses.subscription_id` (3.5) is charged differently from `subscriptions.amount`, today nothing fires. Netflix raising the family plan ₹100 silently increases sub leakage; the user finds out at year-end.
  - **Acceptance:** `subDrift.js` exports `subscriptionDrift()` returning `{sub_id, expected, actual_avg, delta_pct, observations}[]` — flagging entries where the last N linked expenses average > 5% off `subscriptions.amount`. Surfaces on Subs as a "Price changed +₹100/mo" pill below the row. Notif checker (7.1) fires once per sub per change (dedupe via `last_alert_at` column added in v50 — `subscriptions.last_alert_at TEXT NULL`).
  - **Depends-on:** 3.5 (expense.subscription_id), 7.1. Migration v50 adds one column.

- [ ] **PS-30** Recurring debit auto-creation (opt-in) — M · migration v50 adds `expenses.is_pending INTEGER DEFAULT 0`, `app/src/features/expenses/screens/Pending.js`, 7.11 extension, 8.7 hook
  - **Why:** 7.11 detects recurring patterns. The next step — silently pre-creating the expense on its projected day with a one-tap confirm — is not built. For users with predictable salaries → rent → bills, this collapses 4–5 manual entries per month into 4–5 taps.
  - **Acceptance:** Each detected recurring pattern (`recurringCandidates`) gets an "Auto-create on day X" toggle in its row. Daily maintenance job (8.7) inserts a pending expense row with `is_pending=1` on the projected day. New `Pending.js` screen (reachable from Home bell badge) lists pending entries → confirm-or-dismiss. Confirmed rows flip `is_pending=0`. Triggers gate on `is_pending=0` so rollups exclude unconfirmed entries. Default off; user opts in per pattern.
  - **Depends-on:** 7.11, 8.7. Migration v50 adds `is_pending` column + index `idx_expenses_pending WHERE is_pending=1`.

---

## Section C — Investment & returns

PS-10 ships current holdings + market-value vs cost-basis. The time-series of returns and the asset-class drill are the next layer.

- [ ] **PS-31** Holdings NAV history + returns chart (CAGR / XIRR) — L · migration v50 adds `holding_nav_history`, `app/src/features/investments/screens/HoldingDetail.js`, returns helper
  - **Why:** PS-10 stores `current_nav` and overwrites on each user update. The historical trajectory is lost. No CAGR / XIRR / time-series return chart can be drawn. Mint/Monarch both treat this as table-stakes for an investments view.
  - **Acceptance:** Migration v50 adds `holding_nav_history (id, holding_id FK CASCADE, nav REAL, recorded_at TEXT, source TEXT CHECK IN('user','manual_edit','seed'), created_at)`. EditHolding writes a row on every NAV save (debounce: skip if same-NAV-same-day). New `HoldingDetail.js`: line chart of NAV over time + computed XIRR (uses goal_contributions-style ledger of cost basis additions; falls back to CAGR when < 2 contributions). Returns export adds an "Investments" sheet to the PDF/CSV export (5.7).
  - **Depends-on:** PS-10. Migration v50 adds 1 table + 1 index `idx_nav_history_holding_date ON (holding_id, recorded_at DESC)`.

- [ ] **PS-32** Net-worth asset-class breakdown drill — M · `NetWorth.js` extension
  - **Why:** PS-04 ships the 2-arc donut (assets vs liabilities). The user needs 6–7 arcs: cash · equity · gold · FD/RD · NPS/PPF · real-estate · vehicles. Schema already supports this via `accounts.category` (free text today, partially populated) and `holdings.kind` (PS-10 enum). UI just hasn't composed them.
  - **Acceptance:** NetWorth donut toggles between "Assets vs Liabilities" (PS-04) and "By asset class" via segmented control. The class-mode arcs read `accounts.category` (with a fallback enum: `cash|bank|fd|rd|real_estate|vehicle|other`) and roll up `holdings.kind`. Tap an arc → drill-list of contributing accounts + holdings. Migration v50 OPTIONALLY adds a CHECK constraint on `accounts.category` (or leaves it free text and uses a JS-side normaliser); pick the lighter path — JS-side normaliser — to avoid rebuilding `accounts`.
  - **Depends-on:** PS-04, PS-10.

- [ ] **PS-33** Insurance + EMI + utility renewals folded into cashflow forecast — S · `app/src/analytics/forecast.js` extension
  - **Why:** PS-11 (insurance), 7.5 (EMI), 7.12 (utility) all carry next-due / billing_day metadata. `cashflowForecast()` ingests only `expenses` + recurring patterns. Projected fixed outflows are therefore missing from the 30-day forecast — the user sees a positive cash position that flips negative the day rent debits.
  - **Acceptance:** `forecast.js` extends `cashflowForecast()` to add a sixth model `expectedFixedOutflows` that sums (a) `subscriptions.amount` due in window per `next_bill`, (b) `emi_loans.emi_override` due per `bill_day`, (c) `insurance_policies.premium_amount` due per `next_due`, (d) `utility_accounts.billing_day` × last 3-bill mean total. PS-27 calendar reads the same projections. New ensemble weight published in `forecast.js` (sum to 1.0 invariant maintained).
  - **Depends-on:** 6.9, 5.A.01, 7.5, 7.12, PS-11, PS-27.

---

## Section D — Tagging & categorisation

7.3 ships tags + the picker. The surface for analytics, automation, and hierarchical categories was never built.

- [ ] **PS-34** Tag analytics surface — S · `app/src/analytics/tags.js`, `app/src/features/tags/screens/TagAnalytics.js`, Hub report row
  - **Why:** 7.3 ships tags + the chip surface. The Hub has no "Top tags" rollup; ManageTags is CRUD-only. A user tagging "work · personal · reimbursable" can't see the splits without manual filtering.
  - **Acceptance:** New `tags.js` exports `tagAggregates(monthKey?)` returning `[{tag_id, tag_name, total, txn_count, cat_breakdown}]`. New `TagAnalytics.js` lists top tags with bars + drill into AllExpenses filtered by that tag (`saved_filters` already supports tag filter). Hub gains a "🏷 Top tags" report row when ≥ 1 tag exists in the current month.
  - **Depends-on:** 7.3, 5.3 (saved filters / WHERE builder).

- [ ] **PS-35** Auto-tag rule engine — M · migration v50 adds `tag_rules`, ManageTags extension, Add/Edit hook
  - **Why:** `merchant_aliases` (5.10) auto-categorises merchant → category. Tags have no equivalent. A user typing "Office lunch" every time they expense a meal for work wants this auto-tagged. Today they tag manually.
  - **Acceptance:** Migration v50 adds `tag_rules (id, predicate_json TEXT NOT NULL, tag_id INTEGER FK CASCADE, enabled INTEGER DEFAULT 1, created_at, deleted_at)`. Predicate axes: `merchant_contains`, `category_id`, `amount_min`, `amount_max`, `notes_contains`, `payment_method`. ManageTags gains a "Rules" sub-screen for CRUD. On expense save (Add + EditExpense + Scan), evaluate rules → auto-attach tags before commit. Soft-delete preserves history.
  - **Depends-on:** 7.3, 5.10 (rule pattern). Migration v50 adds 1 table.

- [ ] **PS-36** Sub-categories / hierarchical pots — L · migration v50 adds `categories.parent_id`, EditPot + PotDetail extension
  - **Why:** `categories` are flat. Power users want "Food → Dining out" + "Food → Groceries" without losing the rollup. Today they work around with tags, which doesn't roll up cleanly in budget summaries.
  - **Acceptance:** Migration v50 adds `categories.parent_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL` + `idx_categories_parent`. EditPot adds a "Parent category" picker (optional, with cycle check). PotDetail rolls up child spend with a collapsible "Includes 3 sub-pots" section. monthly_summary stays keyed on the leaf `category_id`; the rollup is JS-side via a CTE in `pots()`. Backwards-compatible: existing users have parent_id NULL = top-level.
  - **Depends-on:** None. Migration v50 adds 1 column + 1 index.

---

## Section E — Refund & lifecycle

The lifecycle of an expense is currently `create → soft-delete → restore`. Returns, refunds, and OCR review queues are common real-world events with no first-class persistence.

- [ ] **PS-37** Refund / return linkage on expenses — M · migration v50 adds `expenses.refund_of_expense_id`, Detail extension, MerchantDetail chip
  - **Why:** Online-shopping returns are frequent. Today users either edit the original expense (losing the audit) or log a negative-amount expense (losing the link). No analytics on "refund rate per merchant" — a useful trust signal for online retailers.
  - **Acceptance:** Migration v50 adds `expenses.refund_of_expense_id INTEGER NULL REFERENCES expenses(id) ON DELETE SET NULL` + partial index. Detail screen gets a "Mark as refunded" action button which navigates to Add prefilled with negative amount + same merchant + `refund_of_expense_id` set. Detail also shows "Refunded on YYYY-MM-DD" badge when this expense has been linked as a refund target. MerchantDetail (5.9) shows "Refund rate: X%" chip. monthly_summary trigger accounts for negative amounts correctly (already does — no schema change to the rollup).
  - **Depends-on:** 5.9. Migration v50 adds 1 column + 1 partial index.

- [ ] **PS-38** Receipt OCR review queue — M · migration v50 adds `expenses.ocr_confidence REAL`, `app/src/features/scan/screens/ReviewQueue.js`
  - **Why:** Scans produce a 7-component confidence score (4.10, 4.18). Today a low-confidence scan is saved indistinguishably from a confident one. A surface for "scans needing review" would let users catch silent extraction errors and feed the receipt-template learning loop (4.22).
  - **Acceptance:** Migration v50 adds `expenses.ocr_confidence REAL NULL` populated by ScanService on save. New `ReviewQueue.js` lists expenses where `ocr_confidence < 0.6 OR item_count = 0 AND receipt_path IS NOT NULL`. Tap → Detail with the receipt image open and a "Fix items" CTA that re-opens the Scan review screen with the original image. Hub gets a "🔍 N scans need review" report row when count > 0.
  - **Depends-on:** 2.13, 4.10. Migration v50 adds 1 column + 1 partial index.

- [ ] **PS-39** Per-item return-by-date tracker — S · migration v50 adds `receipt_items.return_by_date`, default-policy seed, notif checker
  - **Why:** Online retail return windows (Amazon 30d, Myntra 30d, Flipkart 10d, big-appliance 7d) are commercially material. receipt_items have `purchase_date`. Surfacing "X items still returnable" + a 1-day-before-window-closes reminder is high-utility for online shoppers.
  - **Acceptance:** Migration v50 adds `receipt_items.return_by_date TEXT NULL`. ScanService stamps a default based on a merchant→policy map (bundled JSON, 30 entries: Amazon/Myntra/Flipkart/etc.); user-editable per item in the Scan review screen. New small screen / pantry-like card on Pantry: "Returnable now: 4 items" listing items with `purchase_date < now < return_by_date AND refund_of_expense_id IS NULL`. Notif checker fires once per item 1 day before window closes.
  - **Depends-on:** 7.1, 7.7 (pantry pattern), PS-37 (refund linkage). Migration v50 adds 1 column + partial index.

---

## Section F — Notifications & export

7.1 ships push notifications with a single on/off toggle. Granularity, calendar export, and backup hygiene are the missing surfaces.

- [ ] **PS-40** .ics calendar export for bills + EMIs + insurance — S · `app/src/features/profile/screens/Export.js` extension, `app/src/features/expenses/export.js` extension
  - **Why:** Power users want their bill calendar in Google Calendar / Outlook. .ics is a plain-text format generated locally — zero charter violation. Drift has all the data; the formatter is the gap.
  - **Acceptance:** Export screen gains a "Calendar (.ics)" preset alongside CSV/JSON/PDF. Generates a single .ics file containing every recurring outflow over the next 12 months: subs (7.2), EMI installments (7.5), insurance renewals (PS-11), utility next-bills (7.12). Each event has SUMMARY, DTSTART, DTEND, RRULE, DESCRIPTION (amount + account). Shared via `expo-sharing`. Round-tripped through Google Calendar in test.
  - **Depends-on:** 5.7, 7.2, 7.5, 7.12, PS-11.

- [ ] **PS-41** Per-channel notification preferences — S · migration v50 adds 5 settings booleans, Profile Security section extension
  - **Why:** 7.1 schedules notifications across budget alerts, sub reminders, price alerts, low-stock alerts. Settings exposes a single on/off. Power users want "budget alerts on, low-stock off". Today they can't.
  - **Acceptance:** Migration v50 adds 5 boolean columns on settings: `notif_budget_enabled`, `notif_sub_enabled`, `notif_price_enabled`, `notif_lowstock_enabled`, `notif_health_enabled` — all default 1. Profile → Security section gains a "Notification preferences" sub-section with 5 toggles. Each checker in `checkers.js` reads its flag before firing. Master toggle (existing) gates all 5; per-channel toggles act as AND gates.
  - **Depends-on:** 7.1.

- [ ] **PS-42** Backup auto-reminder + restore dry-run preview — S · migration v50 adds `settings.backup_reminder_days`, `last_backup_at`, maintenance hook, Backup screen extension
  - **Why:** 8.8 ships manual encrypted backup; users will forget. A health-score input (PS-22) penalises stale backups, but only if the surface reminds. Restore today is atomic-swap with no "what will change" preview — risky.
  - **Acceptance:** Migration v50 adds `settings.last_backup_at TEXT NULL` and `settings.backup_reminder_days INTEGER DEFAULT 30`. Backup screen writes `last_backup_at` on success. Maintenance task `backupReminder.js` (added under `app/src/maintenance/tasks/`) posts a "Back up your data" notif when `now - last_backup_at > reminder_days`. Restore flow extended with a dry-run step: opens the backup zip, counts rows-to-add / rows-to-overwrite, surfaces "X new expenses, Y updates" before the user confirms the swap.
  - **Depends-on:** 8.8, 7.1, 8.7. Migration v50 adds 2 columns.

---

## Section G — Income, goals, savings

The income side (5.5) and the goal side (foundation + 7.13) have intelligence gaps that mirror what cashflow forecasting did for expenses.

- [ ] **PS-43** Income source aggregation — S · `app/src/features/income/repo.js` extension, `app/src/features/income/screens/IncomeBreakdown.js`, Hub row
  - **Why:** `income.source` is TEXT. Today income is summed by month for the savings-rate widget (5.6); there is no GROUP BY source rollup. A user with salary + freelance + dividends + rental can't see the mix.
  - **Acceptance:** `income/repo.js` adds `bySource({months})`. New `IncomeBreakdown.js` shows a donut for the active month + a 12-month stacked bar (one stack per source) for the year. Hub gains a "💵 Income mix" report row. Empty-state when < 3 distinct sources.
  - **Depends-on:** 5.5.

- [ ] **PS-44** Goal contribution velocity + projected ETA — S · `app/src/features/goals/repo.js` extension, Goals screen extension
  - **Why:** `goals.eta` is a user-typed TEXT field — wishful at best. `goal_contributions` (3.8) ledger exists. Computing velocity (₹/month) and projecting a realistic ETA based on history would surface "On track / behind by N months" without any new schema.
  - **Acceptance:** `goals/repo.js` adds `projectedEta(goalId)` returning `{eta_iso, monthly_velocity, status: 'on_track' | 'behind' | 'ahead'}`. Goals screen shows two lines per goal: "Your target: 2027-06" and a velocity line "On track: 2027-09 at ₹5,200/mo". Behind/ahead chip colored sage/coral. Empty-state when < 2 contributions.
  - **Depends-on:** 3.8 (goal_contributions).

- [ ] **PS-45** Wallet float / cash-on-hand reconciliation — M · settings auto-create "Cash" account, cash payment hook, Profile reconcile action
  - **Why:** Cash expenses leave the wallet but Drift doesn't track the wallet balance. A user with ₹2k in cash who loses a ₹150 receipt sees no anomaly. Bank-app-style cash reconciliation closes the loop.
  - **Acceptance:** First launch after this lands, auto-create a `kind='asset' category='cash' label='Cash'` account if none exists. When a `payment_method='cash'` expense saves, atomically debit the cash account via `account_transactions` (8.x extension; reuses 3.7 ledger). Profile gains a "Reconcile cash" row → modal "How much cash do you actually have?" → system writes an `account_transactions` adjustment txn with `note='reconcile'`. The cash account balance flows into NetWorth + PS-22 health score.
  - **Depends-on:** 5.4 (payment method), 3.7 (account_transactions). No schema change.

---

## Section H — UX polish & reports

Lowest-effort, highest-tangibility batch. Each ships in ≤ S unless flagged.

- [ ] **PS-46** Receipt thumbnail in expense rows — S · `ExpenseRow.js`, `PotExpenseRow.js`, settings toggle
  - **Why:** `receipt_thumb` is captured by 5.12 + 8.6. DriftImage component exists. Yet `ExpenseRow.js` and `PotExpenseRow.js` still render only the category emoji. A 32-px thumbnail makes long lists scannable.
  - **Acceptance:** Both row components accept `showThumb` prop. When `expense.receipt_thumb != null`, render a 32-px `<DriftImage uri={thumb} recyclingKey={uri} />` in place of the category emoji square (or beside it — pick one in implementation). New settings toggle `show_receipt_thumbnails INTEGER DEFAULT 0` in settings (default off — opt-in to preserve current UX). FlatList getItemLayout unaffected.
  - **Depends-on:** 5.12, 8.4, 8.6. Migration v50 adds 1 settings column.

- [ ] **PS-47** Multi-month side-by-side comparison view — M · Trends extension
  - **Why:** Trends has YoY/MoM toggles (6.22). A true 3-column side-by-side ("Jan vs Feb vs Mar") view is the natural extension for users planning ahead. Variance heatmap (6.11) is the volatility-focused cousin; this is the absolute-spend cousin.
  - **Acceptance:** Trends screen gains a "Compare months" mode (segmented control). User picks any 3 month_keys. Renders per-category bars side-by-side (3 bars per category). Per-row delta column ("+12% MoM, -3% vs Jan"). Reuses `monthly_summary` exclusively; zero new SQL.
  - **Depends-on:** 6.22, 3.11.

- [ ] **PS-48** Single-receipt PDF export (reimbursement flow) — S · Detail extension, `app/src/features/expenses/export.js` extension
  - **Why:** 5.7 exports the whole dataset. A user submitting a reimbursement needs one expense + its receipt → one PDF. No surface today.
  - **Acceptance:** Detail screen gains an "Export as PDF" action. Generates a single-page PDF (expo-print) with the merchant/date/amount header, items table, GST breakdown (when present), the embedded receipt image, and a Drift footer. Shared via expo-sharing. Generated locally; nothing leaves the device.
  - **Depends-on:** 5.7, 5.11 (GST), 5.13 (image viewer).

- [ ] **PS-49** Custom accent colour picker — XS · migration v50 adds `settings.accent_color`, Profile theme sub-screen, ThemeContext extension
  - **Why:** Theme is the Flow palette with `F.coral` as the single accent. A user-picked accent (palette of 8 + custom hex) personalises without rearchitecting and is the cheapest "feels mine" UX investment.
  - **Acceptance:** Migration v50 adds `settings.accent_color TEXT NULL` (named-palette enum: `coral|saffron|sage|olive|indigo|rose|teal|amber` or 7-char hex). Profile gets a "Theme" sub-screen with 8 swatches + a colour-picker fallback + "Reset to default". ThemeContext overlays `accent_color` on top of `F.coral` at composition time. Dark-mode contrast unchanged (variant uses HSL Y-axis).
  - **Depends-on:** None. Migration v50 adds 1 column.

- [ ] **PS-50** In-app feedback / log capture (mailto) — XS · Diagnostics extension
  - **Why:** Diagnostics screen (8.10) shows db_stats. There is no "send these logs to the developer" affordance. For an offline-first app this is just `Linking.openURL('mailto:...')` with a prefilled subject + body — no network, no telemetry, user-driven.
  - **Acceptance:** Diagnostics gets a "Send feedback" button. Opens a mailto: composer with subject "Drift feedback v{appVersion}" + body containing app version + DB schema version + last 20 `db_slow_log` rows + db_stats summary (PII-scrubbed: no merchant names). User reviews + sends via their own mail client. Defensive: when mailto: isn't handled (no mail client installed), surface a "Copy logs to clipboard" fallback.
  - **Depends-on:** 8.10.

---

## Cross-section dependencies

```
PS-22 ──┬── PS-04, 5.6, 6.8, 7.5, 7.13
        └── consumes PS-42 (backup freshness), PS-32 (NW class)

PS-27 ──┬── PS-11, 7.2, 7.5, 7.11, 7.12
        └── consumes PS-33 (insurance/utility folded into forecast)

PS-28 ──── 6.9, 5.A.01, 6.11

PS-31 ──── PS-10  ◄── PS-32 (NW class breakdown reads holdings.kind)

PS-37 ──── 5.9
       └── consumes PS-38 (review queue), PS-39 (return-by-date)

PS-30 ──── 7.11, 8.7
PS-35 ──── 7.3, 5.10
PS-36 ──── (standalone)
PS-45 ──── 5.4, 3.7

PS-40 ──── 5.7, 7.2, 7.5, 7.12, PS-11
PS-41 ──── 7.1
PS-42 ──── 8.8, 7.1, 8.7

PS-43 ──── 5.5
PS-44 ──── 3.8

PS-46 ──── 5.12, 8.4, 8.6
PS-47 ──── 6.22, 3.11
PS-48 ──── 5.7, 5.11, 5.13
PS-49 ──── (standalone)
PS-50 ──── 8.10
```

Critical-path observations:

- **PS-22 (Health Score)** is the natural anchor — it consumes seven other surfaces and elevates them via a single hero metric. If you ship one task from this supplement, ship this one (after its inputs are validated).
- **PS-27 (Unified outflow calendar)** + **PS-33 (forecast folds in fixed outflows)** form the cash-flow-intelligence pair. PS-33 is cheap and unblocks PS-27.
- **PS-37 (refund linkage)** + **PS-38 (OCR review queue)** + **PS-39 (return-by-date)** are the "lifecycle" trio; they share a schema migration (v50 adds 3 columns) and can ship in one batch.
- **PS-41 / PS-42 / PS-50** are the trust-and-feedback trio — XS/S each, total < 1 dev-day, immediate user-visible quality lift.

---

## Migration plan (if approved)

Every task above is schema-compatible with one batched migration **v50** that adds:

| Target | Change |
|---|---|
| `expenses` | `+ expense_time TEXT NULL` (PS-25) · `+ refund_of_expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL` (PS-37) · `+ ocr_confidence REAL NULL` (PS-38) · `+ is_pending INTEGER NOT NULL DEFAULT 0` (PS-30) |
| `receipt_items` | `+ return_by_date TEXT NULL` (PS-39) |
| `categories` | `+ parent_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL` (PS-36) |
| `subscriptions` | `+ last_alert_at TEXT NULL` (PS-29) |
| `settings` | `+ accent_color TEXT NULL` (PS-49) · `+ last_backup_at TEXT NULL` (PS-42) · `+ backup_reminder_days INTEGER NOT NULL DEFAULT 30` (PS-42) · `+ show_receipt_thumbnails INTEGER NOT NULL DEFAULT 0` (PS-46) · `+ capture_expense_time INTEGER NOT NULL DEFAULT 0` (PS-25) · `+ notif_budget_enabled INTEGER NOT NULL DEFAULT 1` · `+ notif_sub_enabled INTEGER NOT NULL DEFAULT 1` · `+ notif_price_enabled INTEGER NOT NULL DEFAULT 1` · `+ notif_lowstock_enabled INTEGER NOT NULL DEFAULT 1` · `+ notif_health_enabled INTEGER NOT NULL DEFAULT 1` (PS-41) |
| **NEW** `holding_nav_history` | (id, holding_id FK CASCADE, nav REAL, recorded_at TEXT, source TEXT CHECK, created_at) + `idx_nav_history_holding_date` (PS-31) |
| **NEW** `tag_rules` | (id, predicate_json TEXT, tag_id FK CASCADE, enabled INTEGER DEFAULT 1, created_at, deleted_at) + partial `idx_tag_rules_enabled` (PS-35) |

Net total: **49 → 50** (one new migration version). 17 new columns across 5 existing tables. 2 new tables. ~7 new indexes. Pure ALTER + CREATE — no rebuild — matches the additive-migration discipline of the prior 49 versions.

Per the Decision-log convention (one task = one migration version, batched only when explicitly chosen — see 3.1–3.10 precedent), this could either ship as one batched v50 or split per-task. Recommended: **one batched v50** when ≥ 4 of these tasks are approved together, otherwise per-task increments.

---

## Suggested execution order (if approved)

The user picks the actual sequence; this is one defensible priority pass that maximises early value-to-cost:

**Wave 1 — Foundation quick wins (< 1 day total)**
1. PS-41 — per-channel notif prefs (S)
2. PS-49 — accent picker (XS)
3. PS-50 — in-app feedback (XS)
4. PS-46 — receipt thumbnails (S)
5. PS-43 — income source breakdown (S)
6. PS-44 — goal velocity ETA (S)
7. PS-23 — streaks (S)

**Wave 2 — Lifecycle batch (one v50 migration, ~3 days)**
8. PS-37 — refund linkage (M)
9. PS-38 — OCR review queue (M)
10. PS-39 — return-by-date (S)

**Wave 3 — Cash-flow intelligence (~4 days)**
11. PS-33 — forecast folds in fixed outflows (S)
12. PS-27 — unified outflow calendar (L)
13. PS-28 — per-category forecast (M)
14. PS-29 — sub price-change detection (S)
15. PS-30 — recurring debit auto-creation (M)

**Wave 4 — Behavioural & health (~3 days)**
16. PS-22 — Financial Health Score (M) ← anchor
17. PS-24 — Year in Review (M)
18. PS-25 — time-of-day heatmap (M)
19. PS-26 — budget recommendation (M)

**Wave 5 — Investment & categorisation (~4 days)**
20. PS-31 — NAV history + returns (L)
21. PS-32 — NW asset-class drill (M)
22. PS-34 — tag analytics (S)
23. PS-35 — auto-tag rules (M)
24. PS-36 — sub-categories (L)
25. PS-40 — .ics export (S)
26. PS-42 — backup reminder + dry-run (S)
27. PS-45 — wallet cash reconciliation (M)
28. PS-47 — multi-month compare (M)
29. PS-48 — single-receipt PDF (S)

Estimated total effort: **~15 dev-days** if all 29 ship; ~3 dev-days for Wave 1 alone.

---

## Out-of-scope (declared explicitly)

Same exclusion list as PS-01..PS-21 carries forward. Additionally surfaced and rejected during this audit:

- **Voice expense entry** — out of scope until on-device voice latency improves.
- **Barcode lookup** — bundled corpus too large (50–80 MB) for the offline charter.
- **AI insights via cloud LLM** — charter violation. PS-22 + PS-23 cover the behavioural-nudge surface offline.
- **Geographic merchant clustering** — no location capture (privacy decision).
- **Auto-savings direct debit** — requires bank integration.
- **Multi-currency reporting beyond per-expense `currency` + `amount_home`** — already declined in v1 supplement.
- **Cohort comparison vs peers** — requires cloud aggregation.

---

## What the user should decide

1. **Approve / reject** this supplement as a whole, or per-item.
2. **Pick a merge path:**
   - **Path A** — Defer until the 4 open tracker tasks (1.14, 4.19, 4.20, 7.14) close. Keep this file as a proposal.
   - **Path B** — Interleave a Wave-1 splice (≤ 7 items, all S/XS) into the active queue now; defer the rest. Recommended.
   - **Path C** — Full append: merge all 29 into `task_tracker.md` as Phase 7 (or expand Phase 6). Update phase totals (211 → 240). Schedule v50 migration design before any implementation begins.
3. **If Path B:** confirm which Wave-1 items to splice in.

Once decided, I'll merge the approved items into `docs/10-final/task_tracker.md` following the file's conventions: checkbox lines under a new heading or appended to Phase 6, phase totals table updated, Completion log untouched until tasks ship, Decision log appended with one line citing this supplement and the v50 migration plan. Until that approval, `task_tracker.md` stays exactly as it is, with only a one-line pointer added below the Phase 6 heading.
