# Cloud-Sync Architectural Spike — Design Doc

> **Task:** 8.16 (Phase 5 §5.E — Architectural spikes, decision docs only)
> **Status:** Closed 2026-05-26
> **Output:** Design doc only. **No code is shipped under 8.16.** No schedule, no commitment to ship sync.
> **Verdict on architectural shape:** LWW per row + tombstones (§3) · Device-pair via QR handshake, no server account (§4) · Server is a dumb E2EE blob store (§5).
> **Author note:** This is the durable record of the architectural choices. Changing any of the three verdicts above requires updating this doc *and* the Decision-log entry in `task_tracker.md`.

---

## 1. Question being answered

If Drift ever ships opt-in multi-device sync, what does the architecture look like? Specifically:

- **Conflict resolution model** — CRDT or LWW?
- **Identity model** — what does it mean for two devices to "belong to the same user" when there is no server-side account?
- **Server's role** — what does the server have to know / do, and what stays on-device?

The roadmap line (`execution_roadmap.md` row 8.16) explicitly limits 8.16 to a design doc — "no implementation, no commitment to ship". This document is that deliverable.

---

## 2. Constraints carried forward

Three documents already pre-commit Drift to specific properties. The spike does not get to revisit them; it has to **fill in the design** consistent with them.

From `long_term_strategy.md` §8 (lines 771–780):

1. **End-to-end encryption.** User passphrase derives a key (Argon2id or PBKDF2-SHA256). Server stores ciphertext only.
2. **CRDT or last-write-wins per row.** No server-side merge logic; client resolves conflicts.
3. **UUID-keyed rows.** Schema must be UUID-ready before sync. (See §2.1 — there is a real gap here.)
4. **Delta sync, not full sync.** Track `updated_at` per row; sync only changed rows.
5. **Sync layer is a separate module.** Local-first behaviour unchanged when sync is disabled.

From `risk_analysis.md` lines 58–73:

6. App and backend schema disagree (TD-003). Any sync feature picks one schema or aligns them as a precursor.
7. App has never handled network state, conflict resolution, or distributed identity. Greenfield in all three.

From `master_roadmap.md` line 1009:

8. Sync is **opt-in, encrypted, and an architecturally optional add-on** — never a hard dependency. Drift must keep working with sync turned off, exactly as it does today.

From `final_assessment.md` line 366:

9. Phase 5 keeps the cloud-sync door open **without committing**. That means: have a coherent design, do not ship.

### 2.1 Honest accounting — the schema gap

The "UUID-ready, not UUID-now" rule in `long_term_strategy.md` §2.2 was an *aspiration that was never implemented*. Direct inspection of `app/src/db/schema.js` as of 2026-05-26 confirms:

- **Zero `uuid TEXT` columns** exist across 38 mutable tables.
- **Three** tables have `updated_at` (`saved_filters`, `merchant_aliases`, `receipt_templates`). The rest have only `created_at`.
- **All tables** have soft-delete via `deleted_at` (from v2). This is the one piece of sync infrastructure that genuinely is in place.

This means *every* sync proposal in this doc has a precursor migration block (call it **v43-precursor-sync-ready**): add `uuid TEXT NOT NULL DEFAULT (lower(hex(randomblob(16))))` and `updated_at TEXT NOT NULL DEFAULT (datetime('now'))` to every mutable table, unique-index the uuid columns, and update every repo's INSERT shape to stamp `updated_at` on every UPDATE. This is a one-task-per-table batch of ~30 tables, roughly 3–4 dev-days of careful work, **all of which must complete before sync code can be written**.

The doc treats this precursor as a known precondition for §3 onward.

---

## 3. Verdict 1 — LWW per row + tombstones (chosen)

### 3.1 Why LWW, not CRDT

A full CRDT (Automerge, Yjs, JSON-Patch + version vectors) is the academically correct choice for arbitrary-merge correctness. It is also a **substantial misfit** for Drift's actual workload:

