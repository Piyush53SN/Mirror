/**
 * Validation: compare Mirror's derived totals against OS-reported totals.
 *
 * Android's `UsageStatsManager.queryUsageStats` returns `totalTimeInForeground`
 * per package — the same ground truth that Settings > Digital Wellbeing shows.
 * Mirror's collector uses `queryEvents` (foreground/background pairs). If the
 * pairing logic is correct, the sums should match within ~10% (some drift is
 * expected due to different bucketing, but 200% like WhatsApp 39m vs 12m is a bug).
 *
 * This module is pure and tested with a fixture from the real-device report.
 * The FIXED fixture is now a replay from one real device day (raw events JSON +
 * Settings totals) run through the real pipeline (buildUsageEvents), not hand-written.
 *
 * Note: queryUsageStats may differ from Settings; Settings numbers are ground truth.
 * queryUsageStats uses INTERVAL_DAILY bucketing and may include slightly different
 * windows or rounding. Settings > Digital Wellbeing is the user-visible truth.
 */

import { buildUsageEvents } from './usage';
import type { RawUsageBucketDiagnostic, UsageRow } from './usage';

export type OsTotal = { packageName: string; totalMs: number };
export type MirrorTotal = { app: string; totalMs: number };

export type ValidationRow = {
  app: string;
  mirrorMs: number;
  osMs: number;
  diffMs: number;
  diffPct: number; // (mirror - os) / os * 100, or +/-100 when os=0 and mirror>0
  toleranceMs: number; // max(10% of osMs, 60_000)
  status: 'ok' | 'over' | 'under'; // within max(10%, 60s), over, under
};

export type ValidationResult = {
  rows: ValidationRow[];
  maxAbsPct: number;
  maxAbsMs: number;
  overThreshold: ValidationRow[]; // > max(10%, 60s) abs diff
  ok: boolean; // true if all within tolerance or os missing
};

export const DAILY_TOTAL_TOLERANCE_PCT = 10;
export const DAILY_TOTAL_TOLERANCE_ABS_MS = 60_000; // 60s absolute tolerance

export function dailyTotalToleranceMs(osMs: number): number {
  const safeOsMs = Number.isFinite(osMs) && osMs > 0 ? osMs : 0;
  return Math.max((DAILY_TOTAL_TOLERANCE_PCT / 100) * safeOsMs, DAILY_TOTAL_TOLERANCE_ABS_MS);
}

export function isWithinDailyTotalTolerance(mirrorMs: number, osMs: number): boolean {
  const diffMs = mirrorMs - osMs;
  return Math.abs(diffMs) <= dailyTotalToleranceMs(osMs);
}

export function validateDailyTotals(mirror: MirrorTotal[], os: OsTotal[]): ValidationResult {
  const osMap = new Map<string, number>();
  for (const o of os) {
    if (o && typeof o.packageName === 'string' && Number.isFinite(o.totalMs) && o.totalMs > 0) {
      osMap.set(o.packageName, (osMap.get(o.packageName) ?? 0) + o.totalMs);
    }
  }

  // No OS ground truth available (e.g. Usage Access denied or empty day on device)
  if (osMap.size === 0) {
    return {
      rows: [],
      maxAbsPct: 0,
      maxAbsMs: 0,
      overThreshold: [],
      ok: true,
    };
  }

  const mirrorMap = new Map<string, number>();
  for (const m of mirror) {
    if (m && typeof m.app === 'string' && Number.isFinite(m.totalMs) && m.totalMs > 0) {
      mirrorMap.set(m.app, (mirrorMap.get(m.app) ?? 0) + m.totalMs);
    }
  }

  // Evaluate the full union of Mirror and OS apps so neither phantom Mirror-only
  // intervals (e.g. 78m vs 0m) nor dropped OS apps (0m vs 47m) slip past unflagged.
  const allApps = new Set<string>([...mirrorMap.keys(), ...osMap.keys()]);
  const rows: ValidationRow[] = [];
  for (const app of allApps) {
    const mirrorMs = mirrorMap.get(app) ?? 0;
    const osMs = osMap.get(app) ?? 0;
    if (mirrorMs <= 0 && osMs <= 0) continue;
    const diffMs = mirrorMs - osMs;
    const diffPct = osMs > 0 ? (diffMs / osMs) * 100 : mirrorMs > 0 ? 100 : 0;
    const toleranceMs = dailyTotalToleranceMs(osMs);
    const within = Math.abs(diffMs) <= toleranceMs;
    rows.push({
      app,
      mirrorMs,
      osMs,
      diffMs,
      diffPct,
      toleranceMs,
      status: within ? 'ok' : diffMs > 0 ? 'over' : 'under',
    });
  }

  rows.sort((a, b) => {
    const aFlag = a.status === 'ok' ? 0 : 1;
    const bFlag = b.status === 'ok' ? 0 : 1;
    if (aFlag !== bFlag) return bFlag - aFlag;
    return Math.abs(b.diffPct) - Math.abs(a.diffPct) || Math.abs(b.diffMs) - Math.abs(a.diffMs);
  });

  const overThreshold = rows.filter((r) => r.status !== 'ok');
  const maxAbsPct = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.diffPct))) : 0;
  const maxAbsMs = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.diffMs))) : 0;

  return {
    rows,
    maxAbsPct,
    maxAbsMs,
    overThreshold,
    ok: overThreshold.length === 0,
  };
}

