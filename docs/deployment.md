# Deployment — Mirror v0.1 (Release Stage 1)

> Mirror v0.1 ships the complete Tier-D Android on-device experience (5-tab Frosted Horizon shell, day-clipped `UsageEvents` foreground totals matching Digital Wellbeing with `Stored` / `Approximate` badges on older days, `IQS v2`, and P3 `J4` / `J9` / `J11` / `J18` / `J20`) with a signed APK/AAB pipeline, merged-manifest gate (`INTERNET` removed in release), OTA guard, offline guard, and privacy canary. `TIERS.B` (`Your export`) and OAuth connectors remain unavailable until P5.

## 30-minute quickstart (fresh checkout → phone)

```bash
# 0. Prereqs: Node 22.13+, JDK 17, Android SDK 36, adb, device or emulator
git clone https://github.com/Piyush53SN/Mirror.git
cd Mirror
npm ci
npm run verify              # tokens, lockfile, typechecks, lint, all tests, secret scan, bundle check
npm run release:check-version

# 1. Android build + manifest gate (same as CI)
make android-build          # Expo prebuild + Gradle assembleDebug + merged-manifest gate
# Expected: BUILD SUCCESSFUL, gate ok, no SYSTEM_ALERT_WINDOW, no ACCESS_LOCAL_NETWORK

# 2. Build release APK (either upload-signed via MIRROR_UPLOAD_* env vars, or debug-signed for phone testing)
# See docs/RELEASE_SIGNING.md for external upload-keystore setup.
cd apps/mobile/android
./gradlew :app:processReleaseManifest --no-daemon
cd ../..
npm run android:manifest -- --variant release --json .reports/merged-manifest-release.json

cd apps/mobile/android
./gradlew :app:assembleRelease          # uses MIRROR_UPLOAD_* if exported, else falls back cleanly
ls -lh app/build/outputs/apk/release/app-release.apk

# 3. Install on device
adb install -r app/build/outputs/apk/release/app-release.apk
# Open Mirror, grant Usage Access, use 2-3 apps, tap Refresh:
#   - Home per-app totals match Settings -> Digital Wellbeing within max(10%, 60s)
#   - Older days beyond Android's UsageEvents buffer show explicit Stored or Approximate badges
#   - Sessions shows open times only + optional explicit intent labels (duration hints never count)

# 4. Release Stage 1 preflight + OTA guard + offline check (no signing material in repo)
cd ../..
make release-stage1
# Runs: bump-version.mjs --check, release-preflight.mjs, check-ota-guard.mjs, check-offline.mjs

# 5. Privacy canary (Step 5 runs full emulator + mitmproxy against the signed release APK)
make privacy                 # JS self-test + scanner tests + Python mitmproxy addon tests
npm run test:privacy
```

Total: <30 min on a machine with the Android SDK.

## Version & changelog management (Step 4)

All distributable manifests and Gradle metadata stay locked to the same release version (`0.1.0`, `versionCode: 1`):

```bash
# Verify version alignment across package.json, apps/mobile/{package.json,app.json},
# apps/mobile/android/app/build.gradle, apps/extension/{package.json,manifest.json},
# packages/ui/package.json, and package-lock.json:
npm run release:check-version

# Bump version offline in lockstep (when cutting a future release):
node scripts/release/bump-version.mjs 0.2.0 --version-code 2

# Regenerate CHANGELOG.md for a release tag:
node scripts/release/changelog.mjs v0.1.0
```

## Tag-triggered release pipeline

**Trigger:** push tag `v*` (e.g. `v0.1.0`, `v0.2.0`) **after** Step (5) signed-APK privacy canary passes.

```yaml
on:
  push:
    tags: ['v*']
```

**Tracked workflow source:** `infra/workflows/release.yml` (sync to `.github/workflows/release.yml` via GitHub Web UI or a token with `workflows` scope before pushing `v0.1.0`).

1. **Version & Tag Check:** `node scripts/release/bump-version.mjs --check` plus check that `v${expo.version}` equals the pushed tag (`v0.1.0`).
2. **Verify + Guards:** `npm run verify`, `check-ota-guard.mjs`, `check-offline.mjs`, `npm run test:privacy`, `make release-stage1`.
3. **Manifest Gates:** `make android-build` (debug gate) and `:app:processReleaseManifest` + `npm run android:manifest -- --variant release` (`INTERNET` removed in release; `ACCESS_NETWORK_STATE` kept only for `WorkManager`).
4. **Signed Build (`docs/RELEASE_SIGNING.md`):**
   - When `MIRROR_UPLOAD_KEYSTORE_BASE64`, `MIRROR_UPLOAD_STORE_PASSWORD`, and `MIRROR_UPLOAD_KEY_ALIAS` secrets are set, builds upload-signed `mirror-v0.1.0-release.apk` and `mirror-v0.1.0-release.aab` via `with-release-signing.js`.
   - Otherwise falls back to `DEBUG_KEYSTORE_BASE64` (`mirror-test.apk`, phone-testable, not for Play Store).
