#!/usr/bin/env python3
"""
Mirror — design-reference image analyzer
========================================
Turns the design-reference screenshot (public/art/reference.webp) into the
numbers that the "Frosted Horizon" design system is built from.

This is the *evidence generator* for P-UI-0 (design brief). The runtime token
generator that ships in the product (P-UI-1, `/scripts/generate-tokens`, TS)
will consume the JSON this script emits plus the same algorithms in TypeScript.

What it measures
----------------
1.  Achromatism check       — is the reference actually monochrome, or does it
                              carry a hidden brand hue?
2.  Palette                 — k-means in OKLab (perceptual), k=7, with roles
                              assigned from the measured region table.
3.  Named region tones      — surfaces, inks, borders, glass fills.
4.  Glass fill opacity      — least-squares fit of (inside glass) vs
                              (backdrop next to it), plus local-pair deltas.
5.  Corner radii            — circle fit to a card/shell silhouette arc.
6.  Type metrics            — cap/x-height in reference px for named strings.
7.  Texture                 — high-pass energy in flat regions (grain / haze).
8.  Backdrop field          — luminance grid + flat samples used to rebuild the
                              backdrop in code (gradients, bloom, vignette).
9.  Contrast audit          — WCAG 2.2 contrast for the text/surface pairs the
                              design system will ship, so CI can enforce them.

Everything is deterministic. No network. PIL + numpy only.

Usage
-----
    python3 scripts/design/analyze-reference-image.py \
        --image public/art/reference.webp \
        --json  packages/ui/tokens/evidence/reference-measurements.json \
        --md    docs/design/measurements.md

Coordinates in REGIONS are expressed for the canonical 1200x900 reference and
are scaled automatically if a different size image is supplied (so swapping the
reference picture and re-running keeps working).
"""

from __future__ import annotations

import argparse
import json
import math
import os
from typing import Any

import numpy as np
from PIL import Image

REF_W, REF_H = 1200, 900  # canonical reference size; regions are authored at this size

# ---------------------------------------------------------------------------
# Colour maths (sRGB <-> OKLab / OKLCh).  All palette work happens in OKLab so
# that "perceptually even" steps in the design tokens really are even.
# ---------------------------------------------------------------------------

_M1 = np.array(
    [
        [0.4122214708, 0.5363325363, 0.0514459929],
        [0.2119034982, 0.6806995451, 0.1073969566],
        [0.0883024619, 0.2817188376, 0.6299787005],
    ]
)
_M2 = np.array(
    [
        [0.2104542553, 0.7936177850, -0.0040720468],
        [1.9779984951, -2.4285922050, 0.4505937099],
        [0.0259040371, 0.7827717662, -0.8086757660],
    ]
)
_M1_INV = np.linalg.inv(_M1)
_M2_INV = np.linalg.inv(_M2)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def rgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    """rgb: (...,3) in 0..1 sRGB -> OKLab."""
    lms = srgb_to_linear(rgb) @ _M1.T
    return np.cbrt(np.clip(lms, 0, None)) @ _M2.T


def oklab_to_rgb(lab: np.ndarray) -> np.ndarray:
    lms = lab @ _M2_INV.T
    return linear_to_srgb(lms**3 @ _M1_INV.T)


def hex_of(rgb: np.ndarray) -> str:
    r, g, b = (np.clip(rgb, 0, 1) * 255).round().astype(int)
    return f"#{r:02X}{g:02X}{b:02X}"


def oklch_of(lab: np.ndarray) -> tuple[float, float, float]:
    L, a, b = float(lab[0]), float(lab[1]), float(lab[2])
    C = math.hypot(a, b)
    h = math.degrees(math.atan2(b, a)) % 360
    return L, C, h


def oklch_str(lab: np.ndarray) -> str:
    L, C, h = oklch_of(lab)
    return f"oklch({L * 100:.1f}% {C:.3f} {h:.1f})"


def relative_luminance(rgb: np.ndarray) -> float:
    """WCAG relative luminance from sRGB 0..1."""
    lin = srgb_to_linear(np.asarray(rgb, dtype=float)).reshape(-1)[:3]
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def contrast_ratio(fg: np.ndarray, bg: np.ndarray) -> float:
    l1, l2 = relative_luminance(fg), relative_luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------------------
