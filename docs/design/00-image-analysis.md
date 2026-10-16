# P-UI-0 — Image Analysis → Design Brief

**Style name:** *Frosted Horizon*
**Reference:** `public/art/reference.webp` (also as supplied: 1200×900 PNG — "iDraft" task dashboard on a blurred photo backdrop)
**Status:** awaiting your `approved` (or edits) before any UI code is written
**Generated with:** `scripts/design/analyze-reference-image.py` → `docs/design/measurements.md`, `packages/ui/tokens/evidence/reference-measurements.json`

> Everything below is either **measured** from the reference (with the method and an
> artifact you can re-run) or explicitly labelled a **proposal**. Where the layer-3
> spec made an assumption that the image contradicts, it is listed in §9 with the
> measured value instead. No palette, mood or font was invented.

---

## 0. Method and confidence

| Step | Method | Artifact |
| --- | --- | --- |
| Colour | sRGB → OKLab/OKLCh, k-means (k=7) on 4×-strided pixels, plus 30+ hand-anchored flat-patch samples | `measurements.md` §Palette/Surfaces/Inks |
| Achromatism | OKLab chroma distribution over all 1.08 M pixels | `measurements.md` §Global |
| Glass opacity | Two independent estimators: (a) least-squares fit of inside-shell vs outside-shell luminance per row, (b) local inside/outside patch pairs | `measurements.md` §Glass |
| Radii | Manually anchored silhouette sampling + least-squares circle fit (RMS residual reported); an automated sweep is included in the JSON but is only reliable for high-contrast edges | `measurements.md` §Corner radii |
| Type | Glyph ink bounding boxes on named strings → cap-height/x-height in reference px | `measurements.md` §Type |
| Font identity | The 6 whitelisted families downloaded, converted to TTF, cap-height-calibrated and shape-matched (mask IoU with optimal horizontal alignment) against two clean text samples | `scripts/design/font-match.py` output in §7 |
| Texture | High-pass (5×5 box-subtracted) and Laplacian σ inside flat patches | `measurements.md` §Texture |

**Confidence legend:** *firm* = directly measured, reproducible, low ambiguity · *bounded* = measured with a range that reflects method spread · *proposal* = a design decision, not a measurement (a still image cannot encode motion, blur kernel or interaction states).

---

## 1. What the image actually shows (Step 0, verified by looking)

The attached image is **not** the streaming/movie layout described in Section I Step 0
of the brief (no posters, no "Continue Watching", no "You might like" shelf, no
trailer play buttons). It is a **task-management dashboard** ("iDraft") rendered as
one large floating glass window on a blurred photograph. What *does* match the
spec's description, and is what we actually need, is the **layout language,
materials and mood**:

- A ~1101 × 785 px rounded glass shell floating on a blurred photograph, with a
  visibly thinner, brighter 1 px silhouette line and no hard shadow.
- A top bar inside the shell: dark "Create" pill + white circular icon buttons +
  circular avatar, plus earlier a dark element clipped by the top crop.
- A left vertical dock (174 px wide, opaque near-white) with a dark active pill.
- A 3-column card grid: one graphite "hero" card (the visual anchor), one sunk
  glass chart card, one opaque white card with a ring gauge.
- A bottom row of graphite cards, and a "shelf" row of white cards.
- Type: one grotesque sans, four usable sizes, no colour anywhere.

