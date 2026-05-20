# Architecture Smells — Drift

## 1. God Classes

### 1.1 AppProvider / useAppState.js — Primary God Class

**Severity: Critical**

`AppProvider` is simultaneously:
- A state container for 8 domain entities (profile, settings, categories,
  expenses, subscriptions, goals, accounts, trips)
- A mutation service for every entity (30+ operations)
- A repository facade (exposes `repos.*` directly)
- A derived-state calculator (pots, totalSpend, monthBudget)
- A theme provider (F, sym)

```js
// 178 lines, every screen depends on this single object
const value = {
  profile, settings, categories, pots, expenses, subs, goals,
  accounts, trips, totalSpend, monthBudget, F, sym,
  // 30+ mutation functions...
  repos: { items, expenses, accounts, trips } // breaks encapsulation
};
```

**Why it matters**: Every screen re-renders when any entity changes. Adding any
new feature requires modifying this single file. The God Context is both the
highest-fan-in module (every screen imports it) and the biggest single
responsibility violation in the codebase.

---

### 1.2 screens/Home.js — Fat Screen with Domain Logic

**Severity: High**

Home.js contains:
- 4 local `useState` entries for derived data (net, nextTrip, streak, topMover)
- Direct repo queries via `repos.*` in a `useEffect`
- 3 pure utility functions (formatShort, shorten, daysUntil) defined at file-level
- Full layout rendering logic (300+ lines)

The net-worth, trip, streak and top-mover queries could be computed centrally
or in a dedicated hook. Utility functions belong in a shared utils module.

---

## 2. Tight Coupling

### 2.1 Cross-Layer Import: db/repo/items.js → ocr/units.js

```js
// db/repo/items.js — line 2
import { toCanonical } from '../../ocr/units';
```

The persistence layer directly depends on the OCR processing layer. This makes
it impossible to move, reuse, or test the items repository without the OCR
module. `toCanonical` is a pure math function that belongs in a shared `utils/`
or `domain/` package, not inside the OCR pipeline.

**Impact**: Cannot mock OCR in unit tests for items repo. Cannot reuse
items repo in a future backend sync without pulling in the OCR module.

---

### 2.2 Cross-Layer Import: components/ItemRows.js → ocr/*

```js
// components/ItemRows.js — lines 3-4
import { normalizeName } from '../ocr/normalizeName';
import { toCanonical, UNIT_OPTIONS } from '../ocr/units';
```

A UI component importing from an OCR pipeline module. The `UNIT_OPTIONS`
constant and `toCanonical` utility have nothing to do with text recognition;
they belong in domain constants. `normalizeName` is a domain operation that
should sit in a domain service, not inside the OCR parser.

---

### 2.3 Navigation Layer Consuming App State

```js
// navigation/index.js — line 7
import { useApp } from '../hooks/useAppState';

// Used inside CustomTabBar for theming
const { F } = useApp();
```

The navigation configuration depends on application state. This means the
navigation tree cannot be instantiated without a live AppContext. Theme
tokens should be passed as props or accessed via a separate lightweight
ThemeContext, not the full AppContext.

---

### 2.4 Repo Bypass via `repos` on Context

```js
// AppProvider exposes raw repo objects
repos: { items: itemRepo, expenses: expRepo, accounts: accRepo, trips: tripRepo }
```

Screens like Home, Trends, ItemTrend, and EditExpense call `repos.*` directly,
bypassing the context mutation layer. This means:
- The context can be in an inconsistent state (repo query succeeds but context
  state is stale)
- The AppProvider's encapsulation of mutation logic is leaky
- There are two paths to the same data: context state vs. ad-hoc repo query

---

### 2.5 Screens Importing from OCR (Scan.js)

```js
// screens/Scan.js — lines 7-11
import { recognize } from '../ocr/textRecognition';
import { parseReceipt, recalcItem } from '../ocr/parseReceipt';
import { UNIT_OPTIONS } from '../ocr/units';
import { PRODUCE } from '../ocr/produceList';
import { normalizeName } from '../ocr/normalizeName';
```

The Scan screen is tightly coupled to 5 OCR modules. This is the correct screen
to use OCR, but the coupling should be mediated by a `ScanService` or
`ReceiptService` that composes the OCR calls, rather than having the screen
orchestrate 5 modules directly.

---

## 3. The Nuclear `refresh()` Pattern

**Severity: High**

```js
const refresh = useCallback(async () => {
  const [p, s, c, e, sb, g, a, t] = await Promise.all([
    profileRepo.get(),
    settingsRepo.get(),
    catRepo.list(),
    expRepo.list({ limit: 500 }),   // always 500
    subRepo.list(),
    goalRepo.list(),
    accRepo.list(),
    tripRepo.listWithCategories(),   // N+1 inside
  ]);
  // sets all 8 state slices...
}, []);
```

Called by `createProfile`, `updateProfile`, and `resetApp`. Even for simple
mutations (e.g., update profile name), `refresh()` reloads 500 expenses, all
trips with their sub-categories, all goals, etc.

`tripRepo.listWithCategories()` executes N+1 queries: one `SELECT * FROM trips`
plus one `SELECT * FROM trip_categories WHERE trip_id = ?` per trip.

---

## 4. N+1 Query Problems

### 4.1 items.trackedItems() — N+1 per Tracked Item

```js
// db/repo/items.js: trackedItems()
for (const r of rows) {
  const hist = await all(
    `SELECT ... FROM receipt_items WHERE normalized_name = ?
     ORDER BY purchase_date DESC LIMIT 8`,
    [r.normalized_name]
  );
  // populate r.last_unit_price, r.prev_unit_price, r.spark...
}
```

