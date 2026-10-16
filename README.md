# Mirror

**Privacy-first digital behaviour analytics. Local-first, mobile-first, no scraping.**

Mirror shows you *how* you use your phone, not just how long: depth vs. endless
scrolling, curiosity vs. habit, how your interests evolve, and calm weekly goals.
Raw history (titles, searches, timestamps) never leaves the device in Privacy Mode.
There is no engagement-maximising design in this product, by policy — see
`docs/design/00-image-analysis.md` §2 for the visual consequences.

> **Build status:** design system in progress, no app code yet. P-UI-0 (image
> analysis → design brief) is approved; P-UI-1 (image-derived tokens + prototype)
> is delivered here for review. The app scaffolding — React Native, storage,
> collectors — arrives with P0/P1.

---

## Current phase — P-UI-1: image-derived tokens + phone prototype

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
| **P-UI-1** | image-derived tokens + single-file HTML phone-frame prototype (dark default, light toggle) ✅ *(this phase, awaiting approval)* |
| P-UI-2 | React Native design system in `/packages/ui` + mockups of every screen |
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
