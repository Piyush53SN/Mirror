/**
 * Hand-authored palette layer for the redesign (Stage 2).
 *
 * The generated tokens (tokens/index.ts, from the reference image) stay the source for the
 * measured greys and type. This file adds the hue the redesign uses: a navy-indigo dark
 * backdrop, a pale airy light backdrop, teal-to-indigo for the gauge, and a category palette
 * for charts. createTheme() applies it on top, so `npm run tokens` never overwrites it.
 *
 * Rules that the rendered contrast test enforces (packages/ui/tests/rendered-contrast.test.mjs):
 *   - body text 4.5:1 and large text 3:1 on the effective background of its surface;
 *   - every chart category is at least 3:1 against the tile it sits on;
 *   - colour never means good or bad. The categories are only for telling apart.
 */

export type ThemeKey = 'dark' | 'light';

export type GlowSpec = { x: number; y: number; r: number; color: string; alpha: number };

export type Palette = {
  /** Backdrop gradient, top to bottom (diagonal start -> end in the Backdrop). */
  gradient: readonly string[];
  glows: readonly GlowSpec[];
  /** Solid fill used when transparency is reduced. */
  glassSolid: string;
  hairline: string;
  shadow: string;
  /** Hero tile: solid, so text on it is never over a translucent layer. */
  heroFill: string;
  heroInk: string;
  heroMuted: string;
  /** Gauge gradient: a single hue family, teal to indigo. Never red or green. */
  gauge: readonly [string, string];
  /** Category colours for charts. Each one is >= 3:1 against its tile. */
  chart: readonly string[];
  /** Optional muted-ink override for this appearance (keeps muted text >= 4.5:1 on glass). */
  inkMuted?: string;
  grainAlpha: number;
  /** Shared glass panel: a translucent tint over the backdrop (never a flat grey). */
  panelTint: string;
  /** The same panel with reduced transparency: solid, same hue family. */
  panelSolid: string;
  /** Soft top highlight laid over the top of a panel. Gradient only, no blur. */
  panelHighlight: string;
  /** Floating tab bar tint. Mostly opaque so scrolling text under it stays readable. */
  tabbarTint: string;
  /** Soft coloured glows behind cards. Gradients that fade to transparent. Neutral hues only. */
  glowTeal: string;
  glowViolet: string;
  glowIndigo: string;
  /** Primary button gradient. White ink passes 4.5:1 on both stops in each appearance. */
  primaryGradient: readonly [string, string];
  primaryInk: string;
  /** Chip tint and the selected tab tint: the first category hue at low alpha. Neutral, never good or bad. */
  chipTint: string;
  navSelected: string;
};

export const PALETTE: Record<ThemeKey, Palette> = {
  dark: {
    gradient: ['#0A0E2A', '#111A47', '#0B0C24', '#06070F'],
    glows: [
      { x: 0.85, y: 0.08, r: 0.55, color: '#5B4BFF', alpha: 0.35 },
      { x: 0.1, y: 0.92, r: 0.5, color: '#1ED2C0', alpha: 0.16 },
    ],
    glassSolid: '#171D4A',
    hairline: 'rgba(190, 200, 255, 0.18)',
    shadow: 'rgba(2, 3, 14, 0.45)',
    heroFill: '#1A2260',
    heroInk: '#F5F7FF',
    heroMuted: '#B9C2EA',
    gauge: ['#2DD4BF', '#6366F1'],
    chart: ['#2DD4BF', '#8B9CFF', '#38BDF8', '#C4B5FD', '#A3B1C6', '#8E9BB8'],
    inkMuted: '#CBD2EC',
    grainAlpha: 0.06,
    panelTint: 'rgba(12, 16, 48, 0.5)',
    panelSolid: '#171D4A',
    panelHighlight: 'rgba(255, 255, 255, 0.07)',
    tabbarTint: 'rgba(20, 26, 66, 0.9)',
    glowTeal: 'rgba(45, 212, 191, 0.22)',
    glowViolet: 'rgba(139, 92, 246, 0.26)',
    glowIndigo: 'rgba(99, 102, 241, 0.24)',
    primaryGradient: ['#0F766E', '#4338CA'],
    primaryInk: '#FFFFFF',
    chipTint: 'rgba(45, 212, 191, 0.16)',
    navSelected: 'rgba(45, 212, 191, 0.22)',
  },
  light: {
    gradient: ['#F7F9FF', '#E7EDFB', '#F1EEFD', '#EEF3FB'],
    glows: [
      { x: 0.9, y: 0.05, r: 0.55, color: '#9CC3FF', alpha: 0.42 },
      { x: 0.05, y: 0.95, r: 0.5, color: '#CDB8FF', alpha: 0.34 },
    ],
    glassSolid: '#FFFFFF',
    hairline: 'rgba(20, 30, 80, 0.12)',
    shadow: 'rgba(30, 40, 90, 0.14)',
    heroFill: '#1B2250',
    heroInk: '#FFFFFF',
    heroMuted: '#C7CEF2',
    gauge: ['#0B7A70', '#4F46E5'],
    chart: ['#0B7A70', '#4F46E5', '#0369A1', '#7C3AED', '#475569', '#5B6478'],
    grainAlpha: 0.05,
    panelTint: 'rgba(255, 255, 255, 0.62)',
    panelSolid: '#FFFFFF',
    panelHighlight: 'rgba(255, 255, 255, 0.9)',
    tabbarTint: 'rgba(255, 255, 255, 0.9)',
    glowTeal: 'rgba(11, 122, 112, 0.14)',
    glowViolet: 'rgba(124, 58, 237, 0.14)',
    glowIndigo: 'rgba(79, 70, 229, 0.14)',
    primaryGradient: ['#0B7A70', '#4F46E5'],
    primaryInk: '#FFFFFF',
    chipTint: 'rgba(11, 122, 112, 0.14)',
    navSelected: 'rgba(11, 122, 112, 0.16)',
  },
};
