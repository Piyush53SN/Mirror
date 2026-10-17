# Android permissions — the complete list, and why each one exists

Mirror asks for one permission today. This page lists every permission that will
ever appear, what triggers the request, and what is deliberately **not** asked
for. It is the human-readable twin of the allow/deny test in
`tests/config.test.mjs`.

The rule behind the list: **a permission is declared in the manifest when the
feature that needs it ships, and requested from the person at the moment they use
that feature.** Declaring a permission early is not harmful, but *asking* early is
a dark pattern, so the two dates are different.

## 1. Declared now (P0/P1)

| Permission | Kind | Declared | Requested | Why |
| --- | --- | --- | --- | --- |
| `android.permission.PACKAGE_USAGE_STATS` | Special app access (not a runtime permission) | now | P1, from the primer in J2 → deep-links to **Settings → Special app access → Usage access** | The only Android API that reports which app was in the foreground and for how long. There is no alternative that is not accessibility scraping or screen capture — both forbidden. |

`PACKAGE_USAGE_STATS` is an *appop*: the system does not show a dialog. The app
opens the Settings page, the person flips the switch, and the app re-checks on
resume. If it is not granted, every screen that needs tier D shows the degraded
notice and says why — it never shows a made-up number.

## 2. Declared with the feature that needs it

| Permission | Kind | Phase | Requested | Why |
| --- | --- | --- | --- | --- |
| `android.permission.POST_NOTIFICATIONS` | Runtime (Android 13+) | P4 | On the nudge opt-in screen only — never at launch, never after onboarding | Local weekly report and the opt-in nudge. If the person never enables a notification, this is never requested. Refusal keeps every other feature working. |
| `android.permission.INTERNET` | Normal | P5, with the first connector | n/a (install-time) | OAuth token exchange and (P6) optional encrypted sync. The app is fully functional offline; Private mode makes no requests at all. |
| `android.permission.WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` | Normal | contributed by **WorkManager** (`expo-background-task`), P1b-1 | n/a | Scheduled collection survives reboots. These merge in from the library's manifest; the merged-manifest gate lists them as reviewed library permissions and fails on anything else. |

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
3. **Afterwards** — the Privacy Center shows what was granted and when, and one tap
   revokes it. Revocation deletes the events that grant covered (see
   `consent_log` in `packages/shared-types`).

## 6. Verification

| Check | Where | Label |
| --- | --- | --- |
| The declared list is exactly the documented list | `tests/config.test.mjs` | AUTOMATED |
| Forbidden permissions are blocked, not merely unused | `tests/config.test.mjs` | AUTOMATED |
| Every declared permission appears on this page | `tests/config.test.mjs` | AUTOMATED |
| The **merged** manifest matches this page (not just `app.json`) | `npm run android:manifest` (`scripts/android/check-merged-manifest.mjs`), fixtures in `scripts/android/fixtures` | **AUTOMATED** (policy + parser); needs a Gradle build to run against a real artifact — **MANUAL precondition** |
| The first prebuild produced the expected `android/` project (15 `tools:node="remove"` lines, `PACKAGE_USAGE_STATS` kept) | `npx expo prebuild --platform android` — run 2026-10-17, exit 0 | AUTOMATED (ran once); re-running is part of CI |
| The Settings round-trip (grant → resume → detected) | emulator run, P1 | MANUAL until an emulator is wired into CI |
| The notification prompt appears only on opt-in | P4 device test | MANUAL until then |
