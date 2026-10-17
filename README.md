# Mirror

**Privacy-first digital behaviour analytics. Local-first, mobile-first, no scraping.**

Mirror shows you *how* you use your phone, not just how long: depth vs. endless
scrolling, curiosity vs. habit, how your interests evolve, and calm weekly goals.
Raw history (titles, searches, timestamps) never leaves the device in Privacy Mode.
There is no engagement-maximising design in this product, by policy — see
`docs/design/00-image-analysis.md` §2 for the visual consequences.

> **Build status:** P-UI-0…P-UI-2, **P0**, **P1a**, **P1b-1** and **P1b-2 are
> approved**. **P2 is delivered for review:** the IQS scoring engine with signal
> confidence, the dashboard, Why sheet, Depth, Curiosity vs habit, IQS and Sessions
> screens reading engine output, and an import screen over the tier-B parsers.
> **Step 0 (Gradle compile + merged-manifest gate) and Release Stage 1 (signed
> APK/AAB) are MANUAL** — this environment has no JDK, no Android SDK and no
> signing identity. `make release-stage1` runs every automated check and prints
> the manual remainder.

---

---

## P1a (delivered for review) — React 19 migration

- **React 19.3.1 / RN 0.88 / `@types/react` 19.3** in the root, `packages/ui` and
  the app workspace. `react-test-renderer` 19.3.1 remains (deprecated upstream,
  still correct here); tests now render through `act`, because React 19 commits
  concurrently and a bare `create()` sees an empty tree.
- **Extensionless relative imports** in every package: Metro resolves `./x.js`
  literally and cannot fall back to `.ts`, so this was required to bundle the
  design system from source. No build step was added for the UI.
- **`packages/ui` is linted**, 21 dead-code findings removed, gallery byte-identical.
- **`--legacy-peer-deps` removed**; `npm install` and `npm ci` run plain.
- **Bundle evidence.** Metro production bundle: 642 modules / 31 npm packages.
  Advisories dropped 47 → 21 (33 → 14 high). The three packages that actually
  carry advisories — `braces`, `node-forge` (high), `uuid` (moderate) — are **not
  in the bundle**. `npm run security:bundle` enforces this and writes
  `.reports/bundle.json`.

---

## P0 (approved) — the foundation

P0 is the layer everything else is written against. It ships no screens and no
binary; it ships the contracts, and tests that make the contracts expensive to
break.

| artifact | what it is |
| --- | --- |
| [`packages/shared-types/`](packages/shared-types) | **the event schema** (`src/event.ts`) with `session_id`, `item_hash`, `topic_vector` and `completion_ratio`, a hand-written validator with field-level errors (`src/validate.ts`), the JSON Schema descriptions, the four-tier model, preferences/flags, and the **`consent_log` / `retention` / `connections`** record schemas |
| [`packages/core-analytics/`](packages/core-analytics) | sessionisation with explicit drop reasons, ingestion into sessions + daily rollups, the cursor-state collector, and the deterministic synthetic dataset used by every later test |
| [`packages/connectors/`](packages/connectors) | the OAuth connector registry, its scope allowlist, the refusal list (no official API → no connector), and the extension allowlist |
| [`scripts/privacy/`](scripts/privacy) | the canary scanner, an end-to-end self-test, a mitmproxy addon, a Playwright runner and the emulator runbook |
| [`scripts/security/`](scripts/security) | the secret scanner (patterns + entropy, placeholder-aware), the dependency-audit gate and the bundle reachability check |
| [`packages/store/`](packages/store) | encrypted local storage: migrations (v2), AEAD field encryption, sessions/vectors/gaps/rollups, consent enforcement, retention and delete-all |
| [`packages/importers/`](packages/importers) | tier-B preview → confirm importers for Reddit's data export and Google Takeout, with HMAC dedupe and import-scoped revocation |
| [`packages/ml/`](packages/ml) | on-device embeddings — a **labelled placeholder** (384-d hashed n-grams) with the model-id re-embedding path wired into the store |
| [`scripts/android/`](scripts/android) | the merged-manifest gate and its fixtures |
| [`docs/P1B.md`](docs/P1B.md) | storage crypto, threat model, cursor state, counted gaps, ingestion, importers, the placeholder embedder, the SQLCipher deviation and the manifest gate |
| [`docs/ANDROID_PERMISSIONS.md`](docs/ANDROID_PERMISSIONS.md) | every Android permission that will ever exist, when it is requested, and why boot sync needs none |
| [`docs/store/FAMILY_CONTROLS_REQUEST.md`](docs/store/FAMILY_CONTROLS_REQUEST.md) | the ready-to-submit iOS entitlement request text |
| [`infra/workflows/`](infra/workflows) | CI (`ci.yml`) and the device/extension canary workflow (`privacy-canary.yml`); they live here because the pushing GitHub App cannot write `.github/workflows/` — activation command in that folder |
| [`apps/mobile/app.json`](apps/mobile/app.json) + [`eas.json`](apps/mobile/eas.json) | app identity, the permission surface, and the three build profiles |
| [`docs/privacy/CANARY.md`](docs/privacy/CANARY.md) | how a canary run works, and which parts are automated |
| [`docs/STORE_READINESS.md`](docs/STORE_READINESS.md) | the Data safety / App Privacy draft, and the release-stage checklist |

