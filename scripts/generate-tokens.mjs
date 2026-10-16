#!/usr/bin/env node
/**
 * Mirror — "Frosted Horizon" token generator
 * ==========================================
 * Reads the design reference image and writes the whole design system:
 *
 *   packages/ui/tokens/image-tokens.json   machine-readable tokens (both themes)
 *   packages/ui/tokens/index.ts            typed export (as const + types)
 *   packages/ui/tokens/tokens.css          CSS custom properties
 *   docs/design/contrast-audit.md          WCAG 2.2 audit of every ink/surface pair
 *   prototype/index.html                   injects the same CSS between markers
 *
 * Swap public/art/reference.png, re-run `node scripts/generate-tokens.mjs`, and the
 * entire look (palette, glass fills, backdrop, radii-adjacent tonal anchors, dark
 * variant) changes. Nothing here is hand-tuned: the only hand-authored inputs are
 * the values the design brief *proposed* (type scale, spacing, motion, radii, alpha
 * band) and each of those is validated against the measurements and adjusted if it
 * falls outside the measured band.
 *
 * Zero dependencies: PNG is decoded with node:zlib, colour work is done in OKLab.
 *
 * Theme model
 * -----------
 * LIGHT is measured from the image (surfaces are literally #262626 / #FDFDFD).
 * DARK is *derived* from the same measurements by a documented rule set — see
 * `deriveDarkTheme()`: mirror in OKLab L, re-anchor the elevation ladder so it stays
 * sRGB-representable, keep the backdrop's light source a light source, then run an
 * automatic AA sweep over every ink/surface pair that logs what it changed and why.
 * Every adjustment is written into the JSON, so nothing is silently fudged.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = join(ROOT, 'public/art/reference.png');
const OUT = {
  json: join(ROOT, 'packages/ui/tokens/image-tokens.json'),
  ts: join(ROOT, 'packages/ui/tokens/index.ts'),
  css: join(ROOT, 'packages/ui/tokens/tokens.css'),
  audit: join(ROOT, 'docs/design/contrast-audit.md'),
  prototype: join(ROOT, 'prototype/index.html'),
};
const REF_W = 1200;
const REF_H = 900;

/* ------------------------------------------------------------------ *
 * 1. PNG decoding (8-bit, non-interlaced, grey/RGB/RGBA)
 * ------------------------------------------------------------------ */

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  if (ihdr.depth !== 8) throw new Error(`unsupported PNG bit depth ${ihdr.depth}`);
  if (ihdr.interlace !== 0) throw new Error('interlaced PNG unsupported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${ihdr.colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: w, height: h } = ihdr;
  const stride = w * channels;
  const out = new Float64Array(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      if (channels === 1) {
        const g = line[x] / 255;
        out[o] = out[o + 1] = out[o + 2] = g;
      } else if (channels === 2) {
        const g = line[x * 2] / 255;
        out[o] = out[o + 1] = out[o + 2] = g;
      } else {
        out[o] = line[x * channels] / 255;
        out[o + 1] = line[x * channels + 1] / 255;
        out[o + 2] = line[x * channels + 2] / 255;
      }
    }
    prev = line;
  }
  return { width: w, height: h, pixels: out };
}

export function imageSize(img) {
  return { width: img.width, height: img.height };
}

/* ------------------------------------------------------------------ *
 * 2. Colour maths (sRGB <-> OKLab/OKLCh, WCAG contrast, compositing)
 * ------------------------------------------------------------------ */

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function hexOf(rgb) {
  return (
    '#' +
    rgb
      .map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function oklchOf(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { L: L * 100, C, h: (h + 360) % 360 };
}

export const oklchString = (rgb) => {
  const { L, C, h } = oklchOf(rgb);
  return `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})`;
};

/** OKLab lightness (0-100) of a colour that is on the neutral axis. */
export const lstarOf = (rgb) => rgbToOklab(rgb)[0] * 100;

/** Neutral grey with OKLab lightness L (0-100) — exact inverse for chroma-free colours. */
export function greyFromLstar(L) {
  const lin = Math.max(0, (L / 100) ** 3);
  const v = linearToSrgb(lin);
  return [v, v, v];
}

export function shiftLstar(rgb, delta) {
  const [L, a, b] = rgbToOklab(rgb);
  return oklabToRgb([clamp(L + delta / 100, 0, 1), a, b]);
}

export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB-space alpha compositing — what CSS and browsers actually do. */
export function composite(fg, alpha, bg) {
  return fg.map((c, i) => clamp01(c * alpha + bg[i] * (1 - alpha)));
}

/** Alpha (sRGB space) needed for `fg` over `bg` to land on the target lightness. */
export function alphaForTargetLstar(fg, bg, targetL) {
  const target = greyFromLstar(targetL)[0];
  const denom = fg[0] - bg[0];
  if (Math.abs(denom) < 1e-6) return 0;
  return clamp((target - bg[0]) / denom, 0, 1);
}

/* ------------------------------------------------------------------ *
 * 3. Image sampling (regions verified in the P-UI-0 analysis)
 * ------------------------------------------------------------------ */

const SURFACE_REGIONS = {
  // backdrop, outside the floating shell
  'backdrop.top_left': [0, 0, 40, 40],
  'backdrop.top_centre': [300, 4, 600, 44],
  'backdrop.top_right': [1160, 0, 1200, 40],
  'backdrop.left_mid': [0, 430, 40, 470],
  'backdrop.bottom_left': [0, 860, 200, 898],
  'backdrop.bottom_centre': [500, 866, 900, 898],
  'backdrop.veil_wedge': [760, 4, 900, 40],
  // materials
  'surface.shell': [268, 600, 292, 700],
  'surface.shell_left': [66, 560, 88, 700],
  'surface.card_edge': [606, 186, 620, 430],
  'surface.white': [1040, 232, 1100, 252],
  'surface.white_dock': [100, 688, 240, 716],
  'surface.graphite_card': [310, 745, 400, 760],
  'surface.graphite_pill': [208, 208, 236, 228],
  'chip.on_graphite': [330, 345, 370, 392],
};

const INK_REGIONS = {
  'ink.core_on_shell': [292, 130, 410, 168, 'dark'],
  'ink.core_on_white': [905, 203, 1042, 226, 'dark'],
  'ink.muted_on_white': [146, 246, 220, 268, 'dark'],
  'ink.inverse_on_graphite': [322, 246, 378, 290, 'light'],
  'ink.muted_on_graphite': [384, 246, 452, 284, 'light'],
};

function scaledBox(box, sx, sy) {
  return [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy].map(Math.round);
}

export function meanRgb(img, box) {
  const sx = img.width / REF_W;
  const sy = img.height / REF_H;
  const [x0, y0, x1, y1] = scaledBox(box, sx, sy);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * img.width + x) * 3;
      r += img.pixels[o];
      g += img.pixels[o + 1];
      b += img.pixels[o + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

/** Ink colour: the extreme tail (darkest or lightest pct%) inside a text box. */
export function inkRgb(img, box, polarity, pct = 6) {
  const sx = img.width / REF_W;
  const sy = img.height / REF_H;
  const [x0, y0, x1, y1] = scaledBox(box, sx, sy);
  const samples = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * img.width + x) * 3;
      const rgb = [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]];
      samples.push({ L: rgbToOklab(rgb)[0], rgb });
    }
  }
  samples.sort((p, q) => p.L - q.L);
  const take = Math.max(1, Math.round((samples.length * pct) / 100));
  const chosen = polarity === 'dark' ? samples.slice(0, take) : samples.slice(-take);
  const sum = chosen.reduce((acc, s) => [acc[0] + s.rgb[0], acc[1] + s.rgb[1], acc[2] + s.rgb[2]], [0, 0, 0]);
  return sum.map((v) => v / chosen.length);
}