# Region tables — authored against the 1200x900 reference.
# ---------------------------------------------------------------------------

# name -> (x0, y0, x1, y1, role)
SURFACE_REGIONS: dict[str, tuple[int, int, int, int, str]] = {
    # backdrop (outside the shell) — verified flat patches
    "backdrop_top_left": (0, 0, 40, 40, "backdrop.base"),
    "backdrop_top_center": (300, 4, 600, 44, "backdrop.base"),
    "backdrop_top_right": (1160, 0, 1200, 40, "backdrop.base"),
    "backdrop_left_mid": (0, 430, 40, 470, "backdrop.base"),
    "backdrop_bottom_left": (0, 860, 200, 898, "backdrop.base"),
    "backdrop_bottom_center": (500, 866, 900, 898, "backdrop.glow"),
    "backdrop_dark_wedge": (760, 4, 900, 40, "backdrop.shadow"),
    # shell glass (translucent white over the blurred backdrop)
    "shell_glass_void": (268, 600, 292, 700, "surface.glassSunk"),
    "shell_glass_void_left": (66, 560, 88, 700, "surface.glassSunk"),
    "glass_card_sunk_edge": (606, 186, 620, 430, "surface.glassSunk"),
    # opaque surfaces
    "solid_white_dock": (100, 688, 240, 716, "surface.solidLight"),
    "solid_white_card": (1040, 232, 1100, 252, "surface.solidLight"),
    "graphite_card": (310, 745, 400, 760, "surface.solidDark"),
    "graphite_nav_pill": (208, 208, 236, 228, "surface.solidDark"),
    "graphite_button": (828, 120, 846, 145, "surface.solidDark"),
    "chip_on_graphite": (330, 345, 370, 392, "surface.chipOnDark"),
}

# name -> (x0, y0, x1, y1, polarity) where polarity "dark" = ink is the dark tail
INK_REGIONS: dict[str, tuple[int, int, int, int, str]] = {
    "greeting_on_glass": (292, 130, 410, 168, "dark"),
    "title_on_light_card": (905, 203, 1042, 226, "dark"),
    "nav_item_on_dock": (146, 246, 220, 268, "dark"),
    "muted_on_glass": (608, 224, 700, 244, "dark"),
    "stat_on_dark_card": (322, 246, 378, 290, "light"),
    "muted_on_dark_card": (384, 246, 452, 284, "light"),
    "label_on_dark_pill": (866, 124, 930, 150, "light"),
}

# Radius values verified by hand: for each corner, five points were sampled on the
# silhouette (first row/column where the surface colour is reached) and a circle was
# least-squares fitted; the residual column is the RMS error of that fit. The
# automated fitter below reproduces these for high-contrast edges and is unreliable
# for low-contrast ones (soft glass edges, white-on-white), hence both are reported.
MANUAL_RADII: dict[str, dict[str, Any]] = {
    "shell_outer": {"radius_px": 28, "rms": 0.9, "points": 5, "note": "outer silhouette of the glass shell"},
    "dark_hero_card": {"radius_px": 20, "rms": 0.5, "points": 5, "note": "graphite hero card"},
    "white_month_progress": {"radius_px": 20, "rms": 0.4, "points": 4, "note": "white card on shell glass"},
    "dock_panel": {"radius_px": 18, "rms": 1.1, "points": 4, "note": "left dock, low contrast"},
    "pills": {"radius_px": "h/2", "rms": None, "points": None, "note": "Create pill h=33px, nav pill h=35px -> fully rounded"},
    "icon_buttons": {"radius_px": 21, "rms": None, "points": None, "note": "circular buttons measured w=41..43px"},
}

# Corner arcs: (name, top_edge_y, left_edge_x, search_half_width, walk_rows)
CORNERS: list[tuple[str, int, int, int, int]] = [
    ("shell_outer", 56, 49, 22, 46),
    ("dark_hero_card", 179, 296, 18, 44),
    ("white_month_progress", 180, 880, 20, 44),
    ("white_month_goals", 466, 296, 18, 44),
    ("dark_project_card", 737, 296, 22, 44),
    ("dock_panel", 88, 88, 18, 42),
]

