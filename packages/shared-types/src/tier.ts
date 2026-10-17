/**
 * The four data tiers, as a standalone module.
 *
 * Kept separate from the event schema so that every package can import the tier
 * union without importing the whole event model (and so the design system's
 * `@mirror/ui` tiers and this one can be checked against each other by a test
 * instead of drifting).
 */
export const TIERS = ['A', 'B', 'C', 'D'] as const;
export type DataTier = (typeof TIERS)[number];

export const TIER_SOURCE: Record<DataTier, { mechanism: string; origin: 'api' | 'export' | 'extension' | 'os' }> = {
  A: { mechanism: 'official OAuth API', origin: 'api' },
  B: { mechanism: 'user export / data portability', origin: 'export' },
  C: { mechanism: 'Mirror browser extension, allow-listed sites', origin: 'extension' },
  D: { mechanism: 'OS usage APIs', origin: 'os' },
};
