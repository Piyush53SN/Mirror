/**
 * The data-tier model.
 *
 * A = official API    B = user export / data portability
 * C = own browser extension (allow-listed sites)   D = OS usage APIs
 *
 * Two rules that the UI has to be able to *show*, not just follow:
 *   1. A feature declares the tiers it needs; when a tier is missing the feature
 *      degrades to a stated empty state instead of estimating.
 *   2. Nothing may present a tier-A/B signal as if it were tier D (local-only) or
 *      vice versa. That is why every screen surfaces its standing here.
 */
export type DataTier = 'A' | 'B' | 'C' | 'D';

export type TierInfo = {
  letter: DataTier;
  name: string;
  how: string;
  /** True when data of this tier never leaves the device in Privacy Mode. */
  localOnly: boolean;
  /** What Mirror can actually do with it today (honest capability, not roadmap). */
  examples: string[];
};

export const TIERS: Record<DataTier, TierInfo> = {
  A: {
    letter: 'A',
    name: 'Official API',
    how: 'You sign in with OAuth; Mirror calls the official API with the narrowest scopes that exist.',
    localOnly: false,
    examples: ['Reddit saved posts and subscribed communities', 'Twitch followed channels'],
  },
  B: {
    letter: 'B',
    name: 'Your export',
    how: 'You download your own data export and import the file. Nothing is fetched for you.',
    localOnly: true,
    examples: ['YouTube watch history from Google Takeout', 'Instagram saved content', 'Amazon order history'],
  },
  C: {
    letter: 'C',
    name: 'Browser extension',
    how: 'Mirror\'s own extension reads allow-listed pages you have opted into, and sends the events to your own device.',
    localOnly: true,
    examples: ['Watch completion and scroll depth', 'Search terms on allow-listed sites'],
  },
  D: {
    letter: 'D',
    name: 'OS usage',
    how: 'Android Usage access (or iOS DeviceActivity). Foreground time, launches, timestamps — never content.',
    localOnly: true,
    examples: ['Per-app foreground time', 'Session start/end and unlock counts'],
  },
};

export const TIER_ORDER: DataTier[] = ['D', 'C', 'B', 'A'];

/**
 * What Mirror cannot do, and why — shown in the capability matrix so nobody has
 * to take a marketing page's word for it.
 */
export const IMPOSSIBLE: { label: string; tier: DataTier | '—'; reason: string }[] = [
  { label: 'Watch completion, searches, scroll depth', tier: 'C', reason: 'Only from our own browser extension on allow-listed sites. Without it, unmeasurable.' },
  { label: 'YouTube watch history', tier: 'A', reason: 'The YouTube Data API has no watch-history endpoint. Takeout export (tier B) is the only honest route.' },
  { label: 'Instagram and Amazon history', tier: 'B', reason: 'No consumer history API exists. Your own export, or nothing.' },
  { label: 'Content inside other apps on this phone', tier: '—', reason: 'Impossible without accessibility services or screen capture, which Mirror never uses.' },
  { label: 'Notification contents', tier: '—', reason: 'Would require notification access. Mirror counts nothing here.' },
];

export type Capability = {
  /** Tiers whose data is present on this device right now. */
  available: DataTier[];
  /** Per-tier counts, for the "what we have locally" panel. */
  counts?: Partial<Record<DataTier, number>>;
};

export type Degrade = { ok: true } | { ok: false; missing: DataTier[]; message: string };

/**
 * Decide whether a feature can run, and what to say when it cannot. Callers must
 * render `message` verbatim rather than inventing their own consolation copy.
 */
export function degrade(available: DataTier[], needs: DataTier[], featureLabel: string): Degrade {
  const missing = needs.filter((t) => !available.includes(t));
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    message: `${featureLabel} is unavailable: it needs tier ${missing.join(' and ')} data, which is not on this device. Mirror will not estimate it.`,
  };
}

export const tierLabel = (t: DataTier) => `${t} · ${TIERS[t].name}`;
