# Modularization Strategy — Drift

## Current State

The app is a single flat module with no feature isolation:

```
app/src/
  components/   2 files  ← mixing primitives with feature components
  data/         1 file   ← configuration constants
  db/           10 files ← repository layer (best-organized part)
  hooks/        1 file   ← God hook (entire app state)
  navigation/   1 file   ← navigation tree
  ocr/          8 files  ← isolated pipeline (best-designed module)
  screens/      19 files ← all flat, no feature grouping
  theme/        1 file   ← design tokens
```

There are no feature boundaries. Any screen can directly import from any other
module. The `ocr/` directory is the only module that approximates a bounded
context.

---

## Target State: Feature-Module Architecture

### Guiding Principles

1. **Bounded contexts first** — group by domain, not by file type
2. **Dependency rule** — inner layers never import from outer layers
3. **Shared kernel** — utilities and types shared across features go in `core/`
4. **OCR stays isolated** — the OCR pipeline should have no dependency on the
   finance domain and no dependency on React
5. **Incremental adoption** — each module can be migrated independently

---

## Proposed Directory Structure

```
app/src/
  core/
    db/
      index.js        (getDB, exec, all, one — unchanged)
      schema.js       (DDL — unchanged)
    domain/
      units.js        (toCanonical, UNIT_OPTIONS — moved from ocr/)
      normalize.js    (normalizeName — moved from ocr/)
      categories.js   (STARTER_CATEGORIES — moved from data/)
      currencies.js   (CURRENCIES — moved from data/)
      avatars.js      (AVATAR_CHOICES — moved from data/)
    theme/
      tokens.js       (FT, FTD, palette, potBg — unchanged)
      ThemeContext.js (new: lightweight context for theme only)
    utils/
      format.js       (formatShort, daysUntil, shorten — lifted from screens)
      date.js         (date helpers shared across features)

  features/
    expenses/
      repo.js         (expenses repository — unchanged logic)
      useExpenses.js  (context slice for expenses only)
      screens/
        Add.js
        EditExpense.js
        AllExpenses.js
        Detail.js

    categories/
      repo.js         (categories repository)
      useCategories.js
      screens/
        EditPot.js
        PotDetail.js

    scan/
      ScanService.js  (new: composes OCR pipeline — camera → ocr → parse → normalize)
      screens/
        Scan.js       (simplified — delegates to ScanService)

    items/
      repo.js         (receipt_items repository — remove ocr import)
      useItems.js
      screens/
        Items.js
        ItemTrend.js

    subscriptions/
      repo.js
      useSubs.js
      screens/
        Subs.js
        EditSub.js

    goals/
      repo.js
      useGoals.js
      screens/
        Goals.js
        EditGoal.js

    accounts/
      repo.js
      useAccounts.js
      screens/
        NetWorth.js
        EditAccount.js

    travel/
      repo.js
      useTravel.js
      screens/
        Travel.js
        EditTrip.js

    profile/
      repo.js
      useProfile.js
      screens/
        Profile.js
        Onboarding.js

    home/
      useHomeDashboard.js  (new: composes cross-feature derived data)
      screens/
        Home.js
        Trends.js

  ocr/
    textRecognition.js   (unchanged)
    parseReceipt.js      (unchanged — import units from core/domain/)
    detectFormat.js      (unchanged)
    patterns.js          (unchanged)
    confidence.js        (unchanged)
    produceList.js       (unchanged)

  navigation/
    index.js             (navigation tree — consumes ThemeContext, not AppContext)
    linking.js           (deep link config — future)

  components/
    primitives/
      Card.js  Button.js  Chip.js  ProgressBar.js
      Toggle.js  MoodPicker.js  SectionHeader.js
      StatTile.js  SparkBars.js
    shared/
      ItemRows.js    (remove ocr imports — receive normalize/suggest as props)
```

---

## Module Dependency Rules

```
ocr/          → core/domain (units, normalize)
              → NO imports from features/ or components/

features/X/   → core/db (SQL helpers)
              → core/domain (units, normalize, constants)
              → components/ (UI primitives only)
              → NO imports from other features/ (except via events)

components/   → core/theme
              → NO imports from features/ or ocr/

navigation/   → features/ (screen references only)
              → core/theme (ThemeContext)
              → NO imports from repos or AppContext
```

---

## Migration Phases

### Phase 1 — Zero-Breakage Moves (1–2 days)
Move pure utilities without changing logic:
- `ocr/units.js` → `core/domain/units.js` (update imports in items.js, ItemRows.js, ocr files)
- `ocr/normalizeName.js` → `core/domain/normalize.js`
- `data/constants.js` → split into `core/domain/currencies.js`, `core/domain/categories.js`, `core/domain/avatars.js`
- Lift `formatShort`, `shorten`, `daysUntil` from `screens/Home.js` → `core/utils/format.js`
- Create `core/theme/ThemeContext.js` — lightweight context exporting `{ F, sym }` only

### Phase 2 — Split God Context (3–5 days)
Replace single `AppContext` with per-feature context slices:
- Create `features/expenses/useExpenses.js` — state + mutations for expenses only
- Create `features/categories/useCategories.js`
- Each feature hook provides its own state + mutations
- Compose them at app root using a `<FeatureProviders>` wrapper
- Keep backward-compatible `useApp()` shim that assembles the old shape from the new slices during transition

### Phase 3 — Service Layer (1–2 days)
- Create `features/scan/ScanService.js` to encapsulate: camera → OCR → parse → normalize
- Create `features/home/useHomeDashboard.js` to encapsulate the 4 async queries in Home's useEffect

### Phase 4 — Group Screens by Feature (0.5 day)
- Physically move screen files into `features/X/screens/`
- Update navigation imports

### Phase 5 — Fix db/repo/items.js N+1 (1 day)
- Remove `import { toCanonical } from '../../ocr/units'`
- Import from `core/domain/units.js` instead
- Rewrite `trackedItems()` to use a single SQL query with aggregate subqueries

---

## Feature Module Interface Pattern

Each feature module should export a standard interface:

```js
// features/expenses/index.js
export { useExpenses } from './useExpenses';
export { expensesRepo } from './repo';
// screen imports remain within the feature
```

Feature hooks follow this pattern:

```js
// features/expenses/useExpenses.js
export function ExpensesProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  // mutations...
  return <ExpensesContext.Provider value={...}>{children}</ExpensesContext.Provider>;
}
export function useExpenses() { return useContext(ExpensesContext); }
```

---

## Benefits of Proposed Modularization

| Concern | Current | After |
|---------|---------|-------|
| Feature isolation | None | Full — changes to expenses don't touch travel |
| Testing | Impossible | Each feature hook testable in isolation |
| Re-renders | All screens re-render on any state change | Only expense screens re-render on expense change |
| Onboarding | Must understand 178-line God file | Each feature is self-contained |
| Feature flag / removal | Touch multiple files | Delete one feature/ directory |
| Backend sync (future) | Unclear boundary | Feature repos are the sync unit |
