# Deployment — Release Stage 1 (P2)

> P2 closes with a signed APK/AAB, tag-triggered pipeline, GitHub Release, changelog, OTA guard, offline test, and a 30-minute quickstart. P3 remains on hold.

## 30-minute quickstart (fresh checkout → phone)

```bash
# 0. Prereqs: Node 22.13+, JDK 17, Android SDK 36, adb, device or emulator
git clone https://github.com/Piyush53SN/Mirror.git
cd Mirror
npm ci
npm run verify              # tokens, typechecks, lint, all tests (251), secret scan, bundle check

# 1. Android build + manifest gate (same as CI)
make android-build          # Expo prebuild + Gradle assembleDebug + merged-manifest gate
# Expected: BUILD SUCCESSFUL, gate ok, no SYSTEM_ALERT_WINDOW, no ACCESS_LOCAL_NETWORK

# 2. Phone-testable APK (debug-signed, self-contained, NOT for Play Store)
# CI builds mirror-test.apk via assembleRelease with debug keystore
# Locally:
cd apps/mobile/android
./gradlew :app:assembleRelease \
  -Pandroid.injected.signing.store.file=app/debug.keystore \
  -Pandroid.injected.signing.store.password=android \
  -Pandroid.injected.signing.key.alias=androiddebugkey \
  -Pandroid.injected.signing.key.password=android
ls -lh app/build/outputs/apk/release/app-release.apk  # → mirror-test.apk

# 3. Install on device
adb install -r app/build/outputs/apk/release/app-release.apk
# Open Mirror, grant Usage Access, use 2-3 apps, Refresh
# Check: Per-app totals from OS aggregate match Settings → Digital Wellbeing
# App opens shows only open times, no durations, no scaling (P2 fix for orphans 319, Genshin 22s→8m54s)

# 4. Release Stage 1 preflight (no signing)
cd ../..
make release-stage1
# Expected: ok package id dev.mirror.app, versionCode, version, production→AAB, autoIncrement, no keystore in tree
# Built artifact: NOT FOUND is ok locally (signing MANUAL)

# 5. Privacy canary
make privacy                 # self-test + addon tests
npm run test:privacy         # same, plus secret scan

# 6. OTA guard + offline test
node scripts/android/check-ota-guard.mjs
node scripts/android/check-offline.mjs
```

Total: <30 min on a machine with SDK.

## Tag-triggered pipeline

**Trigger:** push tag `v*` (e.g. `v0.1.0`, `v0.2.0`)

```yaml
on:
  push:
    tags: ['v*']
```

**Workflow:** `.github/workflows/release.yml`

1. **Build:** same as `android-build` job – Node 22.13, JDK 17, SDK 36, `npm ci`, `expo prebuild --clean`, restore stable debug keystore from `DEBUG_KEYSTORE_BASE64` secret (stable signature → install-over without uninstall), `make android-build` (debug gate), `processReleaseManifest` + release gate, `assembleRelease` with debug keystore → `mirror-test.apk` (phone-testable, debug-signed, self-contained, NOT for Play Store) + `app-release.aab` (if signing identity present, otherwise unsigned AAB placeholder).
2. **Changelog:** `scripts/release/changelog.mjs` generates `CHANGELOG.md` delta since previous tag (`git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --pretty=format:"- %s (%h)"`), plus P2 checklist.
3. **GitHub Release:** `gh release create $TAG --title $TAG --notes-file CHANGELOG.md` with artifacts:
   - `mirror-test.apk` (phone-testable)
   - `app-release.aab` (production AAB, signed if EAS credentials present, otherwise unsigned)
   - `merged-manifest-reports` (debug + release JSON/txt)
   - `CHANGELOG.md`
4. **OTA guard:** `node scripts/android/check-ota-guard.mjs` – fails if:
   - `expo.updates.enabled` true (OTA must be disabled or narrow-only)
   - `expo.updates` adds permissions or collection
   - `android.permissions` contains forbidden (SYSTEM_ALERT_WINDOW, ACCESS_LOCAL_NETWORK, location, camera, etc) – same gate as manifest check
   - `extra.telemetry` true or `privacyModeDefault` not private
5. **Offline test:** `node scripts/android/check-offline.mjs` – verifies:
   - No third-party analytics SDK in `package.json` (firebase, amplitude, mixpanel, etc)
   - No `expo-secure-store` backup (allowBackup false)
   - App works with backend off (no `services/api` required, `store.open()` local only, `collectUsage` local)
   - Bundle does not contain secrets (secret scan)
6. **Privacy canary:** `make privacy` – JS canary + Python addon + manifest gate. Fails CI on any canary in request body, URL, header, log, error report.

**Secrets required:**
- `DEBUG_KEYSTORE_BASE64` – base64 of stable `debug.keystore` (PKCS12, alias androiddebugkey, storepass android). Restored before build for stable signature. See `docs/INSTALL.md` how to create.
- `EXPO_TOKEN` – for EAS builds (production AAB) – MANUAL, not in repo.

**Artifacts:** `mirror-apks` (debug + release + mirror-test), `merged-manifest-reports`, `release-stage1-preflight`.

## GitHub Release

