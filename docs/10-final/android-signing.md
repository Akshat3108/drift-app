# Drift — Android release signing & secrets management

> **Audience:** future-you (and any contributor with release-cut authority).
> **Status:** Closes task tracker items **1.10** (production keystore + signing config) and **1.11** (R8 minify + ProGuard).
> **Last updated:** 2026-05-18

---

## TL;DR

| Item | Value |
|---|---|
| Keystore file | `~/.drift/drift-release.jks` (PKCS12, **outside** the repo) |
| Key alias | `drift-release` |
| Key algorithm | RSA 4096 |
| Validity | 10000 days (until 2053-10-03) |
| Certificate DN | `CN=Drift, O=Drift, C=IN` |
| SHA-256 fingerprint | `6D:A7:71:E9:0A:41:5F:EB:6A:16:96:F5:6A:86:59:17:E2:D7:F9:3A:CE:A3:BD:F7:35:84:CA:CA:85:59:8B:BA` |
| Credentials | `app/android/keystore.properties` (gitignored) |
| Build command | `cd app/android && ./gradlew :app:assembleRelease` |
| R8 minify | **enabled** via `android.enableMinifyInReleaseBuilds=true` |
| Resource shrinker | **disabled** this pass (`shrinkResources=false`) |

If `keystore.properties` is missing at build time, release builds fall back to debug signing and Gradle prints a `WARNING:` line at configuration time. Never ship a debug-signed APK to a store listing.

---

## 1. What we changed (vs. the Expo prebuild defaults)

### `app/android/app/build.gradle`

1. Loads `app/android/keystore.properties` at configuration time via a `java.util.Properties` block. Missing file is non-fatal — Gradle just warns.
2. Adds `signingConfigs.release` populated from those properties (guarded by `if (keystorePropsFile.exists())`).
3. `buildTypes.release.signingConfig` is now ternary: production keystore when the file exists, debug keystore otherwise.

### `app/android/gradle.properties`

1. Added `android.enableMinifyInReleaseBuilds=true`. This is read by the `enableMinifyInReleaseBuilds` def in `build.gradle` which feeds `minifyEnabled` on the release variant. R8 is the AGP default backend, so this turns on R8 code shrinking, optimization, and obfuscation in one switch.
2. `android.enableShrinkResourcesInReleaseBuilds` is **not** set (defaults to false). Resource shrinking is the higher-risk part of R8 — it can drop drawables/strings that Reanimated or RN load reflectively. Re-evaluate after UI regression coverage exists.

### `app/android/app/proguard-rules.pro`

Expanded from a 2-line Reanimated stub to an explicit keep-rule set covering every JS-bridged or JNI-reflective module on the current dependency graph:

- React Native core (`NativeModule`, `JavaScriptModule`, `ViewManager` subclasses, `@ReactMethod`, `@ReactProp` / `@ReactPropGroup`, TurboModules)
- Hermes JS engine + JNI
- Reanimated 4 + common animator base
- All `expo.modules.**` (autolinked Expo SDK 54 modules)
- `expo-sqlite` JSI bindings
- `@react-native-ml-kit/text-recognition` + Google ML Kit `vision_text_*` internals
- `@react-native-community/datetimepicker`
- `expo-camera` (kept until QW-08 follow-up decides removal)
- Kotlin metadata + coroutines volatile fields

`-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod` and `-renamesourcefileattribute SourceFile` are set so crash reports remain readable even after R8 obfuscates class names.

### `app/.gitignore`

Defence-in-depth: `keystore.properties` is now explicitly ignored even though the whole `/android` tree is already gitignored by the Expo prebuild convention.

---

## 2. Where the secrets actually live

```
~/.drift/                          (mode 700)
└── drift-release.jks              (mode 600, PKCS12, 4096-bit RSA)

app/android/
├── keystore.properties            (mode 600, gitignored)
│   ├── storeFile=/home/akshat/.drift/drift-release.jks
│   ├── storePassword=<24-char base64>
│   ├── keyAlias=drift-release
│   └── keyPassword=<same as storePassword>
└── keystore.properties.example    (committed; template only, no secrets)
```

