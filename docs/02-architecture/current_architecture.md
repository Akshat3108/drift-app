# Current Architecture — Drift (React Native / Expo)

## 1. System Overview

Drift is a fully-offline React Native personal finance app built with Expo. All
data lives in an on-device SQLite database (expo-sqlite). A Node.js/Express
backend exists in the repo but is **not called by the mobile app** — its only
purpose is an optional Gemini-powered cloud OCR fallback that remains dormant
unless manually wired in.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | React Native 0.81 + Expo SDK 54 |
| UI | Custom components — no third-party UI library |
| Navigation | React Navigation 7 (native-stack + bottom-tabs) |
| Persistence | expo-sqlite (SQLite 3) — on-device only |
| State | React Context + useState (single `AppContext`) |
| OCR | @react-native-ml-kit/text-recognition (on-device ML Kit) |
| Backend | Express.js + PostgreSQL (unused by app, cloud OCR scaffold) |

---

## 2. Layer Model (Actual)

```
┌─────────────────────────────────────────────────┐
│                 SCREENS (19 files)              │
│  Home · Add · Scan · Trends · Subs · Goals      │
│  NetWorth · Travel · Items · ItemTrend          │
│  AllExpenses · Detail · PotDetail · Profile     │
│  EditExpense · EditPot · EditSub · EditGoal     │
│  EditAccount · EditTrip · Onboarding            │
├─────────────────────────────────────────────────┤
│           COMPONENTS (2 files)                  │
│  UI.js (primitives)  ·  ItemRows.js (feature)   │
├─────────────────────────────────────────────────┤
│           APP CONTEXT  (1 file — God class)     │
│  useAppState.js / AppProvider                   │
│  - All entity state (8 domain objects)          │
│  - All mutations (30+ operations)               │
│  - Derived state (pots summary, theme, symbol)  │
│  - Repo facade (exposes repos.* to screens)     │
├─────────────────────────────────────────────────┤
│         REPOSITORY LAYER  (db/repo/)            │
│  profile · settings · categories · expenses    │
│  items · subscriptions · goals                  │
│  accounts · trips                               │
├─────────────────────────────────────────────────┤
│         DATABASE LAYER  (db/)                   │
│  index.js (getDB, exec, all, one)               │
│  schema.js (DDL + index definitions)            │
├─────────────────────────────────────────────────┤
│           expo-sqlite  (SQLite 3)               │
└─────────────────────────────────────────────────┘

      ┌──────────────────────────────┐
      │  OCR PIPELINE  (ocr/)        │
      │  textRecognition → parseRe-  │
      │  ceipt → detectFormat →      │
      │  patterns → normalizeName →  │
      │  units → confidence          │
      └──────────────────────────────┘
```

The OCR pipeline is architecturally isolated. Everything else is a single
horizontal slice with no enforced layer boundaries.

---

## 3. Architecture Style

**Actual style**: Flat feature-based monolith with a thin repository layer.

There is no formal Clean Architecture separation. The app approximates:

- **Data layer**: `db/` + `db/repo/` — well-encapsulated SQL access
- **Service/domain layer**: absent — no use cases, no domain entities
- **Presentation layer**: `screens/` + `components/` — contains business logic

The closest named pattern is **Repository + God Context**, not MVVM or MVI.

---

## 4. Navigation Architecture

```
NavigationContainer
  └── Stack.Navigator (native-stack)
        ├── Tabs  (bottom-tab navigator)
        │     ├── Home
        │     ├── Scan
        │     ├── Add
        │     ├── Trends
        │     └── Subs
        ├── Detail
        ├── PotDetail
        ├── Goals
        ├── Profile
        ├── NetWorth
        ├── Travel
        ├── AllExpenses
        ├── Items
        ├── ItemTrend
        ├── EditExpense
        ├── EditPot
        ├── EditSub
        ├── EditGoal
        ├── EditAccount
        └── EditTrip
```

- Two-level: root Stack wrapping a Tab navigator
- All edit/detail screens are pushed onto the root stack
- `CustomTabBar` renders inline in `navigation/index.js` — mixing UI and navigation config
- Navigation consumes `useApp()` for theming, coupling nav layer to app state

---

## 5. State Architecture

### AppProvider — Single Global Context

`useAppState.js` (`AppProvider`) holds all application state in a single React
Context. On any mutation it either triggers `refresh()` (full reload of all 8
entities) or re-fetches only the affected entity list.

```
AppContext.value = {
  // entity state
  profile, settings, categories, expenses (≤500),
  subs, goals, accounts, trips,

  // derived
  pots (categories + this-month spend),
  totalSpend, monthBudget, F (theme), sym (currency symbol),

  // MUTATIONS (30+ operations)
  createProfile, updateProfile, setSetting,
  addCategory, updateCategory, removeCategory,
  addExpense, updateExpense, removeExpense,
  addExpenseWithItems, updateExpenseWithItems,
  addSub, updateSub, cancelSub, reinstateSub, removeSub,
  addGoal, updateGoal, contributeGoal, removeGoal,
  addAccount, updateAccount, removeAccount,
  addTrip, updateTrip, removeTrip,
  resetApp, refresh,

  // REPO BYPASS (breaks encapsulation)
  repos: { items, expenses, accounts, trips }
}
```

