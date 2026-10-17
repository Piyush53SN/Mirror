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
export * from './tokens';
export { ThemeProvider, useTheme, useThemeControls, useLiveBlur, ThemeContext } from './theme';
export * from './flags';
export * from './tiers';
export * from './a11y';
export * from './format';

export * from './primitives/text';
export * from './primitives/controls';
export * from './primitives/containers';
export * from './patterns';
