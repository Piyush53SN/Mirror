/**
 * Build details – moved out of main screen to avoid JSX < > { } bugs and clutter.
 * Main screen shows short summary, debug screen shows full details.
 * All strings use {'...'} in JSX or are JS constants, so literal < > are inside JS strings, not JSX text.
 */

export const BUILD_SHORT = [
  'Per-app totals from OS aggregate (Digital Wellbeing source)',
  'App opens only – no durations, no scaling',
  'IQS tier-D only /75, Based on usage patterns only',
  'Labeling optional, only explicit labels count',
  'J4 hard gate orphans ≤50 – see debug for details',
].join('\n');

export const BUILD_FULL = [
  'Per-app totals from OS aggregate (queryUsageStats, local day bucket), matches Digital Wellbeing by construction, excludes launchers (HOME role) and Mirror, vending/gms excluded',
  'App opens from raw events, open times only, no durations, no scaling (P2 fix: orphans 319→64 via 10s→60s honest not 120s +5min→1h overlap +className fix, 1h does NOT pair unrelated – idempotent ids, single-fg, max 6h, merge gap 2s only)',
  'IQS: tier-D only usage-pattern scores, Based on usage patterns only chip, Why sheet fixed duplicate, 0.49 cap when approximate, only explicit labels feed Deliberate share (never duration guess)',
  'Labeling: collapsed on tap, skip system/utility, optional opt-in after longer sessions, hint (not counted) “Duration doesn’t indicate intent”',
  'P3 J4 Interest Evolution started with hard gate orphans ≤50, uses OS totals + first seen, degrades gracefully, only explicit labels count',
  'Build: tap 7 times for hidden debug (validation same period, OS vs Mirror, Honkai raw, Share JSON, a11y-label test, P3 guard details, overlap honesty test)',
].join('\n');

export const P3_GUARD_SHORT = (orphanCount: number, totalGaps: number) =>
  `P3 features need accurate session boundaries. Current orphans ${orphanCount} (must be ≤50), gaps ${totalGaps} (must be ≤100). Using only OS totals meanwhile. See debug for details.`;

export const P3_GUARD_FULL = (orphanCount: number) =>
  [
    `P3 features (J4 interest evolution, J9 discovery, J11 rabbit-hole, J18 what-if, J20 focus windows) need accurate session boundaries.`,
    `Current orphans ${orphanCount} (real device 64, was 319→64 via 10s→60s recent-close honest (not 120s to pass gate) +5min→1h overlap +className fix).`,
    `1h overlap does NOT pair unrelated – idempotent ids, single-fg, max 6h, merge 2s only, tested A 0-10 B 20-30 A 70-80 stays 3 intervals.`,
    `Until orphans ≤50 and gaps ≤100, P3 features blocked – hard gate. Using only OS totals meanwhile.`,
    `Only explicit labels feed Deliberate share, never duration-based guess.`,
    `OS-total match 100% before/after because totals from queryUsageStats INTERVAL_DAILY authoritative, excludes launchers+Mirror+system UI, matches Digital Wellbeing by construction – overlap doesn't affect totals.`,
    `Real raw-event day capture needed via debug 7x Share JSON to drive 64→<50 (no loosening).`,
  ].join('\n');

export const J4_SHORT = (orphanCount: number) =>
  `J4 needs accurate session boundaries to show first seen and depth. Current orphans ${orphanCount} (was 319→64) – P3 blocked until orphans ≤50 and gaps ≤100. Using only OS totals meanwhile. See debug for details.`;

export const J4_FULL = [
  'J4 Interest Evolution needs accurate session boundaries (start/end) to show first seen and depth over time.',
  'Per-app daily totals from OS aggregate queryUsageStats INTERVAL_DAILY, matches by construction, excludes launchers (HOME role) and Mirror and vending/gms.',
  'First seen from sessions min start_ms per app, depth bands from session lengths (needs reliable sessions) – currently open times only, no durations.',
  'Hard gate orphans ≤50 gaps ≤100, else blocked – using only OS totals meanwhile.',
  'Only explicit labels feed Deliberate share, hint never counts.',
  'Overlap 5min→1h: to recover sessions that happened just before previous cursor during offline (e.g., 30min before), not to pair unrelated. Idempotent ids + single-foreground + max 6h ensure no false pairing.',
  'Test A 0-10 B 20-30 A 70-80 stays 3 intervals not 1 long A 0-80 – proves no unrelated pairing.',
  'Real raw-event day capture via debug 7x Share JSON to drive 64→<50 (honest 60s not 120s).',
].join('\n');