Screens that need ad-hoc queries (Home, Trends, ItemTrend, EditExpense) use
`repos.*` directly, bypassing the context abstraction.

### State Update Patterns

| Pattern | Usage |
|---------|-------|
| `refresh()` → reloads all 8 entities | `createProfile`, `updateProfile`, `resetApp` |
| Entity-specific re-fetch | All category/expense/sub/goal/account/trip mutations |
| `setSetting` — two-step: write then re-fetch | Settings only |
| Direct repo call + local useState | Home, Trends, ItemTrend, EditExpense |

---

## 6. Database Architecture

### Schema Summary (10 tables)

```
profile (singleton row — id CHECK id=1)
settings (singleton row — id CHECK id=1)
categories (budget pots)
  └── expenses (FK → categories, ON DELETE SET NULL)
        └── receipt_items (FK → expenses, ON DELETE CASCADE)
subscriptions (independent)
goals (independent)
accounts (asset/liability tracking)
trips
  └── trip_categories (FK → trips, ON DELETE CASCADE)
```

- `PRAGMA foreign_keys = ON` — FK enforcement active
- Indexes on `expenses(expense_date DESC)`, `expenses(category_id)`,
  `receipt_items(normalized_name, purchase_date)`, `receipt_items(kind, purchase_date)`
- No migration system — schema is idempotent `CREATE TABLE IF NOT EXISTS`
- `getDB()` uses a module-level singleton with promise-based double-checked locking

### Repository Objects

Each repo is a plain JavaScript object (not a class) exported as a named const.
All methods are `async`. They use the four primitives in `db/index.js`:
`exec`, `all`, `one`, `getDB`.

---

## 7. OCR Pipeline Architecture

The OCR module is the best-structured subsystem in the codebase. It follows a
pipeline pattern with clear stage separation:

```
textRecognition.js
  recognize(uri)           ← ML Kit on-device OCR
  extractLines(result)     ← normalize bounding-box lines

parseReceipt.js (orchestrator)
  mergeIntoRows()          ← combine same-baseline lines
  detectFormat()           ← classify bill type (10 formats)
  extractBillTotals()      ← find total/subtotal/tax/fees
  findBillBands()          ← spatial item zone clamping
  extractMerchant()        ← store name heuristic
  dispatchItems()          ← strategy dispatch:
    extractItemsCard()       card/quick-commerce layout
    extractItemsTabular()    tabular/restaurant layout
    extractItemsPermissive() handwritten/noisy layout
    extractItemsTotalsOnly() fuel/transport receipts
  scoreConfidence()        ← parse quality score

patterns.js        ← all regex constants + helpers
detectFormat.js    ← format signatures + configs
normalizeName.js   ← produce/grocery name normalization
units.js           ← unit parsing + canonical conversion
confidence.js      ← confidence scoring model
produceList.js     ← known produce names set
```

The pipeline result shape mirrors the Gemini cloud fallback response schema,
enabling future hot-swap between on-device and cloud OCR.

---

## 8. Backend Architecture (Unused by App)

```
backend/src/
  index.js          — Express app (helmet, cors, morgan, routes)
  middleware/
    auth.js         — JWT bearer verification
  routes/
    auth.js         — register/login
    expenses.js     — CRUD expenses
    categories.js   — CRUD categories
    subscriptions.js— CRUD subscriptions
    goals.js        — CRUD goals
    settings.js     — get/update settings
    upload.js       — POST /receipt → Gemini OCR fallback
  db/
    pool.js         — pg connection pool
    migrate.js      — raw SQL migration runner
    seed.js         — seed data
```

The backend mirrors the mobile app's domain model (expenses, categories,
subscriptions, goals, settings). If sync were ever added, the data shape is
roughly compatible — but there is no sync protocol, conflict resolution, or
delta mechanism defined.

---

## 9. Package Structure

```
app/src/
  components/     2 files  (UI primitives + ItemRows feature component)
  data/           1 file   (CURRENCIES, STARTER_CATEGORIES, AVATAR_CHOICES constants)
  db/             1 file + 9 repo files
    index.js      (DB connection + query helpers)
    schema.js     (DDL)
    repo/         (one file per entity)
  hooks/          1 file   (useAppState — entire app state)
  navigation/     1 file   (full navigation tree)
  ocr/            8 files  (pipeline modules)
  screens/        19 files (all screens flat, no grouping)
  theme/          1 file   (light + dark token objects)
```

---

## 10. Dependency Graph (Key Flows)

### Screen → Context → Repo → DB

```
Screen
  → useApp()                      [AppContext]
      → repos.expenses.list()     [db/repo/expenses.js]
          → all(sql, params)      [db/index.js]
              → db.getAllAsync()  [expo-sqlite]
```

### Cross-Layer Dependencies (Violations)

```
db/repo/items.js ──imports──▶ ocr/units.js (toCanonical)
components/ItemRows.js ──imports──▶ ocr/normalizeName.js
components/ItemRows.js ──imports──▶ ocr/units.js
screens/Scan.js ──imports──▶ ocr/* (5 modules)
navigation/index.js ──imports──▶ hooks/useAppState.js  (nav consuming state)
```

The `ocr/` package is used as a shared utility library by both screens,
components, and the database repository layer. This creates bidirectional
coupling between what should be an isolated processing module and the
persistence layer.
