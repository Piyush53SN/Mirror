# Mirror — Android Installation & Upgrade Guide (`v0.1.0-rc1` / `v0.1.0`)

Mirror `v0.1` is an offline, on-device Android app (`dev.mirror.app`). Every event, sitting, and manual intent label is stored locally in an **`XChaCha20-Poly1305`** encrypted SQLite database (`mirror.db` + Android Keystore `SecureStore`, `allowBackup: false`), and the signed release APK declares **no internet permission**.

---

## 1. Which file to install

Each GitHub Release (`v0.1.0-rc1` pre-release and `v0.1.0` release) publishes:

| Release asset | Purpose | Install directly on phone? |
|---|---|---|
| `mirror-<tag>-release.apk` | Self-contained release APK signed with the permanent Mirror release certificate (no Metro server needed; `android.permission.INTERNET` removed) | **Yes — install this file** |
| `mirror-<tag>-release.aab` | Signed Android App Bundle for Google Play internal/production tracks | No (Play Store bundle format) |
| `SHA256SUMS.txt` | SHA-256 checksums for the `.apk` and `.aab` | Verify before installing |
| `apksigner-verify.txt` & `merged-manifest-release.json` | CI audit proof of the release signing certificate and merged `AndroidManifest.xml` | Audit reference |

> **Local developer note:** `app-debug.apk` (from `./gradlew :app:assembleDebug`) is a Metro development client that expects a local dev server on `localhost:8081` (`Unable to load script` if opened standalone). Always use `mirror-<tag>-release.apk` on a phone.

### Optional: verify checksum & release signature on your computer

```bash
# 1. Verify SHA-256 checksum
sha256sum -c SHA256SUMS.txt

# 2. Verify APK Signature Scheme v2/v3 & confirm non-debug certificate
apksigner verify --verbose --print-certs mirror-v0.1.0-rc1-release.apk
```

---

## 2. One-time uninstall & reinstall (moving off `mirror-test.apk`)

### Why a one-time uninstall is required

Earlier branch test builds (`mirror-test.apk`) were signed with `debug.keystore` (`CN=Android Debug`). Release candidates (`v0.1.0-rc1`) and releases (`v0.1.0+`) are signed with Mirror's permanent release certificate.

Android enforces signing-certificate pinning across updates: installing a release-signed APK over a debug-signed APK fails with *"App not installed as package conflicts with an existing package"* (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). You must **uninstall the old debug-signed build once** before installing `mirror-v0.1.0-rc1-release.apk` (or `mirror-v0.1.0-release.apk`).

### Step-by-step migration