**Mismatch to confirm (non-blocking):** if the streaming layout was intended, the
attachment is the wrong file — say so and I will re-run this analysis on the right
image. This brief proceeds on the attached image, as instructed ("the attached image
is the single source of truth").

**Also clipped by the upload:** a partially cropped element above the shell
(dark pixels at x 772-844, y 0-55). Not reproduced; the shell *is* the product.

---

## 2. Palette (measured)

### 2.1 The headline finding: the reference has no colour at all

| metric | measured |
| --- | --- |
| mean OKLab chroma (all pixels) | **0.00011** |
| median chroma | 0.00000 |
| p99 chroma | 0.00364 |
| max chroma | 0.03825 |
| pixels with C > 0.005 | 0.685 % |
| pixels with C > 0.02 | 0.003 % |

Pure neutral at every luminance decile (`a* = b* = 0.000` for the darkest 10 %, the
lightest 10 % and the mid 40-60 %). The ≤0.7 % of pixels carrying any chroma are
anti-aliasing edges, plus one real signal: **mid-tone secondary text on graphite is
a very faint cool blue-grey** (`#56565D`, `#747477`; `b* ≈ -0.005…-0.036`, hue 286°).
Everything else is `C = 0`.

**Consequences for the design system**
- There is no brand hue to copy. The "accent" role is *contrast*, not colour:
  `#FFFFFF` on graphite and `#0D0D0D` on white.
- Colour in Mirror's UI will come only from **artwork/insight cards** (Skia-generated),
  exactly as the spec's principle 6 + Section I describe.
- The one place a tint is defensible is muted secondary text on graphite, where the
  reference itself is cool. Mirror will carry that hue for text only (values above).
- This also kills the spec's assumption of "saturate ~140 %" on the glass (see §9).

### 2.2 The seven (thirteen, with inks) tokens the image actually contains

| token role | hex | OKLCh | L\* | measured from |
| --- | --- | --- | --- | --- |
| `backdrop.shadow` | `#8E8E8E` | `oklch(64.7% 0.000 90)` | 64.7 % | dark wedge in the blurred photo (top-centre-right) |
| `backdrop.base` | `#C5C5C5` | `oklch(82.3% 0.000 90)` | 82.3 % | mean of the visible backdrop ring; range `#B4B4B4`…`#D7D7D7` |
| `backdrop.glow` | `#E9E9E9` | `oklch(93.4% 0.000 90)` | 93.4 % | light bloom behind the shell (peaks `#F5F5F5`) |
| `glass.shell` | `#E6E6E6` | `oklch(92.5% 0.000 90)` | 92.5 % | the floating shell (white @ ~0.20-0.48 over the backdrop) |
| `glass.card` | `#EDEDED` | `oklch(94.6% 0.000 90)` | 94.6 % | sunk glass chart card ("Weekly progress") |
| `surface.white` | `#FDFDFD` | `oklch(99.4% 0.000 90)` | 99.4 % | opaque white cards, dock panel, icon buttons |
| `surface.graphite` | `#262626` | `oklch(26.9% 0.000 90)` | 26.9 % | hero card, bottom cards, nav pill, primary button |
| `chip.onGraphite` | `#AFAFAF` | `oklch(75.4% 0.000 90)` | 75.4 % | tag chips on graphite (muted pills `#454545`-`#6E6E6F`) |
| `ink.core` | `#0D0D0D` | `oklch(15.9% 0.000 90)` | 15.9 % | titles (measured `#020202`) and greeting (`#1A1A1A`) |
| `ink.mutedLight` | `#4F4F4F` | `oklch(42.8% 0.000 90)` | 42.8 % | secondary ink on white/glass (`#4F4F4F`…`#5C5C5C`) |
| `ink.inverse` | `#FEFEFE` | `oklch(99.7% 0.000 90)` | 99.7 % | primary ink on graphite |
| `ink.mutedDark` | `#8C8C92` | `oklch(64.2% 0.009 286)` | 64.2 % | **lifted** from the measured `#747477` (3.24:1 — fails AA) |
| `border.hairline` | `#FFFFFF` | `oklch(100% 0.000 90)` | 100 % | 1 px inner highlight on the shell silhouette (~0.5-0.7 alpha) |

The measured surfaces are shockingly literal: the graphite surfaces are *exactly*
`#262626` (σ = 0.22/255 inside flat patches) and the white surfaces *exactly*
`#FDFDFD` (σ = 0.00/255). There are no gradients inside cards.

### 2.3 Contrast audit (WCAG 2.2)

| pair | measured | ratio | AA body | AAA |
| --- | --- | --- | --- | --- |
| `ink.core` on shell glass | `#1A1A1A` / `#E3E3E3` | 13.6:1 | yes | yes |
| `ink.core` on white card | `#020202` / `#FDFDFD` | 20.4:1 | yes | yes |
| `ink.inverse` on graphite | `#FEFEFE` / `#262626` | 15.0:1 | yes | yes |
| `ink.mutedLight` on dock | `#4F4F4F` / `#FDFDFD` | 8.0:1 | yes | yes |
| **`ink.mutedDark` on graphite (as drawn)** | `#747477` / `#262626` | **3.24:1** | **no** | no |
| `ink.mutedDark on graphite (lifted to `#8C8C92`)** | — | 4.53:1 | yes | no |

One real accessibility defect in the reference, one honest fix. The contrast test
in CI (Step 2) will enforce AA for every text/surface token pair and fail the build
rather than silently lighten text.

---

## 3. Materials and the measured glass recipe

Five materials, all of them used in the reference. Values in the "measured" column
are from `measurements.md`; the token column is what P-UI-1 will generate.

| # | material | measured | token (proposal) |
| --- | --- | --- | --- |
| **M1** | **Shell glass** — the floating window | `#E3E3E3`–`#E9E9E9`; white-alpha equivalent **0.20** (local patch pair) to **0.48** (row regression, R² 0.44); backdrop structure still visible through it | fill `rgba(255,255,255,0.32)`, backdrop blur 40-60 px (pre-rendered), 1 px `rgba(255,255,255,0.65)` inner border, radius 28 px @1200 → **24 pt** on phone |
| **M2** | **Sunk glass card** — chart/secondary card on the shell | `#E8E8E8`–`#EEEEEE`; white-alpha equivalent **0.62** vs the shell | fill `rgba(255,255,255,0.55)`, blur 20-30 px, 1 px `rgba(255,255,255,0.7)` border, radius 20-26 px @1200 → **20 pt** |
| **M3** | **Opaque white card** — primary card, dock panel, icon buttons | exactly `#FDFDFD`, σ 0.00; white-alpha equivalent **0.94** (i.e. opaque); **edge step 0.0 %** → *no border*, it separates by brightness + shadow | solid `#FDFDFD`, no border, radius 20 px @1200 → **20 pt**; sheets on phone **28 pt** |
| **M4** | **Graphite** — hero card, bottom cards, nav pill, primary button | exactly `#262626`, σ 0.22; flat, no gradient, no border | solid `#262626`, radius 20 px @1200 → **20 pt** |
| **M5** | **Chips / pills** | Create pill h = 33 px, nav pill h = 35 px → fully rounded; light chips `#AFAFAF`-`#C7C7C7`; muted pills `#454545`; icon buttons Ø 41-43 px | radius = height/2; chip h 24-26 pt, button h 44-48 pt |

**Shadow (measured, and much quieter than the spec assumes):** outside the shell the
luminance falls by ≤2 % over 40 px, and there is no visible edge. Token:
`0 30px 80px rgba(15,15,18,0.10)` (ambient) + `0 2px 8px rgba(15,15,18,0.04)` for cards.
Tinted neutral, never pure black.

**Radii (firm/proposal mix):** the graphite hero card fits a circle of **r = 20 px**
(RMS residual 0.5 px over 5 sampled silhouette points) and the white card on the shell
fits **r = 20 px** (RMS 0.4). The shell's outer silhouette fits **r ≈ 28 px** (RMS 0.9).
Automated sweeps over the softer glass edges scatter between 20 and 35 px, so treat
20-28 px @1200 as the band. Normalised: shell radius = **2.5 % of the canvas width**,
card radius = **8 % of card height**. Mobile proposal: cards 20 pt, sheets 28 pt,
hero 24 pt, pills/badges full-round.

**Blur honesty:** a flattened PNG cannot reveal a blur kernel. What *is* measurable is
that the backdrop carries no high-frequency detail at all (high-pass σ 1.2/255 on the
top strip), so it is a heavily blurred photograph — equivalent to a 40-80 px Gaussian
at this scale. The spec's "blur 20-30 px" and "saturate 140 %" are therefore
**unverifiable**; the saturation boost is actively contradicted by §2.1, so the recipe
drops it (see §9).

---

## 4. Mood, light and luminance

- **Mood:** calm, neutral, premium, quiet — "visionOS console on a photograph".
  Almost everything is greyscale; the only drama is the tonal jump between
  `#262626` graphite and `#FDFDFD` white, mediated by soft mid-grey glass.
- **Light direction:** the backdrop is brightest at the **bottom-left/bottom-centre**
  (L\* 86.5-87.8, `#D2D2D2`-`#D7D7D7`) and darkest at the **top-right** where a soft
  wedge crosses (L\* 64.5, `#8E8E8E`); the top-left is mid (77.1). So the light reads
  as coming from **below/behind-left**, throwing a broad soft shadow across the top
  and right — not the "warm light vs cool surroundings" the spec assumed.
- **Warm vs cool:** strictly neutral. No warm accent exists; the only chroma is the
  cool tint in mid-grey text (§2.1). The design's "temperature" contrast is purely
  luminance: L\* 64 (shadow) → 99 (white).
- **Overall luminance:** mean L\* **80.9 %** (high-key), p5 26.9 %, p50 89.4 %,
  p95 99.7 %. 14 % of all pixels are graphite `#262626`; 25 % are near-white
  `#FDFDFD` — the two anchors, with the glass as the field between them.

---

## 5. Texture: grain, haze, depth of field, vignette

| property | measured | how to reproduce (Skia) | mobile cost |
| --- | --- | --- | --- |
| **Grain** | high-pass σ **0.22/255** in the flattest region (shell void), 0.51 in the glass card, 1.21 on the backdrop strip → **no film grain** | Optional 0.02-0.03 opacity fractal-noise overlay on large flats *only* to stop banding. The spec's 0.04-0.08 (10-20/255) is 40-100× stronger than the reference and would visibly change the mood. | 1 tiled 128 px noise texture, or 0 if we accept banding |
| **Haze / blur** | backdrop has ~0 high-frequency content; low-frequency structure only | 4-6 layered `RadialGradient`/`LinearGradient` stops + skia `Blur(40-60)` on a pre-rendered backdrop texture (render once, cache to a bitmap) | one off-screen render, cached; never per-frame |
| **Depth of field** | the photo is uniformly soft — no localised DoF | not reproduced; the "depth" comes from the material stack (M1→M4) and the shadow | 0 |
| **Vignette** | none measurable (corner backdrop 75-86 % vs centre 84-88 % — that is the photo, not a vignette) | none; if used, ≤3 % and edges only | 0 |

**The honest correction here:** the premium feel comes from **softness + tonal
anchors + rounded geometry**, not from grain or from strong glass tint. Adding
grain at the spec's suggested opacity would make Mirror look *less* like the reference.

---

## 6. Safe zones

Backdrop luminance field (15×20 grid, L\* %) is in `measurements.md`; the useful reading:

| zone | measured | rule for Mirror |
| --- | --- | --- |
| Top band, outside the shell | L\* 74.9-84.7, with a dark wedge at x 750-950 (L\* 64.5) | darkest + busiest region: never place text directly on the backdrop here. On phone, this is the status-bar strip → keep it pure backdrop, or a ≤10 % scrim for status glyphs |
| Left band | L\* 77-84 | mid: safe for the brand badge / floating controls |
| Bottom band | L\* 79.8-87.8, brightest at bottom-centre-left | brightest: good place for the floating glass tab bar (light-on-light needs the hairline border) and for graphite chips (max contrast) |
| On the shell (M1) | L\* 91.6-93.4 | dark ink only; 13.6:1 with `ink.core` |
| On white cards (M3) | L\* 99.4 | dark ink only; 20:1 |
| On graphite (M4) | L\* 26.9 | light ink only; 15:1 primary, 4.5:1 lifted muted |
| Everywhere | text never sits directly on the backdrop in this design | Mirror's phone shell will keep the same discipline: content lives on a material, the backdrop is atmosphere |

Phone translation: status bar 44 pt of pure backdrop · first material surface 8 pt
below the safe area · floating tab bar 64 pt tall, 16 pt from the bottom edge and
16 pt side margins · scroll content inset 96 pt at the bottom so cards pass *under*
the tab bar.

---

## 7. Typography

### 7.1 The font: **Inter** (with an evidenced fallback)

The six whitelisted families were downloaded (Fontsource → TTF), cap-height
calibrated against the reference's measured cap-heights and shape-matched to two
clean strings (mask IoU with optimal horizontal alignment, plus a width check).

Best weight per family (`score = mean IoU − mean width error`):

| family (best weight) | IoU "Month progress" | IoU "Hi, Dilan!" | width ratio cand/ref | score |
| --- | --- | --- | --- | --- |
| **Inter 500** | **0.758** | **0.538** | 1.033, 1.028 | **0.618** |
| Inter 600 / 700 | 0.580 / 0.526 | **0.561 / 0.598** | 1.057/1.038, 1.066/1.038 | 0.523 / 0.511 |
| Plus Jakarta Sans 700 | 0.622 | 0.462 | 1.016, 1.057 | 0.506 |
| Manrope 700 | **0.776** | 0.370 | 1.016, 1.132 | 0.499 |
| Outfit 900 | 0.535 | 0.520 | 1.016, 1.094 | 0.472 |
| Sora 800 | 0.439 | 0.510 | 1.139, 1.113 | 0.348 |
| Urbanist 900 | 0.373 | 0.361 | 0.934, 1.160 | 0.254 |

Manrope wins the long string but is 13 % too wide on the short one; Plus Jakarta
Sans is close behind Inter on shapes and is the fallback of record. Only Inter is
competitive on **both** samples *and* inside 4 % on width.

Glyph-level confirmation from the reference itself:

- `a` — **double-storey**, top arch + bowl, stem ends at the baseline with **no spur**
  → rules out Outfit (single-storey geometric `a`).
- `g` — **single-storey**, circular bowl, straight descender ending in a **left hook**
  (not a closed loop, not a full circular tail).
- `y` — straight diagonal descender, no curl.
- `M` — middle vertex reaches the baseline; `4` — open counter with the stem passing
  **below** the crossbar; `H`, `W` — plain grotesque, `W` middle vertex at cap height.

Second choice if Inter ever needs replacing: **Plus Jakarta Sans 600-700** — the
matcher is re-runnable (`scripts/design/font-match.py --fonts-dir <dir>`) after
swapping the reference image, and the font list stays inside the spec's whitelist.

### 7.2 Type scale

Measured in reference px (Inter cap-height = 0.727 em, x-height = 0.546 em):

| role | reference string | measured | ≈ font-size @1200 | ratio |
| --- | --- | --- | --- | --- |
| display / hero number | `43` | digit cap 25 px | 34.4 px | 2.08 |
| greeting / headline | `Hi, Dilan!` | cap 19 px | 26.4 px | 1.59 |
| card title | `Month progress` | cap 12 px | 16.5 px | 1.00 |
| nav item | `Dashboard` | **low confidence** — small light-grey text (cap ≈ 9 px, banded 8-13 px) | ≈ 13-15 px | 0.80-0.90 |
| body / meta on graphite | `Tasks done for all time` | cap 7-8 px (from `Sport` legend band 10 px incl. descender) | ≈ 10.5 px | 0.63 |

The reference is a **dense desktop dashboard**: scaled proportionally onto a 390 pt
phone its card title would be 5.4 pt, which is unusable. So Mirror keeps the
**ratios** at the top of the ladder and lifts the small end for mobile legibility and
200 % font scaling (stated deviation, not an accident):

| token | size / line-height | weight | tracking | source |
| --- | --- | --- | --- | --- |
| `display` | 34 / 40 | 700 | -0.02 em | measured ratio 2.08 |
| `headline` | 26 / 32 | 700 | -0.02 em | measured ratio 1.59 |
| `title` | 17 / 22 | 600 | -0.01 em | measured base |
| `body` | 15 / 21 | 450-500 | 0 | lifted from 10.5 pt (legibility) |
| `label` | 13 / 17 | 500 | 0 | lifted |
| `micro` (uppercase sections) | 11 / 14 | 600 | +0.06 em | `INTEGRATIONS`-style labels |

**No letter-spacing hack is needed:** Inter 600 renders "Month progress" at 123.8 px
vs the reference's 126 px (<2 %), i.e. the reference is un-tracked Inter within
measurement error.

---

## 8. Layout language → mobile mapping (measured geometry)

| reference element | measured @1200×900 | phone translation (390 pt) |
| --- | --- | --- |
| shell | x 49-1150 (`w 1101`), y 56-841 (`h 785`), r ≈ 28 px, 2.5 % of width | full-bleed backdrop; the shell becomes the screen itself (no fake window) |
| left dock | x 88-261 (`w 174`), opaque `#FDFDFD`, active item = graphite pill h 35 px | **floating glass bottom tab bar** (64 pt, r 32, 16 pt margins); active item = lighter filled circle, per spec C |
| content column | x 296-1107 (`w 811`); gutters 19-21 px between cards, 35 px dock→content, 43 px right margin | single column, 16 pt margins, 12-16 pt between cards |
| card radius | 20 px (hero, white card) | 20 pt cards, 28 pt sheets |
| card row heights | hero 248 px, white card 194 px, bottom cards 96 px | hero pager ≈ 260 pt; stat cards 120-140 pt; list rows 72-88 pt |
| hero pager | one graphite card: chips row, bold title, 3-line muted copy, 1 white pill + 1 outlined pill + circular "more"; prev/next arrows bottom-right | identical anatomy on phone with the IQS gauge as the single glowing focal element, swipe + page dots |
| top bar | dark pill `#262626` h 33 px + white circles Ø 41-43 px + avatar | compact header: title, search, bell+dot, Private\|Public pill (spec B) |
| shelf | 4 white cards, chip top-left, circular menu top-right, 2-line body, white circular action bottom-right | horizontal carousel ("Topics you explored") with the same anatomy and a Depth score circle |

Motion is *not* measurable from a still: the spec's Step 4 (slow drift 30-60 s, glow
breathing 8 s, staggered reveal 60 ms, ≤40 particles, nothing above 0.5 Hz, all
honouring reduce-motion) is accepted as a **proposal** and will be implemented in
P-UI-1/P-UI-2 with a reduce-motion path.