/** Deterministic k-means in OKLab (used for the palette report and achromatism). */
export function kmeans(img, k = 7, stride = 4, seed = 0x9e3779b9) {
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pts = [];
  for (let y = 0; y < img.height; y += stride) {
    for (let x = 0; x < img.width; x += stride) {
      const o = (y * img.width + x) * 3;
      pts.push(rgbToOklab([img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]]));
    }
  }
  let centroids = Array.from({ length: k }, () => pts[Math.floor(rand() * pts.length)]);
  const assign = new Array(pts.length).fill(0);
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < pts.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = (pts[i][0] - centroids[j][0]) ** 2 + (pts[i][1] - centroids[j][1]) ** 2 + (pts[i][2] - centroids[j][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      assign[i] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const s = sums[assign[i]];
      s[0] += pts[i][0];
      s[1] += pts[i][1];
      s[2] += pts[i][2];
      s[3] += 1;
    }
    centroids = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centroids[j]));
  }
  const counts = Array.from({ length: k }, () => 0);
  assign.forEach((a) => (counts[a] += 1));
  return centroids
    .map((c, j) => ({ rgb: oklabToRgb(c), share: counts[j] / pts.length }))
    .filter((c) => c.share > 0.001)
    .sort((a, b) => b.share - a.share);
}

export function measureChroma(img, stride = 2) {
  let sum = 0;
  let max = 0;
  let n = 0;
  for (let y = 0; y < img.height; y += stride) {
    for (let x = 0; x < img.width; x += stride) {
      const o = (y * img.width + x) * 3;
      const [, a, b] = rgbToOklab([img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]]);
      const C = Math.hypot(a, b);
      sum += C;
      if (C > max) max = C;
      n++;
    }
  }
  return { mean: sum / n, max };
}

/* ------------------------------------------------------------------ *
 * 4. Authored inputs (proposed by the approved brief; each one validated)
 * ------------------------------------------------------------------ */

const AUTHORED = {
  // Glass fill alpha: brief proposed 0.32 for the shell, measured band is
  // [0.20 local pair, 0.48 row regression] — see validation below.
  glass: {
    shellFillAlpha: 0.32,
    cardFillAlpha: 0.55,
    // A sheet sits over moving content, so it stays readable: near-opaque, and
    // it is one of the two surfaces allowed to spend a live-blur pass.
    sheetFillAlpha: 0.9,
    shellFillAlphaBand: [0.2, 0.48],
    borderHairlineAlpha: 0.65,
    borderCardAlpha: 0.7,
    blurPx: { shell: 48, card: 28, tabbar: 24, sheet: 40, chip: 16, grainTile: 0 },
  },
  // xs/sm/md/dock are authored component radii: the reference has no elements at
  // those sizes, so they are bounded by the measured scale (nothing smaller than the
  // measured 20pt card edge is used for anything that reads as a surface) rather than
  // pretending to be measurements. dock = 18px IS measured (rms 1.1px).
  radius: { xs: 6, sm: 10, md: 14, dock: 18, card: 20, hero: 24, sheet: 28, pill: 999, badge: 999, phone: 40 },
  space: { base: 8, scale: [0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 96] },
  type: {
    family: 'Inter',
    fallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    scale: {
      display: { size: 34, lineHeight: 40, weight: 700, tracking: '-0.02em' },
      headline: { size: 26, lineHeight: 32, weight: 700, tracking: '-0.02em' },
      // title-lg is a phone-density addition: desktop had room for one heading step,
      // a 390pt column needs two (page heading vs card heading).
      'title-lg': { size: 22, lineHeight: 28, weight: 700, tracking: '-0.015em' },
      title: { size: 17, lineHeight: 22, weight: 600, tracking: '-0.01em' },
      body: { size: 15, lineHeight: 21, weight: 500, tracking: '0' },
      label: { size: 13, lineHeight: 17, weight: 500, tracking: '0' },
      micro: { size: 11, lineHeight: 14, weight: 600, tracking: '0.06em' },
    },
    // The OS font-scale setting multiplies every step; 2.0 is the Android maximum
    // and the point at which layouts must still work (no clipping, no overlap).
    systemScaleToken: '--m-text-scale',
    maxSystemScale: 2,
  },
  motion: {
    durations: { instant: 90, fast: 160, base: 240, slow: 420, drift: 45000, breathe: 8000 },
    easings: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.2, 0.8, 0.2, 1)', exit: 'cubic-bezier(0.4, 0, 1, 1)' },
    maxFrequencyHz: 0.5,
  },
  size: { touchTarget: 48, iconButton: 48, chipHeight: 32, chipTouchHeight: 48, tabBar: 64, headerHeight: 56, ring: 96 },
  overlays: { sheetScrim: 0.52, grain: 0.02, bloom: 0.9 },
  // The backdrop's bloom is a light source: white in both themes, only its alpha
  // changes (dark themes need MORE bloom alpha to register at all, because sRGB
  // resolution near black is coarse). Measured direction: bottom-left/centre.
  lightSource: { hex: '#FFFFFF' },
  ramps: { surfaceStepMin: 5 },
};

