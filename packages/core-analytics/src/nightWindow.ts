/**
 * The night window lives in `@mirror/shared-types` so the store (reminder quiet
 * hours defaults) and core-analytics (score, goals, weekly, what-if) share one
 * definition. This module re-exports only those names for analytics consumers.
 */
export {
  NIGHT_WINDOW,
  NIGHT_WINDOW_LABEL,
  formatHourLabel,
  formatWindowLabel,
  isHourInWindow,
} from '@mirror/shared-types';
export type { NightWindow } from '@mirror/shared-types';