| Drift's workload reality | What CRDT optimises for | Why LWW is enough |
|---|---|---|
| One user, one primary device. A second device (laptop, tablet) is the multiplier event — and even then, the user is the only writer on both. | Concurrent writers on the same row | Conflicts are vanishingly rare. The expected pattern is "edit on phone, glance on laptop", not "edit on both simultaneously". |
| Rows are flat — an expense has 15 scalar columns, no nested structures. Edits replace entire fields ("change amount from 480 to 580"), not text deltas. | Mergeable nested structure (rich text, tree of nodes) | Replacing the row's entire scalar payload on conflict is fine. |
| The user can see and re-edit any mismatch. There is no "this conflict is now permanent" failure mode. | Automatic merging where human review is impossible | A user who notices "I expected 580, it shows 480" can fix it in the UI. |
| ~100KB of JS for Automerge/Yjs is significant on a phone with already-tight startup budget (Drift's cold-start budget is ~1.2s on mid-tier Android). | Correctness over bundle size | LWW is ~200 lines of conflict-resolution code, zero new deps. |
| The user is the same person on both devices. There is no merging-of-divergent-intents problem. | Multiple users converging on shared state | Single-user multi-device is a much weaker model than multi-user. |

**Decision: LWW per row, with `updated_at` as the conflict tiebreaker and `deleted_at` as a tombstone.**

### 3.2 LWW conflict semantics

The rule, applied per row identified by `uuid`:

```
on receive(remote_row):
  local = SELECT * FROM <table> WHERE uuid = remote_row.uuid
  if local IS NULL:
    INSERT remote_row                                  # straightforward insert
  else if remote_row.updated_at > local.updated_at:
    UPDATE <table> SET <all columns> WHERE uuid = remote_row.uuid    # remote wins
  else:
    # local wins, do nothing
```

Tombstones:

- A delete on device A sets `deleted_at = datetime('now')` (the soft-delete pattern Drift already uses since v2).
- On sync, the tombstone row is sent to device B exactly like any other update.
- Device B applies it the same way — `deleted_at` is just another column in the LWW comparison.
- Tombstones persist; they are never hard-deleted. (Today Drift hard-deletes on user delete, per the current Recycle Bin-not-shipped state. Sync changes this: hard-delete becomes "set deleted_at AND mark for purge after 90-day grace, after every paired device has acked".)

### 3.3 Edge cases LWW handles correctly

| Case | What happens |
|---|---|
| User edits on phone (offline), then opens laptop (online), the laptop pulls. | Laptop's older row → phone's newer row wins on next phone sync. |
| User edits on both devices while both offline; phone reconnects first, laptop reconnects an hour later. | Whichever device has the later `updated_at` wins. The user sees their later edit reflected; the earlier edit is overwritten. |
| User deletes on phone, edits on laptop, both reconnect. | Whichever wall-clock timestamp is later wins. If the delete was later: row is tombstoned. If the edit was later: row is alive with the edited content. |
| Phone clock is wrong by a day. | This is the LWW failure mode. See §3.4. |

### 3.4 Edge cases LWW handles poorly — and the mitigations

**Clock skew.** If device clocks drift, `updated_at` ordering becomes adversarial. Mitigations:

1. **Stamp `updated_at` server-side on commit if possible.** But the server is a dumb blob store (see §5), so it cannot. Reject this option.
2. **Use a hybrid logical clock (HLC).** Each device's clock is the device's `Date.now()` plus a monotonic counter, packed into a single sortable string. On receiving a remote row, advance the local clock to `max(local, remote)+1` before next write. This keeps causality intact even when wall-clock skews. **Recommended.**
3. **Stamp both `updated_at` and `version` (monotonic per device).** Use version as a tiebreaker. More state, fewer wins. Not recommended.

Adopt HLC at sync-implementation time. It is a 30-line helper, fits in `app/src/sync/clock.js`, costs nothing if sync is off.

**Same-row-edit conflict.** The 2-device-edit-same-row-while-both-offline case is the one where LWW loses data — whichever edit is "earlier" disappears.

Mitigations:

1. **Show the user a "conflict" toast on resolve.** If we detected that the incoming row replaced a still-fresh local edit (local updated_at within 24h), surface "Phone's edit to '<merchant>' was overwritten by laptop. Tap to review." Stores both versions in `sync_conflicts` table for review. Adds UX surface; worth it.
2. **Field-level LWW instead of row-level.** Track `updated_at` per *column*. Substantially more state per row (~15× for `expenses`). Engineering cost: high. Benefit: only matters in the same-row-different-field case, which is rare. **Not recommended for v1 sync; revisit if telemetry shows real conflicts.**
3. **Operational tombstone for amount-changing edits.** Treat `expenses.amount` as monetary-truth and prevent silent overwrites by always surfacing a confirmation. Out of scope here.

### 3.5 What does NOT sync (device-local-only)

Not every table is user data. Some are derived, some are per-device telemetry, some are caches:

| Table / data | Reason it stays local |
|---|---|
| `db_stats`, `db_slow_log` (8.10) | Per-device performance counters. Telemetry, not user data. |
| `monthly_summary`, `item_summary` | Trigger-maintained rollups. Re-derived from `expenses` + `receipt_items` on apply. **Faster** to recompute than to sync. |
| `expense_fts`, `item_fts`, `products_fts` | FTS5 shadow indexes. Re-derived from source columns. |
| `analytics_cache` | Memoised analytics output. Cheaper to recompute. |
| `settings.last_maintenance_at`, `settings.app_lock_enabled` | Per-device. Maintenance gate (8.7) and biometric lock (8.11) toggle are device-specific. |
| `notification_log` | Per-device — what notifications fired here. |
| `csv_imports` | Per-device import-batch audit trail. Could plausibly be synced but is low value and high volume. |

The remaining ~25 tables sync. The split needs to be made explicit at sync-implementation time via a `SYNCABLE_TABLES` constant similar to `TABLES` in `schema.js`.

### 3.6 Receipt blob sync

Receipt WebPs live at `documentDirectory/drift/receipts/{full,thumb}/YYYY/MM/<uuid>.webp` (shipped 8.6) and are referenced from `expenses.receipt_uri` + sha-1 hashed into `expenses.receipt_image_hash` (v39).

**Sync model:**

- The blob server is content-addressed by sha-1. URL: `https://<bucket>/blobs/<sha1>`.
- When syncing an `expenses` row whose `receipt_image_hash` is non-null and the blob is missing locally, fetch it from the blob store on demand (lazy — when the user opens the `Detail` screen).
- When the local device has a blob the server doesn't, upload it on next sync. Since the blob is content-addressed, dedup is automatic — two devices that both scan the same physical receipt produce the same sha-1, the server stores one copy.
- Blobs are encrypted client-side with the device-pair key (§4) before upload. Filename on the server is the sha-1 of the **plaintext**, not the ciphertext, so dedup works.

Cost: ~50KB per receipt × the user's archive. A 5-year heavy user is in the 1–3GB range. Bandwidth-bounded, not CPU-bounded. The blob fetch path naturally falls back to "missing image" if the device is offline.

### 3.7 Sync log + write path

Most repos today directly call `db.runAsync('INSERT INTO ...')` or `db.runAsync('UPDATE ... SET ...')`. To make sync work without polluting every repo, two options:

**Option A — Sync log table.** A new `sync_log` table that triggers fire on every INSERT / UPDATE / DELETE on each syncable table. Each entry: `(uuid, table_name, op, updated_at)`. The sync worker reads from this log instead of scanning every table. Cheap. Bounded growth (sync worker truncates after acking). **Recommended.**

**Option B — Scan all tables periodically.** Use the existing `updated_at` column to find changed rows. Simpler — no triggers — but O(table_count × row_count) per sync. Acceptable for small datasets, scales poorly. Not recommended.

The sync log + trigger approach also gives a natural place for HLC-stamping: the trigger stamps `updated_at` from the HLC at write time, eliminating the "did the repo remember to stamp updated_at?" failure mode.

---

## 4. Verdict 2 — Identity = device-pair via QR handshake (chosen)

### 4.1 Why device-pair, not email/OTP

`long_term_strategy.md` line 1 commits Drift to "every receipt scan enriches an on-device knowledge graph — none of which leaves the device". Email/OTP-based identity introduces a server-side user record. Even if the data itself is E2E-encrypted, the **existence of an account** is a server-side artefact that:

- Requires the user to remember a password (or have a recovery email working).
- Creates a regulatory surface (account → user → KYC-able under some interpretations of Indian data law for fintech-adjacent apps).
- Creates a recovery story (forgot password) that compromises the threat model.

Drift's value proposition is "no account, fully offline". Multi-device sync should *not* break that.

### 4.2 The device-pair flow

Initial pair (typically on phone, going to add laptop or tablet):

```
PHONE                                         LAPTOP
─────                                         ──────
Settings → "Add device"                       Settings → "Add device" → "Receive"
  ↓                                             ↓
generate device_key_pair (Ed25519)            generate device_key_pair (Ed25519)
generate sync_key (32 random bytes)             (waits for QR)
show QR encoding:
  { sync_key, phone_pubkey, server_url }      scans QR
                                                ↓
                                              save sync_key locally
                                              save phone_pubkey as "trusted peer"
                                              send signed handshake to phone via the
                                              short-lived pairing channel
                                                ↓
verify handshake signature                    save laptop_pubkey as "trusted peer"
both devices now know the same sync_key
and each other's pubkeys
```

Server's role in pairing: **none.** The QR is exchanged optically; the handshake message can go through the server but is signed end-to-end so the server is just relaying bytes.

After pairing, both devices:

- Encrypt every payload with the same `sync_key` (or with a key derived from it via HKDF for forward-secrecy on the wire).
- Sign every payload with their device-specific `device_key`.
- Refuse payloads not signed by a trusted peer.

### 4.3 Recovery

If the user loses their phone (the only paired device) without first pairing a second device, **there is no recovery.** This is the same operational reality as the 8.8 backup passphrase: forgotten = lost forever. It is the explicit cost of refusing server-side identity.

Mitigations:

- The Profile screen, when sync is enabled, must include a prominent "Pair a second device now — recovery is impossible without one" prompt.
- 8.8's encrypted backup remains the user's actual safety net. Sync is for convenience, not durability.

### 4.4 Adding a third device

Same QR handshake from any already-paired device. The sync_key is shared; the new device generates its own pubkey and is added to both other devices' trusted-peer sets.

### 4.5 Revoking a device

If a paired device is lost / sold / compromised:

- The user, on a remaining device, removes the lost device's pubkey from the trusted-peer set.
- Subsequent payloads from the lost device are rejected by remaining devices.
- The sync_key is **rotated** (a new sync_key is generated, all remaining devices switch to it, the lost device cannot decrypt new payloads).
- Old data on the server, encrypted under the old sync_key, is still readable by the lost device — but new data is not.

This is acceptable for the threat model. A truly compromised device with the old key has access to historical data **only** up to the revocation moment.

### 4.6 What the server sees

The server sees:

- Opaque ciphertext payloads.
- Routing metadata: device public keys (no association to email / phone number / user ID).
- Timestamps of when each device synced.

The server does **not** see:

- Any expense data, item names, amounts, dates, merchant names.
- Any unencrypted user identifier.
- A "user record". There is no user record. There are only device pubkeys that happen to share a sync_key.

### 4.7 No-server fallback — manual sync

The QR handshake fundamentally requires no server during pairing; the only server use is post-pair sync. Drift can offer a **no-server mode**: paired devices, when on the same Wi-Fi, sync directly peer-to-peer via mDNS + a TCP socket. Same crypto, no server. **Recommended as the default**; cloud server is the convenience option.

This makes Drift's sync architecturally identical to Syncthing in spirit: device-paired, end-to-end, server-optional.

---

## 5. Verdict 3 — Server is a dumb E2EE blob store (chosen)

### 5.1 Interface

The server exposes ~5 endpoints:

```
POST /v1/upload         (auth: signed by device_key, body: ciphertext + metadata header)
GET  /v1/poll?since=<hlc>   → list of payload IDs newer than the HLC
GET  /v1/download/<id>  → raw ciphertext
DELETE /v1/payload/<id> (auth: signed by device_key) — for tombstone-of-tombstone cleanup
POST /v1/heartbeat      → record last-seen for the device pubkey
```

**The server cannot:**
- Decrypt anything.
- Merge anything (the spec is "store ciphertext blobs, return them on request").
- Reject based on content (it sees only opaque bytes).
- Associate devices with users (there are no users).

The server **can** rate-limit by source IP or device pubkey signature count, and **must** garbage-collect blobs that haven't been polled in 90+ days when their author asks for delete.

### 5.2 Server implementations that satisfy the interface

Any of these work:

- **Self-hosted Backblaze B2 / S3 bucket + a tiny `index.json` of HLC → object-key.** Cheapest. ~$0/month per active user under B2's free tier. Setup is a config-screen field: "Sync server URL".
- **A custom Drift backend.** The `/backend` directory already exists (pre-pivot scaffolding). Rewrite minimally to expose the 5 endpoints. Stateless service + a single Postgres table `(id, device_pubkey, ciphertext, hlc, created_at)`.
- **BYO bucket — user supplies S3-compatible credentials.** Drift uses them directly. Most paranoid users will prefer this. Highest setup friction.

The Drift v1 sync release should target *all three* — making the sync layer back-end-agnostic via an `app/src/sync/transport.js` shape that abstracts the 5 endpoints. The user picks at pair time.

### 5.3 What it doesn't need

A server-side database for users, accounts, sessions, password hashes, recovery emails, JWTs, OAuth integration, rate limiters tied to user identity, abuse-reporting infrastructure. Drift's threat model carries no "abuse user" because there is no inter-user contact surface. The server's risk surface is exactly: blob store + auth via signature.

### 5.4 Operational considerations

- **Backups of the server.** Sync server is *not* the source of truth — every paired device has the full data. A wiped server costs only the in-flight payloads younger than the most-recently-synced device. Not load-bearing.
- **TLS.** Required for the transport, but the payload is already E2E-encrypted, so TLS termination at the bucket's CDN edge is fine.
- **Quota.** A 5-year heavy user is in the 1–3GB range (mostly receipt blobs). $0.005/GB/month on B2 → ~$0.015/user/month. Self-funded operationally for a small user base; the BYO-bucket option offloads cost entirely.

---

## 6. Module boundary — how sync hooks the app

The constraint is `long_term_strategy.md` rule 5: *"Sync layer is a separate module. Local-first behaviour unchanged when sync is disabled."*

### 6.1 Proposed module layout

```
app/src/sync/
├── index.js            — public surface: start() / stop() / pairDevice() / unpairDevice()
├── transport.js        — pluggable: HTTP(S) | mDNS+TCP | BYO-S3
├── clock.js            — HLC stamping
├── envelope.js         — encrypt / sign / verify / decrypt
├── log.js              — read/write sync_log table; truncate on ack
├── apply.js            — LWW resolver: takes a remote row + writes to repo
├── tasks/              — analogous to maintenance/tasks/
│   ├── pollIncoming.js
│   ├── pushOutgoing.js
│   └── reconcileTombstones.js
└── conflicts.js        — surfaces sync_conflicts to the UI
```

### 6.2 Repo touchpoints

Every mutable repo gets **one** change: the existing `INSERT`/`UPDATE`/`DELETE` statements gain `updated_at = ?` parameters, stamped from `clock.now()` (HLC). No repo needs to know about transport, encryption, peers, or LWW. The sync log table fills in via triggers — no repo needs to write to it explicitly.

This is testable: existing repo unit tests continue to pass with `clock.now()` mocked to `Date.now()`-equivalent values. The sync module itself can be unit-tested independently with a fake transport.

### 6.3 When sync is disabled

`app/src/sync/index.js` exports `start()` and `stop()`. If `settings.sync_enabled !== 1`, nothing in the sync module runs. The triggers that maintain `sync_log` still fire (cheap UPSERTs), but the log is simply truncated periodically by the 8.7 maintenance job. Zero impact on the local-first user.

### 6.4 Initial sync handshake (after pairing)

When device 2 pairs with device 1 (which has full history), device 2 has nothing. Initial sync is a bulk fetch: device 1 packages its current state as a series of encrypted payloads, uploads to the transport, device 2 polls and applies in order. For a 5-year-old account this is ~50MB DB + ~1–3GB blobs. Phase initial-sync into:

- Tier 1 (immediate, ~5MB): all syncable scalar tables. App is usable.
- Tier 2 (background, ~50MB): full DB sync (everything in tier 1 just verifies).
- Tier 3 (lazy, on access): receipt blobs. Fetched when the user opens a `Detail` screen for an expense whose blob isn't local yet.

This three-tier strategy is the standard for offline-first multi-device apps and avoids blocking the user behind a multi-GB initial sync.

---

## 7. Explicit non-goals

The doc deliberately does NOT cover:

- **Multi-user sharing.** Drift is single-user. Sharing a budget with a partner = future Phase 6+ feature; not in scope.
- **Real-time sync.** Sync is polled (~1 min interval when foregrounded, on bg→fg, on user-trigger). Not WebSocket-based. Real-time is a 10×-effort upgrade that has no clear UX benefit for a single user.
- **Server-side full-text search.** The server sees only ciphertext. FTS5 stays per-device.
- **Server-side analytics.** Same.
- **Sharing receipt blobs publicly.** Blobs are E2E-encrypted with the device-pair key. No share-link feature.
- **Web-app access.** Out of scope. If a web client ships, it must implement the same sync protocol; the architecture above accommodates it.
- **iOS.** Drift is Android-first. iOS support would inherit this sync model unchanged but is not in scope.
- **A specific schedule.** This doc does not say *when* sync ships. That decision is gated on §8.

---

## 8. Trigger conditions to actually start shipping

This is a design-doc-only spike. Implementation should start when:

1. **Multiple paying users explicitly request multi-device.** Drift is currently single-user-self-use. Real demand from real users (not the developer's intuition) gates the work.
2. **The §2.1 schema gap is closed.** A precursor task (v43 — UUID + updated_at on every mutable table) must ship before any sync code. That precursor is **also a precondition for SQLCipher** if 8.15 is ever reopened, which means it is good infrastructure work to do speculatively if a slow week opens up.
3. **At least one paired-device exists in the test fleet.** The developer needs a real second device (tablet, laptop emulator) to test pairing flows end-to-end. Mock-only testing is insufficient for sync.
4. **A decision has been made on the server hosting model.** Per §5.2, the three options are self-hosted bucket, custom backend, BYO bucket. Pick one as the v1 default before starting; the others can come later.

When all four are true, the work is roughly:

| Phase | Scope | Effort |
|---|---|---|
| Precursor | v43 — UUID + updated_at on every mutable table; per-repo INSERT/UPDATE updates; backfill task | 3–4 dev-days |
| HLC + sync_log | `clock.js`, `sync_log` table v44, triggers on every syncable table | 2 dev-days |
| Envelope + transport | `envelope.js`, HTTP(S) transport, BYO-bucket transport, mDNS+TCP transport | 4–5 dev-days |
| Pairing UI | QR-gen + QR-scan flow, pair / unpair / list-devices screens | 2 dev-days |
| Apply / LWW resolver | `apply.js`, conflict surface, sync_conflicts table | 3 dev-days |
| Initial sync (3-tier) | Tier 1 / 2 / 3 logic, progress UI | 2–3 dev-days |
| Receipt blob sync | Content-addressed upload / lazy fetch, integration with `media/receipts.js` | 2 dev-days |
| End-to-end test fleet | 2-device pairing, conflict scenarios, network-flapping, clock skew | 5+ dev-days |
| **Total** | | **~24 dev-days ≈ 5 weeks** |

This is the realistic ship cost of a usable v1. The roadmap's 2-day "spike" budget is for the doc you are reading; the spike is **not** the implementation budget.

---

## 9. Why not just stick with 8.8 manual backup?

The 8.8 backup feature, today, gives the user a manual sync story:

1. Phone creates `.driftbackup` → shares to Google Drive.
2. Laptop downloads from Drive → 8.8 restore.
3. Laptop now has phone's data.

This **works**. It is also extremely awkward:

- The restore is **destructive** — laptop's local data is replaced wholesale.
- There is no incremental sync — every cross-device handoff is a full backup+restore.
- Multi-direction edits are impossible — only one device can be "the truth" at a time.
- The passphrase has to be retyped on every restore.

8.8 is the **single-source-of-truth handoff** story; it is not a multi-device-collaboration story. For a power user who wants "edit on phone, view on laptop", 8.8 is insufficient. That power user is the target user for §3–6.

**However**, until §8's trigger conditions fire, 8.8 is the correct answer for the casual user. Most Drift users today probably do not need anything beyond 8.8.

---

## 10. Cross-references

- `docs/09-roadmap/execution_roadmap.md` row 8.16 — original task line
- `docs/09-roadmap/long_term_strategy.md` §8 (lines 771–780) — pre-committed properties this doc fills in
- `docs/01-current-analysis/risk_analysis.md` lines 58–73 — schema mismatch + sync gaps
- `docs/01-current-analysis/technical_debt.md` TD-003 — backend / app schema disagreement
- `docs/10-final/master_roadmap.md` lines 1009, 1024 — strategic placeholders
- `docs/10-final/sqlcipher-spike.md` §8 — multi-device sync is one of SQLCipher's revisit triggers; see also §3 of this doc for why
- `app/src/db/schema.js` — current 42-migration ladder; precursor v43 lives here
- `app/src/backup/` — 8.8 encrypted backup; the single-device handoff story sync supplements
- `app/src/features/lock/` — 8.11 biometric/PIN lock; orthogonal to sync, both stay on
- `app/src/media/receipts.js` — receipt blob storage; content-addressed via `receipt_image_hash` (v39); §3.6 of this doc relies on the sha-1 already being stored

---

## 11. Decision record

- **Decided:** 2026-05-26.
- **Conflict-resolution model:** LWW per row, HLC-stamped, with tombstones via `deleted_at`.
- **Identity model:** Device-pair via QR handshake. No server-side account.
- **Server role:** Dumb E2EE blob store. Three backends supported (self-hosted bucket, custom Drift backend, BYO bucket).
- **Implementation status:** None. Design doc only.
- **Reviewed by:** Akshat Singhal (sole maintainer).
- **Next review:** On occurrence of any §8 trigger, or in 12 months (2027-05) — whichever is sooner.