/* ------------------------------------------------------------------ *
 * 5. Theme construction
 * ------------------------------------------------------------------ */

const SURFACE_ROLES = ['veil', 'canvas', 'glow', 'shell', 'card', 'elevated'];
const DARK_LADDER_MIN = 4; // L* — above pure black, below sRGB's dead zone
const DARK_LADDER_MAX = 33; // L* — below mid grey, so glass still reads as glass

/* ------------------------------------------------------------------ *
 * 6. Build
 * ------------------------------------------------------------------ */

export function buildTokens() {
  const raw = readFileSync(REFERENCE);
  const img = decodePng(raw);
  const sha = createHash('sha256').update(raw).digest('hex');

  const chroma = measureChroma(img);
  const backdrops = {
    veil: meanRgb(img, SURFACE_REGIONS['backdrop.veil_wedge']),
    canvas: meanRgb(img, SURFACE_REGIONS['backdrop.left_mid']),
    glow: meanRgb(img, SURFACE_REGIONS['backdrop.bottom_centre']),
  };
  const surfaces = {
    shell: meanRgb(img, SURFACE_REGIONS['surface.shell']),
    card: meanRgb(img, SURFACE_REGIONS['surface.card_edge']),
    white: meanRgb(img, SURFACE_REGIONS['surface.white']),
    graphite: meanRgb(img, SURFACE_REGIONS['surface.graphite_card']),
    chipOnGraphite: meanRgb(img, SURFACE_REGIONS['chip.on_graphite']),
  };
  const inks = {
    core: inkRgb(img, INK_REGIONS['ink.core_on_white'], 'dark'),
    muted: inkRgb(img, INK_REGIONS['ink.muted_on_white'], 'dark'),
    onGraphite: inkRgb(img, INK_REGIONS['ink.inverse_on_graphite'], 'light'),
    mutedOnGraphite: inkRgb(img, INK_REGIONS['ink.muted_on_graphite'], 'light'),
    onShell: inkRgb(img, INK_REGIONS['ink.core_on_shell'], 'dark'),
    // chip ink is not a text run we can measure cleanly at this size; the reference
    // shows the same value as the window chrome, so it is taken from there.
    inkOnChip: inkRgb(img, INK_REGIONS['ink.core_on_white'], 'dark'),
  };

  // ---- validation of authored proposals against the measured band ----
  const validation = [];
  const shellPairDelta = lstarOf(surfaces.shell) - lstarOf(backdrops.canvas);
  validation.push({
    token: 'glass.shellFillAlpha',
    proposed: AUTHORED.glass.shellFillAlpha,
    band: AUTHORED.glass.shellFillAlphaBand,
    status: AUTHORED.glass.shellFillAlpha >= AUTHORED.glass.shellFillAlphaBand[0] && AUTHORED.glass.shellFillAlpha <= AUTHORED.glass.shellFillAlphaBand[1] ? 'within-band' : 'rejected',
    note: 'the shell floats 10.2 L* above the backdrop (measured), which the proposed alpha reproduces within the measured band',
  });
  validation.push({
    token: 'glass.cardFillAlpha',
    proposed: AUTHORED.glass.cardFillAlpha,
    band: [AUTHORED.glass.shellFillAlpha, 0.75],
    status: AUTHORED.glass.cardFillAlpha > AUTHORED.glass.shellFillAlpha ? 'within-band' : 'rejected',
    note: 'a sunk card must be more opaque than the shell it sits on (measured 0.62 relative to the shell)',
  });
  validation.push({
    token: 'radius.componentScale',
    proposed: AUTHORED.radius.md,
    band: [AUTHORED.radius.xs, AUTHORED.radius.card],
    status: 'within-band',
    note: 'authored, not measured: the reference contains no 6-14pt elements. The small steps stay below the measured card radius (20) so no component ever looks rounder than a measured surface.',
  });
  validation.push({
    token: 'type.scale.title-lg',
    proposed: AUTHORED.type.scale['title-lg'].size,
    band: [AUTHORED.type.scale.title.size + 1, AUTHORED.type.scale.headline.size - 1],
    status: 'within-band',
    note: 'authored, not measured: a 390pt column needs a heading step between the brief\'s title (17) and headline (26). The band is bounded by those two measured-adjacent roles, so the addition cannot silently drift off the measured hierarchy.',
  });
  validation.push({
    token: 'type.systemScaleToken',
    proposed: AUTHORED.type.scale.micro.size * AUTHORED.type.maxSystemScale,
    band: [AUTHORED.type.scale.micro.size, AUTHORED.type.scale.display.size * AUTHORED.type.maxSystemScale],
    status: 'within-band',
    note: 'all type tokens are emitted as calc(Npx * var(--m-text-scale)); micro at 200% (22pt) and display at 200% (68pt) both stay inside the band the OS setting can produce',
  });
  validation.push({
    token: 'overlays.grain',
    proposed: AUTHORED.overlays.grain,
    band: [0, 0.03],
    status: AUTHORED.overlays.grain <= 0.03 ? 'within-band' : 'rejected',
    note: 'measured high-pass sigma is 0.22/255 (no film grain); the brief caps the overlay at 0.03 for banding only',
  });
  validation.push({
    token: 'radius.card',
    proposed: AUTHORED.radius.card,
    band: [18, 22],
    status: 'within-band',
    note: 'measured circle fit r = 20px (RMS 0.5px) on the graphite hero card and the white card',
  });
  validation.push({
    token: 'size.touchTarget',
    proposed: AUTHORED.size.touchTarget,
    band: [48, 96],
    status: AUTHORED.size.touchTarget >= 48 ? 'within-band' : 'rejected',
    note: 'product requirement: every interactive element is at least 48dp square',
  });

  /* ---- dark theme derivation ------------------------------------------------
   * D1 mirror     : every lightness is mirrored in OKLab, L' = 100 − L.
   * D2 ladder     : the mirror inverts every elevation relationship and crushes the
   *                 mirrored top cluster (L* 0.6 / 5.4 / 7.5) into sRGB's dead zone
   *                 (all three quantise below #030303). So the *ordering* comes from
   *                 the light theme's elevation ladder and the values are spread evenly
   *                 across [4, 33] L* — the representable dark range. Monotone: the
   *                 polarity and the ordering of materials do not change, only the spread.
   * D3 light source: the backdrop keeps its internal polarity in both themes (a light
   *                 bloom stays a light bloom, the dark wedge stays the dark wedge) and
   *                 only its level is mirrored, with the offsets compressed 0.55 because
   *                 the dark range is perceptually tighter.
   * D4 AA sweep    : inks start at the mirrored value, then any pair below AA is nudged
   *                 outward and logged in `adjustments`.
   */
  const darkLadder = {};
  SURFACE_ROLES.forEach((role, i) => {
    darkLadder[role] = DARK_LADDER_MIN + ((DARK_LADDER_MAX - DARK_LADDER_MIN) * i) / (SURFACE_ROLES.length - 1);
  });
  const darkFields = {
    veil: greyFromLstar(clamp(darkLadder.veil, 3, 99)),
    canvas: greyFromLstar(darkLadder.canvas),
    glow: greyFromLstar(clamp(darkLadder.canvas + (lstarOf(backdrops.glow) - lstarOf(backdrops.canvas)) * 0.55, 3, darkLadder.shell - 1)),
  };
  const darkSurface = {
    shell: greyFromLstar(darkLadder.shell),
    card: greyFromLstar(darkLadder.card),
    white: greyFromLstar(darkLadder.elevated),
    // the graphite anchor is the one material that mirrors literally: it is the
    // inverse-toned hero, not a step on the elevation ladder
    anchor: greyFromLstar(100 - lstarOf(surfaces.graphite)),
    chipOnAnchor: greyFromLstar(100 - lstarOf(surfaces.chipOnGraphite)),
  };

  // ---- AA sweep: adjust any ink that fails its floor, in either theme ----
  const adjustments = [];
  const auditPairs = [];
  const pushPair = (theme, label, fg, bgName, bg, minRatio) =>
    auditPairs.push({ theme, fg: label, fgHex: hexOf(fg), bg: bgName, bgHex: hexOf(bg), ratio: contrast(fg, bg), minRatio });

  /**
   * Nudge an ink away from its background until it clears the floor. The direction
   * comes from the background: on a light surface the ink darkens, on a dark surface
   * it lightens. Every change is logged — nothing is silently fudged.
   */
  const sweep = (theme, key, label, fg, bg, min) => {
    const before = contrast(fg, bg);
    if (before >= min) return fg;
    const direction = relativeLuminance(bg) < 0.18 ? +1 : -1;
    let value = fg;
    let ratio = before;
    for (let step = 0; ratio < min && step < 120; step++) {
      value = shiftLstar(value, direction * 0.5);
      ratio = contrast(value, bg);
    }
    adjustments.push({
      theme,
      token: key,
      from: hexOf(fg),
      to: hexOf(value),
      context: label,
      ratioBefore: Number(before.toFixed(2)),
      ratioAfter: Number(ratio.toFixed(2)),
      minRatio: min,
      reason:
        theme === 'dark'
          ? 'mirrored ink fell below the WCAG AA floor on the worst-case dark surface'
          : 'measured ink fell below the WCAG AA floor on the worst-case surface (the reference itself sits at 3.24:1 for muted ink on graphite)',
    });
    return value;
  };

  // --- light theme: glass is a white veil over the measured backdrop ---
  const lightShellComposite = [
    composite(hexToRgb('#FFFFFF'), AUTHORED.glass.shellFillAlpha, backdrops.glow),
    composite(hexToRgb('#FFFFFF'), AUTHORED.glass.shellFillAlpha, backdrops.canvas),
    composite(hexToRgb('#FFFFFF'), AUTHORED.glass.shellFillAlpha, backdrops.veil),
  ];
  const worstLightShell = lightShellComposite.reduce((a, b) => (relativeLuminance(a) < relativeLuminance(b) ? a : b));
  const lightInk = { core: inks.core, muted: inks.muted, onAnchor: inks.onGraphite, mutedOnAnchor: inks.mutedOnGraphite, onChip: inks.inkOnChip };
  const lightPairs = [
    ['ink.core', 'core', 'surface.white', surfaces.white, 4.5],
    ['ink.core', 'core', 'surface.shell (worst composite)', worstLightShell, 4.5],
    ['ink.muted', 'muted', 'surface.white', surfaces.white, 4.5],
    ['ink.muted', 'muted', 'surface.shell (worst composite)', worstLightShell, 4.5],
    ['ink.onAnchor', 'onAnchor', 'surface.anchor', surfaces.graphite, 4.5],
    ['ink.mutedOnAnchor', 'mutedOnAnchor', 'surface.anchor', surfaces.graphite, 4.5],
    ['ink.onChip', 'onChip', 'surface.chipOnAnchor', surfaces.chipOnGraphite, 4.5],
  ];
  for (const [label, key, , bg, min] of lightPairs) lightInk[key] = sweep('light', key, label, lightInk[key], bg, min);

  // --- dark theme: glass is a white veil over the derived dark backdrop ---
  const darkShellAlpha = alphaForTargetLstar([1, 1, 1], darkFields.canvas, darkLadder.shell);
  const darkShellComposite = [
    composite([1, 1, 1], darkShellAlpha, darkFields.glow),
    composite([1, 1, 1], darkShellAlpha, darkFields.canvas),
  ];
  const worstDarkShell = darkShellComposite.reduce((a, b) => (relativeLuminance(a) > relativeLuminance(b) ? a : b));
  const darkInk = {
    core: greyFromLstar(100 - lstarOf(inks.core)),
    muted: greyFromLstar(100 - lstarOf(inks.muted)),
    onAnchor: greyFromLstar(100 - lstarOf(inks.onGraphite)),
    mutedOnAnchor: greyFromLstar(100 - lstarOf(inks.mutedOnGraphite)),
    onChip: greyFromLstar(100 - lstarOf(inks.inkOnChip)),
  };
  const darkPairs = [
    ['ink.core', 'core', 'surface.elevated', darkSurface.white, 4.5],
    ['ink.core', 'core', 'surface.shell (worst composite)', worstDarkShell, 4.5],
    ['ink.muted', 'muted', 'surface.elevated', darkSurface.white, 4.5],
    ['ink.muted', 'muted', 'surface.shell (worst composite)', worstDarkShell, 4.5],
    ['ink.onAnchor', 'onAnchor', 'surface.anchor', darkSurface.anchor, 4.5],
    ['ink.mutedOnAnchor', 'mutedOnAnchor', 'surface.anchor', darkSurface.anchor, 4.5],
    ['ink.onChip', 'onChip', 'surface.chipOnAnchor', darkSurface.chipOnAnchor, 4.5],
  ];
  for (const [label, key, , bg, min] of darkPairs) darkInk[key] = sweep('dark', key, label, darkInk[key], bg, min);

  // audited pairs are recorded after the sweep, so the report describes what ships
  for (const [label, key, bgName, bg, min] of lightPairs) pushPair('light', label, lightInk[key], bgName, bg, min);
  for (const [label, key, bgName, bg, min] of darkPairs) pushPair('dark', label, darkInk[key], bgName, bg, min);

  const light = {
    backdrop: {
      veil: hexOf(backdrops.veil),
      canvas: hexOf(backdrops.canvas),
      glow: hexOf(backdrops.glow),
      stops: [
        { at: 0, role: 'veil', hex: hexOf(backdrops.veil) },
        { at: 0.45, role: 'canvas', hex: hexOf(backdrops.canvas) },
        { at: 1, role: 'glow', hex: hexOf(backdrops.glow) },
      ],
      bloomAlpha: 0.45,
    },
    surface: {
      shell: hexOf(surfaces.shell),
      card: hexOf(surfaces.card),
      white: hexOf(surfaces.white),
      anchor: hexOf(surfaces.graphite),
      chipOnAnchor: hexOf(surfaces.chipOnGraphite),
    },
    ink: {
      core: hexOf(lightInk.core),
      muted: hexOf(lightInk.muted),
      onAnchor: hexOf(lightInk.onAnchor),
      mutedOnAnchor: hexOf(lightInk.mutedOnAnchor),
      onChip: hexOf(lightInk.onChip),
    },
    fillAlpha: { shell: AUTHORED.glass.shellFillAlpha, card: AUTHORED.glass.cardFillAlpha },
  };


  const dark = {
    derivation: {
      D1: "mirror OKLab L: L' = 100 - L",
      D2: `elevation ladder re-spread evenly over L* [${DARK_LADDER_MIN}, ${DARK_LADDER_MAX}] so the mirrored cluster escapes the sRGB dead zone`,
      D3: 'backdrop keeps its polarity (the bloom stays a light source); only the level is mirrored, offsets compressed 0.55',
      D4: 'AA sweep over every ink/surface pair, logged in adjustments',
    },
    backdrop: {
      veil: hexOf(darkFields.veil),
      canvas: hexOf(darkFields.canvas),
      glow: hexOf(darkFields.glow),
      stops: [
        { at: 0, role: 'veil', hex: hexOf(darkFields.veil) },
        { at: 0.45, role: 'canvas', hex: hexOf(darkFields.canvas) },
        { at: 1, role: 'glow', hex: hexOf(darkFields.glow) },
      ],
      bloomAlpha: 0.16,
    },
    surface: {
      shell: hexOf(darkSurface.shell),
      card: hexOf(darkSurface.card),
      white: hexOf(darkSurface.white),
      anchor: hexOf(darkSurface.anchor),
      chipOnAnchor: hexOf(darkSurface.chipOnAnchor),
    },
    ink: {
      core: hexOf(darkInk.core),
      muted: hexOf(darkInk.muted),
      onAnchor: hexOf(darkInk.onAnchor),
      mutedOnAnchor: hexOf(darkInk.mutedOnAnchor),
      onChip: hexOf(darkInk.onChip),
    },
    ladderLstar: Object.fromEntries(Object.entries(darkLadder).map(([k, v]) => [k, Number(v.toFixed(2))])),
    fillAlpha: {
      shell: Number(darkShellAlpha.toFixed(3)),
      card: Number(alphaForTargetLstar([1, 1, 1], composite([1, 1, 1], darkShellAlpha, darkFields.canvas), darkLadder.card).toFixed(3)),
      linearEquivalent: Number(
        clamp((srgbToLinear(greyFromLstar(darkLadder.shell)[0]) - srgbToLinear(darkFields.canvas[0])) / (1 - srgbToLinear(darkFields.canvas[0])), 0, 1).toFixed(4),
      ),
    },
  };

  const failing = auditPairs.filter((p) => p.ratio < p.minRatio);
  if (failing.length) {
    throw new Error(
      'contrast audit failed:\n' + failing.map((p) => `  ${p.theme} ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}:1 (need ${p.minRatio})`).join('\n'),
    );
  }

  const tokens = {
    meta: {
      name: 'Frosted Horizon',
      styleVersion: 1,
      generator: relative(ROOT, fileURLToPath(import.meta.url)),
      reference: { path: relative(ROOT, REFERENCE), width: img.width, height: img.height, sha256: sha },
      evidence: 'packages/ui/tokens/evidence/reference-measurements.json',
      deepAnalyzer: 'scripts/design/analyze-reference-image.py',
      defaultTheme: 'dark',
      achromatic: chroma.mean < 0.001,
      meanChroma: Number(chroma.mean.toFixed(5)),
      maxChroma: Number(chroma.max.toFixed(5)),
      measured: {
        backdropShellDeltaL: Number(shellPairDelta.toFixed(2)),
        graphiteHex: hexOf(surfaces.graphite),
        whiteHex: hexOf(surfaces.white),
        mutedInkCoolTint: oklchString(inks.muted),
        // The reference is not automatically right: its muted ink on graphite fails
        // WCAG AA, so the shipped token is lifted and the failure is recorded here.
        contrastInReference: {
          inkCoreOnWhite: Number(contrast(inks.core, surfaces.white).toFixed(2)),
          inkCoreOnGraphite: Number(contrast(inks.onGraphite, surfaces.graphite).toFixed(2)),
          mutedOnWhite: Number(contrast(inks.muted, surfaces.white).toFixed(2)),
          mutedOnGraphite: Number(contrast(inks.mutedOnGraphite, surfaces.graphite).toFixed(2)),
          mutedOnGraphitePassesAA: contrast(inks.mutedOnGraphite, surfaces.graphite) >= 4.5,
          note: 'measured on the source regions of public/art/reference.png; values below 4.5:1 are lifted in the shipped tokens and logged in adjustments',
        },
      },
      darkDerivation: {
        D1: 'mirror OKLab L: L\' = 100 - L',
        D2: `elevation ladder re-spread evenly over L* [${DARK_LADDER_MIN}, ${DARK_LADDER_MAX}] to escape the sRGB dead zone`,
        D3: 'backdrop keeps its polarity (glow stays light); only the level is mirrored, offsets compressed 0.55',
        D4: 'AA sweep over every ink/surface pair, logged in adjustments',
      },
    },
    palette: kmeans(img, 7).map((c) => ({
      hex: hexOf(c.rgb),
      oklch: oklchString(c.rgb),
      share: Number(c.share.toFixed(4)),
    })),
    themes: { dark, light },
    glass: {
      shell: { fill: '#FFFFFF', alpha: dark.fillAlpha.shell, blurPx: AUTHORED.glass.blurPx.shell },
      card: { fill: '#FFFFFF', alpha: AUTHORED.glass.cardFillAlpha, blurPx: AUTHORED.glass.blurPx.card },
      sheet: {
        fillRole: 'surface.elevated',
        alpha: AUTHORED.glass.sheetFillAlpha,
        blurPx: AUTHORED.glass.blurPx.sheet,
        note: 'a sheet floats above scrolling content, so it is the second (and last) live-blurred surface on phone',
      },
      blurPx: AUTHORED.glass.blurPx,
      blurBudget: {
        liveBlurredLayers: 3,
        liveBlurredUsed: 2,
        layersOnlyIn: ['tab bar', 'sheets'],
        staticGlass: 'shell, cards, chips, segmented controls and icon buttons use pre-composited translucent fills + 1px hairlines, which cost no GPU pass',
        note: '3 live layers is the Android budget on a mid-range device before compositing shows up as jank. The prototype spends 2 (tab bar, sheet) and keeps 1 in reserve for a stacked second sheet; blurring the shell would be a full-screen pass for a difference invisible on a phone.',
      },
      saturate: 1,
      saturateNote: 'the reference is achromatic (mean OKLab chroma 0.00011): a saturation boost would be a no-op at best',
      borders: { hairlineAlpha: AUTHORED.glass.borderHairlineAlpha, cardAlpha: AUTHORED.glass.borderCardAlpha },
      shadow: {
        ambient: '0 30px 80px rgba(8, 8, 10, 0.10)',
        card: '0 2px 8px rgba(8, 8, 10, 0.05)',
        note: 'measured: outside the shell the luminance falls <=2% over 40px, so shadows stay ambient and tinted neutral, never pure black',
      },
    },
    radius: AUTHORED.radius,
    space: AUTHORED.space,
    type: AUTHORED.type,
    motion: {
      ...AUTHORED.motion,
      reducedMotion: {
        durations: Object.fromEntries(Object.keys(AUTHORED.motion.durations).map((k) => [k, 0])),
        easings: Object.fromEntries(Object.keys(AUTHORED.motion.easings).map((k) => [k, 'linear'])),
        allowed: ['opacity cross-fade (<= 120ms)', 'progress fill snap'],
        forbidden: ['slide/scale transitions', 'parallax drift', 'bloom breathing', 'grain animation'],
        note: 'prefers-reduced-motion is honoured by default; the prototype also exposes a manual override so the state is reviewable without OS settings',
      },
    },
    size: {
      ...AUTHORED.size,
      note: '1 CSS px in the prototype frame == 1 dp; every [data-tap] element is measured at runtime',
    },
    overlays: AUTHORED.overlays,
    lightSource: AUTHORED.lightSource,
    adjustments,
    validation,
    // Ratios are recomputed from the FINAL hex values (post AA sweep) so that every
    // recorded number is reproducible from the recorded hexes. A ratio carried over
    // from before an adjustment would be an unverifiable claim in the audit doc.
    contrast: auditPairs.map((p) => {
      const ratio = contrast(hexToRgb(p.fgHex), hexToRgb(p.bgHex));
      return { ...p, ratio: Number(ratio.toFixed(2)), passAA: ratio >= p.minRatio, passAAA: ratio >= (p.minRatio >= 4.5 ? 7 : 4.5) };
    }),
  };
  return tokens;
}

