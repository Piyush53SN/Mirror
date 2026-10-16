/**
 * Token → runtime theme resolution.
 *
 * React Native has no CSS custom properties, so the generated token JSON is
 * resolved into a plain, frozen object per theme. This module is the only place
 * that decides what a token *means* at runtime; components never read the JSON
 * directly and never hardcode a value.
 *
 * Two invariants worth knowing:
 *   1. Glass fills are per-theme. A fixed white alpha does NOT transfer between
 *      themes (white at 0.32 lifts a near-black canvas ~10x more per unit alpha),
 *      so `themes[theme].fillAlpha` is authoritative, never `glass.*.alpha`.
 *   2. Reduced transparency and reduced motion change tokens, not components.
 *      Components ask for `theme.glass.shell` / `theme.motion('base')` and get
 *      the correct thing for the current accessibility state.
 */
import { tokens as raw } from '../tokens/index.js';
import type { ThemeName } from '../tokens/index.js';

export type { ThemeName };

export const DEFAULT_THEME: ThemeName = raw.meta.defaultTheme as ThemeName;

/* ------------------------------------------------------------ colour maths -- */

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255];
};

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

export const toHex = ([r, g, b]: [number, number, number]) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/** WCAG 2.2 relative luminance. */
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.2 contrast ratio between two opaque colours. */
export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Composite a translucent colour over an opaque one, in sRGB — which is what a
 * browser or a phone actually does. Used by tests to prove that a glass surface
 * still carries readable ink over the *worst* backdrop it can sit on.
 */
export const composite = (fgHex: string, alpha: number, bgHex: string): string => {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  return toHex([0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as [number, number, number]);
};

export const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
};

/** Same colour, mixed toward the backdrop the way the CSS token does it. */
export const mix = (hex: string, toward: string, amount: number): string => composite(toward, amount, hex);

/* ------------------------------------------------------------------ types --- */

export type TypeRole = keyof (typeof raw)['type']['scale'];
export type DurationName = keyof (typeof raw)['motion']['durations'];

export type GlassSpec = {
  /** Translucent fill to paint, already correct for the current theme + a11y state. */
  fill: string;
  /** Blur radius to hand to the platform. 0 when transparency is reduced or the layer is not allowed to blur. */
  blurPx: number;
  /** True when this surface is one of the budgeted live-blurred layers. */
  live: boolean;
};

export type MirrorTheme = {
  name: ThemeName;
  isDark: boolean;
  reducedTransparency: boolean;
  reducedMotion: boolean;
  color: {
    canvas: string;
    veil: string;
    glow: string;
    shell: string;
    card: string;
    elevated: string;
    anchor: string;
    chip: string;
    ink: string;
    inkMuted: string;
    onAnchor: string;
    mutedOnAnchor: string;
    onChip: string;
    borderHairline: string;
    borderCard: string;
    scrim: string;
    lightSource: string;
    grain: number;
    bloomAlpha: number;
    /** The token block's backdrop stops, in paint order. */
    backdropStops: readonly { at: number; role: string; hex: string }[];
  };
  glass: {
    shell: GlassSpec;
    card: GlassSpec;
    sheet: GlassSpec;
    tabbar: GlassSpec;
    chip: GlassSpec;
    blurBudget: typeof raw.glass.blurBudget;
  };
  radius: { xs: number; sm: number; md: number; dock: number; card: number; hero: number; sheet: number; pill: number; phone: number };
  /** 8pt grid: space(0) = 0 … space(10) = 96. */
  space: (step: number) => number;
  type: (role: TypeRole) => { fontSize: number; lineHeight: number; fontWeight: string; letterSpacing: number };
  size: typeof raw.size;
  motion: (name: DurationName) => number;
  easing: (name: keyof (typeof raw)['motion']['easings']) => string;
  shadow: { ambient: string; card: string };
};

export type ThemeOverrides = {
  /** OS "remove transparency", or the in-app switch. */
  reducedTransparency?: boolean;
  /** OS reduce-motion, or the in-app switch. */
  reducedMotion?: boolean;
  /** Android font scaling (1 … 2). Tokens are multiplied, never re-authored. */
  textScale?: number;
};

const em = (tracking: string): number => {
  const m = /(-?[\d.]+)em/.exec(tracking);
  return m ? parseFloat(m[1]) : 0;
};

const pxOf = (cssValue: string): number => {
  const m = /(-?[\d.]+)px/.exec(cssValue);
  return m ? parseFloat(m[1]) : 0;
};

/**
 * Build the runtime theme for a name + accessibility state.
 * Pure and synchronous, so tests can freeze any combination.
 */
