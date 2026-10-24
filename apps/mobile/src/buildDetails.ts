/**
 * Build details – moved out of main screen to avoid JSX < > { } bugs and clutter.
 * Main screen shows short summary, debug screen shows full details.
 * All strings use {'...'} in JSX or are JS constants, so literal < > are inside JS strings, not JSX text.
 */

export const BUILD_SHORT = [
  'Per-app totals from OS aggregate (Digital Wellbeing source)',
  'App opens only – no durations, no scaling',
  'IQS out of measured factors (/55 before labels, /75 with 5+ labels; minimum-activity floor enforced, never rescaled)',
  'Labeling optional, only explicit labels count',
  'J4, J9, J11, J18 (Estimate) & J20 (Focus Windows) shown when orphans ≤50',
].join('\n');

export const BUILD_FULL = [
  'Per-app totals from OS aggregate (queryUsageStats, local day bucket), matches Digital Wellbeing by construction, excludes launchers (HOME role), Mirror, Play Store/Services, Settings, and all Package installers',
  'App opens from raw events, open times only, no durations, no scaling (60s recent-close honest + 1h overlap + per-class persisted map; in-app Activity A->B STOPPED(A) no longer kills B, delayed PAUSED->STOPPED on closed apps and PAUSED+STOPPED pairs no longer inflate orphans)',
  'Zero-length unmatched OS events are reported as point-in-time boundary events (with per-app and per-eventType breakdown), never as “collection gaps (0 min unmeasured)” or lost usage time',
  'IQS v2: Tier-D usage-pattern score out of measured parts (/55 without 5 labels, /75 with 5+ labels, /100 with topic vectors; never rescaled), minimum-activity floors (session length ≥5 sittings, switching ≥3 sittings & ≥15 min / 0.25 active hours, late-night ≥15 min sitting time), 0.49 confidence cap on reconstructed boundaries, only explicit labels feed Deliberate share',
  'P3 J4 Interest Evolution, J9 Discovery Journey & J11 Rabbit Hole: hard gate orphans ≤50 & total unmatched/gap events ≤100 plus 3+ distinct local days, limited-history caveat below 14 days, small-sample rates guarded',
  'P3 J18 What-if Simulator: local counterfactual arithmetic over recorded history; every output is labelled “Estimate”, never rescaled to 100, includes only measured factors, states exact assumptions, and explains whenever a scenario has no change today',
  'P3 J20 Focus Windows: requires at least 21 local days (3 weeks) and 5+ sittings per weekday × 4-hour block; shows a clear progress empty state until met, purely descriptive timing blocks, never blocks or nudges',
  'Build: tap 7 times for hidden debug (validation same period, OS vs Mirror, orphan breakdown by eventType & app, raw UsageEvents, Share JSON, P3 guard details)',
].join('\n');

export const P3_GUARD_SHORT = (orphanCount: number, totalGaps: number) =>
  `P3 features need reliable session boundaries. Current orphans ${orphanCount} (must be ≤50), total unmatched/gap events ${totalGaps} (must be ≤100). Using only OS totals meanwhile. See debug for details.`;

export const P3_GUARD_FULL = (orphanCount: number) =>
  [
    `P3 features (J4 interest evolution, J9 discovery, J11 rabbit-hole, J18 what-if, J20 focus windows) need reliable session boundaries.`,
    `Current orphans ${orphanCount} (60s recent-close honest + 1h overlap + per-class persisted map + Android PAUSED->STOPPED lifecycle tracking).`,
    `1h overlap does NOT pair unrelated – idempotent ids, single-fg, max 6h, merge 2s only, tested A 0-10 B 20-30 A 70-80 stays 3 intervals.`,
    `Until orphans ≤50 and total unmatched/gap events ≤100, P3 features remain blocked. Using only OS totals meanwhile.`,
    `Only explicit labels feed Deliberate share, never duration-based guess.`,
    `OS-total match 100% before/after because totals come from queryUsageStats INTERVAL_DAILY authoritative, excluding launchers, Mirror, Settings, Play Store, and Package installers.`,
  ].join('\n');

export const J4_SHORT = (orphanCount: number) =>
  `J4 needs reliable session boundaries to show multi-day evolution. Current orphans ${orphanCount} – blocked until orphans ≤50 and total unmatched/gap events ≤100. Using only OS totals meanwhile.`;