export type AppOsDiscrepancyComparison =
  | 'Home vs OS UsageEvents'
  | 'Stored vs OS UsageEvents'
  | 'Home vs OS UsageStats';

export type FlaggedAppDiscrepancy = {
  app: string;
  label: string;
  displayedMs: number;
  dayFgMs: number;
  storedMs: number;
  sittingSpanMs: number;
  rawBucketMs: number;
  preMidnightBucketMs: number;
  mirrorMs: number;
  osMs: number;
  diffMs: number;
  diffPct: number;
  toleranceMs: number;
  status: 'over' | 'under';
  comparison: AppOsDiscrepancyComparison;
};

/**
 * Flag ANY app whose Mirror total differs from the OS by more than `max(10%, 60s)`
 * across all independent comparisons available in `DebugView`:
 *   1. `Home` displayed total vs live OS `Day fg` (`UsageEvents` clipped to day)
 *   2. `Stored` SQLite total vs live OS `Day fg` (catches leftover/duplicate stored intervals)
 *   3. `Home` displayed total vs independent OS `UsageStats` (`queryUsageStats`):
 *      - When `preMidnightBucketMs === 0` (bucket started `>= 00:00` local, zero yesterday bleed),
 *        flags any `|displayedMs - rawBucketMs| > max(10%, 60s)` in either direction.
 *      - When `preMidnightBucketMs > 0` (bucket started yesterday `< 00:00` local), still flags
 *        whenever `displayedMs - rawBucketMs > max(10%, 60s)` (Mirror exceeds even the unclipped OS bucket).
 */
export function evaluateAppOsDiscrepancies(input: {
  displayedTotals: readonly MirrorTotal[];
  dayFgTotals: readonly OsTotal[];
  storedTotals: readonly OsTotal[];
  sittingTotals?: readonly MirrorTotal[];
  rawBucketDiagnostics?: readonly RawUsageBucketDiagnostic[];
  labels?: Readonly<Record<string, string>>;
}): FlaggedAppDiscrepancy[] {
  const labels = input.labels ?? {};
  const displayedMap = new Map<string, number>();
  for (const r of input.displayedTotals) {
    if (r && r.totalMs > 0) displayedMap.set(r.app, (displayedMap.get(r.app) ?? 0) + r.totalMs);
  }
  const dayFgMap = new Map<string, number>();
  for (const r of input.dayFgTotals) {
    if (r && r.totalMs > 0) dayFgMap.set(r.packageName, (dayFgMap.get(r.packageName) ?? 0) + r.totalMs);
  }
  const storedMap = new Map<string, number>();
  for (const r of input.storedTotals) {
    if (r && r.totalMs > 0) storedMap.set(r.packageName, (storedMap.get(r.packageName) ?? 0) + r.totalMs);
  }
  const sittingMap = new Map<string, number>();
  for (const r of input.sittingTotals ?? []) {
    if (r && r.totalMs > 0) sittingMap.set(r.app, (sittingMap.get(r.app) ?? 0) + r.totalMs);
  }
  const rawDiagMap = new Map<string, RawUsageBucketDiagnostic>();
  for (const d of input.rawBucketDiagnostics ?? []) {
    if (d && d.totalMs > 0) rawDiagMap.set(d.packageName, d);
  }

  const hasDayFgBaseline = dayFgMap.size > 0;
  const hasRawBucketBaseline = rawDiagMap.size > 0;
  if (!hasDayFgBaseline && !hasRawBucketBaseline) {
    return [];
  }

  const allApps = new Set<string>([
    ...displayedMap.keys(),
    ...dayFgMap.keys(),
    ...storedMap.keys(),
    ...rawDiagMap.keys(),
  ]);

  const flagged: FlaggedAppDiscrepancy[] = [];

  for (const app of allApps) {
    const displayedMs = displayedMap.get(app) ?? 0;
    const dayFgMs = dayFgMap.get(app) ?? 0;
    const storedMs = storedMap.get(app) ?? 0;
    const sittingSpanMs = sittingMap.get(app) ?? 0;
    const rawDiag = rawDiagMap.get(app);
    const rawBucketMs = rawDiag?.totalMs ?? 0;
    const preMidnightBucketMs = rawDiag?.preMidnightBucketMs ?? 0;

    type Candidate = {
      mirrorMs: number;
      osMs: number;
      comparison: AppOsDiscrepancyComparison;
    };
    const candidates: Candidate[] = [];

    if (hasDayFgBaseline && (displayedMs > 0 || dayFgMs > 0)) {
      if (!isWithinDailyTotalTolerance(displayedMs, dayFgMs)) {
        candidates.push({
          mirrorMs: displayedMs,
          osMs: dayFgMs,
          comparison: 'Home vs OS UsageEvents',
        });
      }
    }

    if (hasDayFgBaseline && (storedMs > 0 || dayFgMs > 0)) {
      if (!isWithinDailyTotalTolerance(storedMs, dayFgMs)) {
        candidates.push({
          mirrorMs: storedMs,
          osMs: dayFgMs,
          comparison: 'Stored vs OS UsageEvents',
        });
      }
    }

    if (hasRawBucketBaseline && (displayedMs > 0 || rawBucketMs > 0)) {
      const cleanSameDayBucket = rawBucketMs > 0 && preMidnightBucketMs === 0;
      const mirrorExceedsEvenBleedBucket =
        rawBucketMs > 0 && preMidnightBucketMs > 0 && displayedMs > rawBucketMs;
      const mirrorOnlyPhantom = rawBucketMs === 0 && displayedMs > 0 && !hasDayFgBaseline;
      if (
        (cleanSameDayBucket || mirrorExceedsEvenBleedBucket || mirrorOnlyPhantom) &&
        !isWithinDailyTotalTolerance(displayedMs, rawBucketMs)
      ) {
        candidates.push({
          mirrorMs: displayedMs,
          osMs: rawBucketMs,
          comparison: 'Home vs OS UsageStats',
        });
      }
    }

    if (candidates.length === 0) continue;

    // Pick the largest absolute discrepancy for this app so one app appears once,
    // ranked by its worst divergence.
    candidates.sort((a, b) => Math.abs(b.mirrorMs - b.osMs) - Math.abs(a.mirrorMs - a.osMs));
    const worst = candidates[0]!;
    const diffMs = worst.mirrorMs - worst.osMs;
    const diffPct = worst.osMs > 0 ? (diffMs / worst.osMs) * 100 : worst.mirrorMs > 0 ? 100 : 0;
    const toleranceMs = dailyTotalToleranceMs(worst.osMs);

    flagged.push({
      app,
      label: labels[app] ?? app,
      displayedMs,
      dayFgMs,
      storedMs,
      sittingSpanMs,
      rawBucketMs,
      preMidnightBucketMs,
      mirrorMs: worst.mirrorMs,
      osMs: worst.osMs,
      diffMs,
      diffPct,
      toleranceMs,
      status: diffMs > 0 ? 'over' : 'under',
      comparison: worst.comparison,
    });
  }

  return flagged.sort(
    (a, b) => Math.abs(b.diffMs) - Math.abs(a.diffMs) || a.app.localeCompare(b.app),
  );
}

