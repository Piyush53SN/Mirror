// packages/ui/tokens/index.ts
var tokens = {
  "meta": {
    "name": "Frosted Horizon",
    "styleVersion": 1,
    "generator": "scripts/generate-tokens.mjs",
    "reference": {
      "path": "public/art/reference.png",
      "width": 1200,
      "height": 900,
      "sha256": "84f420428b19826ede30a9ebc2793b1f5a4303d4e6f5147107a33eefc49179f6"
    },
    "evidence": "packages/ui/tokens/evidence/reference-measurements.json",
    "deepAnalyzer": "scripts/design/analyze-reference-image.py",
    "defaultTheme": "dark",
    "achromatic": true,
    "meanChroma": 9e-5,
    "maxChroma": 0.02866,
    "measured": {
      "backdropShellDeltaL": 7.81,
      "graphiteHex": "#262626",
      "whiteHex": "#FDFDFD",
      "mutedInkCoolTint": "oklch(42.7% 0.000 89.9)",
      "contrastInReference": {
        "inkCoreOnWhite": 20.57,
        "inkCoreOnGraphite": 15.13,
        "mutedOnWhite": 8.06,
        "mutedOnGraphite": 3.27,
        "mutedOnGraphitePassesAA": false,
        "note": "measured on the source regions of public/art/reference.png; values below 4.5:1 are lifted in the shipped tokens and logged in adjustments"
      }
    },
    "darkDerivation": {
      "D1": "mirror OKLab L: L' = 100 - L",
      "D2": "elevation ladder re-spread evenly over L* [4, 33] to escape the sRGB dead zone",
      "D3": "backdrop keeps its polarity (glow stays light); only the level is mirrored, offsets compressed 0.55",
      "D4": "AA sweep over every ink/surface pair, logged in adjustments"
    }
  },
  "palette": [
    {
      "hex": "#FDFDFD",
      "oklch": "oklch(99.4% 0.000 240.2)",
      "share": 0.2492
    },
    {
      "hex": "#DCDCDC",
      "oklch": "oklch(89.5% 0.000 278.5)",
      "share": 0.2221
    },
    {
      "hex": "#CACACA",
      "oklch": "oklch(83.9% 0.000 279.3)",
      "share": 0.156
    },
    {
      "hex": "#252525",
      "oklch": "oklch(26.5% 0.000 281.0)",
      "share": 0.1399
    },
    {
      "hex": "#EAEAEA",
      "oklch": "oklch(93.8% 0.000 275.8)",
      "share": 0.1199
    },
    {
      "hex": "#B4B4B4",
      "oklch": "oklch(77.0% 0.000 277.9)",
      "share": 0.0907
    },
    {
      "hex": "#6E6E6F",
      "oklch": "oklch(53.9% 0.001 284.4)",
      "share": 0.0221
    }
  ],
  "themes": {
    "dark": {
      "derivation": {
        "D1": "mirror OKLab L: L' = 100 - L",
        "D2": "elevation ladder re-spread evenly over L* [4, 33] so the mirrored cluster escapes the sRGB dead zone",
        "D3": "backdrop keeps its polarity (the bloom stays a light source); only the level is mirrored, offsets compressed 0.55",
        "D4": "AA sweep over every ink/surface pair, logged in adjustments"
      },
      "backdrop": {
        "veil": "#000000",
        "canvas": "#030303",
        "glow": "#060606",
        "stops": [
          {
            "at": 0,
            "role": "veil",
            "hex": "#000000"
          },
          {
            "at": 0.45,
            "role": "canvas",
            "hex": "#030303"
          },
          {
            "at": 1,
            "role": "glow",
            "hex": "#060606"
          }
        ],
        "bloomAlpha": 0.16
      },
      "surface": {
        "shell": "#191919",
        "card": "#272727",
        "white": "#353535",
        "anchor": "#A8A8A8",
        "chipOnAnchor": "#212121"
      },
      "ink": {
        "core": "#ECECEC",
        "muted": "#9D9D9D",
        "onAnchor": "#000000",
        "mutedOnAnchor": "#3D3D3D",
        "onChip": "#ECECEC"
      },
      "ladderLstar": {
        "veil": 4,
        "canvas": 9.8,
        "glow": 15.6,
        "shell": 21.4,
        "card": 27.2,
        "elevated": 33
      },
      "fillAlpha": {
        "shell": 0.087,
        "card": 0.06,
        "linearEquivalent": 89e-4
      }
    },
    "light": {
      "backdrop": {
        "veil": "#8E8E8E",
        "canvas": "#CACACA",
        "glow": "#D6D6D6",
        "stops": [
          {
            "at": 0,
            "role": "veil",
            "hex": "#8E8E8E"
          },
          {
            "at": 0.45,
            "role": "canvas",
            "hex": "#CACACA"
          },
          {
            "at": 1,
            "role": "glow",
            "hex": "#D6D6D6"
          }
        ],
        "bloomAlpha": 0.45
      },
      "surface": {
        "shell": "#E3E3E3",
        "card": "#E8E8E8",
        "white": "#FDFDFD",
        "anchor": "#262626",
        "chipOnAnchor": "#AFAFAF"
      },
      "ink": {
        "core": "#010101",
        "muted": "#444444",
        "onAnchor": "#FFFFFF",
        "mutedOnAnchor": "#8C8C90",
        "onChip": "#010101"
      },
      "fillAlpha": {
        "shell": 0.32,
        "card": 0.55
      }
    }
  },
  "glass": {
    "shell": {
      "fill": "#FFFFFF",
      "alpha": 0.087,
      "blurPx": 48
    },
    "card": {
      "fill": "#FFFFFF",
      "alpha": 0.55,
      "blurPx": 28
    },
    "sheet": {
      "fillRole": "surface.elevated",
      "alpha": 0.9,
      "blurPx": 40,
      "note": "a sheet floats above scrolling content, so it is the second (and last) live-blurred surface on phone"
    },
    "blurPx": {
      "shell": 48,
      "card": 28,
      "tabbar": 24,
      "sheet": 40,
      "chip": 16,
      "grainTile": 0
    },
    "blurBudget": {
      "liveBlurredLayers": 3,
      "liveBlurredUsed": 2,
      "layersOnlyIn": [
        "tab bar",
        "sheets"
      ],
      "staticGlass": "shell, cards, chips, segmented controls and icon buttons use pre-composited translucent fills + 1px hairlines, which cost no GPU pass",
      "note": "3 live layers is the Android budget on a mid-range device before compositing shows up as jank. The prototype spends 2 (tab bar, sheet) and keeps 1 in reserve for a stacked second sheet; blurring the shell would be a full-screen pass for a difference invisible on a phone."
    },
    "saturate": 1,
    "saturateNote": "the reference is achromatic (mean OKLab chroma 0.00011): a saturation boost would be a no-op at best",
    "borders": {
      "hairlineAlpha": 0.65,
      "cardAlpha": 0.7
    },
    "shadow": {
      "ambient": "0 30px 80px rgba(8, 8, 10, 0.10)",
      "card": "0 2px 8px rgba(8, 8, 10, 0.05)",
      "note": "measured: outside the shell the luminance falls <=2% over 40px, so shadows stay ambient and tinted neutral, never pure black"
    }
  },
  "radius": {
    "xs": 6,
    "sm": 10,
    "md": 14,
    "dock": 18,
    "card": 20,
    "hero": 24,
    "sheet": 28,
    "pill": 999,
    "badge": 999,
    "phone": 40
  },
  "space": {
    "base": 8,
    "scale": [
      0,
      4,
      8,
      12,
      16,
      24,
      32,
      40,
      48,
      64,
      96
    ]
  },
  "type": {
    "family": "Inter",
    "fallback": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    "scale": {
      "display": {
        "size": 34,
        "lineHeight": 40,
        "weight": 700,
        "tracking": "-0.02em"
      },
      "headline": {
        "size": 26,
        "lineHeight": 32,
        "weight": 700,
        "tracking": "-0.02em"
      },
      "title-lg": {
        "size": 22,
        "lineHeight": 28,
        "weight": 700,
        "tracking": "-0.015em"
      },
      "title": {
        "size": 17,
        "lineHeight": 22,
        "weight": 600,
        "tracking": "-0.01em"
      },
      "body": {
        "size": 15,
        "lineHeight": 21,
        "weight": 500,
        "tracking": "0"
      },
      "label": {
        "size": 13,
        "lineHeight": 17,
        "weight": 500,
        "tracking": "0"
      },
      "micro": {
        "size": 11,
        "lineHeight": 14,
        "weight": 600,
        "tracking": "0.06em"
      }
    },
    "systemScaleToken": "--m-text-scale",
    "maxSystemScale": 2
  },
  "motion": {
    "durations": {
      "instant": 90,
      "fast": 160,
      "base": 240,
      "slow": 420,
      "drift": 45e3,
      "breathe": 8e3
    },
    "easings": {
      "standard": "cubic-bezier(0.2, 0, 0, 1)",
      "emphasized": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "exit": "cubic-bezier(0.4, 0, 1, 1)"
    },
    "maxFrequencyHz": 0.5,
    "reducedMotion": {
      "durations": {
        "instant": 0,
        "fast": 0,
        "base": 0,
        "slow": 0,
        "drift": 0,
        "breathe": 0
      },
      "easings": {
        "standard": "linear",
        "emphasized": "linear",
        "exit": "linear"
      },
      "allowed": [
        "opacity cross-fade (<= 120ms)",
        "progress fill snap"
      ],
      "forbidden": [
        "slide/scale transitions",
        "parallax drift",
        "bloom breathing",
        "grain animation"
      ],
      "note": "prefers-reduced-motion is honoured by default; the prototype also exposes a manual override so the state is reviewable without OS settings"
    }
  },
  "size": {
    "touchTarget": 48,
    "iconButton": 48,
    "chipHeight": 32,
    "chipTouchHeight": 48,
    "tabBar": 64,
    "headerHeight": 56,
    "ring": 96,
    "note": "1 CSS px in the prototype frame == 1 dp; every [data-tap] element is measured at runtime"
  },
  "overlays": {
    "sheetScrim": 0.52,
    "grain": 0.02,
    "bloom": 0.9
  },
  "lightSource": {
    "hex": "#FFFFFF"
  },
  "adjustments": [
    {
      "theme": "light",
      "token": "muted",
      "from": "#4F4F4F",
      "to": "#444444",
      "context": "ink.muted",
      "ratioBefore": 3.86,
      "ratioAfter": 4.57,
      "minRatio": 4.5,
      "reason": "measured ink fell below the WCAG AA floor on the worst-case surface (the reference itself sits at 3.24:1 for muted ink on graphite)"
    },
    {
      "theme": "light",
      "token": "mutedOnAnchor",
      "from": "#757478",
      "to": "#8C8C90",
      "context": "ink.mutedOnAnchor",
      "ratioBefore": 3.27,
      "ratioAfter": 4.52,
      "minRatio": 4.5,
      "reason": "measured ink fell below the WCAG AA floor on the worst-case surface (the reference itself sits at 3.24:1 for muted ink on graphite)"
    },
    {
      "theme": "dark",
      "token": "muted",
      "from": "#787878",
      "to": "#9D9D9D",
      "context": "ink.muted",
      "ratioBefore": 2.77,
      "ratioAfter": 4.53,
      "minRatio": 4.5,
      "reason": "mirrored ink fell below the WCAG AA floor on the worst-case dark surface"
    },
    {
      "theme": "dark",
      "token": "mutedOnAnchor",
      "from": "#525252",
      "to": "#3D3D3D",
      "context": "ink.mutedOnAnchor",
      "ratioBefore": 3.28,
      "ratioAfter": 4.59,
      "minRatio": 4.5,
      "reason": "mirrored ink fell below the WCAG AA floor on the worst-case dark surface"
    }
  ],
  "validation": [
    {
      "token": "glass.shellFillAlpha",
      "proposed": 0.32,
      "band": [
        0.2,
        0.48
      ],
      "status": "within-band",
      "note": "the shell floats 10.2 L* above the backdrop (measured), which the proposed alpha reproduces within the measured band"
    },
    {
      "token": "glass.cardFillAlpha",
      "proposed": 0.55,
      "band": [
        0.32,
        0.75
      ],
      "status": "within-band",
      "note": "a sunk card must be more opaque than the shell it sits on (measured 0.62 relative to the shell)"
    },
    {
      "token": "radius.componentScale",
      "proposed": 14,
      "band": [
        6,
        20
      ],
      "status": "within-band",
      "note": "authored, not measured: the reference contains no 6-14pt elements. The small steps stay below the measured card radius (20) so no component ever looks rounder than a measured surface."
    },
    {
      "token": "type.scale.title-lg",
      "proposed": 22,
      "band": [
        18,
        25
      ],
      "status": "within-band",
      "note": "authored, not measured: a 390pt column needs a heading step between the brief's title (17) and headline (26). The band is bounded by those two measured-adjacent roles, so the addition cannot silently drift off the measured hierarchy."
    },
    {
      "token": "type.systemScaleToken",
      "proposed": 22,
      "band": [
        11,
        68
      ],
      "status": "within-band",
      "note": "all type tokens are emitted as calc(Npx * var(--m-text-scale)); micro at 200% (22pt) and display at 200% (68pt) both stay inside the band the OS setting can produce"
    },
    {
      "token": "overlays.grain",
      "proposed": 0.02,
      "band": [
        0,
        0.03
      ],
      "status": "within-band",
      "note": "measured high-pass sigma is 0.22/255 (no film grain); the brief caps the overlay at 0.03 for banding only"
    },
    {
      "token": "radius.card",
      "proposed": 20,
      "band": [
        18,
        22
      ],
      "status": "within-band",
      "note": "measured circle fit r = 20px (RMS 0.5px) on the graphite hero card and the white card"
    },
    {
      "token": "size.touchTarget",
      "proposed": 48,
      "band": [
        48,
        96
      ],
      "status": "within-band",
      "note": "product requirement: every interactive element is at least 48dp square"
    }
  ],
  "contrast": [
    {
      "theme": "light",
      "fg": "ink.core",
      "fgHex": "#010101",
      "bg": "surface.white",
      "bgHex": "#FDFDFD",
      "ratio": 20.52,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "light",
      "fg": "ink.core",
      "fgHex": "#010101",
      "bg": "surface.shell (worst composite)",
      "bgHex": "#B2B2B2",
      "ratio": 9.84,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "light",
      "fg": "ink.muted",
      "fgHex": "#444444",
      "bg": "surface.white",
      "bgHex": "#FDFDFD",
      "ratio": 9.58,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "light",
      "fg": "ink.muted",
      "fgHex": "#444444",
      "bg": "surface.shell (worst composite)",
      "bgHex": "#B2B2B2",
      "ratio": 4.59,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": false
    },
    {
      "theme": "light",
      "fg": "ink.onAnchor",
      "fgHex": "#FFFFFF",
      "bg": "surface.anchor",
      "bgHex": "#262626",
      "ratio": 15.13,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "light",
      "fg": "ink.mutedOnAnchor",
      "fgHex": "#8C8C90",
      "bg": "surface.anchor",
      "bgHex": "#262626",
      "ratio": 4.52,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": false
    },
    {
      "theme": "light",
      "fg": "ink.onChip",
      "fgHex": "#010101",
      "bg": "surface.chipOnAnchor",
      "bgHex": "#AFAFAF",
      "ratio": 9.52,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "dark",
      "fg": "ink.core",
      "fgHex": "#ECECEC",
      "bg": "surface.elevated",
      "bgHex": "#353535",
      "ratio": 10.38,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "dark",
      "fg": "ink.core",
      "fgHex": "#ECECEC",
      "bg": "surface.shell (worst composite)",
      "bgHex": "#1B1B1B",
      "ratio": 14.58,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "dark",
      "fg": "ink.muted",
      "fgHex": "#9D9D9D",
      "bg": "surface.elevated",
      "bgHex": "#353535",
      "ratio": 4.52,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": false
    },
    {
      "theme": "dark",
      "fg": "ink.muted",
      "fgHex": "#9D9D9D",
      "bg": "surface.shell (worst composite)",
      "bgHex": "#1B1B1B",
      "ratio": 6.35,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": false
    },
    {
      "theme": "dark",
      "fg": "ink.onAnchor",
      "fgHex": "#000000",
      "bg": "surface.anchor",
      "bgHex": "#A8A8A8",
      "ratio": 8.83,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    },
    {
      "theme": "dark",
      "fg": "ink.mutedOnAnchor",
      "fgHex": "#3D3D3D",
      "bg": "surface.anchor",
      "bgHex": "#A8A8A8",
      "ratio": 4.57,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": false
    },
    {
      "theme": "dark",
      "fg": "ink.onChip",
      "fgHex": "#ECECEC",
      "bg": "surface.chipOnAnchor",
      "bgHex": "#212121",
      "ratio": 13.63,
      "minRatio": 4.5,
      "passAA": true,
      "passAAA": true
    }
  ]
};