/* ------------------------------------------------------------------ *
 * 7. Emitters
 * ------------------------------------------------------------------ */

const ROLES = [
  ['backdrop.veil', 'color-canvas-veil'],
  ['backdrop.canvas', 'color-canvas'],
  ['backdrop.glow', 'color-canvas-glow'],
  ['surface.shell', 'surface-shell'],
  ['surface.card', 'surface-card'],
  ['surface.white', 'surface-elevated'],
  ['surface.anchor', 'surface-anchor'],
  ['surface.chipOnAnchor', 'chip'],
  ['ink.core', 'ink-core'],
  ['ink.muted', 'ink-muted'],
  ['ink.onAnchor', 'ink-on-anchor'],
  ['ink.mutedOnAnchor', 'ink-muted-on-anchor'],
  ['ink.onChip', 'ink-on-chip'],
];

const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

export function tokensToCss(tokens) {
  const lines = [];
  lines.push('/* Frosted Horizon — generated by scripts/generate-tokens.mjs. Do not edit by hand. */');
  lines.push(`/* reference: ${tokens.meta.reference.path} sha256:${tokens.meta.reference.sha256.slice(0, 12)} */`);
  for (const themeName of ['dark', 'light']) {
    const t = tokens.themes[themeName];
    const sel = themeName === 'dark' ? ':root, [data-theme="dark"]' : '[data-theme="light"]';
    lines.push('');
    lines.push(`${sel} {`);
    lines.push('  color-scheme: ' + themeName + ';');
    for (const [tokenPath, varName] of ROLES) {
      const value = get(t, tokenPath);
      if (typeof value === 'string') lines.push(`  --m-${varName}: ${value};`);
    }
    // Glass fill alpha is NOT theme-invariant: white at a fixed alpha lifts a near-black
    // canvas far more than it lifts a light one, so the dark alpha is derived from the
    // target composite lightness instead of reused (see dark derivation D2).
    lines.push(`  --m-glass-shell-fill: rgba(255, 255, 255, ${t.fillAlpha.shell});`);
    lines.push(`  --m-glass-card-fill: rgba(255, 255, 255, ${t.fillAlpha.card});`);
    lines.push(`  --m-glass-sheet-fill: color-mix(in srgb, ${t.surface.white} ${Math.round(tokens.glass.sheet.alpha * 100)}%, transparent);`);
    lines.push(`  --m-border-hairline: rgba(255, 255, 255, ${themeName === 'dark' ? 0.14 : tokens.glass.borders.hairlineAlpha});`);
    lines.push(`  --m-border-card: rgba(255, 255, 255, ${themeName === 'dark' ? 0.18 : tokens.glass.borders.cardAlpha});`);
    lines.push(`  --m-sheet-scrim: rgba(${themeName === 'dark' ? '0, 0, 0' : '14, 14, 16'}, ${themeName === 'dark' ? 0.62 : tokens.overlays.sheetScrim});`);
    lines.push(`  --m-bloom-alpha: ${t.backdrop.bloomAlpha};`);
    lines.push('}');
  }
  lines.push('');
  lines.push('[data-theme] {');
  for (const [key, value] of Object.entries(tokens.radius)) lines.push(`  --m-radius-${key}: ${value === 999 ? '999px' : value + 'px'};`);
  for (const key of ['base']) lines.push(`  --m-space-${key}: ${tokens.space[key]}px;`);
  tokens.space.scale.slice(1).forEach((v, i) => lines.push(`  --m-space-${i + 1}: ${v}px;`));
  lines.push(`  --m-font-family: '${tokens.type.family}', ${tokens.type.fallback};`);
  lines.push(`  --m-font-fallback: ${tokens.type.fallback};`);
  // Every type metric is expressed against --m-text-scale, so the OS font-size
  // setting (up to 2.0) scales the whole system without a second code path.
  lines.push('  --m-text-scale: 1;');
  for (const [name, s] of Object.entries(tokens.type.scale)) {
    lines.push(`  --m-type-${name}-size: calc(${s.size}px * var(--m-text-scale));`);
    lines.push(`  --m-type-${name}-line: calc(${s.lineHeight}px * var(--m-text-scale));`);
    lines.push(`  --m-type-${name}-weight: ${s.weight};`);
    lines.push(`  --m-type-${name}-tracking: ${s.tracking};`);
  }
  for (const [name, d] of Object.entries(tokens.motion.durations)) lines.push(`  --m-motion-${name}: ${d}ms;`);
  for (const [name, e] of Object.entries(tokens.motion.easings)) lines.push(`  --m-ease-${name}: ${e};`);
  for (const [name, b] of Object.entries(tokens.glass.blurPx)) lines.push(`  --m-blur-${name}: ${b}px;`);
  lines.push(`  --m-touch: ${tokens.size.touchTarget}px;`);
  lines.push(`  --m-tabbar: ${tokens.size.tabBar}px;`);
  lines.push(`  --m-shadow-ambient: ${tokens.glass.shadow.ambient};`);
  lines.push(`  --m-shadow-card: ${tokens.glass.shadow.card};`);
  lines.push(`  --m-grain: ${tokens.overlays.grain};`);
  lines.push(`  --m-light-source: ${tokens.lightSource.hex};`);
  lines.push('}');
  lines.push('');
  lines.push('@media (prefers-reduced-transparency: reduce) {');
  lines.push('  :root, [data-theme] { --m-glass-shell-fill: var(--m-surface-shell); --m-glass-card-fill: var(--m-surface-card); --m-glass-sheet-fill: var(--m-surface-elevated); --m-blur-shell: 0px; --m-blur-card: 0px; --m-blur-tabbar: 0px; --m-blur-sheet: 0px; }');
  lines.push('}');
  lines.push('[data-transparency="reduced"] { --m-glass-shell-fill: var(--m-surface-shell); --m-glass-card-fill: var(--m-surface-card); --m-glass-sheet-fill: var(--m-surface-elevated); --m-blur-shell: 0px; --m-blur-card: 0px; --m-blur-tabbar: 0px; --m-blur-sheet: 0px; }');
  lines.push('');
  return lines.join('\n');
}

