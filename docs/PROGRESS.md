# Mirror — progress and approved decisions

Living document. **Approved decisions are not re-litigated**; if a later phase
contradicts one, the phase report has to say so explicitly.

Source of requirements: `docs/SPEC.md` (Section J is the 28-item inventory).

---

## Phase status

| phase | state | what shipped |
| --- | --- | --- |
| P-UI-0 | **approved** | image analysis → design brief (`docs/design/00-image-analysis.md`), measurements (`docs/design/measurements.md`), reference copy + analyzer |
| P-UI-1 | **accepted** | generated tokens (`packages/ui/tokens/`), single-file phone prototype (`prototype/index.html`) — commit `93e83cc` |
| P-UI-2 | **approved with corrections** | React Native design system (`packages/ui/src`), all 28 Section J items (`packages/ui/screens`), mockup gallery (`packages/ui/mockups/gallery`), **96** tests. Corrections from review applied — see below |
| P0 | **approved** | monorepo scaffold, CI, EAS profiles, event + preference schemas, connector registry, synthetic data + sessionisation, privacy-canary harness, store-readiness draft |
| P1a | **delivered for review** | React 19 / RN 0.88 migration of `packages/ui`, lint coverage for the design system, `--legacy-peer-deps` removed, Metro bundle check. No new features |
| P1b | not started | encrypted local storage, Android UsageStats collector, ingestion, importers, embeddings |
| P2…P7 | not started | — |

---

## Pre-P1 corrections accepted (2026-10-17)

Six items were raised when P0 was approved. Each changed the repository, not just
this document.

1. **The P-UI-2 corrections are in this file.** They are the section *"Review
   corrections accepted on P-UI-2"* above: tier labels for the four features
   (with `requiresAnyOf` and the refusal for a D-only device), and the phase map
   taken from SPEC §5 (Share Cards = P6, scoring screens = P2, Intent Check = P3,
   privacy surfaces = P5). The interpretation note about "feature 23" stays: the
   rule applied is SPEC §2.7/§2.9 (every feature declares its tier and degrades),
   because Section J item 23 is the Privacy Receipt.
2. **Lint, secret scanning and dependency scanning now run in CI** — and locally,
   through the same commands. Details and thresholds are in *"Security gates"*
   below. Dependency scanning reports 33 high advisories in the Expo toolchain
   today; that number is recorded here rather than hidden by a threshold.
3. **The event schema now carries the four named fields**, and the three record
   schemas exist: `consent_log`, `retention`, `connections`. The event schema was
   moved to **snake_case** as part of this, so `session_id` is the same name in
   TypeScript, JSON and storage. See *"P0 schema additions"* below.
4. **Android permissions are answered on paper and in a test.**
   `docs/ANDROID_PERMISSIONS.md` lists every permission that will ever exist,
   what triggers it and what is never requested. Boot sync uses WorkManager, so
   Mirror does **not** request `RECEIVE_BOOT_COMPLETED`; notifications are
   declared and requested in P4 when the feature exists. `app.json` is unchanged,
   and `tests/config.test.mjs` fails if a declared permission is undocumented or a
   future permission is declared before its phase.
5. **`--legacy-peer-deps` is a temporary bridge, not a habit.** The root installs
   React 18 (design system, `react-test-renderer`) while the app workspace needs
   React 19 / RN 0.88; npm's strict peer resolution rejects that tree. P1a removes
   the React 18 half, after which `npm install` must succeed **without** the flag
   and CI must fail if it does not.
5a. **P1a must show that the 33 high advisories do not reach the app bundle.**
   They are all in build-time tooling (Expo CLI, Metro, Jest, RN CLI), but "it is
   dev-only" is a claim, not evidence: P1a packages the real UI through Metro with
   a source map and checks the module graph against the audit list. The check and
   its result are recorded in the P1a report.
6. **The Family Controls request text is ready to submit** —
   `docs/store/FAMILY_CONTROLS_REQUEST.md`, with the two fields only the account
   holder can fill (Team ID, support email) marked. It is a **MANUAL** step and is
   submitted before the P5 build.

### P0 schema additions (2026-10-17)

- `session_id` — optional on raw events, required on `intent_label`; assigned at
  ingest, format `ses_…`. Sessions stay derived; the field says which sitting an
  event was attributed to.
