# Android permissions — the complete list, and why each one exists

Mirror asks for one permission today. This page lists every permission that will
ever appear, what triggers the request, and what is deliberately **not** asked
for. It is the human-readable twin of the allow/deny test in
`tests/config.test.mjs` and the merged-manifest gate in
`scripts/android/check-merged-manifest.mjs`.

The rule behind the list: **a permission is declared in the manifest when the
feature that needs it ships, and requested from the person at the moment they use
that feature.** Declaring a permission early is not harmful, but *asking* early is
a dark pattern, so the two dates are different.

## 1. Declared now (P0/P1 / v0.1)

| Permission | Kind | Declared | Requested | Why |
| --- | --- | --- | --- | --- |
| `android.permission.PACKAGE_USAGE_STATS` | Special app access (not a runtime permission) | now | P1, from the primer in J2 → deep-links to **Settings → Special app access → Usage access** | The only Android API that reports which app was in the foreground and for how long. There is no alternative that is not accessibility scraping or screen capture — both forbidden. |

`PACKAGE_USAGE_STATS` is an *appop*: the system does not show a dialog. The app
opens the Settings page, the person flips the switch, and the app re-checks on
resume. If it is not granted, every screen that needs tier D shows the degraded
notice and says why — it never shows a made-up number.

## 2. Declared with the feature that needs it (and library-contributed permissions)

| Permission | Kind | Phase | Requested | Why |
| --- | --- | --- | --- | --- |
| `android.permission.POST_NOTIFICATIONS` | Runtime (Android 13+) | P4 | On the nudge opt-in screen only — never at launch, never after onboarding | Local weekly report and the opt-in nudge. If the person never enables a notification, this is never requested. Refusal keeps every other feature working. |
| `android.permission.INTERNET` | Normal | **Stripped in v0.1 release** (`tools:node="remove"` in `src/release/AndroidManifest.xml`); restored in P5 when the first connector ships | n/a (install-time) | Kept in `debug` only so React Native can reach Metro (`localhost:8081`). In v0.1 release builds (Private mode, no connectors), `remove-forbidden-permissions.js` strips `INTERNET` merged from `react-android` and `expo-file-system`. Without `INTERNET`, Android's `PackageManagerService` omits Linux GID `3003` (`AID_INET`), so the kernel rejects `AF_INET`/`AF_INET6` sockets with `EACCES`. Enforced by `check-merged-manifest.mjs --variant release`. |
| `android.permission.ACCESS_NETWORK_STATE` | Normal | contributed by **WorkManager** (`androidx.work:work-runtime:2.9.1` via `expo-background-task@58.0.11`) | n/a | `expo.modules.backgroundtask.BackgroundTaskScheduler.scheduleWorker()` (`BackgroundTaskScheduler.kt:103`) hardcodes `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()` when registering the periodic collection worker. WorkManager's `NetworkStateTracker24` calls `ConnectivityManager.registerDefaultNetworkCallback(...)`, which is annotated `@RequiresPermission(ACCESS_NETWORK_STATE)` and throws `SecurityException` if removed. Grants read-only local connectivity state only — no `AID_INET` GID and zero socket capability. |
| `android.permission.WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` | Normal | contributed by **WorkManager** (`expo-background-task`), P1b-1 | n/a | Scheduled collection survives reboots. These merge in from the library's manifest; the merged-manifest gate lists them as reviewed library permissions and fails on anything else. |
| `dev.mirror.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Signature, per-package | contributed by **AndroidX** (`androidx.work`, `androidx.core`), P1b-1 | n/a | AGP generates a per-package permission when a library declares a receiver with `RECEIVER_NOT_EXPORTED` (Android 13+). Required to protect dynamic receivers. No user prompt. Documented in `ALLOWED_FROM_LIBRARIES` with reason. |

## 2a. Permissions removed by `remove-forbidden-permissions.js`

React Native, Expo's template, and `expo-file-system` contribute permissions that Mirror actively strips via `apps/mobile/plugins/remove-forbidden-permissions.js`:

| Permission | Added by | Variant treatment | Why removed |
| --- | --- | --- | --- |
| `android.permission.INTERNET` | Expo base template, `com.facebook.react:react-android`, `expo-file-system` | Kept in `debug` / `debugOptimized`; **removed in `release`** (`app/src/release/AndroidManifest.xml` `tools:node="remove"`) | Debug needs Metro (`localhost:8081`). v0.1 release has zero connectors and zero network callers (`check-offline.mjs` + 0 JS `fetch`/`XMLHttpRequest`/`WebSocket` references); removing `INTERNET` strips `AID_INET` at the OS kernel boundary and fails `check-merged-manifest.mjs --variant release` if re-introduced. |
| `android.permission.SYSTEM_ALERT_WINDOW` | `react-native` debug manifest (dev overlay) | Removed in **all** variants (`main`, `debug`, `debugOptimized`, `release`) | Overlays are forbidden by product decision (`blockedPermissions` + `tools:node="remove"`). |
| `android.permission.ACCESS_LOCAL_NETWORK` | `react-native` debug manifest (Android 17+ local-network debugger) | Removed in **all** variants (`main`, `debug`, `debugOptimized`, `release`) | Local-network probing is forbidden (`blockedPermissions` + `tools:node="remove"`). |

## 3. Boot sync: no permission is needed, and none is requested

"Sync after reboot" is handled by **WorkManager**, which persists scheduled work
and reschedules it when the device boots. WorkManager's own manifest contributes
`RECEIVE_BOOT_COMPLETED` through manifest merging; Mirror does **not** request it
itself and does not register its own boot receiver.

That is deliberate, not an omission:

- adding our own `BOOT_COMPLETED` receiver would be a second scheduling path to
  keep correct, for no benefit;
- a permission we do not use is a permission we would have to justify to a store
  reviewer and to the person installing the app;
- a boot-time job that *collected* something on start would be a background
  collection spike; the daily collection window is scheduled, bounded, and visible
  in the Privacy Center's network log.

If P1 measures that WorkManager's reschedule is not reliable on a target OEM
(aggressive battery managers are real), the fallback is an explicit boot receiver
— and then `RECEIVE_BOOT_COMPLETED` is added to this table, to `app.json`, and to
the config test in the same change. It is not added "just in case".

## 4. Never requested — and a test enforces it

| Permission / capability | Why not |
| --- | --- |
| `BIND_ACCESSIBILITY_SERVICE` | Accessibility scraping is forbidden by the brief and by this product's ethics. |
| `SYSTEM_ALERT_WINDOW` (draw over other apps) | Overlays are forbidden. |
| `MEDIA_PROJECTION` (screen capture) | Screen recording is forbidden. |
| `BIND_NOTIFICATION_LISTENER_SERVICE` | Notification scraping is forbidden. |
| `QUERY_ALL_PACKAGES` | Not needed: UsageStats reports package names without enumerating the device. |
| `READ_CONTACTS`, `READ_SMS`, `READ_CALL_LOG`, location, camera, microphone | Not part of the product. Every one is in `blockedPermissions`, so a transitive dependency cannot add it quietly. |
| `com.google.android.gms.permission.AD_ID` | No advertising, no attribution. Blocked in the manifest. |
| `FOREGROUND_SERVICE` | Not used. Collection runs in a bounded WorkManager job; no persistent notification, no always-on service. |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE` | The importers read files the person picks, through the system document picker (SAF). Wide storage access is never needed. All three are in `blockedPermissions` and in the gate's forbidden list, so a transitive dependency cannot add them quietly. |

