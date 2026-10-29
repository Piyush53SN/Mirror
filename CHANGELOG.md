# Changelog v0.1.0

Generated: 2026-10-29
Range: initial..v0.1.0

## Highlights (v0.1 — Android On-Device Tier D)

- **Day-clipped OS foreground totals (Digital Wellbeing parity) & append-only local history:** Per-app daily totals sum raw `UsageEvents` foreground intervals clipped strictly to `[00:00 local, min(now, 24:00 local)]` with symmetric 6h lookaround, `CONTINUE_PREVIOUS_DAY` handling, unioned per-package stored intervals, non-destructive append-only `MirrorStore` sync (with one-time idempotent `session_repair_v29` recovery), and headless `WorkManager` launcher fallback — matching Digital Wellbeing within `max(10%, 60s)`. Excludes launchers (`CATEGORY_HOME`), Mirror itself, Settings, Play Store/Services, and Android/OEM Package installers.
- **Per-app `max(10%, 60s)` OS discrepancy flagging in `DebugView`:** Automatically flags any app whose Mirror total (`Home`, `Day fg`, or `Stored`) diverges from OS `UsageEvents` or OS `UsageStats` beyond `max(10%, 60s)` with a 4-source trace (`Home · Day fg · Stored · Sittings · Raw`) plus exact interval timelines and per-day SQLite row counts.
- **Explicit older-day source labels (`Stored` vs `Approximate`):** Days beyond Android’s rolling ~7-day `UsageEvents` buffer are explicitly badged as **Stored** (when served from Mirror’s encrypted local event log) or **Approximate** (when served from fallback `INTERVAL_DAILY` OS buckets).
- **Reconciled 5-tab Frosted Horizon shell (`Home · Insights · Journey · Sessions · You`):** Unified canonical day sittings across `Home`, `Insights`, `IQS`, and `Sessions`; reconciled active foreground screen time vs merged `<= 15 min` sitting spans; honest `IQS v2` out of measured parts only (`/55` before 5 explicit labels, `/75` with 5+ explicit labels, minimum-activity floors enforced, never rescaled to 100).
- **P3 multi-day & counterfactual on-device analytics:** Shipped `J4 Interest Evolution`, `J9 Discovery Journey`, `J11 Rabbit Hole`, `J18 What-if Simulator` (every output explicitly labelled `Estimate`), and `J20 Focus Windows` (requires `>= 21` local days and `>= 5` sittings/cell; zero diagnostic language) behind the honest `orphans <= 50` and `gaps <= 100` reliability gate.
- **Degraded-tier & local-storage honesty:** `TIERS.B` (`Your export`) marked unavailable for v0.1, OAuth claims hidden until P5 connectors exist, AEAD-encrypted local `MirrorStore` (`expo-sqlite` + `SecureStore`, `allowBackup: false`), full `Delete all data` wipe with reset audit timestamp on `You`.
- **Release hardening (Steps 1–4):** `INTERNET` stripped from release merged `AndroidManifest.xml` via `tools:node="remove"`, `ACCESS_NETWORK_STATE` scoped and documented for `WorkManager`, tag-to-manifest lockstep gate (`bump-version.mjs --check --tag`), fail-loud release signing verification (`verify-signing-env.mjs`, `MIRROR_REQUIRE_RELEASE_SIGNING=1`, `apksigner verify` rejecting debug certs), OTA disabled/narrow-only guard, offline guard, and privacy canary self-tests.

## Commits

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
- Create make-keystore.yml (df8cfc7) 2026-10-22
- round10: shorten banner to one sentence, move technical to debug hidden, document 0.49 cap and scaling rule in metrics.md, ensure downstream not using scaled as exact (38be89b) 2026-10-22
- round9: Settings rule consistent (exclude Settings everywhere, only launchers+Mirror close), UI clearly says sessions approximate scaled to daily totals, add fixture README for real Honkai capture via debug Share, scores not exact from approximate (approximate flag caps confidence low) (257434c) 2026-10-21
- round8: OS aggregate for per-app daily totals (matches Digital Wellbeing by construction), raw events only for timeline approximate scaled to daily totals, hidden debug screen tap 7x build, fix validation same period, capture Honkai raw events fixture explaining 99% loss (systemui fg closing, className mismatch, 2s overlap) (aefba63) 2026-10-21
- Update android-build.yml (5ca1a67) 2026-10-21
- lint: allow require in plugins, allow any in store, disable no-console in App.tsx for debug logs (1e119f8) 2026-10-21
- round7: dynamic HOME launcher detection via CATEGORY_HOME, exclude POCO launcher com.mi.android.globallauncher, single-day view with day picker OS vs Mirror, collecting since line (first sync 1d back), readable fallback for com.flow.mobile, exclude Mirror itself, Honkai raw events logging and time-lost analysis (73ab439) 2026-10-21
- Update android-build.yml (b44b70e) 2026-10-20

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