- `item_hash` — 64 lowercase hex characters: HMAC-SHA256 of a canonical item
  identity, keyed by a per-install secret in the platform keystore. It allows
  dedupe and joins without storing a URL or title. Validator and schema both
  require it to ride on a `content: "content"` event.
- `topic_vector` — exactly **384** finite numbers in [-1, 1] with a unit norm
  (0.97–1.03 tolerance for 4-decimal rounding). A direction, not a title. The
  validator rejects wrong dimensions, NaN, out-of-range values, the zero vector
  and non-unit vectors; the JSON Schema description carries the shape and the
  executable check carries the norm.
  - **Dimension corrected (2026-10-17): 32 → 384.** The specification says 384;
    the earlier value was my own choice, and it was wrong. 384 is also the output
    width of the MiniLM-class encoders P1b will run on-device, so no projection
    step is needed. Storage cost: float32 × 384 = **1,536 bytes per content
    event**, which is why P1b stores vectors as BLOBs, not JSON numbers; the
    schema is the wire shape, not the on-disk encoding.
- `completion_ratio` — 0..1, replacing the earlier `completed` name; content
  signal, so it requires `content: "content"`.
- **Naming decision:** the event schema is snake_case (`schema_version`,
  `duration_ms`, `scroll_depth`, `source_id`, `export_format`, `window_id`). It is
  the persisted wire format and the brief names four of its fields in snake_case;
  a mixed convention would be worse. Storage-facing record schemas match. The
  preferences object remains camelCase — it is an in-process settings API, not a
  persisted payload — and this is the only mixed boundary in the codebase.
- `consent_log` — append-only entries (`granted` / `updated` / `revoked`), ordered,
  with unique ids; a revocation must reference a preceding grant and must set
  `deletes_imported_events: true`. `liveConsent()` derives current state;
  `eventsCoveredBy()` names what a revocation deletes.
- `retention` — per-class day counts, `diagnostics: 0` (there are none),
  `on_revoke: delete_imported_events`, `on_uninstall: delete_everything`, and a
  hard-delete bound no class may exceed.
- `connections` — status, granted scopes, `token_ref: keystore:…`, timestamps,
  import count. **No credential field exists**, and the validator rejects any key
  that looks like one (`access_token`, `refreshToken`, `client_secret`,
  `password`, `authorization`, …). Error records carry an uppercase code, never
  provider text.

### Security gates (2026-10-17)

| Gate | Command | Where in CI | Rule |
| --- | --- | --- | --- |
| Lint | `npm run lint` | `verify` job, step *Lint (ESLint)* | ESLint 9 + typescript-eslint over the P0 packages, `scripts/` and the Node tests. `packages/ui` joins in P1a, when those files are already being edited. |
| Secret scan | `npm run security:secrets` | `verify` job, step *Secret scan* | Scans every tracked and untracked-not-ignored file: private keys, AWS/GitHub/Slack/Stripe/Google keys, JWTs, bearer headers, `EXPO_TOKEN`, and high-entropy `key = "…"` assignments. Placeholders (`MRRCANARY-…`, `example`, `<your-key>`) are reported as allowed, never as findings. Zero findings is the only passing state. |
| Dependency audit | `npm run security:deps` | `dependencies` job | Fails on any **critical** advisory. **High** advisories are reported and tracked; after P1a the count is 14, all propagated from `braces` / `node-forge`. |
| Bundle reachability | `npm run security:bundle` | `bundle` job | Bundles the real app entry with Metro and fails if any package that **carries** an advisory is in the source map. Reports parents that are present. Refuses an empty map. |
| Privacy canary | `npm run test:privacy` | `privacy-scanner` job | Unchanged from P0; exit 2 is "not run", never a pass. |

Current dependency state (measured 2026-10-17, after P1a): **0 critical, 14 high,
7 moderate**. The three packages that carry advisories are `braces`, `node-forge`
and `uuid`; the bundle check proves none of them ships. See the P1a section.



### P1 plan (10 lines)

1. **P1a — toolchain only.** Migrate `packages/ui` to React 19 / RN 0.88: peer
   and dev dependencies, `@types/react`, and the deprecated
   `react-test-renderer` replaced with the renderer that ships with the new stack.
2. **P1a — gates.** Add `packages/ui` to ESLint, regenerate the 96-frame gallery,
   prove every UI/mockup/token test passes unchanged, remove
   `--legacy-peer-deps` from README, Makefile and CI, and require a clean plain
   `npm install`.
