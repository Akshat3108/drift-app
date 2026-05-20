# Architecture Recommendations — Drift

## Top 20 Architecture Issues

### Issue 1 — God Context (AppProvider)
**File**: `app/src/hooks/useAppState.js`
**Impact**: Every screen re-renders on any state change. All business logic is
centralized, making it impossible to test features in isolation or to remove
features without touching the God file.
**Root cause**: Single React Context managing all 8 domain entities and 30+
mutations with no separation of concerns.

---

### Issue 2 — Nuclear `refresh()` on Minor Mutations
**File**: `useAppState.js:29-48`
**Impact**: Updating a profile name reloads 500 expenses, all trips (with N+1
sub-queries), all subscriptions, goals, accounts. This is wasteful and causes
unnecessary re-renders across all screens.
**Root cause**: Single refresh function used as a universal cache-buster.

---

### Issue 3 — N+1 Queries in `items.trackedItems()`
**File**: `app/src/db/repo/items.js:12-56`
**Impact**: For a user with 50 tracked items, the Items screen executes 51+
sequential SQL queries. Performance degrades linearly with tracked item count.
**Root cause**: Per-row `await all(...)` inside a `for` loop to fetch history.

---

### Issue 4 — Cross-Layer Import: `db/repo/items.js → ocr/units.js`
**File**: `db/repo/items.js:2`
**Impact**: The persistence layer is coupled to the OCR processing layer.
Cannot reuse, test, or sync the items repository without the OCR module.
**Root cause**: `toCanonical` was never extracted to a shared domain utility.

---

### Issue 5 — N+1 Queries in `trips.listWithCategories()`
**File**: `app/src/db/repo/trips.js:13-18`
**Impact**: Executed on every global `refresh()` call (startup + profile update).
For 10 trips = 11 SQL queries every time the app state refreshes.

---

### Issue 6 — Hardcoded 500-Expense Limit
**File**: `useAppState.js:34,83,84,87,92`
**Impact**: Users with > 500 expenses see incorrect monthly totals, wrong pot
spend amounts, wrong `totalSpend` on the home screen. This is a silent data
correctness bug, not just a performance limit.

---

### Issue 7 — Raw Repos Exposed on Context (`repos.*`)
**File**: `useAppState.js:163-164`
**Impact**: Screens bypass the context abstraction to make direct repo queries.
This creates two code paths to the same data, making state consistency
impossible to guarantee without reading every screen's `useEffect` code.

---

### Issue 8 — `components/ItemRows.js` Imports OCR Modules
**File**: `ItemRows.js:3-4`
**Impact**: A UI component is coupled to the OCR pipeline. Changing the OCR
module API breaks the Add/EditExpense screens. Cannot reuse ItemRows without
the OCR module.

---

### Issue 9 — No React Error Boundaries
**Files**: Entire app
**Impact**: Any uncaught error in any screen component crashes the full app.
Async errors in `useEffect` hooks (repo queries, OCR calls) are silently
swallowed, leaving users staring at blank or stale screens.

---

### Issue 10 — Silent Error Swallowing in Screens
**Files**: `Home.js:22-27`, `Trends.js:18-31`
**Impact**: Network/DB errors in `useEffect` are caught and silently ignored
(`catch {}`). Users see empty/stale data with no explanation.

---

### Issue 11 — Navigation Depends on AppContext
**File**: `navigation/index.js:7,37`
**Impact**: The navigation tree cannot be rendered without a live AppContext.
Theme tokens consumed by `CustomTabBar` should come from a lightweight
ThemeContext, not the full application state.

---

### Issue 12 — No Schema Migration System
**File**: `db/schema.js`
**Impact**: The schema uses `CREATE TABLE IF NOT EXISTS` — new columns added to
existing tables will never be applied to users who already have the database.
Any schema change after initial ship requires a manual migration path.

---

### Issue 13 — `getDB()` Never Resets `_opening` on Failure
**File**: `db/index.js:8-17`
**Impact**: If `SQLite.openDatabaseAsync` throws, subsequent `getDB()` calls
return a forever-pending rejected promise. The app will appear frozen with no
error surfaced.

---

### Issue 14 — `Scan.js` Orchestrates 5 OCR Modules Directly
**File**: `screens/Scan.js:7-11`
**Impact**: The screen is responsible for: camera permissions, image picking,
OCR invocation, result parsing, normalization, and persistence. A 467-line
screen/service hybrid. Impossible to unit-test the OCR orchestration logic.

---

