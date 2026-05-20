# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these first

Before touching code, read these — they are the durable contract for this project:

1. **`docs/PROMPT.md`** — operating contract. Defines 15 rules (never assume, work step-by-step, always ask before schema/UX/architecture changes, run Rule 10's 7-step format on every task). Also names the assumed senior roles for non-trivial decisions.
2. **`docs/10-final/task_tracker.md`** — single source of truth for what's done. Two-level checkbox list (187 leaf tasks). Stable IDs (`QW-01..20`, then `1.1`, `2.13`, `3.11`, …) match `docs/09-roadmap/execution_roadmap.md`. Read the **Completion log** and **Decision log** at the bottom — they record why non-obvious choices were made.
3. **`docs/10-final/master_roadmap.md`** + **`final_assessment.md`** — strategic context.

The Task Execution Contract in `PROMPT.md` is binding: when the user names a task by ID, run Rule 10 Steps 1–7, **wait for approval at the gate**, implement incrementally, then flip the checkbox and append a Completion-log + Decision-log entry. Never commit unless explicitly told to. Never auto-advance to the next task.

## Repository layout

```
ExpenseManager/
├── app/         ← THE PRODUCT. React Native + Expo SDK 54 + expo-sqlite + ML Kit OCR
├── backend/     ← Earlier Express+Postgres iteration. Not part of the offline-first pivot.
├── frontend/    ← Earlier Vite+React web iteration. Same — pre-pivot scaffolding.
├── docs/        ← Roadmap, audits, decisions. 01-current-analysis through 10-final.
└── Drift.apk    ← Most-recent shipped build artefact.
```

Drift is **offline-first, on-device only, single-user, Android-first**. Cloud AI, paid APIs, online services are out of scope. New work happens almost exclusively in `app/`.

## Common commands

All commands are run from `app/` unless noted.

```bash
# Dev server (Metro). Add --clear after Babel/alias changes.
cd app && npm start

# Run on Android device/emulator (handles prebuild + install)
cd app && npm run android

# Release APK — signs with the production keystore if app/android/keystore.properties
# exists; otherwise falls back to debug signing with a Gradle WARNING. See
# docs/10-final/android-signing.md.
cd app/android && ./gradlew :app:assembleRelease

# Reset Metro cache after Babel config or alias changes
cd app && npx expo start --clear
```

There is **no test runner** in this repo (no jest, no vitest, no eslint config in `app/`). Validation is done via standalone `node:sqlite` and pure-Node scripts in `/tmp/` — see how prior migrations were validated (search `drift_*_validate.mjs` mentions in the task_tracker Completion log). Validation harnesses are not committed.

## Babel module aliases

Configured in `app/babel.config.js` — usable in any source file under `app/src/`:

| Alias | Resolves to |
|---|---|
| `@core` | `app/src/core` |
| `@features` | `app/src/features` |
| `@ocr` | `app/src/ocr` |
| `@components` | `app/src/components` |

`@hooks` and `@theme` aliases do **not** exist — those import paths stay relative.

## Architecture — the parts that span files

### Provider tree (`app/src/hooks/useAppState.js`)

`AppRoot` composes 9 sibling feature providers + `RefreshBusProvider` + `ThemeProvider` + a `ReadyGate` that blocks render until every provider reports `ready=true`. Provider order matters:

```
RefreshBusProvider
└── SettingsProvider          (owns dark_mode — ThemedChildren reads it)
    └── ThemedChildren        (bridges Settings → ThemeProvider)
        └── ProfileProvider
            └── ExpensesProvider      (owns `pots` + refreshSummary)
                └── CategoriesProvider (reads useExpenses().refreshSummary)
                    └── Items / Subs / Goals / Accounts / Travel (independent slices)
                        └── ReadyGate → children
```

- `useApp()` is a **legacy aggregator hook** kept for back-compat. New code should import the per-feature hook directly: `useExpenses()`, `useCategories()`, `useItems()`, etc. — they each subscribe only to their own slice and avoid the all-state re-render.
- Cross-feature edge: `pots` (categories joined to monthly_summary aggregates) live in `ExpensesProvider`, not `CategoriesProvider`, because the SQL summary is primarily an expense aggregate. Category mutations call `useExpenses().refreshSummary` after their own write.
- `RefreshBus` (`@core/state/RefreshBus`) is a ref-based registry — providers `useRegisterRefresh(key, fn)` on mount; pull-to-refresh and `resetApp()` call `bus.refreshAll()`. No React state inside the bus.

### Feature folders (`app/src/features/{X}/`)

Each feature owns: `repo.js` (SQL layer), `context.js` (React provider + state slice + action creators), `screens/`. Examples: `expenses`, `categories`, `items`, `subs`, `goals`, `accounts`, `travel`, `profile`, `home`, `trends`, `scan`. The Scan feature additionally has `ScanService.js` — a pure pipeline (`scanAndProcess(uri, pots) → reviewPayload`) callable without React.

### Database (`app/src/db/`)

- `index.js` — `getDB()` opens the connection once and runs PRAGMAs (WAL, NORMAL sync, MEMORY temp, 20MB cache, 256MB mmap, FK on). Then `runMigrations(db)` walks `schema_version` and applies any migration whose version exceeds the current head.
- `schema.js` — append-only migration array (currently v1..v16). **Never edit v1 retroactively.** Add new migrations as new array entries.
  - Most migrations use the default `withTransactionAsync` wrapper.
  - Set `transactionless: true` (e.g. v10) when the body needs to toggle `PRAGMA foreign_keys` — SQLite ignores that PRAGMA mid-transaction. The migration is then responsible for its own BEGIN/COMMIT and for idempotency on retry.
- `predicates.js` — exports `NOT_DELETED`, `NOT_DELETED_E`, `NOT_DELETED_R`, `NOT_DELETED_C`. **Every list query must filter through one of these.** `get(id)` lookups are intentionally NOT filtered (single-row PK access; soft-delete UX hasn't shipped yet).
- Soft-delete: every mutable user-owned table has a `deleted_at TEXT` column (v2). Triggers on `expenses` and `receipt_items` are soft-delete-aware — rollups (`monthly_summary`, `item_summary`) and FTS indexes (`expense_fts`, `item_fts`) only contain live rows. Therefore queries against those rollups/FTS tables do **not** need a `deleted_at IS NULL` predicate.
- `month_key` is a VIRTUAL generated column (`substr(date,1,7)`). Use it instead of `substr(...)` in WHERE clauses — `idx_exp_month` / `idx_exp_month_cat` exist for it.

### OCR pipeline (`app/src/ocr/` + `app/src/features/scan/`)

```
recognize(uri)                          @ocr/textRecognition (ML Kit native call)
   ↓ rawLines[]
parseReceipt(ocr)                       @ocr/parseReceipt
   ├─ mergeIntoRows(rawLines)           y-overlap row grouping
   ├─ detectFormat(rows)                @ocr/detectFormat — FORMAT_SIGNATURES vote
   ├─ extractBillTotals(rows, config)   classifyRowWithContext + per-format priority
   ├─ extractItems{Card,Tabular,...}    strategy chosen by detectFormat
   └─ scoreConfidence(parsed)           @ocr/confidence — 7 components, 0..1 overall
   ↓ parsed
processReceipt(ocr, pots)               @features/scan/ScanService
   ↓ reviewPayload (merchant, date, items, total, suggestedPotId, gstin, …)
Scan.js save → addExpenseWithItems      @features/expenses/context
   ↓
expRepo.createWithItems({ expense, items })   @features/expenses/repo
```

- **`classifyRowWithContext(text, amounts?)`** — the row-type classifier. Requires the matched amount to sit in the last 30% of the line (or be the only amount) for `total/subtotal/tax/fee/discount`. Mid-line prices on lines that incidentally mention "total"/"tax" fall through to `item`.
- **`normalizeName()`** (`@core/domain/normalize`) is the single canonical name normaliser. Calls `canonicalizeName()` (`@core/domain/synonyms`) for whole-string Hindi→English / Hinglish→English staple collapse BEFORE singularising. `दूध / Doodh / Milk` → `milk`; brand+staple like `Amul Doodh` stays uncollapsed (whole-string lookup only — no substring substitution).
- **`buildItem()`** is the only correct way to construct a `receipt_items` row from extracted text. It applies `normalizeName` + `toCanonical` and stamps `kind` from `PRODUCE`.
- **`deriveQtyFromRate(amount, rate)`** — snaps OCR'd `amount/rate` to integers 1..99 plus `{0.25, 0.5, 0.75}` within 5% relative tolerance. Used by the tabular strategy.

### Navigation (`app/src/navigation/`)

- Stack at the top: `Tabs` (Home / Scan / [+] / Trends / Subs) + modal screens (`Add`, `Detail`, `Edit*`).
- `+` is a **synthesised cell** in `CustomTabBar.js` — not a real route. Tapping it calls `navigation.getParent()?.navigate('Add')` so `Add` opens as a modal sheet.
- Each screen is wrapped in a per-route `ErrorBoundary` via `withBoundary(name, Comp)` in `navigation/index.js`. An outer `ErrorBoundary name="Drift"` in `App.js` catches AppProvider-boot crashes (and uses a hard-coded fallback palette because it cannot read `useTheme()` — context may be the thing that crashed).

## DB / schema conventions

- **Never edit a past migration.** Always append a new version object to the `migrations` array in `schema.js`.
- **Never add new tables to `V1_REQUIRED_TABLES`** — that constant gates legacy-stamp detection and must stay frozen at v1's table set.
- **Do** add new tables to `TABLES` in children-first FK order (used by `resetAll()`).
- Soft-delete behaviour: deleting code paths still hard-DELETE today. The `deleted_at` columns and the soft-delete-aware triggers/FTS are infrastructure for a future Recycle Bin feature.
- FK columns are declared with `REFERENCES ... ON DELETE SET NULL` or `CASCADE` — `PRAGMA foreign_keys = ON` is set on every connection, so these are enforced at runtime.

## Operating rules — recurring patterns

These are concrete patterns the user has approved across the project; deviate only with explicit approval.

- **Rule 9 (no churn outside the task)** — don't sweep import aliases, rename variables, or "fix while you're in there" when the file isn't directly part of the task. Track those as separate decision-log entries.
- Migrations are batched **one task = one migration version** unless the user opts otherwise (see decision log for `3.1–3.10`).
- Validation pattern for schema changes: write a standalone `/tmp/drift_*_validate.mjs` using `node:sqlite` (system SQLite 3.45+) — extract SQL constants from `schema.js`, apply the ladder, seed fixtures, assert. Don't commit the harness.
- Validation pattern for pure-function helpers: standalone Node ESM script in `/tmp/`. Extension-less imports from `app/src/` won't resolve outside Metro — either inline the logic or load JSON via `fs.readFileSync`.
- The user's **AskUserQuestion** flow is preferred over open prose when there are 2–4 discrete tradeoffs. Recommended option goes first.
- Updating the task tracker: flip the checkbox, append a Completion-log entry (date · task · what · `uncommitted` · file paths), append a Decision-log entry if any non-obvious choice was made, bump the phase totals table and the "Currently active" line.

## Android signing (release builds only)

Keystore lives at `~/.drift/drift-release.jks` (PKCS12, outside the repo). Credentials at `app/android/keystore.properties` (gitignored, mode 600). Full procedure + rotation discipline in `docs/10-final/android-signing.md`. R8 minify is on; `shrinkResources` is intentionally off until UI snapshot/walkthrough automation exists.