# Type strings: measured ink bounding boxes used to derive the type scale.
TYPE_BOXES: dict[str, tuple[int, int, int, int, str]] = {
    "greeting_H": (294, 130, 312, 160, "cap"),
    "card_title_M": (906, 203, 920, 224, "cap"),
    "card_title_g_desc": (988, 204, 1003, 226, "descender"),
    "stat_digit_4": (324, 246, 344, 286, "cap"),
    "body_T": (384, 246, 398, 268, "cap"),
    "nav_x_height": (150, 246, 166, 268, "x-height"),
}

FLAT_PATCHES: dict[str, tuple[int, int, int, int]] = {
    "shell_void_gutter": (268, 600, 292, 700),
    "dock_empty": (100, 560, 236, 780),
    "glass_card_inside": (610, 186, 850, 196),
    "backdrop_top_strip": (0, 0, 1200, 10),
    "backdrop_below_shell": (340, 860, 700, 896),
    "white_card_flat": (1030, 240, 1090, 260),
}

# (label, ink region, surface region, ink polarity)
CONTRAST_PAIRS: list[tuple[str, tuple[int, int, int, int], tuple[int, int, int, int], str]] = [
    ("ink.onGlass / shell glass", INK_REGIONS["greeting_on_glass"][:4], SURFACE_REGIONS["shell_glass_void"][:4], "dark"),
    ("ink.onLight / solid white card", INK_REGIONS["title_on_light_card"][:4], SURFACE_REGIONS["solid_white_card"][:4], "dark"),
    ("ink.onGraphite / graphite", INK_REGIONS["stat_on_dark_card"][:4], SURFACE_REGIONS["graphite_card"][:4], "light"),
    ("ink.mutedOnGraphite / graphite", INK_REGIONS["muted_on_dark_card"][:4], SURFACE_REGIONS["graphite_card"][:4], "light"),
    ("ink.onLightMuted / dock", INK_REGIONS["nav_item_on_dock"][:4], SURFACE_REGIONS["solid_white_dock"][:4], "dark"),
    ("ink.onGraphiteMuted / graphite", INK_REGIONS["label_on_dark_pill"][:4], SURFACE_REGIONS["graphite_button"][:4], "light"),
]


# ---------------------------------------------------------------------------
# Core measurements
# ---------------------------------------------------------------------------


def load(path: str) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    arr = np.asarray(img).astype(np.float64) / 255.0
    return arr


def scaled_regions(arr: np.ndarray):
    """Regions are authored at 1200x900; scale to the loaded image size."""
    h, w = arr.shape[:2]
    sx, sy = w / REF_W, h / REF_H
    if abs(sx - 1) < 1e-6 and abs(sy - 1) < 1e-6:
        return 1.0, 1.0
    return sx, sy


def region_mean(arr: np.ndarray, box: tuple[int, int, int, int], sx: float, sy: float) -> np.ndarray:
    x0, y0, x1, y1 = box
    x0, x1 = int(x0 * sx), int(x1 * sx)
    y0, y1 = int(y0 * sy), int(y1 * sy)
    return arr[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0)


def ink_tone(arr: np.ndarray, box, polarity: str, sx: float, sy: float, pct: float = 6.0) -> np.ndarray:
    x0, y0, x1, y1 = box
    x0, x1, y0, y1 = int(x0 * sx), int(x1 * sx), int(y0 * sy), int(y1 * sy)
    reg = arr[y0:y1, x0:x1].reshape(-1, 3)
    L = rgb_to_oklab(reg)[:, 0]
    sel = reg[L <= np.percentile(L, pct)] if polarity == "dark" else reg[L >= np.percentile(L, 100 - pct)]
    return sel.mean(axis=0)


def achromatism(arr: np.ndarray) -> dict[str, Any]:
    lab = rgb_to_oklab(arr.reshape(-1, 3))
    C = np.hypot(lab[:, 1], lab[:, 2])
    # where is the (tiny) residual chroma concentrated?
    ys, xs = np.where(np.hypot(rgb_to_oklab(arr)[:, :, 1], rgb_to_oklab(arr)[:, :, 2]) > 0.01)
    return {
        "mean_chroma": float(C.mean()),
        "p50_chroma": float(np.percentile(C, 50)),
        "p99_chroma": float(np.percentile(C, 99)),
        "max_chroma": float(C.max()),
        "share_pixels_chroma_gt_0.005": float((C > 0.005).mean()),
        "share_pixels_chroma_gt_0.01": float((C > 0.01).mean()),
        "chroma_hotspot_pixels": int(len(ys)),
        "chroma_hotspot_bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(ys) else None,
        "verdict": "achromatic" if C.mean() < 0.001 else "tinted",
    }


