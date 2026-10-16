# Mirror

**Privacy-first digital behaviour analytics. Local-first, mobile-first, no scraping.**

Mirror shows you *how* you use your phone, not just how long: depth vs. endless
scrolling, curiosity vs. habit, how your interests evolve, and calm weekly goals.
Raw history (titles, searches, timestamps) never leaves the device in Privacy Mode.
There is no engagement-maximising design in this product, by policy — see
`docs/design/00-image-analysis.md` §2 for the visual consequences.

> **Build status:** pre-code. The repository currently contains the P-UI-0 design
> analysis (the gate before any UI code) and the tooling that produced it.
> Phases P-UI-1 onward are listed in the project brief; the app scaffolding arrives
> with P0.

---

## Current phase — P-UI-0: Image analysis → design brief

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
| **P-UI-0** | image analysis → design brief ✅ *(this phase, awaiting approval)* |
| P-UI-1 | image-derived tokens + single-file HTML phone-frame prototype (light/dark) |
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
