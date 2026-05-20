# Missing Screens — Drift

**Date:** 2026-05-17  
Priority: P0 (critical) → P1 (high) → P2 (medium) → P3 (nice to have)

---

## P0 — Blocking Power-User Flows

### 1. Search Screen
**What:** Full-text search across expenses, merchants, items, subscriptions.  
**Why missing:** Every user with >2 months of data needs search. The current category filter on AllExpenses is not a substitute.  
**Entry points:** Header search icon (Home + Insights), `/search` deep link.  
**Key features:**
- Text input with merchant autocomplete from expense history.
- Filter chips: Category, Date range, Amount range, Mood, Recurring.
- Sort: Newest first / Oldest / Highest amount / Lowest.
- Results grouped by date, showing amount, category emoji, merchant.
- Recent searches (last 10, persisted).
- "No results" state with smart suggestion ("Try expanding date range").

---

### 2. Date Range Selector / Month Picker
**What:** A month/date-range picker accessible from Home and AllExpenses.  
**Why missing:** All data views are locked to "current month." Users cannot review January spending in May.  
**Entry points:** Month label on Home hero card, filter icon on AllExpenses.  
**Key features:**
- Previous/next month arrows on Home.
- Preset ranges: This month, Last month, Last 3 months, Last 6 months, This year, Custom.
- Custom range: calendar date pickers (start → end).
- AllExpenses and Insights respond to the selected range.
- Home shows a subtle "Viewing: April 2026" label when not current month.

---

## P1 — High-Value Features

### 3. Quick Add Widget / Bottom Sheet
**What:** A minimal expense entry bottom sheet triggered by the + FAB — never leaves current screen.  
**Why missing:** Current Add screen navigates away, breaking context. Logging a spend mid-analytics should be frictionless.  
**Key features:**
- Amount numpad + merchant field + category (last 3 used, pre-selected).
- "More options" expands to full Add screen.
- Saves and dismisses with a toast.
- Auto-selects last-used category (smart default).

---

### 4. Merchant History / Autocomplete Screen
**What:** When typing a merchant name, show matching history in a dropdown.  
**Why:** Users type the same merchant (Zepto, DMart, Swiggy, Rapido) hundreds of times. Autocomplete is the single highest-ROI improvement.  
**Implementation:** Query `expenses` table for `merchant LIKE '%query%'`, deduplicated, ordered by frequency. Show last amount and last category as hints.

**Mockup:**
```
┌─────────────────────────────────┐
│ Swi…                            │
├─────────────────────────────────┤
│ 🛵 Swiggy        ₹485  · Food  │
│ 🛵 Swiggy Instamart ₹1,240 · Groceries │
└─────────────────────────────────┘
```

---

### 5. Analytics Detail Screen (per Category)
**What:** PotDetail currently shows just a list of expenses in a category. It needs a proper analytics view.  
**Key features:**
- Monthly bar chart for this category (6 months).
- Budget vs. actuals comparison.
- Top merchants in this category.
- Average spend per transaction.
- Day-of-week spending heatmap.
- Trend indicator (↑/↓ vs. last month).

---

### 6. Export / Report Screen
**What:** A screen to generate and share spending reports.  
**Why:** Users need to share data with partners, accountants, or import to other tools.  
**Entry points:** Profile → "Export data".  
**Key features:**
- Date range picker.
- Format picker: CSV (expenses), CSV (items), PDF summary, JSON.
- Scope: All / Selected categories / Single category.
- Share via native share sheet.
- "Last exported" timestamp.

---

### 7. Budget Setup Screen (dedicated)
**What:** A standalone screen to set and adjust monthly budgets per category, with a total-budget overview.  
**Why:** Currently, budgets are only set during onboarding or by navigating to EditPot one category at a time. There's no overview of "total budgeted vs. income."  
**Entry points:** Home hero card (tap budget remaining), Insights → "Edit budgets".  
**Key features:**
- List of all categories with current budget.
- Total budget vs. (optional) income.
- Quick +/- adjuster per category.
- "Copy from last month" option.
- Savings target field.

---

### 8. Split Expense Screen
**What:** Mark an expense as split, record participants, calculate my share.  
**Why:** Shared meals, rent, group travel are very common. Currently there's no way to record "I paid ₹4,200 but owe ₹0 — split 3 ways."  
**Entry points:** Add screen → "Split" toggle, Detail screen → "Split".  
**Key features:**
- "I paid" / "We split" toggle.
- Participant count or named participants.
- Equal split or custom amounts.
- Shows "my share" as the recorded expense amount.
- Optional note with who owes what.