// packages/ui/src/tokens.ts
var DEFAULT_THEME = tokens.meta.defaultTheme;
var hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255];
};
var srgbToLinear = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
var toHex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
var luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
var contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
var composite = (fgHex, alpha, bgHex) => {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  return toHex([0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)));
};
var rgba = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
};
var mix = (hex, toward, amount) => composite(toward, amount, hex);
var em = (tracking) => {
  const m = /(-?[\d.]+)em/.exec(tracking);
  return m ? parseFloat(m[1]) : 0;
};
var pxOf = (cssValue) => {
  const m = /(-?[\d.]+)px/.exec(cssValue);
  return m ? parseFloat(m[1]) : 0;
};
function createTheme(name = DEFAULT_THEME, overrides = {}) {
  const t = tokens.themes[name];
  const reducedTransparency = overrides.reducedTransparency ?? false;
  const reducedMotion = overrides.reducedMotion ?? false;
  const textScale = Math.min(tokens.type.maxSystemScale, Math.max(1, overrides.textScale ?? 1));
  const isDark = name === "dark";
  const glassFill = (kind) => {
    if (reducedTransparency) {
      if (kind === "shell") return t.surface.shell;
      if (kind === "card") return t.surface.card;
      return t.surface.white;
    }
    if (kind === "sheet") return rgba(t.surface.white, tokens.glass.sheet.alpha);
    const alpha = kind === "shell" ? t.fillAlpha.shell : t.fillAlpha.card;
    return rgba(tokens.glass[kind].fill, alpha);
  };
  const blur = (kind) => {
    if (reducedTransparency) return 0;
    return tokens.glass.blurPx[kind];
  };
  const theme = {
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
      borderHairline: rgba("#FFFFFF", isDark ? 0.14 : tokens.glass.borders.hairlineAlpha),
      borderCard: rgba("#FFFFFF", isDark ? 0.18 : tokens.glass.borders.cardAlpha),
      scrim: rgba(isDark ? "#000000" : "#0E0E10", isDark ? 0.62 : tokens.overlays.sheetScrim),
      lightSource: tokens.lightSource.hex,
      grain: tokens.overlays.grain,
      bloomAlpha: t.backdrop.bloomAlpha,
      backdropStops: t.backdrop.stops
    },
    glass: {
      shell: { fill: glassFill("shell"), blurPx: blur("shell"), live: false },
      card: { fill: glassFill("card"), blurPx: blur("card"), live: false },
      sheet: { fill: glassFill("sheet"), blurPx: blur("sheet"), live: !reducedTransparency },
      // The tab bar is the only other surface allowed to spend a live-blur pass.
      tabbar: { fill: glassFill("shell"), blurPx: blur("tabbar"), live: !reducedTransparency },
      chip: { fill: glassFill("card"), blurPx: 0, live: false },
      blurBudget: tokens.glass.blurBudget
    },
    radius: {
      xs: tokens.radius.xs,
      sm: tokens.radius.sm,
      md: tokens.radius.md,
      dock: tokens.radius.dock,
      card: tokens.radius.card,
      hero: tokens.radius.hero,
      sheet: tokens.radius.sheet,
      pill: tokens.radius.pill,
      phone: tokens.radius.phone
    },
    space: (step) => tokens.space.scale[step] ?? tokens.space.base * step,
    type: (role) => {
      const s = tokens.type.scale[role];
      return {
        fontSize: s.size * textScale,
        lineHeight: s.lineHeight * textScale,
        fontWeight: String(s.weight),
        letterSpacing: em(s.tracking) * s.size * textScale
      };
    },
    size: tokens.size,
    motion: (n) => reducedMotion ? 0 : tokens.motion.durations[n],
    easing: (n) => tokens.motion.easings[n],
    shadow: { ambient: tokens.glass.shadow.ambient, card: tokens.glass.shadow.card }
  };
  return Object.freeze(theme);
}
var lightTheme = (o = {}) => createTheme("light", o);
var darkTheme = (o = {}) => createTheme("dark", o);
var auditPairs = tokens.contrast;
var adjustments = tokens.adjustments;
var tokenMeta = tokens.meta;
var px = pxOf;

// packages/ui/src/theme.tsx
import * as React from "react";

// packages/ui/mockups/rn-dom.tsx
import { jsx } from "react/jsx-runtime";
var UNITLESS = /* @__PURE__ */ new Set([
  "opacity",
  "flex",
  "flexGrow",
  "flexShrink",
  "zIndex",
  "fontWeight",
  "borderWidth",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "aspectRatio",
  "elevation"
]);
var kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
function toCss(style) {
  const flat = flatten(style);
  const out = {};
  for (const [key, raw] of Object.entries(flat)) {
    if (raw === void 0 || raw === null) continue;
    const cssKey = kebab(key);
    if (typeof raw === "number") {
      out[cssKey] = UNITLESS.has(key) || cssKey.startsWith("--") ? raw : `${raw}px`;
    } else if (typeof raw === "string" || typeof raw === "number") {
      out[cssKey] = String(raw);
    } else {
      if (key === "transform" && Array.isArray(raw)) {
        out.transform = raw.map((t) => Object.entries(t).map(([fn, v]) => `${fn === "rotate" ? "rotate" : fn}(${typeof v === "number" ? `${v}deg` : v})`).join(" ")).join(" ");
      }
      if (key === "shadowColor" || key === "shadowOpacity" || key === "shadowRadius" || key === "shadowOffset") {
        const shadow = flat;
        const offset = shadow.shadowOffset ?? { width: 0, height: 0 };
        out.boxShadow = `${offset.width ?? 0}px ${offset.height ?? 0}px ${shadow.shadowRadius ?? 0}px ${shadow.shadowColor ?? "rgba(0,0,0,0.2)"}`;
      }
    }
  }
  return out;
}
function flatten(style) {
  const out = {};
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === "object") {
      Object.assign(out, node);
    }
  };
  visit(style);
  return out;
}
function ariaFrom(props) {
  const aria = {};
  if (props.accessibilityLabel) aria["aria-label"] = props.accessibilityLabel;
  if (props.accessibilityHint) aria["aria-description"] = props.accessibilityHint;
  if (props.accessibilityRole) aria.role = props.accessibilityRole;
  const state = props.accessibilityState;
  if (state) {
    if (state.selected !== void 0) aria["aria-selected"] = String(state.selected);
    if (state.disabled !== void 0) aria["aria-disabled"] = String(state.disabled);
    if (state.expanded !== void 0) aria["aria-expanded"] = String(state.expanded);
  }
  if (props.accessibilityValue) aria["aria-valuenow"] = String(props.accessibilityValue.now ?? "");
  if (props.accessibilityLiveRegion) aria["aria-live"] = String(props.accessibilityLiveRegion);
  if (props.testID) aria["data-testid"] = props.testID;
  return aria;
}
var domProps = (props, { skipStyle = false } = {}) => {
  const { children, style, ...rest } = props;
  delete rest.hitSlop;
  delete rest.testID;
  delete rest.accessibilityState;
  delete rest.accessibilityValue;
  const dom = { ...ariaFrom(props), ...rest };
  if (!skipStyle) dom.style = toCss(style);
  delete dom.accessibilityLabel;
  delete dom.accessibilityHint;
  delete dom.accessibilityRole;
  delete dom.accessibilityValue;
  delete dom.accessibilityLiveRegion;
  delete dom.accessible;
  delete dom.pointerEvents;
  return dom;
};
var View = ({ children, ...props }) => {
  const interceptor = props.onStartShouldSetResponder ? true : void 0;
  return /* @__PURE__ */ jsx("div", { ...domProps({ ...props, children }, { skipStyle: false }), "data-view": "1", "data-interactive": interceptor ? "1" : void 0, children });
};
var Text = ({ children, ...props }) => /* @__PURE__ */ jsx("span", { ...domProps({ ...props, children }), "data-text": "1", children });
var Pressable = ({ children, ...props }) => {
  const { style } = props;
  const resolved = typeof style === "function" ? style({ pressed: false }) : style;
  const { children: _c, ...rest } = props;
  const dom = domProps({ ...rest, style: resolved });
  const disabled = Boolean(props.disabled);
  return /* @__PURE__ */ jsx("button", { type: "button", "data-tap": "1", disabled: disabled || void 0, ...dom, children: typeof children === "function" ? children({ pressed: false }) : children });
};
var ScrollView = ({ children, contentContainerStyle, ...props }) => /* @__PURE__ */ jsx("div", { ...domProps(props), "data-scroll": "1", children: /* @__PURE__ */ jsx("div", { style: toCss(contentContainerStyle), children }) });
var Platform = {
  OS: "android",
  select: (spec) => spec.android ?? spec.default,
  Version: 34
};
var useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });
var AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_event, _handler) => ({ remove: () => void 0 })
};

// packages/ui/src/theme.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
var ThemeContext = React.createContext(null);
function ThemeProvider({ children, initialTheme = DEFAULT_THEME, overrides = {}, followSystem = true }) {
  const [name, setName] = React.useState(initialTheme);
  const [system, setSystem] = React.useState({
    reduceMotion: false,
    reduceTransparency: false
  });
  React.useEffect(() => {
    if (!followSystem || !AccessibilityInfo) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => alive && setSystem((s) => ({ ...s, reduceMotion: v })));
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => setSystem((s) => ({ ...s, reduceMotion: v })));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, [followSystem]);
  const theme = React.useMemo(
    () => createTheme(name, {
      reducedMotion: overrides.reducedMotion ?? (followSystem ? system.reduceMotion : false),
      reducedTransparency: overrides.reducedTransparency ?? (followSystem ? system.reduceTransparency : false),
      textScale: overrides.textScale
    }),
    [name, overrides.reducedMotion, overrides.reducedTransparency, overrides.textScale, followSystem, system]
  );
  const [slots, setSlots] = React.useState([]);
  const registerLiveLayer = React.useCallback((id, budget) => {
    setSlots((current) => {
      if (current.includes(id)) return current;
      if (current.length >= budget) return current;
      return [...current, id];
    });
    return () => setSlots((current) => current.filter((s) => s !== id));
  }, []);
  const liveLayers = slots.length;
  const value = React.useMemo(
    () => ({
      theme,
      setTheme: setName,
      toggleTheme: () => setName((n) => n === "dark" ? "light" : "dark"),
      liveLayers,
      liveSlots: slots,
      registerLiveLayer
    }),
    [theme, slots, liveLayers, registerLiveLayer]
  );
  return /* @__PURE__ */ jsx2(ThemeContext.Provider, { value, children });
}
function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider> (or pass `theme` explicitly \u2014 every component accepts one).");
  return ctx.theme;
}
function useThemeControls() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeControls must be used inside <ThemeProvider>.");
  return ctx;
}
function useLiveBlur(id, enabled = true) {
  const ctx = React.useContext(ThemeContext);
  const register = ctx?.registerLiveLayer;
  const budget = ctx?.theme.glass.blurBudget.liveBlurredLayers ?? 3;
  React.useEffect(() => {
    if (!enabled || !register) return;
    return register(id, budget);
  }, [enabled, id, register, budget]);
  if (!ctx || !enabled) return false;
  return ctx.liveSlots.includes(id);
}

