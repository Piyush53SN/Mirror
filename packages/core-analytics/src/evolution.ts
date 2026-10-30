/**
 * J4 Interest Evolution (Tier D usage-pattern degradation).
 *
 * Full topic-level evolution requires Tier A/B/C topic vectors. When only Tier D
 * OS usage exists and session boundaries pass the reliability gate (orphans ≤ 50,
 * gaps ≤ 100), Mirror degrades honestly to app-level multi-day evolution:
 *   - "Seen since YYYY-MM-DD (history starts ...)" — never "First seen", because
 *     the start of Mirror's recorded window is not a person's first use of an app
 *   - Active-day span (k of N recorded days)
 *   - Day-clipped foreground time (`totalForegroundMs`, `avgDailyForegroundMs`) and
 *     foreground time share (`foregroundShare`) for every time or share figure;
 *     merged spans (`sessions`) are used ONLY for sitting counts and sitting-depth bands
 *   - Short/long-window direction (growing / steady / fading) comparing earlier vs
 *     recent halves of the recorded days using day-clipped foreground time, with an
 *     explicit "(limited history)" caveat whenever fewer than `FULL_EVOLUTION_DAYS` (14)
 *     days exist
 */
import { localDay } from './ingest';
import { sessionBands, type DepthBand, type ScoredSession } from './scoring';
import { isExcludedApp } from './usage';

export type StoredForegroundEventInput = {
  id?: string;
  kind: string;
  app?: string;
  at: string;
  duration_ms?: number;
};

export const MIN_EVOLUTION_DAYS = 3;
export const FULL_EVOLUTION_DAYS = 14;

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

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
  /** Merged sitting count (merged spans are kept ONLY for sitting counts). */
  sessionCount: number;
  /** Total day-clipped foreground time across active days (ms). */
  totalForegroundMs: number;
  /** Per-active-day day-clipped foreground average (ms/day), so ~10 min/day over 11 days is ~10m, never hours. */
  avgDailyForegroundMs: number;
  /** Share of total day-clipped foreground time across all apps in the window, in [0, 1]. */
  foregroundShare: number;
  /** Alias of `totalForegroundMs` so legacy readers never surface merged span durations as time. */
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
  /** Stored usage events (`app_background` intervals) used to compute exact day-clipped foreground time. */
  events?: readonly StoredForegroundEventInput[];
  nowMs?: number;
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

/**
 * Split `[startMs, endMs)` strictly along local midnight boundaries `[00:00, 24:00)`
 * under `utcOffsetMinutes` so cross-midnight spans never bleed across days.
 */
export function clipIntervalToLocalDays(
  startMs: number,
  endMs: number,
  utcOffsetMinutes: number,
): { day: string; ms: number }[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const shiftMs = utcOffsetMinutes * MIN_MS;
  const shiftedStart = startMs + shiftMs;
  const shiftedEnd = endMs + shiftMs;
  let dayCursor = Math.floor(shiftedStart / DAY_MS) * DAY_MS;
  const segments: { day: string; ms: number }[] = [];
  while (dayCursor < shiftedEnd) {
    const segStart = Math.max(shiftedStart, dayCursor);
    const segEnd = Math.min(shiftedEnd, dayCursor + DAY_MS);
    const clippedMs = segEnd - segStart;
    if (clippedMs > 0) {
      segments.push({
        day: localDay(dayCursor - shiftMs, utcOffsetMinutes),
        ms: clippedMs,
      });
    }
    dayCursor += DAY_MS;
  }
  return segments;
}

