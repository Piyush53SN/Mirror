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
import type { UsageRow } from './usage';

export type OsTotal = { packageName: string; totalMs: number };
export type MirrorTotal = { app: string; totalMs: number };

export type ValidationRow = {
  app: string;
  mirrorMs: number;
  osMs: number;
  diffMs: number;
  diffPct: number; // (mirror - os) / os * 100, or 0 if os=0
  status: 'ok' | 'over' | 'under'; // within max(10%, 60s), over, under
};

export type ValidationResult = {
  rows: ValidationRow[];
  maxAbsPct: number;
  maxAbsMs: number;
  overThreshold: ValidationRow[]; // > max(10%, 60s) abs diff
  ok: boolean; // true if all within tolerance or os missing
};

const THRESHOLD_PCT = 10;
const THRESHOLD_ABS_MS = 60_000; // 60s absolute tolerance

function isWithinTolerance(diffMs: number, osMs: number): boolean {
  const absDiff = Math.abs(diffMs);
  const pctTolMs = (THRESHOLD_PCT / 100) * Math.max(osMs, 1);
  const tolMs = Math.max(pctTolMs, THRESHOLD_ABS_MS);
  return absDiff <= tolMs;
}

export function validateDailyTotals(mirror: MirrorTotal[], os: OsTotal[]): ValidationResult {
  const osMap = new Map<string, number>();
  for (const o of os) osMap.set(o.packageName, o.totalMs);

  const rows: ValidationRow[] = [];
  for (const m of mirror) {
    const osMs = osMap.get(m.app);
    if (osMs === undefined || osMs <= 0) continue; // no OS data to compare
    const diffMs = m.totalMs - osMs;
    const diffPct = osMs === 0 ? 0 : (diffMs / osMs) * 100;
    rows.push({
      app: m.app,
      mirrorMs: m.totalMs,
      osMs,
      diffMs,
      diffPct,
      status: isWithinTolerance(diffMs, osMs) ? 'ok' : diffMs > 0 ? 'over' : 'under',
    });
  }

  rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

  const overThreshold = rows.filter((r) => !isWithinTolerance(r.diffMs, r.osMs));
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

/**
 * Replay a real device day: raw UsageEvents rows -> Mirror totals via real pipeline.
 * This replaces hand-written FIXED fixture. Takes raw rows and window, runs
 * buildUsageEvents, sums intervals per app.
 */
export function mirrorTotalsFromRawEvents(rawRows: UsageRow[], window: { sinceMs: number; untilMs: number }): MirrorTotal[] {
  const built = buildUsageEvents(rawRows, window);
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