// packages/ui/src/flags.ts
var FLAG_DEFAULTS = {
  /** Local-only insights: the product's core, on by default. */
  insights: { defaultOn: true, owner: "build", needs: ["D"], emptyState: "No usage data yet \u2014 Mirror needs Android usage access to say anything at all." },
  /** Topic-level analysis needs titles, which only tier A/B/C sources carry. */
  topics: { defaultOn: true, owner: "build", needs: ["A", "B", "C"], emptyState: "No topic data yet. Connect a source or import an export, or stay on the usage-only view." },
  /** Weekly report is local-only and printable; no server involved. */
  weeklyReport: { defaultOn: true, owner: "build", needs: ["D"], emptyState: "A report appears once there are seven days of on-device history." },
  /** Ask runs on-device over your own data. */
  ask: { defaultOn: true, owner: "build", needs: ["D"], emptyState: "Ask needs at least a week of history before it can answer without guessing." },
  /** Widgets are local renderings of local data. */
  widgets: { defaultOn: true, owner: "build", needs: ["D"], emptyState: "Widgets show demo values until there is data to render." },
  /** Experimental algorithms, off by default. */
  experimentalScoring: { defaultOn: false, owner: "build", needs: ["D"], emptyState: "Experimental scoring is off." },
  /** Anything that leaves the device. Off by default, user-owned, and it still cannot add collection. */
  cloudReport: { defaultOn: false, owner: "user", needs: ["D"], emptyState: "Cloud reports are off. Nothing leaves this device." },
  /** Social matching. Off by default and *structurally* unable to expose history. */
  socialMatching: { defaultOn: false, owner: "user", needs: ["A", "B", "C"], emptyState: "Matching is off. Turning it on shares only the topics you pick, one by one \u2014 never your watch, search or purchase history." },
  /** Compare-with-friends style features inherit the same rule. */
  friendComparison: { defaultOn: false, owner: "user", needs: ["A", "B", "C"], emptyState: "Comparison is off." }
};
var initialFlags = Object.fromEntries(
  Object.entries(FLAG_DEFAULTS).map(([name, def]) => [name, def.defaultOn])
);
var isOn = (flags, name) => flags[name] ?? FLAG_DEFAULTS[name].defaultOn;
function flagsMissingData(flags, available) {
  return Object.keys(FLAG_DEFAULTS).filter((name) => {
    if (!isOn(flags, name)) return false;
    const needs = FLAG_DEFAULTS[name].needs;
    return !needs.some((tier) => available.includes(tier));
  });
}
function auditFlagPosture() {
  const problems = [];
  for (const [name, def] of Object.entries(FLAG_DEFAULTS)) {
    if (def.owner === "user" && def.defaultOn) {
      problems.push(`${name}: user-owned flags must start off`);
    }
    if (def.defaultOn && !def.emptyState) {
      problems.push(`${name}: default-on flags must state what the UI says when the data is missing`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// packages/ui/src/tiers.ts
var TIERS = {
  A: {
    letter: "A",
    name: "Official API",
    how: "You sign in with OAuth; Mirror calls the official API with the narrowest scopes that exist.",
    localOnly: false,
    examples: ["Reddit saved posts and subscribed communities", "Twitch followed channels"]
  },
  B: {
    letter: "B",
    name: "Your export",
    how: "You download your own data export and import the file. Nothing is fetched for you.",
    localOnly: true,
    examples: ["YouTube watch history from Google Takeout", "Instagram saved content", "Amazon order history"]
  },
  C: {
    letter: "C",
    name: "Browser extension",
    how: "Mirror's own extension reads allow-listed pages you have opted into, and sends the events to your own device.",
    localOnly: true,
    examples: ["Watch completion and scroll depth", "Search terms on allow-listed sites"]
  },
  D: {
    letter: "D",
    name: "OS usage",
    how: "Android Usage access (or iOS DeviceActivity). Foreground time, launches, timestamps \u2014 never content.",
    localOnly: true,
    examples: ["Per-app foreground time", "Session start/end and unlock counts"]
  }
};
var TIER_ORDER = ["D", "C", "B", "A"];
var IMPOSSIBLE = [
  { label: "Watch completion, searches, scroll depth", tier: "C", reason: "Only from our own browser extension on allow-listed sites. Without it, unmeasurable." },
  { label: "YouTube watch history", tier: "A", reason: "The YouTube Data API has no watch-history endpoint. Takeout export (tier B) is the only honest route." },
  { label: "Instagram and Amazon history", tier: "B", reason: "No consumer history API exists. Your own export, or nothing." },
  { label: "Content inside other apps on this phone", tier: "\u2014", reason: "Impossible without accessibility services or screen capture, which Mirror never uses." },
  { label: "Notification contents", tier: "\u2014", reason: "Would require notification access. Mirror counts nothing here." }
];
function degrade(available, needs, featureLabel) {
  const missing = needs.filter((t) => !available.includes(t));
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    message: `${featureLabel} is unavailable: it needs tier ${missing.join(" and ")} data, which is not on this device. Mirror will not estimate it.`
  };
}
var tierLabel = (t) => `${t} \xB7 ${TIERS[t].name}`;

// packages/ui/src/a11y.ts
var MIN_TOUCH_DP = 48;
function touchTarget(visual, theme, min = theme.size.touchTarget) {
  const deficit = Math.max(0, min - visual);
  const half = Math.ceil(deficit / 2);
  return {
    minWidth: Math.max(visual, min),
    minHeight: Math.max(visual, min),
    hitSlop: { top: half, bottom: half, left: half, right: half }
  };
}
function hitSlopFor(visualSize, theme) {
  const half = Math.ceil(Math.max(0, theme.size.touchTarget - visualSize) / 2);
  return { top: half, bottom: half, left: half, right: half };
}
function assertTargetSize(label, size, min = MIN_TOUCH_DP) {
  if (size.width >= min && size.height >= min) return null;
  const small = size.width < min && size.height < min ? "both dimensions" : size.width < min ? "width" : "height";
  return {
    label,
    width: size.width,
    height: size.height,
    hint: `${label} measures ${Math.round(size.width)}x${Math.round(size.height)}dp: ${small} below the ${min}dp minimum. Fix the control, or wrap the visual in a larger Pressable with hitSlop \u2014 do not lower this number.`
  };
}
var ROLES = {
  tab: "tab",
  button: "button",
  header: "header",
  image: "image",
  text: "text",
  summary: "summary",
  progressbar: "progressbar"
};
function announceValue(label, value, unit, context) {
  const core = typeof value === "number" ? `${value} ${unit}` : `${value} ${unit}`.trim();
  return context ? `${label}, ${core}, ${context}` : `${label}, ${core}`;
}
function a11yTarget(label, hint, disabled) {
  return {
    accessible: true,
    accessibilityRole: ROLES.button,
    accessibilityLabel: label,
    accessibilityHint: hint,
    accessibilityState: disabled ? { disabled: true } : void 0
  };
}
function layoutMetrics(theme) {
  return {
    statusStrip: 44,
    header: theme.size.headerHeight,
    tabBar: theme.size.tabBar,
    /** Scroll content must clear the floating tab bar + its margins. */
    bottomInset: theme.size.tabBar + theme.space(6),
    gutter: theme.space(4),
    /** iOS uses points, Android dp — both are 1:1 with the token unit here. */
    unit: Platform.OS === "ios" ? "pt" : "dp"
  };
}
var focusRing = (theme) => ({
  borderWidth: 2,
  borderColor: theme.color.ink
});

// packages/ui/src/format.ts
var pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
function duration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}
function clock(date) {
  const d = typeof date === "number" ? new Date(date) : date;
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}
function shortDay(date) {
  const d = typeof date === "number" ? new Date(date) : date;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}
function relativeDay(date, now = Date.now()) {
  const d = typeof date === "number" ? date : date.getTime();
  const n = typeof now === "number" ? now : now.getTime();
  const days = Math.floor((n - d) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" });
}
function hedged(value, tier, kind = "score") {
  if (tier === "D") {
    if (kind === "duration") return `about ${value}`;
    return `roughly ${value}`;
  }
  return value;
}
function percent(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}
function tierSummary(tiers) {
  if (tiers.length === 0) return "no sources yet";
  const order = ["D", "C", "B", "A"];
  return tiers.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(" + ");
}
function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// packages/ui/src/primitives/text.tsx
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
var withTheme = (theme) => theme ?? useTheme();
function Text2({
  role = "body",
  tone = "core",
  weight = "auto",
  center,
  children,
  style,
  theme,
  numberOfLines,
  allowFontScaling = true,
  accessibilityLiveRegion
}) {
  const t = withTheme(theme);
  const type = t.type(role);
  const colour = tone === "muted" ? t.color.inkMuted : tone === "onAnchor" ? t.color.onAnchor : tone === "mutedOnAnchor" ? t.color.mutedOnAnchor : tone === "onChip" ? t.color.onChip : tone === "onLight" ? t.color.ink : t.color.ink;
  const fontWeight = weight === "auto" ? type.fontWeight : weight === "bold" ? "700" : weight === "medium" ? "500" : "400";
  return /* @__PURE__ */ jsx3(
    Text,
    {
      allowFontScaling,
      numberOfLines,
      accessibilityLiveRegion,
      style: [
        {
          color: colour,
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          fontWeight,
          letterSpacing: type.letterSpacing,
          textAlign: center ? "center" : "auto"
        },
        style
      ],
      children
    }
  );
}
function SectionHeader({
  title,
  caption,
  trailing,
  theme
}) {
  const t = withTheme(theme);
  return /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: t.space(2) }, children: [
    /* @__PURE__ */ jsxs(View, { style: { flexShrink: 1 }, children: [
      /* @__PURE__ */ jsx3(Text2, { role: "title-lg", theme: t, children: title }),
      caption ? /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, style: { marginTop: t.space(1) }, children: caption }) : null
    ] }),
    trailing
  ] });
}
function Stat({
  value,
  unit,
  label,
  hint,
  tone = "core",
  theme
}) {
  const t = withTheme(theme);
  return /* @__PURE__ */ jsxs(View, { accessible: true, accessibilityRole: "summary", accessibilityLabel: `${label}: ${value} ${unit ?? ""}`.trim(), children: [
    /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", alignItems: "baseline", gap: t.space(1) }, children: [
      /* @__PURE__ */ jsx3(Text2, { role: "display", tone, theme: t, children: value }),
      unit ? /* @__PURE__ */ jsx3(Text2, { role: "title", tone, theme: t, children: unit }) : null
    ] }),
    /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, style: { marginTop: t.space(1) }, children: label }),
    hint ? /* @__PURE__ */ jsx3(Text2, { role: "micro", tone: "muted", theme: t, style: { marginTop: t.space(1) }, children: hint }) : null
  ] });
}
function TierBadge({ tier, ghost, theme }) {
  const t = withTheme(theme);
  const style = ghost ? { borderWidth: 1, borderColor: t.color.borderCard, backgroundColor: "transparent" } : { backgroundColor: t.color.chip };
  const tone = ghost ? "muted" : "onChip";
  return /* @__PURE__ */ jsx3(
    View,
    {
      accessible: true,
      accessibilityLabel: `data tier ${tier}${tier === "\u2014" ? "" : `: ${TIERS[tier].name}`}`,
      style: [{ minWidth: t.space(4), height: t.space(3), alignItems: "center", justifyContent: "center", paddingHorizontal: t.space(1), borderRadius: t.radius.pill }, style],
      children: /* @__PURE__ */ jsx3(Text2, { role: "micro", tone, theme: t, children: tier })
    }
  );
}
function ConfidenceChip({
  tiers,
  onPress,
  label,
  theme
}) {
  const t = withTheme(theme);
  const text = label ?? (tiers.length ? `Based on ${tiers.slice().sort().join(" + ")}` : "No data yet");
  return /* @__PURE__ */ jsx3(
    View,
    {
      accessible: true,
      accessibilityRole: onPress ? "button" : "text",
      accessibilityLabel: `${text}${onPress ? ". Opens the capability matrix." : ""}`,
      onStartShouldSetResponder: onPress ? () => true : void 0,
      onResponderRelease: onPress,
      style: {
        flexDirection: "row",
        alignItems: "center",
        gap: t.space(1),
        paddingHorizontal: t.space(2),
        minHeight: t.size.chipTouchHeight
      },
      children: /* @__PURE__ */ jsx3(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: t.space(1),
            paddingHorizontal: t.space(2),
            height: t.size.chipHeight,
            borderRadius: t.radius.pill,
            backgroundColor: t.glass.chip.fill,
            borderWidth: 1,
            borderColor: t.color.borderCard
          },
          children: /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, children: text })
        }
      )
    }
  );
}
function ListRow({
  leading,
  title,
  meta,
  trailing,
  onPress,
  accessibilityLabel,
  theme
}) {
  const t = withTheme(theme);
  const content = /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: t.space(3), paddingVertical: t.space(3), minHeight: t.size.touchTarget }, children: [
    leading,
    /* @__PURE__ */ jsxs(View, { style: { flex: 1 }, children: [
      /* @__PURE__ */ jsx3(Text2, { role: "body", theme: t, children: title }),
      meta ? /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, style: { marginTop: 2 }, children: meta }) : null
    ] }),
    trailing
  ] });
  if (!onPress) return content;
  return /* @__PURE__ */ jsx3(
    View,
    {
      accessible: true,
      accessibilityRole: "button",
      accessibilityLabel: accessibilityLabel ?? [title, meta].filter(Boolean).join(", "),
      onStartShouldSetResponder: () => true,
      onResponderRelease: onPress,
      children: content
    }
  );
}
function Callout({
  children,
  tone = "neutral",
  theme
}) {
  const t = withTheme(theme);
  return /* @__PURE__ */ jsx3(
    View,
    {
      style: {
        borderRadius: t.radius.md,
        padding: t.space(3),
        backgroundColor: tone === "limit" ? t.glass.chip.fill : "transparent",
        borderWidth: 1,
        borderColor: t.color.borderCard,
        gap: t.space(1)
      },
      children: /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, children })
    }
  );
}
function EmptyState({
  title,
  body,
  action,
  theme
}) {
  const t = withTheme(theme);
  return /* @__PURE__ */ jsxs(View, { style: { alignItems: "center", paddingVertical: t.space(6), paddingHorizontal: t.space(4), gap: t.space(2) }, children: [
    /* @__PURE__ */ jsx3(
      View,
      {
        style: {
          width: t.space(6),
          height: t.space(6),
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: t.color.borderCard
        }
      }
    ),
    /* @__PURE__ */ jsx3(Text2, { role: "title", theme: t, center: true, children: title }),
    /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, center: true, style: { maxWidth: 260 }, children: body }),
    action
  ] });
}
function Divider({ theme }) {
  const t = withTheme(theme);
  return /* @__PURE__ */ jsx3(View, { style: { height: 1, backgroundColor: t.color.borderCard, marginVertical: t.space(2) } });
}
function Meter({
  value,
  label,
  caption,
  tone = "anchor",
  theme
}) {
  const t = withTheme(theme);
  const clamped = Math.max(0, Math.min(1, value));
  return /* @__PURE__ */ jsxs(
    View,
    {
      accessible: true,
      accessibilityRole: "progressbar",
      accessibilityLabel: caption ? `${label}, ${caption}` : label,
      accessibilityValue: { min: 0, max: 100, now: Math.round(clamped * 100) },
      style: { gap: t.space(1) },
      children: [
        /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsx3(Text2, { role: "label", theme: t, children: label }),
          caption ? /* @__PURE__ */ jsx3(Text2, { role: "label", tone: "muted", theme: t, children: caption }) : null
        ] }),
        /* @__PURE__ */ jsx3(View, { style: { height: 8, borderRadius: t.radius.pill, backgroundColor: t.glass.chip.fill, overflow: "hidden" }, children: /* @__PURE__ */ jsx3(
          View,
          {
            style: {
              width: `${clamped * 100}%`,
              height: "100%",
              borderRadius: t.radius.pill,
              backgroundColor: tone === "anchor" ? t.color.anchor : t.color.inkMuted
            }
          }
        ) })
      ]
    }
  );
}

