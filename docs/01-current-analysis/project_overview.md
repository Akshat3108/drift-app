# Project Overview — Drift Expense Manager
> Generated: 2026-05-17 | Auditor: Senior Android Architect Pass

---

## 1. High-Level Architecture Overview

Drift is a **three-layer monorepo** with only one layer that currently constitutes the real product:

```
ExpenseManager/
├── app/          ← React Native / Expo (THE product — fully offline, standalone)
├── backend/      ← Express + PostgreSQL (disconnected from app, serves only frontend)
└── frontend/     ← React/Vite web dashboard (calls backend, separate product)
```

**Critical finding**: The mobile app (`/app`) and the backend (`/backend`) are **architecturally disconnected**. The app makes zero HTTP calls. All data lives in a local SQLite database on the device. The backend was presumably built in an earlier (or parallel) phase and targets the web frontend only.

---

## 2. Module Dependency Map

```
App Entry
  App.js
    └── AppProvider (hooks/useAppState.js)      ← global state + all repos
          ├── db/index.js (getDB, exec, all, one)
          │     └── db/schema.js (SQLite DDL)
          ├── db/repo/profile.js
          ├── db/repo/settings.js
          ├── db/repo/categories.js
          ├── db/repo/expenses.js
          ├── db/repo/items.js
          ├── db/repo/subs.js
          ├── db/repo/goals.js
          ├── db/repo/accounts.js
          ├── db/repo/trips.js
          ├── data/constants.js (CURRENCIES, AVATAR_CHOICES)
          └── theme/index.js (FT, FTD, palette, potBg)
    └── navigation/index.js
          └── screens/* (21 screens, all consume AppContext)
    └── screens/Onboarding.js (pre-navigation, profile creation)

OCR subsystem (used by Scan.js, Add.js, EditExpense.js)
  ocr/textRecognition.js
    └── @react-native-ml-kit/text-recognition
  ocr/parseReceipt.js
    ├── ocr/textRecognition.js (extractLines)
    ├── ocr/detectFormat.js
    │     └── ocr/patterns.js (FORMAT_SIGNATURES, KNOWN_BRANDS)
    ├── ocr/normalizeName.js
    │     └── ocr/units.js (parseUnitToken)
    ├── ocr/confidence.js
    ├── ocr/patterns.js
    ├── ocr/produceList.js
    └── ocr/units.js (toCanonical)

Backend (standalone, not called by app)
  backend/src/index.js
    ├── routes/auth.js (register, login — JWT)
    ├── routes/expenses.js
    ├── routes/categories.js
    ├── routes/subscriptions.js
    ├── routes/goals.js
    ├── routes/settings.js
    └── routes/upload.js (Gemini cloud OCR, optional)
          └── db/pool.js → PostgreSQL

Frontend (web, separate)
  frontend/src/App.jsx
    ├── api.js (axios calls to backend)
    └── screens/* (9 screens, localStorage state)
```

---

## 3. Tech Stack

### Mobile App (`/app`)

| Layer | Technology | Version |
|---|---|---|
| Framework | React Native + Expo | RN 0.81.5 / Expo ~54 |
| Language | JavaScript (ES modules) | — no TypeScript |
| UI primitives | React Native built-ins only | No UI library |
| Navigation | React Navigation v7 | Bottom tabs + native stack |
| Database | expo-sqlite (SQLite on-device) | ~16.0.10 |
| OCR | @react-native-ml-kit/text-recognition | ^1.5.2 |
| State | React Context API | useState / useCallback |
| Animation | react-native-reanimated | ~4.1.1 |
| Gestures | react-native-gesture-handler | ~2.28.0 |
| JS Engine | Hermes | (enabled) |
| Camera/Gallery | expo-image-picker | ~17.0.11 |
| File system | expo-file-system | ~19.0.22 |

### Backend (`/backend`)

| Layer | Technology |
|---|---|
| Runtime | Node.js / Express 5 |
| Database | PostgreSQL (via `pg`) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File upload | multer |
| Cloud OCR | Gemini 2.5 Flash (optional) |
| Security | helmet, cors |

### Web Frontend (`/frontend`)

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Routing | react-router-dom v7 |
| HTTP | axios |
| State | Custom hook + localStorage |

---

## 4. Architecture Pattern

