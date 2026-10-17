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
function degrade(available, needs, featureLabel, anyOf = []) {
  const missing = needs.filter((t) => !available.includes(t));
  const missingAny = anyOf.length > 0 && !anyOf.some((t) => available.includes(t)) ? [...anyOf] : [];
  if (missing.length === 0 && missingAny.length === 0) return { ok: true };
  const because = "which is not on this device. Mirror will not estimate it.";
  let requirement;
  if (missing.length > 0 && missingAny.length > 0) {
    requirement = `it needs tier ${missing.join(" and ")} data and at least one of tier ${missingAny.join("/")} (topics, searches or scroll depth), none of ${because}`;
  } else if (missingAny.length > 0) {
    requirement = `it needs at least one of tier ${missingAny.join("/")} (topics, searches or scroll depth), none of ${because}`;
  } else {
    requirement = `it needs tier ${missing.join(" and ")} data, ${because}`;
  }
  return { ok: false, missing, missingAny, message: `${featureLabel} is unavailable: ${requirement}` };
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
function DemoChip({ persona, theme }) {
  const t = withTheme3(theme);
  return /* @__PURE__ */ jsx5(
    View,
    {
      accessible: true,
      accessibilityRole: "text",
      accessibilityLabel: `Demo data from ${persona}. Not your data.`,
      style: { paddingHorizontal: t.space(4), paddingTop: t.space(2) },
      children: /* @__PURE__ */ jsx5(
        View,
        {
          style: {
            alignSelf: "flex-start",
            minHeight: t.size.chipHeight,
            justifyContent: "center",
            paddingHorizontal: t.space(3),
            borderRadius: t.radius.pill,
            backgroundColor: t.glass.chip.fill,
            borderWidth: 1,
            borderColor: t.color.borderCard
          },
          children: /* @__PURE__ */ jsx5(Text2, { role: "micro", tone: "muted", theme: t, style: { fontWeight: "700" }, children: `DEMO DATA \xB7 ${persona.toUpperCase()}` })
        }
      )
    }
  );
}
function Screen({ children, header, footer, overlay, padded = true, theme, title, demo }) {
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
        demo ? /* @__PURE__ */ jsx5(DemoChip, { persona: demo, theme: t }) : null,
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
  anyOf,
  available,
  feature,
  actions,
  theme
}) {
  const t = withTheme4(theme);
  const result = degrade(available, needs, feature, anyOf ?? []);
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
    /* @__PURE__ */ jsx6(View, { style: { flexDirection: "row", gap: t.space(1), justifyContent: "center", flexWrap: "wrap" }, children: [...result.missing, ...result.missingAny].map((tier) => /* @__PURE__ */ jsx6(TierBadge, { tier, theme: t }, tier)) }),
    /* @__PURE__ */ jsx6(Text2, { role: "micro", tone: "muted", theme: t, center: true, style: { marginTop: t.space(2) }, children: (result.missing[0] ? TIERS[result.missing[0]] : TIERS[result.missingAny[0]]).how })
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

// packages/ui/screens/personas.ts
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
    askable: ["How much of my week was intentional?", "When do I switch apps most?"],
    depthBands: [
      { label: "under 8 s", share: 0.31, note: "opens that were abandoned before anything could be read" },
      { label: "8 s \u2013 1 min", share: 0.38, note: "checks, replies, glancing" },
      { label: "1 \u2013 5 min", share: 0.22, note: "reading and watching" },
      { label: "5 \u2013 20 min", share: 0.08, note: "longer sittings" },
      { label: "over 20 min", share: 0.01, note: "rare, and mostly one app" }
    ],
    curiosity: { deepHours: 5.1, habitHours: 8.4, switchesPerHour: 38, note: "Habit is the larger half. That is the whole finding, and no nudge was sent about it." },
    iqs: {
      value: 41,
      band: "usage-only band",
      parts: [
        { label: "Session length mix", points: 14, max: 30, tier: "D", detail: "31% of opens end under 8 seconds." },
        { label: "Deliberate share", points: 12, max: 25, tier: "D", detail: "From your own labels, not from content." },
        { label: "Switching pressure", points: 8, max: 20, tier: "D", detail: "38 switches per hour, evening-weighted." },
        { label: "Late-night share", points: 7, max: 15, tier: "D", detail: "36% after 11pm." },
        { label: "Topic depth", points: 0, max: 10, tier: "A", detail: "Not measured: needs topic data." }
      ],
      caveat: "The band is capped at 75 while topic depth is unmeasured. A score without its parts would be a horoscope."
    },
    arcs: [],
    paths: [],
    rabbit: { sessions: 9, minutes: 118, lateNightShare: 0.38, example: "Short-video sessions that restarted 5 times inside 20 minutes." },
    goals: [
      { label: "Short video under 60 min/day", progress: 0.62, target: "60 min/day", note: "Set by you in week 38. Never shown as a streak." },
      { label: "Phone-free first hour", progress: 0.45, target: "5 days/week", note: "Counted from launch timestamps, tier D." }
    ],
    networkLog: [],
    intents: [
      { label: "Short video", ask: true, note: "Ask after 10 minutes in-app." },
      { label: "Social feed", ask: true, note: "Ask after 5 minutes." },
      { label: "Messaging", ask: false, note: "Never ask: it is a tool, not a habit." }
    ],
    chat: null,
    update: { current: "0.1.0", available: "0.2.0", notes: "Adds focus windows and a smaller widget. Nothing new is collected, and no permission is added.", bytes: 84e5 },
    whyParts: [
      { label: "Yesterday, before 8pm", points: 52, note: "from foreground time", tier: "D" },
      { label: "Evening block", points: 41, note: "after 8pm, 3 sessions", tier: "D" },
      { label: "Late-night block", points: 33, note: "after 11pm, 1 session", tier: "D" }
    ]
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
    askable: ["Which topic grew the most this month?", "How deep was my film photography reading?"],
    depthBands: [
      { label: "under 8 s", share: 0.19, note: "mostly feed opens" },
      { label: "8 s \u2013 1 min", share: 0.29, note: "checks and skims" },
      { label: "1 \u2013 5 min", share: 0.31, note: "reading, watching" },
      { label: "5 \u2013 20 min", share: 0.16, note: "sittings with a subject" },
      { label: "over 20 min", share: 0.05, note: "long reads and lectures" }
    ],
    curiosity: { deepHours: 9.8, habitHours: 5.2, switchesPerHour: 21, note: "Curiosity is ahead, and the shallow tail is concentrated in one app." },
    iqs: {
      value: 67,
      band: "measured band",
      parts: [
        { label: "Session length mix", points: 22, max: 30, tier: "D", detail: "Only 19% of opens end under 8 seconds." },
        { label: "Deliberate share", points: 18, max: 25, tier: "D", detail: "From your labels." },
        { label: "Switching pressure", points: 13, max: 20, tier: "D", detail: "21 switches per hour." },
        { label: "Late-night share", points: 6, max: 15, tier: "D", detail: "23% after 11pm." },
        { label: "Topic depth", points: 8, max: 10, tier: "C", detail: "Three topics above depth 40, two still growing." }
      ],
      caveat: "Computed only from parts that exist. The topic part uses tier B/C data and names which."
    },
    arcs: [
      { topic: "Film photography", stage: "practising", weeks: [8, 14, 21, 33, 44, 58, 71, 78], next: "Darkroom printing \u2014 three sources followed, none opened yet.", sourceTier: "B+C" },
      { topic: "Rust programming", stage: "learning", weeks: [3, 9, 18, 27, 38, 47, 58, 64], next: "Ownership chapter, revisited twice.", sourceTier: "C" },
      { topic: "Urban gardening", stage: "stalled", weeks: [22, 30, 39, 44, 41, 39, 40, 41], next: "No new sources since week 44.", sourceTier: "B" }
    ],
    paths: [
      {
        topic: "Film photography",
        steps: [
          { step: 'Search: "how to meter for black and white"', tier: "C", when: "6 weeks ago" },
          { step: "Article: zone system explained", tier: "C", when: "6 weeks ago" },
          { step: "Video: developing at home, 24 min watched to 92%", tier: "C", when: "5 weeks ago" },
          { step: "Saved: developer chemistry list", tier: "A", when: "2 weeks ago" }
        ]
      },
      {
        topic: "Rust programming",
        steps: [
          { step: 'Search: "rust borrow checker explained"', tier: "C", when: "3 weeks ago" },
          { step: "Docs pages: 14 opened, 6 read past halfway", tier: "C", when: "3 weeks ago" },
          { step: "Community post answered", tier: "A", when: "1 week ago" }
        ]
      }
    ],
    rabbit: { sessions: 6, minutes: 74, lateNightShare: 0.29, example: "A 41-minute stretch that alternated Shorts and the feed 12 times." },
    goals: [
      { label: "Short video under 30 min/day", progress: 0.79, target: "30 min/day", note: "You raised this yourself after three weeks under it." },
      { label: "One long read a day", progress: 0.86, target: "6 days/week", note: "Measured as a session over 8 minutes with a topic attached." }
    ],
    networkLog: [
      { when: "3 days ago", host: "www.googleapis.com (YouTube Data API)", bytes: 2140, why: "Subscription list, narrowest scope, read-only." },
      { when: "9 days ago", host: "oauth.reddit.com", bytes: 1870, why: "Saved posts, after you connected it." }
    ],
    intents: [
      { label: "Short video", ask: true, note: "Ask after 10 minutes in-app." },
      { label: "Long reads", ask: false, note: "Never interrupt a long read." },
      { label: "Communities", ask: true, note: "Ask after 20 minutes." }
    ],
    chat: {
      with: "Sam \xB7 matched on film photography",
      topic: "Film photography",
      messages: [
        { from: "them", text: "Your arc shows darkroom printing next \u2014 did you ever try it?" },
        { from: "you", text: "Not yet. Mirror says I have followed three sources and opened none." },
        { from: "them", text: "Mine said the same thing about cyanotypes." }
      ]
    },
    update: { current: "0.1.0", available: "0.2.0", notes: "Adds focus windows and a smaller widget. Nothing new is collected, and no permission is added.", bytes: 84e5 },
    whyParts: [
      { label: "Yesterday, before 8pm", points: 61, note: "from foreground time", tier: "D" },
      { label: "Evening block", points: 34, note: "after 8pm, 2 sessions", tier: "D" },
      { label: "Late-night block", points: 12, note: "after 11pm, 1 session", tier: "D" }
    ]
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
      { label: "Short video", target: 20, actual: 11, unit: "min/day" },
      { label: "Deep reading", target: 60, actual: 74, unit: "min/day" }
    ],
    traits: [
      { label: "Long-form preference", value: "Average session 24 minutes", evidence: "Session lengths across tiers A/B/C/D." },
      { label: "Low late-night use", value: "8% after 11 pm", evidence: "Timestamps, tier D." }
    ],
    askable: ["What did I learn about this month?", "Which sources did I actually open?"],
    depthBands: [
      { label: "under 8 s", share: 0.11, note: "almost all of it is one app" },
      { label: "8 s \u2013 1 min", share: 0.22, note: "checks, replies" },
      { label: "1 \u2013 5 min", share: 0.27, note: "reading" },
      { label: "5 \u2013 20 min", share: 0.28, note: "papers, lectures, long reads" },
      { label: "over 20 min", share: 0.12, note: "sittings with a subject and a question" }
    ],
    curiosity: { deepHours: 12.4, habitHours: 2.9, switchesPerHour: 14, note: "Deep work dominates. Mirror says so once and then stays quiet." },
    iqs: {
      value: 82,
      band: "measured band",
      parts: [
        { label: "Session length mix", points: 27, max: 30, tier: "D", detail: "11% of opens end under 8 seconds." },
        { label: "Deliberate share", points: 21, max: 25, tier: "D", detail: "From your labels." },
        { label: "Switching pressure", points: 17, max: 20, tier: "D", detail: "14 switches per hour." },
        { label: "Late-night share", points: 12, max: 15, tier: "D", detail: "8% after 11pm." },
        { label: "Topic depth", points: 5, max: 10, tier: "A", detail: "Four topics followed; two went past depth 60." }
      ],
      caveat: "The parts are all measured here. The band tops out at 85: the last points would need content quality, which Mirror cannot judge."
    },
    arcs: [
      { topic: "Astronomy", stage: "deep", weeks: [18, 26, 34, 47, 55, 62, 74, 81], next: "Stellar spectra \u2014 an instrument project, two sources opened.", sourceTier: "A+C" },
      { topic: "Urban gardening", stage: "practising", weeks: [30, 36, 42, 50, 57, 61, 64, 66], next: "Composting, read consistently for 6 weeks.", sourceTier: "B" },
      { topic: "Rust programming", stage: "learning", weeks: [12, 20, 31, 40, 49, 54, 57, 58], next: "Async chapter, slowing down.", sourceTier: "C" },
      { topic: "Film photography", stage: "starting", weeks: [2, 6, 11, 17, 23, 29, 33, 37], next: "Metering basics.", sourceTier: "B" }
    ],
    paths: [
      {
        topic: "Astronomy",
        steps: [
          { step: "Saved: ESA press release on a comet", tier: "A", when: "9 weeks ago" },
          { step: "Docs/reference: orbital mechanics primer, 31 min", tier: "C", when: "8 weeks ago" },
          { step: "Live stream watched to 94%", tier: "C", when: "4 weeks ago" },
          { step: "Subscription: an instrument channel", tier: "A", when: "1 week ago" }
        ]
      },
      {
        topic: "Urban gardening",
        steps: [
          { step: "Imported Takeout: 12 gardening videos", tier: "B", when: "14 weeks ago" },
          { step: "Community thread read for 9 minutes", tier: "A", when: "7 weeks ago" },
          { step: "Saved: composting ratios", tier: "A", when: "3 weeks ago" }
        ]
      }
    ],
    rabbit: { sessions: 2, minutes: 21, lateNightShare: 0.05, example: "One 14-minute feed drift after a film photography post." },
    goals: [
      { label: "Short video under 20 min/day", progress: 0.93, target: "20 min/day", note: "Quietly met for 5 of 6 weeks." },
      { label: "One long read a day", progress: 0.88, target: "6 days/week", note: "Defined as a session over 8 minutes with a topic attached." },
      { label: "Two phone-free evenings", progress: 0.5, target: "2/week", note: "Counted from launch timestamps." }
    ],
    networkLog: [
      { when: "yesterday", host: "www.googleapis.com (YouTube Data API)", bytes: 3980, why: "Watch-history import, user-initiated." },
      { when: "4 days ago", host: "reddit.com/api/v1", bytes: 2260, why: "Saved posts, read-only scope." },
      { when: "11 days ago", host: "mirror.example (update check)", bytes: 640, why: "Version manifest only. Disabled when the backend is off." }
    ],
    intents: [
      { label: "Short video", ask: true, note: "Ask after 10 minutes in-app." },
      { label: "Social feed", ask: false, note: "Off: you asked to be left alone on this one." },
      { label: "Research browsing", ask: false, note: "Never ask during long-form reading." }
    ],
    chat: {
      with: "Ana \xB7 matched on astronomy",
      topic: "Astronomy",
      messages: [
        { from: "you", text: "Your arc says stellar spectra. Mine is still on orbital mechanics." },
        { from: "them", text: "Same instrument project, different week. No streaks here, so we can just talk." }
      ]
    },
    update: { current: "0.1.0", available: "0.2.0", notes: "Adds focus windows and a smaller widget. Nothing new is collected, and no permission is added.", bytes: 84e5 },
    whyParts: [
      { label: "Yesterday, before 8pm", points: 74, note: "from foreground time", tier: "D" },
      { label: "Evening block", points: 52, note: "after 8pm, 2 sessions", tier: "D" },
      { label: "Late-night block", points: 8, note: "after 11pm, 1 session", tier: "D" }
    ]
  }
];