export const J4_FULL = [
  'J4 Interest Evolution requires both reliable session boundaries (orphans ≤50, total ≤100) and multi-day history (3+ distinct local days).',
  'When fewer than 3 days of sessions exist, J4 is hidden on the main screen rather than repeating single-day OS totals.',
  'Dates are labelled “Seen since YYYY-MM-DD (history starts ...)” so the start of Mirror’s recording window never implies a first-ever app use.',
  'Direction compares recent vs earlier recorded days (growing / steady / fading) and carries “(limited history)” whenever fewer than 14 days are recorded.',
  'Full topic-level evolution requires Tier A/B/C topic vectors; Tier D degrades honestly to app-level evolution.',
].join('\n');

export const J9_FULL = [
  'J9 Discovery Journey requires both reliable session boundaries (orphans ≤50, total ≤100) and multi-day history (3+ distinct local days).',
  'Step-by-step topic discovery (search → page → follow-up) requires Tier A/B/C; on Tier D OS usage alone, New topics opened and Searches started explicitly show unavailable rather than guessing from app names.',
  'Repeated cross-app handoffs track sustained sittings (≥8s) where App A transitions to App B within 5 minutes across days, excluding launchers, Mirror, Settings, Play Store/Services, and all Package installers.',
  'Repeat vs single-day visits carry a limited-history caveat below 14 days so single-day visits are never misread as newly installed apps, and repeat share percentage requires 5+ sustained sittings.',
  'Explicit label counts use countExplicitLabels scoped to selectedDay so J9 and the IQS Why sheet always match 1-for-1.',
].join('\n');

export const J11_FULL = [
  'J11 Rabbit Hole requires both reliable session boundaries (orphans ≤50, total ≤100) and multi-day history (3+ distinct local days).',
  'Tier D CAN detect: 3+ consecutive short sittings (8 s to under 5 min each, separated by at most 60 min) on the same non-utility app with no other app opened in between, late-night share when cluster sitting time is ≥5 min, and any explicit intentional/mindless labels attached to those sittings.',
  'Tier D CANNOT detect: whether a visit began with a search or ended in a save, whether short returns were algorithmic feed scrolling vs purposeful quick checks (messages, transit, docs), or intent when unlabelled — those require Tier A/B/C content and search signals.',
  'System, launcher, installer, and utility packages (dialer, camera, clock, calculator, contacts, SMS, files) are excluded.',
  'Neutrality: clusters never penalise IQS, never trigger unprompted nudges or app blocks, and never appear on any public profile.',
].join('\n');

export const J18_FULL = [
  'J18 What-if Simulator requires reliable session boundaries (orphans ≤50, total ≤100) and at least one measured sitting in the selected window.',
  'Every output (screen-time change, composite IQS change, and per-factor change) is explicitly labelled “Estimate”.',
  'Never rescaled to 100: computeWhatIf calls scoreIqs directly, keeping max equal to the sum of measured factors only (/55 without 5 explicit labels, /75 with 5+ explicit labels on Tier D, or smaller when minimum-activity floors hide noisy factors).',
  'Only measured factors enter the calculation; unmeasured factors stay unmeasured and are listed explicitly.',
  'When a scenario produces zero change (e.g. no sitting longer than 10 min today, no quiet-hours activity, or time drops without moving rounded IQS points), J18 prints the exact reason alongside its stated assumptions.',
].join('\n');

export const J20_FULL = [
  'J20 Focus Windows requires reliable session boundaries (orphans ≤50, total ≤100), at least 21 distinct local days (3 weeks) of history, and at least 5 sittings inside a weekday × 4-hour cell.',
  'Until 21 local days and 5+ sittings per cell exist, J20 displays a calm empty state reporting exact day and cell progress rather than extrapolating from short history.',
  'Per-cell switching rate requires at least 15 minutes (0.25 active hours) inside the cell; cells below 15 minutes omit per-hour switching rate.',
  'Purely descriptive phone-timing blocks from original OS event timestamps — never assesses attention or sleep, never blocks apps, and never sends unprompted nudges. Knowing whether time inside an app held on a chosen topic requires Tier A/B/C signals.',
].join('\n');
