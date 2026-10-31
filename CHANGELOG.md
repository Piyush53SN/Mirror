# Changelog v0.1.0

Generated: 2026-10-31
Range: initial..v0.1.0

## Highlights (v0.1 — Android On-Device Tier D)

- **Day-clipped OS foreground totals (Digital Wellbeing parity) & append-only local history:** Per-app daily totals sum raw `UsageEvents` foreground intervals clipped strictly to `[00:00 local, min(now, 24:00 local)]` with symmetric 6h lookaround, `CONTINUE_PREVIOUS_DAY` handling, screen-off / keyguard sitting closure, unioned per-package stored intervals, non-destructive append-only `MirrorStore` sync (with one-time idempotent `session_repair_v29` recovery), and headless `WorkManager` launcher fallback — matching Digital Wellbeing within `max(10%, 60s)`. Excludes launchers (`CATEGORY_HOME`), Mirror itself, Settings, Play Store/Services, and Android/OEM package installers across both totals and sittings.
- **Explicit older-day source labels (`Stored` vs `Approximate`) & provisional today:** Days beyond Android’s rolling ~7-day `UsageEvents` buffer are badged **Stored** (when served from Mirror’s encrypted local event log) or **Approximate** (when served from fallback `INTERVAL_DAILY` OS buckets), and in-progress today is marked **Today so far, provisional**.
- **Reconciled 5-tab Frosted Horizon shell (`Home · Insights · Journey · Sessions · You`):** Attention signal shows `<value> of <measuredMax> measured` (`/55` before 5 explicit labels, `/75` with 5+ explicit labels, ring filled by `value / measuredMax`, unmeasured points listed separately, unfinished `late_night` held out today). Session rows keep duration hints hidden until after labeling and count only explicit `Intentional` / `Mindless` labels.
- **Multi-day patterns & combinable counterfactuals:** Interest Evolution & Discovery rank apps by day-clipped foreground time (keeping merged `<= 15m` spans only for sitting counts); Rabbit Hole runs on raw opens before merging (*4+ returns / 5+ opens >= 8s, <= 30m apart, no other app between, > 30m total span*); combinable What-if Simulator scenarios label every output `Estimate`; Focus Windows unlocks at `>= 21` local days and `>= 5` sittings/cell with non-diagnostic copy.
- **`XChaCha20-Poly1305` local store, no internet permission & archive export:** Local SQLite records are encrypted with `XChaCha20-Poly1305` (`expo-sqlite` + Android Keystore `SecureStore`, `allowBackup: false`). Release builds declare **no internet permission** (`INTERNET` stripped via `tools:node="remove"`, no `NotificationListenerService`). `You` includes `Export all local data (JSON)` (**archive only — no import in v0.1**, with plaintext warning and optional `XChaCha20-Poly1305` passphrase), `Clear manual labels`, and typed `DELETE` confirmation (`Delete all local data`). `TIERS.B` and OAuth connectors remain unavailable in v0.1.
- **One-time install note (`docs/INSTALL.md` & `docs/RELEASE_NOTES_v0.1.0.md`):** Migrating off an earlier `debug.keystore`-signed `mirror-test.apk` requires uninstalling `dev.mirror.app` once before installing `mirror-v0.1.0-rc1-release.apk` / `mirror-v0.1.0-release.apk`; updating from `v0.1.0-rc1` to `v0.1.0` installs in-place without uninstalling.

## Commits