### Issue 15 — Backend Data Model Diverged from Mobile
**Files**: `backend/src/routes/`, `backend/src/db/`
**Impact**: The backend has no `accounts`, `trips`, `trip_categories`, or
`receipt_items` tables. If cloud sync is ever added, 4 of 10 database entities
have no backend home. The backend JWT auth model is also completely disconnected
from the mobile app.

---

### Issue 16 — No Testability Infrastructure
**Files**: Entire codebase
**Impact**: Zero tests in a codebase with significant business logic (OCR
pipeline, expense calculations, streak logic, unit normalization). No dependency
injection means repos cannot be mocked. No test fixtures.

---

### Issue 17 — `Home.js` Has Local State That Belongs in a Hook
**File**: `screens/Home.js:15-18`
**Impact**: Net worth, next trip, streak, and topMover are computed in a
`useEffect` directly in the screen. These are cross-feature derived data points
that should be provided by a `useHomeDashboard()` hook. Currently, navigating
away from Home and back re-fetches all 4 queries.

---

### Issue 18 — `summary` useMemo Scans All 500 Expenses
**File**: `useAppState.js:128-144`
**Impact**: Every time `expenses` or `categories` changes (which is any expense
mutation), `summary` re-computes by iterating the full expense array in
JavaScript. This should be a SQL aggregate query, not an in-memory scan.

---

### Issue 19 — Module-Level Mutable Row Key Counter
**File**: `components/ItemRows.js:7-8`
```js
let _rowKey = 0;
const nextKey = () => `r${++_rowKey}_${Date.now()}`;
```
**Impact**: Module-level mutable state in React components is an anti-pattern.
During development hot-reloads, the counter resets, creating key collisions.
Should use `useRef` or `crypto.randomUUID()`.

---

### Issue 20 — Carbon Tracking Hardcoded to 0.4 kg
**Files**: `screens/Add.js:52`, `screens/Scan.js:128`
**Impact**: Every expense is assigned exactly 0.4 kg CO₂ regardless of type
(identical for a coffee, a flight, or a grocery shop). The feature exists in the
schema but is effectively non-functional. Either implement properly or remove
from the UI to avoid misleading users.

---

## Top 20 Architecture Improvements

### Improvement 1 — Split God Context into Feature Contexts
Replace `AppContext` with per-feature contexts: `ExpensesContext`,
`CategoriesContext`, `SubscriptionsContext`, etc. Compose them at the app root.
Result: screens only re-render when their feature's data changes.

### Improvement 2 — Entity-Targeted State Updates
Replace `refresh()` with entity-specific updates: `addExpense` should only
re-fetch expenses, not all 8 entities. Keep `refresh()` for the rare cases
(profile reset) that genuinely require a full reload.

### Improvement 3 — Fix N+1 in `trackedItems()`
Rewrite using a single SQL query with `GROUP BY normalized_name` and aggregate
subqueries or a window function to get first/last purchase prices:
```sql
SELECT
  normalized_name,
  MAX(name) AS display_name,
  MAX(kind) AS kind,
  MAX(canonical_unit) AS canonical_unit,
  COUNT(*) AS points_count,
  (SELECT unit_price FROM receipt_items r2
   WHERE r2.normalized_name = r.normalized_name
   ORDER BY purchase_date DESC, id DESC LIMIT 1) AS last_unit_price,
  (SELECT unit_price FROM receipt_items r2
   WHERE r2.normalized_name = r.normalized_name
   ORDER BY purchase_date DESC, id DESC LIMIT 1 OFFSET 1) AS prev_unit_price
FROM receipt_items r
GROUP BY normalized_name
```

### Improvement 4 — Extract `core/domain/units.js`
Move `toCanonical`, `UNIT_OPTIONS`, and unit constants out of `ocr/` into
`core/domain/units.js`. Update all importers. Removes the db→ocr coupling
and the component→ocr coupling simultaneously.

### Improvement 5 — Fix N+1 in `trips.listWithCategories()`
Use a single JOIN query:
```sql
SELECT t.*, tc.id as cat_id, tc.label, tc.emoji, tc.amount
FROM trips t
LEFT JOIN trip_categories tc ON tc.trip_id = t.id
ORDER BY t.start_date IS NULL, t.start_date
```
Then group results in JS. 1 query instead of N+1.

### Improvement 6 — Remove Hardcoded Expense Limit / Add Pagination
Replace `expRepo.list({ limit: 500 })` with month-based loading:
- Load current month expenses on startup
- Lazy-load historical months when user scrolls AllExpenses
- Fix `summary` / `totalSpend` to use SQL aggregate, not in-memory scan

