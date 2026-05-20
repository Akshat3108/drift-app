# Package Restructure — Drift

## Current Package Structure

```
app/src/
  components/
    ItemRows.js       ← feature component mixed with primitives
    UI.js             ← all primitive components in one file (173 lines)
  data/
    constants.js      ← mixed constants (currencies, categories, avatars)
  db/
    index.js
    schema.js
    repo/
      accounts.js
      categories.js
      expenses.js
      goals.js
      items.js        ← imports from ocr/ (wrong layer)
      profile.js
      settings.js
      subs.js
      trips.js
  hooks/
    useAppState.js    ← entire app state in one file
  navigation/
    index.js          ← navigation + custom tab bar UI
  ocr/
    confidence.js
    detectFormat.js
    normalizeName.js  ← re-used outside ocr/
    parseReceipt.js
    patterns.js
    produceList.js
    textRecognition.js
    units.js          ← re-used outside ocr/
  screens/
    Add.js
    AllExpenses.js
    Detail.js
    EditAccount.js
    EditExpense.js
    EditGoal.js
    EditPot.js
    EditSub.js
    EditTrip.js
    Goals.js
    Home.js
    Items.js
    ItemTrend.js
    NetWorth.js
    Onboarding.js
    PotDetail.js
    Profile.js
    Scan.js
    Subs.js
    Travel.js
    Trends.js
  theme/
    index.js
```

**Problems with current structure:**
- Flat `screens/` — 21 screens with no grouping
- `components/` mixes primitives with feature components
- `data/` is an arbitrary grab-bag of constants
- `hooks/` is a single God hook file
- `ocr/units.js` and `ocr/normalizeName.js` are used by non-OCR code
- `navigation/` contains UI component (CustomTabBar) mixed with route config

---

## Proposed Package Structure

```
app/src/

  ── CORE ─────────────────────────────────────────────────────────────────────

  core/
    db/
      index.js          ← unchanged (getDB, exec, all, one)
      schema.js         ← unchanged (DDL)

    domain/
      units.js          ← MOVED from ocr/units.js
                           (toCanonical, UNIT_CONVERSIONS, UNIT_OPTIONS, CANONICAL_UNIT)
      normalize.js      ← MOVED from ocr/normalizeName.js
                           (normalizeName)
      constants.js      ← MERGED from data/constants.js
                           (CURRENCIES, STARTER_CATEGORIES, AVATAR_CHOICES)
      produce.js        ← MOVED from ocr/produceList.js
                           (PRODUCE Set)

    theme/
      tokens.js         ← MOVED from theme/index.js
                           (FT, FTD, palette, potBg)
      ThemeContext.js   ← NEW: lightweight context wrapping theme tokens only
      useTheme.js       ← NEW: hook for { F, sym }

    utils/
      format.js         ← NEW: lifted from screens
                           (formatShort, shorten, daysUntil, formatCurrency)
      date.js           ← NEW: date helpers
                           (toYYYYMM, toYYYYMMDD, monthRange, daysInMonth)

  ── FEATURES ─────────────────────────────────────────────────────────────────

  features/
    expenses/
      ExpensesContext.js    ← NEW: extracted from AppProvider
      useExpenses.js        ← NEW: expenses state + mutations hook
      repo.js               ← MOVED from db/repo/expenses.js
      screens/
        Add.js              ← MOVED from screens/Add.js
        EditExpense.js      ← MOVED from screens/EditExpense.js
        AllExpenses.js      ← MOVED from screens/AllExpenses.js
        Detail.js           ← MOVED from screens/Detail.js

    categories/
      CategoriesContext.js
      useCategories.js
      repo.js               ← MOVED from db/repo/categories.js
      screens/
        EditPot.js          ← MOVED from screens/EditPot.js
        PotDetail.js        ← MOVED from screens/PotDetail.js

    scan/
      ScanService.js        ← NEW: composes camera → OCR → parse → save
      screens/
        Scan.js             ← MOVED + simplified (delegates to ScanService)

    items/
      ItemsContext.js
      useItems.js
      repo.js               ← MOVED from db/repo/items.js
                               (remove ocr import → use core/domain/units.js)
      screens/
        Items.js            ← MOVED from screens/Items.js
        ItemTrend.js        ← MOVED from screens/ItemTrend.js

    subscriptions/
      SubsContext.js
      useSubs.js
      repo.js               ← MOVED from db/repo/subs.js
      screens/
        Subs.js             ← MOVED
        EditSub.js          ← MOVED

    goals/
      GoalsContext.js
      useGoals.js
      repo.js               ← MOVED from db/repo/goals.js
      screens/
        Goals.js            ← MOVED
        EditGoal.js         ← MOVED

    accounts/
      AccountsContext.js
      useAccounts.js
      repo.js               ← MOVED from db/repo/accounts.js
      screens/
        NetWorth.js         ← MOVED
        EditAccount.js      ← MOVED

    travel/
      TravelContext.js
      useTravel.js
      repo.js               ← MOVED from db/repo/trips.js
      screens/
        Travel.js           ← MOVED
        EditTrip.js         ← MOVED

    profile/
      ProfileContext.js
      useProfile.js
      repo.js               ← MOVED from db/repo/profile.js
      settingsRepo.js       ← MOVED from db/repo/settings.js
      screens/
        Profile.js          ← MOVED
        Onboarding.js       ← MOVED

    home/
      useHomeDashboard.js   ← NEW: composes cross-feature derived data
                               (net worth, next trip, streak, top mover)
      screens/
        Home.js             ← MOVED + simplified
        Trends.js           ← MOVED

  ── OCR ───────────────────────────────────────────────────────────────────────

  ocr/
    textRecognition.js      ← unchanged
    parseReceipt.js         ← update: import units/normalize from core/domain/
    detectFormat.js         ← unchanged
    patterns.js             ← unchanged
    confidence.js           ← unchanged
    # units.js              ← REMOVED (moved to core/domain/units.js)
    # normalizeName.js      ← REMOVED (moved to core/domain/normalize.js)
    # produceList.js        ← REMOVED (moved to core/domain/produce.js)

  ── NAVIGATION ───────────────────────────────────────────────────────────────

  navigation/
    index.js                ← keep route config; import ThemeContext not AppContext
    CustomTabBar.js         ← NEW: extract tab bar component from index.js
    linking.js              ← NEW: deep link config (future)

  ── COMPONENTS ───────────────────────────────────────────────────────────────

  components/
    primitives/
      Card.js
      Button.js
      Chip.js
      ProgressBar.js
      Toggle.js
      MoodPicker.js
      SectionHeader.js
      StatTile.js
      SparkBars.js
      DonutChart.js
    shared/
      ItemRows.js           ← update: remove ocr imports, receive suggest/normalize
                               as injected callbacks (or use core/domain directly)
    index.js                ← barrel export of all primitives
```

