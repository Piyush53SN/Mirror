/**
 * J4 Interest Evolution (Tier D usage-pattern degradation).
 *
 * Full topic-level evolution requires Tier A/B/C topic vectors. When only Tier D
 * OS usage exists and session boundaries pass the reliability gate (orphans ≤ 50,
 * gaps ≤ 100), Mirror degrades honestly to app-level multi-day evolution:
 *   - "Seen since YYYY-MM-DD (history starts ...)" — never "First seen", because
 *     the start of Mirror's recorded window is not a person's first use of an app
 *   - Active-day span (k of N recorded days)
 *   - Short/long-window direction (growing / steady / fading) comparing earlier vs
 *     recent halves of the recorded days, with an explicit "(limited history)"
 *     caveat whenever fewer than `FULL_EVOLUTION_DAYS` (14) days exist
 *   - Typical sitting depth band from `sessionBands`
 *
 * Note: "new" is intentionally omitted on Tier-D history windows because opening an
 * already-installed app on day 2 or day 3 after Mirror starts recording is normal
 * rotation, not a newly discovered app.
 *
 * When fewer than `MIN_EVOLUTION_DAYS` (3) distinct local days of sessions exist,
 * `hasHistory` is false so the UI hides J4 rather than repeating today's totals.
 */
import { localDay } from './ingest';
import { sessionBands, type DepthBand, type ScoredSession } from './scoring';
import { isIgnoredSystemApp } from './usage';

export const MIN_EVOLUTION_DAYS = 3;
export const FULL_EVOLUTION_DAYS = 14;

export type EvolutionTrend = 'growing' | 'steady' | 'fading';

export type AppEvolutionRow = {
  app: string;
  label: string;
  seenSinceMs: number;
  seenSinceDay: string;
  /** Honest phrasing that marks Mirror's history boundary rather than implying first-ever use. */
  seenSinceText: string;
  lastSeenDay: string;
  activeDays: number;
  sessionCount: number;
  totalSessionMs: number;
  dominantBand: string;
  trend: EvolutionTrend;
  /** Includes "(limited history)" on growing/fading when distinctDays < FULL_EVOLUTION_DAYS. */
  trendLabel: string;
};

export type InterestEvolutionResult = {
  hasHistory: boolean;
  distinctDays: number;
  minDays: number;
  limitedHistory: boolean;
  historyStartDay: string | null;
  lastDay: string | null;
  /** Counts among the displayed `rows` so summary numbers always match visible items. */
  growingCount: number;
  fadedCount: number;
  summaryLine: string;
  depthBands: DepthBand[];
  rows: AppEvolutionRow[];
};

export type InterestEvolutionInput = {
  sessions: readonly ScoredSession[];
  utcOffsetMinutes?: number;
  labels?: Readonly<Record<string, string>>;
  ignorePackages?: readonly string[];
  minDays?: number;
  limit?: number;
};

export function formatEvolutionTrendLabel(trend: EvolutionTrend, limitedHistory: boolean): string {
  if (!limitedHistory || trend === 'steady') return trend;
  return `${trend} (limited history)`;
}

export function formatSeenSinceText(seenSinceDay: string, historyStartDay: string): string {
  if (seenSinceDay <= historyStartDay) {
    return `Seen since ${seenSinceDay} (history starts)`;
  }
  return `Seen since ${seenSinceDay} (history starts ${historyStartDay})`;
}