const DEFAULT_REPLAY_LAUNCHERS = [
  'com.miui.home',
  'com.mi.android.globallauncher',
  'com.google.android.apps.nexuslauncher',
  'com.sec.android.app.launcher',
  'com.android.launcher',
  'com.android.launcher3',
];

/**
 * Replay a real device day: raw UsageEvents rows -> Mirror totals via real pipeline.
 * This replaces hand-written FIXED fixture. Takes raw rows and window, runs
 * buildUsageEvents, sums intervals per app.
 */
export function mirrorTotalsFromRawEvents(
  rawRows: UsageRow[],
  window: { sinceMs: number; untilMs: number; ignorePackages?: readonly string[] },
): MirrorTotal[] {
  const built = buildUsageEvents(rawRows, {
    ...window,
    ignorePackages: window.ignorePackages ?? DEFAULT_REPLAY_LAUNCHERS,
  });
  const map = new Map<string, number>();
  // built.events are fg/bg pairs; bg has duration_ms
  for (const ev of built.events) {
    if (ev.kind === 'app_background' && ev.duration_ms) {
      map.set(ev.app, (map.get(ev.app) ?? 0) + ev.duration_ms);
    }
  }
  return [...map.entries()].map(([app, totalMs]) => ({ app, totalMs }));
}

// Fixture from device report: OS shows Genshin 27m, YouTube 13m, WhatsApp 12m,
// Brawl Stars 7m, Reddit 6m, Chrome 6m. Mirror previously showed WhatsApp 39m42s,
// Brawl Stars 42m28s, overlapping ending at same time.
export const DEVICE_FIXTURE_OS: OsTotal[] = [
  { packageName: 'com.miHoYo.GenshinImpact', totalMs: 27 * 60_000 },
  { packageName: 'com.google.android.youtube', totalMs: 13 * 60_000 },
  { packageName: 'com.whatsapp', totalMs: 12 * 60_000 },
  { packageName: 'com.supercell.brawlstars', totalMs: 7 * 60_000 },
  { packageName: 'com.reddit.frontpage', totalMs: 6 * 60_000 },
  { packageName: 'com.android.chrome', totalMs: 6 * 60_000 },
];

export const DEVICE_FIXTURE_MIRROR_BUGGY: MirrorTotal[] = [
  { app: 'com.whatsapp', totalMs: (39 * 60 + 42) * 1000 },
  { app: 'com.supercell.brawlstars', totalMs: (42 * 60 + 28) * 1000 },
  { app: 'com.miHoYo.GenshinImpact', totalMs: 27 * 60_000 },
  { app: 'com.google.android.youtube', totalMs: 13 * 60_000 },
];

// This will be replaced by replay in tests; kept as fallback empty
export const DEVICE_FIXTURE_MIRROR_FIXED: MirrorTotal[] = [];