// packages/ui/screens/tabs.ts
var TAB_ITEMS = [
  { id: "home", label: "Home" },
  { id: "insights", label: "Insights" },
  { id: "journey", label: "Journey" },
  { id: "sessions", label: "Sessions" },
  { id: "you", label: "You" }
];

// packages/ui/screens/kit.tsx
import { Fragment, jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function TabFooter({ theme, active }) {
  const liveBlur = useLiveBlur(`tabbar:${active}`, true);
  return /* @__PURE__ */ jsxs5(Fragment, { children: [
    /* @__PURE__ */ jsx7(View, { style: { height: theme.size.tabBar + theme.space(6) } }),
    /* @__PURE__ */ jsx7(
      TabBar,
      {
        items: TAB_ITEMS.map((t) => ({ id: t.id, label: t.label })),
        active,
        onChange: () => void 0,
        liveBlur,
        theme
      }
    )
  ] });
}
function canSupply(persona, needs, anyOf = []) {
  return needs.every((t) => persona.tiers.includes(t)) && (anyOf.length === 0 || anyOf.some((t) => persona.tiers.includes(t)));
}
function NothingYet({
  theme,
  needs,
  anyOf,
  available,
  feature,
  actionLabel = "Explain what Mirror needs"
}) {
  return /* @__PURE__ */ jsx7(
    DegradedNotice,
    {
      theme,
      needs,
      anyOf,
      available,
      feature,
      actions: /* @__PURE__ */ jsx7(Pill, { theme, variant: "quiet", children: actionLabel })
    }
  );
}
function ScoreBlock({
  theme,
  title,
  score,
  max = 100,
  band,
  parts,
  caveat,
  action,
  columns = 1
}) {
  const sum = parts.reduce((total, p) => total + p.points, 0);
  const sumMax = parts.reduce((total, p) => total + p.max, 0);
  return /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(3) }, children: [
    /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsxs5(View, { children: [
        /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: title.toUpperCase() }),
        /* @__PURE__ */ jsx7(Text2, { role: "display", theme, children: String(score) }),
        band ? /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: band }) : null
      ] }),
      /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: `of ${max}` })
    ] }),
    /* @__PURE__ */ jsx7(Divider, { theme }),
    /* @__PURE__ */ jsx7(View, { style: { gap: theme.space(3) }, children: parts.map((part) => /* @__PURE__ */ jsxs5(View, { style: columns === 2 ? { width: "48%" } : void 0, children: [
      /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space(2) }, children: [
        /* @__PURE__ */ jsxs5(View, { style: { flexDirection: "row", alignItems: "center", gap: theme.space(2), flexShrink: 1 }, children: [
          /* @__PURE__ */ jsx7(TierBadge, { tier: part.tier, ghost: true, theme }),
          /* @__PURE__ */ jsx7(Text2, { role: "label", theme, style: { flexShrink: 1 }, children: part.label })
        ] }),
        /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: `${part.points}/${part.max}` })
      ] }),
      /* @__PURE__ */ jsx7(View, { style: { marginTop: theme.space(1) }, children: /* @__PURE__ */ jsx7(
        Meter,
        {
          theme,
          value: part.max === 0 ? 0 : part.points / part.max,
          label: `${part.label}: ${part.points} of ${part.max} points`,
          tone: part.points === 0 ? "muted" : "anchor"
        }
      ) }),
      part.detail ? /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: part.detail }) : null
    ] }, part.label)) }),
    /* @__PURE__ */ jsx7(Callout, { theme, tone: "neutral", children: /* @__PURE__ */ jsx7(Text2, { role: "label", tone: "muted", theme, children: `The parts add to ${sum} of a possible ${sumMax}. The score is reported on the same scale as the parts it is made of.` }) }),
    caveat ? /* @__PURE__ */ jsx7(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx7(Text2, { role: "label", theme, children: caveat }) }) : null,
    action ? /* @__PURE__ */ jsx7(View, { style: { flexDirection: "row" }, children: action }) : null
  ] });
}
function Definition({ theme, term, children }) {
  return /* @__PURE__ */ jsxs5(View, { style: { gap: theme.space(1) }, children: [
    /* @__PURE__ */ jsx7(Text2, { role: "micro", tone: "muted", theme, children: `HOW MIRROR DEFINES \u201C${term.toUpperCase()}\u201D` }),
    children
  ] });
}