---

## 9. Corrections to the spec's assumptions (with measurements)

| spec assumption | measured reality | action |
| --- | --- | --- |
| "Glass recipe: blur 20-30 px, **saturate ~140 %**, fill 0.35-0.6" | the image is **achromatic**: mean chroma 0.00011, p99 0.0036 → a 140 % saturation boost is not present and, over a greyscale backdrop, is a no-op at best | keep fill 0.32-0.55 (bounded by the measured 0.20-0.48 shell / 0.62 card), **drop the saturation boost** |
| "grain 0.04-0.08 overlay opacity" | flat surfaces measure high-pass σ **0.22/255 ≈ 0.001**; there is no visible grain | use 0-0.03, and only to prevent banding on large flats |
| "Palette is almost monochrome; colour comes only from artwork" | confirmed **exactly** — 99.3 % of pixels are neutral | keep; the "accent" token = white-on-graphite, not a hue |
| "Backdrop: blurred interior photo (window light, wood floor)" | correct in kind (a heavily blurred photo) but this image shows no wood/ceiling lines — its structure is a dark wedge top-right, a bright bloom bottom-centre-left, and a soft arc bottom-right | build the backdrop from the measured field (4-6 gradients), offer the photo version behind a flag |
| "Top bar: search pill left, tabs centre" | this image: dark Create pill + circles + avatar (right), no centre tabs | reproduce the *anatomy* (pill + circles + status dot) in Mirror's header, not the positions |
| "Left dock … becomes the bottom tab bar on mobile" | confirmed — dock is opaque `#FDFDFD` with a graphite active pill | implement as floating glass tab bar per spec C, but note the reference dock is *opaque*, not translucent |
| "one large dark artwork card with tag pills … hero" | confirmed; graphite `#262626`, flat, with light chips (`#AFAFAF`/`#C7C7C7`) and white/outlined pills | hero pager as specified; hero art generated in Skia, never real user content |
| "safe zones: bright/dark/busy regions" | measured: dark+busy = top-right wedge and top band; bright = bottom-centre-left | text always on a material, never on the backdrop (§6) |

