#!/usr/bin/env python3
"""
Mirror — font identification for the design reference
=====================================================
Answers one question with evidence: *which of the whitelisted families is the
reference UI actually set in?*

Method
------
1. Extract high-contrast text samples from the reference (tight ink masks).
2. For each candidate family/weight, binary-search the font size at which the
   candidate's capital "M" height equals the reference's measured cap-height.
3. Render the same string, scale it to the reference mask height, slide it
   horizontally, and score the mask IoU at the best alignment.
4. Cross-check the advance width (a font with the right shapes but wrong
   proportions still loses).

Result (run 2026-10, against `public/art/reference.webp`):
    Inter 500/600/700 win on both samples and on width; Manrope 700 wins on the
    long sample but fails the short one. Glyph-level checks in the reference
    (double-storey `a` with no spur, single-storey `g` with a left hook, straight
    `y` descender) corroborate Inter. See docs/design/00-image-analysis.md §7.

Fonts are not vendored in this repo. Fetch the six whitelisted families with:
    npm pack @fontsource/inter @fontsource/manrope @fontsource/outfit \\
             @fontsource/plus-jakarta-sans @fontsource/sora @fontsource/urbanist
    # then gunzip/untar, and convert the .woff2 web files to .ttf with fonttools:
    python3 -c "from fontTools.ttLib import TTFont; \\
      f=TTFont('inter-latin-600-normal.woff2'); f.flavor=None; f.save('inter-latin-600-normal.ttf')"
(the @fontsource packages ship woff/woff2 only; `pip install fonttools brotli` is
enough for the conversion).

Usage
-----
    python3 scripts/design/font-match.py --image public/art/reference.webp \\
        --fonts-dir /tmp/ttf
"""

from __future__ import annotations

import argparse
import glob
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Reference text boxes, authored against the canonical 1200x900 reference.
# (box, cap-height in reference px) — cap-heights measured in the image analysis.
SAMPLES = {
    "Month progress": {"box": (905, 1030, 203, 226), "cap": 12.0},
    "Hi, Dilan!": {"box": (292, 408, 130, 168), "cap": 19.0},
    # Small light-grey nav text ("Dashboard", cap ~9px) was tested and dropped:
    # at 8-9px ink height the mask is dominated by anti-aliasing, and every family
    # scored <0.46 IoU. Add more large samples rather than small ones.
}
REF_W, REF_H = 1200, 900
SS = 8  # supersample factor


def ink_mask(gray: np.ndarray, thr: float = 0.55) -> np.ndarray:
    m = gray < thr
    ys, xs = np.where(m)
    return m[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def render_mask(path: str, text: str, px: float) -> np.ndarray:
    font = ImageFont.truetype(path, int(round(px * SS)))
    canvas = Image.new("L", (int(px * SS * max(4, len(text)) * 1.0) + 200, int(px * SS * 3)), 255)
    ImageDraw.Draw(canvas).text((60, 60), text, font=font, fill=0)
    m = (np.asarray(canvas).astype(np.float64) / 255.0) < 0.5
    ys, xs = np.where(m)
    return m[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def size_for_cap(path: str, cap: float, glyph: str = "M") -> float:
    """Binary-search the font size (in reference px) whose glyph ink height == cap."""
    lo, hi = 4.0, 60.0
    for _ in range(30):
        mid = (lo + hi) / 2
        m = render_mask(path, glyph, mid)
        h = m.shape[0] / SS
        if h < cap:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def iou_at_best_shift(ref: np.ndarray, cand: np.ndarray) -> tuple[float, float]:
    h, w = ref.shape
    scaled = Image.fromarray((cand * 255).astype(np.uint8)).resize(
        (max(1, round(cand.shape[1] * h / cand.shape[0])), h), Image.BILINEAR
    )
    c = np.asarray(scaled) > 128
    pad = np.zeros((h, c.shape[1] + 2 * w), bool)
    pad[:, w : w + c.shape[1]] = c
    best = 0.0
    for dx in range(0, max(1, 2 * w - 1)):
        win = pad[:, dx : dx + w]
        if win.shape[1] < w:
            continue
        union = (ref | win).sum()
        if union:
            best = max(best, (ref & win).sum() / union)
    return best, c.shape[1] / w  # (IoU, width ratio cand/ref)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default="public/art/reference.webp")
    ap.add_argument("--fonts-dir", default="/tmp/ttf")
    args = ap.parse_args()

    gray = np.asarray(Image.open(args.image).convert("L")).astype(np.float64) / 255.0
    sx = gray.shape[1] / REF_W
    sy = gray.shape[0] / REF_H
    refs = {}
    for name, cfg in SAMPLES.items():
        x0, x1, y0, y1 = cfg["box"]
        refs[name] = ink_mask(gray[int(y0 * sy) : int(y1 * sy), int(x0 * sx) : int(x1 * sx)])

    fonts: dict[str, str] = {}
    pattern = re.compile(r"^(?P<fam>.+)-latin-(?P<w>\d{3})-normal\.ttf$")
    for path in sorted(glob.glob(os.path.join(args.fonts_dir, "*-latin-*-normal.ttf"))):
        m = pattern.match(os.path.basename(path))
        if m and "latin-ext" not in os.path.basename(path):
            fonts[f"{m.group('fam')} {m.group('w')}"] = path
    if not fonts:
        raise SystemExit(f"no TTFs in {args.fonts_dir} — see the module docstring for how to fetch them")

    rows = []
    for key, path in fonts.items():
        scores, widths = [], []
        for name, ref in refs.items():
            px = size_for_cap(path, SAMPLES[name]["cap"])
            cand = render_mask(path, name, px)
            iou, wr = iou_at_best_shift(ref, cand)
            scores.append(iou)
            widths.append(wr)
        width_err = float(np.mean([abs(w - 1) for w in widths]))
        rows.append((float(np.mean(scores)) - width_err, key, scores, widths))

    rows.sort(reverse=True)
    print(f"{'font':<26} {'score':>6}  " + "  ".join(f"{n[:12]:>12}" for n in SAMPLES) + "   width ratio (cand/ref)")
    for score, key, scores, widths in rows[:20]:
        print(
            f"{key:<26} {score:6.3f}  "
            + "  ".join(f"{s:12.3f}" for s in scores)
            + "   "
            + ", ".join(f"{w:.3f}" for w in widths)
        )
    print(
        "\nnote: the score subtracts the mean width error from the mean IoU, because a\n"
        "family with correct shapes but wrong proportions still renders wrong text."
    )


if __name__ == "__main__":
    main()