### What P0 asserts

- **The schema is closed.** An unknown field is rejected, because an unknown field
  is either a bug or a leak. `content: "content"` from `origin: "os"` is rejected
  as fabricated — the OS cannot produce titles or queries.
- **The embedding is a direction, not a title.** `topic_vector` must be **384**
  finite numbers in [-1, 1] with a unit norm (the spec's dimension, matching the
  P1b encoder); `item_hash` must be 64 hex characters and `session_id` must be
  attributed, not guessed.
- **Consent is data.** A/B/C events must cite a grant; D events must not (the OS
  grant lives in settings). Revocation is a record, not a boolean.
- **Telemetry cannot be added by deployment.** `applyOverrides` accepts a
  narrowing only: a remote override that would enable social, a tier or
  notifications is refused, with a reason.
- **A connector is a permission request.** Every scope must be in the provider's
  allowlist *and* used by a collector; write scopes, password flows and web
  callbacks are refused; scraping-only sources are on the refusal list with a
  reason a person can read.
- **The harness catches leaks, including encoded ones.** Canaries are found in
  clear text, percent-encoded, inside base64 blobs (a `Basic` auth header), in hex
  dumps and in UTF-16LE text; a clean transcript stays clean; a look-alike token is
  not flagged.
- **Release config is tested like code.** The only Android permission requested is
  usage access; AD ID, contacts, location, mic, camera and SMS are explicitly
  *blocked*; the extension asks for `storage` and five hosts, never `<all_urls>`.
- **Secrets and dependencies are gated.** A pattern + entropy scanner reads every
  file git would commit; `npm audit` blocks critical advisories and reports the
  rest. Both run in CI and locally.

### Install

`npm install` is plain npm: the design system and the app are both on React 19 /
RN 0.88 since P1a, so no peer-resolution flag is needed. If a future dependency
reintroduces a conflict, the fix is to resolve the versions — not to add
`--legacy-peer-deps` back.

### Run it

```bash
npm install
npm run verify            # all checks: 386 Node + 9 Python
npm run test:privacy      # scanner tests, end-to-end self-test, mitmproxy addon tests
make android-build        # Gradle + merged-manifest gate — needs JDK/SDK (MANUAL precondition)
make release-stage1       # Stage 1 preflight; signing itself is MANUAL
```

Measured: **386** Node tests (tokens 24 · prototype 18 · ui 37 · import screen 6
· mockups 17 · event schema 23 · records 21 · preferences 22 · sessions 16 ·
ingestion 18 · collector 25 · connectors 20 · store 22 · embeddings 12 ·
importers 19 · scoring 17 · config 17 · merged manifest 12 · release 4 · canary
18 · security 18) and **9** Python addon tests. `npm run verify` is the CI target. The prototype
measurement (`npm run check:prototype`) still needs a browser and exits 2 here;
CI runs it non-blocking and says so.

---

## P-UI-2 (approved) — React Native design system + screen mockups

`/packages/ui` is now a real React Native package: typed primitives, a theme
factory, feature flags and data-tier rules, plus a component for every screen in
the inventory. It renders through the same `react-native` API the app will use —
in the mockups that API is bound to the DOM by `mockups/rn-dom.tsx`, so there is no
second styling path and no hand-written CSS to drift.

| artifact | what it is |
| --- | --- |
| [`packages/ui/src/`](packages/ui/src) | the design system: `tokens.ts`, `theme.tsx`, `flags.ts`, `tiers.ts`, `a11y.ts`, `format.ts`, `primitives/*`, `patterns.tsx` |
| [`packages/ui/screens/index.tsx`](packages/ui/screens/index.tsx) | all **28 Section J items** (`J1`–`J28`) as components — screens, sheets, states and the widget — each with the rule it obeys, the tiers it needs and its empty state |
| [`packages/ui/mockups/gallery/index.html`](packages/ui/mockups/gallery/index.html) | **the gallery** — every screen × persona × state × theme, dark and light |
| [`packages/ui/README.md`](packages/ui/README.md) | the component API and how to add a screen |
| `packages/ui/tests/ui.test.mjs` | 37 component tests (tokens, theme, blur budget, contrast, a11y, flags, inventory, source rules) |
| `packages/ui/tests/mockups.test.mjs` | 17 tests over the rendered artifacts (28 items present, sheets layered over parents, 48dp on every target, offline, honest empty states) |

