/**
 * The accessibility invariants the design system enforces on itself.
 *
 * The 48dp rule is a *measured* rule in this project, not a style guide:
 * packages/ui/tests/mockups.test.mjs measures every rendered tap target, and
 * scripts/check-prototype.mjs does the same in a browser. What lives here is the
 * API half — helpers that make it hard to build a control that is too small, and
 * the invariant `assertTargetSize` used by tests and by debug builds.
 */
import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { MirrorTheme } from './tokens';

export const MIN_TOUCH_DP = 48;

/**
 * Sizes for a control whose *visual* size is smaller than its touch size —
 * a 32dp pill inside a 48dp hit area, which is how Material and Apple both do
 * it. The returned hitSlop is what makes the difference real, so a component
 * that uses this CANNOT end up with a 32dp target by accident.
 */
export function touchTarget(visual: number, theme: MirrorTheme, min = theme.size.touchTarget) {
  const deficit = Math.max(0, min - visual);
  const half = Math.ceil(deficit / 2);
  return {
    minWidth: Math.max(visual, min),
    minHeight: Math.max(visual, min),
    hitSlop: { top: half, bottom: half, left: half, right: half },
  };
}

/** Style fragment for the invisible expanded hit area some controls need. */
export function hitSlopFor(visualSize: number, theme: MirrorTheme): { top: number; bottom: number; left: number; right: number } {
  const half = Math.ceil(Math.max(0, theme.size.touchTarget - visualSize) / 2);
  return { top: half, bottom: half, left: half, right: half };
}

export type TargetViolation = { label: string; width: number; height: number; hint: string };

/**
 * The single assertion every control is measured against. Called by the test
 * suite over the rendered tree, and available at runtime for development builds.
 */
export function assertTargetSize(
  label: string,
  size: { width: number; height: number },
  min = MIN_TOUCH_DP,
): TargetViolation | null {
  if (size.width >= min && size.height >= min) return null;
  const small = size.width < min && size.height < min ? 'both dimensions' : size.width < min ? 'width' : 'height';
  return {
    label,
    width: size.width,
    height: size.height,
    hint: `${label} measures ${Math.round(size.width)}x${Math.round(size.height)}dp: ${small} below the ${min}dp minimum. ` +
      'Fix the control, or wrap the visual in a larger Pressable with hitSlop — do not lower this number.',
  };
}

/** Roles we use, so screens cannot invent their own strings. */
export const ROLES = {
  tab: 'tab',
  button: 'button',
  header: 'header',
  image: 'image',
  text: 'text',
  summary: 'summary',
  progressbar: 'progressbar',
} as const;

/**
 * Announce a value the way WCAG + TalkBack expect: the number, the unit, and the
 * comparison, never the raw figure alone.
 */
export function announceValue(label: string, value: number | string, unit: string, context?: string): string {
  const core = typeof value === 'number' ? `${value} ${unit}` : `${value} ${unit}`.trim();
  return context ? `${label}, ${core}, ${context}` : `${label}, ${core}`;
}

/** Android honours `accessible` + a single label; iOS uses the same props. */
export function a11yTarget(label: string, hint?: string, disabled?: boolean) {
  return {
    accessible: true,
    accessibilityRole: ROLES.button,
    accessibilityLabel: label,
    accessibilityHint: hint,
    accessibilityState: disabled ? { disabled: true } : undefined,
  };
}

/** The safe-area / status strip the brief measured (44pt) and the tab bar (64pt). */
export function layoutMetrics(theme: MirrorTheme) {
  return {
    statusStrip: 44,
    header: theme.size.headerHeight,
    tabBar: theme.size.tabBar,
    /** Scroll content must clear the floating tab bar + its margins. */
    bottomInset: theme.size.tabBar + theme.space(6),
    gutter: theme.space(4),
    /** iOS uses points, Android dp — both are 1:1 with the token unit here. */
    unit: Platform.OS === 'ios' ? 'pt' : 'dp',
  };
}

/**
 * Focus treatment for the web/tablet shell and for the mockups. Expressed with
 * border styles because React Native has no `outline` on older platforms; the
 * DOM binding turns it into a real outline.
 */
export const focusRing = (theme: MirrorTheme): ViewStyle => ({
  borderWidth: 2,
  borderColor: theme.color.ink,
});