def kmeans_oklab(arr: np.ndarray, k: int = 7, seed: int = 3, stride: int = 4) -> list[dict[str, Any]]:
    px = arr[::stride, ::stride].reshape(-1, 3)
    lab = rgb_to_oklab(px)
    rng = np.random.default_rng(seed)
    C = lab[rng.choice(len(lab), k, replace=False)]
    idx = np.zeros(len(lab), dtype=int)
    for _ in range(60):
        d = ((lab[:, None, :] - C[None, :, :]) ** 2).sum(-1)
        idx = d.argmin(1)
        for j in range(k):
            m = idx == j
            if m.sum():
                C[j] = lab[m].mean(0)
    counts = np.bincount(idx, minlength=k)
    out = []
    for j in np.argsort(-counts):
        rgb = oklab_to_rgb(C[j])
        L, Ch, h = oklch_of(C[j])
        out.append(
            {
                "hex": hex_of(rgb),
                "oklch": f"oklch({L * 100:.1f}% {Ch:.3f} {h:.1f})",
                "oklab": [round(float(v), 5) for v in C[j]],
                "share": round(float(counts[j] / len(lab)), 4),
            }
        )
    return out


def glass_alpha(arr: np.ndarray, sx: float, sy: float) -> dict[str, Any]:
    """Estimate the glass fill opacity two ways."""
    h, w = arr.shape[:2]
    rows = np.arange(int(0.13 * h), int(0.89 * h))
    inside = arr[rows, int(0.05 * w) : int(0.07 * w)].mean(axis=(1, 2))
    outside = arr[rows, int(0.006 * w) : int(0.033 * w)].mean(axis=(1, 2))
    A = np.c_[outside, np.ones(len(outside))]
    slope, intercept = np.linalg.lstsq(A, inside, rcond=None)[0]
    resid = inside - A @ np.array([slope, intercept])
    r2 = 1 - resid.var() / inside.var()
    pairs = []
    for name, inside_box, outside_box in [
        ("shell_top_strip", (400, 62, 1100, 80), (300, 20, 900, 44)),
        ("solid_white_dock", (120, 420, 240, 460), (60, 420, 86, 460)),
        ("glass_card_sunk", (606, 200, 620, 430), (600, 100, 840, 170)),
        ("solid_white_card", (1040, 232, 1100, 252), (1170, 380, 1198, 430)),
    ]:
        ci = region_mean(arr, inside_box, sx, sy)
        co = region_mean(arr, outside_box, sx, sy)
        dL = float(rgb_to_oklab(ci)[0] - rgb_to_oklab(co)[0])
        alpha_equiv = dL / max(1e-6, 1 - float(rgb_to_oklab(co)[0]))
        pairs.append(
            {
                "name": name,
                "inside": hex_of(ci),
                "outside": hex_of(co),
                "delta_L": round(dL * 100, 2),
                "white_alpha_equivalent": round(alpha_equiv, 3),
            }
        )
    return {
        "regression_slope": round(float(slope), 4),
        "regression_intercept_255": round(float(intercept) * 255, 1),
        "white_alpha_from_slope": round(1 - float(slope), 3),
        "r_squared": round(float(r2), 3),
        "local_pairs": pairs,
    }


def edge_x(L: np.ndarray, y: int, x_start: int, x_end: int, smooth: int = 3) -> tuple[int, float]:
    row = L[y, max(0, x_start) : x_end]
    g = np.abs(np.diff(row))
    if smooth > 1 and len(g) >= smooth:
        g = np.convolve(g, np.ones(smooth) / smooth, mode="same")
    return x_start + int(g.argmax()), float(g.max())