3. **P1a — checkpoint.** Short report (changes, tests, `npm audit` before/after),
   then stop for approval before touching features.
4. **P1b — encrypted store.** SQLite with a key held in the platform keystore;
   versioned migrations; delete-all; retention expiry driven by the `retention`
   policy; every write appends to the `consent_log`.
5. **P1b — UsageStats collector.** Kotlin module over `UsageEvents`: foreground
   intervals only, permission check with the Settings deep link, WorkManager
   bounded daily job, collection off the UI thread, no content fields. Its
   permission test reads the **final merged Android manifest** produced by the
   build (`app/build/intermediates/merged_manifests/...` or `aapt2 dump
   permissions` on the APK) — not `app.json` — so a transitive library cannot add
   a permission between config and artifact.
6. **P1b — ingestion.** Assign `session_id`, dedupe with `item_hash`, persist
   `topic_vector`, enforce tier/consent at write time, crash-safe batches.
7. **P1b — importers.** Google Takeout and a connector export parser: streaming,
   dry-run preview of what would be imported, dedupe against existing hashes,
   revoke deletes exactly what the import produced.
8. **P1b — embeddings.** `packages/ml`: an on-device, network-free embedder
   (versioned model id) producing 32-d unit vectors, with a golden-vector test and
   a cold-start budget.
9. **P1b — tests and budgets.** Property tests for store invariants and retention,
   import edge cases (empty, huge, malformed), canary run on an emulator with the
   real store, and measured cold start / battery notes.
10. **P1b — report.** The 8-part phase report; release impact: still no release,
    **stage 1 remains P2**.



### P1a delivered (2026-10-17)

**Scope was the toolchain, not the product.** No screen changed behaviour; the
96-frame gallery is byte-identical before and after.

- **React 19.3.1 / React Native 0.88 / `@types/react` 19.3** across the root, the
  design system and the app. `react-test-renderer` was kept at 19.3.1: it is
  deprecated but still the renderer these Node tests use, and it works. A move to
  React Native Testing Library belongs with a Jest/JUnit runner in P1b, not in a
  version-bump review.
- **Tests needed a real change.** React 19 renders concurrently: a bare
  `TestRenderer.create()` returns before commit, so `toJSON()` is null and 11
  screen tests failed with "rendered nothing". Every render now goes through
  `act` with `IS_REACT_ACT_ENVIRONMENT = true`. The tests assert the same things.
- **Relative imports are extensionless** (24 files). Metro resolves `./tokens.js`
  literally and does not substitute `.ts`, so the design system could not have
  been bundled from source with the old specifiers. TypeScript (`bundler`
  resolution) and esbuild are unaffected.
- **A minimal app entry exists** — `apps/mobile/{index.js,App.tsx,babel.config.js,
  metro.config.js,tsconfig.json}` — because the migration is not proven until the
  real toolchain bundles it. It renders the first screen in the inventory and is
  replaced by navigation in P1b.
- **`packages/ui` is linted.** 21 findings, all dead code: unused imports and
  destructured props in approved screens, a dead colour helper, unused locals in
  the DOM binding. Removing them changed no rendered output.
- **`--legacy-peer-deps` is gone** from README, Makefile and both CI workflows.
  Verified: `npm install` and `npm ci --dry-run` both exit 0 without the flag.

**Dependency and bundle evidence (the P1a requirement).**

| Measurement | Before | After |
| --- | --- | --- |
| `npm audit` advisories | 47 (33 high, 14 moderate) | **21 (14 high, 7 moderate)** |
| Actual advisory-carrying packages | braces, node-forge, uuid | braces (high), node-forge (high), uuid (moderate) |
| Packages in the Metro production bundle | — | 642 modules / 31 npm packages |
| Advisory-carrying packages in the bundle | — | **0 of 3** |

Why the count moves from 33 to 14 but does not reach zero: npm reports a *parent*
as high when a dependency is vulnerable, so `expo`, `react-native`, `@expo/cli`,
`@expo/metro` and the Metro polyfills appear in the audit; the advisories
themselves are in `braces` (DoS in micromatch globbing), `node-forge` (RSA
signature check) and `uuid` (moderate). None of those three is in the bundle —
verified from the production source map, not asserted. The five flagged parents
that *are* present are the runtime itself plus Metro's ~100-line require shim and
JS polyfills; their vulnerable dependencies are absent. The gate
(`npm run security:bundle`) fails if any advisory-carrying package ever enters the
module graph, and refuses an empty source map so it cannot pass vacuously.