### Run it

```bash
npm install            # once (.npmrc handles react-native's exact react pin)
npm run mockups        # render 96 frames (28 Section J items) → packages/ui/mockups/gallery/
npm run typecheck      # tsc --noEmit over packages/ui (src, screens and the DOM binding)
npm test               # 204 Node checks (P-UI + P0) · see the P0 section for the split
npm run verify         # tokens → both typechecks → all 204 tests (python addon tests run separately)
open packages/ui/mockups/gallery/index.html   # no server, no build step, no network
```

### What the P-UI-2 gate asserts

- **No second source of truth.** Components import colours, spacing, radii, type
  and motion from the generated token object only. A test scans the component
  sources for colour literals and for any second styling path.
- **The blur budget is enforced at runtime, not documented.** `useLiveBlur` hands
  out at most `glass.blurBudget` grants per renderer; the test renders five
  candidates and asserts exactly three are live, and that the rest fall back to a
  pre-composited fill.
- **Reduced transparency and reduced motion are real states.** Every glass fill is
  recomputed for opacity, `blurPx` goes to 0, and transitions collapse — asserted
  per theme, not spot-checked.
- **Contrast is composed, not assumed.** Text contrast is measured against the
  *composited* colour over every backdrop stop, so a translucent card cannot hide
  a failing pair.
- **Every item declares its tiers and degrades honestly.** Each screen renders a
  `DegradedNotice` naming what it is missing rather than approximating a signal,
  and the "empty" frame of a screen that needs A/B/C is rendered for a persona who
  lacks them — so the degraded view is what a reviewer sees.
- **The inventory is the brief's, item for item.** `SECTION_J` holds the 28 items
  verbatim; a test asserts `SCREENS` matches it in id, title, kind and parent.
- **48dp everywhere, on the rendered output.** Every tap target in all 96 frames is
  measured; a frame with no targets at all fails as a vacuous pass — that check is
  what forced real affordances onto screens that only looked finished.
- **No network, no storage, no analytics.** Asserted by scanning the sources and by
  the mockup output containing no external references.

---

## P-UI-1 (accepted) — image-derived tokens + phone prototype