export function computeInterestEvolution(input: InterestEvolutionInput): InterestEvolutionResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const minDays = Math.max(2, input.minDays ?? MIN_EVOLUTION_DAYS);
  const limit = Math.max(1, input.limit ?? 8);
  const ignorePackages = input.ignorePackages ?? [];
  const labels = input.labels ?? {};

  const validSessions = input.sessions.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    if (isExcludedApp(s.app, { ignorePackages, label: labels[s.app] })) return false;
    return true;
  });

  // Extract exact day-clipped foreground time per (app, day) from stored `app_background` events
  // when supplied; fall back to day-clipped session intervals only in unit tests that omit `events`.
  const hasEventSource = input.events !== undefined;
  const perAppDayMs = new Map<string, Map<string, number>>();
  const firstStartByApp = new Map<string, number>();
  const lastStartByApp = new Map<string, number>();
  const allDaysSet = new Set<string>();

  const recordInterval = (app: string, rawStartMs: number, rawEndMs: number) => {
    const effectiveEndMs =
      input.nowMs !== undefined ? Math.min(rawEndMs, input.nowMs) : rawEndMs;
    if (!Number.isFinite(rawStartMs) || !Number.isFinite(effectiveEndMs) || effectiveEndMs <= rawStartMs) {
      return;
    }
    const prevFirst = firstStartByApp.get(app);
    if (prevFirst === undefined || rawStartMs < prevFirst) firstStartByApp.set(app, rawStartMs);
    const prevLast = lastStartByApp.get(app);
    if (prevLast === undefined || rawStartMs > prevLast) lastStartByApp.set(app, rawStartMs);

    const clipped = clipIntervalToLocalDays(rawStartMs, effectiveEndMs, utcOffsetMinutes);
    let appMap = perAppDayMs.get(app);
    if (!appMap) {
      appMap = new Map<string, number>();
      perAppDayMs.set(app, appMap);
    }
    for (const seg of clipped) {
      allDaysSet.add(seg.day);
      appMap.set(seg.day, (appMap.get(seg.day) ?? 0) + seg.ms);
    }
  };

  if (hasEventSource) {
    const seenIntervals = new Set<string>();
    for (const ev of input.events ?? []) {
      if (ev.kind !== 'app_background' || typeof ev.app !== 'string' || typeof ev.duration_ms !== 'number') continue;
      if (isExcludedApp(ev.app, { ignorePackages, label: labels[ev.app] })) continue;
      const endMs = Date.parse(ev.at);
      const dur = Math.max(0, Math.round(ev.duration_ms));
      if (!Number.isFinite(endMs) || dur <= 0) continue;
      const startMs = endMs - dur;
      const dedupeKey = `${ev.app}\u0000${startMs}\u0000${endMs}`;
      if (seenIntervals.has(dedupeKey)) continue;
      seenIntervals.add(dedupeKey);
      recordInterval(ev.app, startMs, endMs);
    }
  } else {
    for (const s of validSessions) {
      recordInterval(s.app, s.startMs, s.endMs);
    }
  }

  // Group merged sittings by app strictly for `sessionCount` and `dominantBand`
  const sessionsByApp = new Map<string, ScoredSession[]>();
  for (const s of validSessions) {
    const list = sessionsByApp.get(s.app);
    if (list) list.push(s);
    else sessionsByApp.set(s.app, [s]);
  }

  const orderedDays = [...allDaysSet].sort();

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

  let totalWindowForegroundMs = 0;
  for (const appDayMap of perAppDayMs.values()) {
    for (const msVal of appDayMap.values()) {
      totalWindowForegroundMs += msVal;
    }
  }

  const allRows: AppEvolutionRow[] = [];
  for (const [app, appDayMap] of perAppDayMs.entries()) {
    let totalForegroundMs = 0;
    let earlierMs = 0;
    let recentMs = 0;
    const activeDayList: string[] = [];

    for (const [d, msVal] of appDayMap.entries()) {
      if (msVal <= 0) continue;
      activeDayList.push(d);
      totalForegroundMs += msVal;
      if (earlierDays.has(d)) earlierMs += msVal;
      if (recentDays.has(d)) recentMs += msVal;
    }
    if (activeDayList.length === 0 || totalForegroundMs <= 0) continue;
    activeDayList.sort();

    const seenSinceMs = firstStartByApp.get(app) ?? 0;
    const seenSinceDay = activeDayList[0]!;
    const lastSeenDay = activeDayList[activeDayList.length - 1]!;
    const activeDays = activeDayList.length;
    const avgDailyForegroundMs = Math.round(totalForegroundMs / Math.max(1, activeDays));
    const foregroundShare =
      totalWindowForegroundMs > 0
        ? Math.min(1, Math.max(0, totalForegroundMs / totalWindowForegroundMs))
        : 0;

    const appSessions = sessionsByApp.get(app) ?? [];
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
    } else if (activeDays >= 2 && recentAvg > earlierAvg * 1.25) {
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
      activeDays,
      sessionCount: appSessions.length,
      totalForegroundMs,
      avgDailyForegroundMs,
      foregroundShare,
      totalSessionMs: totalForegroundMs,
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
    return b.totalForegroundMs - a.totalForegroundMs || a.app.localeCompare(b.app);
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
    depthBands: sessionBands(validSessions),
    rows,
  };
}