### Mobile App
**Context + Repository pattern** — not MVVM in the Android sense.

- **No ViewModels** in the Jetpack sense. `AppProvider` (in `useAppState.js`) is a monolithic context that holds all application state and exposes all mutations.
- **Repository layer**: `db/repo/*.js` files are plain object singletons exposing async CRUD methods over expo-sqlite.
- **No dependency injection framework**. Repos are module-level singletons imported directly; AppContext passes `repos: { items, expenses, accounts, trips }` down for ad-hoc queries.
- **No background workers**. No WorkManager equivalent. No push notifications. All computation is synchronous on the JS thread.
- **No Redux / Zustand / MobX**. State is owned exclusively by AppContext.

### Data Flow
```
User action
  → Screen calls mutation (e.g. addExpense)
  → AppContext mutation function
  → Repo.create() → expo-sqlite execAsync/runAsync
  → Re-reads the full list from DB (e.g. expRepo.list({ limit: 500 }))
  → setState() → re-render all Context consumers
```

---

## 5. Navigation Architecture

```
Stack.Navigator (headerless root)
  ├── Tabs (BottomTabNavigator — custom tab bar)
  │   ├── Home
  │   ├── Scan
  │   ├── Add           ← FAB-style floating center button
  │   ├── Trends
  │   └── Subs
  ├── Detail            (expense detail)
  ├── PotDetail         (category drill-down)
  ├── Goals
  ├── Profile
  ├── NetWorth
  ├── Travel
  ├── AllExpenses
  ├── Items             (tracked items list)
  ├── ItemTrend         (per-item price/consumption chart)
  ├── EditExpense
  ├── EditPot           (manage categories)
  ├── EditSub
  ├── EditGoal
  ├── EditAccount
  └── EditTrip
```

Total: **5 tab screens + 14 stack screens = 19 navigable screens** (+ Onboarding shown before navigation mounts).

Custom `CustomTabBar` component renders emoji + label with a coral FAB button for Add. Safe-area insets handled via `useSafeAreaInsets`.

---

## 6. Database

### Mobile — SQLite via expo-sqlite

**File**: `drift.db` (on-device, private app storage)

| Table | PK | Rows/use |
|---|---|---|
| `profile` | INTEGER (singleton id=1) | 1 row, name + avatar |
| `settings` | INTEGER (singleton id=1) | 1 row, currency/dark_mode/carbon_tracking |
| `categories` | AUTOINCREMENT | Budget pots |
| `expenses` | AUTOINCREMENT | All transactions |
| `receipt_items` | AUTOINCREMENT | OCR line items per expense |
| `subscriptions` | AUTOINCREMENT | Recurring bills |
| `goals` | AUTOINCREMENT | Savings targets |
| `accounts` | AUTOINCREMENT | Asset/liability entries |
| `trips` | AUTOINCREMENT | Travel budgets |
| `trip_categories` | AUTOINCREMENT | Per-trip spending breakdown |

**Indexes**:
- `idx_expenses_date` on `expenses(expense_date DESC)` — date-sorted lists
- `idx_expenses_category` on `expenses(category_id)` — category filter
- `idx_items_name_date` on `receipt_items(normalized_name, purchase_date)` — item price lookup
- `idx_items_kind_date` on `receipt_items(kind, purchase_date)` — kind filter

**Foreign keys**: Enabled via `PRAGMA foreign_keys = ON`. Expenses cascade-null on category delete. Receipt items cascade-delete on expense delete. Trip categories cascade-delete on trip delete.

**Notable schema design**:
- `receipt_items` stores both raw (`qty`, `unit`) and canonical (`canonical_qty`, `canonical_unit`) quantities for unit-normalized price comparisons
- `expenses.mood` is a free-text emoji field
- `expenses.carbon` is a REAL but always set to 0 or 0.4 (stub)
- `subscriptions.verdict` has values 'keep'/'cancel'/'pause' but is not enforced via CHECK constraint

### Backend — PostgreSQL

The backend DB schema (in `migrate.js`) is a **completely different design**:
- Uses UUIDs (not INTEGER autoincrement)
- Has `user_id` foreign keys on every table (multi-user)
- `receipt_items` is much simpler — only `name`, `qty` (TEXT!), `price` — no canonical units, no normalized_name
- Missing tables that the app has: `accounts`, `trips`, `trip_categories`
- Settings has `updated_at` but no `carbon_tracking`

