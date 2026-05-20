# Feature Inventory — Drift Expense Manager
> Generated: 2026-05-17 | Source: full codebase inspection

---

## 1. Fully Implemented Features

### Core Expense Tracking

| Feature | Screen(s) | DB Tables |
|---|---|---|
| Quick expense entry (amount + merchant + category) | Add.js | expenses |
| Detailed expense entry (line items with qty/unit/rate) | Add.js, ItemRows.js | expenses, receipt_items |
| Edit existing expense + items | EditExpense.js | expenses, receipt_items |
| Delete expense | Detail.js | expenses (cascade receipt_items) |
| Expense list with date + category | AllExpenses.js, Home.js | expenses |
| Expense detail view | Detail.js | expenses, receipt_items |
| Mood tagging per expense | Add.js, EditExpense.js | expenses.mood |
| Recurring expense flag | Add.js | expenses.recurring |
| Category assignment per expense | Add.js | expenses.category_id |

### OCR Receipt Scanning

| Feature | File(s) | Notes |
|---|---|---|
| On-device ML Kit text recognition | textRecognition.js | 100% offline |
| 10 receipt format detection strategies | detectFormat.js | quick_commerce, food_delivery, online_retail, restaurant, departmental, pharmacy, fuel, transport, utility, handwritten, generic |
| ~50 brand auto-recognition | patterns.js | Blinkit, Zomato, Amazon, DMart, Uber, etc. |
| Item name normalization (qty/unit parsing) | normalizeName.js | Handles "500ml", "2 x", "half", HSN codes |
| Unit canonicalization | units.js | g→kg, mL→L, etc. |
| Confidence scoring (7 components) | confidence.js | 0–100% with per-field flags |
| Format + confidence display badge | Scan.js | Shows "Quick commerce · ✓ 87%" |
| Manual item edit before saving | Scan.js (ItemEditor modal) | Name, qty, unit, price |
| Add/remove items from scanned receipt | Scan.js | |
| Recompute total from items | Scan.js | |
| Fees & charges extraction | parseReceipt.js | Delivery, packaging, tip |
| Discount extraction | parseReceipt.js | Promo, coupon, cashback |
| Merchant auto-detection | parseReceipt.js | Top-most non-meta line or brand |
| Date auto-detection | parseReceipt.js | DD/MM/YY, Month DD YYYY, etc. |
| GSTIN / order ID extraction | parseReceipt.js | Stored in parsed result (not saved to DB) |

### Budget Categories ("Pots")

| Feature | Screen(s) | Notes |
|---|---|---|
| Create / edit / delete categories | EditPot.js | Name, emoji, budget, color |
| 6 pot colors | theme/index.js | cream, mint, sky, blush, butter, lilac |
| Budget limit per category | EditPot.js, schema.js | categories.budget |
| Monthly spend vs budget per category | Home.js, Trends.js | Computed in AppContext.summary |
| Budget progress bar | Home.js, Trends.js, PotDetail.js | Over-budget turns coral |
| Category drill-down (expense list) | PotDetail.js | |
| Sort order for categories | schema.js | sort_order column; no UI to reorder |

### Trends & Analytics

| Feature | Screen(s) | DB queries |
|---|---|---|
| Monthly spending by category | Trends.js | expenses.summaryByCategory |
| 6-month bar chart (tap to inspect) | Trends.js | expenses.monthlyTrend |
| Month-over-month delta % | Trends.js | Computed in screen |
| Monthly budget forecast (linear extrapolation) | Home.js | Computed in screen |
| Under-budget streak (consecutive days) | Home.js | expenses.streakDays |
| Top price mover widget | Home.js | items.topMover |

### Item Price Tracking

| Feature | Screen(s) | DB queries |
|---|---|---|
| Tracked items list with sparkline | Items.js | items.trackedItems |
| Per-item price history chart | ItemTrend.js | items.priceHistory |
| Per-item consumption chart (week/month/year) | ItemTrend.js | items.consumption |
| Same-quantity comparison | ItemTrend.js | items.sameQtyHistory |
| Min/avg/max price stats | ItemTrend.js | items.stats |
| Price change % (vs last purchase) | Items.js | Computed in repo |
| Item autocomplete suggestions | ItemRows.js | items.suggest |

### Subscriptions

| Feature | Screen(s) | Notes |
|---|---|---|
| Add / edit / delete subscription | EditSub.js | |
| Monthly / yearly / weekly periods | schema.js | subscriptions.period |
| Cancel / reinstate subscription | Subs.js | subscriptions.cancelled |
| Verdict system (keep/cancel/pause) | Subs.js | subscriptions.verdict |
| Monthly cost summary | Subs.js | Computed in screen |
| Next billing date display | Subs.js | subscriptions.next_bill |
| Usage frequency field | EditSub.js | subscriptions.used_freq (free text) |

### Goals

| Feature | Screen(s) | Notes |
|---|---|---|
| Create / edit / delete goal | EditGoal.js | |
| Contribute amount to goal | Goals.js | goals.contribute → saved_amount += amount |
| Progress bar | Goals.js, Trends.js | saved/target |
| ETA field | EditGoal.js | Free text, no auto-calculation |
| Goals preview in Trends | Trends.js | Top 3 goals |

### Net Worth

