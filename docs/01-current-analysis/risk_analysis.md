# Risk Analysis — Drift Expense Manager
> Generated: 2026-05-17 | Perspective: Senior Android Architect

---

## 1. Critical Risk Areas

### RISK-01: Release signing with debug keystore
**Severity**: CRITICAL — blocks any production release
**Category**: Build / Distribution

The Android release `buildType` in `app/android/app/build.gradle` is explicitly configured to use `signingConfigs.debug` (the default Expo debug keystore). Any APK or AAB built with `assembleRelease` or `bundleRelease` will be:
- Signed with a publicly-known debug key (`android`/`android`)
- Rejected by Google Play if a production key was ever uploaded before
- Uninstallable over a production APK (signature mismatch)

**Impact**: The app cannot ship to Google Play in its current state.

---

### RISK-02: Complete absence of a test suite
**Severity**: HIGH — quality regression risk grows with every change
**Category**: Quality / Maintainability

Zero tests exist across app, backend, and frontend. The OCR parsing pipeline (`parseReceipt.js`, `detectFormat.js`, `normalizeName.js`) contains the most complex logic in the codebase — 600+ lines of regex-driven parsing across 9 receipt formats, ~50 brand patterns, and 4 item extraction strategies. Any refactor or bug fix in this code has no safety net.

**Impact**: Silent regressions in OCR accuracy are undetectable. Any future developer change carries high risk of breaking format detection or item extraction.

---

### RISK-03: AppContext performance cliff
**Severity**: HIGH — becomes user-visible at moderate data volumes
**Category**: Performance

The current architecture loads all expenses (up to 500 rows) into memory on startup and re-reads them after every mutation. Every state update triggers re-renders of all subscribed screens (every screen calls `useApp()`).

**Timeline to impact**: A user logging 3 expenses per day will hit 500 rows in ~5.5 months. After 500 rows, some expenses will silently fall off the in-memory list because of the hard `limit: 500` cap in `expRepo.list()`. Analytics screens will show incomplete data without any warning to the user.

**Secondary impact**: The N+1 query in `items.trackedItems()` becomes measurably slow once a user has scanned 50+ unique items (~100 SQLite queries per Items screen load).

---

### RISK-04: Privacy risk — SQLite database is unencrypted
**Severity**: HIGH — financial data at rest is unprotected
**Category**: Security / Privacy

`drift.db` sits in the app's private storage directory with no encryption. On a rooted device, any app or tool with root access can read all expense history, account balances, and receipt items. The `receipt_uri` field may also point to images with readable receipts.

**Impact**: On non-rooted devices this is low risk. On rooted devices or via adb on debug builds, the full financial history is accessible in plaintext.

---

## 2. Architecture Risks

### RISK-05: Backend / app schema divergence makes sync impossible without a rewrite
**Category**: Architecture

The mobile app's SQLite schema (single-user, INTEGER PKs, rich `receipt_items` structure with canonical units) and the backend's PostgreSQL schema (multi-user, UUID PKs, thin `receipt_items`) share the same table names but incompatible column designs. Adding cloud sync today would require one of:
- Rewriting the app schema to use UUIDs and add `user_id` everywhere
- Rewriting the backend schema to match the app's richer design
- Building a bi-directional translation layer

Neither path is trivial. The risk is that sync gets architecturally deferred until it becomes a full-scale refactor.

---

### RISK-06: No offline-to-online migration story
**Category**: Architecture

The app is fully offline and has never needed to deal with network state, conflict resolution, or distributed identity. If cloud sync is added in the future:
- All existing users have local SQLite data with INTEGER IDs that do not map to UUIDs
- There is no migration tooling to export SQLite to PostgreSQL
- No CRDT or timestamp-based conflict resolution strategy exists

---

### RISK-07: Monolithic AppContext — no isolation between domains
**Category**: Architecture / Scalability

All application state is in one React Context. Adding a new data domain (e.g., budgeting periods, recurring templates, notes attachments) means extending the already large `useAppState.js` file. There is no mechanism to lazy-load or independently cache different domains.

As the app grows, the single large re-render on any mutation will become the primary performance bottleneck.

---

## 3. Security / Privacy Concerns

| Concern | Location | Impact |
|---|---|---|
| Unencrypted SQLite database | `drift.db` (on-device) | Financial data readable on rooted devices |
| Receipt images stored without encryption | `expenses.receipt_uri` | Images readable in app storage |
| `RECORD_AUDIO` permission declared | AndroidManifest.xml | Unnecessary sensitive permission may raise App Store flags |
| `SYSTEM_ALERT_WINDOW` permission declared | AndroidManifest.xml | Unusual permission; triggers user concern |
| `WRITE_EXTERNAL_STORAGE` declared | AndroidManifest.xml | Deprecated; blocked on Android 13+ |
| Debug keystore used in release | build.gradle | Production APK signed with a known-key |
| No biometric / PIN lock | — | Anyone with the device can access all financial data |
| Backend `.env` committed to repo? | Check `.gitignore` | JWT_SECRET and DB_PASSWORD in environment file |
| No rate limiting on backend | `backend/src/index.js` | Auth endpoints have no brute-force protection |
| Backend receipts temporarily stored on disk | `upload.js:9` `/tmp/drift-uploads/` | Cleaned up after request but `/tmp` is world-readable on some systems |