## 5. What the person sees

1. **Before the system prompt** — the primer (Section J item 2) states what will be
   read, what will not, and what happens if they decline.
2. **At the moment of use** — usage access is opened from Settings with the reason
   on screen; notifications are requested only when a nudge is switched on.
3. **Afterwards** — the Privacy Center (`You` tab → Local Data & Privacy) shows what
   was granted and provides two-step local wipe controls (`Clear labels` and
   `Delete all local data`).

## 6. Verification

| Check | Where | Label |
| --- | --- | --- |
| The declared list is exactly the documented list | `tests/config.test.mjs` | AUTOMATED |
| Forbidden permissions are blocked, not merely unused | `tests/config.test.mjs` | AUTOMATED |
| Every declared permission appears on this page | `tests/config.test.mjs` | AUTOMATED |
| The **merged** manifest matches this page — debug (`INTERNET` allowed for Metro) | `npm run android:manifest -- --variant debug` (`scripts/android/check-merged-manifest.mjs`) | AUTOMATED |
| The **merged** manifest matches this page — release (`INTERNET` **forbidden**; `ACCESS_NETWORK_STATE` documented for WorkManager) | `npm run android:manifest -- --variant release` (`scripts/android/check-merged-manifest.mjs`), unit tests in `tests/android-manifest.test.mjs` | AUTOMATED |
| Prebuild generates `src/release/AndroidManifest.xml` stripping `INTERNET`, `SYSTEM_ALERT_WINDOW`, `ACCESS_LOCAL_NETWORK` while keeping `INTERNET` in `src/debug/AndroidManifest.xml` | `npx expo prebuild --platform android` (`apps/mobile/plugins/remove-forbidden-permissions.js`) | AUTOMATED |
| Zero network calls in Private mode | `scripts/android/check-offline.mjs` + kernel `AID_INET` omission (`INTERNET` stripped in release) | AUTOMATED |
| The Settings round-trip (grant → resume → detected) | real Android device | VERIFIED |
| The notification prompt appears only on opt-in | P4 device test | MANUAL until then |