### Improvement 7 — Create a ScanService
Extract the orchestration logic from `Scan.js` into
`features/scan/ScanService.js`:
```js
export async function processReceipt(imageUri) {
  const ocr = await recognize(imageUri);
  const parsed = parseReceipt(ocr);
  return parsed; // clean domain object, no React state
}
```
Screen becomes a thin consumer of the service.

### Improvement 8 — Add React Error Boundaries
Wrap each feature's screen tree with an `ErrorBoundary` component. Provide a
fallback UI that shows the error and allows retry/navigation away.

### Improvement 9 — Add a Schema Migration System
Replace `CREATE TABLE IF NOT EXISTS` DDL with a versioned migration runner:
```js
const MIGRATIONS = [
  { version: 1, sql: 'CREATE TABLE ...' },
  { version: 2, sql: 'ALTER TABLE expenses ADD COLUMN ...' },
];
```
Store current version in a `_meta` table. Run pending migrations on startup.

### Improvement 10 — Fix `getDB()` Error Recovery
```js
_opening = (async () => {
  try {
    const db = await SQLite.openDatabaseAsync('drift.db');
    // ...
    return db;
  } catch (e) {
    _opening = null;  // allow retry
    throw e;
  }
})();
```

### Improvement 11 — Create `useHomeDashboard()` Hook
Move the 4 async queries from `Home.js`'s `useEffect` into a dedicated hook.
Cache the results. Only re-fetch when `expenses` changes (streak) or on mount.

### Improvement 12 — Move `summary` Computation to SQL
Replace the in-memory `useMemo` scan of 500 expenses with:
```sql
SELECT c.id, c.name, c.emoji, c.color, c.budget,
       COALESCE(SUM(e.amount), 0) AS spend
FROM categories c
LEFT JOIN expenses e ON e.category_id = c.id
       AND substr(e.expense_date, 1, 7) = ?
GROUP BY c.id
```
This runs in SQLite (indexed) rather than looping 500 JS objects.

### Improvement 13 — Extract `CustomTabBar` from Navigation Config
Move the `CustomTabBar` component to `navigation/CustomTabBar.js`. It should
accept theme tokens as props (or use a lightweight ThemeContext), not consume
the full `AppContext`.

### Improvement 14 — Create a ThemeContext
```js
const ThemeContext = createContext(FT);
export function ThemeProvider({ dark, children }) {
  return <ThemeContext.Provider value={dark ? FTD : FT}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
```
Navigation and components consume `useTheme()` instead of `useApp()`.

### Improvement 15 — Remove Raw `repos` from Context
Replace `repos: { items, expenses, accounts, trips }` with explicit async
action creators in each feature context. If a screen needs an ad-hoc query,
it should call a named function (`fetchNetWorth()`, `fetchStreak()`) rather
than accessing the repo object directly.

### Improvement 16 — Add an Error Logging Strategy
Introduce a simple error logger (can be `console.error` in dev, a remote crash
reporter in prod). Replace empty `catch {}` blocks with `catch (e) {
logError('context', e); }`. Surface errors to users via a toast/snackbar rather
than silent failure.

### Improvement 17 — Fix ItemRows Row Key
Replace the module-level counter with a stable key generator:
```js
const nextKey = () => typeof crypto !== 'undefined'
  ? crypto.randomUUID()
  : `r_${Math.random().toString(36).slice(2)}`;
```

### Improvement 18 — Add Path Aliases
Configure `babel-plugin-module-resolver` with aliases (`@core`, `@features`,
`@components`, `@ocr`). Eliminates fragile `../../..` relative paths and makes
feature moves cheaper.

### Improvement 19 — Align Backend Model with Mobile
Add `accounts`, `trips`, `trip_categories`, and `receipt_items` tables to the
backend schema. Align field names. This is prerequisite work before any sync
feature can be considered.

### Improvement 20 — Add OCR Unit Tests
The OCR pipeline (`parseReceipt`, `detectFormat`, `normalizeName`, `confidence`)
consists of pure functions. These are prime candidates for automated testing with
a collection of anonymized receipt OCR text fixtures. Tests here catch regressions
in the most complex business logic in the app.

---

## Quick Wins vs. Major Refactors

### Quick Wins (< 1 day each, low risk)

