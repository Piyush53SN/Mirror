/**
 * @mirror/ui — the Mirror design system.
 *
 * Layers, from the bottom up:
 *   tokens.ts   the generated token set, resolved per theme + a11y state
 *   theme.tsx   provider + hooks (theme, reduce-motion, text scale, blur budget)
 *   flags.ts    typed feature flags (social off by default)
 *   tiers.ts    the A/B/C/D data model and the degrade rule
 *   a11y.ts     the 48dp rule, roles, focus, layout metrics
 *   primitives/ Text, cards, containers, controls
 *   patterns    compositions that carry a product rule
 *
 * Screens live in ../screens and are exported from @mirror/ui/screens.
 */
export * from './tokens.js';
export { ThemeProvider, useTheme, useThemeControls, useLiveBlur, ThemeContext } from './theme.js';
export * from './flags.js';
export * from './tiers.js';
export * from './a11y.js';
export * from './format.js';

export * from './primitives/text.js';
export * from './primitives/controls.js';
export * from './primitives/containers.js';
export * from './patterns.js';