// packages/ui/screens/index.tsx
import { Fragment as Fragment2, jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
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
function OnboardingScreen({ theme, persona, tab }) {
  const promises = [
    { title: "Your history stays on this phone", body: "Titles, searches and timestamps are stored and analysed locally, encrypted." },
    { title: "Two profiles, never merged", body: "Private holds everything. Public holds only the topics you pick, one by one. Nothing is copied across." },
    { title: "No streaks, no guilt, no dark patterns", body: "Mirror exists to reduce mindless use. It will not nudge you to come back." }
  ];
  return /* @__PURE__ */ jsx8(Screen, { title: "Onboarding", theme, padded: true, children: /* @__PURE__ */ jsxs6(View, { style: { paddingTop: theme.space(6), gap: theme.space(4) }, children: [
    /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "MIRROR" }),
    /* @__PURE__ */ jsx8(Text2, { role: "display", theme, children: `See how you actually use your phone` }),
    /* @__PURE__ */ jsx8(Text2, { role: "body", tone: "muted", theme, children: `Mirror shows the quality of your attention, not just the hours. It runs on this device and never asks you to log anything by hand.` }),
    promises.map((p) => /* @__PURE__ */ jsxs6(Card, { theme, children: [
      /* @__PURE__ */ jsx8(Text2, { role: "title", theme, children: p.title }),
      /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: p.body })
    ] }, p.title)),
    /* @__PURE__ */ jsx8(Pill, { theme, children: "Continue" }),
    /* @__PURE__ */ jsx8(View, { style: { alignItems: "center" }, children: /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Explore with demo data" }) })
  ] }) });
}
function PermissionPrimerScreen({ theme, persona, tab }) {
  const [step, setStep] = React2.useState("usage");
  const primers = {
    usage: {
      systemName: "Usage access \xB7 Settings \u2192 Apps \u2192 Special access \u2192 Usage access \u2192 Mirror",
      sees: "How long you use each app and when you open them \u2014 foreground time, launches, timestamps.",
      cannotSee: "What is inside those apps. No content, no messages, no notifications. Mirror never reads them.",
      settingsPath: "Android settings \u2192 Special access \u2192 Usage access"
    },
    notifications: {
      systemName: "Notifications \xB7 Mirror may send local notifications",
      sees: "Nothing new. Notifications are an output, not a source \u2014 Mirror writes them on this device and no server sends them.",
      cannotSee: "It also cannot read any other app\u2019s notifications. Reading notifications is a forbidden source, not a disabled feature.",
      settingsPath: "Android settings \u2192 Apps \u2192 Mirror \u2192 Notifications (off unless you allow)"
    }
  };
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Permission primers",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Before the system asks",
          subtitle: step === "usage" ? "Step 1 of 2 \xB7 usage access" : "Step 2 of 2 \xB7 notifications"
        }
      ),
      footer: /* @__PURE__ */ jsx8(View, { style: { height: theme.space(6) } }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(
          SegmentedControl,
          {
            theme,
            label: "Permission",
            value: step,
            onChange: (v) => setStep(v),
            options: [
              { value: "usage", label: "Usage access" },
              { value: "notifications", label: "Notifications" }
            ]
          }
        ),
        /* @__PURE__ */ jsx8(PermissionPrimer, { theme, ask: primers[step], onAllow: () => void 0, onDeny: () => void 0 }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "neutral", children: /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: step === "usage" ? "Usage access is the only permission Mirror needs to work at all. Denying it leaves the app running with an empty, honest dashboard \u2014 not with a degraded one full of guesses." : "Notifications are optional and off by default. With them off, Mirror still works; you simply never hear from it, which for most people is the right setting." }) })
      ] })
    }
  );
}
function HomeScreen({ theme, persona, state, tab }) {
  const [hero, setHero] = React2.useState(0);
  const empty = state === "empty";
  const slides = HERO(persona);
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Dashboard",
      theme,
      padded: false,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: `Good evening, ${persona.name}`,
          subtitle: empty ? "Nothing collected yet" : `Week of ${tierSummary(persona.tiers)} data`,
          actions: /* @__PURE__ */ jsxs6(Fragment2, { children: [
            /* @__PURE__ */ jsx8(IconButton, { label: "Search your own data", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u2315" }) }),
            /* @__PURE__ */ jsx8(IconButton, { label: "Profile and settings", theme, badge: true, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: persona.name.slice(0, 1) }) })
          ] })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { paddingHorizontal: theme.space(4), gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(
          BoundaryToggle,
          {
            theme,
            value: "private",
            onChange: () => void 0,
            consequence: "Private. Only your selections are ever shared \u2014 nothing else leaves this phone."
          }
        ),
        /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx8(Chip, { label: "Range", value: "This week", theme }),
          /* @__PURE__ */ jsx8(Chip, { label: "App", value: "All", theme }),
          /* @__PURE__ */ jsx8(Chip, { label: "Topic", value: persona.topics[0]?.name ?? "All", theme })
        ] }),
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx8(Card, { theme, children: /* @__PURE__ */ jsx8(
          EmptyState,
          {
            title: "No usage data yet",
            body: "Mirror has nothing to show until Android usage access is granted. It will not fill the gap with estimates.",
            action: /* @__PURE__ */ jsx8(Pill, { theme, children: "Explain what it can see" }),
            theme
          }
        ) }) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsx8(HeroCarousel, { theme, slides, index: hero, onIndexChange: setHero }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Last 7 days", caption: hedged(duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0)), "D", "duration") }),
            /* @__PURE__ */ jsx8(Sparkline, { theme, values: persona.weeklyMinutes, label: `Daily screen time for 7 days, ${persona.weeklyMinutes.join(", ")} minutes` }),
            /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row", justifyContent: "space-between", marginTop: theme.space(2) }, children: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: d }, d)) })
          ] }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Attention budget", caption: "soft limits, no streaks" }),
            persona.budgets.map((b) => /* @__PURE__ */ jsx8(View, { style: { marginBottom: theme.space(3) }, children: /* @__PURE__ */ jsx8(
              Meter,
              {
                theme,
                value: b.target / Math.max(b.actual, b.target),
                label: b.label,
                caption: `${b.actual} / ${b.target} ${b.unit}`,
                tone: b.actual > b.target ? "muted" : "anchor"
              }
            ) }, b.label)),
            /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Adjust a budget" })
          ] }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Learning arcs", caption: "topics you are going deeper on" }),
            persona.topics.length === 0 ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["A", "B", "C"], available: persona.tiers, feature: "Topic arcs", actionLabel: "Import an export" }) : persona.topics.slice(0, 3).map((topic) => /* @__PURE__ */ jsx8(
              ListRow,
              {
                theme,
                leading: /* @__PURE__ */ jsx8(TierBadge, { tier: topic.tier[0] ?? "D", ghost: true, theme }),
                title: topic.name,
                meta: `${topic.hours}h \xB7 first seen ${topic.firstSeen}`,
                trailing: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, style: { fontWeight: "600" }, children: `${topic.depth}` })
              },
              topic.name
            ))
          ] })
        ] })
      ] })
    }
  );
}
function JourneyScreen({ theme, persona, tab }) {
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Interest Evolution",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Interest Evolution",
          subtitle: "Where your curiosity went",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Journey options: range and sources", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        persona.topics.length === 0 ? /* @__PURE__ */ jsx8(
          DegradedNotice,
          {
            theme,
            needs: ["A", "B", "C"],
            available: persona.tiers,
            feature: "Interest evolution",
            actions: /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Import an export" })
          }
        ) : /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Interest evolution", caption: "first seen, then depth over time" }),
          persona.topics.map((topic) => /* @__PURE__ */ jsxs6(View, { style: { marginBottom: theme.space(4) }, children: [
            /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsx8(Text2, { role: "title", theme, children: topic.name }),
              /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: `${topic.trend > 0 ? "+" : ""}${topic.trend}%` })
            ] }),
            /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row", gap: 3, marginTop: theme.space(2), height: 32, alignItems: "flex-end" }, children: Array.from({ length: 12 }).map((_, i) => /* @__PURE__ */ jsx8(
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
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: `first seen ${topic.firstSeen} \xB7 ${tierSummary(topic.tier.split("+"))} \xB7 ${topic.hours}h this month` }),
            /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row", marginTop: theme.space(2) }, children: /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Open the sessions behind this" }) })
          ] }, topic.name))
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "What changed this month" }),
          /* @__PURE__ */ jsx8(
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
function SessionsScreen({ theme, persona, state, tab }) {
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Sessions",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(Toolbar, { theme, title: "Sessions", subtitle: "Longest first. Labels train the local model." }),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], available: [], feature: "Sessions", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsx8(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: persona.sessions.map((s, i) => /* @__PURE__ */ jsxs6(View, { children: [
          /* @__PURE__ */ jsx8(
            ListRow,
            {
              theme,
              leading: /* @__PURE__ */ jsx8(TierBadge, { tier: s.topic === "\u2014" ? "D" : "C", ghost: true, theme }),
              title: `${s.app} \xB7 ${duration(s.minutes)}`,
              meta: `${s.topic} \xB7 ${s.kind === "deep" ? "deep session" : "habit loop"}`,
              trailing: /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), alignItems: "center" }, children: [
                /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: s.intent }),
                /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Change" })
              ] })
            }
          ),
          i < persona.sessions.length - 1 ? /* @__PURE__ */ jsx8(Divider, { theme }) : null
        ] }, `${s.app}-${i}`)) }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: persona.tiers.includes("C") ? "Session labels stay on this device and are used to score your own sessions, never to train anything shared." : "Without the browser extension Mirror cannot see what a session was about \u2014 only that it happened, and for how long." })
      ] })
    }
  );
}
function DiscoveryScreen({ theme, persona, state, tab }) {
  const rabbit = persona.sessions.filter((s) => s.kind === "habit");
  const minutes = rabbit.reduce((a, s) => a + s.minutes, 0);
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Discovery Journey",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Discovery Journey",
          subtitle: "Exploration vs. exploitation, route by route",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Discovery options: what counts as a rabbit hole", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], available: [], feature: "Rabbit-hole detection", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs6(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Rabbit holes", caption: "definition shown, not implied" }),
          /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: "A rabbit hole here is three or more consecutive short sessions on the same app with no search, no save and no cross-app follow-up." }),
          /* @__PURE__ */ jsx8(Divider, { theme }),
          rabbit.length === 0 ? /* @__PURE__ */ jsx8(EmptyState, { theme, title: "No rabbit holes this week", body: "Nothing met the definition. That is a real result, not a missing signal." }) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
            /* @__PURE__ */ jsx8(Stat, { theme, value: duration(minutes), label: "in habit loops this week", hint: `${rabbit.length} sessions met the definition` }),
            /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row", marginTop: theme.space(3) }, children: /* @__PURE__ */ jsxs6(LinkButton, { theme, children: [
              "Show the ",
              rabbit.length,
              " sessions"
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Exploration this week" }),
          /* @__PURE__ */ jsx8(
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
function WhatIfScreen({ theme, persona, state, tab }) {
  const baseline = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  const scenarios = [
    { label: "Remove short video", delta: -0.18, note: "Assumes the minutes are not replaced by another app \u2014 they usually are, partially." },
    { label: "Cap feed sessions at 10 min", delta: -0.11, note: "Applied to sessions longer than the cap, using your own distribution." },
    { label: "Enable quiet hours 22:00\u201307:00", delta: -0.07, note: "Counts only usage inside the window." }
  ];
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "What if",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "What if",
          subtitle: "Computed on this device from your own history",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "What-if options: change the scenarios", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], available: [], feature: "What-if scenarios", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs6(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: `Baseline: ${duration(baseline)}`, caption: "last 7 days" }),
          scenarios.map((s) => /* @__PURE__ */ jsxs6(View, { style: { marginBottom: theme.space(3) }, children: [
            /* @__PURE__ */ jsx8(Meter, { theme, value: 1 + s.delta, label: s.label, caption: `${Math.round(s.delta * 100)}%` }),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: s.note }),
            /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Change this scenario" })
          ] }, s.label))
        ] }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: "What-if is a calculation over your history, not a prediction. Mirror does not forecast behaviour and does not turn these into goals on your behalf." })
      ] })
    }
  );
}
function FocusScreen({ theme, persona, state, tab }) {
  const canMeasure = canSupply(persona, ["D"], ["A", "B", "C"]);
  const empty = state === "empty" || !canMeasure;
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Focus",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(Toolbar, { theme, title: "Focus windows", subtitle: "You choose; Mirror only reminds you of your own choice" }),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx8(
          NothingYet,
          {
            theme,
            needs: ["D"],
            anyOf: ["A", "B", "C"],
            available: persona.tiers,
            feature: "Focus windows",
            actionLabel: "Connect a source"
          }
        ) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Scheduled", caption: "local notifications only" }),
            /* @__PURE__ */ jsx8(
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
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Did the window hold?", caption: "measured, not assumed" }),
            /* @__PURE__ */ jsx8(
              FactList,
              {
                theme,
                items: [
                  { label: "Times you returned early", value: "2 of 5", detail: "Counted from launches inside the window, tier D." },
                  { label: "What you returned to", value: "a feed, twice", detail: "Needs a tier A/B/C signal; shown only because you have one." },
                  { label: "Prompts sent", value: "0", detail: "A window reminder is a local notification you scheduled, not a nudge." }
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "How it behaves" }),
            /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: "A focus window does not block apps and does not shame you when you leave it. It shows one line when you return and nothing else. You can delete the window in one tap." }),
            /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3) }, children: [
              /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", children: "Add a window" }),
              /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Remove all" })
            ] })
          ] }),
          /* @__PURE__ */ jsx8(Callout, { theme, children: "Focus windows need tier D for the schedule and one of tier A/B/C to say whether the time held. Never more, and never a guess when the second half is missing." })
        ] })
      ] })
    }
  );
}
function ProfileScreen({ theme, persona, state, tab }) {
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Behavior Profile",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Behavior Profile",
          subtitle: "Descriptions of what you did, never diagnoses",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Profile options: recompute and export", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        state === "empty" ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], available: [], feature: "Behaviour profile", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs6(Card, { theme, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Traits", caption: "each with the evidence it came from" }),
          persona.traits.map((trait) => /* @__PURE__ */ jsxs6(View, { style: { marginBottom: theme.space(4) }, children: [
            /* @__PURE__ */ jsx8(Text2, { role: "title", theme, children: trait.label }),
            /* @__PURE__ */ jsx8(Text2, { role: "body", theme, children: trait.value }),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: trait.evidence }),
            /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row" }, children: /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Show the raw events" }) })
          ] }, trait.label))
        ] }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: "These are estimates from behaviour, not a personality test and not a clinical instrument. Mirror will not label you as anything you cannot see the evidence for." })
      ] })
    }
  );
}
function WeeklyReportScreen({ theme, persona, state, tab }) {
  const total = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Weekly Report + Goals",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Weekly Report + Goals",
          subtitle: "Built on this device, printed on request",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Report options: week and sections", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        state === "empty" ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], available: [], feature: "Weekly report", actionLabel: "Grant usage access" }) : null,
        /* @__PURE__ */ jsxs6(Card, { theme, elevated: true, style: state === "empty" ? { display: "none" } : void 0, children: [
          /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "WEEK 42" }),
          /* @__PURE__ */ jsx8(Text2, { role: "headline", theme, style: { marginTop: theme.space(1) }, children: `${duration(total)} on screen` }),
          /* @__PURE__ */ jsx8(Text2, { role: "label", theme, style: { marginTop: theme.space(2) }, children: `${Math.round(persona.intentionalShare * 100)}% deliberate \xB7 ${persona.topics.length} topics tracked \xB7 ${persona.budgets.filter((b) => b.actual <= b.target).length}/${persona.budgets.length} budgets inside` }),
          /* @__PURE__ */ jsx8(Divider, { theme }),
          /* @__PURE__ */ jsx8(Sparkline, { theme, values: persona.weeklyMinutes, label: "Daily totals for the reported week" })
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Sections", caption: "what is included, and what is not" }),
          /* @__PURE__ */ jsx8(
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
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Goals you set", caption: "targets, not streaks" }),
          persona.goals.map((goal) => /* @__PURE__ */ jsxs6(View, { style: { marginBottom: theme.space(4) }, children: [
            /* @__PURE__ */ jsx8(
              Meter,
              {
                theme,
                value: goal.progress,
                label: goal.label,
                caption: `${Math.round(goal.progress * 100)}% of ${goal.target}`,
                tone: goal.progress >= 0.8 ? "anchor" : "muted"
              }
            ),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: goal.note })
          ] }, goal.label)),
          /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "A missed goal is a missed goal. Nothing resets, nothing turns red, and there is no counter of the days you kept it." })
        ] }),
        /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", children: "Preview the share card" }),
          /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Export PDF" })
        ] })
      ] })
    }
  );
}
function BudgetScreen({ theme, persona, state, tab }) {
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Attention budget",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Attention budget",
          subtitle: "Soft limits, never red, never a streak",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Budget options: units and reset", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        state === "empty" || persona.budgets.length === 0 ? /* @__PURE__ */ jsx8(Card, { theme, children: /* @__PURE__ */ jsx8(
          EmptyState,
          {
            theme,
            title: "No budgets yet",
            body: "A budget is a number you choose. Mirror will not suggest one, because a suggestion is a nudge.",
            action: /* @__PURE__ */ jsx8(Pill, { theme, children: "Set a budget" })
          }
        ) }) : persona.budgets.map((b) => {
          const over = b.actual > b.target;
          return /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: b.label, caption: `${b.target} ${b.unit} target` }),
            /* @__PURE__ */ jsx8(Stat, { theme, value: String(b.actual), unit: b.unit.split("/")[0], label: "last 7 days average", hint: over ? `Over by ${b.actual - b.target} \u2014 shown as a number, not a warning` : "Inside the budget" }),
            /* @__PURE__ */ jsx8(View, { style: { marginTop: theme.space(3) }, children: /* @__PURE__ */ jsx8(Meter, { theme, value: Math.min(1, b.actual / (b.target * 1.5)), label: "usage against target", caption: `${Math.round(b.actual / b.target * 100)}%`, tone: over ? "muted" : "anchor" }) }),
            /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row" }, children: /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Adjust this budget" }) })
          ] }, b.label);
        }),
        /* @__PURE__ */ jsx8(Callout, { theme, children: "Budgets are stored on this device and are never sent anywhere, not even as an aggregate." })
      ] })
    }
  );
}
function PrivacyCentreScreen({ theme, persona, tab }) {
  const [sheet, setSheet] = React2.useState(null);
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Privacy Center",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(Toolbar, { theme, title: "Privacy Center", subtitle: "Nothing here is a promise you cannot check" }),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      overlay: /* @__PURE__ */ jsxs6(Fragment2, { children: [
        /* @__PURE__ */ jsx8(Sheet, { theme, open: sheet === "receipt", title: "Privacy receipt", subtitle: "This month, from the on-device log", onClose: () => setSheet(null), children: /* @__PURE__ */ jsx8(
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
        /* @__PURE__ */ jsx8(Sheet, { theme, open: sheet === "matrix", title: "What Mirror can see", subtitle: "By data tier", onClose: () => setSheet(null), children: /* @__PURE__ */ jsx8(CapabilityMatrix, { theme, available: persona.tiers, rows: persona.connected }) })
      ] }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Retention", caption: "you set it; the default is 90 days" }),
          /* @__PURE__ */ jsx8(
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
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Network log", caption: "every request this device made" }),
          persona.networkLog.length === 0 ? /* @__PURE__ */ jsxs6(Fragment2, { children: [
            /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "0 requests. Privacy Mode is on, so nothing has left this device since it was installed." }),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: "This list is written from the app's own request layer, not from a server-side report \u2014 the one thing a server could not be trusted to tell you." })
          ] }) : persona.networkLog.map((entry) => /* @__PURE__ */ jsx8(
            ListRow,
            {
              theme,
              title: entry.host,
              meta: `${entry.when} \xB7 ${entry.why}`,
              trailing: /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: `${entry.bytes} B` })
            },
            `${entry.when}-${entry.host}`
          )),
          /* @__PURE__ */ jsx8(Divider, { theme }),
          /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "Every line is a request Mirror made. If a line is missing, it did not happen." })
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Check it yourself" }),
          /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", onPress: () => setSheet("receipt"), children: "Open receipt" }),
            /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", onPress: () => setSheet("matrix"), children: "Capability matrix" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Delete", caption: "one tap, no confirmation maze" }),
          /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: "Deleting erases the local database, including every imported export and every label you wrote. Mirrors of nothing exist elsewhere: there is no server copy to chase." }),
          /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3) }, children: /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Delete all data" }) })
        ] })
      ] })
    }
  );
}
function PublicProfileScreen({ theme, persona, state, tab }) {
  const published = state === "empty" ? [] : persona.topics.slice(0, 1);
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Public Profile editor",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(Toolbar, { theme, title: "Public Profile editor", subtitle: "Edit, with a live preview of what a match sees" }),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(BoundaryToggle, { theme, value: "public", onChange: () => void 0, consequence: "Public. Visible to others: the topics you published, and a coarse activity bucket. Nothing else." }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Editing what is published", caption: "each row is one decision, reversible in one tap" }),
          persona.topics.length === 0 ? /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: "No topics yet. A topic appears here once there is enough on-device evidence to describe it, and it stays private until you publish it." }) : persona.topics.slice(0, 3).map((topic, i) => /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space(3), marginBottom: theme.space(3) }, children: [
            /* @__PURE__ */ jsxs6(View, { style: { flexShrink: 1 }, children: [
              /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: topic.name }),
              /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: `depth ${topic.depth} \xB7 shares \u201C${topic.depth > 60 ? "deep interest" : "exploring"}\u201D and nothing else` })
            ] }),
            /* @__PURE__ */ jsx8(Pill, { theme, variant: i === 0 ? "primary" : "quiet", children: i === 0 ? "Published" : "Private" })
          ] }, topic.name))
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, elevated: true, children: [
          /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "LIVE PREVIEW \xB7 WHAT A MATCH SEES" }),
          /* @__PURE__ */ jsx8(Text2, { role: "title-lg", theme, children: persona.name }),
          /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: published.length ? `${published.length} topic published` : "Nothing published yet" }),
          /* @__PURE__ */ jsx8(Divider, { theme }),
          published.length ? published.map((t) => /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", alignItems: "center", gap: theme.space(2) }, children: [
            /* @__PURE__ */ jsx8(TierBadge, { tier: t.tier[0] ?? "D", ghost: true, theme }),
            /* @__PURE__ */ jsx8(Text2, { role: "body", theme, children: t.name }),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: t.depth > 60 ? "deep interest" : "exploring" })
          ] }, t.name)) : persona.topics.length === 0 ? (
            // "Nothing published" and "nothing you *could* publish" are different
            // states: without topic data there is no choice to make yet, and the
            // screen has to say which of the two the user is in.
            /* @__PURE__ */ jsx8(
              DegradedNotice,
              {
                theme,
                needs: ["A", "B", "C"],
                available: persona.tiers,
                feature: "Publishing a topic",
                actions: /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Connect a source" })
              }
            )
          ) : /* @__PURE__ */ jsx8(EmptyState, { theme, title: "Nothing is public", body: "A public profile starts empty. Topics are published one at a time, and each one shows what exactly would be shared." })
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Never shared, under any setting" }),
          /* @__PURE__ */ jsx8(
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
function MatchesScreen({ theme, persona, state, tab }) {
  const socialOn = isOn(initialFlags, "socialMatching") && state !== "empty";
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Matches / Chat",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(Toolbar, { theme, title: "Matches / Chat", subtitle: "Off by default, and not required to use Mirror" }),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        !socialOn ? /* @__PURE__ */ jsx8(Card, { theme, children: /* @__PURE__ */ jsx8(
          EmptyState,
          {
            theme,
            title: "Matching is off",
            body: "Mirror is complete without it. If you turn it on, matching uses only the topics you publish, one by one \u2014 never your watch, search or purchase history, and never your raw usage.",
            action: /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap", justifyContent: "center" }, children: [
              /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", children: "See what would be shared" }),
              /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Leave it off" })
            ] })
          }
        ) }) : null,
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "What matching can use", caption: "published topics only \u2014 and this list is the whole list" }),
          /* @__PURE__ */ jsx8(
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
        socialOn && persona.chat ? /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: persona.chat.with, caption: `matched on ${persona.chat.topic}` }),
          persona.chat.messages.map((m, i) => /* @__PURE__ */ jsx8(View, { style: { marginBottom: theme.space(2), alignItems: m.from === "you" ? "flex-end" : "flex-start" }, children: /* @__PURE__ */ jsxs6(View, { style: { maxWidth: "86%" }, children: [
            /* @__PURE__ */ jsx8(Text2, { role: "body", theme, children: m.text }),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: m.from === "you" ? "you" : "them" })
          ] }) }, i)),
          /* @__PURE__ */ jsx8(Divider, { theme }),
          /* @__PURE__ */ jsx8(
            FactList,
            {
              theme,
              items: [
                { label: "Shared in this chat", value: "what you type", detail: "Plus the published topic you both matched on." },
                { label: "Not shared", value: "anything measured", detail: "No totals, no session counts, no app names, no history." },
                { label: "Stored", value: "on this device", detail: "Messages are kept locally; deleting the match deletes them." }
              ]
            }
          )
        ] }) : null,
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: "Mirror will not notify you to come back, will not show who viewed you, and will not rank people by how much they use their phone." }),
        persona.topics.length === 0 ? (
          // Off is not the same as ready-to-turn-on. Without topic data there is
          // nothing to match on, and turning the switch on would produce an empty
          // list the user could read as "no one is interested".
          /* @__PURE__ */ jsx8(
            DegradedNotice,
            {
              theme,
              needs: ["A", "B", "C"],
              available: persona.tiers,
              feature: "Matching once you turn it on",
              actions: /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Connect a source" })
            }
          )
        ) : null
      ] })
    }
  );
}
function DepthScreen({ theme, persona, state, tab }) {
  const canMeasure = canSupply(persona, ["D"], ["A", "B", "C"]);
  const empty = state === "empty" || !canMeasure;
  const bands = persona.depthBands;
  const under8 = bands[0]?.share ?? 0;
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Depth",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Depth",
          subtitle: "How far into things you actually got",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Depth options: range and sequence", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], anyOf: ["A", "B", "C"], available: persona.tiers, feature: "Depth", actionLabel: "Connect a source" }) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsxs6(Card, { theme, elevated: true, children: [
            /* @__PURE__ */ jsx8(Definition, { theme, term: "depth", children: /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: `Depth is how long a single visit lasts, measured from the operating system's own session boundaries. It is a duration, not a judgement: a long visit to something you chose is the point, and a long visit you did not choose still counts as long.` }) }),
            /* @__PURE__ */ jsx8(Divider, { theme }),
            /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(4), alignItems: "flex-end" }, children: [
              /* @__PURE__ */ jsx8(Stat, { theme, value: `${Math.round(under8 * 100)}%`, label: "of visits end under 8 s", hint: "tier D" }),
              /* @__PURE__ */ jsx8(Stat, { theme, value: `${Math.round((bands[4]?.share ?? 0) * 100)}%`, label: "last more than 20 min", hint: "tier D" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Visit length this week", caption: "every visit, not a sample" }),
            bands.map((band) => /* @__PURE__ */ jsx8(View, { style: { marginBottom: theme.space(3) }, children: /* @__PURE__ */ jsx8(
              Meter,
              {
                theme,
                value: band.share,
                label: `${band.label} \u2014 ${band.note}`,
                caption: `${Math.round(band.share * 100)}%`,
                tone: band.label === "under 8 s" ? "muted" : "anchor"
              }
            ) }, band.label))
          ] }),
          persona.topics.length === 0 ? /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "What the long visits were about", caption: "needs topic data" }),
            /* @__PURE__ */ jsx8(
              NothingYet,
              {
                theme,
                needs: ["A", "B", "C"],
                available: persona.tiers,
                feature: "Depth by topic",
                actionLabel: "Import an export"
              }
            )
          ] }) : /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Deepest visits", caption: "the subject each one was about" }),
            persona.sessions.filter((s) => s.kind === "deep").slice(0, 3).map((s) => /* @__PURE__ */ jsx8(
              ListRow,
              {
                theme,
                title: `${s.minutes} min \xB7 ${s.app}`,
                meta: s.topic === "\u2014" ? "no topic attached (tier D)" : s.topic,
                leading: /* @__PURE__ */ jsx8(TierBadge, { tier: s.topic === "\u2014" ? "D" : "C", ghost: true, theme })
              },
              `${s.app}-${s.minutes}`
            ))
          ] }),
          /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "Mirror can measure how long a visit lasted. It cannot measure whether the visit was any good for you, so it will not label a video, a post or an app as deep, shallow, useful or wasted." }) })
        ] })
      ] })
    }
  );
}
function CuriosityHabitScreen({ theme, persona, state, tab }) {
  const canMeasure = canSupply(persona, ["D"], ["A", "B", "C"]);
  const empty = state === "empty" || !canMeasure;
  const { deepHours, habitHours, switchesPerHour, note } = persona.curiosity;
  const total = deepHours + habitHours || 1;
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Curiosity vs habit",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Curiosity vs habit",
          subtitle: "Two ways the same hour gets spent",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Curiosity options: what counts as habit", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], anyOf: ["A", "B", "C"], available: persona.tiers, feature: "Curiosity vs habit", actionLabel: "Connect a source" }) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(Definition, { theme, term: "habit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: `A habit block is time in a feed you reached without searching for anything, made of visits under three minutes. Curiosity is everything else you attended to on purpose \u2014 a search, a saved item, a long read.` }) }),
            /* @__PURE__ */ jsx8(Divider, { theme }),
            /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, children: [
              /* @__PURE__ */ jsx8(Stat, { theme, value: `${deepHours}h`, label: "curiosity", hint: "chosen starts" }),
              /* @__PURE__ */ jsx8(Stat, { theme, value: `${habitHours}h`, label: "habit", hint: "feed drift" })
            ] }),
            /* @__PURE__ */ jsx8(View, { style: { marginTop: theme.space(3) }, children: /* @__PURE__ */ jsx8(
              Meter,
              {
                theme,
                value: deepHours / total,
                label: "curiosity share of attended time",
                caption: `${Math.round(deepHours / total * 100)}%`
              }
            ) }),
            /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, style: { marginTop: theme.space(2) }, children: `${switchesPerHour} app switches per hour.` })
          ] }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Where the habit minutes were", caption: "by app, no content read" }),
            persona.budgets.map((b) => /* @__PURE__ */ jsx8(View, { style: { marginBottom: theme.space(3) }, children: /* @__PURE__ */ jsx8(
              Meter,
              {
                theme,
                value: Math.min(1, b.actual / Math.max(b.target, 1)),
                label: b.label,
                caption: `${b.actual} / ${b.target} ${b.unit}`,
                tone: b.actual > b.target ? "muted" : "anchor"
              }
            ) }, b.label))
          ] }),
          /* @__PURE__ */ jsx8(Callout, { theme, tone: "neutral", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: note }) }),
          /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "Habit is not a failure and Mirror will not frame it as one. There is no streak to break here, no red state, and no message telling you to do better." }) })
        ] })
      ] })
    }
  );
}
function IqsScreen({ theme, persona, state, tab }) {
  const empty = state === "empty";
  const iqs = persona.iqs;
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "IQS",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Interest quality",
          subtitle: "A composite, never a verdict",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "IQS options: parts and weights", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], available: [], feature: "IQS", actionLabel: "Grant usage access" }) : /* @__PURE__ */ jsx8(Card, { theme, elevated: true, children: /* @__PURE__ */ jsx8(
          ScoreBlock,
          {
            theme,
            title: "Interest Quality Score",
            score: iqs.value,
            band: iqs.band,
            parts: iqs.parts,
            caveat: iqs.caveat,
            action: /* @__PURE__ */ jsx8(LinkButton, { theme, children: "Why this score" })
          }
        ) }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "IQS is an estimate from behaviour on this device. It is not a diagnosis, not a personality test, and not comparable between people \u2014 the band exists because a single number invites exactly that comparison." }) })
      ] })
    }
  );
}
function RabbitHoleScreen({ theme, persona, state, tab }) {
  const canMeasure = canSupply(persona, ["D"], ["A", "B", "C"]);
  const empty = state === "empty" || !canMeasure;
  const rabbit = persona.rabbit;
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Rabbit hole",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Rabbit hole",
          subtitle: "Drift, defined so you can disagree with it",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Rabbit hole options: change the definition", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(Definition, { theme, term: "rabbit hole", children: /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: "Five or more visits to the same feed within twenty minutes where each visit is under three minutes and no search started it. You can loosen or tighten this below, and the count changes with it." }) }),
          /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap", marginTop: theme.space(3) }, children: [
            /* @__PURE__ */ jsx8(Chip, { label: "Visits", value: "5+", theme }),
            /* @__PURE__ */ jsx8(Chip, { label: "Window", value: "20 min", theme }),
            /* @__PURE__ */ jsx8(Chip, { label: "Visit length", value: "under 3 min", theme })
          ] })
        ] }),
        empty ? /* @__PURE__ */ jsx8(NothingYet, { theme, needs: ["D"], anyOf: ["A", "B", "C"], available: persona.tiers, feature: "Rabbit-hole detection", actionLabel: "Connect a source" }) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "This week", caption: "against the definition above" }),
            /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsx8(Stat, { theme, value: `${rabbit.sessions}`, label: "blocks that qualified" }),
              /* @__PURE__ */ jsx8(Stat, { theme, value: duration(rabbit.minutes), label: "inside them" }),
              /* @__PURE__ */ jsx8(Stat, { theme, value: `${Math.round(rabbit.lateNightShare * 100)}%`, label: "after 11pm" })
            ] }),
            /* @__PURE__ */ jsx8(Divider, { theme }),
            /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, children: rabbit.example })
          ] }),
          /* @__PURE__ */ jsxs6(Card, { theme, children: [
            /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "What Mirror will not do about it", caption: "the point of the screen" }),
            /* @__PURE__ */ jsx8(
              FactList,
              {
                theme,
                items: [
                  { label: "Block the feed", value: "not offered" },
                  { label: "Nudge you out of it", value: "only if you ask", detail: "An intent check you wrote yourself, one prompt, no repeat." },
                  { label: "Score you on it", value: "never" },
                  { label: "Show it publicly", value: "never", detail: "This number never appears on the public profile, in any form." }
                ]
              }
            )
          ] })
        ] })
      ] })
    }
  );
}
function ConnectionsScreen({ theme, persona, tab }) {
  const [boundary, setBoundary] = React2.useState("private");
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Connections",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Connections",
          subtitle: "Every source, and what each one cannot do",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Connection options: add a source", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\uFF0B" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(
          BoundaryToggle,
          {
            theme,
            value: boundary,
            onChange: setBoundary,
            consequence: boundary === "private" ? "Private. Connexions feed the private profile only. Nothing you connect here can be seen by a match." : "Public. Only topics you publish are shared \u2014 never a connected source, a watch history or a search."
          }
        ),
        /* @__PURE__ */ jsx8(CapabilityMatrix, { theme, available: persona.tiers, rows: persona.connected }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Revoking", caption: "one tap, no confirmation maze" }),
          /* @__PURE__ */ jsx8(
            FactList,
            {
              theme,
              items: [
                { label: "Usage access", value: "Android setting", detail: "Revocable in Android settings; Mirror notices and stops collecting within a minute." },
                { label: "Extension (tier C)", value: "per site", detail: "Allow-listed sites only; removing the extension stops tier C at the browser." },
                { label: "OAuth sources (tier A)", value: "per scope", detail: "Revoke in the provider too \u2014 Mirror deletes its copy either way." },
                { label: "Imports (tier B)", value: "delete any time", detail: "An import is a file you can remove without affecting the others." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "Mirror will never ask for an accessibility service, a screen recorder, an overlay or a notification listener. If a future version offers a source that needs one of those, it is not this product." }) })
      ] })
    }
  );
}
function WhyDrawerSheet({ theme, persona, tab }) {
  const sum = persona.whyParts.reduce((total, p) => total + p.points, 0);
  return /* @__PURE__ */ jsx8(
    Sheet,
    {
      open: true,
      theme,
      title: "Why this number",
      subtitle: "Every part that produced yesterday's total",
      onClose: () => void 0,
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(
          WhySheet,
          {
            theme,
            score: sum,
            maxScore: sum,
            components: persona.whyParts.map((p) => ({ label: p.label, points: p.points, note: p.note, tier: p.tier })),
            caveat: "The parts add up exactly, because a total you cannot take apart is not a measurement."
          }
        ),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "What is not in this number" }),
          /* @__PURE__ */ jsx8(
            FactList,
            {
              theme,
              items: [
                { label: "Content you watched", value: "not measured", detail: "Mirror cannot read it and does not try." },
                { label: "Whether any of it was good for you", value: "not measured" },
                { label: "Anything on another device", value: "not measured" }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "If a part is missing from this list, the number is smaller. Mirror never re-weights the parts to hide a gap." }) })
      ] })
    }
  );
}
function LearningArcsScreen({ theme, persona, state, tab }) {
  const empty = state === "empty" || persona.arcs.length === 0;
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Learning arcs",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Learning arcs",
          subtitle: "How a subject deepened, week by week",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Arc options: range and topics", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsx8(DataStanding, { theme, tiers: persona.tiers }),
        empty ? /* @__PURE__ */ jsx8(
          NothingYet,
          {
            theme,
            needs: ["A", "B", "C"],
            available: persona.tiers,
            feature: "Learning arcs",
            actionLabel: "Import an export"
          }
        ) : persona.arcs.map((arc) => /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ jsx8(Text2, { role: "title", theme, children: arc.topic }),
            /* @__PURE__ */ jsx8(Chip, { label: "stage", value: arc.stage, theme })
          ] }),
          /* @__PURE__ */ jsx8(View, { style: { marginTop: theme.space(2) }, children: /* @__PURE__ */ jsx8(
            Sparkline,
            {
              theme,
              values: arc.weeks,
              label: `${arc.topic}: depth over the last eight weeks, ${arc.weeks.join(", ")}`
            }
          ) }),
          /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, style: { marginTop: theme.space(2) }, children: arc.next }),
          /* @__PURE__ */ jsxs6(Text2, { role: "micro", tone: "muted", theme, children: [
            "from tier ",
            arc.sourceTier,
            " sources"
          ] })
        ] }, arc.topic)),
        !empty ? /* @__PURE__ */ jsx8(Callout, { theme, tone: "neutral", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "A stalled arc is a fact, not a failure \u2014 it is listed the same way as a growing one, and Mirror will not ask you to pick it back up." }) }) : null
      ] })
    }
  );
}
function AskSheet({ theme, persona, state, tab }) {
  const canAnswer = state !== "empty" && persona.askable.length > 0;
  return /* @__PURE__ */ jsx8(Sheet, { open: true, theme, title: "Ask Mirror", subtitle: "Answers come from this device, or not at all", onClose: () => void 0, children: /* @__PURE__ */ jsx8(
    AskComposer,
    {
      theme,
      value: "",
      onChange: () => void 0,
      onSubmit: () => void 0,
      suggestions: canAnswer ? persona.askable : [],
      canAnswer,
      blockedReason: canAnswer ? void 0 : "There is not enough on-device history to answer without guessing. Mirror will not guess."
    }
  ) });
}
function PrivacyReceiptSheet({ theme, persona, state, tab }) {
  const rows = persona.networkLog;
  const bytes = rows.reduce((total, r) => total + r.bytes, 0);
  const empty = state === "empty" || rows.length === 0;
  return /* @__PURE__ */ jsx8(Sheet, { open: true, theme, title: "Privacy receipt", subtitle: "Generated from the on-device request log", onClose: () => void 0, children: /* @__PURE__ */ jsx8(
    PrivacyReceipt,
    {
      theme,
      periodLabel: "October",
      rows: empty ? [
        { label: "Sent this month", value: "0 B", detail: "Privacy Mode has never made an outbound request." },
        { label: "Requests logged", value: "0" }
      ] : [
        { label: "Sent this month", value: `${Math.round(bytes / 1024)} KB`, detail: `${rows.length} requests, all of them yours.` },
        { label: "Raw events sent", value: "0", detail: "Titles, searches and timestamps stay here." },
        ...rows.slice(0, 3).map((r) => ({ label: r.host, value: `${r.bytes} B`, detail: `${r.when} \u2014 ${r.why}` }))
      ],
      zeroCopy: empty ? "In Privacy Mode this list is empty by construction: there is nothing to itemise because nothing was sent." : "Every line here is a request Mirror made. If a line is missing, it did not happen."
    }
  ) });
}
function PersonaPickerSheet({ theme, persona, tab }) {
  return /* @__PURE__ */ jsx8(Sheet, { open: true, theme, title: "Demo persona", subtitle: "Which data the screens are built from", onClose: () => void 0, children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
    /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "Demo data replaces your own while it is on. It is never mixed with it, never written to storage, and turning it off restores your real numbers unchanged." }) }),
    PERSONAS.map((p) => /* @__PURE__ */ jsx8(
      ListRow,
      {
        theme,
        title: `${p.name}${p.id === persona.id ? " \xB7 showing now" : ""}`,
        meta: p.blurb,
        leading: /* @__PURE__ */ jsx8(TierBadge, { tier: p.tiers[p.tiers.length - 1] ?? "D", ghost: true, theme }),
        trailing: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, style: { fontWeight: "600" }, children: p.tiers.join("") })
      },
      p.id
    )),
    /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2) }, children: [
      /* @__PURE__ */ jsx8(Pill, { theme, variant: persona.id === "ananya" ? "primary" : "quiet", children: "Ananya \xB7 tier D" }),
      /* @__PURE__ */ jsx8(Pill, { theme, variant: persona.id === "rehan" ? "primary" : "quiet", children: "Rehan \xB7 D+B+C" }),
      /* @__PURE__ */ jsx8(Pill, { theme, variant: persona.id === "mei" ? "primary" : "quiet", children: "Mei \xB7 all tiers" })
    ] })
  ] }) });
}
function IntentCheckScreen({ theme, persona, tab }) {
  return /* @__PURE__ */ jsx8(
    Screen,
    {
      demo: persona.name,
      title: "Intent check",
      theme,
      padded: true,
      header: /* @__PURE__ */ jsx8(
        Toolbar,
        {
          theme,
          title: "Intent check",
          subtitle: "One question, only if you asked for it",
          actions: /* @__PURE__ */ jsx8(IconButton, { label: "Intent check options: timing and quiet hours", theme, children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "\u22EF" }) })
        }
      ),
      footer: /* @__PURE__ */ jsx8(TabFooter, { theme, active: tab ?? "home" }),
      children: /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(3) }, children: [
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Where Mirror may ask", caption: "off unless you turn it on" }),
          persona.intents.map((intent) => /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space(3), marginBottom: theme.space(3) }, children: [
            /* @__PURE__ */ jsxs6(View, { style: { flexShrink: 1 }, children: [
              /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: intent.label }),
              /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: intent.note })
            ] }),
            /* @__PURE__ */ jsx8(Pill, { theme, variant: intent.ask ? "primary" : "quiet", children: intent.ask ? "Asks" : "Silent" })
          ] }, intent.label))
        ] }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Quiet hours", caption: "no prompt can fire inside them" }),
          /* @__PURE__ */ jsx8(
            FactList,
            {
              theme,
              items: [
                { label: "Quiet hours", value: "22:00 \u2013 07:00", detail: "Local time, on this device. Nothing fires overnight." },
                { label: "Maximum prompts", value: "1 per day", detail: "Never repeated inside a session." },
                { label: "Prompt style", value: "local notification", detail: "No push service, no server, no tracking pixel." }
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "The intent check exists to hold a decision you already made, once. It is not a reminder to use Mirror, it never counts how many times you followed it, and turning it off is one tap with no \u201Care you sure\u201D." }) }),
        /* @__PURE__ */ jsxs6(Card, { theme, children: [
          /* @__PURE__ */ jsx8(SectionHeader, { theme, title: "Where your intent labels go" }),
          /* @__PURE__ */ jsx8(
            FactList,
            {
              theme,
              items: [
                { label: "Stored", value: "on this device" },
                { label: "Trains", value: "a local model" },
                { label: "Shared", value: "never", detail: "Intent labels are excluded from the public profile and from matches." }
              ]
            }
          )
        ] })
      ] })
    }
  );
}
function ShareCardState({ theme, persona, tab }) {
  return /* @__PURE__ */ jsxs6(View, { style: { flex: 1, backgroundColor: theme.color.scrim, justifyContent: "center", padding: theme.space(5), gap: theme.space(3) }, children: [
    /* @__PURE__ */ jsx8(
      BoundaryToggle,
      {
        theme,
        value: "private",
        onChange: () => void 0,
        consequence: "Private. This card is a preview; nothing leaves the device until you tap Share, and the preview is the whole card."
      }
    ),
    /* @__PURE__ */ jsxs6(Card, { theme, elevated: true, style: { backgroundColor: theme.color.card }, children: [
      /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "PRIVATE \xB7 PREVIEW ONLY" }),
      /* @__PURE__ */ jsx8(Text2, { role: "headline", theme, style: { marginTop: theme.space(2) }, children: `${duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))} with ${persona.topics[0]?.name ?? "one habit loop"} in the middle` }),
      /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, style: { marginTop: theme.space(2) }, children: `${Math.round(persona.intentionalShare * 100)}% deliberate \xB7 week 42` }),
      /* @__PURE__ */ jsx8(Divider, { theme }),
      /* @__PURE__ */ jsx8(
        FactList,
        {
          theme,
          items: [
            { label: "App names on the card", value: "none" },
            { label: "Topics on the card", value: persona.topics.length ? "one, chosen by you" : "none" },
            { label: "Totals", value: "private, never on a shared card" }
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx8(Text2, { role: "micro", theme, style: { color: theme.color.inkMuted, textAlign: "center" }, children: "Nothing is shared until you tap Share, and this preview shows the whole card \u2014 there is no second version." }),
    /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), justifyContent: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", children: "Keep private" }),
      /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Share this card" })
    ] })
  ] });
}
function WidgetItem({ theme, persona, tab }) {
  return /* @__PURE__ */ jsxs6(View, { style: { flex: 1, backgroundColor: theme.color.canvas, padding: theme.space(5), gap: theme.space(4) }, children: [
    /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, style: { paddingTop: theme.space(4) }, children: "HOME SCREEN \xB7 AS IT WOULD APPEAR" }),
    /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(3), flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx8(
        WidgetPreview,
        {
          theme,
          size: "medium",
          variant: "private",
          title: "This week",
          value: duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0)),
          caption: "private widget \xB7 totals only",
          bars: persona.weeklyMinutes
        }
      ),
      /* @__PURE__ */ jsx8(
        WidgetPreview,
        {
          theme,
          size: "small",
          variant: "private",
          title: "Intentional",
          value: `${Math.round(persona.intentionalShare * 100)}%`,
          caption: "private"
        }
      )
    ] }),
    /* @__PURE__ */ jsx8(View, { style: { flexDirection: "row", gap: theme.space(3), flexWrap: "wrap" }, children: /* @__PURE__ */ jsx8(
      WidgetPreview,
      {
        theme,
        size: "medium",
        variant: "public",
        title: "Following",
        value: persona.topics.length ? persona.topics[0].name : "nothing published",
        caption: "public widget \xB7 published topics only"
      }
    ) }),
    /* @__PURE__ */ jsx8(Callout, { theme, tone: "limit", children: /* @__PURE__ */ jsx8(Text2, { role: "label", theme, children: "A widget can sit on a lock screen. The private widget never shows an app name, a topic or a number a stranger could use, and the public widget only ever repeats what you already published." }) }),
    /* @__PURE__ */ jsxs6(View, { style: { gap: theme.space(2) }, children: [
      /* @__PURE__ */ jsx8(
        SegmentedControl,
        {
          theme,
          label: "Widget layout",
          value: "medium",
          onChange: () => void 0,
          options: [
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" }
          ]
        }
      ),
      /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", children: "Add to home screen" }),
        /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "Keep widgets private" })
      ] }),
      /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: "Widgets read from the on-device database only. Removing the widget does not remove any data, and adding it does not start any collection." })
    ] })
  ] });
}
function UpdateState({ theme, persona, tab }) {
  const { current, available, notes, bytes } = persona.update;
  return /* @__PURE__ */ jsx8(View, { style: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.color.scrim, padding: theme.space(3) }, children: /* @__PURE__ */ jsxs6(Card, { theme, elevated: true, children: [
    /* @__PURE__ */ jsx8(Text2, { role: "micro", tone: "muted", theme, children: `VERSION ${current} \u2192 ${available}` }),
    /* @__PURE__ */ jsx8(Text2, { role: "title", theme, style: { marginTop: theme.space(1) }, children: "An update is available" }),
    /* @__PURE__ */ jsx8(Text2, { role: "label", tone: "muted", theme, style: { marginTop: theme.space(1) }, children: notes }),
    /* @__PURE__ */ jsx8(Divider, { theme }),
    /* @__PURE__ */ jsx8(
      FactList,
      {
        theme,
        items: [
          { label: "Size", value: `${Math.round(bytes / 1e6)} MB` },
          { label: "New permissions", value: "none" },
          { label: "New data sent anywhere", value: "none" },
          { label: "Works offline", value: "yes", detail: "The update is a download; nothing about your data changes." }
        ]
      }
    ),
    /* @__PURE__ */ jsxs6(View, { style: { flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3), flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx8(Pill, { theme, variant: "secondary", children: "Later" }),
      /* @__PURE__ */ jsx8(Pill, { theme, variant: "quiet", children: "What changed" })
    ] })
  ] }) });
}
var PHASES = [
  { id: "P1", scope: "encrypted local storage, Android collector, ingestion, importers", items: ["J1", "J2"] },
  { id: "P2", scope: "scoring engine, dashboard, Why-this-score, release stage 1", items: ["J3", "J5", "J6", "J7", "J8", "J17", "J24"] },
  { id: "P3", scope: "interest evolution, discovery, rabbit holes, what-if, focus windows", items: ["J4", "J9", "J11", "J18", "J20", "J21", "J25"] },
  { id: "P4", scope: "behaviour profile, weekly report, attention budget, ask, widgets", items: ["J10", "J12", "J19", "J22", "J27"] },
  { id: "P5", scope: "OAuth connectors, consent dashboard, extension, privacy receipt, release stage 2", items: ["J13", "J14", "J23", "J28"] },
  { id: "P6", scope: "backend, encrypted sync, social layer, share cards, release stage 3", items: ["J15", "J16", "J26"] },
  { id: "P7", scope: "security review, store readiness, staged rollout, release stage 4", items: [] }
];
var SECTION_J = [
  { id: "J1", title: "Onboarding + privacy promise", kind: "screen" },
  { id: "J2", title: "Permission primers (Usage access, notifications)", kind: "screen" },
  { id: "J3", title: "Dashboard", kind: "screen" },
  { id: "J4", title: "Interest Evolution", kind: "screen" },
  { id: "J5", title: "Depth", kind: "screen" },
  { id: "J6", title: "Curiosity vs Habit", kind: "screen" },
  { id: "J7", title: "IQS", kind: "screen" },
  { id: "J8", title: "Sessions", kind: "screen" },
  { id: "J9", title: "Discovery Journey", kind: "screen" },
  { id: "J10", title: "Behavior Profile", kind: "screen" },
  { id: "J11", title: "Rabbit Hole", kind: "screen" },
  { id: "J12", title: "Weekly Report + Goals", kind: "screen" },
  { id: "J13", title: "Connections / Consent Dashboard (with capability matrix)", kind: "screen" },
  { id: "J14", title: "Privacy Center (network log, delete everything)", kind: "screen" },
  { id: "J15", title: "Public Profile editor (live preview)", kind: "screen" },
  { id: "J16", title: "Matches / Chat", kind: "screen" },
  { id: "J17", title: "Why drawer", kind: "sheet", parent: "dashboard" },
  { id: "J18", title: "What-if Simulator", kind: "screen" },
  { id: "J19", title: "Attention Budget", kind: "screen" },
  { id: "J20", title: "Focus Windows", kind: "screen" },
  { id: "J21", title: "Learning Arcs", kind: "screen" },
  { id: "J22", title: "Ask sheet", kind: "sheet", parent: "dashboard" },
  { id: "J23", title: "Privacy Receipt", kind: "sheet", parent: "privacy-center" },
  { id: "J24", title: "Demo persona picker", kind: "sheet", parent: "dashboard" },
  { id: "J25", title: "Intent Check settings", kind: "screen" },
  { id: "J26", title: "Private Share Card preview", kind: "state", parent: "weekly-report-goals" },
  { id: "J27", title: "Home-screen widget", kind: "widget", parent: "dashboard" },
  { id: "J28", title: '"Update available / app version" state (calm, non-blocking)', kind: "state", parent: "dashboard" }
];
var SCREENS = [
  { id: "J1", slug: "onboarding", title: "Onboarding + privacy promise", kind: "screen", phase: "P1", requires: [], states: ["default"], rule: "State the three promises before asking for anything.", Component: OnboardingScreen },
  { id: "J2", slug: "permission-primers", title: "Permission primers (Usage access, notifications)", kind: "screen", phase: "P1", requires: [], states: ["default"], rule: 'Explain each permission before the OS dialog, and make "not now" as easy as "allow".', Component: PermissionPrimerScreen },
  { id: "J3", slug: "dashboard", title: "Dashboard", kind: "screen", tab: "home", phase: "P2", requires: ["D"], states: ["default", "empty"], rule: "The measured reference layout \u2014 and an honest empty state instead of estimates.", Component: HomeScreen },
  { id: "J4", slug: "interest-evolution", title: "Interest Evolution", kind: "screen", tab: "journey", phase: "P3", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Interest evolution is only shown when topic-level data exists.", Component: JourneyScreen },
  { id: "J5", slug: "depth", title: "Depth", kind: "screen", tab: "insights", phase: "P2", requires: ["D"], requiresAnyOf: ["A", "B", "C"], states: ["default", "empty"], rule: "Show how long visits last, and refuse to call any visit good or wasted.", Component: DepthScreen },
  { id: "J6", slug: "curiosity-vs-habit", title: "Curiosity vs Habit", kind: "screen", tab: "insights", phase: "P2", requires: ["D"], requiresAnyOf: ["A", "B", "C"], states: ["default", "empty"], rule: "Name both halves of the week without framing habit as a failure.", Component: CuriosityHabitScreen },
  { id: "J7", slug: "iqs", title: "IQS", kind: "screen", tab: "insights", phase: "P2", requires: ["D"], states: ["default", "empty"], rule: "A composite score built only from parts that exist, with the band shown.", Component: IqsScreen },
  { id: "J8", slug: "sessions", title: "Sessions", kind: "screen", tab: "sessions", phase: "P2", requires: ["D"], states: ["default", "empty"], rule: "The user annotates their own sessions; labels stay local and train a local model.", Component: SessionsScreen },
  { id: "J9", slug: "discovery-journey", title: "Discovery Journey", kind: "screen", tab: "journey", phase: "P3", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Show the route a topic was reached by, step by step, with the tier of each step.", Component: DiscoveryScreen },
  { id: "J10", slug: "behavior-profile", title: "Behavior Profile", kind: "screen", tab: "you", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Descriptive traits with their evidence attached, never clinical labels.", Component: ProfileScreen },
  { id: "J11", slug: "rabbit-hole", title: "Rabbit Hole", kind: "screen", tab: "journey", phase: "P3", requires: ["D"], requiresAnyOf: ["A", "B", "C"], states: ["default", "empty"], rule: "Print the definition, let the user change it, and never punish what it finds.", Component: RabbitHoleScreen },
  { id: "J12", slug: "weekly-report-goals", title: "Weekly Report + Goals", kind: "screen", tab: "you", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "A local document plus goals the user set; no streaks, no nudges.", Component: WeeklyReportScreen },
  { id: "J13", slug: "connections", title: "Connections / Consent Dashboard (with capability matrix)", kind: "screen", tab: "you", phase: "P5", requires: [], states: ["default"], rule: "Every source with its capability matrix and a one-tap revoke.", Component: ConnectionsScreen },
  { id: "J14", slug: "privacy-center", title: "Privacy Center (network log, delete everything)", kind: "screen", tab: "you", phase: "P5", requires: [], states: ["default", "empty"], rule: "Retention, the network log, deletion and the receipt \u2014 all checkable in-app.", Component: PrivacyCentreScreen },
  { id: "J15", slug: "public-profile-editor", title: "Public Profile editor (live preview)", kind: "screen", tab: "you", phase: "P6", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Edit what is published with a live preview of exactly what a match sees.", Component: PublicProfileScreen },
  { id: "J16", slug: "matches-chat", title: "Matches / Chat", kind: "screen", tab: "you", phase: "P6", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "Social is off by default; chat shares nothing but what the user sent.", Component: MatchesScreen },
  { id: "J17", slug: "why-drawer", title: "Why drawer", kind: "sheet", parent: "dashboard", phase: "P2", requires: ["D"], states: ["default"], rule: "Every number opens into the parts that produced it, and the parts add up.", Component: WhyDrawerSheet },
  { id: "J18", slug: "what-if", title: "What-if Simulator", kind: "screen", tab: "insights", phase: "P3", requires: ["D"], states: ["default", "empty"], rule: "Counterfactuals are calculations over your history, never predictions.", Component: WhatIfScreen },
  { id: "J19", slug: "attention-budget", title: "Attention Budget", kind: "screen", tab: "you", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Budgets are chosen by the user and rendered as numbers, never alarms.", Component: BudgetScreen },
  { id: "J20", slug: "focus-windows", title: "Focus Windows", kind: "screen", tab: "you", phase: "P3", requires: ["D"], requiresAnyOf: ["A", "B", "C"], states: ["default", "empty"], rule: "Focus never blocks or shames; it repeats the choice you made.", Component: FocusScreen },
  { id: "J21", slug: "learning-arcs", title: "Learning Arcs", kind: "screen", tab: "journey", phase: "P3", requires: ["A", "B", "C"], states: ["default", "empty"], rule: "A stalled arc is reported exactly like a growing one.", Component: LearningArcsScreen },
  { id: "J22", slug: "ask-sheet", title: "Ask sheet", kind: "sheet", parent: "dashboard", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "Answer from local data or refuse \u2014 never guess, never call out.", Component: AskSheet },
  { id: "J23", slug: "privacy-receipt", title: "Privacy Receipt", kind: "sheet", parent: "privacy-center", phase: "P5", requires: [], states: ["default", "empty"], rule: "What left the device, in bytes, with the empty case explained rather than hidden.", Component: PrivacyReceiptSheet },
  { id: "J24", slug: "persona-picker", title: "Demo persona picker", kind: "sheet", parent: "dashboard", phase: "P2", requires: [], states: ["default"], rule: "Demo data replaces yours while it is on, and is never mixed with it.", Component: PersonaPickerSheet },
  { id: "J25", slug: "intent-check-settings", title: "Intent Check settings", kind: "screen", tab: "you", phase: "P3", requires: ["D"], states: ["default"], rule: "The only place Mirror may interrupt, off unless asked for, with quiet hours.", Component: IntentCheckScreen },
  { id: "J26", slug: "share-card-preview", title: "Private Share Card preview", kind: "state", parent: "weekly-report-goals", phase: "P6", requires: ["D"], states: ["default"], rule: "Preview the whole card; nothing is shared until the user shares it.", Component: ShareCardState },
  { id: "J27", slug: "home-widget", title: "Home-screen widget", kind: "widget", parent: "dashboard", phase: "P4", requires: ["D"], states: ["default", "empty"], rule: "A lock-screen surface: totals privately, published topics only in public.", Component: WidgetItem },
  { id: "J28", slug: "update-state", title: '"Update available / app version" state (calm, non-blocking)', kind: "state", parent: "dashboard", phase: "P5", requires: [], states: ["default"], rule: "Calm and non-blocking, and explicit that nothing new is collected.", Component: UpdateState }
];
var screensByPhase = (phase) => SCREENS.filter((s) => s.phase === phase);
var screensByKind = (kind) => SCREENS.filter((s) => s.kind === kind);
var screensByTab = (tab) => SCREENS.filter((s) => s.tab === tab);
var specBySlug = (slug) => SCREENS.find((s) => s.slug === slug);

// packages/ui/screens/render.tsx
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var OVERLAY = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };
function treeFor(spec, persona, theme, state = "default") {
  const Item = spec.Component;
  if (spec.kind === "screen" || spec.kind === "widget") {
    return /* @__PURE__ */ jsx9(Item, { theme, persona, state, tab: spec.tab });
  }
  const parentSpec = spec.parent ? specBySlug(spec.parent) : void 0;
  if (!parentSpec) {
    throw new Error(`${spec.id} ${spec.slug}: a ${spec.kind} needs a parent screen, and "${spec.parent}" is not in the inventory`);
  }
  const Parent = parentSpec.Component;
  return /* @__PURE__ */ jsxs7(View, { style: { flex: 1 }, children: [
    /* @__PURE__ */ jsx9(Parent, { theme, persona, state: "default", tab: parentSpec.tab }),
    /* @__PURE__ */ jsx9(View, { style: OVERLAY, children: /* @__PURE__ */ jsx9(Item, { theme, persona, state, tab: parentSpec.tab }) })
  ] });
}
function renderScreen(spec, persona, theme, state = "default") {
  return /* @__PURE__ */ jsx9(
    ThemeProvider,
    {
      initialTheme: theme.name,
      overrides: { reducedTransparency: theme.reducedTransparency, reducedMotion: theme.reducedMotion, textScale: 1 },
      followSystem: false,
      children: treeFor(spec, persona, theme, state)
    }
  );
}
var supplies = (spec, p) => spec.requires.every((tier) => p.tiers.includes(tier)) && (spec.requiresAnyOf?.length ? spec.requiresAnyOf.some((tier) => p.tiers.includes(tier)) : true);
function personaFor(spec, state = "default", all = PERSONAS) {
  const capable = all.find((p) => supplies(spec, p)) ?? all[0];
  if (state !== "empty" || spec.requires.length === 0 && !spec.requiresAnyOf?.length || !capable) return capable;
  const lacking = [...all].sort((a, b) => a.tiers.length - b.tiers.length).find((p) => !supplies(spec, p));
  return lacking ?? capable;
}
var isDegraded = (spec, persona) => !supplies(spec, persona);
function specFor(slug) {
  const spec = specBySlug(slug);
  if (!spec) throw new Error(`unknown screen "${slug}" (known: ${SCREENS.map((s) => s.slug).join(", ")})`);
  return spec;
}
function personaById(id, all = PERSONAS) {
  const persona = all.find((p) => p.id === id);
  if (!persona) throw new Error(`unknown persona "${id}" (known: ${all.map((p) => p.id).join(", ")})`);
  return persona;
}
function renderOne(slug, personaId, state = "default", themeName = "dark") {
  const spec = specFor(slug);
  const persona = personaById(personaId);
  const theme = createTheme(themeName);
  return { spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) };
}
function renderMatrix(options = {}) {
  const all = options.all ?? PERSONAS;
  const out = [];
  for (const spec of SCREENS) {
    if (options.screen && spec.slug !== options.screen) continue;
    for (const state of options.states ?? spec.states) {
      const persona = options.persona ?? personaFor(spec, state, all);
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
  AskSheet,
  Backdrop,
  BoundaryToggle,
  BudgetScreen,
  Callout,
  CapabilityMatrix,
  Card,
  Chip,
  ChipRow,
  ConfidenceChip,
  ConnectionsScreen,
  CuriosityHabitScreen,
  DEFAULT_THEME,
  DataStanding,
  Definition,
  DegradedNotice,
  DemoChip,
  DemoChip as DemoDataChip,
  DepthScreen,
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
  IntentCheckScreen,
  IqsScreen,
  JourneyScreen,
  LearningArcsScreen,
  LinkButton,
  ListRow,
  MIN_TOUCH_DP,
  MatchesScreen,
  Meter,
  NothingYet,
  OnboardingScreen,
  PERSONAS,
  PHASES,
  PermissionPrimer,
  PermissionPrimerScreen,
  PersonaPickerSheet,
  Pill,
  PrivacyCentreScreen,
  PrivacyReceipt,
  PrivacyReceiptSheet,
  ProfileScreen,
  PublicProfileScreen,
  ROLES,
  RabbitHoleScreen,
  Ring,
  SCREENS,
  SECTION_J,
  ScoreBlock,
  Screen,
  ScrollView,
  SectionHeader,
  SegmentedControl,
  SessionsScreen,
  ShareCardState,
  Sheet,
  Sparkline,
  Stat,
  StatusStrip,
  Surface,
  TAB_ITEMS as TABS,
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
  UpdateState,
  WeeklyReportScreen,
  WhatIfScreen,
  WhyDrawerSheet,
  WhySheet,
  WidgetItem,
  WidgetPreview,
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
  isDegraded,
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
  screensByKind,
  screensByPhase,
  screensByTab,
  shortDay,
  specBySlug,
  specFor,
  tierLabel,
  tierSummary,
  toHex,
  tokenMeta,
  touchTarget,
  treeFor,
  useLiveBlur,
  useTheme,
  useThemeControls
};