// packages/ui/src/primitives/controls.tsx
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var withTheme2 = (theme) => theme ?? useTheme();
function usePressableBase(theme, visualHeight, onPress, disabled) {
  return {
    hitSlop: hitSlopFor(visualHeight, theme),
    disabled,
    onPress,
    style: ({ pressed }) => ({
      opacity: pressed && !theme.reducedMotion ? 0.86 : 1
    })
  };
}
function Pill({ children, variant = "primary", onPress, disabled, icon, theme, style, size, testID }) {
  const t = withTheme2(theme);
  const height = size ?? 44;
  const press = usePressableBase(t, height, onPress, disabled);
  const background = variant === "primary" ? t.color.anchor : variant === "secondary" ? t.glass.chip.fill : "transparent";
  const colour = variant === "primary" ? t.color.onAnchor : t.color.ink;
  return /* @__PURE__ */ jsx4(
    Pressable,
    {
      testID,
      ...press,
      ...a11yTarget(children, void 0, disabled),
      style: [
        {
          minHeight: t.size.touchTarget,
          minWidth: t.size.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: t.space(4)
        },
        style
      ],
      children: /* @__PURE__ */ jsxs2(
        View,
        {
          style: {
            height,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: t.space(2),
            paddingHorizontal: t.space(4),
            borderRadius: t.radius.pill,
            backgroundColor: background,
            borderWidth: variant === "quiet" ? 1 : 0,
            borderColor: t.color.borderCard
          },
          children: [
            icon,
            /* @__PURE__ */ jsx4(Text2, { role: "label", theme: t, style: { color: colour, fontWeight: "600" }, children })
          ]
        }
      )
    }
  );
}
function IconButton({
  label,
  children,
  onPress,
  disabled,
  badge,
  theme,
  testID
}) {
  const t = withTheme2(theme);
  const press = usePressableBase(t, t.size.iconButton, onPress, disabled);
  return /* @__PURE__ */ jsxs2(
    Pressable,
    {
      testID,
      ...press,
      ...a11yTarget(label, void 0, disabled),
      style: {
        width: t.size.iconButton,
        height: t.size.iconButton,
        borderRadius: t.radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.glass.chip.fill,
        borderWidth: 1,
        borderColor: t.color.borderCard
      },
      children: [
        children,
        badge ? /* @__PURE__ */ jsx4(
          View,
          {
            style: {
              position: "absolute",
              top: t.space(2),
              right: t.space(2),
              width: 7,
              height: 7,
              borderRadius: t.radius.pill,
              backgroundColor: t.color.ink,
              borderWidth: 1.5,
              borderColor: t.color.anchor
            }
          }
        ) : null
      ]
    }
  );
}
function Chip({
  label,
  value,
  onPress,
  static: isStatic,
  theme,
  testID
}) {
  const t = withTheme2(theme);
  if (isStatic) {
    return /* @__PURE__ */ jsx4(View, { style: { height: t.size.touchTarget, justifyContent: "center" }, children: /* @__PURE__ */ jsxs2(
      View,
      {
        style: {
          height: t.size.chipHeight,
          flexDirection: "row",
          alignItems: "center",
          gap: t.space(1),
          paddingHorizontal: t.space(3),
          borderRadius: t.radius.pill,
          backgroundColor: t.glass.chip.fill,
          borderWidth: 1,
          borderColor: t.color.borderCard
        },
        children: [
          /* @__PURE__ */ jsx4(Text2, { role: "label", tone: "muted", theme: t, children: label }),
          value ? /* @__PURE__ */ jsx4(Text2, { role: "label", tone: "muted", theme: t, style: { fontWeight: "600" }, children: value }) : null
        ]
      }
    ) });
  }
  const press = usePressableBase(t, t.size.chipHeight, onPress);
  return /* @__PURE__ */ jsx4(
    Pressable,
    {
      testID,
      ...press,
      ...a11yTarget(`${label}${value ? `: ${value}` : ""}. Opens a picker.`),
      style: { height: t.size.touchTarget, justifyContent: "center", minWidth: t.size.touchTarget },
      children: /* @__PURE__ */ jsxs2(
        View,
        {
          style: {
            height: t.size.chipHeight,
            flexDirection: "row",
            alignItems: "center",
            gap: t.space(1),
            paddingHorizontal: t.space(3),
            borderRadius: t.radius.pill,
            backgroundColor: t.glass.chip.fill,
            borderWidth: 1,
            borderColor: t.color.borderCard
          },
          children: [
            /* @__PURE__ */ jsx4(Text2, { role: "label", tone: "muted", theme: t, children: label }),
            value ? /* @__PURE__ */ jsx4(Text2, { role: "label", theme: t, style: { fontWeight: "600" }, children: value }) : null,
            /* @__PURE__ */ jsx4(Text2, { role: "micro", tone: "muted", theme: t, children: "\u25BE" })
          ]
        }
      )
    }
  );
}
function ChipRow({ children, theme }) {
  const t = withTheme2(theme);
  return /* @__PURE__ */ jsx4(View, { style: { flexDirection: "row", gap: t.space(2), paddingHorizontal: t.space(4), flexWrap: "wrap" }, children });
}
function SegmentedControl({
  options,
  value,
  onChange,
  label,
  theme
}) {
  const t = withTheme2(theme);
  return /* @__PURE__ */ jsx4(
    View,
    {
      accessibilityRole: "tablist",
      accessibilityLabel: label,
      style: {
        flexDirection: "row",
        borderRadius: t.radius.pill,
        backgroundColor: t.glass.chip.fill,
        borderWidth: 1,
        borderColor: t.color.borderCard,
        alignSelf: "flex-start"
      },
      children: options.map((option) => {
        const selected = option.value === value;
        return /* @__PURE__ */ jsx4(
          Pressable,
          {
            onPress: () => onChange(option.value),
            accessibilityRole: "tab",
            accessibilityState: { selected },
            accessibilityLabel: option.label,
            hitSlop: hitSlopFor(44, t),
            style: { minHeight: t.size.touchTarget + 4, minWidth: t.size.touchTarget, padding: 3, justifyContent: "center" },
            children: /* @__PURE__ */ jsxs2(
              View,
              {
                style: {
                  height: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: t.space(1),
                  paddingHorizontal: t.space(4),
                  borderRadius: t.radius.pill,
                  backgroundColor: selected ? t.color.anchor : "transparent"
                },
                children: [
                  option.icon,
                  /* @__PURE__ */ jsx4(Text2, { role: "label", theme: t, style: { color: selected ? t.color.onAnchor : t.color.inkMuted, fontWeight: "600" }, children: option.label })
                ]
              }
            )
          },
          option.value
        );
      })
    }
  );
}
function BoundaryToggle({
  value,
  onChange,
  consequence,
  theme
}) {
  const t = withTheme2(theme);
  return /* @__PURE__ */ jsxs2(View, { style: { gap: t.space(2) }, children: [
    /* @__PURE__ */ jsx4(
      SegmentedControl,
      {
        label: "Profile being viewed",
        value,
        onChange,
        theme: t,
        options: [
          { value: "private", label: "Private" },
          { value: "public", label: "Public" }
        ]
      }
    ),
    /* @__PURE__ */ jsx4(
      Text2,
      {
        role: "label",
        tone: value === "public" ? "core" : "muted",
        theme: t,
        accessibilityLiveRegion: "polite",
        style: { paddingHorizontal: t.space(4) },
        children: consequence
      }
    )
  ] });
}
function TabBar({
  items,
  active,
  onChange,
  liveBlur,
  theme
}) {
  const t = withTheme2(theme);
  return /* @__PURE__ */ jsx4(
    View,
    {
      accessibilityRole: "tablist",
      accessibilityLabel: "Sections",
      style: {
        position: "absolute",
        left: t.space(4),
        right: t.space(4),
        bottom: t.space(4),
        height: t.size.tabBar,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: t.space(1),
        borderRadius: t.radius.pill,
        backgroundColor: t.glass.tabbar.fill,
        borderWidth: 1,
        borderColor: t.color.borderHairline
      },
      children: items.map((item) => {
        const selected = item.id === active;
        return /* @__PURE__ */ jsxs2(
          Pressable,
          {
            onPress: () => onChange(item.id),
            accessibilityRole: "tab",
            accessibilityState: { selected },
            accessibilityLabel: item.label,
            style: {
              flex: 1,
              minWidth: t.size.touchTarget,
              minHeight: t.size.touchTarget,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              borderRadius: t.radius.pill,
              backgroundColor: selected ? t.color.elevated : "transparent"
            },
            children: [
              item.icon,
              /* @__PURE__ */ jsx4(Text2, { role: "micro", tone: selected ? "core" : "muted", theme: t, children: item.label })
            ]
          },
          item.id
        );
      })
    }
  );
}
function plainText(node) {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join(" ");
  const el = node;
  return el && el.props ? plainText(el.props.children) : "";
}
function LinkButton({ children, onPress, theme, testID }) {
  const t = withTheme2(theme);
  const press = usePressableBase(t, t.size.touchTarget, onPress);
  return /* @__PURE__ */ jsx4(
    Pressable,
    {
      testID,
      ...press,
      ...a11yTarget(plainText(children)),
      style: {
        minHeight: t.size.touchTarget,
        minWidth: t.size.touchTarget,
        justifyContent: "center",
        paddingHorizontal: t.space(2)
      },
      children: /* @__PURE__ */ jsx4(Text2, { role: "label", theme: t, style: { fontWeight: "600" }, children })
    }
  );
}
function TierAction({
  label,
  tiers,
  onPress,
  theme
}) {
  const t = withTheme2(theme);
  return /* @__PURE__ */ jsxs2(View, { style: { flexDirection: "row", alignItems: "center", gap: t.space(2) }, children: [
    /* @__PURE__ */ jsx4(View, { style: { flexDirection: "row", gap: 2 }, children: tiers.map((tier) => /* @__PURE__ */ jsx4(TierBadge, { tier, ghost: true, theme: t }, tier)) }),
    /* @__PURE__ */ jsx4(LinkButton, { onPress, theme: t, children: label })
  ] });
}

// packages/ui/src/primitives/containers.tsx
import { jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
var withTheme3 = (theme) => theme ?? useTheme();
function Backdrop({ theme }) {
  const t = withTheme3(theme);
  return /* @__PURE__ */ jsxs3(View, { pointerEvents: "none", style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.color.canvas }, children: [
    /* @__PURE__ */ jsx5(View, { style: { position: "absolute", top: 0, left: 0, right: 0, height: "45%", backgroundColor: t.color.veil, opacity: t.isDark ? 0.5 : 0.35 } }),
    /* @__PURE__ */ jsx5(
      View,
      {
        style: {
          position: "absolute",
          left: "-22%",
          bottom: "-18%",
          width: "150%",
          height: "78%",
          borderRadius: t.radius.pill,
          backgroundColor: t.color.glow,
          opacity: t.color.bloomAlpha
        }
      }
    ),
    /* @__PURE__ */ jsx5(
      View,
      {
        style: {
          position: "absolute",
          right: "-30%",
          top: "-12%",
          width: "118%",
          height: "46%",
          borderRadius: t.radius.pill,
          backgroundColor: t.color.veil,
          opacity: 0.35
        }
      }
    ),
    /* @__PURE__ */ jsx5(View, { style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: t.color.grain } })
  ] });
}
function Surface({
  children,
  radius = "card",
  style,
  theme
}) {
  const t = withTheme3(theme);
  return /* @__PURE__ */ jsx5(View, { style: [{ backgroundColor: t.glass.shell.fill, borderRadius: t.radius[radius] }, style], children });
}
function GlassSurface({
  children,
  layer,
  radius = "card",
  style,
  theme
}) {
  const t = withTheme3(theme);
  const granted = useLiveBlur(`${layer}:${radius}`, t.glass[layer].live);
  const spec = t.glass[layer];
  return /* @__PURE__ */ jsxs3(
    View,
    {
      style: [
        {
          backgroundColor: spec.fill,
          borderRadius: t.radius[radius],
          borderWidth: 1,
          borderColor: t.color.borderHairline
        },
        style
      ],
      children: [
        children,
        /* @__PURE__ */ jsx5(View, { style: { height: 0, opacity: granted ? 1 : 0 } })
      ]
    }
  );
}
function Card({
  children,
  elevated,
  style,
  theme
}) {
  const t = withTheme3(theme);
  return /* @__PURE__ */ jsx5(
    View,
    {
      style: [
        {
          borderRadius: t.radius.card,
          padding: t.space(4),
          marginBottom: t.space(3),
          backgroundColor: elevated ? t.color.elevated : t.glass.card.fill,
          borderWidth: elevated ? 0 : 1,
          borderColor: t.color.borderCard
        },
        style
      ],
      children
    }
  );
}
function Screen({ children, header, footer, overlay, padded = true, theme, title }) {
  const t = withTheme3(theme);
  const metrics = layoutMetrics(t);
  return /* @__PURE__ */ jsxs3(
    View,
    {
      accessibilityLabel: `${title} screen`,
      style: { flex: 1, backgroundColor: t.color.canvas, borderRadius: t.radius.phone, overflow: "hidden" },
      children: [
        /* @__PURE__ */ jsx5(Backdrop, { theme: t }),
        /* @__PURE__ */ jsx5(StatusStrip, { theme: t }),
        header,
        /* @__PURE__ */ jsx5(
          ScrollView,
          {
            style: { flex: 1 },
            contentContainerStyle: {
              paddingHorizontal: padded ? metrics.gutter : 0,
              paddingBottom: metrics.bottomInset
            },
            showsVerticalScrollIndicator: false,
            children
          }
        ),
        footer,
        overlay
      ]
    }
  );
}
function StatusStrip({ label = "9:41", theme }) {
  const t = withTheme3(theme);
  return /* @__PURE__ */ jsxs3(View, { style: { height: 44, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: t.space(6), paddingBottom: t.space(1) }, children: [
    /* @__PURE__ */ jsx5(Text2, { role: "micro", tone: "muted", theme: t, children: label }),
    /* @__PURE__ */ jsx5(Text2, { role: "micro", tone: "muted", theme: t, children: "\u25AE\u25AE\u25AE \u2301" })
  ] });
}
function Toolbar({
  title,
  subtitle,
  actions,
  theme
}) {
  const t = withTheme3(theme);
  return /* @__PURE__ */ jsxs3(
    View,
    {
      style: {
        minHeight: t.size.headerHeight,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: t.space(3),
        paddingHorizontal: t.space(4),
        paddingBottom: t.space(2)
      },
      children: [
        /* @__PURE__ */ jsxs3(View, { style: { flexShrink: 1 }, children: [
          /* @__PURE__ */ jsx5(Text2, { role: "headline", theme: t, children: title }),
          subtitle ? /* @__PURE__ */ jsx5(Text2, { role: "label", tone: "muted", theme: t, numberOfLines: 2, children: subtitle }) : null
        ] }),
        /* @__PURE__ */ jsx5(View, { style: { flexDirection: "row", alignItems: "center", gap: t.space(2) }, children: actions })
      ]
    }
  );
}
function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  theme,
  maxHeight = "86%"
}) {
  const t = withTheme3(theme);
  const { height } = useWindowDimensions();
  if (!open) return null;
  return /* @__PURE__ */ jsxs3(View, { style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end" }, children: [
    /* @__PURE__ */ jsx5(
      View,
      {
        accessible: true,
        accessibilityRole: "button",
        accessibilityLabel: `Dismiss ${title}`,
        onStartShouldSetResponder: () => true,
        onResponderRelease: onClose,
        style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.color.scrim, minHeight: t.size.touchTarget }
      }
    ),
    /* @__PURE__ */ jsxs3(
      GlassSurface,
      {
        layer: "sheet",
        radius: "sheet",
        theme: t,
        style: { maxHeight: height * parseInt(maxHeight, 10) / 100, paddingBottom: t.space(6) },
        children: [
          /* @__PURE__ */ jsx5(
            View,
            {
              accessible: true,
              accessibilityRole: "button",
              accessibilityLabel: `Close ${title}`,
              onStartShouldSetResponder: () => true,
              onResponderRelease: onClose,
              style: { height: t.size.touchTarget, alignItems: "center", justifyContent: "center" },
              children: /* @__PURE__ */ jsx5(View, { style: { width: 40, height: 4, borderRadius: t.radius.pill, backgroundColor: t.color.borderCard } })
            }
          ),
          /* @__PURE__ */ jsxs3(View, { style: { paddingHorizontal: t.space(4), paddingBottom: t.space(2) }, children: [
            /* @__PURE__ */ jsx5(Text2, { role: "title-lg", theme: t, children: title }),
            subtitle ? /* @__PURE__ */ jsx5(Text2, { role: "label", tone: "muted", theme: t, children: subtitle }) : null
          ] }),
          /* @__PURE__ */ jsx5(ScrollView, { contentContainerStyle: { paddingHorizontal: t.space(4) }, showsVerticalScrollIndicator: false, children })
        ]
      }
    )
  ] });
}
function HeroCarousel({
  slides,
  index,
  onIndexChange,
  theme
}) {
  const t = withTheme3(theme);
  const { width } = useWindowDimensions();
  const slideWidth = Math.min(width, 390) - t.space(8);
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  return /* @__PURE__ */ jsxs3(View, { style: { marginBottom: t.space(3) }, children: [
    /* @__PURE__ */ jsxs3(
      View,
      {
        style: {
          borderRadius: t.radius.hero,
          backgroundColor: t.color.anchor,
          padding: t.space(4),
          minHeight: 176,
          justifyContent: "space-between"
        },
        accessible: true,
        accessibilityRole: "summary",
        accessibilityLabel: `${slide.kicker}. ${slide.title}. ${slide.body}`,
        children: [
          /* @__PURE__ */ jsx5(Text2, { role: "micro", theme: t, style: { color: t.color.mutedOnAnchor }, children: slide.kicker }),
          /* @__PURE__ */ jsx5(Text2, { role: "headline", theme: t, style: { color: t.color.onAnchor }, children: slide.title }),
          /* @__PURE__ */ jsx5(Text2, { role: "label", theme: t, style: { color: t.color.mutedOnAnchor }, children: slide.body }),
          slide.stat ? /* @__PURE__ */ jsxs3(View, { style: { flexDirection: "row", alignItems: "baseline", gap: t.space(1) }, children: [
            /* @__PURE__ */ jsx5(Text2, { role: "display", theme: t, style: { color: t.color.onAnchor }, children: slide.stat.value }),
            slide.stat.unit ? /* @__PURE__ */ jsx5(Text2, { role: "title", theme: t, style: { color: t.color.onAnchor }, children: slide.stat.unit }) : null,
            /* @__PURE__ */ jsx5(Text2, { role: "label", theme: t, style: { color: t.color.mutedOnAnchor }, children: slide.stat.label })
          ] }) : null
        ]
      }
    ),
    /* @__PURE__ */ jsx5(View, { style: { flexDirection: "row", justifyContent: "center", gap: t.space(1), marginTop: t.space(2) }, children: slides.map((s, i) => /* @__PURE__ */ jsx5(
      View,
      {
        accessible: true,
        accessibilityRole: "button",
        accessibilityLabel: `Slide ${i + 1} of ${slides.length}: ${s.title}`,
        accessibilityState: { selected: i === index },
        onStartShouldSetResponder: () => true,
        onResponderRelease: () => onIndexChange(i),
        style: { width: t.size.touchTarget, height: t.size.touchTarget, alignItems: "center", justifyContent: "center" },
        children: /* @__PURE__ */ jsx5(
          View,
          {
            style: {
              width: i === index ? 18 : 7,
              height: 7,
              borderRadius: t.radius.pill,
              backgroundColor: i === index ? t.color.ink : t.color.borderCard
            }
          }
        )
      },
      s.id
    )) }),
    /* @__PURE__ */ jsx5(Text2, { role: "micro", tone: "muted", theme: t, center: true, children: `${index + 1} / ${slides.length} \xB7 swipe` }),
    /* @__PURE__ */ jsx5(Text2, { role: "micro", tone: "muted", theme: t, center: true, style: { width: 0, height: 0 }, children: slideWidth.toFixed(0) })
  ] });
}
function Sparkline({
  values,
  height = 64,
  label,
  theme
}) {
  const t = withTheme3(theme);
  const max = Math.max(...values, 1);
  return /* @__PURE__ */ jsx5(View, { accessible: true, accessibilityRole: "image", accessibilityLabel: label, style: { height, flexDirection: "row", alignItems: "flex-end", gap: t.space(1) }, children: values.map((value, i) => /* @__PURE__ */ jsx5(
    View,
    {
      style: {
        flex: 1,
        height: Math.max(3, value / max * (height - 8)),
        borderRadius: t.radius.xs,
        backgroundColor: t.color.inkMuted,
        opacity: i === values.length - 1 ? 1 : 0.55
      }
    },
    i
  )) });
}
function Ring({
  value,
  caption,
  size = 96,
  theme
}) {
  const t = withTheme3(theme);
  const clamped = Math.max(0, Math.min(1, value));
  return /* @__PURE__ */ jsxs3(View, { accessible: true, accessibilityRole: "progressbar", accessibilityLabel: caption, accessibilityValue: { now: Math.round(clamped * 100), min: 0, max: 100 }, style: { alignItems: "center", gap: t.space(1) }, children: [
    /* @__PURE__ */ jsxs3(
      View,
      {
        style: {
          width: size,
          height: size,
          borderRadius: t.radius.pill,
          borderWidth: 8,
          borderColor: t.glass.chip.fill,
          alignItems: "center",
          justifyContent: "center"
        },
        children: [
          /* @__PURE__ */ jsx5(
            View,
            {
              style: {
                position: "absolute",
                top: 8,
                width: size - 16,
                height: 6,
                borderRadius: t.radius.pill,
                backgroundColor: t.color.anchor,
                transform: [{ rotate: `${clamped * 360}deg` }]
              }
            }
          ),
          /* @__PURE__ */ jsx5(Text2, { role: "title-lg", theme: t, children: `${Math.round(clamped * 100)}%` })
        ]
      }
    ),
    /* @__PURE__ */ jsx5(Text2, { role: "micro", tone: "muted", theme: t, children: caption })
  ] });
}

