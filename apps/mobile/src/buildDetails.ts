/**
 * Build details – moved out of main screen to avoid JSX < > { } bugs and clutter.
 * Main screen shows short summary, debug screen shows full details.
 * All strings use {'...'} in JSX or are JS constants, so literal < > are inside JS strings, not JSX text.
 */

export const BUILD_SHORT = [
  'Per-app totals from OS aggregate (Digital Wellbeing source)',
  'App opens only – no durations, no scaling',
  'IQS out of measured factors (/55 before labels, /75 with 5+ labels; never rescaled)',
  'Labeling optional, only explicit labels count',
  'J4 Interest Evolution hidden until 3+ days of history & orphans ≤50',
].join('\n');

export const BUILD_FULL = [
  'Per-app totals from OS aggregate (queryUsageStats, local day bucket), matches Digital Wellbeing by construction, excludes launchers (HOME role), Mirror, Play Store/Services, Settings, and all Package installers',
  'App opens from raw events, open times only, no durations, no scaling (60s recent-close honest + 1h overlap + per-class persisted map; 1h overlap does NOT pair unrelated – idempotent ids, single-fg, max 6h, merge gap 2s only)',
  'IQS: Tier-D usage-pattern score out of measured parts (/55 without 5 labels, /75 with 5+ labels, /100 with topic vectors; never rescaled), 0.49 confidence cap on reconstructed boundaries, only explicit labels feed Deliberate share',
  'Labeling: collapsed on tap, skip system/utility, optional opt-in after longer sessions, neutral hint (never counted) “Duration doesn’t indicate intent”',
  'P3 J4 Interest Evolution: hard gate orphans ≤50 and gaps ≤100, and requires 3+ distinct local days of session history (hidden on day 1–2 so it never duplicates single-day OS totals)',
  'Build: tap 7 times for hidden debug (validation same period, OS vs Mirror, raw UsageEvents, Share JSON, P3 guard details)',
].join('\n');

export const P3_GUARD_SHORT = (orphanCount: number, totalGaps: number) =>
  `P3 features need reliable session boundaries. Current orphans ${orphanCount} (must be ≤50), gaps ${totalGaps} (must be ≤100). Using only OS totals meanwhile. See debug for details.`;

export const P3_GUARD_FULL = (orphanCount: number) =>
  [
    `P3 features (J4 interest evolution, J9 discovery, J11 rabbit-hole, J18 what-if, J20 focus windows) need reliable session boundaries.`,
    `Current orphans ${orphanCount} (60s recent-close honest + 1h overlap + per-class persisted map).`,
    `1h overlap does NOT pair unrelated – idempotent ids, single-fg, max 6h, merge 2s only, tested A 0-10 B 20-30 A 70-80 stays 3 intervals.`,
    `Until orphans ≤50 and gaps ≤100, P3 features remain blocked. Using only OS totals meanwhile.`,
    `Only explicit labels feed Deliberate share, never duration-based guess.`,
    `OS-total match 100% before/after because totals come from queryUsageStats INTERVAL_DAILY authoritative, excluding launchers, Mirror, Settings, Play Store, and Package installers.`,
  ].join('\n');

export const J4_SHORT = (orphanCount: number) =>
  `J4 needs reliable session boundaries to show multi-day evolution. Current orphans ${orphanCount} – blocked until orphans ≤50 and gaps ≤100. Using only OS totals meanwhile.`;

export const J4_FULL = [
  'J4 Interest Evolution requires both reliable session boundaries (orphans ≤50, gaps ≤100) and multi-day history (3+ distinct local days).',
  'When fewer than 3 days of sessions exist, J4 is hidden on the main screen rather than repeating single-day OS totals.',
  'When 3+ days exist and the gate is open, J4 shows multi-day app evolution: first-seen date across days, active days out of total days, direction (new / growing / steady / fading), and typical session depth band from sessionBands.',
  'Full topic-level evolution requires Tier A/B/C topic vectors; Tier D degrades honestly to app-level evolution.',
  'Only explicit labels feed Deliberate share; duration hints never count.',
].join('\n');