---

## File Migration Map

| Current Path | New Path | Change Type |
|---|---|---|
| `ocr/units.js` | `core/domain/units.js` | Move |
| `ocr/normalizeName.js` | `core/domain/normalize.js` | Move |
| `ocr/produceList.js` | `core/domain/produce.js` | Move |
| `data/constants.js` | `core/domain/constants.js` | Move + split optional |
| `theme/index.js` | `core/theme/tokens.js` | Move |
| `hooks/useAppState.js` | `features/*/use*.js` (split) | Major refactor |
| `db/repo/expenses.js` | `features/expenses/repo.js` | Move |
| `db/repo/categories.js` | `features/categories/repo.js` | Move |
| `db/repo/items.js` | `features/items/repo.js` | Move + fix import |
| `db/repo/subs.js` | `features/subscriptions/repo.js` | Move |
| `db/repo/goals.js` | `features/goals/repo.js` | Move |
| `db/repo/accounts.js` | `features/accounts/repo.js` | Move |
| `db/repo/trips.js` | `features/travel/repo.js` | Move |
| `db/repo/profile.js` | `features/profile/repo.js` | Move |
| `db/repo/settings.js` | `features/profile/settingsRepo.js` | Move |
| `screens/Add.js` | `features/expenses/screens/Add.js` | Move |
| `screens/EditExpense.js` | `features/expenses/screens/EditExpense.js` | Move |
| `screens/AllExpenses.js` | `features/expenses/screens/AllExpenses.js` | Move |
| `screens/Detail.js` | `features/expenses/screens/Detail.js` | Move |
| `screens/EditPot.js` | `features/categories/screens/EditPot.js` | Move |
| `screens/PotDetail.js` | `features/categories/screens/PotDetail.js` | Move |
| `screens/Scan.js` | `features/scan/screens/Scan.js` | Move + simplify |
| `screens/Items.js` | `features/items/screens/Items.js` | Move |
| `screens/ItemTrend.js` | `features/items/screens/ItemTrend.js` | Move |
| `screens/Subs.js` | `features/subscriptions/screens/Subs.js` | Move |
| `screens/EditSub.js` | `features/subscriptions/screens/EditSub.js` | Move |
| `screens/Goals.js` | `features/goals/screens/Goals.js` | Move |
| `screens/EditGoal.js` | `features/goals/screens/EditGoal.js` | Move |
| `screens/NetWorth.js` | `features/accounts/screens/NetWorth.js` | Move |
| `screens/EditAccount.js` | `features/accounts/screens/EditAccount.js` | Move |
| `screens/Travel.js` | `features/travel/screens/Travel.js` | Move |
| `screens/EditTrip.js` | `features/travel/screens/EditTrip.js` | Move |
| `screens/Profile.js` | `features/profile/screens/Profile.js` | Move |
| `screens/Onboarding.js` | `features/profile/screens/Onboarding.js` | Move |
| `screens/Home.js` | `features/home/screens/Home.js` | Move + simplify |
| `screens/Trends.js` | `features/home/screens/Trends.js` | Move |
| `components/UI.js` | `components/primitives/*.js` (split) | Split |
| `components/ItemRows.js` | `components/shared/ItemRows.js` | Move |
| `navigation/index.js` | `navigation/index.js` + `CustomTabBar.js` | Split |

---

## Import Path Alias Setup

Add path aliases in `babel.config.js` to avoid deep relative imports:

```js
// babel.config.js
module.exports = {
  plugins: [
    ['module-resolver', {
      alias: {
        '@core': './src/core',
        '@features': './src/features',
        '@ocr': './src/ocr',
        '@components': './src/components',
        '@navigation': './src/navigation',
      }
    }]
  ]
};
```

Usage:
```js
import { toCanonical } from '@core/domain/units';
import { useExpenses } from '@features/expenses';
import { ProgressBar } from '@components';
```

---

## Incremental Migration Order

The order below minimizes breakage at each step:

1. **Move `core/domain/`** — zero logic changes, only path updates
2. **Move `core/theme/`** — create `ThemeContext.js`, update consumers
3. **Create `core/utils/format.js`** — lift helpers from screens
4. **Fix `db/repo/items.js`** import — swap `ocr/units` → `core/domain/units`
5. **Fix `components/ItemRows.js`** imports — swap `ocr/*` → `core/domain/*`
6. **Move repos into features/** — update imports
7. **Move screens into features/** — update navigation imports
8. **Split AppProvider into feature contexts** — the hardest step
9. **Split `components/UI.js`** into individual primitive files
10. **Extract `CustomTabBar.js`** from navigation
