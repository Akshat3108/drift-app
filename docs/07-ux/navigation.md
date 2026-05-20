# Navigation Redesign — Drift

**Date:** 2026-05-17

---

## 1. Current Navigation Problems

### Tab bar (5 items: Home | Scan | + | Trends | Subs)
- **Subs** is a manage-once feature sharing tab space with daily-use screens.
- **+** (Add) navigates as a full tab, destroying context when mid-Trends.
- **Trends** is the only path to Goals, Items, and NetWorth — a single point of failure for discoverability.
- **No Search** at the top level forces users into AllExpenses → manual scroll.

### Stack navigation
- All edit screens (`EditExpense`, `EditPot`, `EditSub`, `EditGoal`, `EditAccount`, `EditTrip`) are pushed onto the stack. They should be modals to allow swipe-dismiss.
- `Add` is a tab navigator child — it should be a presented modal sheet.
- `Scan` works as a tab but its internal stage management (`idle → scanning → review → saved`) could benefit from being a full-screen presented modal during the scan/review phase.

---

## 2. Proposed Tab Bar

```
┌────────┬────────┬────────┬────────┬────────┐
│  Home  │ Capture│  ////  │Insights│   You  │
│  🏠    │  📷    │  [+]   │  📊    │  👤    │
└────────┴────────┴────────┴────────┴────────┘
```

| Tab | Old name | Rationale |
|---|---|---|
| Home | Home | Unchanged. Dashboard + glanceable budget. |
| Capture | Scan | Renamed to signal it contains both Scan and Add. Camera icon is retained. |
| + | Add | Remains a floating coral button, but now opens as a **presented modal sheet** (not a tab screen). |
| Insights | Trends | Renamed for clarity. Contains: spending by category, monthly chart, goals, net worth, forecasts. |
| You | Profile | New name encompasses Profile + Subs + Settings. |

### Why this works
- "Capture" sets the right expectation: receipt scan, manual add, voice note (future).
- "Insights" is immediately understood as analytics/data.
- "You" is common in fintech (Monzo, Revolut, Fi) and signals personal settings + account management.
- Subs moves under "You" — aligns with its usage pattern (manage-rarely).
- Goals move under "Insights" — they're targets derived from spending data.

---

## 3. Modal Sheet Presentation

All of the following should be `presentation: 'formSheet'` or `presentation: 'modal'` in the stack:

```js
// navigation/index.js proposed changes
<Stack.Screen name="Add"         component={AddScreen}    options={{ presentation: 'modal', headerShown: false }}/>
<Stack.Screen name="EditExpense" component={EditExpense}  options={{ presentation: 'formSheet', title: 'Edit expense' }}/>
<Stack.Screen name="EditPot"     component={EditPot}      options={{ presentation: 'formSheet', title: 'Categories' }}/>
<Stack.Screen name="EditSub"     component={EditSub}      options={{ presentation: 'formSheet', title: 'Subscription' }}/>
<Stack.Screen name="EditGoal"    component={EditGoal}     options={{ presentation: 'formSheet', title: 'Goal' }}/>
<Stack.Screen name="EditAccount" component={EditAccount}  options={{ presentation: 'formSheet', title: 'Account' }}/>
<Stack.Screen name="EditTrip"    component={EditTrip}     options={{ presentation: 'formSheet', title: 'Trip' }}/>
```

Benefits:
- Swipe-down to dismiss replaces the need for a Cancel button in the header.
- Context behind the sheet is preserved (user can see Trends through the modal backdrop).
- iOS native affordance users already expect.

---

## 4. New Proposed Full Navigation Structure

```
NavigationContainer
└── Stack.Navigator (root)
    ├── Tabs (headerShown: false)
    │   ├── Home
    │   ├── Capture (Scan screen — also exposes Add FAB)
    │   ├── Insights (ex-Trends + Goals + NetWorth)
    │   └── You (ex-Profile + Subs)
    │
    ├── [MODAL] Add              ← presented over Tabs
    ├── [MODAL] EditExpense
    ├── [MODAL] EditPot
    ├── [MODAL] EditSub
    ├── [MODAL] EditGoal
    ├── [MODAL] EditAccount
    ├── [MODAL] EditTrip
    │
    ├── [PUSH] Detail            ← pushes, has back nav
    ├── [PUSH] PotDetail
    ├── [PUSH] Goals             ← or absorb into Insights tab
    ├── [PUSH] NetWorth          ← or absorb into Insights tab
    ├── [PUSH] Travel
    ├── [PUSH] AllExpenses       ← now with search
    ├── [PUSH] Items
    └── [PUSH] ItemTrend
```