def corner_radius(L: np.ndarray, top_y: int, left_x: int, half: int, rows: int, sx: float) -> dict[str, Any]:
    pts = []
    for dy in range(1, rows):
        y = top_y + dy
        if y >= L.shape[0]:
            break
        x, grad = edge_x(L, y, max(0, left_x - half), left_x + half)
        if grad >= 0.008:
            pts.append((x, y))
    if len(pts) < 8:
        return {"radius_px": None, "points": len(pts), "confidence": "low"}
    P = np.array(pts, dtype=float)
    xmin = P[:, 0].min()
    arc = P[P[:, 0] > xmin + 0.5]
    if len(arc) < 6:
        arc = P
    x, y = arc[:, 0], arc[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x**2 + y**2
    cx, cy, c = np.linalg.lstsq(A, b, rcond=None)[0]
    r = math.sqrt(c + cx**2 + cy**2)
    # fit quality: RMS distance of the sampled arc points from the fitted circle
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    rms = float(np.sqrt(((dist - r) ** 2).mean()))
    ok = rms < 0.6 and 6 <= r / sx <= 60
    return {
        "radius_px": round(float(r) / sx, 2),
        "radius_ratio_of_width": round(float(r) / sx / REF_W, 4),
        "samples": len(pts),
        "rms_residual_px": round(rms, 2),
        "confidence": "high" if ok else ("medium" if rms < 1.2 else "low"),
    }


def glyph_metrics(arr: np.ndarray, boxes, sx: float, sy: float) -> dict[str, Any]:
    L = rgb_to_oklab(arr)[:, :, 0]
    out = {}
    for name, (x0, y0, x1, y1, kind) in boxes.items():
        x0, x1 = int(x0 * sx), int(x1 * sx)
        y0, y1 = int(y0 * sy), int(y1 * sy)
        patch = L[y0:y1, x0:x1]
        bg = np.percentile(patch, 85)
        ink = bg - patch > 0.30
        if not ink.any():
            out[name] = None
            continue
        ys = np.where(ink.any(axis=1))[0]
        xs = np.where(ink.any(axis=0))[0]
        out[name] = {
            "kind": kind,
            "height_px": int(ys.max() - ys.min() + 1),
            "width_px": int(xs.max() - xs.min() + 1),
        }
    return out


def texture(arr: np.ndarray, patches, sx: float, sy: float) -> dict[str, Any]:
    out = {}
    for name, (x0, y0, x1, y1) in patches.items():
        x0, x1 = int(x0 * sx), int(x1 * sx)
        y0, y1 = int(y0 * sy), int(y1 * sy)
        g = arr[y0:y1, x0:x1].mean(axis=-1)
        if g.shape[0] < 6 or g.shape[1] < 6:
            continue
        lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
        k = 5
        pad = np.pad(g, k // 2, mode="edge")
        win = np.lib.stride_tricks.sliding_window_view(pad, (k, k)).mean((-1, -2))
        hp = g - win
        out[name] = {
            "sd_pixel_255": round(float(g.std() * 255), 2),
            "sd_laplacian_255": round(float(lap.std() * 255), 2),
            "sd_highpass_255": round(float(hp.std() * 255), 2),
            "mean_255": round(float(g.mean() * 255), 1),
        }
    return out


def backdrop_field(arr: np.ndarray, gy: int = 15, gx: int = 20) -> list[list[float]]:
    h, w = arr.shape[:2]
    field = []
    for i in range(gy):
        row = []
        for j in range(gx):
            reg = arr[int(i * h / gy) : int((i + 1) * h / gy), int(j * w / gx) : int((j + 1) * w / gx)]
            row.append(round(float(rgb_to_oklab(reg.reshape(-1, 3).mean(0))[0] * 100), 1))
        field.append(row)
    return field


def contrast_audit(arr: np.ndarray, sx: float, sy: float) -> list[dict[str, Any]]:
    rows = []
    for name, ink_box, bg_box, polarity in CONTRAST_PAIRS:
        fg = ink_tone(arr, ink_box, polarity, sx, sy)
        bg = region_mean(arr, bg_box, sx, sy)
        cr = contrast_ratio(fg, bg)
        rows.append(
            {
                "pair": name,
                "fg": hex_of(fg),
                "bg": hex_of(bg),
                "contrast": round(cr, 2),
                "wcag_aa_body": cr >= 4.5,
                "wcag_aa_large": cr >= 3.0,
                "wcag_aaa_body": cr >= 7.0,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default="public/art/reference.webp")
    ap.add_argument("--json", default="packages/ui/tokens/evidence/reference-measurements.json")
    ap.add_argument("--md", default="docs/design/measurements.md")
    args = ap.parse_args()

    arr = load(args.image)
    h, w = arr.shape[:2]
    sx, sy = w / REF_W, h / REF_H
    lab = rgb_to_oklab(arr)
    L = lab[:, :, 0]

    report: dict[str, Any] = {
        "source": {
            "path": args.image,
            "width": w,
            "height": h,
            "aspect": round(w / h, 4),
            "canonical_reference": [REF_W, REF_H],
            "analyzer": "scripts/design/analyze-reference-image.py",
        },
        "global": {
            "mean_L": round(float(L.mean() * 100), 2),
            "p5_L": round(float(np.percentile(L, 5) * 100), 2),
            "p50_L": round(float(np.percentile(L, 50) * 100), 2),
            "p95_L": round(float(np.percentile(L, 95) * 100), 2),
        },
        "achromatism": achromatism(arr),
        "palette_kmeans_k7": kmeans_oklab(arr, 7),
        "surfaces": {},
        "inks": {},
        "glass": glass_alpha(arr, sx, sy),
        "radii": {},
        "radii_manual_verified": MANUAL_RADII,
        "type": glyph_metrics(arr, TYPE_BOXES, sx, sy),
        "texture": texture(arr, FLAT_PATCHES, sx, sy),
        "backdrop_field_L_pct": backdrop_field(arr),
        "contrast_audit": contrast_audit(arr, sx, sy),
    }

    for name, (x0, y0, x1, y1, role) in SURFACE_REGIONS.items():
        c = region_mean(arr, (x0, y0, x1, y1), sx, sy)
        report["surfaces"][name] = {
            "role": role,
            "hex": hex_of(c),
            "oklch": oklch_str(rgb_to_oklab(c)),
            "L_pct": round(float(rgb_to_oklab(c)[0] * 100), 2),
        }
    for name, (x0, y0, x1, y1, polarity) in INK_REGIONS.items():
        c = ink_tone(arr, (x0, y0, x1, y1), polarity, sx, sy)
        report["inks"][name] = {
            "polarity": polarity,
            "hex": hex_of(c),
            "oklch": oklch_str(rgb_to_oklab(c)),
            "L_pct": round(float(rgb_to_oklab(c)[0] * 100), 2),
        }
    for name, top_y, left_x, half, rows in CORNERS:
        report["radii"][name] = corner_radius(
            L, int(top_y * sy), int(left_x * sx), int(half * max(sx, sy)), int(rows * sy), sx
        )

    os.makedirs(os.path.dirname(args.json), exist_ok=True)
    with open(args.json, "w") as fh:
        json.dump(report, fh, indent=2)
        fh.write("\n")

    a = report["achromatism"]
    md: list[str] = []
    md.append("# Reference image measurements (generated)\n")
    md.append(
        "> Generated by `scripts/design/analyze-reference-image.py` from "
        f"`{report['source']['path']}` ({w}x{h}). Do not edit by hand — re-run the script.\n"
    )
    md.append("## Global\n")
    md.append("| metric | value |\n| --- | --- |")
    md.append(f"| mean L* | {report['global']['mean_L']}% |")
    md.append(f"| L* p5 / p50 / p95 | {report['global']['p5_L']}% / {report['global']['p50_L']}% / {report['global']['p95_L']}% |")
    md.append(f"| mean OKLab chroma | {a['mean_chroma']:.5f} |")
    md.append(f"| max OKLab chroma | {a['max_chroma']:.5f} |")
    md.append(f"| pixels with C > 0.005 | {a['share_pixels_chroma_gt_0.005'] * 100:.3f}% |")
    md.append(f"| verdict | **{a['verdict']}** |\n")

    md.append("## Palette (k-means k=7 in OKLab)\n")
    md.append("| hex | oklch | share |\n| --- | --- | --- |")
    for c in report["palette_kmeans_k7"]:
        md.append(f"| `{c['hex']}` | {c['oklch']} | {c['share'] * 100:.2f}% |")
    md.append("")

    md.append("## Surfaces\n")
    md.append("| region | role | hex | oklch | L* |\n| --- | --- | --- | --- | --- |")
    for k, v in report["surfaces"].items():
        md.append(f"| {k} | `{v['role']}` | `{v['hex']}` | {v['oklch']} | {v['L_pct']}% |")
    md.append("")

    md.append("## Inks\n")
    md.append("| region | polarity | hex | oklch | L* |\n| --- | --- | --- | --- | --- |")
    for k, v in report["inks"].items():
        md.append(f"| {k} | {v['polarity']} | `{v['hex']}` | {v['oklch']} | {v['L_pct']}% |")
    md.append("")

    g = report["glass"]
    md.append("## Glass fill opacity\n")
    md.append(
        f"Regression (inside-shell vs outside-shell luminance over {int(0.13 * h)}–{int(0.89 * h)}px): "
        f"slope {g['regression_slope']}, R² {g['r_squared']} → white-alpha equivalent "
        f"**{g['white_alpha_from_slope']}**.\n"
    )
    md.append("| pair | inside | outside | ΔL* | white-alpha equivalent |\n| --- | --- | --- | --- | --- |")
    for p in g["local_pairs"]:
        md.append(
            f"| {p['name']} | `{p['inside']}` | `{p['outside']}` | {p['delta_L']}% | {p['white_alpha_equivalent']} |"
        )
    md.append("")

    md.append("## Corner radii\n")
    md.append(
        "Two sources: (a) hand-verified least-squares circle fits (the authoritative\n"
        "numbers used by the brief, with their RMS residual), and (b) an automated sweep.\n"
        "The automated sweep is reliable for high-contrast edges (graphite on light) and\n"
        "unreliable for soft glass edges and white-on-white, which is why every row carries\n"
        "a confidence and an RMS residual.\n"
    )
    md.append("### (a) hand verified\n")
    md.append("| element | radius (px @1200) | RMS residual (px) | note |\n| --- | --- | --- | --- |")
    for k, v in report["radii_manual_verified"].items():
        rms = "—" if v["rms"] is None else v["rms"]
        md.append(f"| {k} | {v['radius_px']} | {rms} | {v['note']} |")
    md.append("")
    md.append("### (b) automated sweep\n")
    md.append("| element | radius (px) | ratio of width | RMS residual (px) | confidence |\n| --- | --- | --- | --- | --- |")
    for k, v in report["radii"].items():
        md.append(
            f"| {k} | {v['radius_px']} | {v.get('radius_ratio_of_width')} | "
            f"{v.get('rms_residual_px')} | {v['confidence']} |"
        )
    md.append("")

    md.append("## Type metrics\n")
    md.append("| glyph | kind | height (px @1200) |\n| --- | --- | --- |")
    for k, v in report["type"].items():
        if v:
            md.append(f"| {k} | {v['kind']} | {v['height_px']} |")
    md.append("")

    md.append("## Texture (flat patches)\n")
    md.append("| patch | sd pixel | sd high-pass | mean |\n| --- | --- | --- | --- |")
    for k, v in report["texture"].items():
        md.append(f"| {k} | {v['sd_pixel_255']}/255 | {v['sd_highpass_255']}/255 | {v['mean_255']} |")
    md.append("")

    md.append("## Contrast audit (WCAG 2.2)\n")
    md.append("| pair | fg | bg | ratio | AA body | AA large | AAA |\n| --- | --- | --- | --- | --- | --- | --- |")
    for c in report["contrast_audit"]:
        md.append(
            f"| {c['pair']} | `{c['fg']}` | `{c['bg']}` | {c['contrast']}:1 | "
            f"{'yes' if c['wcag_aa_body'] else 'no'} | {'yes' if c['wcag_aa_large'] else 'no'} | "
            f"{'yes' if c['wcag_aaa_body'] else 'no'} |"
        )
    md.append("")

    md.append("## Backdrop luminance field (15x20 grid, L* %)\n")
    md.append("```")
    for row in report["backdrop_field_L_pct"]:
        md.append(" ".join(f"{v:5.0f}" for v in row))
    md.append("```\n")

    os.makedirs(os.path.dirname(args.md), exist_ok=True)
    with open(args.md, "w") as fh:
        fh.write("\n".join(md) + "\n")

    print(f"wrote {args.json} and {args.md}")
    print(f"achromatism: mean C={a['mean_chroma']:.5f} max C={a['max_chroma']:.5f} -> {a['verdict']}")
    for name, v in report["radii"].items():
        print(f"radius {name:<24} {v['radius_px']} px  ({v['confidence']})")


if __name__ == "__main__":
    main()