**These schemas are not compatible.** A sync/migration path does not exist today.

---

## 7. OCR Pipeline

```
expo-image-picker (camera or gallery)
    ↓  image URI
textRecognition.js → recognize(uri)
    ↓  ML Kit result (blocks → lines with frame data)
textRecognition.js → extractLines(result)
    ↓  [{text, x, y, width, height}]
parseReceipt.js → mergeIntoRows(lines)
    ↓  logical rows merged by Y-overlap (handles two-column layouts)
detectFormat.js → detectFormat(rows)
    ↓  format: quick_commerce | food_delivery | online_retail | restaurant
        | departmental | pharmacy | fuel | transport | utility | handwritten | generic
        + brand: "Blinkit" | "Zomato" | "Amazon" | ... (50 brands)
        + formatConfidence: 0..1
        + config: {itemStrategy, totalPriority, subtotalPriority, feeWhitelist}
parseReceipt.js → extractBillTotals(rows, config)
    ↓  {total, subtotal, tax, fees[], discounts[], totalY}
parseReceipt.js → findBillBands(rows, totalY)
    ↓  {itemBandTop, itemBandBottom}  ← defines the item extraction zone
parseReceipt.js → dispatchItems(strategy, rows, bands)
    ├── extractItemsCard()     — quick-commerce: name/qty/price on adjacent lines
    ├── extractItemsTabular()  — restaurant/retail: name qty rate total in columns
    ├── extractItemsPermissive() — handwritten: loose numeric matching
    └── extractItemsTotalsOnly() — fuel/transport: no items, totals only
    ↓  items[]
normalizeName.js → normalizeName(nameText)
    ↓  {display_name, normalized_name, qty, unit}
units.js → toCanonical(qty, unit)
    ↓  {canonical_qty, canonical_unit}  (e.g. 500g → 0.5 kg)
confidence.js → scoreConfidence(parsed)
    ↓  {overall: 0..1, label: 'low'|'medium'|'high', components{}, flags{}}
```

**Item extraction strategies**:
- `card` — used for quick commerce, food delivery. Scans rows in item band; finds price tokens; looks backward for name if ambiguous.
- `tabular` — used for restaurants, retail. Derives qty from `qty × rate = total` when multiple amounts appear on one line.
- `permissive` — handwritten bills. Accepts any line with a numeric token + alphabetic word.
- `totals-only` — fuel, transport. Extracts no items; surfaces the total amount only.

**Confidence scoring** (7 weighted components):
| Component | Weight |
|---|---|
| currency detected | 10% |
| date parsed | 10% |
| merchant identified | 10% |
| format confidence | 10% |
| ≥1 item extracted | 20% |
| total > 0 | 20% |
| sum(items+fees+tax−discounts) ≈ total (±7%) | 20% |

Score ≥0.85 = high, ≥0.60 = medium, <0.60 = low.

---

## 8. State Management

```
AppContext (AppProvider in useAppState.js)
  State atoms:
    ready, profile, settings, categories, expenses[],
    subs[], goals[], accounts[], trips[]

  Derived (useMemo):
    summary → { pots[], totalSpend, monthBudget }
    F → theme object (FT or FTD based on dark_mode)
    sym → currency symbol

  Exposed mutations (30+):
    createProfile, updateProfile
    setSetting
    addCategory, updateCategory, removeCategory
    addExpense, updateExpense, removeExpense
    addExpenseWithItems, updateExpenseWithItems
    addSub, updateSub, cancelSub, reinstateSub, removeSub
    addGoal, updateGoal, contributeGoal, removeGoal
    addAccount, updateAccount, removeAccount
    addTrip, updateTrip, removeTrip
    resetApp, refresh

  Exposed repos (for ad-hoc screen queries):
    repos.items, repos.expenses, repos.accounts, repos.trips
```

**Refresh strategy**: Every mutation does a full re-read of the affected list from SQLite and calls setState. No optimistic updates. No cache invalidation — data is always fresh from DB.

**Startup sequence**:
1. `getDB()` — opens drift.db, runs SCHEMA (idempotent CREATE IF NOT EXISTS)
2. `refresh()` — parallel fetch of all 9 entities
3. `setReady(true)` — renders navigation or onboarding