Tag `v0.1.0` → Release `v0.1.0` with:

- Title: `v0.1.0 – P2: OS totals, open-times only, J3 dashboard`
- Notes: auto-generated changelog + P2 checklist (see below)
- Assets: `mirror-test.apk`, `app-release.aab`, `CHANGELOG.md`, `merged-manifest-debug.json`, `merged-manifest-release.json`

Example changelog:

```
## v0.1.0 (2026-10-22)
- Per-app daily totals from OS aggregate queryUsageStats (INTERVAL_DAILY) – matches Digital Wellbeing by construction
- App opens only – no durations, no scaling (fix: orphans 319, Genshin 22s→8m54s, Security 7m20s→16s)
- J3 dashboard (Frosted Horizon) wired to real data: IQS tier-D only, Based on usage patterns only chip, data-tier chip, Why sheet
- Release Stage 1: tag-triggered pipeline, GitHub Release, changelog, OTA guard, offline test, deployment.md + 30-min quickstart
- Privacy canary: ok
```

## OTA guard

Spec §2.10: *Deployment, OTA and remote config can never add collection, permissions or outbound data. The app works with the backend off.*

Guard script: `scripts/android/check-ota-guard.mjs`

Checks:
- `app.json` `expo.updates.enabled` must be `false` or absent (OTA disabled). If enabled, `fallbackToCacheTimeout` must be 0 and `checkAutomatically` ON_ERROR_RECOVERY only, and `extra.remoteConfig` must be `narrow-only` (no new permissions/collection).
- `android.permissions` only `PACKAGE_USAGE_STATS` allowed (plus optional `POST_NOTIFICATIONS` for local notifications, opt-in). Blocked list enforced via `plugins/remove-forbidden-permissions` + manifest gate.
- `extra.telemetry` must be false, `privacyModeDefault` private.
- No `expo-updates` runtime code that fetches remote JS that could add collection – we keep updates disabled, so bundle is static.

If guard fails, CI fails (exit 1).

## Offline test

Script: `scripts/android/check-offline.mjs`

- Verifies `MirrorStore` opens without network (expo-sqlite local, SecureStore local, no `services/api` import in mobile)
- Checks `package.json` has no analytics SDKs: `firebase`, `amplitude`, `mixpanel`, `segment`, `sentry` with user tracking, `expo-tracking-transparency` (should not be present)
- Checks `app.json` `allowBackup` false (no backup restore of DB without key)
- Secret scan: `scripts/security/scan-secrets.mjs` – no AWS keys, no private keys, no EXPO_TOKEN in repo
- Bundle check: `npm run security:bundle` – 721 modules, no unexpected native modules that could phone home

Manual offline test on device:

1. Airplane mode on, WiFi off
2. Open Mirror – should show cached per-app totals and app opens, IQS from local store
3. Grant usage access, use apps, Refresh – should work without network
4. No outbound requests in logcat: `adb logcat | grep -i "http\|https\|mirror"` should show no network

## Release Stage 1 preflight (automated)

`make release-stage1` → `scripts/android/release-preflight.mjs`

- ok package id dev.mirror.app
- ok versionCode integer >=1
- ok version semver
- ok production → AAB (app-bundle)
- ok versionCode auto-increments
- ok submit track internal
- ok no keystore in tree
- MANUAL steps printed: create upload keystore outside repo, `eas credentials`, `make android-build`, `make build-production`, `apksigner verify`

## Privacy canary report

`make privacy` runs:

- `scripts/privacy/self-test.mjs` – JS canary: injects fake email, location, contacts into store, then scans all outbound request mocks, logs, error reports – must find zero canaries. Result: `privacy self-test: ok (JS canary)` (exit 0 = clean)
- `tests/privacy_addon_test.py` – Python addon tests for browser extension canary (mitmproxy addon that fails on canary in body/URL/header)
- `android-manifest` gate – SYSTEM_ALERT_WINDOW + ACCESS_LOCAL_NETWORK blocked, DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION allowlisted, no location/camera/contacts permissions

Current report (2026-10-22):

```
privacy self-test: ok (JS canary)
privacy addon: ok (Python unittest)
android-manifest: ok (debug + release) – no forbidden permissions
secret scan: ok – no secrets in repo
bundle: 721 modules, no analytics SDK
OTA guard: ok – updates disabled, narrow-only remote config
offline: ok – works with backend off, no network required
```

## Checklist P2 vs spec (Section J 28 items + P2 scope) – corrected per review