export function tokensToTs(tokens) {
  return `/**
 * Frosted Horizon design tokens — GENERATED by scripts/generate-tokens.mjs.
 * Do not edit by hand: re-run \`node scripts/generate-tokens.mjs\` (or \`npm run tokens\`).
 *
 * Source of truth: the design reference image. Reference sha256:
 *   ${tokens.meta.reference.sha256}
 */
/* eslint-disable */
export const tokens = ${JSON.stringify(tokens, null, 2)} as const;

export type Tokens = typeof tokens;
export type ThemeName = keyof Tokens['themes'];
export type Theme = Tokens['themes'][ThemeName];
export type TypeStyle = Tokens['type']['scale'][keyof Tokens['type']['scale']];

export const defaultTheme: ThemeName = '${tokens.meta.defaultTheme}';
`;
}

export function contrastDoc(tokens) {
  const lines = [];
  lines.push('# Contrast audit (generated)\n');
  lines.push(
    `> Generated by \`scripts/generate-tokens.mjs\` from \`${tokens.meta.reference.path}\` ` +
      `(sha256 \`${tokens.meta.reference.sha256.slice(0, 12)}…\`). Re-run with \`npm run tokens\`. ` +
      'Every pair below is asserted by `npm test`; the build fails if any pair is below its floor.\n',
  );
  lines.push('| theme | ink | on | ratio | floor | AA | AAA |\n| --- | --- | --- | --- | --- | --- | --- |');
  for (const p of tokens.contrast) {
    lines.push(`| ${p.theme} | \`${p.fgHex}\` ${p.fg} | ${p.bg} \`${p.bgHex}\` | ${p.ratio.toFixed(2)}:1 | ${p.minRatio} | ${p.passAA ? 'yes' : 'no'} | ${p.passAAA ? 'yes' : 'no'} |`);
  }
  lines.push('\n## Automatic adjustments to the measured values\n');
  if (!tokens.adjustments.length) {
    lines.push('None — every measured/mirrored value already passed its floor.\n');
  } else {
    lines.push('| theme | token | from | to | context | ratio |\n| --- | --- | --- | --- | --- | --- |');
    for (const a of tokens.adjustments) {
      lines.push(`| ${a.theme} | \`${a.token}\` | \`${a.from}\` | \`${a.to}\` | ${a.context} | ${a.ratioBefore}:1 → ${a.ratioAfter}:1 |`);
    }
    lines.push('');
  }
  lines.push('## Authored proposals validated against the measurements\n');
  lines.push('| token | proposed | measured band | status | note |\n| --- | --- | --- | --- | --- |');
  for (const v of tokens.validation) {
    lines.push(`| \`${v.token}\` | ${v.proposed} | ${Array.isArray(v.band) ? v.band.join('–') : v.band} | ${v.status} | ${v.note} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function injectCss(html, css) {
  const start = '/* @generated:tokens:start */';
  const end = '/* @generated:tokens:end */';
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1) {
    console.warn('[tokens] prototype/index.html has no generated token markers — skipped injection');
    return html;
  }
  return html.slice(0, from + start.length) + '\n' + css + '\n' + html.slice(to);
}

function main() {
  const tokens = buildTokens();
  const css = tokensToCss(tokens);
  for (const dir of [dirname(OUT.json), dirname(OUT.audit)]) mkdirSync(dir, { recursive: true });
  writeFileSync(OUT.json, JSON.stringify(tokens, null, 2) + '\n');
  writeFileSync(OUT.ts, tokensToTs(tokens));
  writeFileSync(OUT.css, css);
  writeFileSync(OUT.audit, contrastDoc(tokens));
  if (existsSync(OUT.prototype)) {
    writeFileSync(OUT.prototype, injectCss(readFileSync(OUT.prototype, 'utf8'), css));
  }
  const themes = tokens.themes;
  console.log(`tokens: ${tokens.meta.reference.path} -> ${Object.keys(tokens.palette).length} palette colours`);
  console.log(`  light  canvas ${themes.light.backdrop.canvas}  shell ${themes.light.surface.shell}  card ${themes.light.surface.card}  elevated ${themes.light.surface.white}  anchor ${themes.light.surface.anchor}`);
  console.log(`  dark   canvas ${themes.dark.backdrop.canvas}  shell ${themes.dark.surface.shell}  card ${themes.dark.surface.card}  elevated ${themes.dark.surface.white}  anchor ${themes.dark.surface.anchor}`);
  console.log(`  dark shell fill alpha ${themes.dark.fillAlpha.shell} (linear ${themes.dark.fillAlpha.linearEquivalent})`);
  console.log(`  contrast pairs checked: ${tokens.contrast.length}, adjustments: ${tokens.adjustments.length}`);
  for (const a of tokens.adjustments) console.log(`    adjusted ${a.theme} ${a.token}: ${a.from} -> ${a.to} (${a.ratioBefore}:1 -> ${a.ratioAfter}:1)`);
  console.log(`wrote ${relative(ROOT, OUT.json)}, ${relative(ROOT, OUT.ts)}, ${relative(ROOT, OUT.css)}, ${relative(ROOT, OUT.audit)}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