---

## 10. Assumptions I am making (tell me if any is wrong)

1. The attached image is the intended reference (despite not matching Step 0's description).
2. Dark is the default theme; the light theme is derived from the same tokens (§Step 2)
   and both must pass AA.
3. Mirror's phone UI keeps the reference's *material stack and geometry*, not its
   desktop density: 12-16 pt gutters, 20 pt cards, 28 pt sheets.
4. Inter is acceptable as the app font (self-hosted, no runtime fetch, ~4 weights to
   stay under the install-size budget).
5. The phone shell is full-bleed (no floating window); the "floating glass window"
   returns only on tablet/foldable/web per spec A.

## 11. What P-UI-1 will produce from this brief

`packages/ui/tokens/image-tokens.json` + typed TS + CSS variables (light & dark) with:
glass fills 0.32/0.55, border 0.65 alpha, tinted shadows, glow, radii 20/24/28/full,
8 pt spacing grid, blur 20-60 px in named steps, motion durations/easings, the six
type styles, and a contrast-test fixture; then the single-file HTML phone-frame
prototype (onboarding + permission primer, dashboard with swipeable hero, floating tab
bar, bottom sheets, Private/Public toggle, dark/light, synthetic personas).
`/scripts/generate-tokens` will read `public/art/reference.webp` and regenerate all of
the above, so swapping the image and re-running re-skins Mirror (Step 5).

**STOP — awaiting `approved` or edits.**