// packages/ui/src/patterns.tsx
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
var withTheme4 = (theme) => theme ?? useTheme();
function PermissionPrimer({
  ask,
  onAllow,
  onDeny,
  theme
}) {
  const t = withTheme4(theme);
  return /* @__PURE__ */ jsxs4(View, { style: { flex: 1, padding: t.space(4), gap: t.space(3), justifyContent: "center" }, children: [
    /* @__PURE__ */ jsx6(Text2, { role: "display", theme: t, children: `Usage access for Mirror` }),
    /* @__PURE__ */ jsxs4(Card, { theme: t, children: [
      /* @__PURE__ */ jsx6(Text2, { role: "body", theme: t, children: ask.systemName }),
      /* @__PURE__ */ jsx6(Divider, { theme: t }),
      /* @__PURE__ */ jsxs4(View, { style: { gap: t.space(2) }, children: [
        /* @__PURE__ */ jsxs4(View, { style: { flexDirection: "row", gap: t.space(2), alignItems: "flex-start" }, children: [
          /* @__PURE__ */ jsx6(TierBadge, { tier: "D", theme: t }),
          /* @__PURE__ */ jsx6(Text2, { role: "label", theme: t, style: { flex: 1 }, children: ask.sees })
        ] }),
        /* @__PURE__ */ jsxs4(View, { style: { flexDirection: "row", gap: t.space(2), alignItems: "flex-start" }, children: [
          /* @__PURE__ */ jsx6(TierBadge, { tier: "\u2014", ghost: true, theme: t }),
          /* @__PURE__ */ jsx6(Text2, { role: "label", tone: "muted", theme: t, style: { flex: 1 }, children: ask.cannotSee })
        ] })
      ] }),
      /* @__PURE__ */ jsx6(Divider, { theme: t }),
      /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: "muted", theme: t, children: `You can revoke this in ${ask.settingsPath} at any time; nothing is collected after that.` })
    ] }),
    /* @__PURE__ */ jsx6(Pill, { onPress: onAllow, theme: t, children: "Open Android settings" }),
    /* @__PURE__ */ jsx6(View, { style: { alignItems: "center" }, children: /* @__PURE__ */ jsx6(LinkButton, { onPress: onDeny, theme: t, children: "Not now" }) }),
    /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: "muted", theme: t, center: true, children: "Mirror keeps working without it \u2014 it just has nothing to show." })
  ] });
}
function WhySheet({
  score,
  maxScore,
  components,
  caveat,
  theme
}) {
  const t = withTheme4(theme);
  const sum = components.reduce((total, c) => total + c.points, 0);
  const consistent = Math.abs(sum - score) < 1e-6;
  const max = Math.max(...components.map((c) => Math.abs(c.points)), 1);
  return /* @__PURE__ */ jsxs4(View, { style: { gap: t.space(3) }, children: [
    /* @__PURE__ */ jsxs4(View, { style: { flexDirection: "row", alignItems: "baseline", gap: t.space(2) }, children: [
      /* @__PURE__ */ jsx6(Text2, { role: "display", theme: t, children: String(Math.round(score)) }),
      /* @__PURE__ */ jsx6(Text2, { role: "label", tone: "muted", theme: t, children: `/ ${maxScore}` })
    ] }),
    /* @__PURE__ */ jsx6(View, { style: { gap: t.space(2) }, children: components.map((c) => /* @__PURE__ */ jsxs4(View, { style: { gap: t.space(1) }, children: [
      /* @__PURE__ */ jsxs4(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space(2) }, children: [
        /* @__PURE__ */ jsxs4(View, { style: { flexDirection: "row", alignItems: "center", gap: t.space(2), flexShrink: 1 }, children: [
          /* @__PURE__ */ jsx6(TierBadge, { tier: c.tier, ghost: true, theme: t }),
          /* @__PURE__ */ jsx6(Text2, { role: "label", theme: t, children: c.label })
        ] }),
        /* @__PURE__ */ jsx6(Text2, { role: "label", theme: t, style: { fontWeight: "600" }, children: `${c.points >= 0 ? "+" : ""}${c.points.toFixed(1)}` })
      ] }),
      /* @__PURE__ */ jsx6(View, { style: { height: 6, borderRadius: t.radius.pill, backgroundColor: t.glass.chip.fill, overflow: "hidden" }, children: /* @__PURE__ */ jsx6(
        View,
        {
          style: {
            width: `${Math.min(100, Math.abs(c.points) / max * 100)}%`,
            height: "100%",
            borderRadius: t.radius.pill,
            backgroundColor: c.points < 0 ? t.color.inkMuted : t.color.anchor
          }
        }
      ) }),
      c.note ? /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: "muted", theme: t, children: c.note }) : null
    ] }, c.label)) }),
    /* @__PURE__ */ jsx6(Callout, { theme: t, tone: consistent ? "neutral" : "limit", children: consistent ? caveat : `These parts do not add up to the score (${sum.toFixed(1)} vs ${score.toFixed(1)}). That is a bug, not a rounding choice \u2014 please report it.` })
  ] });
}
function CapabilityMatrix({
  available,
  rows,
  theme
}) {
  const t = withTheme4(theme);
  return /* @__PURE__ */ jsxs4(View, { style: { gap: t.space(3) }, children: [
    /* @__PURE__ */ jsx6(SectionHeader, { title: "What Mirror can see", caption: "Tier A API \xB7 B export \xB7 C extension \xB7 D OS usage", theme: t }),
    rows.map((row) => /* @__PURE__ */ jsx6(
      ListRow,
      {
        leading: /* @__PURE__ */ jsx6(TierBadge, { tier: row.tier, ghost: !row.connected, theme: t }),
        title: row.label,
        meta: row.note,
        trailing: /* @__PURE__ */ jsx6(Text2, { role: "label", theme: t, style: { fontWeight: "700", color: row.connected ? t.color.ink : t.color.inkMuted }, children: row.connected ? "yes" : "no" }),
        theme: t
      },
      row.label
    )),
    /* @__PURE__ */ jsx6(Divider, { theme: t }),
    /* @__PURE__ */ jsx6(SectionHeader, { title: "What Mirror will not do", caption: "Impossible without the techniques Mirror refuses to use", theme: t }),
    IMPOSSIBLE.map((row) => /* @__PURE__ */ jsx6(
      ListRow,
      {
        leading: /* @__PURE__ */ jsx6(TierBadge, { tier: row.tier, ghost: true, theme: t }),
        title: row.label,
        meta: row.reason,
        theme: t
      },
      row.label
    )),
    /* @__PURE__ */ jsx6(Callout, { theme: t, children: `Connected tiers on this device: ${available.length ? available.slice().sort().join(" + ") : "none"}. Anything marked no is shown as unavailable rather than estimated.` })
  ] });
}
function PrivacyReceipt({
  periodLabel,
  rows,
  zeroCopy,
  onExport,
  theme
}) {
  const t = withTheme4(theme);
  return /* @__PURE__ */ jsxs4(View, { style: { gap: t.space(3) }, children: [
    /* @__PURE__ */ jsx6(SectionHeader, { title: `Privacy receipt \xB7 ${periodLabel}`, caption: "Generated from the on-device network log", theme: t }),
    /* @__PURE__ */ jsx6(View, { style: { flexDirection: "row", gap: t.space(3) }, children: rows.slice(0, 2).map((row) => /* @__PURE__ */ jsx6(Card, { theme: t, style: { flex: 1 }, children: /* @__PURE__ */ jsx6(Stat, { value: row.value, label: row.label, hint: row.detail, theme: t }) }, row.label)) }),
    rows.slice(2).map((row) => /* @__PURE__ */ jsx6(ListRow, { title: row.label, meta: row.detail, trailing: /* @__PURE__ */ jsx6(Text2, { role: "label", theme: t, children: row.value }), theme: t }, row.label)),
    /* @__PURE__ */ jsx6(Callout, { theme: t, tone: "limit", children: zeroCopy }),
    onExport ? /* @__PURE__ */ jsx6(Pill, { variant: "secondary", onPress: onExport, theme: t, children: "Export the raw log" }) : null
  ] });
}
function DegradedNotice({
  needs,
  available,
  feature,
  actions,
  theme
}) {
  const t = withTheme4(theme);
  const result = degrade(available, needs, feature);
  if (result.ok) return null;
  return /* @__PURE__ */ jsxs4(Card, { theme: t, children: [
    /* @__PURE__ */ jsx6(
      EmptyState,
      {
        title: `${feature} is unavailable`,
        body: result.message,
        action: /* @__PURE__ */ jsx6(View, { style: { flexDirection: "row", gap: t.space(2), flexWrap: "wrap", justifyContent: "center" }, children: actions }),
        theme: t
      }
    ),
    /* @__PURE__ */ jsx6(View, { style: { flexDirection: "row", gap: t.space(1), justifyContent: "center" }, children: result.missing.map((tier) => /* @__PURE__ */ jsx6(TierBadge, { tier, theme: t }, tier)) }),
    /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: "muted", theme: t, center: true, style: { marginTop: t.space(2) }, children: `${TIERS[result.missing[0]].name}: ${TIERS[result.missing[0]].how}` })
  ] });
}
function DataStanding({
  tiers,
  onPress,
  theme
}) {
  const t = withTheme4(theme);
  return /* @__PURE__ */ jsxs4(View, { style: { paddingHorizontal: t.space(4), paddingBottom: t.space(2) }, children: [
    /* @__PURE__ */ jsx6(ConfidenceChip, { tiers, onPress, theme: t }),
    /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: "muted", theme: t, style: { marginTop: t.space(1) }, children: "Tap to see exactly what each source can and cannot provide." })
  ] });
}
function AskComposer({
  value,
  onChange,
  onSubmit,
  suggestions,
  canAnswer,
  blockedReason,
  theme
}) {
  const t = withTheme4(theme);
  return /* @__PURE__ */ jsxs4(View, { style: { gap: t.space(3) }, children: [
    /* @__PURE__ */ jsxs4(Card, { theme: t, children: [
      /* @__PURE__ */ jsx6(Text2, { role: "label", tone: "muted", theme: t, children: "Answers are computed on this device. Nothing is sent anywhere, and Mirror says so when it cannot answer." }),
      /* @__PURE__ */ jsx6(
        View,
        {
          style: {
            marginTop: t.space(3),
            minHeight: t.size.touchTarget,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.color.borderCard,
            backgroundColor: t.glass.chip.fill,
            paddingHorizontal: t.space(3),
            justifyContent: "center"
          },
          accessible: true,
          accessibilityRole: "text",
          accessibilityLabel: `Your question: ${value || "empty"}`,
          children: /* @__PURE__ */ jsx6(Text2, { role: "body", tone: value ? "core" : "muted", theme: t, children: value || "How much of my week was intentional?" })
        }
      )
    ] }),
    /* @__PURE__ */ jsx6(View, { style: { flexDirection: "row", gap: t.space(2), flexWrap: "wrap" }, children: suggestions.map((s) => /* @__PURE__ */ jsx6(Chip, { label: s, onPress: () => onChange(s), theme: t }, s)) }),
    canAnswer ? /* @__PURE__ */ jsx6(Pill, { onPress: onSubmit, theme: t, children: "Answer from this device" }) : /* @__PURE__ */ jsx6(Callout, { theme: t, tone: "limit", children: blockedReason ?? "There is not enough history on this device to answer without guessing." })
  ] });
}
function WidgetPreview({
  size,
  variant,
  title,
  value,
  caption,
  bars,
  theme
}) {
  const t = withTheme4(theme);
  const width = size === "small" ? 158 : 330;
  return /* @__PURE__ */ jsxs4(
    View,
    {
      accessible: true,
      accessibilityRole: "summary",
      accessibilityLabel: `${size} widget, ${variant}. ${title}: ${value}. ${caption}`,
      style: {
        width,
        height: 158,
        borderRadius: t.radius.card,
        backgroundColor: variant === "public" ? t.color.anchor : t.color.card,
        borderWidth: 1,
        borderColor: t.color.borderCard,
        padding: t.space(4),
        justifyContent: "space-between"
      },
      children: [
        /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: variant === "public" ? "onAnchor" : "muted", theme: t, children: `${title} \xB7 ${variant === "public" ? "Public" : "Private"}` }),
        /* @__PURE__ */ jsx6(Text2, { role: size === "small" ? "headline" : "display", tone: variant === "public" ? "onAnchor" : "core", theme: t, children: value }),
        bars ? /* @__PURE__ */ jsx6(View, { style: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28 }, children: bars.map((b, i) => /* @__PURE__ */ jsx6(
          View,
          {
            style: {
              flex: 1,
              height: Math.max(2, b * 26),
              borderRadius: t.radius.xs,
              backgroundColor: variant === "public" ? t.color.onAnchor : t.color.inkMuted,
              opacity: 0.7
            }
          },
          i
        )) }) : null,
        /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: variant === "public" ? "onAnchor" : "muted", theme: t, numberOfLines: 2, children: caption })
      ]
    }
  );
}
function FactList({ items, theme }) {
  const t = withTheme4(theme);
  return /* @__PURE__ */ jsx6(View, { children: items.map((item, i) => /* @__PURE__ */ jsxs4(View, { children: [
    /* @__PURE__ */ jsx6(ListRow, { title: item.label, meta: item.detail, trailing: /* @__PURE__ */ jsx6(Text2, { role: "label", theme: t, children: item.value }), theme: t }),
    i < items.length - 1 ? /* @__PURE__ */ jsx6(Divider, { theme: t }) : null
  ] }, item.label)) });
}

