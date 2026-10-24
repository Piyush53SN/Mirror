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
  'J4 Interest Evolution & J9 Discovery Journey shown when 3+ days & orphans ≤50',
].join('\n');

export const BUILD_FULL = [
  'Per-app totals from OS aggregate (queryUsageStats, local day bucket), matches Digital Wellbeing by construction, excludes launchers (HOME role), Mirror, Play Store/Services, Settings, and all Package installers',
  'App opens from raw events, open times only, no durations, no scaling (60s recent-close honest + 1h overlap + per-class persisted map; 1h overlap does NOT pair unrelated – idempotent ids, single-fg, max 6h, merge gap 2s only)',
  'IQS: Tier-D usage-pattern score out of measured parts (/55 without 5 labels, /75 with 5+ labels, /100 with topic vectors; never rescaled), 0.49 confidence cap on reconstructed boundaries, only explicit labels feed Deliberate share',
  'Labeling: collapsed on tap, skip system/utility, optional opt-in after longer sessions, neutral hint (never counted) “Duration doesn’t indicate intent”',
  'P3 J4 Interest Evolution: hard gate orphans ≤50 & gaps ≤100 plus 3+ distinct local days; labels “Seen since YYYY-MM-DD (history starts ...)” (never implies first-ever use), omits misleading “New after” counts, and marks growing/fading with “(limited history)” below 14 days',
  'P3 J9 Discovery Journey: hard gate orphans ≤50 & gaps ≤100 plus 3+ distinct local days; repeated cross-app handoff routes (sustained ≥8s sittings within 5 min), repeat vs single-day app visits (with limited-history caveat), OS top app by time, explicit unavailable flags for Tier A/B/C topics & Tier C searches, and explicit user labels only',
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
  'Dates are labelled “Seen since YYYY-MM-DD (history starts ...)” so the start of Mirror’s recording window never implies a first-ever app use.',
  'Direction compares recent vs earlier recorded days (growing / steady / fading) and carries “(limited history)” whenever fewer than 14 days are recorded.',
  'Full topic-level evolution requires Tier A/B/C topic vectors; Tier D degrades honestly to app-level evolution.',
].join('\n');

export const J9_FULL = [
  'J9 Discovery Journey requires both reliable session boundaries (orphans ≤50, gaps ≤100) and multi-day history (3+ distinct local days).',
  'Step-by-step topic discovery (search → page → follow-up) requires Tier A/B/C; on Tier D OS usage alone, New topics opened and Searches started explicitly show unavailable rather than guessing from app names.',
  'Repeated cross-app handoffs track sustained sittings (≥8s) where App A transitions to App B within 5 minutes across days, excluding launchers, Mirror, Settings, Play Store/Services, and all Package installers.',
  'Repeat vs single-day visits carry a limited-history caveat below 14 days so single-day visits are never misread as newly installed apps.',
  'Top app by time comes from authoritative OS queryUsageStats totals, and intent summaries count only explicit user intent_label events (never duration hints).',
].join('\n');