1. **(Optional) Export an archive copy before uninstalling — archive only, no import in v0.1:**
   - Open your existing Mirror app → **`You`** tab → **`Local Data & Privacy`** → **`Export all local data (JSON)`**.
   - Read the plaintext warning: leaving the passphrase blank writes readable JSON (app names, open timestamps, derived sittings, and manual intent labels). Entering an optional passphrase encrypts the export with **`XChaCha20-Poly1305`** before saving (`Save JSON file`) or sharing (`Share JSON`).
   - **Archive-only limitation in v0.1:** **Export is for your personal archive only — Mirror `v0.1` does not have a JSON import or restore feature yet.** Uninstalling the old debug-signed app wipes `mirror.db` and its device-bound Android Keystore key, so the newly installed release build starts a fresh local store (Android's rolling ~7-day `UsageEvents` window will populate automatically on first sync).

2. **Uninstall the previous debug-signed Mirror app (one time only):**
   - **On your phone:** Long-press the **Mirror** icon → **App info** → **Uninstall** → **OK** (or **Settings → Apps → Mirror → Uninstall**).
   - **Or via ADB:**
     ```bash
     adb uninstall dev.mirror.app
     ```

3. **Install the signed release APK (`mirror-v0.1.0-rc1-release.apk` or `mirror-v0.1.0-release.apk`):**
   - **On your phone:** Open **Files** / **Downloads**, tap `mirror-v0.1.0-rc1-release.apk` (if prompted, allow *Install unknown apps* for your file manager/browser), and tap **Install**.
   - **Or via ADB:**
     ```bash
     adb install mirror-v0.1.0-rc1-release.apk
     ```

4. **Grant Usage Access & run initial sync:**
   - Open **Mirror** → on the **Permission Primer** screen, tap **Open Android settings** → **Usage access** → **Mirror** → toggle **Allow usage tracking** **ON**.
   - Return to Mirror and tap/pull **Refresh**. Confirm `Home` per-app daily foreground totals match **Settings → Digital Wellbeing** within `max(10%, 60s)`.

---

## 3. Upgrading from `v0.1.0-rc1` to `v0.1.0` (and all future releases)

Once you are on `mirror-v0.1.0-rc1-release.apk` (or `mirror-v0.1.0-release.apk`), **do NOT uninstall** when updating to `v0.1.0`, `v0.1.1`, or `v0.2.0`:

- All release candidates and releases are signed with the **same permanent release certificate**.
- Tap the new `mirror-v0.1.0-release.apk` on your phone → **Update** (or run `adb install -r mirror-v0.1.0-release.apk`).
- Your `XChaCha20-Poly1305` encrypted `mirror.db`, Android Keystore key, stored multi-day history, and manual intent labels remain intact across updates.

---

## 4. Permissions, Privacy Boundary & Data Controls

- **Single user-granted data permission:** `android.permission.PACKAGE_USAGE_STATS` (Android Special app access → Usage access). Mirror reads app foreground/background timestamps and screen-interactive / keyguard lifecycle events — never screen contents, keystrokes, URLs, or notification text.
- **No internet permission in release:** `apps/mobile/plugins/remove-forbidden-permissions.js` removes `android.permission.INTERNET` from the release `AndroidManifest.xml` (`tools:node="remove"`), withholding Linux group `AID_INET` (`GID 3003`) from `dev.mirror.app`.
- **No notification listener or accessibility service:** `BIND_NOTIFICATION_LISTENER_SERVICE`, `BIND_ACCESSIBILITY_SERVICE`, `SYSTEM_ALERT_WINDOW`, `QUERY_ALL_PACKAGES`, `ACCESS_LOCAL_NETWORK`, location, contacts, camera, microphone, and `AD_ID` are blocked and audited in CI (`scripts/android/check-merged-manifest.mjs`).
- **`ACCESS_NETWORK_STATE` note:** Retained solely because `androidx.work:work-runtime` (`expo-background-task`) registers a local connectivity callback on startup; without `INTERNET`, the app cannot open network sockets.
- **On-device controls (`You` → `Local Data & Privacy`):**
  - **`Export all local data (JSON)`** — archive-only JSON export (plaintext warning + optional `XChaCha20-Poly1305` passphrase encryption; no import in v0.1).
  - **`Clear manual labels`** — removes manual `Intentional` / `Mindless` / `Not sure` tags while keeping screen-time history.
  - **`Delete all local data`** — requires typing `DELETE` to wipe `mirror.db` and derived summaries, recording `History reset on <date>` on `You`.

---

## 5. Troubleshooting

- **"App not installed as package conflicts with an existing package" (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`):**
  You still have an older `debug.keystore`-signed `mirror-test.apk` installed. Follow Section 2 above to uninstall `dev.mirror.app` once, then install `mirror-<tag>-release.apk`.
- **Usage Access revoked after an OS update or permission auto-reset:**
  Mirror shows a recovery banner without crashing or deleting stored history. Re-enable **Settings → Apps → Special app access → Usage access → Mirror** and tap **Refresh**.
- **Android Keystore key invalidated (e.g. device lock-screen credential wipe):**
  Mirror surfaces a clear local-key recovery prompt instead of crashing; use **`Delete all local data`** (`DELETE`) to re-initialize a fresh `XChaCha20-Poly1305` store key and log the reset date on `You`.
- **R8 / WorkManager minification note (developers):**
  Release builds keep Room/WorkManager classes via `expo-build-properties` `extraProguardRules` in `apps/mobile/app.json` (`androidx.work.**`, `androidx.room.RoomDatabase`, `dev.mirror.usagestats.**`) so minified release APKs/AABs boot cleanly on Xiaomi/MIUI, Pixel, and Samsung devices.