**P1a limitations, recorded:**

- The bundle check covers the P1a entry (the design system + Expo runtime). As
  P1b adds storage, the collector and navigation, the same command covers them —
  the check is on the entry, not on a fixed file list.
- `npm audit --strict` still cannot pass: Expo has not shipped patched `braces` /
  `node-forge`. The gate stays on critical + bundle reachability until it does.
- iOS has not been bundled; only Android was, and both use the same Metro graph.
  The iOS export is a P1b CI addition if a native iOS build begins.


## Approved decisions

### Process

- **Phase output** is always the 8-part report (plan, file tree, code, tests, run
  instructions, limitations, release impact with AUTOMATED/MANUAL labels, and a
  question only if blocking), then **stop for approval**.
- **Never claim a pipeline, deploy or store step works unless it is scripted and
  verified.** Every deployment step is labelled AUTOMATED or MANUAL.
- **Measured beats assumed.** Where a measurement disagrees with an earlier
  assumption or with the draft spec's example values, the measured value ships
  and the disagreement is recorded.
- **Section J is 28 items, verbatim from the brief** (`docs/SPEC.md` §6). The
  18-item list delivered earlier in P-UI-2 was my derivation and has been
  **replaced**. Every item — screens, sheets, states and widgets — must appear in
  the gallery and be covered by tests.
- **The design brief stays frozen.** The measured `title-lg 22/28` type step ships
  as a **token delta** (`packages/ui/tokens/image-tokens.json`), and the brief is
  not edited to absorb it.
- **Mockups live in `packages/ui/mockups/gallery/`** (committed). They are
  rendered from the real components through a DOM binding of `react-native`, so a
  token change changes the picture and no second styling path exists.
- **A sheet or a state is never rendered as a page.** The Why drawer, the Ask
  sheet, the Privacy Receipt, the persona picker, the share card and the update
  notice are drawn *over* the screen they belong to, and the gallery marks which
  screen that is.

### Review corrections accepted on P-UI-2 (2026-10-17)

Two fixes were requested before P0, and both changed the model rather than the
copy. Recorded here because either one could otherwise be "fixed" back.

1. **Data tiers were wrong for four features.** `Depth`, `Curiosity vs Habit`,
   `Rabbit Hole` and `Focus Windows` were labelled tier-D, i.e. computable from
   OS usage data alone. They are not: session length says *how long*, not *how
   deep*, and the brief forbids presenting one as the other. The tier model now
   supports an **anyOf** requirement alongside outright needs:
   - `ScreenSpec.requiresAnyOf: DataTier[]` — at least one of these tiers.
   - `degrade(available, needs, feature, anyOf)` reports `missing` and
     `missingAny` separately and says *"it needs tier D data and at least one of
     tier A/B/C (topics, searches or scroll depth)… Mirror will not estimate
     it."*
   - Those four screens now **refuse** for a tier-D-only persona instead of
     relabelling visit length as depth; `Focus Windows` had explicitly claimed
     "tier D only" in copy and that claim is gone.
   - A gallery frame is "degraded" when the persona cannot supply **anyOf** too,
     so the empty frames are real degraded renders (18 of 96).
   - Tests: the four declare `requires: ['D'], requiresAnyOf: ['A','B','C']` and
     refuse for D-only; four genuinely D-only features still render for a
     D-only persona (the rule is per-feature, not a blanket block); `degrade()`
     covers both-missing, anyOf-missing and satisfied cases.
   - *Interpretation:* the review referenced "feature 23" for this rule; it was
     read as the brief's honest-capability/tier-declaration rule (SPEC §2.7,
     §2.9). If a different numbered feature was meant, this is the wrong reading
     and the tier table should be re-derived from it.

2. **Phase labels now come from the roadmap, not from intuition.** `PHASES` in
   `packages/ui/screens/index.tsx` records `SPEC.md` §5 as data, and every
   Section J item's `phase` is checked against it:
   - **Share cards → P6** (with the social layer / release stage 3), not P4.
     The private share-card preview is J26 at P6.
   - Depth, Curiosity vs Habit, IQS, Sessions, the Why drawer and the demo
     persona picker → **P2** (scoring engine + dashboard + release 1), not P3.
   - Intent Check settings → **P3** with focus windows.
   - Privacy Receipt, Privacy Center, Connections and the update state → **P5**.
   - Public Profile editor, Matches/Chat, share cards → **P6**.
   - A test asserts the full 28-item mapping, so a phase cannot drift silently.

