# Mirror `v0.1.0` — Release Notes (Android, On-Device)

Mirror `v0.1.0` is the first signed Android release of Mirror (`dev.mirror.app`): a dark-first, local-only reflection tool built around honest measurement, explicit user agency, and verifiable on-device privacy.

---

## Upgrading from `mirror-test.apk` or `v0.1.0-rc1`

- **Coming from an earlier debug-signed test build (`mirror-test.apk`):**
  You must **uninstall Mirror once** before installing `mirror-v0.1.0-release.apk` because `v0.1.0` transitions from `CN=Android Debug` to Mirror's permanent release signing certificate (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
  - Optional: before uninstalling, you can save a personal archive from **`You` → `Local Data & Privacy` → `Export all local data (JSON)`** (with an optional **`XChaCha20-Poly1305`** passphrase). **Note: Export is an archive only — `v0.1.0` does not support importing or restoring JSON archives yet.**
  - Full step-by-step instructions: see [`docs/INSTALL.md`](INSTALL.md).
- **Coming from `v0.1.0-rc1`:**
  Install `mirror-v0.1.0-release.apk` **directly over `v0.1.0-rc1` without uninstalling** (`Update` on phone or `adb install -r`). Both share the permanent release certificate, so your encrypted local database, history, and manual intent labels stay intact.

---

## What's in `v0.1.0`

### 1. Accurate daily foreground screen time & multi-day history
- **Digital Wellbeing parity (`max(10%, 60s)`):** Per-app daily totals sum raw Android `UsageEvents` foreground intervals clipped strictly to `[00:00 local, min(now, 24:00 local)]`, closing sittings cleanly on screen-off (`SCREEN_NON_INTERACTIVE`), device lock (`KEYGUARD_SHOWN`), and shutdown, and applying one shared exclusion list (launchers, Mirror itself, Settings, Play Store/Services, and system package installers) across both totals and sittings.
- **Append-only local history & transparent older-day badges:** Foreground/background events sync idempotently into Mirror's local database so history persists beyond Android's rolling ~7-day `UsageEvents` window. Older days are badged **Stored** (when computed from Mirror's encrypted local event log) or **Approximate** (when served from fallback Android daily buckets), and today is marked **Today so far, provisional**.

### 2. Five-tab Frosted Horizon interface (`Home · Insights · Journey · Sessions · You`)
- **Attention signal (`Home` & `Insights`):** Displays `<value> of <measuredMax> measured` (out of `55` measured points before 5 explicit session labels, or `75` measured points once 5+ sessions are labeled `Intentional` or `Mindless`) with the ring filled strictly to `value / measuredMax`, unmeasured points listed separately, and unfinished late-night windows held out while today is still in progress.
- **Explicit session labeling (`Sessions`):** Lists sitting open times without treating duration as a proxy for intent. Optional manual labels (`Intentional`, `Mindless`, `Not sure`) never use `Not sure` or duration hints in scoring; brief/long sitting hints stay hidden until after you label a sitting.
- **Multi-day patterns (`Journey`, unlocked at `3+` local days, with `limited history` noted below `14` days):**
  - **Interest Evolution & Discovery:** Ranks apps and repeat share using day-clipped foreground time (`m/day foreground` and `%` foreground share), keeping merged spans (`<= 15m` gap) strictly for sitting counts and using `seen since` / `history starts` timestamps.
  - **Rabbit Hole loops:** Runs on raw app opens before sitting merges — *a rabbit hole is 4+ returns (5+ opens of at least 8 seconds, up to 30 minutes apart, with no other app in between) spanning over 30 minutes from first open to last close.*
  - **What-if Simulator (`Insights`):** Counterfactual scenarios (`Scenarios (you can combine)`) with plain one-line descriptions, measured factors only, explicit assumptions, and every output labeled **Estimate**.
  - **Focus Windows (`Insights`):** Unlocks only with `21+` local days and `5+` sittings per cell, using strictly non-diagnostic observational copy.

### 3. On-device encryption, no internet permission & data controls
- **`XChaCha20-Poly1305` local store:** All stored events, derived sittings, daily rollups, and manual labels live on-device in SQLite encrypted with **`XChaCha20-Poly1305`** (`expo-sqlite` + Android Keystore `SecureStore`, `allowBackup: false`).
- **No internet permission in release:** The release merged `AndroidManifest.xml` strips `android.permission.INTERNET`, blocks `NotificationListenerService`, `AccessibilityService`, overlays, location, contacts, camera, microphone, `QUERY_ALL_PACKAGES`, and `AD_ID`, and ships with OTA updates disabled.
- **Honest data-source tiers (`You`):** On-device Android Usage Access (`Tier D`) and optional explicit session labels (`Tier A`) are active on this phone; external file import (`Tier B`) and OAuth connectors remain unavailable in `v0.1.0`.
- **Archive export & verified local wipe (`You` → `Local Data & Privacy`):**
  - **`Export all local data (JSON)`** (archive only — no import in `v0.1.0`) with a clear plaintext warning, optional **`XChaCha20-Poly1305`** passphrase encryption, and Android system save/share dialogs.
  - **`Clear manual labels`** to remove manual intent tags without losing screen-time history.
  - **`Delete all local data`** gated behind typed **`DELETE`** confirmation, recording `History reset on <date>` on `You`.

---

## Verification & Integrity

- Signed with Mirror's permanent release certificate (`apksigner verify --verbose --print-certs`; `CN=Android Debug` rejected in CI).
- Merged release manifest audited by `scripts/android/check-merged-manifest.mjs` and `scripts/privacy/verify-signed-apk.mjs` (`PACKAGE_USAGE_STATS` present, `INTERNET` absent, `NotificationListenerService` absent).
- Full `npm run verify`, `make release-stage1`, WCAG AA contrast audit (`>= 4.5:1`), TalkBack accessibility audit, Metro production bundle reachability scan, and secret scan passing.
