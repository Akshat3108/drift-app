# Drift — Production build procedure

> **Audience:** Claude Code (and future-Akshat reviewing what Claude did).
> **Trigger:** Any user request that means "make a release APK" — e.g. "make a production build", "build an APK", "make a release", "build a new version for my phone".
> **Goal:** Produce an APK signed with the production keystore so it installs **over the existing app on the user's phone without uninstalling** (i.e. without data loss).
> **Last updated:** 2026-05-20

---

## Why this procedure exists

Android refuses to install an APK over an existing one with a different signing certificate. If a release build ever falls back to debug signing, the user is forced to uninstall + lose all data. Every step below either ensures the production keystore is used, or aborts before producing a poisoned APK.

The keystore + signing config is documented separately in `android-signing.md` — this doc is the **operational checklist** that wraps it.

---

## Defaults (override only if the user's request specifies otherwise)

| Decision | Default |
|---|---|
| versionCode | auto-increment by 1 from current value in `app/android/app/build.gradle` |
| versionName | unchanged (user bumps it manually when they want a semver change) |
| APK output dir | `~/Drift-builds/` (outside repo, alongside `~/.drift/` keystore) |
| APK filename | `Drift-v{versionName}-vc{versionCode}-{shortsha}{-dirty}.apk` |
| Source state | current working tree (do NOT stash or reset — surface dirty state, build from it) |
| Build type | `:app:assembleRelease` (never `assembleDebug`, never `npm run android` — those are debug-signed) |

If the request specifies a different versionName ("build v1.2.0"), set it. If the request says "don't bump versionCode", skip the bump. Otherwise these defaults stand.

---

## The procedure

### Step 1 — Pre-flight checks

Run all in parallel. **All must pass; if any fail, ABORT and tell the user what's missing.**

```bash
# 1a — production keystore present
test -f ~/.drift/drift-release.jks && echo "keystore: OK" || echo "keystore: MISSING"

# 1b — keystore credentials present (gitignored; never committed)
test -f /home/akshat/personal/ExpenseManager/app/android/keystore.properties \
  && echo "props: OK" || echo "props: MISSING"

# 1c — output dir exists (idempotent)
mkdir -p ~/Drift-builds

# 1d — apksigner on PATH (or fall back to $ANDROID_HOME/build-tools/<ver>/apksigner)
command -v apksigner >/dev/null && echo "apksigner: OK" || echo "apksigner: MISSING"

# 1e — surface working-tree state so user knows what's in the build
cd /home/akshat/personal/ExpenseManager
git status --short
git log -1 --oneline
```

**Failure handling:**
- `keystore: MISSING` → Stop. Tell user: production keystore at `~/.drift/drift-release.jks` is gone — without it, the next APK will be signed with a different cert and they'll have to uninstall + lose data. Point them at `docs/10-final/android-signing.md` § 3 (backup discipline) before doing anything else.
- `props: MISSING` → Stop. Tell user: `app/android/keystore.properties` is missing — `assembleRelease` would fall back to debug signing. They need to recreate it from `keystore.properties.example` with the real credentials from their password manager.
- Dirty working tree → Do NOT block. Just show the user `git status --short` output and confirm they're aware (the build will include uncommitted changes — usually fine, but worth surfacing).

### Step 2 — Read & bump version

Read current versionCode and versionName from `app/android/app/build.gradle` (defaultConfig block, around line 106–107).

Unless the user's request says otherwise, bump versionCode by 1 via `Edit`. Example: `versionCode 1` → `versionCode 2`. Leave versionName unchanged unless the request specifies a new one.

Show the user a one-line confirmation of what's being built:

> Building **versionCode {N}, versionName {X}** from `{branch}` @ `{shortsha}{-dirty if applicable}`.

Don't ask for approval — the user already asked for a production build. Just announce and proceed.

### Step 3 — Build

```bash
cd /home/akshat/personal/ExpenseManager/app/android
./gradlew :app:assembleRelease 2>&1 | tee /tmp/drift-build.log
```