**Why this layout:**

- `~/.drift/` is outside the repo entirely → cannot be accidentally `git add`-ed.
- `keystore.properties` lives next to `build.gradle` for ergonomic reasons (the build script reads it from `rootProject.file('keystore.properties')`), but is gitignored on two axes:
  1. The whole `app/android/` tree is in `app/.gitignore` (Expo prebuild convention).
  2. An explicit `keystore.properties` entry in `app/.gitignore` as defence-in-depth.
- Both passwords are identical (industry standard for Android signing — a separate `keyPassword` only matters if multiple apps share a keystore, which Drift doesn't).

---

## 3. Backup discipline — read this before you forget

**If you lose the keystore OR the password, you can NEVER ship an update to the same Play Store listing.** You'd have to publish a new app under a different applicationId, ask every user to manually migrate, and Google won't help.

Required backups (do all three):

1. **Password manager** (1Password / Bitwarden / KeePass) — store an entry titled "Drift Android release keystore" with:
   - The 24-char password
   - The keystore path on this machine (`~/.drift/drift-release.jks`)
   - The SHA-256 fingerprint above
   - The alias (`drift-release`)
2. **Encrypted off-machine copy** — `gpg --symmetric ~/.drift/drift-release.jks` to a USB stick or external drive. Use a passphrase you remember (different from the keystore password).
3. **Cloud copy in an encrypted vault** — drop the `.gpg` from step 2 into Drive/Dropbox. Do NOT upload the raw `.jks`.

Re-verify backups annually. The keystore expires 2053-10-03 — set a calendar reminder for 2052 to plan a key rotation (this is a 10-year-out problem, but worth a flag).

---

## 4. Building a release APK

```bash
cd app/android
./gradlew :app:assembleRelease
# Output: app/android/app/build/outputs/apk/release/app-release.apk
```

Verify the APK is signed by the production cert (not the debug fallback):

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  app/android/app/build/outputs/apk/release/app-release.apk
# Expect: Signer #1 certificate DN: CN=Drift, O=Drift, C=IN
# Expect: SHA-256 digest: 6da771e90a415feb6a1696f56a865917e2d7f93acea3bdf73584caca85598bba
```

If the DN says `CN=Android Debug, O=Android, C=US`, the build fell back to debug signing — check that `keystore.properties` exists and Gradle did not print the WARNING line.

---

## 5. Rotating the keystore

You can only rotate signing keys via **Google Play App Signing** (Google holds the canonical signing key; you upload using an "upload key" that can be rotated). If you migrate to Play App Signing, the rotation flow is:

1. Generate a new upload keystore with `keytool -genkeypair ...` (same parameters as today, different password).
2. Update `keystore.properties`.
3. Build the next release with the new key.
4. Upload to Play Console — Google verifies the rotation against your old key once.

Until you opt into Play App Signing, **rotation is impossible** for the current installs. Sideloaded distribution (Drift's current channel) cannot rotate at all — installers see a new app entirely.

---

## 6. Cross-references

- `app/android/app/build.gradle` — signingConfigs.release block, build-time keystore.properties loading
- `app/android/gradle.properties` — `android.enableMinifyInReleaseBuilds=true`
- `app/android/app/proguard-rules.pro` — full keep-rule set
- `app/android/keystore.properties.example` — template for new contributors
- `docs/10-final/task_tracker.md` — completion log entries for 1.10 and 1.11
- `docs/09-roadmap/execution_roadmap.md:233` — original risk-mitigation note ("Use `secrets` block in build.gradle pulling from `~/.gradle/gradle.properties` or env vars"); this implementation lands a `keystore.properties` variant of the same idea with stricter file permissions.