---

### 9. Recurring Expense Manager
**What:** A screen that shows and manages all recurring expenses (the `recurring = 1` flag).  
**Why:** The recurring toggle exists in Add but there's no view of all recurring expenses, no auto-creation of next month's occurrence, no calendar showing upcoming debits.  
**Entry points:** Home → "Recurring" card (new), Insights → "Upcoming".  
**Key features:**
- List of recurring expenses with next expected date.
- "Auto-log" toggle per item.
- Calendar view: dots on upcoming dates.
- Mark as paid (for manual recurring items).

---

## P2 — Medium Priority

### 10. Undo/Snackbar System
**What:** After any delete action, show a dismissible bottom snackbar with "Undo" instead of (or in addition to) the Alert confirmation dialog.  
**Why:** Alert dialogs are interruptive and slow. An undo snackbar (5-second window) is a more modern, less stressful pattern.

---

### 11. Onboarding — Day 0 Orientation Screen
**What:** After first setup, a "What to do first" screen.  
**Key features:**
- "Add your first expense" CTA with a sample expense pre-filled.
- "Scan a receipt" CTA with example.
- "Set budgets" CTA (deep-links to Budget Setup).
- Skip option.
- Visual: animated receipt scan or expense log.

---

### 12. Notification Center / Activity Feed
**What:** A chronological feed of app-generated insights and alerts.  
**Why:** Price Watch, streak, over-budget alerts, subscription renewals — all currently have no persistent record. Users miss them if they don't check the app at the right moment.  
**Entry points:** Bell icon in Home header.  
**Key features:**
- "🔥 5-day streak!" 
- "⚠️ Groceries 85% of budget"
- "🥬 Tomato price up 23%"
- "🔄 Spotify renews in 3 days"
- Tap each → navigates to relevant screen.
- Mark as read / clear all.

---

### 13. Batch Select & Action Screen
**What:** Multi-select mode on AllExpenses for bulk recategorise, bulk delete.  
**Entry:** Long-press any expense row → select mode activates.  
**Key features:**
- Checkboxes appear on all rows.
- Bottom action bar: "Recategorise (3)" | "Delete (3)" | "Cancel".
- Confirmation dialog for destructive actions.
- Select all / Deselect all header button.

---

### 14. Net Worth Breakdown Screen (expand existing)
**What:** Current NetWorth screen exists — expand with a chart and breakdown.  
**Key features:**
- Assets vs. liabilities donut chart.
- Month-over-month net worth line chart.
- Account list with balance bars.
- "Add account" inline.
- Projected net worth based on current savings rate.

---

### 15. Trip Expense Detail Screen
**What:** A screen that shows all expenses tagged to a specific trip.  
**Why:** Travel screen shows trips but clicking a trip doesn't show trip-specific expenses (they're not tagged at all).  
**Entry:** Travel → tap a trip → TripDetail.  
**Key features:**
- Total spent on trip vs. trip budget (if set).
- Expenses list (currently none — requires tagging expenses to trips).
- Daily breakdown.
- Currency converter for foreign trips (offline rates).

---

## P3 — Future / Delight

### 16. Price Alert Setup Screen
Allow users to set threshold alerts for tracked items ("Alert me if tomatoes exceed ₹80/kg").

### 17. Mood Analytics Screen
Aggregate mood data across expenses to surface patterns: "You regret 60% of Food Delivery purchases."

### 18. Carbon Footprint Dashboard
Currently CO₂ is logged per expense but never aggregated. A dashboard showing monthly carbon vs. a personal target.

### 19. Template / Quick-Entry Shortcuts
User-defined quick entries: "Rent" (₹28,000, first of month, Housing), "Daily metro" (₹50, Transport). One-tap to log.

### 20. Voice Entry Screen
"Spent 200 on tea at CCD" — parsed via on-device NLP. Tap the mic in the Capture tab.

---

## Screen Count Summary

| Priority | Count | Screens |
|---|---|---|
| P0 | 2 | Search, Date Range Picker |
| P1 | 7 | Quick Add Sheet, Merchant Autocomplete, Analytics Detail, Export, Budget Setup, Split Expense, Recurring Manager |
| P2 | 6 | Undo System, Day-0 Orientation, Notification Center, Batch Select, NetWorth Expansion, Trip Detail |
| P3 | 5 | Price Alerts, Mood Analytics, Carbon Dashboard, Templates, Voice Entry |
| **Total** | **20** | |

Existing screens: 18  
After P0+P1 additions: 27 logical screens (some are UI patterns, not full screens)
