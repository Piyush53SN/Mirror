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
 */

export type OsTotal = { packageName: string; totalMs: number };
export type MirrorTotal = { app: string; totalMs: number };

export type ValidationRow = {
  app: string;
  mirrorMs: number;
  osMs: number;
  diffMs: number;
  diffPct: number; // (mirror - os) / os * 100, or 0 if os=0
  status: 'ok' | 'over' | 'under'; // within 10%, over, under
};

export type ValidationResult = {
  rows: ValidationRow[];
  maxAbsPct: number;
  overThreshold: ValidationRow[]; // >10% abs diff
  ok: boolean; // true if all within 10% or os missing
};

const THRESHOLD_PCT = 10;

export function validateDailyTotals(mirror: MirrorTotal[], os: OsTotal[]): ValidationResult {
  const osMap = new Map<string, number>();
  for (const o of os) osMap.set(o.packageName, o.totalMs);

  const rows: ValidationRow[] = [];
  for (const m of mirror) {
    const osMs = osMap.get(m.app);
    if (osMs === undefined || osMs <= 0) continue; // no OS data to compare
    const diffMs = m.totalMs - osMs;
    const diffPct = osMs === 0 ? 0 : (diffMs / osMs) * 100;
    const absPct = Math.abs(diffPct);
    rows.push({
      app: m.app,
      mirrorMs: m.totalMs,
      osMs,
      diffMs,
      diffPct,
      status: absPct <= THRESHOLD_PCT ? 'ok' : diffMs > 0 ? 'over' : 'under',
    });
  }

  rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

  const overThreshold = rows.filter((r) => Math.abs(r.diffPct) > THRESHOLD_PCT);
  const maxAbsPct = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.diffPct))) : 0;

  return {
    rows,
    maxAbsPct,
    overThreshold,
    ok: overThreshold.length === 0,
  };
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

export const DEVICE_FIXTURE_MIRROR_FIXED: MirrorTotal[] = [
  { app: 'com.miHoYo.GenshinImpact', totalMs: 26 * 60_000 },
  { app: 'com.google.android.youtube', totalMs: 12 * 60_000 + 30_000 },
  { app: 'com.whatsapp', totalMs: 11 * 60_000 + 45_000 },
  { app: 'com.supercell.brawlstars', totalMs: 7 * 60_000 + 10_000 },
  { app: 'com.reddit.frontpage', totalMs: 5 * 60_000 + 50_000 },
  { app: 'com.android.chrome', totalMs: 6 * 60_000 + 5_000 },
];
