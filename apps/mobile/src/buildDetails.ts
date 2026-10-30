/**
 * Build & guard copy — kept in plain TypeScript constants so JSX stays free of
 * raw angle/curly characters and user-facing screens stay free of internal
 * specification codes.
 */

export const BUILD_SHORT = [
  'Per-app totals from day-clipped OS foreground events (matches Digital Wellbeing; older days labelled Stored or Approximate)',
  'App opens show start times only — durations are never invented or scaled',
  'Attention signal shows measured points (e.g. 44 of 55 measured) with unmeasured points listed separately',
  'Intent labeling is optional — duration hints stay hidden until you label a sitting',
  'All behaviour data stays encrypted on this phone with XChaCha20-Poly1305 (no internet permission in release builds)',
].join('\n');

export const BUILD_FULL = [
  'Per-app totals from day-clipped OS UsageEvents foreground intervals (6h lookaround, clipped strictly to [00:00, min(now, 24:00)]), matching Digital Wellbeing within max(10%, 60s) without INTERVAL_DAILY pre-midnight bucket bleed; older days beyond Android’s UsageEvents buffer are explicitly badged as Stored (Mirror SQLite foreground events) or Approximate (OS daily bucket fallback); shared exclusion list removes launchers (HOME role), Mirror, Play Store/Services, Settings, and all Package installers across both sittings and totals',
  'Sittings close on screen-off (SCREEN_NON_INTERACTIVE=16), lock (KEYGUARD_SHOWN=17), and shutdown (DEVICE_SHUTDOWN=26), and never merge across screen-off or lock boundaries',
  'Zero-length unmatched OS events are reported as point-in-time boundary events (with per-app and per-eventType breakdown), never as “collection gaps (0 min unmeasured)” or lost usage time',
  'IQS v3: fixed 0–100 scale with unmeasured parts shown separately (55 usage-only max, 75 with 5+ explicit labels, 100 with topic vectors; never rescaled), switching pressure per sustained sitting, 60-min late-night saturation, minimum-activity floors, plain-language confidence explanation, and monotonic score guarantees',
  'Multi-day views (Interest Evolution, Discovery Journey & Rabbit Hole): hard gate orphans ≤50 & total unmatched/gap events ≤100 plus 3+ distinct local days, limited-history caveat below 14 days, Rabbit Hole bar at 4+ returns and >30 min total cluster span',
  'What-if Simulator: local counterfactual arithmetic over recorded history; every output is labelled “Estimate” on the fixed 100 scale, includes only measured factors, states exact assumptions, and explains whenever a scenario has no change today',
  'Focus Windows: requires at least 21 local days (3 weeks) and 5+ sittings per weekday × 4-hour block; purely descriptive timing blocks, never blocks or nudges',
].join('\n');

export const BOUNDARY_GUARD_SHORT = (orphanCount: number, totalGaps: number) =>
  `Multi-day and simulation views wait for clean session boundaries: current unmatched OS events ${orphanCount} (needs 50 or fewer), total boundary events ${totalGaps} (needs 100 or fewer). Per-app screen time on Home remains available.`;

/** Kept as an alias for compatibility with existing callers. */
export const P3_GUARD_SHORT = BOUNDARY_GUARD_SHORT;

export const P3_GUARD_FULL = (orphanCount: number) =>
  [
    `Multi-day and simulation views (Interest Evolution, Discovery Journey, Rabbit Hole, What-if, Focus Windows) require clean session boundaries.`,
    `Current unmatched OS events: ${orphanCount} (60s recent-close suppression + 1h overlap + per-class persisted map + screen-off/lock closure).`,
    `1h overlap is strictly idempotent by deterministic event dedupe key and never duplicates or deletes stored events.`,
    `Until unmatched events ≤50 and total boundary events ≤100, session-derived multi-day views pause while per-app totals continue.`,
  ].join('\n');

export const J4_FULL = [
  'Interest Evolution requires clean session boundaries (unmatched ≤50, total ≤100) and multi-day history (3+ distinct local days).',
  'Dates are labelled “Seen since YYYY-MM-DD (history starts ...)” so the start of Mirror’s recording window never implies a first-ever app use.',
  'Direction compares recent vs earlier recorded days (growing / steady / fading) and carries “(limited history)” whenever fewer than 14 days are recorded.',
].join('\n');

export const J9_FULL = [
  'Discovery Journey requires clean session boundaries (unmatched ≤50, total ≤100) and multi-day history (3+ distinct local days).',
  'Repeated cross-app handoffs track sustained sittings (≥8s) where App A transitions to App B within 5 minutes across days, using the shared system/launcher/installer exclusion list.',
  'Explicit label counts use countExplicitLabels scoped to selectedDay so Journey and the Why sheet always match 1-for-1.',
].join('\n');

export const J11_FULL = [
  'Rabbit Hole requires clean session boundaries (unmatched ≤50, total ≤100) and multi-day history (3+ distinct local days).',
  'A rabbit-hole cluster is 5 or more raw opens (4+ returns) of at least 8 seconds to the same app within 30 minutes of each other before 15-minute merging, spanning over 30 minutes from first open to last close.',
  'Neutrality: clusters never penalise IQS, never trigger nudges or app blocks, and never appear on any public profile.',
].join('\n');

export const J18_FULL = [
  'What-if Simulator requires clean session boundaries (unmatched ≤50, total ≤100) and at least one measured sitting in the selected window.',
  'Every output (screen-time change, composite IQS change, and per-factor change) is explicitly labelled “Estimate” on the fixed 100 scale with unmeasured parts shown separately.',
  'When a scenario produces zero change, What-if prints the exact reason alongside its stated assumptions.',
].join('\n');

export const J20_FULL = [
  'Focus Windows requires clean session boundaries (unmatched ≤50, total ≤100), at least 21 distinct local days (3 weeks) of history, and at least 5 sittings inside a weekday × 4-hour cell.',
  'Purely descriptive phone-timing blocks from original OS event timestamps — never assesses attention or sleep, never blocks apps, and never sends unprompted nudges.',
].join('\n');