For N tracked items, this executes N+1 SQL queries. On a user with 50 tracked
grocery items this means 51 sequential database round-trips.

### 4.2 trips.listWithCategories() — N+1 per Trip

```js
for (const t of list) {
  t.categories = await all(
    'SELECT * FROM trip_categories WHERE trip_id = ?', [t.id]
  );
}
```

Loaded on every `refresh()` call, even when the trips screen is not visible.

---

## 5. Hardcoded Magic Numbers and Limits

```js
// useAppState.js
expRepo.list({ limit: 500 })  // hardcoded limit everywhere (3 occurrences)
```

The app silently shows only the most recent 500 expenses. A user with > 500
expenses will see wrong monthly totals in the `summary` derived state, wrong
`totalSpend`, and wrong category breakdowns. This is a data correctness bug
masquerading as a performance limit.

```js
// screens/Add.js
carbon: settings.carbon_tracking ? 0.4 : 0,  // fixed 0.4 kg regardless of expense type
```

Carbon is always 0.4 kg (or 0), regardless of whether the expense is a flight,
a cup of coffee, or a grocery purchase. This is a placeholder hardcoded into
the expense save path.

---

## 6. State Consistency Holes

### 6.1 Inconsistent Update Patterns

Some mutations call `refresh()` (reloads all 8 entities), some re-fetch only the
affected entity, and some screens use `repos.*` directly without any context
update. Example:

```js
// EditExpense.js — bypasses context, calls repo directly
await repos.items.replaceItems(e.id, [], date || e.expense_date);
```

After this call, the expenses context state is updated (via `updateExpense`),
but `repos.items.listByExpense(e.id)` would return the new items while
the expense object in context still holds old item count metadata.

### 6.2 Race Condition in getDB()

```js
// db/index.js
let _db = null;
let _opening = null;

export async function getDB() {
  if (_db) return _db;
  if (_opening) return _opening;
  _opening = (async () => { ... })();
  return _opening;
}
```

The double-checked pattern is correct for single-threaded JS but `_opening` is
never set to `null` on failure. If `SQLite.openDatabaseAsync` throws, subsequent
calls will await a rejected promise indefinitely.

---

## 7. Missing Error Boundaries

There are no React error boundaries anywhere. An uncaught exception in any
screen component will crash the entire app. Since many screens call `repos.*`
in `useEffect` without proper error handling (or with empty `catch {}`), data
fetch failures are silently ignored rather than surfaced to the user.

```js
// Home.js
try {
  setNet(await repos.accounts.netWorth());
  // ...
} catch {}  // silent failure — user sees stale or empty data
```

---

## 8. Component / Screen Responsibility Bleed

### 8.1 ItemRows.js — UI Component doing Domain Work

`ItemRows.js` is a reusable UI component that:
- Manages debounced autocomplete queries against the database (`repos.items.suggest`)
- Performs `toCanonical` unit conversion
- Runs `normalizeName` OCR normalization on user input
- Manages its own suggestion state and keyboard interaction state

This crosses the boundary between a presentational component and a domain/data
component. It uses `useApp()` to access `repos`, coupling a UI primitive to the
global state.

### 8.2 Scan.js — Screen Orchestrating a Service Pipeline

Scan.js manages: camera permissions, image picking, OCR pipeline invocation,
receipt parse result display, line-item editing, category selection, and
expense persistence — in 467 lines of JSX. The non-UI orchestration (camera →
OCR → parse → normalize → save) belongs in a service/use-case layer.

---

## 9. Backend / Frontend Mismatch

The backend (Express + PostgreSQL) has:
- JWT authentication
- Its own expense/category/subscription/goals/settings tables
- No accounts, no trips, no receipt_items tables

The mobile app has no accounts/trips in the backend model. If sync were added
naively, accounts, trips, and receipt_items would have no server-side home.
The backend was built before the full feature set was established and has since
diverged.

---

## 10. No Testability Hooks

- No dependency injection — repos are module singletons imported directly
- No repository interfaces or abstractions to mock
- AppProvider is a monolith impossible to test in slices
- No test helpers, no fixtures, no mocking strategy
- OCR modules are pure functions and are testable, but no tests exist

---

## Summary of Architecture Smells

| # | Smell | Severity | File(s) |
|---|-------|----------|---------|
| 1 | God Context / AppProvider | Critical | useAppState.js |
| 2 | db/repo imports ocr/ module | High | items.js, units.js |
| 3 | UI component imports ocr/ | High | ItemRows.js |
| 4 | Navigation depends on AppContext | Medium | navigation/index.js |
| 5 | Repos exposed raw on context | High | useAppState.js |
| 6 | Nuclear refresh() on minor mutations | High | useAppState.js |
| 7 | N+1 queries in trackedItems() | High | db/repo/items.js |
| 8 | N+1 queries in listWithCategories() | Medium | db/repo/trips.js |
| 9 | 500-expense hardcoded limit | High | useAppState.js |
| 10 | Carbon always 0.4 kg hardcoded | Low | screens/Add.js |
| 11 | Silent error swallowing | High | screens/Home.js + others |
| 12 | No React error boundaries | High | entire app |
| 13 | Fat screens with business logic | Medium | Home.js, Scan.js |
| 14 | Scan.js orchestrates 5 OCR modules | Medium | Scan.js |
| 15 | No migration system for schema | Medium | db/schema.js |
| 16 | _opening never reset on DB failure | Low | db/index.js |
| 17 | Backend/mobile model divergence | Medium | backend/ |
| 18 | No testability (no DI, no mocks) | High | entire codebase |
| 19 | Module-level row key counter | Low | ItemRows.js |
| 20 | Theme coupled to global AppContext | Low | navigation/index.js |