**Reviewed and confirmed (no change needed):**

- **Tab bar** is `Home · Insights · Journey · Sessions · You`, in that order
  (`screens/tabs.ts`, one source for the bar and the tab mapping). While
  confirming it, a real defect surfaced: the bar was **never rendered** — screens
  reserved its space with a spacer and nothing drew it. Every tab screen now
  renders it through `TabFooter` (which also asks `useLiveBlur`, so the bar is
  one of the two blurred surfaces). Tests: five labels in order, on every tab
  screen, exactly one selected and it matches the screen's tab, every target
  ≥ 48 dp.
- **Demo data chip** did not exist as a chip; it was a button inside onboarding.
  There is now a `Demo data · <persona>` chip rendered by `Screen` whenever the
  app is showing demo data (mockups always do). Tests: present and naming the
  persona on the dashboard, accessible name says "Not your data", and absent
  when no demo persona is passed.
- **Private | Public pill** now has explicit coverage: both options are labelled,
  each states its own consequence sentence when selected, the switch changes the
  sentence, DIP/PIP never appear in UI copy, and it is present on every screen
  that can share (dashboard, connections, public-profile editor, share card).
  The public-profile editor's toggle was static (`onChange` no-op) and is now
  stateful.

### Design, measured from the reference image

- Colour is **achromatic** (mean OKLab chroma 0.00011); 13 measured tokens; no
  accent colour, no grain, no vignette.
- **Dark is the default** theme and is derived from the same image, not inverted:
  dark mirrors OKLab L and re-spreads the elevation ladder over L\* 4→33 to
  escape the sRGB dead zone. `"dark = 1 − light"` was measured and rejected.
- **Glass:** shell α ≈ 0.32 light / 0.087 dark with a 1 px `rgba(255,255,255,…)`
  hairline; blurred-photo backdrop ≈ 40–60 px equivalent. **Live blur is limited
  to the tab bar and the sheets — 2 of a budget of 3 layers.** Shell, cards,
  chips, segmented controls and icon buttons use pre-composited fills.
- **Radii:** measured shell 28 (rms 0.9), hero 20, month-progress 20, dock 18;
  shipped xs 6 · sm 10 · md 14 · dock 18 · card 20 · hero 24 · sheet 28 ·
  pill 999 · phone 40.
- **Type: Inter** (best fit 0.618). display 34/40 w700 −0.02em · headline 26/32
  w700 · title-lg 22/28 w700 −0.015em · title 17/22 w600 · body 15/21 w500 ·
  label 13/17 w500 · micro 11/14 w600 +0.06em; every size
  `calc(Npx * var(--m-text-scale))`.
- **Contrast:** 14 audited pairs, all ≥ 4.5:1, with 4 automatic adjustments
  logged. The reference itself fails AA in one place
  (`mutedOnGraphite` 3.27:1) — that is recorded, not copied.
- **48 dp** everywhere on the phone, including sub-48 elements padded to a 48 dp
  hit area; verified by measurement, in the test suite and by the prototype's own
  checker.

### Product rules encoded in the design system

- Data tiers **A/B/C/D** with `degrade()`: a feature that cannot be computed says
  *"<feature> is unavailable: it needs tier X data, which is not on this device.
  Mirror will not estimate it."* and names how the user could change that.
- **Typed feature flags**: anything that leaves the device, and social features,
  are `owner: 'user'`, `defaultOn: false`. Flags can never enable collection.
  `auditFlagPosture()` fails the build if a user-owned flag defaults on, or if a
  default-on flag has no empty state.
- **Boundary toggle** states the consequence in both directions (Private /
  Public). DIP and PIP never appear in UI copy.
- No streaks, no guilt copy, no engagement notifications; an empty state offers at
  most one action and never a nudge.

---

### P0 decisions (2026-10-17)

1. **One closed event schema, one validator.** `packages/shared-types` defines the
   eight event kinds. Unknown fields are rejected; A/B/C events must cite a consent
   grant and D events must not; `content: "content"` from `origin: "os"` is rejected
   as fabricated. The JSON Schema is the interop description and a test keeps it in
   step with the executable validator.
