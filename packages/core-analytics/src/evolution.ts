/**
 * J4 Interest Evolution (Tier D usage-pattern degradation).
 *
 * Full topic-level evolution requires Tier A/B/C topic vectors. When only Tier D
 * OS usage exists and session boundaries pass the reliability gate (orphans ≤ 50,
 * gaps ≤ 100), Mirror degrades honestly to app-level multi-day evolution:
 *   - First seen date across multi-day history (never a single-day totals copy)
 *   - Active-day span (k of N recorded days)
 *   - Multi-day direction (new / growing / steady / fading) comparing earlier vs
 *     recent days in the window
 *   - Typical sitting depth band from `sessionBands`
 *
 * When fewer than `MIN_EVOLUTION_DAYS` (3) distinct local days of sessions exist,
 * `hasHistory` is false so the UI hides J4 rather than repeating today's totals.
 */
import { localDay } from './ingest';
import { sessionBands, type DepthBand, type ScoredSession } from './scoring';
import { isIgnoredSystemApp } from './usage';

export const MIN_EVOLUTION_DAYS = 3;

export type EvolutionTrend = 'new' | 'growing' | 'steady' | 'fading';

export type AppEvolutionRow = {
  app: string;
  label: string;
  firstSeenMs: number;
  firstSeenDay: string;
  lastSeenDay: string;
  activeDays: number;
  sessionCount: number;
  totalSessionMs: number;
  dominantBand: string;
  trend: EvolutionTrend;
};

export type InterestEvolutionResult = {
  hasHistory: boolean;
  distinctDays: number;
  minDays: number;
  firstDay: string | null;
  lastDay: string | null;
  newlySeenCount: number;
  fadedCount: number;
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
      firstDay: orderedDays[0] ?? null,
      lastDay: orderedDays[orderedDays.length - 1] ?? null,
      newlySeenCount: 0,
      fadedCount: 0,
      depthBands: [],
      rows: [],
    };
  }

  const firstDay = orderedDays[0]!;
  const lastDay = orderedDays[orderedDays.length - 1]!;
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
    let firstSeenMs = appSessions[0]!.startMs;
    let lastSeenMs = appSessions[0]!.startMs;
    let totalSessionMs = 0;
    let earlierMs = 0;
    let recentMs = 0;
    const appDays = new Set<string>();

    for (const s of appSessions) {
      if (s.startMs < firstSeenMs) firstSeenMs = s.startMs;
      if (s.startMs > lastSeenMs) lastSeenMs = s.startMs;
      const dur = Math.max(0, s.endMs - s.startMs);
      totalSessionMs += dur;
      const d = localDay(s.startMs, utcOffsetMinutes);
      appDays.add(d);
      if (earlierDays.has(d)) earlierMs += dur;
      if (recentDays.has(d)) recentMs += dur;
    }

    const firstSeenDay = localDay(firstSeenMs, utcOffsetMinutes);
    const lastSeenDay = localDay(lastSeenMs, utcOffsetMinutes);
    const bands = sessionBands(appSessions);
    let dominant = bands[0]!;
    for (const b of bands) {
      if (b.count > dominant.count) dominant = b;
    }

    const earlierAvg = earlierMs / earlierSpan;
    const recentAvg = recentMs / recentSpan;
    let trend: EvolutionTrend;
    if (firstSeenDay > firstDay && earlierMs === 0) {
      trend = 'new';
    } else if (earlierMs > 0 && (recentAvg < earlierAvg * 0.5 || lastSeenDay < lastDay && recentMs === 0)) {
      trend = 'fading';
    } else if (earlierAvg > 0 && recentAvg > earlierAvg * 1.25) {
      trend = 'growing';
    } else {
      trend = 'steady';
    }

    allRows.push({
      app,
      label: labels[app] ?? app,
      firstSeenMs,
      firstSeenDay,
      lastSeenDay,
      activeDays: appDays.size,
      sessionCount: appSessions.length,
      totalSessionMs,
      dominantBand: dominant.label,
      trend,
    });
  }

  const newlySeenCount = allRows.filter((r) => r.firstSeenDay > firstDay).length;
  const fadedCount = allRows.filter((r) => r.trend === 'fading').length;

  allRows.sort((a, b) => {
    // Prioritize apps active across multiple days or newly discovered after day 1,
    // then by total session time across the multi-day window.
    const aMulti = a.activeDays >= 2 || a.trend === 'new' ? 1 : 0;
    const bMulti = b.activeDays >= 2 || b.trend === 'new' ? 1 : 0;
    if (bMulti !== aMulti) return bMulti - aMulti;
    if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
    return b.totalSessionMs - a.totalSessionMs || a.app.localeCompare(b.app);
  });

  return {
    hasHistory: true,
    distinctDays: orderedDays.length,
    minDays,
    firstDay,
    lastDay,
    newlySeenCount,
    fadedCount,
    depthBands: sessionBands(valid),
    rows: allRows.slice(0, limit),
  };
}
