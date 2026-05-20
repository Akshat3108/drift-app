# Technical Debt Register — Drift Expense Manager
> Generated: 2026-05-17 | Severity: P0 (blocker) / P1 (high) / P2 (medium) / P3 (low)

---

## P0 — Production Blockers

### TD-001: Release build signed with debug keystore
**File**: `app/android/app/build.gradle:114`
```gradle
buildTypes {
  release {
    signingConfig signingConfigs.debug   // ← debug.keystore in release!
  }
}
```
A release APK signed with the debug keystore cannot be uploaded to Google Play. Any APK distributed today is essentially a debug-signed build. Requires generating a production keystore and a secure secrets management strategy before any Play Store submission.

---

### TD-002: No TypeScript — no type safety anywhere
The entire app (`/app`), backend (`/backend`), and frontend (`/frontend`) are plain JavaScript. No `tsconfig.json`, no `.ts` or `.tsx` files, no `@types/*` packages. All function contracts are implicit. The OCR pipeline in particular has complex object shapes (`parsed.confidence.components`, `parsed.items[].canonical_qty`, etc.) that would benefit enormously from types. Bugs from incorrect property access or missing field assumptions are undetectable statically.

---

### TD-003: Schema divergence between app and backend
The mobile SQLite schema and the backend PostgreSQL schema are **incompatible**:

| Dimension | App (SQLite) | Backend (PostgreSQL) |
|---|---|---|
| Primary keys | INTEGER AUTOINCREMENT | UUID |
| User scoping | Single-user (no user_id) | Multi-user (user_id FK everywhere) |
| `receipt_items` | 11 columns incl. normalized_name, canonical_qty, unit_price | 4 columns, qty is TEXT |
| `settings.carbon_tracking` | present | absent |
| `accounts` table | present | absent |
| `trips` table | present | absent |
| `trip_categories` | present | absent |

No sync, migration, or reconciliation path exists. Any cloud sync feature requires choosing one schema and rewriting the other from scratch.

---

## P1 — High Priority

### TD-004: All 500 expenses loaded into Context memory at startup
**File**: `app/src/hooks/useAppState.js:37`
```js
expRepo.list({ limit: 500 })
```
Every mutation (add, edit, delete) re-fetches up to 500 expense rows and re-sets Context state, triggering a re-render of every connected screen. As the database grows this will cause:
- Slow startup (full DB read on mount)
- Increasing latency on every write
- Unnecessary memory pressure

No pagination is implemented in AppContext. The `list()` API supports `limit` and `offset` but Context always uses limit=500.

---

### TD-005: N+1 query pattern in `items.trackedItems()`
**File**: `app/src/db/repo/items.js:18–55`

For every unique normalized item name in the grouped result, a separate query fetches the last 8 price points:
```js
for (const r of rows) {
  const hist = await all(
    `SELECT unit_price, qty, unit, purchase_date
     FROM receipt_items WHERE normalized_name = ?
     ORDER BY purchase_date DESC LIMIT 8`,
    [r.normalized_name]
  );
  ...
}
```
With 100 unique items this fires 101 SQLite queries. The Items screen will feel slow as the receipt history grows.

---

### TD-006: Monolithic AppContext — god object pattern
**File**: `app/src/hooks/useAppState.js`

Single context holds all entities (profile, settings, categories, expenses, subs, goals, accounts, trips) and 30+ mutation functions. Any state change to any entity re-renders every component subscribed to `useApp()`. Because every screen imports `useApp()`, a subscription update (e.g., cancelSub) causes Home, Trends, Profile, and all other mounted screens to re-render.

No memoized selectors, no context splitting, no `React.memo` on screens.

---

### TD-007: `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` unnecessary permissions
**File**: `app/android/app/src/main/AndroidManifest.xml`

`RECORD_AUDIO` is declared but no audio recording is performed anywhere in the JS code. `SYSTEM_ALERT_WINDOW` is also declared — this is a sensitive permission that allows drawing over other apps and was likely pulled in by Expo dev tooling but should not ship in production. Both permissions increase the security surface and may trigger Google Play policy flags.

---

### TD-008: `WRITE_EXTERNAL_STORAGE` deprecated
**File**: `app/android/app/src/main/AndroidManifest.xml`

`WRITE_EXTERNAL_STORAGE` is a legacy permission deprecated since Android 10 (API 29) and completely blocked on Android 13+ (API 33). It should be removed and replaced with `MediaStore` APIs if external storage writes are ever needed.

---

### TD-009: Release build not minified / shrunk
**File**: `app/android/app/build.gradle:69`
```gradle
def enableMinifyInReleaseBuilds = (findProperty(...) ?: false).toBoolean()
```
Default is `false`. R8 minification and resource shrinking are both disabled in release builds. The resulting APK is larger than necessary and contains debug symbols.

---

### TD-010: `@react-native-async-storage/async-storage` installed but unused
**File**: `app/package.json`

AsyncStorage is a dependency but zero references to it exist in the app source code. All persistence is done via expo-sqlite. Dead dependency inflates the bundle.

---

### TD-011: `expo-camera` installed but not directly used
**File**: `app/package.json`