---

## 9. Repository Layer

| Repo | Key methods |
|---|---|
| `expenses` | list(limit/offset/categoryId/month), get, create, update, remove, createWithItems, summaryByCategory, monthlyTrend(months), streakDays |
| `items` | listByExpense, trackedItems(kind), priceHistory, consumption(bucket/range), stats, sameQtyHistory, suggest(prefix), replaceItems, topMover |
| `categories` | list, get, create, update, remove |
| `accounts` | list, get, create, update, remove, netWorth |
| `trips` | list, listWithCategories, next (upcoming trip), create, update, remove |
| `subs` | list, create, update, cancel, reinstate, remove |
| `goals` | list, create, update, contribute, remove |
| `profile` | get, create, update |
| `settings` | get, set (partial patch) |

Notable: `items.trackedItems()` runs N+1 subqueries — one per unique item to get the last 8 price history points for sparklines.

---

## 10. UI Framework

No third-party UI library. The app is built entirely on React Native primitives (`View`, `Text`, `TouchableOpacity`, `ScrollView`, `TextInput`, `Modal`, `ActivityIndicator`).

**Theme system** (`theme/index.js`):
- `FT` — light theme (warm cream/coral palette)
- `FTD` — dark theme (dark brown/coral palette)
- Both are plain JavaScript objects with ~20 color tokens
- `palette(F)` — 7-color array for chart category coloring
- `potBg(F, color)` — maps category color name to theme token

**Custom components** (`components/UI.js`):
- `ProgressBar` — budget progress bar
- `Toggle` — on/off switch
- `MoodPicker` — horizontal emoji selector

**Custom components** (`components/ItemRows.js`):
- `ItemRows` — item entry table with autocomplete suggestions, unit picker, rate×qty=total auto-calc

---

## 11. Android Build (Gradle)

```
Namespace:    com.drift.expensemanager
Application:  com.drift.expensemanager
versionCode:  1
versionName:  1.0.0
minSdkVersion: from rootProject.ext (Expo default ~24)
targetSdkVersion: from rootProject.ext
JS Engine:    Hermes (enabled)
Bundler:      Expo CLI / Metro
```

**Permissions declared in AndroidManifest.xml**:
- `CAMERA` — needed for image picker
- `INTERNET` — needed for Expo tooling / potential future network calls
- `READ_EXTERNAL_STORAGE` — gallery access
- `WRITE_EXTERNAL_STORAGE` — legacy; deprecated on API 29+
- `RECORD_AUDIO` — unclear why (not used in any JS code)
- `SYSTEM_ALERT_WINDOW` — likely pulled in by Expo dev tools, not needed for production
- `VIBRATE` — possibly pulled in by gesture handler

**Release build issues**:
- `minifyEnabled = false` — release APK is not minified/shrunk
- `signingConfig = signingConfigs.debug` in the release block — release builds are signed with the debug keystore

**Build flavors**: None defined. Single variant.

**Expo Updates**: Disabled (`expo.modules.updates.ENABLED = false`).

---

## 12. Third-Party Libraries Summary

### App — Production
| Library | Purpose | Note |
|---|---|---|
| `expo` ~54 | Expo SDK umbrella | |
| `expo-sqlite` | On-device SQLite | Core data store |
| `expo-image-picker` | Camera + gallery | |
| `expo-camera` | Camera | Installed, not directly used in JS |
| `expo-file-system` | File ops | Used for receipt URI? |
| `@react-native-ml-kit/text-recognition` | On-device OCR | Core OCR engine |
| `@react-navigation/*` (3 pkgs) | Navigation | v7 |
| `react-native-gesture-handler` | Gesture support | Required by nav |
| `react-native-reanimated` | Animations | ~4.1.1 |
| `react-native-safe-area-context` | Safe areas | |
| `react-native-screens` | Native screens | |
| `@react-native-async-storage/async-storage` | Key-value storage | **Installed but unused** |

### Backend — Production
| Library | Purpose |
|---|---|
| `express` v5 | HTTP server |
| `pg` | PostgreSQL client |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | JWT auth |
| `multer` v2 | File uploads |
| `helmet` | Security headers |
| `cors` | CORS |
| `uuid` | UUID generation |
| `dotenv` | Env vars |