Everything visual is generated from the same reference image as the P-UI-0 brief,
by one zero-dependency script. Dark is the default theme and is **derived** from
the image, not inverted from the light theme (a naive inversion crushes the
mirrored top cluster into the sRGB dead zone; measured and rejected — see the
generator's `darkDerivation`).

| artifact | what it is |
| --- | --- |
| [`prototype/index.html`](prototype/index.html) | **the prototype** — one file, 390 × 844 phone frame, onboarding → permission primer → dashboard, swipeable hero, sheets, Private/Public boundary |
| [`packages/ui/tokens/image-tokens.json`](packages/ui/tokens/image-tokens.json) | every token with its measured provenance, both themes, the contrast audit, and the logged adjustments |
| `packages/ui/tokens/index.ts` · `tokens.css` | typed `as const` export and CSS custom properties (dark under `:root`, light under `[data-theme="light"]`) |
| [`docs/design/contrast-audit.md`](docs/design/contrast-audit.md) | 14 audited pairs with floors/AA/AAA and the 4 adjustments the floor forced |
| [`scripts/generate-tokens.mjs`](scripts/generate-tokens.mjs) | the generator: PNG decode, OKLab/OKLCh, WCAG contrast, deterministic k-means, CSS injection |

### Run it

```bash
npm run tokens        # regenerate tokens + inject them into the prototype
npm test              # 42 checks: token contract + prototype behaviour
npm run check:prototype   # the same checks in a real browser (needs puppeteer/playwright)
open prototype/index.html # no server, no build step, no network
```

### What the gate actually asserts

- **48dp**: every `[data-tap]` element inside the phone is measured on the rendered
  tree and must be ≥ 48 × 48 — in the test suite *and* by the prototype's own
  "Run checks" panel, so the shipped verifier and CI cannot disagree.
- **Contrast**: 14 pairs per theme, checked with WCAG relative luminance; the
  generator throws rather than emitting a failing palette, and every automatic
  adjustment (4 of them) is logged with its before/after ratio.
- **Offline**: the prototype makes zero network requests, stores nothing, and
  loads no third-party analytics — asserted mechanically, not by review.
- **Blur budget**: at most 3 live-blurred layers on mobile. The prototype spends
  2 (tab bar, sheet) and pre-composites everything else.

---

## P-UI-0 (approved) — image analysis → design brief

The attached design reference is the single source of truth for the visual
identity ("Frosted Horizon"): its layout language, materials and mood are measured
from the pixels, never invented.

| artifact | what it is |
| --- | --- |
| [`docs/design/00-image-analysis.md`](docs/design/00-image-analysis.md) | **the brief** — palette, glass recipe, mood, texture, safe zones, typography (awaiting approval) |
| [`docs/design/measurements.md`](docs/design/measurements.md) | generated evidence: every number in the brief with method + confidence |
| `packages/ui/tokens/evidence/reference-measurements.json` | the same measurements, machine-readable, consumed by the P-UI-1 token generator |
| `public/art/reference.webp` | the reference image (design asset + token source, 71 KB) |
| [`scripts/design/analyze-reference-image.py`](scripts/design/analyze-reference-image.py) | reproducible analyzer (colour, glass opacity, radii, type, texture, safe zones, contrast audit) |
| [`scripts/design/font-match.py`](scripts/design/font-match.py) | identifies the reference typeface against the whitelisted font families |

### Reproduce the analysis

```bash
pip install numpy pillow                     # only runtime deps
python3 scripts/design/analyze-reference-image.py
# -> docs/design/measurements.md
# -> packages/ui/tokens/evidence/reference-measurements.json

# font identification (needs the whitelisted families as TTF; see the script docstring)
python3 scripts/design/font-match.py --fonts-dir /tmp/ttf
```

### Headline measurements

- The reference is **achromatic** — mean OKLab chroma 0.00011, max 0.038; there is no
  brand hue to copy, so Mirror's colour lives only in generated artwork.
- Surfaces are literal: graphite **`#262626`** (σ 0.2/255), white **`#FDFDFD`**
  (σ 0.0/255), shell glass **white @ ~0.20–0.48** over a heavily blurred backdrop.
- Text is **Inter** (mask-IoU 0.76/0.54 against the two cleanest samples; the only
  whitelisted family competitive on both, within 4 % on width).
- There is **no film grain** in the reference (high-pass σ 0.22/255), contradicting
  the assumed 0.04–0.08 overlay — see the brief §9 for all corrections.

---

## Roadmap (phases, each ending in a review)

| phase | scope |
| --- | --- |
| **P-UI-0** | image analysis → design brief ✅ approved |
| **P-UI-1** | image-derived tokens + single-file HTML phone-frame prototype (dark default, light toggle) ✅ accepted |
| **P-UI-2** | React Native design system in `/packages/ui` + mockups of all 28 Section J items 🔁 *(in review — inventory replaced after review feedback)* |
| P0 | monorepo scaffold, CI, EAS build profiles, event schema, connectors & preference schemas, synthetic data, canary harness, store-readiness draft |
| P1 | encrypted local storage, Android usage collector, ingestion pipeline, importers, embeddings |
| P2 | scoring engine + dashboard + Why-this-score + **release stage 1** (signed APK/AAB) |
| P3 | interest evolution, discovery timeline, rabbit-hole detection, what-if, focus windows |
| P4 | behaviour profile, weekly report, attention budget, ask sheet, widgets |
| P5 | OAuth connectors, consent dashboard, browser extension, iOS DeviceActivity, **release stage 2** |
| P6 | backend, encrypted sync, social layer, share cards, **release stage 3** |
| P7 | security review (ASVS/MASVS), store readiness, staged rollout, **release stage 4** |

## Non-negotiables

1. Local-first: raw events stay on the device in Privacy Mode.
2. No scraping — official APIs, user exports, or an explicit browser extension only.
3. Two profiles, never merged automatically: **Private** (everything) and **Public**
   (only what you select).
4. Never expose watch/search/purchase history to matched users.
5. Behavioural labels are descriptive estimates, never clinical.
6. No dark patterns, streaks or engagement-maximising nudges.
7. Every feature declares its data tier (A/B/C/D) and degrades honestly.
8. One-time plain-language permissions, then automatic collection, revocable in one tap.
9. Never fake a signal or a capability.
10. Deployment never changes the privacy contract.

## Licence

Not yet chosen — the app is unpublished and the reference image in `public/art/`
is used only as an internal design reference.