`expo-camera` is listed as a dependency, but Scan.js and all receipt entry points use `expo-image-picker` exclusively. The camera module is never imported. May cause unnecessary binary size increase from native modules being linked.

---

## P2 — Medium Priority

### TD-012: No test suite — zero automated tests
No unit tests, integration tests, or end-to-end tests exist anywhere in the project (app, backend, or frontend). There is no test runner configured (`jest`, `vitest`, etc.). The OCR pipeline in particular — which contains substantial logic in `parseReceipt.js`, `detectFormat.js`, `normalizeName.js`, and `patterns.js` — has no regression coverage.

---

### TD-013: Carbon tracking is a meaningless stub
**File**: `app/src/screens/Add.js:54`
```js
carbon: settings.carbon_tracking ? 0.4 : 0,
```
Every expense receives 0.4 kg CO₂ unconditionally regardless of category, amount, or merchant. The `carbon_tracking` toggle and the green "🌱 Carbon 0.4 kg" UI element are misleading. The DB column exists and the toggle exists; the actual emission model does not.

---

### TD-014: SQLite not running in WAL mode
**File**: `app/src/db/index.js`

`PRAGMA journal_mode=WAL` is never set. The default DELETE journal mode on SQLite blocks read operations during writes, which can cause brief UI freezes when saving large receipts with many items (which use `withTransactionAsync`).

---

### TD-015: No `React.memo` or memoized selectors on screens
All 19 screens call `useApp()` which gives them the full context value. When any piece of state updates — even unrelated data — all screens re-render. No use of `React.memo`, `useMemo` for derived props, or `useSelector`-style subscription to sub-slices.

---

### TD-016: Backend has auth + full CRUD that the app ignores
**Files**: `backend/src/routes/*.js`

The backend implements:
- User registration and login (JWT)
- Full CRUD for expenses, categories, subscriptions, goals, settings
- File upload with Gemini OCR

None of this is consumed by the mobile app. The backend is effectively a prototype that was never integrated. If the app ever needs to sync to a server, the API design is available but the schema mismatch (TD-003) must be resolved first.

---

### TD-017: `goals.eta` is a free-text field with no validation
**File**: `app/src/db/schema.js:82`

`goals.eta TEXT` stores any string. No date parsing, no auto-calculation from contribution history, no CHECK constraint. The field is purely decorative.

---

### TD-018: Category sort order has no drag-to-reorder UI
**File**: `app/src/db/schema.js:26`

`categories.sort_order INTEGER` exists but there is no UI to change it. Categories always display in DB insertion order.

---

### TD-019: `subscriptions.verdict` has no CHECK constraint
**File**: `app/src/db/schema.js:68`

`verdict TEXT NOT NULL DEFAULT 'keep'` — expected values are 'keep', 'cancel', 'pause' but no CHECK constraint enforces this. Any string can be inserted.

---

### TD-020: Receipt GSTIN / order ID parsed but never persisted
**File**: `app/src/ocr/parseReceipt.js:541-542`

`gstin` and `orderId` are extracted from the receipt and included in the parsed result object, but `Scan.js` never writes them to the DB. The `expenses` table has no columns for them either. Parsed data is silently discarded.

---

### TD-021: `mergeIntoRows()` has O(n²) complexity
**File**: `app/src/ocr/parseReceipt.js:38–71`

For each OCR line, the algorithm iterates all existing groups to find a Y-overlap match:
```js
for (const l of sorted) {
  for (const g of groups) { // O(n) inner loop
    ...
  }
}
```
Acceptable for typical receipts (≤200 lines), but could be slow for very long printed reports or utility bills.

---

### TD-022: `potId` category guess in Scan.js is identical for produce and non-produce
**File**: `app/src/screens/Scan.js:66–68`
```js
const guess = parsed.items.some(i => i.kind === 'produce')
  ? pots.find(p => /grocer/i.test(p.name))?.id
  : pots.find(p => /grocer/i.test(p.name))?.id;
```
Both branches of the ternary are identical. The differentiation logic was apparently intended but never implemented.

---

## P3 — Low Priority / Style

### TD-023: `backend/src/db/migrate.js` reads entire migration as one SQL string
If a migration step fails mid-way, there is no partial rollback tracking. All steps succeed or the process exits. Acceptable for a single-schema bootstrap but not for incremental migrations.

### TD-024: No `propTypes` on any component
Consistent with the "no TypeScript" situation. No runtime prop validation on any component.

### TD-025: `App.js` renders `null` while `ready = false`
**File**: `app/src/hooks/useAppState.js:146`

`if (!ready) return null;` — shows a blank screen during DB initialization. Should show a splash or skeleton.

### TD-026: `expenses.list()` is called with `limit: 500` in three separate mutations
**File**: `app/src/hooks/useAppState.js:82-93`

The magic number 500 is repeated three times. Should be a named constant.

### TD-027: `ItemRows.js` module-level `_rowKey` counter is not reset between screens
**File**: `app/src/components/ItemRows.js:7`

The counter only ever increments, which is fine, but if screens unmount and remount the counter grows unboundedly. Not a bug, just inelegant.
