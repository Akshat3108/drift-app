# UX Audit — Drift

**Date:** 2026-05-17  
**Auditor role:** Senior mobile UX architect, fintech power-user focus  
**Scope:** All 18 screens, navigation stack, data entry flows, OCR, analytics, accessibility

---

## 1. Executive Summary

Drift is a well-designed personal finance app with a strong visual identity (Flow/botanical aesthetic, coral accent, cream surfaces). The UX is friendly and low-friction for casual users. The primary gap is **power-user depth**: users who log 3–5 expenses/day, scan 10+ receipts/week, or manage complex budgets hit friction walls — no search, no keyboard shortcuts, no batch operations, no date-range filtering, no split-expense workflow, and analytics buried behind two taps.

**Overall UX score: 6.8 / 10**  
Aesthetic: 9/10 · Entry speed: 7/10 · Analytics: 5/10 · Power-user: 4/10 · Accessibility: 5/10

---

## 2. Navigation

### 2.1 Current Tab Structure
```
Home | Scan | [+] | Trends | Subs
```

**Issues:**
- **Subs as a primary tab** — Subscriptions are a manage-once, review-rarely feature. It occupies the same prime real estate as daily-use Home and Scan. Most sessions don't visit it.
- **No Search tab** — Every power-user app has search at the top level. AllExpenses exists but has no search input — it's just a category filter.
- **Trends is undiscoverable** — the tab label "Trends" is vague. Users expect "Analytics" or "Insights" with a chart icon, not a bar chart emoji.
- **Add button UX** — The floating coral `+` button in the center tab is good, but tapping it replaces the screen context (navigates away from Trends mid-analysis). Should open as a modal sheet instead.
- **No back-gesture affordance** — Stack screens lack a visible back button on Scan (which has its own top bar without native header).

### 2.2 Deep Link Gaps
- Profile is accessible only from the Home header avatar. No tab, no shortcut.
- Goals are reachable from Trends but not from the tab bar or Home directly.
- NetWorth and Travel are Home-card-only — discoverable only if user scrolls Home.
- Items/ItemTrend is buried in Profile → Tracked items AND Trends → Track items (two inconsistent entry points).

### 2.3 Modal vs Push
- Add screen navigates as a tab — pressing Add loses current tab context. Should be `presentation: 'modal'` sheet.
- ItemEditor inside Scan is correctly a bottom-sheet modal. ✓
- EditExpense, EditPot, EditSub, EditGoal, EditAccount, EditTrip all push. These should be bottom-sheet modals for faster dismiss (swipe down).

---

## 3. Information Architecture

### 3.1 Current IA

```
App
├── Home (dashboard)
│   ├── → NetWorth
│   ├── → Travel
│   ├── → PotDetail (×N)
│   └── → AllExpenses → Detail → EditExpense
├── Scan (OCR entry)
├── Add (manual entry)
├── Trends (analytics)
│   ├── → PotDetail
│   ├── → AllExpenses
│   ├── → Items → ItemTrend
│   └── → Goals
├── Subs
│   └── → EditSub
└── Profile (settings)
    ├── → Items
    └── → EditPot
```

**Problems:**
- **Goals accessible from Trends only** — goals are a core financial feature, not a trend sub-feature.
- **Items accessible from Profile AND Trends** — inconsistent. Items is a data feature, not a settings feature.
- **NetWorth not in Trends** — net worth is the most analytical metric; it should live in the analytics tab.
- **Travel not integrated with expenses** — trips are tracked but expenses can't be tagged to a trip; the data is siloed.
- **"Manage categories" in Profile** — categories are a core budget feature, better managed from Trends/Budgets context.

### 3.2 Recommended IA

```
App
├── Home (glanceable snapshot: budget remaining, pots, recent)
├── Capture (Scan + Add, unified)
├── Transactions (AllExpenses with search, date range, multi-filter)
├── Analytics (Trends + Goals + NetWorth + Forecasts)
└── You (Profile + Settings + Subs + Data management)
```

---

## 4. Expense Entry Speed

### 4.1 Quick Add
**Good:** Custom numpad is fast. Amount-first paradigm matches "I just spent X" mental model.  
**Issues:**
- Merchant field is a free-text input with no autocomplete/history. Users re-type "Zepto" 30 times.
- Category picker is a horizontal scroll — if user has 8+ categories, the right ones are off-screen.
- No date field in Quick mode — defaults to today, no way to log yesterday's cash expense quickly.
- No notes field — user can't tag "work lunch" or "split with Raj" without opening Detailed mode.
- Mood picker adds cognitive load on every entry. Should be optional/collapsible.
- Recurring toggle is a card that occupies 40% of screen width — disproportionate for a rarely-used option.
- No "duplicate last" or template shortcut.