---

## 4. Scalability Concerns

### Data Volume
| Entity | Current limit | When will it hurt |
|---|---|---|
| Expenses in memory | Hard cap: 500 rows | ~5-6 months of daily use |
| Items screen N+1 queries | 1 query per unique item | Slow at 100+ unique items |
| AppContext re-render | All screens on any write | Immediately noticeable with fast input |
| SQLite without WAL | Writes block reads | Visible on large receipt scans |

### Architecture Scalability
- **No pagination**: The AllExpenses screen shows all loaded expenses at once; with 500 rows, the FlatList will slow down.
- **No virtualized rendering on custom lists**: Most screens use `ScrollView` + `.map()` instead of `FlatList`/`FlashList`. With large datasets, all items are rendered upfront.
- **`useMemo` on `summary`** recalculates over ALL expenses every time expenses or categories change — O(n) scan on every category update.

---

## 5. Current Strengths

1. **Truly offline-first**: No network dependency for any feature. All OCR, all analytics, all data management works with airplane mode on. This is architecturally sound for a privacy-focused expense app.

2. **Sophisticated OCR pipeline**: The 10-format receipt parser with confidence scoring, 50 brand patterns, and 4 item extraction strategies is well-engineered and handles the complexity of Indian receipt formats explicitly. The confidence component system (7 factors) is thoughtfully designed.

3. **Rich data model for receipt items**: Storing both raw (`qty`, `unit`) and canonical (`canonical_qty`, `canonical_unit`) quantities alongside `normalized_name` enables the item trend and comparison features that differentiate this app. The indexes on `receipt_items(normalized_name, purchase_date)` are well-placed.

4. **Clean repository pattern**: The `db/repo/*.js` files are small, focused, and easy to understand. The SQLite wrapper (`db/index.js`) is minimal and composable.

5. **Well-indexed schema**: The four custom indexes (expenses by date, by category; items by name+date, by kind+date) cover the most common query patterns without over-indexing.

6. **Dual OCR strategy with server fallback**: The architecture already anticipates low-confidence scans needing cloud fallback (Gemini endpoint in backend); the client shows a confidence badge. The wiring just hasn't been connected yet.

7. **Good UX around OCR**: The Scan screen's review flow (edit items, recompute total, confidence badge, fees display, category assignment) provides appropriate human oversight before committing OCR results to the DB.

8. **Foreign key + cascade discipline**: FK constraints are enabled and correctly used — receipt_items cascade-delete with expense, trip_categories cascade with trip.

---

## 6. Current Weaknesses

1. **No TypeScript** — all contracts are implicit; refactoring is risky.
2. **No tests** — no regression safety net.
3. **God Context pattern** — performance, maintainability, and testability all suffer.
4. **500-row cap is a silent cliff** — no warning or pagination when the limit is hit.
5. **No search** — finding a specific expense requires scrolling or knowing the date.
6. **No export** — users cannot get their data out; creates lock-in anxiety.
7. **No notifications** — subscription due dates and budget overspend cannot alert the user.
8. **Carbon tracking is misleading** — the toggle and the "0.4 kg" value suggest accuracy that doesn't exist.
9. **Schema divergence makes the backend investment largely wasted** until reconciled.
10. **No biometric/PIN** — a shared or stolen device exposes all financial history.
11. **Release signing not configured** — cannot ship to Play Store as-is.
12. **Trip expenses not linked** — trips have budgets but no way to see which expenses count toward a trip budget.

---

## 7. Risk Priority Matrix

| Risk | Likelihood | Impact | Priority |
|---|---|---|---|
| RISK-01 Debug keystore | Certain | Release blocker | P0 |
| RISK-02 No tests | Certain | High (long-term) | P1 |
| RISK-03 AppContext cliff at 500 rows | High (6 months) | High | P1 |
| RISK-04 Unencrypted SQLite | Low (rooted device) | High | P1 |
| RISK-05 Schema divergence | Certain if sync planned | Medium | P1 |
| RISK-06 No offline→online migration story | Certain if sync planned | High | P1 |
| RISK-07 Monolithic Context | Certain (grows with features) | Medium | P2 |
| Unnecessary permissions | Medium (Play policy) | Medium | P2 |
| No pagination in AllExpenses | High (UI jank at 500) | Medium | P2 |
| N+1 items query | High (50+ unique items) | Medium | P2 |
| No notifications | Certain (missing feature) | Low-Medium | P2 |
| No search | Certain (missing feature) | Medium | P2 |
| No export | Certain (missing feature) | Medium | P3 |