| Win | Effort | Risk | Impact |
|-----|--------|------|--------|
| Fix `getDB()` error reset | 15 min | Very low | Eliminates frozen-app failure mode |
| Fix ItemRows row key | 15 min | Very low | Eliminates hot-reload key collision |
| Lift `formatShort/shorten/daysUntil` to utils | 30 min | Very low | Reduces Home.js complexity |
| Move `ocr/units.js` → `core/domain/units.js` | 1 hr | Low | Fixes db→ocr coupling |
| Move `ocr/normalizeName.js` → `core/domain/` | 30 min | Low | Fixes component→ocr coupling |
| Extract `CustomTabBar` from navigation/index.js | 1 hr | Low | Separates concerns |
| Create `ThemeContext` | 2 hr | Low | Decouples navigation from AppContext |
| Replace empty `catch {}` with logged errors | 2 hr | Low | Surfaces silent failures |
| Add Error Boundaries (basic) | 2 hr | Low | Prevents full-app crashes |
| Fix N+1 in `trips.listWithCategories()` | 1 hr | Low | Faster startup + refresh |
| Fix `_opening` reset on DB failure | 15 min | Very low | Eliminates infinite hang |

### Medium Refactors (1–3 days, moderate risk)

| Refactor | Effort | Risk | Impact |
|----------|--------|------|--------|
| Fix N+1 in `trackedItems()` | 1 day | Low | Items screen scales to 100+ items |
| Create ScanService | 1 day | Medium | Testable OCR orchestration |
| Move `summary` to SQL aggregate | 1 day | Medium | Fixes data correctness at 500+ expenses |
| Add schema migration system | 2 days | Medium | Enables safe schema evolution |
| Create `useHomeDashboard()` hook | 1 day | Low | Cleaner Home.js, cacheable data |
| Add path aliases | 2 hr | Low | Cleaner imports throughout |
| Move repos into features/ | 1 day | Low | Better module structure |

### Major Refactors (> 3 days, high impact)

| Refactor | Effort | Risk | Impact |
|----------|--------|------|--------|
| Split God Context into feature contexts | 3–5 days | High | Eliminates global re-renders, enables per-feature testing |
| Remove hardcoded 500 limit + paginate | 2–3 days | Medium | Correct data for power users |
| Group screens by feature module | 1–2 days | Low | Enables independent feature development |
| Backend model alignment for sync | 3–5 days | Medium | Prerequisite for cloud sync |
| Full test suite for OCR pipeline | 3 days | Low | Regression safety for most complex code |
| Remove carbon tracking or implement properly | 1–2 days | Low | Remove misleading feature |

---

## Evaluation Against Architecture Standards

### Clean Architecture
- **Absent.** There is no domain layer, no use cases, no entity abstractions.
- The repository layer is well-implemented but skips the domain layer entirely.
- Business logic is split between AppProvider, screens, and repositories.

### MVVM / MVI
- **Partially approximated.** AppProvider acts as a combined ViewModel for all
  features, but with no observable streams, no state machines, and no clear
  separation between UI events and state transitions.
- Screens directly mutate context (event → context → state), which is closer to
  a collapsed MVI without the `Intent → Model → View` discipline.

### Modular Architecture
- **Not implemented.** All features share one context, one hooks file, and a
  flat screens directory.

### Offline-First
- **Correctly implemented at the data layer.** All reads/writes go to SQLite.
  No network dependency for any user-facing feature.
- **No sync strategy.** There is no mechanism to synchronize SQLite state with
  the backend, no conflict resolution, no optimistic updates, no background sync
  worker.

### Android Best Practices
- **Background work**: No WorkManager/background tasks. All async work is
  React `useEffect` hooks (cancelled when component unmounts).
- **Permissions**: Camera permissions handled correctly in Scan.js.
- **Deep links**: Not configured.
- **App startup**: Database initialization is synchronous-blocking during app
  mount (no splash screen management).

---

## Recommended Execution Order

1. Fix `getDB()` error reset + ItemRows key (15 min — zero risk)
2. Extract `core/domain/units.js` and `normalize.js` (1 hr)
3. Fix `getDB()` error path (15 min)
4. Add Error Boundaries (2 hr)
5. Fix N+1 in trips and items repos (2 hr)
6. Create ThemeContext, decouple navigation (2 hr)
7. Fix 500-expense limit → month-based loading + SQL summary (2 days)
8. Add schema migration runner (2 days)
9. Split God Context into feature contexts (3–5 days)
10. Create ScanService (1 day)
11. Move screens into feature directories (1 day)
12. Add OCR pipeline tests (3 days)
