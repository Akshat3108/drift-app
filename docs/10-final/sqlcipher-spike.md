# SQLCipher Feasibility Spike — Go / No-Go Decision

> **Task:** 8.15 (Phase 5 §5.E — Architectural spikes, decision docs only)
> **Status:** Closed 2026-05-26
> **Verdict:** **NO-GO today. Deferred with explicit revisit triggers (see §8).**
> **Author note:** This document is the durable record of the decision. Do not change the verdict without also updating the trigger conditions in §8 and the Decision log entry in `task_tracker.md`.

---

## 1. Question being answered

Should Drift enable **encryption-at-rest** for `drift.db` via SQLCipher (or an equivalent SQLite-with-cipher binary)?

The roadmap line (`execution_roadmap.md` row 8.15) asks for a 1-day feasibility spike ending in a go / no-go. This doc *is* that deliverable. No code is being changed in 8.15.

---

## 2. Threat model the question is trying to close

Drift today stores `drift.db` plaintext at `documentDirectory/drift/drift.db` (Expo's per-app sandbox). Plaintext storage is exposed to the following adversaries:

| Adversary | Has access? | What they see today |
|---|---|---|
| Random app on the same Android device (non-root) | No | Nothing — Android per-app sandbox prevents reads outside the app's UID. |
| User of the device (no biometric set up) | Yes (via app UI) | Whatever the UI shows. The 8.11 biometric/PIN lock is a UI gate but only engages if device security is enrolled. |
| Someone with physical device + screen unlock | Yes (via app UI) | Same as above — if the device is unlocked, the app is reachable. 8.11 re-locks on bg→fg. |
| Someone with physical device + adb access + USB debugging enabled | Yes | Can pull `/data/data/host.exp.exponent/files/drift.db` and inspect with any sqlite3 CLI. **This is the gap SQLCipher addresses.** |
| Someone with physical device + root | Yes | Same as above, regardless of USB debugging. |
| Someone with a stolen device that was powered off | Depends | If the device has File-Based Encryption (FBE) and is locked at the kernel level (default on Android 7+), the file is unreadable until first unlock after boot. Drift inherits this baseline for free. |
| Cloud / network adversary | No | Drift is fully offline; no data leaves the device unless the user manually shares a `.driftbackup` (which is already AES-GCM encrypted — see 8.8). |

**The only meaningful gap SQLCipher closes** is the *rooted-or-adb-extracted device* case. That is a real but narrow attacker. Notably, it is **not** the threat that 8.11 (biometric lock) addresses — 8.11 prevents casual UI access, not filesystem extraction.

### 2.1 What plaintext data is actually at risk

The on-disk `drift.db` contains:

- All expense rows (amount, date, notes, merchant name, payment method, GST fields)
- All receipt items (item name, quantity, unit, rate, canonical name)
- Merchant directory (`merchants` + `merchant_aliases`)
- FTS5 shadow tables `expense_fts`, `item_fts` — *these contain free-text content indexed for search; they replicate the searchable column content*
- Subscriptions, goals, accounts, account_snapshots, csv_imports, fuel_fillups, pantry_items, emi_loans — substantially the user's financial life

Note: **receipt image files** (`documentDirectory/drift/receipts/full/YYYY/MM/<uuid>.webp`, shipped 8.6) are filesystem blobs **outside** the DB. **SQLCipher does not encrypt them.** This is critical and is revisited in §6.4.

---

## 3. What Drift already has against this threat

These mitigations are live as of 2026-05-26:

1. **8.11 — Biometric / PIN app lock.** Gates the **UI** on cold start and every bg→fg. Does NOT encrypt the DB; an attacker with root or adb bypasses it entirely.
2. **8.8 — Encrypted backup.** `.driftbackup` files (the only artefact that can leave the device) are AES-256-GCM with PBKDF2-SHA256 key derivation. Source DB on disk is plaintext, but **exported** copies are encrypted.
3. **Android File-Based Encryption (FBE).** Standard on Android 7+. The device's storage is encrypted at the block level until the user's lock screen is unlocked at least once per boot. This protects against a *cold* stolen device; it does NOT protect against a device that has been unlocked at least once since power-on, which is the normal state.
4. **Drift APK is R8-minified.** Makes static analysis harder, irrelevant to data extraction.

SQLCipher's incremental value is therefore: *protect the DB from extraction on a warm-state device that has been adb-debug-enabled or rooted by the user themselves or by an attacker with brief physical access*.

---

## 4. Integration paths (engineering options)

`expo-sqlite` (Expo SDK 54) **does not ship with SQLCipher.** There is no flag, no `cipher_compatibility` opt-in, no first-class story. Every realistic integration path requires either swapping the SQLite binding or forking it.

### 4.1 Option A — Swap to `op-sqlite` with the `sqlcipher` feature flag

`op-sqlite` is a community React Native SQLite binding (JSI-based, similar perf shape to expo-sqlite) that ships a `sqlcipher` build target. Enabling it is a Gradle-side flag.

**Pros:**
- The cipher integration is upstream-maintained.
- API surface is broadly similar (`openDatabaseSync`, `execAsync`, `getAllAsync`-equivalents exist).
- Stays within the Expo dev-build / managed-workflow story (op-sqlite is config-plugin compatible).

**Cons:**
- Touching `db/index.js` requires rewriting **every** repo file that imports it. As of 2026-05-26 that includes: `expenses/repo.js`, `categories/repo.js`, `items/repo.js`, `subs/repo.js`, `goals/repo.js`, `accounts/repo.js`, `travel/repo.js`, `profile/settings.repo.js`, `notifications/log.js`, `analytics/*.js`, `maintenance/tasks/*.js`, `backup/index.js`, `media/receipts.js` — **40+ files** by spot count.
- The `transactionless: true` migration mechanism (v10 — see `schema.js`) relies on expo-sqlite's specific async transaction wrapper. op-sqlite has its own analogue but the migration runner needs porting.
- FTS5 path: expo-sqlite enables FTS5 by default; op-sqlite requires the FTS5 build flag on the SQLCipher target. Confirm before commit.
- Migration of existing user databases: the swap day requires every existing user's plaintext `drift.db` to be re-opened by op-sqlite, then `sqlcipher_export()`'ed into a new encrypted DB, then atomically renamed. This is a one-shot startup migration of **non-trivial complexity** — it needs the same safety scaffolding as 8.8 restore (rollback `.pre-encrypt` if anything fails).
- Build size grows by ~600KB–1.2MB for the bundled cipher.

**Estimated effort:** 5–8 developer-days for the binding swap, plus 3–5 days for the one-shot encryption migration scaffolding, plus a release-channel validation week (because every existing install is at risk). **Realistic total: ~2 weeks.**

### 4.2 Option B — Swap to `react-native-quick-sqlite` with SQLCipher

Same shape as Option A. `quick-sqlite` is mature, has explicit SQLCipher support, and its API is similarly close to expo-sqlite. Same cost ballpark.

**Differentiator vs. op-sqlite:** quick-sqlite has been around longer; op-sqlite is more modern (JSI-direct, no bridge). For a project that's already on Expo SDK 54 + JSI, op-sqlite is the cleaner fit. Either choice is acceptable.

### 4.3 Option C — Fork or patch `expo-sqlite`

Patch Expo's native module to link against the SQLCipher AAR instead of the bundled SQLite. Apply via `patch-package` or a fork.

**Pros:**
- Zero source-side changes. `db/index.js` and every repo file stay byte-identical.

**Cons:**
- The patch breaks on **every** Expo SDK upgrade. Drift currently rebases onto every SDK release (most recently SDK 54). Each rebase is a ~1-day patch reconciliation, indefinitely.
- The Expo dev-client native build must be rebuilt; EAS Cloud Build does not natively recognise the swap.
- Risks Drift's ability to upgrade Expo at the pace required to stay current with React Native security patches.

**Estimated effort:** 2 days to land + ~1 day per Expo SDK upgrade in perpetuity. **Not recommended.**

### 4.4 Option D — Build a custom SQLite binary with cipher + ship it

Ship a custom-compiled SQLite-with-cipher `.so` per Android ABI. Bind it via Expo's modules API.

**Pros:**
- Full control over which cipher (SQLCipher / sqleet / wxSQLite3 variants), which page size, which iteration counts.

**Cons:**
- 5+ developer-weeks. Single-developer project, no security audit budget. Not viable.

### 4.5 Option E — Don't encrypt the DB; document the residual risk

The status quo. `drift.db` stays plaintext; users with elevated threat models can rely on 8.11 + Android FBE; users who export data get 8.8's encrypted `.driftbackup`. Drift adds a "Threat model" subsection in the Profile screen's existing privacy area so users know what is and isn't protected.

**Pros:**
- Zero engineering cost.
- Zero performance cost.
- Preserves the door to add SQLCipher later if (a) a real incident is reported, (b) a multi-device sync feature pushes data over more attack surface, or (c) Expo upstream adds first-class SQLCipher support.

**Cons:**
- Residual risk on rooted / adb-extracted devices remains. Documented, not mitigated.

---

## 5. Performance cost on Drift specifically

SQLCipher's published baseline is **~5–15% slower on reads and ~10–30% slower on writes** on typical workloads. The numbers are not uniform — they are workload-dependent. Drift's workload concentrates the worst case:

### 5.1 Hot paths that get slower

| Hot path | Why it gets hurt by SQLCipher | Severity |
|---|---|---|
| `expense_fts` / `item_fts` FTS5 search (used in `AllExpenses` saved-filter search, `Items` search) | Every FTS5 page read is decrypted. FTS5 indexes are page-dense; this is the worst possible workload for a page-based cipher. | **High** — published numbers cite 30%+ slowdowns on heavy FTS5. |
| `monthly_summary` rollup triggers (fire on every `expenses` insert / update / delete) | Every trigger fires a small UPSERT against the rollup table. Each is a tiny encrypted write. | Medium — high write frequency, low per-op work. |
| `getDB()` cold-open | `PRAGMA key` must run first, then KDF derivation, then the 42 existing migrations re-verify (no-op but each touches `schema_version`). | Low one-shot — ~50–150ms additional cold-start once. |
| `home` dashboard 4-query parallel `useQuery` (8.9) | Four small queries running in parallel; each pays decryption per page. | Low aggregate — sub-50ms on hot cache, ~80–150ms on cold. |
| `8.13` anomaly detection (90-day rolling µ/σ per category) | Single SCAN over 90 days of `expenses`. | Medium — proportional to row count. |
| `8.7` maintenance job (ANALYZE, orphan GC, summary audit) | Full table scans. Runs nightly on bg→fg. | High — but background, so user-invisible. |

### 5.2 Hot paths that don't get hurt

- WebP receipt blobs (8.6) — filesystem, not DB. Unchanged.
- `db_stats` / `db_slow_log` (8.10) — they'd reflect the post-SQLCipher numbers, but the observability mechanism continues to work.
- Image rendering, navigation, OCR — DB-independent.

### 5.3 Concrete benchmark plan (if a future PoC happens)

For a future revisit, the benchmark methodology should be:

1. Seed a synthetic 100k-expense DB matching `scaling_strategy.md`'s load-test target.
2. Time these on plaintext expo-sqlite and on SQLCipher-via-op-sqlite, three runs each, median:
   - `useHomeDashboard` first-render (cold cache).
   - `AllExpenses` initial load (250 most-recent rows + day grouping).
   - `Items.search('milk')` FTS5 query.
   - `Trends` per-category 12-month rollup query.
   - `8.7` full maintenance pass.
3. Time DB cold-open (`getDB()` to first query result).
4. Measure APK size delta.
5. Verify FTS5 still works (no missing-tokenizer error).
6. Verify all 42 migrations still apply on a synthetic v1 ladder.

**The benchmark cannot be run as part of this 1-day spike.** Standing up a working op-sqlite-with-cipher build is itself the multi-day engineering work that the spike was scoped to evaluate. The point of the spike is to decide whether that engineering work is justified — see §7.

---

## 6. Risks and gotchas that the spike must surface

### 6.1 Passphrase / key management

SQLCipher derives the cipher key from a passphrase via PBKDF2-SHA512 (default 256,000 iterations as of SQLCipher 4.x). Drift must decide where the passphrase comes from:

- **From the user, every cold start** — UX-hostile. Defeats the offline-first principle that the app "just opens".
- **From the user once, stored via `expo-secure-store` (Android Keystore)** — practical but pushes the key into the device's hardware-backed keystore. **The key sits next to the encrypted DB on the same device.** A rooted attacker who can pull `drift.db` can also pull the secure-store contents → encryption defeated.
- **From the user's biometric** — `expo-local-authentication` (already integrated in 8.11) does not expose a key. Android Keystore does, but binding it to biometrics adds OS-level dialogs every cold open.

This is the central UX/security tension. The "store the passphrase in secure-store" path is what most apps actually ship, and it leaks key into the same threat surface that SQLCipher is trying to protect. The naive integration provides **defence-in-depth only against attackers who haven't bothered to also extract secure-store** — a meaningful but limited improvement.

### 6.2 Backup format collision

8.8's `.driftbackup` reads the raw `drift.db` file, zips it with `receipts/`, encrypts the zip. If `drift.db` is itself already encrypted by SQLCipher:

- The backup file double-encrypts. Wasted CPU but harmless.
- **Restore requires the SQLCipher key**, separate from the backup passphrase. The user now manages two secrets. Or 8.8 must extract via `sqlcipher_export()` to a plaintext intermediate during backup creation — which writes plaintext to disk, defeating SQLCipher exactly when the user is most attentive to data leaving the device.

Either path is awkward. Resolving the design cost is a few days.

### 6.3 SQLCipher's PRAGMA key ordering

`PRAGMA key = '...'` must be the **first** statement on a connection. Drift's current `getDB()` IIFE (`app/src/db/index.js`) runs WAL / sync / mmap / cache-size PRAGMAs immediately after open — those PRAGMAs would need to move after the key PRAGMA. Trivial to fix but easy to miss in a partial migration.

### 6.4 SQLCipher does not encrypt receipt blobs

Receipt WebPs (8.6 — `documentDirectory/drift/receipts/full/YYYY/MM/<uuid>.webp`) live on the filesystem. They contain visual receipt content — including merchant name, item lines, totals, sometimes the user's printed name from membership-club receipts. **They are at least as sensitive as the DB they're indexed by.**

A defence-in-depth posture that encrypts the DB while leaving the WebPs plaintext is incoherent. To close this properly, Drift would also need:

- Either move blobs into the DB as BLOB columns (kills the streaming-decode path that `expo-image` relies on; also caps page size at ~1GB).
- Or apply per-file AES-GCM at write time and decrypt-to-cache on read (significant pipeline rewrite).

This is real additional scope that the 1-day spike line item did not capture. **Honest accounting: the full encryption-at-rest posture is closer to 3–4 weeks of work, not the 1 day on the roadmap.**

### 6.5 SQLCipher's ALTER TABLE / migration semantics

The 42 existing migrations include `transactionless: true` cases (v10) that toggle `PRAGMA foreign_keys`. SQLCipher inherits SQLite's behaviour but adds key-management state. The migration runner has to be re-verified end-to-end after the swap. Not hard, but it's a real risk surface.

---

## 7. Recommendation: NO-GO today

**The benefit (closing the rooted/adb-extracted threat) is real but narrow.** The cost (~2 weeks of engineering to swap bindings, plus 3–4 weeks if blobs are also encrypted, plus a perf regression that hits Drift's specific hot paths harder than average, plus an unsolved passphrase-storage UX dilemma) is significantly more than the 1 day the roadmap budgeted.

**The right disposition is defer-with-trigger:** keep the door open by tracking the trigger conditions in §8, but do not start engineering work now. The 8.11 biometric lock + 8.8 encrypted backup + Android FBE baseline cover the casual-user threat model. Users with serious adversaries should not rely on Drift's posture in any case — they need full-device encryption, locked bootloader, and operational discipline that no app can provide.

The roadmap line "8.15 → go/no-go decision" is satisfied by this document; the door stays open per `master_roadmap.md` line 1008 ("Phase 5 — biometric/PIN lock + SQLCipher").

### 7.1 What this means for the user

Today, on the next release:

- Biometric / PIN lock (8.11) gates the UI.
- Backup files (8.8) are encrypted on export.
- `drift.db` on disk is plaintext, protected only by the Android per-app sandbox + FBE.

That is the right balance for the offline-first, single-user, casual-threat-model target audience that `long_term_strategy.md` defines.

---

## 8. Revisit triggers — when this verdict should be re-evaluated

Any one of the following should re-open this decision:

1. **A real incident.** A Drift user reports — or the developer experiences — a data-extraction event from a rooted or adb-debugged device. Until then, the threat is theoretical.
2. **Multi-device cloud sync ships (8.16 → implementation).** Multi-device extends the attack surface from one device to N devices + the server pipe. SQLCipher's value goes up proportionally. If 8.16 ever moves from design doc to implementation, 8.15 must be reopened *as part of that scope*.
3. **Expo upstream adds first-class SQLCipher support.** If a future Expo SDK ships `expo-sqlite` with a `cipher` build flag, the integration cost collapses from ~2 weeks to ~1 day. At that point the cost-benefit flips. Watch the Expo SDK changelog and the `expo-sqlite` GitHub repo.
4. **A user with documented elevated-threat needs adopts Drift.** Activists, journalists, healthcare workers handling regulated financial data. The casual threat model is no longer the right one for the target user.
5. **Receipt-blob encryption ships independently.** If a future task encrypts the WebP files, then SQLCipher becomes the natural complement and the §6.4 incoherence disappears. Bundle the two.

---

## 9. Cross-references

- `docs/09-roadmap/execution_roadmap.md` row 8.15 — original task line
- `docs/09-roadmap/long_term_strategy.md` §10 — threat-model framing
- `docs/10-final/master_roadmap.md` line 855, 1008 — strategic placeholders SQLCipher is meant to fill
- `docs/10-final/post_187_supplement.md` line 40 — confirms this spike was scoped to 8.15 (not duplicated in PS-tasks)
- `docs/10-final/cloud-sync-spike.md` — the companion 8.16 doc; multi-device sync is one trigger condition (see §8 above)
- `app/src/db/index.js` — current `getDB()` open path; the PRAGMA-ordering constraint in §6.3 lives here
- `app/src/backup/` — the 8.8 backup module that interacts with §6.2
- `app/src/features/lock/` — the 8.11 biometric/PIN lock referenced throughout

---

## 10. Decision record

- **Decided:** 2026-05-26.
- **Verdict:** NO-GO today; deferred with explicit trigger conditions in §8.
- **Reviewed by:** Akshat Singhal (sole maintainer).
- **Next review:** On occurrence of any §8 trigger, or in 12 months (2027-05) — whichever is sooner.