| Feature | Screen(s) | Notes |
|---|---|---|
| Add asset (bank, investment, property, etc.) | EditAccount.js | accounts.kind = 'asset' |
| Add liability (loan, credit card, etc.) | EditAccount.js | accounts.kind = 'liability' |
| Net worth calculation | NetWorth.js | assets − liabilities, computed in screen |
| Asset/liability list with emoji | NetWorth.js | |
| Net worth mini-widget on Home | Home.js | repos.accounts.netWorth() |

### Travel

| Feature | Screen(s) | Notes |
|---|---|---|
| Create / edit trip | EditTrip.js | Name, destination, dates, budget |
| Per-trip budget | EditTrip.js | trips.budget |
| Home currency + destination currency | EditTrip.js | Manual exchange rate |
| Currency conversion display | Travel.js | budget × dest_rate |
| Per-day budget calculation | Travel.js | budget ÷ trip_length_days |
| Trip category breakdown | EditTrip.js, Travel.js | trip_categories table |
| Next upcoming trip widget on Home | Home.js | repos.trips.next() |
| Days-until countdown | Travel.js, Home.js | |
| Multi-trip switcher | Travel.js | Horizontal pill selector |

### Settings & Profile

| Feature | Screen(s) | Notes |
|---|---|---|
| Name + avatar setup | Onboarding.js, Profile.js | |
| Currency selection | Profile.js | INR, USD, EUR, GBP (constants.js) |
| Dark mode toggle | Profile.js | FT ↔ FTD theme objects |
| Carbon tracking toggle | Profile.js | settings.carbon_tracking |
| Full data reset | Profile.js | Wipes all tables, returns to onboarding |

---

## 2. Incomplete / Stub Features

| Feature | Status | Evidence |
|---|---|---|
| **Carbon tracking** | Stub | All expenses assigned 0.4 kg CO₂ unconditionally; no real emission model; no totals UI |
| **Recurring expenses** | Partial | `recurring` boolean saved; no schedule, no reminder, no WorkManager |
| **Cloud OCR fallback (Gemini)** | Wired in backend, not called from app | `backend/src/routes/upload.js` has full Gemini integration; app has no HTTP client |
| **Receipt image storage** | Partial | `receipt_uri` saved in expenses table; no UI to view stored images; no gallery |
| **Mood analytics** | Partial | Mood emoji saved per expense; shown inline in lists; no mood-based grouping or analytics |
| **Subscription alerts / notifications** | Not implemented | `next_bill` date stored; no push notifications, no local notifications |
| **Goal ETA auto-calculation** | Partial | ETA is a free-text field; no calculation from contribution rate |
| **Subscription verdict actions** | Partial | Verdict (keep/cancel/pause) stored; no automated action (e.g., marking as cancelled) |
| **Trip expense linking** | Not implemented | Trips have budgets and categories, but individual expense records are not linked to a trip |
| **GSTIN / Order ID** | Parsed, not stored | Parsed from receipt in `parseReceipt.js`, returned in result object, never written to DB |
| **Onboarding category setup** | Missing | Onboarding only collects name/avatar; new users see "no categories" state on Home immediately |
| **Category sort reorder** | Partial | `sort_order` column in schema; no drag-to-reorder UI |

---

## 3. Missing Features (Not Present Anywhere)

| Feature | Notes |
|---|---|
| **Global search** | No search bar anywhere — no expense search, no item search |
| **Data export** | No CSV, JSON, or PDF export |
| **Data import** | No import from CSV or backup file |
| **Push / local notifications** | No notification infrastructure at all |
| **Budget period** | Budget is always "this month"; no weekly budget support |
| **Expense notes UI** | `notes` column exists in DB and EditExpense has a field, but Add.js has no notes field |
| **Receipt photo viewer** | Images stored but not viewable |
| **Multi-currency expense entry** | Expenses always in home currency; trip currency conversion not applied to individual expenses |
| **Accounts history / transactions** | NetWorth is a snapshot; no account transaction history |
| **Subscription spending analytics** | Subs list shows monthly cost but not spend-over-time chart |
| **Calendar view** | No date-based calendar visualization |
| **Biometric / PIN lock** | App has no auth layer |
| **iCloud / Google Drive backup** | No cloud backup |
| **Widgets** | No home screen widgets |
| **Sharing** | No expense sharing or report sharing |
| **Dark mode auto (system)** | Dark mode is manual toggle only |
| **Haptics** | No haptic feedback |

---

## 4. Screen-by-Screen Status

| Screen | Status | Missing |
|---|---|---|
| Onboarding | Complete | Category setup step |
| Home | Complete | — |
| Scan | Complete | Cloud OCR fallback trigger |
| Add | Complete | Notes field in quick mode |
| Trends | Complete | More chart types |
| Subs | Complete | Notification on next_bill |
| Detail | Complete | Receipt image viewer |
| PotDetail | Complete | — |
| Goals | Complete | ETA auto-calculation |
| Profile | Complete | Export/import, backup |
| NetWorth | Complete | Account history |
| Travel | Complete | Link trip expenses |
| AllExpenses | Complete | Search/filter |
| Items | Complete | — |
| ItemTrend | Complete | — |
| EditExpense | Complete | — |
| EditPot | Complete | Drag-reorder |
| EditSub | Complete | — |
| EditGoal | Complete | ETA auto-calc |
| EditAccount | Complete | — |
| EditTrip | Complete | — |