---

## 5. Search Navigation

**New screen: `Search`** — accessible via:
1. Search icon in the top-right of Home and Insights headers.
2. A search input pinned at the top of AllExpenses.
3. Keyboard shortcut ⌘F (hardware keyboard).

Search screen behavior:
- Defaults to transaction search (by merchant, category, amount, date range).
- Secondary tabs: Items / Subscriptions.
- Results grouped by match type: Merchant matches → Category matches → Item matches.
- Recent searches persisted in SQLite (`settings` table, JSON blob).

---

## 6. Gestures

| Gesture | Target | Action |
|---|---|---|
| Swipe left | AllExpenses row | Quick-delete (with undo toast) |
| Swipe right | AllExpenses row | Quick-edit (opens EditExpense modal) |
| Swipe left | Subs row | Cancel subscription (with confirm) |
| Swipe down | Any modal/sheet | Dismiss |
| Long press | Expense row | Select mode (for batch operations) |
| Long press | Pot card | Edit pot (shortcut to EditPot) |
| Double-tap | Amount on Add | Focus merchant field (skip numpad re-entry) |
| Pull-to-refresh | Home, AllExpenses | Reload from SQLite |

---

## 7. Keyboard Navigation (Tablet / Foldable)

For users on iPad or Android tablet with Bluetooth keyboard:

| Shortcut | Action |
|---|---|
| ⌘N | Open Add modal |
| ⌘F | Open Search |
| ⌘1–4 | Switch to tab 1–4 |
| ⌘S | Save (in Add, Edit screens) |
| ⌘⌫ | Delete selected expense |
| Esc | Dismiss modal / go back |
| Tab | Next field in forms |

These map to React Native's `KeyboardAvoidingView` + `Keyboard.addListener` + `AccessibilityInfo`.

---

## 8. Back Navigation Conventions

| Screen | Back destination | Method |
|---|---|---|
| Detail | AllExpenses or Home (whichever pushed it) | Native back |
| PotDetail | Home or Trends | Native back |
| EditExpense | Detail | Native back (modal dismiss) |
| Scan review → save | Home | `navigation.navigate('Home')` (existing, correct) |
| Add → save | Previous tab | `navigation.goBack()` (modal dismiss) |
| ItemTrend | Items | Native back |
| AllExpenses | Trends or Home | Native back |

Rule: **Never use `navigate` to go back to a specific screen when `goBack()` will do.** Currently Scan uses `navigation.navigate('Home')` which is correct for its use case (resetting scan state), but EditExpense should use `goBack()`.

---

## 9. Header Actions

Proposed standard header layout for key screens:

**Home header:**
```
[Drift logo / month selector] ··················· [🔍 Search] [Avatar]
```

**Insights header:**
```
[Insights]  ················· [📅 Date range picker] [🔍 Search]
```

**AllExpenses header:**
```
[← Back]  ······ [Search bar (inline)] ·········· [⚙ Filter]
```

**Add header:**
```
[Cancel]  ················· [Add a spend] ············· (no Save — move to bottom CTA)
```

---

## 10. Navigation Anti-Patterns to Fix

| Anti-pattern | Location | Fix |
|---|---|---|
| `Alert.alert` for success after Scan save | Scan.js:135 | Replace with toast + auto-navigate |
| Navigating to Home from Scan (loses stack context) | Scan.js:138 | `navigation.goBack()` after modal dismiss |
| Add as a tab (destroys background tab state) | navigation/index.js | Present Add as `presentation: 'modal'` |
| Items entry point in Profile (semantic mismatch) | Profile.js:121 | Move Items entry to Insights tab |
| Long-press for edit on Subs (hidden affordance) | Subs.js:23 | Add explicit Edit button or swipe action |
| Alert for sub cancel confirmation | Subs.js:14 | Use inline confirm panel (less disruptive) |