5. **Changelog & GitHub Release:** Runs `node scripts/release/changelog.mjs $TAG` and publishes the GitHub Release with `CHANGELOG.md`, APK/AAB artifacts, and merged-manifest audit JSON reports.

## OTA guard (`scripts/android/check-ota-guard.mjs`)

Spec §2.10: *Deployment, OTA and remote config can never add collection, permissions or outbound data. The app works with the backend off.*

- `app.json` `expo.updates.enabled` must be `false` or absent (or narrow-only `ON_ERROR_RECOVERY` with `extra.remoteConfig = "narrow-only"` and no custom OTA URL).
- `extra.telemetry` must be `false`; `extra.privacyModeDefault` must be `"private"`.
- `android.permissions` allows only `PACKAGE_USAGE_STATS` (plus optional local `POST_NOTIFICATIONS` / `VIBRATE`); `blockedPermissions` blocks `SYSTEM_ALERT_WINDOW`, `ACCESS_LOCAL_NETWORK`, `QUERY_ALL_PACKAGES`, `AD_ID`, location, camera, contacts, call log, SMS, and microphone.
- Rejects forbidden analytics/tracking SDKs in `package.json`.

## Offline test (`scripts/android/check-offline.mjs`)

- Verifies `android.allowBackup === false` (prevents restoring encrypted `mirror.db` without its device-bound `SecureStore` key).
- Verifies no forbidden analytics/tracking SDKs (`firebase`, `amplitude`, `mixpanel`, `segment`, etc.).
- Verifies mobile app never imports `services/api` (`MirrorStore` runs 100% locally on `expo-sqlite`).
- Scans configuration and workflow files for accidental secrets (`EXPO_TOKEN`, private keys, AWS keys).

## v0.1 Checklist vs Spec

| Surface | Spec Requirement | v0.1 Status | Evidence |
|---|---|---|---|
| 5-tab Frosted Horizon shell | `Home · Insights · Journey · Sessions · You`, dark-first, accessible | ✅ Done | `MirrorTabShell`, `HomeTab`, `InsightsTab`, `JourneyTab`, `SessionsTab`, `YouTab`, `TabBar` |
| Per-app daily totals | Match Digital Wellbeing within `max(10%, 60s)` | ✅ Done | `computeDayForegroundTotals` clips raw `UsageEvents` strictly to `[00:00, min(now, 24:00)]`, eliminating `INTERVAL_DAILY` pre-midnight bucket bleed |
| Older-day source honesty | Explicit label once OS `UsageEvents` buffer rolls off | ✅ Done | `resolveDayForegroundTotals` surfaces `'stored_events'` (**Stored**) vs `'os_bucket_approx'` (**Approximate**) across `Home`, `Insights`, `Journey`, and `DebugView` |
| Sitting-span reconciliation | `Home`, `Insights`, `IQS`, and `Sessions` agree 1-for-1 | ✅ Done | `buildCanonicalDaySittings` + `sumSittingSpanMs` + `sessionBands` sum invariant |
| J7 / J17 IQS v2 & Why sheet | Dynamic max (`/55` / `/75`), minimum-activity floors, never rescaled to 100 | ✅ Done | `scoring.ts` (`IQS_METRICS_VERSION = 2`), `WhyScoreSheet.tsx` |
| J8 Sessions & explicit labels | Open times only, optional explicit labels, duration hint never counts | ✅ Done | `SessionsTab.tsx`, `countExplicitLabels`, one-tap `Clear stored labels` |
| P3 J4 / J9 / J11 / J18 / J20 | Honest `orphans <= 50` & `gaps <= 100` gate + multi-day floors | ✅ Done | `evolution.ts` (3d), `discovery.ts` (3d), `rabbithole.ts` (3d), `whatif.ts` (`Estimate`), `focuswindows.ts` (21d & 5+/cell, zero diagnosis copy) |
| Degraded-tier honesty (Step 1) | `TIERS.B` unavailable for v0.1, no OAuth claim before P5 | ✅ Done | `packages/ui/src/tiers.ts`, `YouTab.tsx` |
| Merged release manifest (Step 2) | `INTERNET` removed in release, forbidden permissions blocked | ✅ Done | `remove-forbidden-permissions.js`, `check-merged-manifest.mjs`, Gradle CI verified |
| Release signing (Step 3) | External keystore via env/Gradle properties, zero secrets in repo | ✅ Done | `with-release-signing.js`, `docs/RELEASE_SIGNING.md`, `release-preflight.mjs` |
| Release prep & guards (Step 4) | Version alignment (`0.1.0`), `CHANGELOG.md`, Stage-1 + OTA + offline guards | ✅ Done | `bump-version.mjs`, `changelog.mjs`, `CHANGELOG.md`, `make release-stage1` |
| Signed-APK privacy canary (Step 5) | Emulator + `mitmproxy` zero-outbound/zero-canary proof on signed APK | ⏭️ Next (Step 5) | `scripts/privacy/android-emulator.sh`, `infra/workflows/privacy-canary.yml` |