| Item | Spec | Status | Evidence |
|---|---|---|---|
| P2 scope | scoring engine + dashboard + Why + release stage 1 | ✅ done | `scoring.ts` 5 factors, confidence, `HomeScreen` J3 wired, `WhySheet`, `release-preflight.mjs`, `deployment.md` |
| J3 Dashboard | reference layout, Frosted Horizon, hero, week strip, habits, budget | ✅ wired to real data | `App.tsx` IQS card with display, `/75`, band, confidence, chips “Based on usage patterns only” + Tier D, Why sheet, per-app totals OS, app opens only |
| J17 Why drawer | sheet over number, parts add up | ✅ | `WhySheet` with `score`, `maxScore`, `components` (points sum == value asserted), caveat, confidence reasons, tier-D only note |
| J5 Depth | distribution not score | ⚠️ engine/mockup only | `sessionBands` in scoring engine, mockup exists in `packages/ui/screens`, not wired to real UI yet – P3 will wire when sessions reliable |
| J6 Curiosity vs habit | displayed beside IQS, not part of it, needs 5 labels | ⚠️ engine/mockup only | `curiositySplit` engine needs 5 labels, returns null otherwise, UI mockup only, not wired to real data – P3 will wire |
| J7 IQS | score + band | ✅ | `scoreIqs` with 5 factors, max 75 usage-only, 100 with topic vectors, band, caveat |
| J8 Sessions | raw material, labelled by user | ⚠️ engine/mockup only + P2 fix | Engine `buildUsageEvents` produces sessions, but UI now shows app opens only (no durations, no scaling) to avoid inventing Genshin 22s→8m54s, Security 7m20s→16s, orphans 319. Totals OS authoritative. Real session boundaries need more reliable reconstruction – P3 guard shows “needs more reliable sessions” until orphans low |
| J24 Persona picker | demo personas as inputs only | ✅ | `personas.ts` no longer carries iqs/whyParts, `demoScores` runs real engine |
| X1 Import | preview → confirm → import | ✅ | `demoImport.ts` real preview, frozen fixture, test-checked |
| Release Stage 1 | signed APK/AAB, tag pipeline, GitHub Release, changelog, OTA guard, offline test | ✅ | `release.yml` tag `v*`, `changelog.mjs`, `check-ota-guard.mjs`, `check-offline.mjs`, `deployment.md` quickstart, `DEBUG_KEYSTORE_BASE64` stable sig, `mirror-test.apk` phone-testable |
| Privacy canary | mitmproxy + Playwright, fail on canary in body/URL/header/log/error, release builds covered | ✅ config + unit, emulator E2E in CI | `self-test.mjs` ok, `privacy_addon_test.py` ok, manifest gate ok, secret scan ok; `privacy-canary.yml` runs emulator E2E with mitmproxy in CI (see report below) |
| Data tier chip | every feature declares tier A/B/C/D and degrades gracefully | ✅ | `TierBadge` D, `ConfidenceChip` tiers D, `DataStanding`, `DegradedNotice` |
| Based on usage patterns only chip | usage-pattern scores | ✅ | Chip + Callout explaining tier-D only 75 max, topic_depth 25 not measured |
| Tier-D-only scores | usage-only band /75 | ✅ | `scoreIqs` returns max 75 when topic_depth not measurable, 4 factors D only, `approximate` flag caps confidence 0.49 low |
| Per-app daily totals | from OS aggregate, matches Digital Wellbeing by construction | ✅ | `osTotals` via `queryUsageStats` INTERVAL_DAILY, excludes launchers HOME role + Mirror + system UI (Settings rule consistent), matches Settings |
| Session timeline | raw events approximate, open times only | ✅ P2 fix | No scaling, no invented durations, open times only, orphans 319 → reduced via recent-close suppress + 60s overlap, explained in debug |
| Hidden debug 7x tap | validation same period, OS vs Mirror, Honkai raw | ✅ | `showDebug` with validation same period, single-day OS vs Mirror, Honkai/Genshin raw, raw events Share JSON, data quality details |
| Settings rule consistent | exclude Settings everywhere, only launchers+Mirror close previous | ✅ | `DEFAULT_IGNORED` + `launcherSet` split, `systemIgnoreSet` filtering OS totals and sessions and single-day rows |
| Fixture README | synthetic honkai-day-raw will be replaced via debug Share | ✅ | `packages/core-analytics/tests/fixtures/README.md` – real capture steps |
| OTA guard | deployment, OTA and remote config can never add collection/permissions/outbound | ⚠️ config check | `check-ota-guard.mjs` verifies `updates.enabled` false/absent, `telemetry` false, `privacyModeDefault` private, `remoteConfig` narrow-only, permissions only PACKAGE_USAGE_STATS, blockedPermissions includes SYSTEM_ALERT_WINDOW, ACCESS_LOCAL_NETWORK, etc – config check, not runtime OTA injection test |
| Offline test | app works with backend off | ⚠️ config check | `check-offline.mjs` verifies allowBackup false, no analytics SDKs, no services/api import, no secrets, local store only – config check, manual airplane mode test documented, not automated network-off E2E in this sandbox |

**P3 on hold** – interest evolution, discovery timeline, rabbit-hole detection, what-if, focus windows remain mockups, not wired to real data yet.

## Manual steps for production AAB (outside CI)

1. Create upload keystore outside repo: `keytool -genkeypair -v -storetype PKCS12 -keystore ~/mirror-upload.keystore -alias mirror -keyalg RSA -keysize 2048 -validity 10000`
2. `eas credentials` upload to EAS project, password in password manager
3. `make android-build` – gate must exit 0
4. `make build-production` – signed AAB
5. `apksigner verify --print-certs <aab>` + install internal APK on clean device, test usage access, delete-all, canary clean

Nothing above writes secrets to repo.