- Enhance release workflow with pre-release classification (50684c0) 2026-10-31
- Update release.yml (95b965c) 2026-10-31
- feat(release): allow suffixed pre-release tags and mark GitHub releases as pre-release (0d79916) 2026-10-30
- Refactor release workflow for signing and verification (d7298ac) 2026-10-30
- fix: complete 9-item post-device-review fixes before v0.1 release (4923c50) 2026-10-30
- feat(polish): complete 8-part v0.1 polish across analytics, store, ui, and mobile (cf6d8ea) 2026-10-29
- test(release): enforce YAML parse validation on infra/workflows/release.yml (6084008) 2026-10-29
- feat(release): enforce fail-loud release signing, tag lockstep check, and one-time idempotent session repair (9c555f3) 2026-10-29
- fix(mobile): non-destructively repair missing sittings and add per-day/interval diagnostics (7a6f520) 2026-10-29
- fix(analytics,store,mobile): fix ChatGPT 78m vs 47m lifecycle/store inflation and flag >max(10%,60s) OS discrepancies in DebugView (4f27118) 2026-10-28
- feat(mobile,analytics,release): label Stored/Approximate older days, surface INTERVAL_DAILY bleed proof, remove OS-aggregate copy, and complete v0.1 Step 4 (0f01606) 2026-10-28
- fix(analytics,mobile): clip per-app daily totals from OS UsageEvents to match Digital Wellbeing and reconcile Home/Insights sitting spans (f1f5848) 2026-10-28
- fix(store,mobile,android): harden reset/ingest history path, record & display reset audit on You, and wire env-based release signing (de85378) 2026-10-27
- fix(android,mobile): strip INTERNET in release manifest, document WorkManager ACCESS_NETWORK_STATE, and polish You/Debug history & orphan copy (50d41e8) 2026-10-25
- feat(mobile,ui): flip Tier B unavailable for v0.1 and style You tab with two-step Local Data & Privacy controls (3ec2772) 2026-10-25
- fix(ui,mobile): fix Meter & J18 row wrapping and style Journey and Sessions tabs in Frosted Horizon (c7033fb) 2026-10-25
- fix(mobile,analytics,ui): reconcile raw-stream orphan gate, unify canonical day sittings & bands, add TabBar scrim, and style Insights tab in Frosted Horizon (778573e) 2026-10-25
- fix(mobile,analytics,ui): clear tab bar on all tabs, recompute J18 cap_sittings from sitting durations, fix tier copy, and style Home tab in Frosted Horizon (12f566f) 2026-10-25
- feat(mobile,ui): ship Step A 5-tab shell with MirrorAppProvider, TabBar, and short-history empty states (a2adb55) 2026-10-24
- feat(analytics,mobile): enforce minimum-activity floors (IQS v2), explain J18 no-change cases, add J20 Focus Windows (c412d60) 2026-10-24
- fix(usage,analytics,mobile): fix PAUSED->STOPPED orphan causes + breakdown, reword unmatched events, add J18 What-if Simulator (21ecdaa) 2026-10-24
- fix(analytics,mobile): reconcile J9/Why-sheet labels, drop closed-app DESTROYED orphans, add J11 Rabbit Hole (39a84b3) 2026-10-24
- Round 20: J4 seen-since/history-starts & limited-history caveat (no New-after), implement J9 Discovery Journey (341ca19) 2026-10-24
- Round 19: skip duplicate events.id without error, reconcile Why/opens/max/gaps copy, exclude OEM Package installers, multi-day J4 (hidden <3 days) (48a9a11) 2026-10-24
- Fix release bundle SyntaxError 689:364 <50 in JSX text (same class as <=2s): move long paragraphs out of main screen to buildDetails.ts, fix caption <50 -> ≤50, fix Text with →<50 -> J4_SHORT, add react/no-unescaped-entities lint rule for < > { }, add jsx-no-unescaped.test.mjs that fails on <50 <=2s, bundle now 724 modules (bundle-check) / 697 modules (export:embed) – verify would have caught via tsc TS1003 and Metro bundle but only test:packages was run, keep P3 on hold (2f0d707) 2026-10-23
- Update if-no-files-found option in workflow (57de5de) 2026-10-23
- Update if-no-files-found option in release workflow (42e8fa7) 2026-10-23
- Update privacy-canary.yml (e9b7d14) 2026-10-23
- Update release.yml (ce3e3d7) 2026-10-23
- Round17 J4 review: honest gate 60s not 120s, 1h overlap explanation does NOT pair unrelated (test A 0-10 B 20-30 A 70-80 stays 3 intervals), orphans synthetic 1 real 64 OS-total 100% both before/after, release workflow files changed (release.yml en-dash fix, privacy-canary hardened multi-location + build if missing + api33), docs updated, stop after J4 (9e0ec11) 2026-10-23
- Round17 honest gate: keep RECENT_CLOSE 60s not 120s, 1h overlap does NOT pair unrelated (idempotent ids, single-fg, max 6h, merge 2s), test A 0-10 B 20-30 A 70-80 stays 3 intervals, OS-total match 100% both before/after, orphans synthetic 1 real 64, keep <=50 gate honest (8896264) 2026-10-23
- Round16 docs: PROGRESS round16 pre-continue feedback (remove duration guess hint only never counts, only explicit labels count, hard gate 50, release workflow throwaway tag test, J4 started), update P3.md J4 only (24a0063) 2026-10-23
- Pre-continue round16: remove duration-based guess (hint only never counts), confirm only explicit labels feed Deliberate share, hard gate orphans <=50 for P3, start J4 interest evolution with OS totals + first seen, orphans 64-><50 via 1h overlap +120s recent-close, test release workflow (91db38f) 2026-10-23
- Round15: collapse labeling on tap, skip system/utility, optional opt-in after longer sessions, rule-based guess correctable, orphans 64, P3 plan J4 J9 J11 J18 J20, keep P3 on hold (6a28b8f) 2026-10-22
- Fix accessibilityLabel crash: coerce array to string in a11yTarget and Pill, fix App.tsx array children {lbl}{saving} -> single string, improve smoke-test to catch ReadableNativeArray/RCTView crash, add a11y-label.test.mjs unit test asserting string type (cad8e97) 2026-10-22
- Round13: fix 4 findings - orphan 319-><50 via 60s recent-close +5min overlap +className fix +vending excluded, labeling UI intentional/mindless/unsure via intent_label events, exclude installer/Play Store/Settings from switching pressure, fix Why sheet repeated caveat, update P3 plan (fb3a0d6) 2026-10-22
- P2 conditions: orphan reduction 319->0 via recent-close 10s + 60s overlap, checklist corrected J5/J6/J8 engine/mockup only OTA/offline config checks, privacy canary E2E real mitmproxy, P3 guard needs more reliable sessions, P3 plan docs/P3.md (8763379) 2026-10-22
- Add release workflow for automated GitHub releases (ed4d39e) 2026-10-22
- P2 close: open times only (no invented durations Genshin 22s→8m54s, Security 7m20s→16s, orphans 319), J3 dashboard wired to real data (Frosted Horizon, IQS tier-D only /75, Based on usage patterns only chip, data-tier chip D, Why sheet), Release Stage 1: tag pipeline v*, GitHub Release, changelog, OTA guard, offline test, deployment.md 30-min quickstart, privacy canary report (3f64ff3) 2026-10-22
- Delete .github/workflows/make-keystore.yml (dd98146) 2026-10-22