export function computeInterestEvolution(input: InterestEvolutionInput): InterestEvolutionResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const minDays = Math.max(2, input.minDays ?? MIN_EVOLUTION_DAYS);
  const limit = Math.max(1, input.limit ?? 8);
  const launcherSet = new Set<string>(input.ignorePackages ?? []);
  const labels = input.labels ?? {};

  const valid = input.sessions.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    if (launcherSet.has(s.app)) return false;
    if (isIgnoredSystemApp(s.app, labels[s.app])) return false;
    return true;
  });

  const daySet = new Set<string>();
  for (const s of valid) {
    daySet.add(localDay(s.startMs, utcOffsetMinutes));
  }
  const orderedDays = [...daySet].sort();

  if (orderedDays.length < minDays) {
    return {
      hasHistory: false,
      distinctDays: orderedDays.length,
      minDays,
      limitedHistory: true,
      historyStartDay: orderedDays[0] ?? null,
      lastDay: orderedDays[orderedDays.length - 1] ?? null,
      growingCount: 0,
      fadedCount: 0,
      summaryLine: '',
      depthBands: [],
      rows: [],
    };
  }

  const historyStartDay = orderedDays[0]!;
  const lastDay = orderedDays[orderedDays.length - 1]!;
  const limitedHistory = orderedDays.length < FULL_EVOLUTION_DAYS;
  const splitIdx = Math.max(1, Math.floor(orderedDays.length / 2));
  const earlierDays = new Set<string>(orderedDays.slice(0, splitIdx));
  const recentDays = new Set<string>(orderedDays.slice(splitIdx));
  const earlierSpan = Math.max(1, earlierDays.size);
  const recentSpan = Math.max(1, recentDays.size);

  const byApp = new Map<string, ScoredSession[]>();
  for (const s of valid) {
    const list = byApp.get(s.app);
    if (list) list.push(s);
    else byApp.set(s.app, [s]);
  }

  const allRows: AppEvolutionRow[] = [];
  for (const [app, appSessions] of byApp.entries()) {
    let seenSinceMs = appSessions[0]!.startMs;
    let lastSeenMs = appSessions[0]!.startMs;
    let totalSessionMs = 0;
    let earlierMs = 0;
    let recentMs = 0;
    const appDays = new Set<string>();

    for (const s of appSessions) {
      if (s.startMs < seenSinceMs) seenSinceMs = s.startMs;
      if (s.startMs > lastSeenMs) lastSeenMs = s.startMs;
      const dur = Math.max(0, s.endMs - s.startMs);
      totalSessionMs += dur;
      const d = localDay(s.startMs, utcOffsetMinutes);
      appDays.add(d);
      if (earlierDays.has(d)) earlierMs += dur;
      if (recentDays.has(d)) recentMs += dur;
    }

    const seenSinceDay = localDay(seenSinceMs, utcOffsetMinutes);
    const lastSeenDay = localDay(lastSeenMs, utcOffsetMinutes);
    const bands = sessionBands(appSessions);
    let dominant = bands[0]!;
    for (const b of bands) {
      if (b.count > dominant.count) dominant = b;
    }

    const earlierAvg = earlierMs / earlierSpan;
    const recentAvg = recentMs / recentSpan;
    let trend: EvolutionTrend;
    if (earlierMs > 0 && (recentAvg < earlierAvg * 0.5 || (lastSeenDay < lastDay && recentMs === 0))) {
      trend = 'fading';
    } else if (appDays.size >= 2 && recentAvg > earlierAvg * 1.25) {
      trend = 'growing';
    } else {
      trend = 'steady';
    }

    allRows.push({
      app,
      label: labels[app] ?? app,
      seenSinceMs,
      seenSinceDay,
      seenSinceText: formatSeenSinceText(seenSinceDay, historyStartDay),
      lastSeenDay,
      activeDays: appDays.size,
      sessionCount: appSessions.length,
      totalSessionMs,
      dominantBand: dominant.label,
      trend,
      trendLabel: formatEvolutionTrendLabel(trend, limitedHistory),
    });
  }

  allRows.sort((a, b) => {
    const aMulti = a.activeDays >= 2 ? 1 : 0;
    const bMulti = b.activeDays >= 2 ? 1 : 0;
    if (bMulti !== aMulti) return bMulti - aMulti;
    if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
    return b.totalSessionMs - a.totalSessionMs || a.app.localeCompare(b.app);
  });

  const rows = allRows.slice(0, limit);
  const growingCount = rows.filter((r) => r.trend === 'growing').length;
  const fadedCount = rows.filter((r) => r.trend === 'fading').length;
  const summaryLine = limitedHistory
    ? `History starts ${historyStartDay} (${orderedDays.length} days, limited history) · Shown: ${growingCount} growing, ${fadedCount} fading`
    : `History starts ${historyStartDay} (${orderedDays.length} days) · Shown: ${growingCount} growing, ${fadedCount} fading`;

  return {
    hasHistory: true,
    distinctDays: orderedDays.length,
    minDays,
    limitedHistory,
    historyStartDay,
    lastDay,
    growingCount,
    fadedCount,
    summaryLine,
    depthBands: sessionBands(valid),
    rows,
  };
}