export function createTheme(name: ThemeName = DEFAULT_THEME, overrides: ThemeOverrides = {}): MirrorTheme {
  const t = raw.themes[name];
  const reducedTransparency = overrides.reducedTransparency ?? false;
  const reducedMotion = overrides.reducedMotion ?? false;
  const textScale = Math.min(raw.type.maxSystemScale, Math.max(1, overrides.textScale ?? 1));
  const isDark = name === 'dark';

  // Reduced transparency swaps every glass surface for its measured opaque
  // equivalent — the same trade the CSS token block makes for the prototype.
  const glassFill = (kind: 'shell' | 'card' | 'sheet'): string => {
    if (reducedTransparency) {
      if (kind === 'shell') return t.surface.shell;
      if (kind === 'card') return t.surface.card;
      return t.surface.white;
    }
    if (kind === 'sheet') return rgba(t.surface.white, raw.glass.sheet.alpha);
    const alpha = kind === 'shell' ? t.fillAlpha.shell : t.fillAlpha.card;
    return rgba(raw.glass[kind].fill, alpha);
  };

  const blur = (kind: keyof typeof raw.glass.blurPx): number => {
    if (reducedTransparency) return 0;
    return raw.glass.blurPx[kind];
  };

  const theme: MirrorTheme = {
    name,
    isDark,
    reducedTransparency,
    reducedMotion,
    color: {
      canvas: t.backdrop.canvas,
      veil: t.backdrop.veil,
      glow: t.backdrop.glow,
      shell: t.surface.shell,
      card: t.surface.card,
      elevated: t.surface.white,
      anchor: t.surface.anchor,
      chip: t.surface.chipOnAnchor,
      ink: t.ink.core,
      inkMuted: t.ink.muted,
      onAnchor: t.ink.onAnchor,
      mutedOnAnchor: t.ink.mutedOnAnchor,
      onChip: t.ink.onChip,
      // Dark hairlines are lifted: a 1px white line at the light theme's alpha is
      // invisible on black. Both are derived from the same measured border, which
      // is why they live here rather than in a component.
      borderHairline: rgba('#FFFFFF', isDark ? 0.14 : raw.glass.borders.hairlineAlpha),
      borderCard: rgba('#FFFFFF', isDark ? 0.18 : raw.glass.borders.cardAlpha),
      scrim: rgba(isDark ? '#000000' : '#0E0E10', isDark ? 0.62 : raw.overlays.sheetScrim),
      lightSource: raw.lightSource.hex,
      grain: raw.overlays.grain,
      bloomAlpha: t.backdrop.bloomAlpha,
      backdropStops: t.backdrop.stops,
    },
    glass: {
      shell: { fill: glassFill('shell'), blurPx: blur('shell'), live: false },
      card: { fill: glassFill('card'), blurPx: blur('card'), live: false },
      sheet: { fill: glassFill('sheet'), blurPx: blur('sheet'), live: !reducedTransparency },
      // The tab bar is the only other surface allowed to spend a live-blur pass.
      tabbar: { fill: glassFill('shell'), blurPx: blur('tabbar'), live: !reducedTransparency },
      chip: { fill: glassFill('card'), blurPx: 0, live: false },
      blurBudget: raw.glass.blurBudget,
    },
    radius: {
      xs: raw.radius.xs,
      sm: raw.radius.sm,
      md: raw.radius.md,
      dock: raw.radius.dock,
      card: raw.radius.card,
      hero: raw.radius.hero,
      sheet: raw.radius.sheet,
      pill: raw.radius.pill,
      phone: raw.radius.phone,
    },
    space: (step: number) => raw.space.scale[step] ?? raw.space.base * step,
    type: (role: TypeRole) => {
      const s = raw.type.scale[role];
      return {
        fontSize: s.size * textScale,
        lineHeight: s.lineHeight * textScale,
        fontWeight: String(s.weight),
        letterSpacing: em(s.tracking) * s.size * textScale,
      };
    },
    size: raw.size,
    motion: (n: DurationName) => (reducedMotion ? 0 : raw.motion.durations[n]),
    easing: (n) => raw.motion.easings[n],
    shadow: { ambient: raw.glass.shadow.ambient, card: raw.glass.shadow.card },
  };

  return Object.freeze(theme);
}

export const lightTheme = (o: ThemeOverrides = {}) => createTheme('light', o);
export const darkTheme = (o: ThemeOverrides = {}) => createTheme('dark', o);

/** Everything the audit gate checks, exposed for tests and for P7's review. */
export const auditPairs = raw.contrast;
export const adjustments = raw.adjustments;
export const tokenMeta = raw.meta;

export const px = pxOf;