2. **The schema is versioned, not migrated in place.** `schemaVersion: 1` is
   stamped on every event. P1's storage layer will refuse to open a store whose
   events carry a newer version rather than guess.
3. **Sessionisation drops what it cannot prove, with a reason.** Unclosed
   foreground intervals are dropped, not extended to "now"; orphan backgrounds,
   zero-length and below-minimum intervals are reported. The result type carries
   `dropped[]` so a collector bug is visible instead of silently shrinking a total.
4. **The synthetic dataset validates itself.** The generator runs `assertEvent` on
   its own output, so an invalid synthetic event fails at generation rather than
   making every downstream test a test of the wrong contract. It is seeded and
   deterministic.
5. **Connectors are checked before code exists.** A connector must name every
   scope, every scope must be used by a collector, write scopes/password flows/web
   callbacks are refused, and a provider with no official API is on
   `REFUSED_SOURCES` with a reason (Instagram saved, Netflix viewing, TikTok
   history, WhatsApp, banking). Implementations are P5.
6. **Preferences are a permission surface.** Every flag defaults off except the
   on-device-only ones (weekly report, Ask sheet, focus windows); social,
   share cards, nudges, widget and extension capture default off. Remote overrides
   may only narrow: `applyOverrides` refuses anything that would enable a flag,
   grant a tier or enable notifications.
7. **The canary harness ships with its own attacker.** The scanner decodes base64
   (including a token inside a larger blob), base64url, hex, UTF-16LE and
   percent-encoding. The self-test proves a clean transcript stays clean and that
   six planted leaks are each found. Exit code 2 means "not run", never "pass".
8. **Release configuration is tested.** The only requested Android permission is
   usage access; AD ID, contacts, location, mic, camera, SMS and phone state are
   explicitly blocked; the extension requests `storage` and exactly the five
   allowlisted hosts. Any change is a test failure, not a review note.
9. **The extension allowlist has one source.** `EXTENSION_HOSTS` feeds both the
   manifest check and (P5) the runtime check; the manifest and the constant are
   compared by test, so they cannot drift.
10. **Store readiness is written before the store.** The Data safety answers and
    the permission declarations are drafted now, with the manual steps labelled,
    so the app cannot claim one thing and the listing another.

### P0 limitations (recorded, not hidden)

- **No app binary.** P0 ships contracts and configuration; `apps/mobile` has no
  entry point, and no build has been run. EAS profiles are validated config, not a
  verified build pipeline. The first real build is P2's release stage 1.
- **The device and extension canary runs are scripted but not exercised.** There
  is no emulator, no adb, no browser and no Playwright in this sandbox. Both
  scripts exit **2** with an explanation rather than reporting a pass; the scanner
  they use is fully tested (18 Node + 9 Python tests + the self-test).
- **`npm run check:prototype` still exits 2** (no browser). CI runs it
  non-blocking and annotates the result.
- **The app stack is newer than the design system.** Expo 58 / RN 0.88 / React 19
  versus `packages/ui` on React 18 / RN 0.74. P1 upgrades the design system; the
  alternative — pinning the app to a two-year-old SDK — is worse. Recorded in
  `apps/mobile/README.md`.
- **The workflows are in `infra/workflows/`, not `.github/workflows/`.** The
  GitHub App that pushes this branch lacks the `workflows` permission, and GitHub
  rejects any commit containing those paths. The files are final and the command
  to activate them is in `infra/workflows/README.md`. This is a deviation from the
  fixed layout, forced by tooling, and it is recorded rather than silently
  reverted after the push fails.
- **No i18n/RTL pass yet**, unchanged from P-UI-2.

## Known limitations carried forward

- **No browser in the build sandbox.** `npm run check:prototype` exits **2 —
  "nothing measured", never a pass**. The browser gate exists and is scripted; it
  needs a machine with a browser (or CI with one).
- **No device or emulator run yet.** The design system renders through a DOM
  binding; structure, sizing logic and tone are verified, pixels and gestures are
  not. Device verification needs the app shell (P0).
- **Inter is not bundled** as a webfont, so the mockups fall back to
  `system-ui`; the metrics in the tokens are Inter's.
- Text measurement in the repo's DOM stub is character-count based, so widths in
  48 dp reports are approximate; heights and explicit sizes are exact.
- No i18n/RTL pass yet.

## Open questions

- None blocking. (The earlier `title-lg` question is answered: brief frozen, token
  delta ships — see above.)
