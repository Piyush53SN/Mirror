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
| P0 | **in progress** | monorepo scaffold, CI, EAS profiles, event + connector schemas, synthetic data, privacy-canary harness, store-readiness draft |
| P1…P7 | not started | — |

---

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