// packages/ui/screens/index.tsx
import * as React2 from "react";
import { Fragment, jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
var baseConnected = [
  { label: "Per-app foreground time, launches, timestamps", tier: "D", connected: true, note: "Android Usage access. Automatic after one grant." },
  { label: "App category", tier: "D", connected: true, note: "Coarse label from the operating system." },
  { label: "Watch completion, searches, scroll depth", tier: "C", connected: false, note: "Desktop browser extension, allow-listed sites only." },
  { label: "Watch history, search history", tier: "A", connected: false, note: "The YouTube Data API has no watch-history endpoint. Use your Takeout export." },
  { label: "Saved items, subscriptions, communities", tier: "A", connected: false, note: "Reddit and Twitch OAuth, narrowest scopes." },
  { label: "Instagram and Amazon history", tier: "B", connected: false, note: "No consumer history API. Import your own export." }
];
var PERSONAS = [
  {
    id: "ananya",
    name: "Ananya",
    blurb: "Student, tier D only \u2014 the baseline case: usage data and nothing else.",
    tiers: ["D"],
    connected: baseConnected.map((c) => c.tier === "D" ? { ...c, connected: true } : c),
    weeklyMinutes: [96, 118, 104, 132, 121, 88, 76],
    intentionalShare: 0.46,
    topics: [],
    sessions: [
      { app: "YouTube", topic: "\u2014", minutes: 42, kind: "habit", intent: "Mindless" },
      { app: "Instagram", topic: "\u2014", minutes: 27, kind: "habit", intent: "Mindless" },
      { app: "WhatsApp", topic: "\u2014", minutes: 19, kind: "deep", intent: "Intentional" },
      { app: "Chrome", topic: "\u2014", minutes: 12, kind: "deep", intent: "Intentional" }
    ],
    budgets: [
      { label: "Short video", target: 60, actual: 96, unit: "min/day" },
      { label: "Social feed", target: 45, actual: 38, unit: "min/day" }
    ],
    traits: [
      { label: "Evening-heavy use", value: "64% after 8 pm", evidence: "Foreground time by hour, tier D, 14 days." },
      { label: "Frequent switching", value: "38 app switches/hour", evidence: "Launch timestamps, tier D." }
    ],
    askable: ["How much of my week was intentional?", "When do I switch apps most?"]
  },
  {
    id: "rehan",
    name: "Rehan",
    blurb: "Creator, tiers D + B + C \u2014 usage plus an imported export and the browser extension.",
    tiers: ["D", "C", "B"],
    connected: baseConnected.map((c) => c.tier === "D" || c.tier === "C" || c.tier === "B" ? { ...c, connected: true } : c),
    weeklyMinutes: [112, 96, 128, 141, 118, 104, 92],
    intentionalShare: 0.61,
    topics: [
      { name: "Film photography", depth: 78, hours: 4.2, trend: 14, tier: "B+C", firstSeen: "6 weeks ago" },
      { name: "Rust programming", depth: 64, hours: 2.6, trend: 8, tier: "C", firstSeen: "3 weeks ago" },
      { name: "Urban gardening", depth: 41, hours: 1.1, trend: -6, tier: "B", firstSeen: "11 weeks ago" }
    ],
    sessions: [
      { app: "YouTube", topic: "Film photography", minutes: 46, kind: "deep", intent: "Intentional" },
      { app: "Reddit", topic: "Rust programming", minutes: 24, kind: "deep", intent: "Intentional" },
      { app: "YouTube", topic: "Shorts", minutes: 38, kind: "habit", intent: "Mindless" },
      { app: "Instagram", topic: "\u2014", minutes: 22, kind: "habit", intent: "Mindless" }
    ],
    budgets: [
      { label: "Short video", target: 30, actual: 38, unit: "min/day" },
      { label: "Social feed", target: 30, actual: 22, unit: "min/day" },
      { label: "Deep reading", target: 45, actual: 51, unit: "min/day" }
    ],
    traits: [
      { label: "Deliberate starter", value: "3 of 4 topics began from a search", evidence: "First-seen events, tier C search terms and tier B history." },
      { label: "Shallow tail", value: "22% of short-video sessions end under 8s", evidence: "Session length distribution, tier C." }
    ],
    askable: ["Which topic grew the most this month?", "How deep was my film photography reading?"]
  },
  {
    id: "mei",
    name: "Mei",
    blurb: "Researcher, all four tiers \u2014 the fullest picture Mirror can honestly build.",
    tiers: ["D", "C", "B", "A"],
    connected: baseConnected.map((c) => ({ ...c, connected: true })),
    weeklyMinutes: [88, 92, 76, 104, 96, 71, 64],
    intentionalShare: 0.72,
    topics: [
      { name: "Astronomy", depth: 81, hours: 5.1, trend: 9, tier: "A+C", firstSeen: "9 weeks ago" },
      { name: "Urban gardening", depth: 66, hours: 3.4, trend: 3, tier: "B", firstSeen: "14 weeks ago" },
      { name: "Rust programming", depth: 58, hours: 2.2, trend: -4, tier: "C", firstSeen: "5 weeks ago" },
      { name: "Film photography", depth: 37, hours: 0.8, trend: 12, tier: "B", firstSeen: "2 weeks ago" }
    ],
    sessions: [
      { app: "Chrome", topic: "Astronomy", minutes: 52, kind: "deep", intent: "Intentional" },
      { app: "Twitch", topic: "Astronomy live", minutes: 61, kind: "deep", intent: "Intentional" },
      { app: "Reddit", topic: "Urban gardening", minutes: 18, kind: "deep", intent: "Intentional" },
      { app: "Instagram", topic: "Film photography", minutes: 27, kind: "habit", intent: "Mindless" }
    ],
    budgets: [
      { label: "Short video", target: 20, actual: 12, unit: "min/day" },
      { label: "Social feed", target: 25, actual: 27, unit: "min/day" },
      { label: "Deep reading", target: 60, actual: 74, unit: "min/day" }
    ],
    traits: [
      { label: "Long-form preference", value: "Average session 24 minutes", evidence: "Session lengths across tiers A/B/C/D." },
      { label: "Low late-night use", value: "8% after 11 pm", evidence: "Timestamps, tier D." }
    ],
    askable: ["What did I learn about this month?", "Which sources did I actually open?"]
  }
];
var HERO = (p) => [
  {
    id: "week",
    kicker: "This week",
    title: `${duration(p.weeklyMinutes.reduce((a, b) => a + b, 0))} on screen`,
    body: `${Math.round(p.intentionalShare * 100)}% of it was deliberate, by your own labels and session length.`,
    stat: { value: duration(p.weeklyMinutes[6] ?? 0).replace(/\D+$/, ""), unit: duration(p.weeklyMinutes[6] ?? 0).replace(/^[\d]+/, ""), label: "today" }
  },
  {
    id: "shift",
    kicker: "Shift",
    title: "Evenings are getting lighter",
    body: "After-8pm use is down 18% against your four-week median. No nudge was sent to make that happen."
  },
  {
    id: "habit",
    kicker: "Habit",
    title: "Short video is your largest habit block",
    body: "38% of habit minutes fall after 11pm. Neutral observation, no streak, no reminder unless you ask for one."
  }
];
function NothingYet({
  theme,
  needs,
  available,
  feature,
  actionLabel = "Explain what Mirror needs"
}) {
  return /* @__PURE__ */ jsx7(
    DegradedNotice,
    {
      theme,
      needs,
      available,
      feature,
      actions: /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: actionLabel })
    }
  );
}
var TABS = [
  { id: "home", label: "Home" },
  { id: "insights", label: "Insights" },
  { id: "journey", label: "Journey" },
  { id: "sessions", label: "Sessions" },
  { id: "you", label: "You" }
];
function OnboardingScreen({ theme }) {
  const promises = [
    { title: "Your history stays on this phone", body: "Titles, searches and timestamps are stored and analysed locally, encrypted." },
    { title: "Two profiles, never merged", body: "Private holds everything. Public holds only the topics you pick, one by one. Nothing is copied across." },
    { title: "No streaks, no guilt, no dark patterns", body: "Mirror exists to reduce mindless use. It will not nudge you to come back." }
  ];
  return /* @__PURE__ */ jsx7(Screen, { title: "Onboarding", theme, padded: true, children: /* @__PURE__ */ jsxs5(View, { style: { paddingTop: theme.space(6), gap: theme.space(4) }, children: [
    /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: "MIRROR" }),
    /* @__PURE__ */ jsx7(Text2, { role: "display", theme, children: `See how you actually use your phone` }),
    /* @__PURE__ */ jsx7(Text2, { role: "body", tone: "muted", theme, children: `Mirror shows the quality of your attention, not just the hours. It runs on this device and never asks you to log anything by hand.` }),
    promises.map((p) => /* @__PURE__ */ jsxs5(Card, { theme, children: [
      /* @__PURE__ */ jsx7(Text2, { role: "title", theme, children: p.title }),
      /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: p.body })
    ] }, p.title)),
    /* @__PURE__ */ jsx7(Pill, { theme, children: "Continue" }),
    /* @__PURE__ */ jsx7(View, { style: { alignItems: "center" }, children: /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Explore with demo data" }) })
  ] }) });
}
function PermissionPrimerScreen({ theme }) {
  return /* @__PURE__ */ jsx7(Screen, { title: "Permission primer", theme, padded: true, children: /* @__PURE__ */ jsx7(
    PermissionPrimer,
    {
      theme,
      ask: {
        systemName: "Usage access \xB7 Settings \u2192 Apps \u2192 Special access \u2192 Usage access \u2192 Mirror",
        sees: "How long you use each app and when you open them \u2014 foreground time, launches, timestamps.",
        cannotSee: "What is inside those apps. No content, no messages, no notifications. Mirror never reads them.",
        settingsPath: "Android settings \u2192 Special access \u2192 Usage access"
      },
      onAllow: () => void 0,
      onDeny: () => void 0
    }
  ) });
}
function HomeScreen({ theme, persona, state = "default" }) {
  const [hero, setHero] = React2.useState(0);
  const empty = state === "empty";
  const slides = HERO(persona);
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Home",
      theme,
      padded: false,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: `Good evening, ${persona.name}`,
          subtitle: empty ? "Nothing collected yet" : `Week of ${tierSummary(persona.tiers)} data`,
          actions: /* @__PURE__ */ jsxs5(Fragment, { children: [
            /* @__PURE__ */ jsx7(IconButton, { label: "Search your own data", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u2315" }) }),
            /* @__PURE__ */ jsx7(IconButton, { label: "Profile and settings", theme, badge: true, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: persona.name.slice(0, 1) }) })
          ] })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { paddingHorizontal: theme.space(4), gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(
          BoundaryToggle,
          {
            theme,
            value: "private",
            onChange: () => void 0,
            consequence: "Private. Only your selections are ever shared \u2014 nothing else leaves this phone."
          }
        ),
        /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx7(Chip, { label: "Range", value: "This week", theme }),
          /* @__PURE__ */ jsx7(Chip, { label: "App", value: "All", theme }),
          /* @__PURE__ */ jsx7(Chip, { label: "Topic", value: persona.topics[0]?.name ?? "All", theme })
        ] }),
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx7(Card, { theme, children: /* @__PURE__ */ jsx7(
          EmptyState,
          {
            title: "No usage data yet",
            body: "Mirror has nothing to show until Android usage access is granted. It will not fill the gap with estimates.",
            action: /* @__PURE__ */ jsx7(Pill, { theme, children: "Explain what it can see" }),
            theme
          }
        ) }) : /* @__PURE__ */ jsxs5(Fragment, { children: [
          /* @__PURE__ */ jsx7(HeroCarousel, { theme, slides, index: hero, onIndexChange: setHero }),
          /* @__PURE__ */ jsxs5(Card, { theme, children: [
            /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Last 7 days", caption: hedged(duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0)), "D", "duration") }),
            /* @__PURE__ */ jsx7(Sparkline, { theme, values: persona.weeklyMinutes, label: `Daily screen time for 7 days, ${persona.weeklyMinutes.join(", ")} minutes` }),
            /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row", justifyContent: "space-between", marginTop: theme.space(2) }, children: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: d }, d)) })
          ] }),
          /* @__PURE__ */ jsxs5(Card, { theme, children: [
            /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Attention budget", caption: "soft limits, no streaks" }),
            persona.budgets.map((b) => /* @__PURE__ */ jsx7(View, { style: { marginBottom: theme.space(3) }, children: /* @__PURE__ */ jsx7(
              Meter,
              {
                theme,
                value: b.target / Math.max(b.actual, b.target),
                label: b.label,
                caption: `${b.actual} / ${b.target} ${b.unit}`,
                tone: b.actual > b.target ? "muted" : "anchor"
              }
            ) }, b.label)),
            /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Adjust a budget" })
          ] }),
          /* @__PURE__ */ jsxs5(Card, { theme, children: [
            /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Learning arcs", caption: "topics you are going deeper on" }),
            persona.topics.length === 0 ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["A", "B", "C"], available: persona.tiers, feature: "Topic arcs", actionLabel: "Import an export" }) : persona.topics.slice(0, 3).map((topic) => /* @__PURE__ */ jsx7(
              ListRow,
              {
                theme,
                leading: /* @__PURE__ */ jsx7(TierBadge, { tier: topic.tier[0] ?? "D", ghost: true, theme }),
                title: topic.name,
                meta: `${topic.hours}h \xB7 first seen ${topic.firstSeen}`,
                trailing: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, style: { fontWeight: "600" }, children: `${topic.depth}` })
              },
              topic.name
            ))
          ] })
        ] })
      ] })
    }
  );
}
function InsightsScreen({ theme, persona, state = "default" }) {
  const [open, setOpen] = React2.useState(false);
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Insights",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Insights", subtitle: "Descriptive, never diagnostic" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      overlay: /* @__PURE__ */ jsx7(Sheet, { theme, open, title: "Why this depth score", subtitle: "Every component, with its source tier", onClose: () => setOpen(false), children: /* @__PURE__ */ jsx7(
        WhySheet,
        {
          theme,
          score: 78,
          maxScore: 100,
          caveat: "Depth is an estimate built from session length, completion and return visits. It describes behaviour, not understanding.",
          components: [
            { label: "Median session length", points: 26.4, tier: "D", note: "Foreground time per session, 14-day median." },
            { label: "Completion rate", points: 22.1, tier: "C", note: "Watch completion from the browser extension." },
            { label: "Return visits", points: 18.7, tier: "B", note: "Imported history: distinct days." },
            { label: "Cross-source corroboration", points: 10.8, tier: "A", note: "Same topic seen in an official API and in usage." }
          ]
        }
      ) }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Quality of attention", caption: "this week" }),
          /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(4), alignItems: "center" }, children: [
            /* @__PURE__ */ jsx7(Ring, { theme, value: persona.intentionalShare, caption: "intentional" }),
            /* @__PURE__ */ jsxs5(View, { style: { flex: 1, gap: theme.space(2) }, children: [
              /* @__PURE__ */ jsx7(Stat, { theme, value: `${Math.round(persona.intentionalShare * 100)}%`, label: "Deliberate sessions", hint: hedged("from session length and your labels", "D") }),
              /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: `${duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))} total, ${persona.sessions.filter((s) => s.kind === "habit").reduce((a, s) => a + s.minutes, 0)}m in habit loops.` })
            ] })
          ] })
        ] }),
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "Insights" }) : /* @__PURE__ */ jsxs5(Fragment, { children: [
          /* @__PURE__ */ jsxs5(Card, { theme, children: [
            /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Patterns", caption: "stated, then evidenced" }),
            persona.traits.map((trait) => /* @__PURE__ */ jsxs5(View, { style: { marginBottom: theme.space(3) }, children: [
              /* @__PURE__ */ jsx7(Text2, { role: "title", theme, children: trait.label }),
              /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: trait.value }),
              /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: trait.evidence })
            ] }, trait.label))
          ] }),
          /* @__PURE__ */ jsxs5(Card, { theme, children: [
            /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Deepest topic", caption: persona.topics[0]?.name ?? "needs topic data" }),
            persona.topics.length ? /* @__PURE__ */ jsxs5(Fragment, { children: [
              /* @__PURE__ */ jsx7(Stat, { theme, value: String(persona.topics[0]?.depth), label: "depth score", hint: "0\u2013100, descriptive estimate" }),
              /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3) }, children: [
                /* @__PURE__ */ jsx7(LinkButton, { theme, onPress: () => setOpen(true), children: "Why this score" }),
                /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Label a session" })
              ] })
            ] }) : /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["A", "B", "C"], available: persona.tiers, feature: "Depth scoring", actionLabel: "Import an export" })
          ] })
        ] })
      ] })
    }
  );
}
function JourneyScreen({ theme, persona }) {
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Journey",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: "Journey",
          subtitle: "Where your curiosity went",
          actions: /* @__PURE__ */ jsx7(IconButton, { label: "Journey options: range and sources", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        persona.topics.length === 0 ? /* @__PURE__ */ jsx7(
          DegradedNotice,
          {
            theme,
            needs: ["A", "B", "C"],
            available: persona.tiers,
            feature: "Interest evolution",
            actions: /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Import an export" })
          }
        ) : /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Interest evolution", caption: "first seen, then depth over time" }),
          persona.topics.map((topic) => /* @__PURE__ */ jsxs5(View, { style: { marginBottom: theme.space(4) }, children: [
            /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsx7(Text2, { role: "title", theme, children: topic.name }),
              /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: `${topic.trend > 0 ? "+" : ""}${topic.trend}%` })
            ] }),
            /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row", gap: 3, marginTop: theme.space(2), height: 32, alignItems: "flex-end" }, children: Array.from({ length: 12 }).map((_, i) => /* @__PURE__ */ jsx7(
              View,
              {
                style: {
                  flex: 1,
                  height: Math.max(3, topic.depth / 100 * (i / 11) * 32 + (i > 8 ? topic.depth / 6 : 0)),
                  borderRadius: theme.radius.xs,
                  backgroundColor: i > 8 ? theme.color.anchor : theme.color.inkMuted,
                  opacity: i > 8 ? 1 : 0.5
                }
              },
              i
            )) }),
            /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: `first seen ${topic.firstSeen} \xB7 ${tierSummary(topic.tier.split("+"))} \xB7 ${topic.hours}h this month` }),
            /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row", marginTop: theme.space(2) }, children: /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Open the sessions behind this" }) })
          ] }, topic.name))
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "What changed this month" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "New topics", value: String(persona.topics.length ? 1 : 0), detail: "First seen in the last 30 days." },
                { label: "Faded topics", value: String(persona.topics.filter((t) => t.trend < 0).length), detail: "No session in 21 days." },
                { label: "Sources behind this", value: tierSummary(persona.tiers) }
              ]
            }
          )
        ] })
      ] })
    }
  );
}
function SessionsScreen({ theme, persona, state = "default" }) {
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Sessions",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Sessions", subtitle: "Longest first. Labels train the local model." }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "Sessions", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsx7(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: persona.sessions.map((s, i) => /* @__PURE__ */ jsxs5(View, { children: [
          /* @__PURE__ */ jsx7(
            ListRow,
            {
              theme,
              leading: /* @__PURE__ */ jsx7(TierBadge, { tier: s.topic === "\u2014" ? "D" : "C", ghost: true, theme }),
              title: `${s.app} \xB7 ${duration(s.minutes)}`,
              meta: `${s.topic} \xB7 ${s.kind === "deep" ? "deep session" : "habit loop"}`,
              trailing: /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), alignItems: "center" }, children: [
                /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: s.intent }),
                /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Change" })
              ] })
            }
          ),
          i < persona.sessions.length - 1 ? /* @__PURE__ */ jsx7(Divider, { theme }) : null
        ] }, `${s.app}-${i}`)) }),
        /* @__PURE__ */ jsx7(Callout, { theme, tone: "limit", children: persona.tiers.includes("C") ? "Session labels stay on this device and are used to score your own sessions, never to train anything shared." : "Without the browser extension Mirror cannot see what a session was about \u2014 only that it happened, and for how long." })
      ] })
    }
  );
}
function DiscoveryScreen({ theme, persona, state = "default" }) {
  const rabbit = persona.sessions.filter((s) => s.kind === "habit");
  const minutes = rabbit.reduce((a, s) => a + s.minutes, 0);
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Discovery",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: "Discovery",
          subtitle: "Exploration vs. exploitation",
          actions: /* @__PURE__ */ jsx7(IconButton, { label: "Discovery options: what counts as a rabbit hole", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "Rabbit-hole detection", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs5(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Rabbit holes", caption: "definition shown, not implied" }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: "A rabbit hole here is three or more consecutive short sessions on the same app with no search, no save and no cross-app follow-up." }),
          /* @__PURE__ */ jsx7(Divider, { theme }),
          rabbit.length === 0 ? /* @__PURE__ */ jsx7(EmptyState, { theme, title: "No rabbit holes this week", body: "Nothing met the definition. That is a real result, not a missing signal." }) : /* @__PURE__ */ jsxs5(Fragment, { children: [
            /* @__PURE__ */ jsx7(Stat, { theme, value: duration(minutes), label: "in habit loops this week", hint: `${rabbit.length} sessions met the definition` }),
            /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row", marginTop: theme.space(3) }, children: /* @__PURE__ */ jsxs5(LinkButton, { theme, children: [
              "Show the ",
              rabbit.length,
              " sessions"
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Exploration this week" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "New topics opened", value: persona.tiers.includes("A") || persona.tiers.includes("B") ? "4" : "unavailable", detail: "Needs topic-level data (A/B/C)." },
                { label: "Searches started", value: persona.tiers.includes("C") ? "11" : "unavailable", detail: "From the browser extension on allow-listed sites." },
                { label: "Top app by time", value: persona.sessions[0]?.app ?? "\u2014", detail: "Tier D foreground time." }
              ]
            }
          )
        ] })
      ] })
    }
  );
}
function WhatIfScreen({ theme, persona, state = "default" }) {
  const baseline = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  const scenarios = [
    { label: "Remove short video", delta: -0.18, note: "Assumes the minutes are not replaced by another app \u2014 they usually are, partially." },
    { label: "Cap feed sessions at 10 min", delta: -0.11, note: "Applied to sessions longer than the cap, using your own distribution." },
    { label: "Enable quiet hours 22:00\u201307:00", delta: -0.07, note: "Counts only usage inside the window." }
  ];
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "What if",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: "What if",
          subtitle: "Computed on this device from your own history",
          actions: /* @__PURE__ */ jsx7(IconButton, { label: "What-if options: change the scenarios", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "What-if scenarios", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs5(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: `Baseline: ${duration(baseline)}`, caption: "last 7 days" }),
          scenarios.map((s) => /* @__PURE__ */ jsxs5(View, { style: { marginBottom: theme.space(3) }, children: [
            /* @__PURE__ */ jsx7(Meter, { theme, value: 1 + s.delta, label: s.label, caption: `${Math.round(s.delta * 100)}%` }),
            /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: s.note }),
            /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Change this scenario" })
          ] }, s.label))
        ] }),
        /* @__PURE__ */ jsx7(Callout, { theme, tone: "limit", children: "What-if is a calculation over your history, not a prediction. Mirror does not forecast behaviour and does not turn these into goals on your behalf." })
      ] })
    }
  );
}
function FocusScreen({ theme }) {
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Focus",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Focus windows", subtitle: "You choose; Mirror only reminds you of your own choice" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Scheduled", caption: "local notifications only" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "Weekday deep work", value: "09:00\u201311:30", detail: "Announces at the start; never counts down, never nags." },
                { label: "Quiet hours", value: "22:30\u201307:00", detail: "Notifications are suppressed; collection continues locally." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "How it behaves" }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: "A focus window does not block apps and does not shame you when you leave it. It shows one line when you return and nothing else. You can delete the window in one tap." }),
          /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3) }, children: [
            /* @__PURE__ */ jsx7(Pill, { theme, variant: "secondary", children: "Add a window" }),
            /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Remove all" })
          ] })
        ] }),
        /* @__PURE__ */ jsx7(Callout, { theme, children: "Focus windows are tier D only: they need nothing but timestamps, and work with no network and no account." })
      ] })
    }
  );
}
function ProfileScreen({ theme, persona, state = "default" }) {
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Behaviour profile",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: "Behaviour profile",
          subtitle: "Descriptions of what you did, never diagnoses",
          actions: /* @__PURE__ */ jsx7(IconButton, { label: "Profile options: recompute and export", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "Behaviour profile", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs5(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Traits", caption: "each with the evidence it came from" }),
          persona.traits.map((trait) => /* @__PURE__ */ jsxs5(View, { style: { marginBottom: theme.space(4) }, children: [
            /* @__PURE__ */ jsx7(Text2, { role: "title", theme, children: trait.label }),
            /* @__PURE__ */ jsx7(Text2, { role: "body", theme, children: trait.value }),
            /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: trait.evidence }),
            /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row" }, children: /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Show the raw events" }) })
          ] }, trait.label))
        ] }),
        /* @__PURE__ */ jsx7(Callout, { theme, tone: "limit", children: "These are estimates from behaviour, not a personality test and not a clinical instrument. Mirror will not label you as anything you cannot see the evidence for." })
      ] })
    }
  );
}
function WeeklyReportScreen({ theme, persona, state = "default" }) {
  const total = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Weekly report",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: "Weekly report",
          subtitle: "Built on this device, printed on request",
          actions: /* @__PURE__ */ jsx7(IconButton, { label: "Report options: week and sections", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "Weekly report", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs5(Card, { theme, elevated: true, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: "WEEK 42" }),
          /* @__PURE__ */ jsx7(Text2, { role: "headline", theme, style: { marginTop: theme.space(1) }, children: `${duration(total)} on screen` }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", theme, style: { marginTop: theme.space(2) }, children: `${Math.round(persona.intentionalShare * 100)}% deliberate \xB7 ${persona.topics.length} topics tracked \xB7 ${persona.budgets.filter((b) => b.actual <= b.target).length}/${persona.budgets.length} budgets inside` }),
          /* @__PURE__ */ jsx7(Divider, { theme }),
          /* @__PURE__ */ jsx7(Sparkline, { theme, values: persona.weeklyMinutes, label: "Daily totals for the reported week" })
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Sections", caption: "what is included, and what is not" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "Attention quality", value: `${Math.round(persona.intentionalShare * 100)}%`, detail: "Session lengths + your labels." },
                { label: "Topic movement", value: persona.topics.length ? `${persona.topics.length} topics` : "unavailable", detail: "Needs A/B/C data." },
                { label: "Anything shared", value: "0 B", detail: "The report never leaves the device unless you export the image yourself." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx7(Pill, { theme, variant: "secondary", children: "Render share image" }),
          /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Export PDF" })
        ] })
      ] })
    }
  );
}
function BudgetScreen({ theme, persona, state = "default" }) {
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Attention budget",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(
        Toolbar,
        {
          theme,
          title: "Attention budget",
          subtitle: "Soft limits, never red, never a streak",
          actions: /* @__PURE__ */ jsx7(IconButton, { label: "Budget options: units and reset", theme, children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        state === "empty" || persona.budgets.length === 0 ? /* @__PURE__ */ jsx7(Card, { theme, children: /* @__PURE__ */ jsx7(
          EmptyState,
          {
            theme,
            title: "No budgets yet",
            body: "A budget is a number you choose. Mirror will not suggest one, because a suggestion is a nudge.",
            action: /* @__PURE__ */ jsx7(Pill, { theme, children: "Set a budget" })
          }
        ) }) : persona.budgets.map((b) => {
          const over = b.actual > b.target;
          return /* @__PURE__ */ jsxs5(Card, { theme, children: [
            /* @__PURE__ */ jsx7(SectionHeader, { theme, title: b.label, caption: `${b.target} ${b.unit} target` }),
            /* @__PURE__ */ jsx7(Stat, { theme, value: String(b.actual), unit: b.unit.split("/")[0], label: "last 7 days average", hint: over ? `Over by ${b.actual - b.target} \u2014 shown as a number, not a warning` : "Inside the budget" }),
            /* @__PURE__ */ jsx7(View, { style: { marginTop: theme.space(3) }, children: /* @__PURE__ */ jsx7(Meter, { theme, value: Math.min(1, b.actual / (b.target * 1.5)), label: "usage against target", caption: `${Math.round(b.actual / b.target * 100)}%`, tone: over ? "muted" : "anchor" }) }),
            /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row" }, children: /* @__PURE__ */ jsx7(LinkButton, { theme, children: "Adjust this budget" }) })
          ] }, b.label);
        }),
        /* @__PURE__ */ jsx7(Callout, { theme, children: "Budgets are stored on this device and are never sent anywhere, not even as an aggregate." })
      ] })
    }
  );
}
function AskScreen({ theme, persona, state = "default" }) {
  const [value, setValue] = React2.useState("");
  const hasHistory = persona.weeklyMinutes.length === 7;
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Ask",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Ask Mirror", subtitle: "On-device answers over your own data" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(
          AskComposer,
          {
            theme,
            value,
            onChange: setValue,
            onSubmit: () => void 0,
            suggestions: persona.askable,
            canAnswer: hasHistory && state === "default",
            blockedReason: "Ask needs at least a week of on-device history before it can answer without guessing."
          }
        ),
        state === "default" && hasHistory ? /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Example answer", caption: "with its sources" }),
          /* @__PURE__ */ jsx7(Text2, { role: "body", theme, children: value || persona.askable[0] }),
          /* @__PURE__ */ jsx7(Divider, { theme }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: `Answered from ${tierSummary(persona.tiers)} data, ${duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))} of history. No model left this device, and this screen makes no network request.` })
        ] }) : null
      ] })
    }
  );
}
function WidgetsScreen({ theme, persona, state = "default" }) {
  const canPublish = persona.tiers.some((t) => t !== "D");
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Widgets",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Widgets", subtitle: "Glanceable, local, and explicit about privacy" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        state === "empty" ? /* @__PURE__ */ jsx7(NothingYet, { theme, needs: ["D"], available: [], feature: "Widgets", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(3), flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx7(
            WidgetPreview,
            {
              theme,
              size: "small",
              variant: "private",
              title: "Today",
              value: duration(persona.weeklyMinutes[6] ?? 0),
              caption: "Private widget: shows totals only, never which app or what you read.",
              bars: persona.weeklyMinutes.map((m) => m / Math.max(...persona.weeklyMinutes))
            }
          ),
          /* @__PURE__ */ jsx7(
            WidgetPreview,
            {
              theme,
              size: "medium",
              variant: canPublish ? "public" : "private",
              title: canPublish ? "Topics" : "No public widget",
              value: canPublish ? String(persona.topics.length) : "\u2014",
              caption: canPublish ? "Public widget: only topics you published, with a coarse bucket. Never history." : "A public widget needs topic data (A/B/C). With usage data only, Mirror shows nothing here rather than inventing it.",
              bars: canPublish ? persona.topics.map((t) => t.depth / 100) : void 0
            }
          )
        ] }),
        /* @__PURE__ */ jsx7(Callout, { theme, tone: "limit", children: "Widgets are rendered by the OS, which can show them on a lock screen. That is why the private widget shows totals and no titles, and why a public widget can only exist from topics you published yourself." }),
        /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2) }, children: [
          /* @__PURE__ */ jsx7(Pill, { theme, variant: "secondary", children: "Add private widget" }),
          canPublish ? /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Add public widget" }) : null
        ] })
      ] })
    }
  );
}
function YouScreen({ theme, persona }) {
  const flags = initialFlags;
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "You",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "You", subtitle: "Everything Mirror knows, and where it came from" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Sources", caption: tierSummary(persona.tiers) }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: persona.connected.map((c) => ({ label: c.label, value: `${c.tier}${c.connected ? " \xB7 on" : " \xB7 off"}`, detail: c.note }))
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Features", caption: "social is off and stays off unless you ask" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "Insights", value: isOn(flags, "insights") ? "on" : "off", detail: "Local analysis only." },
                { label: "Weekly report", value: isOn(flags, "weeklyReport") ? "on" : "off", detail: "Rendered on device." },
                { label: "Cloud report", value: isOn(flags, "cloudReport") ? "on" : "off", detail: "Off by default. Would send aggregates, never events." },
                { label: "Matching with others", value: isOn(flags, "socialMatching") ? "on" : "off", detail: "Off by default. Shares selected topics only \u2014 never watch, search or purchase history." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Your data" }),
          /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx7(Pill, { theme, variant: "secondary", children: "Export everything" }),
            /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Import an export" })
          ] }),
          /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(3) }, children: "Exports are written to a file you choose. Importing is the only way tier B data arrives \u2014 Mirror never fetches it." })
        ] })
      ] })
    }
  );
}
function PrivacyCentreScreen({ theme, persona }) {
  const [sheet, setSheet] = React2.useState(null);
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Privacy centre",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Privacy centre", subtitle: "Nothing here is a promise you cannot check" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      overlay: /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsx7(Sheet, { theme, open: sheet === "receipt", title: "Privacy receipt", subtitle: "This month, from the on-device log", onClose: () => setSheet(null), children: /* @__PURE__ */ jsx7(
          PrivacyReceipt,
          {
            theme,
            periodLabel: "October",
            rows: [
              { label: "Sent this month", value: "0 B", detail: "Privacy Mode has never made an outbound request." },
              { label: "Raw events sent", value: "0", detail: "Titles, searches and timestamps stay here." },
              { label: "Update check", value: "0 B", detail: "Would appear here if it ever ran." }
            ],
            zeroCopy: "In Privacy Mode this list is empty by construction, not by configuration. A remote config change cannot make it non-empty."
          }
        ) }),
        /* @__PURE__ */ jsx7(Sheet, { theme, open: sheet === "matrix", title: "What Mirror can see", subtitle: "By data tier", onClose: () => setSheet(null), children: /* @__PURE__ */ jsx7(CapabilityMatrix, { theme, available: persona.tiers, rows: persona.connected }) })
      ] }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Retention", caption: "you set it; the default is 90 days" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "Raw events", value: "90 days", detail: "Older events are deleted, not aggregated." },
                { label: "Daily summaries", value: "18 months", detail: "Counts and durations only, no titles." },
                { label: "Session labels you wrote", value: "kept", detail: "They are yours; Mirror will not expire them silently." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Check it yourself" }),
          /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx7(Pill, { theme, variant: "secondary", onPress: () => setSheet("receipt"), children: "Open receipt" }),
            /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", onPress: () => setSheet("matrix"), children: "Capability matrix" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Delete", caption: "one tap, no confirmation maze" }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: "Deleting erases the local database, including every imported export and every label you wrote. Mirrors of nothing exist elsewhere: there is no server copy to chase." }),
          /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3) }, children: /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Delete all data" }) })
        ] })
      ] })
    }
  );
}
function PublicProfileScreen({ theme, persona, state = "default" }) {
  const published = state === "empty" ? [] : persona.topics.slice(0, 1);
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Public profile",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Public profile", subtitle: "Exactly what a match would see" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx7(BoundaryToggle, { theme, value: "public", onChange: () => void 0, consequence: "Public. Visible to others: the topics you published, and a coarse activity bucket. Nothing else." }),
        /* @__PURE__ */ jsxs5(Card, { theme, elevated: true, children: [
          /* @__PURE__ */ jsx7(Text2, { role: "title-lg", theme, children: persona.name }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: published.length ? `${published.length} topic published` : "Nothing published yet" }),
          /* @__PURE__ */ jsx7(Divider, { theme }),
          published.length ? published.map((t) => /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", alignItems: "center", gap: theme.space(2) }, children: [
            /* @__PURE__ */ jsx7(TierBadge, { tier: t.tier[0] ?? "D", ghost: true, theme }),
            /* @__PURE__ */ jsx7(Text2, { role: "body", theme, children: t.name }),
            /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: t.depth > 60 ? "deep interest" : "exploring" })
          ] }, t.name)) : /* @__PURE__ */ jsx7(EmptyState, { theme, title: "Nothing is public", body: "A public profile starts empty. Topics are published one at a time, and each one shows what exactly would be shared." })
        ] }),
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "Never shared, under any setting" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "Watch history", value: "never" },
                { label: "Search history", value: "never" },
                { label: "Purchases", value: "never" },
                { label: "Session timestamps", value: "never" },
                { label: "Exact usage minutes", value: "never", detail: "A coarse bucket at most: light / regular / heavy." }
              ]
            }
          )
        ] })
      ] })
    }
  );
}
function MatchesScreen({ theme, persona, state = "default" }) {
  const socialOn = isOn(initialFlags, "socialMatching") && state !== "empty";
  return /* @__PURE__ */ jsx7(
    Screen,
    {
      title: "Matches",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx7(Toolbar, { theme, title: "Matches", subtitle: "Off by default, and not required to use Mirror" }),
      footer: /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
      children: /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
        !socialOn ? /* @__PURE__ */ jsx7(Card, { theme, children: /* @__PURE__ */ jsx7(
          EmptyState,
          {
            theme,
            title: "Matching is off",
            body: "Mirror is complete without it. If you turn it on, matching uses only the topics you publish, one by one \u2014 never your watch, search or purchase history, and never your raw usage.",
            action: /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap", justifyContent: "center" }, children: [
              /* @__PURE__ */ jsx7(Pill, { theme, variant: "secondary", children: "See what would be shared" }),
              /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: "Leave it off" })
            ] })
          }
        ) }) : null,
        /* @__PURE__ */ jsxs5(Card, { theme, children: [
          /* @__PURE__ */ jsx7(SectionHeader, { theme, title: "What matching can use", caption: "published topics only \u2014 and this list is the whole list" }),
          /* @__PURE__ */ jsx7(
            FactList,
            {
              theme,
              items: [
                { label: "Your published topics", value: persona.topics.length ? `${persona.topics.length}` : "0", detail: "Each one is opt-in and removable in one tap." },
                { label: "Coarse activity bucket", value: "optional", detail: "light / regular / heavy \u2014 never minutes." },
                { label: "Your usage history", value: "never", detail: "Not shared, not derived into a shareable form." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx7(Callout, { theme, tone: "limit", children: "Mirror will not notify you to come back, will not show who viewed you, and will not rank people by how much they use their phone." })
      ] })
    }
  );
}
var SCREENS = [
  { id: "J1", slug: "onboarding", title: "Onboarding", phase: "P2", requires: [], states: ["default"], rule: "State the three promises before asking for anything.", Component: OnboardingScreen },
  { id: "J2", slug: "permission-primer", title: "Permission primer", phase: "P1", requires: [], states: ["default"], rule: 'Explain the permission before the OS dialog, and make "not now" as easy as "allow".', Component: PermissionPrimerScreen },
  { id: "J3", slug: "home", title: "Home", phase: "P2", requires: ["D"], states: ["default", "empty"], rule: "The measured reference layout: hero, budget, arcs \u2014 and an honest empty state.", Component: HomeScreen },
  { id: "J4", slug: "insights", title: "Insights", phase: "P2", requires: ["D"], states: ["default", "empty"], rule: "Every score explains itself; no number appears without its parts.", Component: InsightsScreen },
  { id: "J5", slug: "journey", title: "Journey", phase: "P3", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Interest evolution is only shown when topic-level data exists.", Component: JourneyScreen },
  { id: "J6", slug: "sessions", title: "Sessions", phase: "P3", requires: ["D"], states: ["default", "empty"], rule: "The user can annotate their own sessions; labels stay local.", Component: SessionsScreen },
  { id: "J7", slug: "discovery", title: "Discovery", phase: "P3", requires: ["D"], states: ["default", "empty"], rule: 'Define "rabbit hole" in the UI, then report against that definition.', Component: DiscoveryScreen },
  { id: "J8", slug: "what-if", title: "What if", phase: "P3", requires: ["D"], states: ["default", "empty"], rule: "Counterfactuals are calculations over your history, never predictions.", Component: WhatIfScreen },
  { id: "J9", slug: "focus", title: "Focus windows", phase: "P3", requires: ["D"], states: ["default", "empty"], rule: "Focus never blocks or shames; it repeats the choice you made.", Component: FocusScreen },
  { id: "J10", slug: "profile", title: "Behaviour profile", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Descriptive traits with their evidence attached, never clinical labels.", Component: ProfileScreen },
  { id: "J11", slug: "weekly-report", title: "Weekly report", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "A local document; sharing is an export you perform, not a sync.", Component: WeeklyReportScreen },
  { id: "J12", slug: "budget", title: "Attention budget", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Budgets are chosen by the user and rendered as numbers, never alarms.", Component: BudgetScreen },
  { id: "J13", slug: "ask", title: "Ask Mirror", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Answer from local data or refuse \u2014 never guess, never call out.", Component: AskScreen },
  { id: "J14", slug: "widgets", title: "Widgets", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Widgets can appear on a lock screen: show totals privately, topics publicly.", Component: WidgetsScreen },
  { id: "J15", slug: "you", title: "You", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Every source and every feature flag visible in one place.", Component: YouScreen },
  { id: "J16", slug: "privacy-centre", title: "Privacy centre", phase: "P5", requires: [], states: ["default"], rule: "Retention, deletion, receipt and capability matrix \u2014 all checkable in-app.", Component: PrivacyCentreScreen },
  { id: "J17", slug: "public-profile", title: "Public profile", phase: "P6", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Show the user exactly what a match sees, including the never-shared list.", Component: PublicProfileScreen },
  { id: "J18", slug: "matches", title: "Matches", phase: "P6", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Social is off by default and says so instead of teasing engagement.", Component: MatchesScreen }
];
var TAB_ITEMS = TABS;
var screensByPhase = (phase) => SCREENS.filter((s) => s.phase === phase);

// packages/ui/screens/render.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function renderScreen(spec, persona, theme, state = "default") {
  const Component = spec.Component;
  return /* @__PURE__ */ jsx8(
    ThemeProvider,
    {
      initialTheme: theme.name,
      overrides: { reducedTransparency: theme.reducedTransparency, reducedMotion: theme.reducedMotion, textScale: 1 },
      followSystem: false,
      children: /* @__PURE__ */ jsx8(Component, { theme, persona, state })
    }
  );
}
function personaFor(spec, preferred) {
  if (preferred) return preferred;
  return PERSONAS.find((p) => spec.requires.every((tier) => p.tiers.includes(tier))) ?? PERSONAS[1];
}
function specFor(slug) {
  const spec = SCREENS.find((s) => s.slug === slug);
  if (!spec) throw new Error(`unknown screen "${slug}" (known: ${SCREENS.map((s) => s.slug).join(", ")})`);
  return spec;
}
function personaById(id) {
  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`unknown persona "${id}" (known: ${PERSONAS.map((p) => p.id).join(", ")})`);
  return persona;
}
function renderOne(slug, personaId, state = "default", themeName = "dark") {
  const spec = specFor(slug);
  const persona = personaById(personaId);
  const theme = createTheme(themeName);
  return { spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) };
}
function renderMatrix(options = {}) {
  const out = [];
  for (const spec of SCREENS) {
    if (options.screen && spec.slug !== options.screen) continue;
    const persona = personaFor(spec, options.persona);
    for (const state of options.states ?? spec.states) {
      for (const name of options.themes ?? ["dark", "light"]) {
        const theme = createTheme(name);
        out.push({ spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) });
      }
    }
  }
  return out;
}
export {
  AskComposer,
  AskScreen,
  Backdrop,
  BoundaryToggle,
  BudgetScreen,
  Callout,
  CapabilityMatrix,
  Card,
  Chip,
  ChipRow,
  ConfidenceChip,
  DEFAULT_THEME,
  DataStanding,
  DegradedNotice,
  DiscoveryScreen,
  Divider,
  EmptyState,
  FLAG_DEFAULTS,
  FactList,
  FocusScreen,
  GlassSurface,
  HeroCarousel,
  HomeScreen,
  IMPOSSIBLE,
  IconButton,
  InsightsScreen,
  JourneyScreen,
  LinkButton,
  ListRow,
  MIN_TOUCH_DP,
  MatchesScreen,
  Meter,
  OnboardingScreen,
  PERSONAS,
  PermissionPrimer,
  PermissionPrimerScreen,
  Pill,
  PrivacyCentreScreen,
  PrivacyReceipt,
  ProfileScreen,
  PublicProfileScreen,
  ROLES,
  Ring,
  SCREENS,
  Screen,
  ScrollView,
  SectionHeader,
  SegmentedControl,
  SessionsScreen,
  Sheet,
  Sparkline,
  Stat,
  StatusStrip,
  Surface,
  TABS,
  TAB_ITEMS,
  TIERS,
  TIER_ORDER,
  TabBar,
  Text2 as Text,
  ThemeContext,
  ThemeProvider,
  TierAction,
  TierBadge,
  Toolbar,
  WeeklyReportScreen,
  WhatIfScreen,
  WhySheet,
  WidgetPreview,
  WidgetsScreen,
  YouScreen,
  a11yTarget,
  adjustments,
  announceValue,
  assertTargetSize,
  auditFlagPosture,
  auditPairs,
  clock,
  composite,
  contrastRatio,
  createTheme,
  darkTheme,
  degrade,
  duration,
  flagsMissingData,
  focusRing,
  hedged,
  hitSlopFor,
  initialFlags,
  isOn,
  layoutMetrics,
  lightTheme,
  luminance,
  mix,
  percent,
  personaById,
  personaFor,
  plural,
  px,
  relativeDay,
  renderMatrix,
  renderOne,
  renderScreen,
  rgba,
  screensByPhase,
  shortDay,
  specFor,
  tierLabel,
  tierSummary,
  toHex,
  tokenMeta,
  touchTarget,
  useLiveBlur,
  useTheme,
  useThemeControls
};