### 4.2 Detailed Mode
**Good:** Auto-total from item rows is excellent.  
**Issues:**
- ItemRows component doesn't support reordering.
- No barcode scan for item identification.
- No unit price calculator on the input itself (Scan has this; Add/Detailed doesn't).
- Category selection duplicated from Quick mode with identical scroll-chip UI.

### 4.3 Time to First Entry (TTFE)
Measured flows:
- New user, no categories: BLOCKED (must set up categories first, app shows error).
- Existing user, Quick mode: ~8 taps to log a simple expense (open → amount → merchant → category → mood → save).
- Target for power user: 4 taps (amount → merchant → category → save, skip mood).

**Verdict:** TTFE is acceptable but has no fast lane for repeat merchants.

---

## 5. OCR / Scan UX

### 5.1 What works
- Idle state with dashed coral border and camera emoji is visually clear.
- Confidence badge (high/medium/low) + format label is excellent — tells user what happened.
- ItemEditor bottom sheet is clean; unit selection horizontal scroll is adequate.
- "Retake" + "Save" split button is correct primary/secondary hierarchy.

### 5.2 Issues

**Flow:**
- After scan: always lands on review screen even for high-confidence scans. For 90%+ confidence, auto-populate and show a "looks good?" nudge instead of forcing full review.
- No progress indicator during OCR beyond spinner — long receipts (30+ items) feel stuck.
- Date field in review is a free-text `YYYY-MM-DD` input. Non-engineers won't type ISO dates — needs a date picker.
- Category auto-selection logic (`pots.find(/grocer/i)`) is the same for both produce and non-produce paths (code bug + UX gap).
- No way to mark which items were already at home (partial purchase correction).

**Item list:**
- Items show `🥬` or `🛒` only — no visual diff for high-confidence vs manually-corrected items.
- Delete item requires entering ItemEditor, tapping Delete — two taps. Should support swipe-to-delete.
- Recompute total is a small text link — easily missed. Should update live as items are edited.
- No merge/split item lines.

**Post-save:**
- Alert("Saved!") dialog is interruptive. Should be an inline toast that auto-dismisses and returns to Home.
- After save, Scan screen resets to idle — correct. But user loses context of what was just saved if they want to verify.

### 5.3 Error Recovery
- "Scan failed" screen has only "Try again" — no fallback to manual entry from that screen. User must navigate to Add tab.
- No way to submit OCR feedback or flag a bad parse.

---

## 6. Search UX

**Current state: No search exists anywhere in the app.**

AllExpenses offers category filter pills and date-group display. There is no:
- Text search by merchant name
- Search by amount or amount range
- Search by date range (only current month loads)
- Tag/note search
- Multi-category filter (AND/OR)
- Sort control (by date, amount, category)

This is a critical gap. A user asking "how much did I spend at Blinkit this year?" has no answer path.

---

## 7. Dashboard Usability (Home)

### 7.1 What works
- Budget remaining in large type is the right primary metric.
- Pots grid (2-column, pastel backgrounds) is scannable and visually warm.
- Streak card is motivating.
- Price Watch / Top Mover card is delightful and unexpected.
- Forecast card ("trending lighter") is useful and non-alarming.

### 7.2 Issues
- **No pull-to-refresh** — data loads once on mount; if user adds expense from another session it's stale until full restart.
- **Recent list shows 5 items max** — no indication of how many total this month until user taps "View all."
- **Pots grid has no "add category" quick action** — new users with empty pots see just an empty message.
- **No month selector** — Home is locked to current month. Users can't glance at last month.
- **Budget remaining vs. spent toggle** — shows "left to spend" if budget set, "spent" if not. Switching between these modes on the same screen when budget is added later is disorienting.
- **Hello + italic name greeting** — charming on first use, feels childish after 30 days of daily use. Should either deepen (show a contextual greeting: "Weekend spending" on Saturday) or be removable.
- **Net Worth card shows "Set up →"** — this is a cold dead end in the card. Tapping it navigates to NetWorth which itself is empty. Should deep-link to account setup.
- **Travel card shows "Plan a trip"** — same problem as above. Should link directly to EditTrip.

---

## 8. Analytics Discoverability

### 8.1 Trends tab
- **"Where it flowed"** — clever title but not immediately understood as "Analytics."
- Only shows current month by default; monthly bar chart only goes 6 months back.
- No category breakdown chart (pie/donut).
- No day-of-week or time-of-day analysis.
- No "biggest single expense this month" callout.
- Goals in Trends — conceptually misplaced; a goal is a savings target, not a spending trend.

### 8.2 Items / Price Watch
- Discoverable from Profile and Trends — double entry, both non-obvious.
- ItemTrend shows a per-item price line chart — excellent feature, nearly invisible.
- No alert/notification system for price spikes.

### 8.3 Subscriptions
- Subscription tab shows total monthly cost and annual equivalent — good.
- "Cancel all" suggestion is aggressive — mass-cancelling subscriptions from a single tap is destructive.
- No subscription renewal date tracking (just period: monthly/yearly).
- No calendar view of upcoming renewal hits.

---

## 9. Accessibility

| Issue | Severity |
|---|---|
| All icons are emoji — no `accessibilityLabel` on any TouchableOpacity | High |
| Color alone distinguishes "over budget" (coral) vs "under" (sage) — no pattern/icon backup | High |
| Text contrast: F.ink3 on F.cream ≈ 3.2:1 (WCAG AA requires 4.5:1 for body text) | High |
| Numpad has no haptic feedback | Medium |
| No minimum touch target enforcement — some pill buttons are ~28px tall | Medium |
| Dark mode colors not audited for WCAG compliance | Medium |
| No screen reader focus order management | Medium |
| Onboarding scrollable categories with inline TextInput — poor screen reader experience | Medium |
| No font-size scaling support (RN fontSize uses hardcoded px values throughout) | Low |

---

## 10. Power-User Workflows

### 10.1 What power users need (and don't have)
- **Merchant autocomplete from history** — the single highest-ROI UX improvement
- **Template/quick-repeat expenses** ("Rent - ₹28,000 on the 1st")
- **Split expense** ("Dinner ₹4,200 — I paid, split 3 ways, I owe ₹0")
- **Bulk recategorise** ("Move all Swiggy to Food instead of Delivery")
- **Date-range reports** ("Q1 2026 spending by category")
- **Export** (CSV, PDF) — zero export capability currently
- **Keyboard shortcut layer** (for tablet/foldable/Bluetooth keyboard users)
- **Widget / home screen glance** — no widget support
- **Recurring expense auto-log** — recurring flag exists but doesn't auto-create the next month's entry
- **Undo** — deleting an expense is permanent with only one confirmation dialog

### 10.2 Batch Operations
No batch operations exist. Cannot:
- Select multiple expenses and delete
- Select multiple expenses and recategorise
- Select multiple subs and cancel
- Mark multiple items as reviewed

### 10.3 Keyboard / Gesture Support
- No hardware keyboard shortcuts
- No swipe-to-delete anywhere (Subs uses long-press → Alert menu)
- No swipe-left on expense row for quick-delete
- No swipe-right for quick-edit or quick-duplicate
- Scan review has no swipe-to-remove on item rows

---

## 11. Filtering

AllExpenses:
- Only category filter
- No date filter (loads current month only — no way to view January from May)
- No amount filter
- No merchant search
- No mood filter
- No recurring filter

Subs:
- No filter by status, price range, or period

---

## 12. Data Density

Home is well-balanced. Trends is sparse — a lot of vertical whitespace between section cards. AllExpenses is appropriately dense with the grouped-by-day layout. Items list is minimal (just name + price stats) — could show a sparkline per item.

The 2-column pot grid on Home is the right density for ≤6 pots. At 8+ pots it starts to scroll off-screen; a list fallback would help.

---

## 13. Visual Hierarchy

Strong hierarchical use of font size (52px → 28px → 18px → 13px → 11px) with appropriate color stepping (ink → ink2 → ink3). The coral accent is used consistently for CTA and active state. Issues:

- "Save" button in Add screen is a small text link in the header — the primary action on the most-used screen should be a large bottom button, not a top-right text link.
- "View all transactions →" link in Home looks like a secondary action but is actually the most common navigation action.
- Progress bars for pots and goals use the same visual language — good consistency.
- Category color badges in the pots grid use soft pastels that are too similar to each other in low-light conditions.

---

## 14. Onboarding

### What works
- 3-step wizard (profile → preferences → categories) is the correct scope.
- Category budget input inline is smart — avoids a separate setup screen.
- Step dots progress indicator is minimal and correct.

### Issues
- Step 1 asks for name AND avatar — two distinct decisions. Avatar is lower priority; should be moveable to Profile later.
- No explanation of what "pots" are — new users don't know if "pot" means category or savings bucket.
- No skip mechanism for budget input per category.
- No preview of what the home screen will look like.
- After onboarding completes, user lands on Home with empty state — no celebratory moment or "here's what to do next" CTA.
- Category list on Step 3 is not scrollable enough — on short screens, the "Get started" button may be hidden by the keyboard.
- No ability to import from bank/UPI history — manual entry only, which may feel like too much work for first-time users.

---

## 15. Summary: Top 10 UX Issues by Priority

| # | Issue | Impact |
|---|---|---|
| 1 | No merchant autocomplete from history | Daily friction, 8+ taps per entry |
| 2 | No search anywhere | Power users have no recall path |
| 3 | No date range filter on AllExpenses | Can't view historical data |
| 4 | "Save" as a header text link on Add screen | Primary CTA is visually weak |
| 5 | Add screen opens as tab instead of modal | Destroys navigation context |
| 6 | Category smart-guess is identical for all item types (code bug) | OCR accuracy regression |
| 7 | No swipe actions on lists | Requires 2–3 taps for delete/edit |
| 8 | Accessibility: no accessibilityLabel on any interactive element | Screen reader users blocked |
| 9 | No undo for delete | Data loss risk |
| 10 | Subs occupies prime tab real estate | Tab bar misaligns with usage frequency |