This takes 2–5 minutes on a warm cache, longer cold. Run in foreground — the user is waiting on the artifact.

**Scan the log for showstoppers:**

| If you see… | Do this |
|---|---|
| `WARNING: keystore.properties not found` | **ABORT.** The build is debug-signed. Means Step 1b lied or the file disappeared mid-flight. Investigate. |
| `BUILD FAILED` | Surface the failing task + error to the user. Don't try to "fix and retry" without their direction. |
| `BUILD SUCCESSFUL` with no warning line | Proceed to Step 4. |

### Step 4 — Verify the APK is production-signed

This is the most important assertion in the entire procedure. **Skipping it defeats the point of everything above.**

```bash
APK=/home/akshat/personal/ExpenseManager/app/android/app/build/outputs/apk/release/app-release.apk
apksigner verify --print-certs "$APK"
```

Assert ALL of the following appear in the output:

- `Signer #1 certificate DN: CN=Drift, O=Drift, C=IN`
- `Signer #1 certificate SHA-256 digest: 6da771e90a415feb6a1696f56a865917e2d7f93acea3bdf73584caca85598bba`

**If either assertion fails, DO NOT hand the APK to the user.** Stop, report which assertion failed, and investigate (most likely cause: `keystore.properties` points at a different `.jks` or has stale credentials).

If both pass → the new APK will install over the user's existing app **without uninstalling**.

### Step 5 — Stage the output

```bash
cd /home/akshat/personal/ExpenseManager
SHA=$(git rev-parse --short HEAD)
DIRTY=$(git diff --quiet && git diff --cached --quiet || echo "-dirty")
VC=$(grep -E "^\s*versionCode\s" app/android/app/build.gradle | head -1 | awk '{print $2}')
VN=$(grep -E "^\s*versionName\s" app/android/app/build.gradle | head -1 | awk '{print $2}' | tr -d '"')
OUT=~/Drift-builds/Drift-v${VN}-vc${VC}-${SHA}${DIRTY}.apk
cp app/android/app/build/outputs/apk/release/app-release.apk "$OUT"
ls -lh "$OUT"
```

### Step 6 — Report

Send the user a short message with:

- ✅ APK path: `~/Drift-builds/Drift-v{X}-vc{N}-{sha}{-dirty}.apk`
- Size: `{from ls -lh}`
- versionCode → versionName: `{N}` → `{X}`
- Source: `{branch} @ {shortsha}{-dirty}`
- Cert: matches production (CN=Drift) ✅
- One-liner reminder: "Install on phone via `adb install` or USB transfer. Will upgrade the existing app **without data loss**."

That's it. Done. Do not also offer to push, tag, commit the versionCode bump, or open a PR unless the user asks.

---

## Edge cases

- **First production-signed install on the phone.** If the phone currently has a debug-signed or differently-signed APK, *this* install will still require uninstall + data loss — one final time. From the next build onwards, upgrades will be seamless. Mention this only if the user asks why their install is still failing.
- **`expo prebuild --clean` was run.** Regenerates the entire `app/android/` tree and wipes `keystore.properties`. Step 1b will catch it. Recovery: copy `keystore.properties.example` to `keystore.properties` and fill in real values from the password manager.
- **User asks to "just rebuild" right after a successful build.** Bumping versionCode again is fine and harmless; alternatively skip the bump if they explicitly say "same version".
- **User asks for a debug build / dev build.** Different procedure entirely (`npm run android` or `assembleDebug`). Don't follow this checklist — those are debug-signed by design and won't upgrade-in-place over a release install.

---

## Cross-references

- `docs/10-final/android-signing.md` — keystore mechanics, backup discipline, rotation policy
- `app/android/app/build.gradle:106–107` — versionCode / versionName
- `app/android/app/build.gradle:118–125` — release signing config
- `app/android/keystore.properties` (gitignored) — credentials Gradle reads
- `~/.drift/drift-release.jks` — the actual production keystore (PKCS12, mode 600)
- `~/Drift-builds/` — APK output staging directory (outside repo)