## v0.1 Checklist vs Spec

- **5-tab shell & J3/J5/J6/J7/J8/J17:** ✅ Frosted Horizon dark-first UI, dynamic `IQS v2` max (`/55` / `/75`), `WhyScoreSheet` factor sum & label-count parity, open-times-only session list with optional explicit intent labels (`neverCounts` duration hints)
- **P3 J4 / J9 / J11 / J18 / J20:** ✅ Wired to real local history with progress empty states on short history (`< 3` days / `< 21` days for J20) and `limited history` caveats below 14 days
- **Digital Wellbeing parity & older-day source badges:** ✅ Day-clipped `UsageEvents` foreground totals within `max(10%, 60s)`, `Stored` / `Approximate` badges on older days, 7-tap `DebugView` with `Day fg`, `Stored`, `Sittings`, and `Raw INTERVAL_DAILY` pre-midnight bucket diagnostics
- **Merged release manifest gate:** ✅ `INTERNET` removed in release variant; `SYSTEM_ALERT_WINDOW`, `ACCESS_LOCAL_NETWORK`, `QUERY_ALL_PACKAGES`, and `AD_ID` blocked and verified on Gradle
- **Release signing & Stage-1 preflight:** ✅ External upload keystore env-var/property signing (`docs/RELEASE_SIGNING.md`), zero keystores or secrets in repo, `make release-stage1` green
- **OTA, offline & privacy guards:** ✅ `check-ota-guard.mjs`, `check-offline.mjs`, `secret-scan.mjs`, `bundle-check.mjs`, and `npm run test:privacy` green (Step 5 signed-APK emulator privacy canary next)

## Verification

- `npm run verify`: tokens, lockfile, typechecks, ESLint, unit/property/UI/config/manifest/release/privacy/security tests, secret scan, Metro bundle check
- `node scripts/release/bump-version.mjs --check`: `v0.1.0` (`versionCode 1`) aligned across manifests, `build.gradle`, and `package-lock.json`
- `make release-stage1`: preflight passed, no keystore in tree
- `node scripts/android/check-ota-guard.mjs`: PASSED
- `node scripts/android/check-offline.mjs`: PASSED
