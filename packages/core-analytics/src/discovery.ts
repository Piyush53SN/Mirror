/**
 * J9 Discovery Journey (Tier D usage-pattern degradation).
 *
 * Full step-by-step topic discovery (`search → page → follow-up`) requires
 * Tier A/B/C topic and search signals. On Tier D OS usage alone, Mirror never
 * invents topics or search routes from package names:
 *   - `newTopicsOpened` and `searchesStarted` explicitly report `unavailable`
 *     with the exact tiers needed (`A/B/C` and `C`).
 *   - Cross-app handoff routes (`App A → App B` within `SWITCH_GAP_MS` = 5 min
 *     over sustained sittings `≥ 8 s`) show real multi-day app-to-app paths,
 *     excluding launchers, Mirror, Settings, Play Store/Services, and all
 *     Android/OEM Package installers.
 *   - Every time or share figure (`topAppByTime`, `repeatForegroundShare`) uses
 *     day-clipped foreground time (`events` / `osTotals`), while merged spans
 *     (`sessions`) are kept strictly for sitting counts and route counts.
 *   - `explicitLabels` uses `countExplicitLabels` from `scoring.ts` (single
 *     source of truth shared with `scoreIqs`/Why sheet, scoped to `labelWindow`
 *     when supplied so day-level Why sheet and Discovery never disagree).
 */
import type { DataTier } from '@mirror/shared-types';
import { clipIntervalToLocalDays, type StoredForegroundEventInput } from './evolution';
import { localDay } from './ingest';
import {
  SWITCH_GAP_MS,
  countExplicitLabels,
  type ExplicitLabelCounts,
  type IntentLabel,
  type ScoredSession,
} from './scoring';
import { SHORT_SESSION_MS } from './sessionize';
import { isExcludedApp } from './usage';

export const MIN_DISCOVERY_DAYS = 3;
export const FULL_DISCOVERY_DAYS = 14;
export const MIN_REPEATED_ROUTE_COUNT = 2;
export const MIN_REPEAT_SHARE_SESSIONS = 5;
export const MIN_REPEAT_SHARE_FOREGROUND_MS = 5 * 60_000;

export type DiscoveryRouteRow = {
  fromApp: string;
  fromLabel: string;
  toApp: string;
  toLabel: string;
  count: number;
  activeDays: number;
  tier: 'D';
};

export type UnavailableDiscoveryFact = {
  status: 'unavailable';
  value: 'unavailable';
  requiredTiers: readonly DataTier[];
  detail: string;
};

export type TopAppByTimeFact = {
  app: string;
  label: string;
  totalMs: number;
  /** Per-active-day day-clipped foreground average (ms/day). */
  avgDailyMs?: number;
  activeDays?: number;
  /** Share of total day-clipped foreground time in [0, 1]. */
  share?: number;
  tier: 'D';
};

export type DiscoveryOsTotalInput = {
  app: string;
  label?: string;
  totalMs: number;
};

export type DiscoveryJourneyInput = {
  sessions: readonly ScoredSession[];
  /** Stored usage events (`app_background` intervals) for exact multi-day day-clipped foreground time & share. */
  events?: readonly StoredForegroundEventInput[];
  nowMs?: number;
  osTotals?: readonly DiscoveryOsTotalInput[];
  intentLabels?: Readonly<Record<string, IntentLabel['label']>>;
  /**
   * Optional window (e.g. `selectedDay` `[fromMs, toMs)`) to scope `explicitLabels`
   * so it reconciles 1-for-1 with the IQS Why sheet for the viewed day.
   */
  labelWindow?: { fromMs: number; toMs: number };
  labels?: Readonly<Record<string, string>>;
  ignorePackages?: readonly string[];
  utcOffsetMinutes?: number;
  minDays?: number;
  routeLimit?: number;
};

export type DiscoveryJourneyResult = {
  hasHistory: boolean;
  distinctDays: number;
  minDays: number;
  limitedHistory: boolean;
  historyStartDay: string | null;
  lastDay: string | null;
  totalSessions: number;
  sustainedSessionCount: number;
  shortBounceCount: number;
  totalAppsVisited: number;
  repeatAppsCount: number;
  singleDayAppsCount: number;
  /** Share of sustained sittings (by count) in apps active on 2+ days, bounded [0, 1]. */
  repeatSessionShare: number;
  /** Share of day-clipped foreground time spent in apps active on 2+ days, bounded [0, 1]. */
  repeatForegroundShare: number;
  /** False when too few sittings / foreground minutes exist to form a meaningful share. */
  repeatShareMeasurable: boolean;
  /** Total sustained cross-app handoffs (A -> B within 5 min) across window. */
  totalHandoffs: number;
  /** Repeated cross-app handoffs (count >= 2), ranked by activeDays then count. */
  routes: DiscoveryRouteRow[];
  /** Authoritative day-clipped foreground top app across the window (or `osTotals` fallback). */
  topAppByTime: TopAppByTimeFact | null;
  /** Honest Tier-D capability flags: never faked from package names. */
  newTopicsOpened: UnavailableDiscoveryFact;
  searchesStarted: UnavailableDiscoveryFact;
  /** Explicit user intent_label counts only (shared with scoreIqs / Why sheet). */
  explicitLabels: ExplicitLabelCounts;
};

const UNAVAILABLE_TOPICS: UnavailableDiscoveryFact = {
  status: 'unavailable',
  value: 'unavailable',
  requiredTiers: ['A', 'B', 'C'],
  detail: 'Needs topic-level data (Tier A/B/C).',
};

const UNAVAILABLE_SEARCHES: UnavailableDiscoveryFact = {
  status: 'unavailable',
  value: 'unavailable',
  requiredTiers: ['C'],
  detail: 'Needs browser extension on allow-listed sites (Tier C).',
};

export function computeDiscoveryJourney(input: DiscoveryJourneyInput): DiscoveryJourneyResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const minDays = Math.max(2, input.minDays ?? MIN_DISCOVERY_DAYS);
  const routeLimit = Math.max(1, input.routeLimit ?? 5);
  const ignorePackages = input.ignorePackages ?? [];
  const labels = input.labels ?? {};

  const valid = input.sessions.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    if (isExcludedApp(s.app, { ignorePackages, label: labels[s.app] })) return false;
    return true;
  });

  // Compute day-clipped foreground time per (app, day) from stored `app_background` events when provided
  const hasEventSource = input.events !== undefined;
  const fgPerAppDay = new Map<string, Map<string, number>>();
  if (hasEventSource) {
    const seenIntervals = new Set<string>();
    for (const ev of input.events ?? []) {
      if (ev.kind !== 'app_background' || typeof ev.app !== 'string' || typeof ev.duration_ms !== 'number') continue;
      if (isExcludedApp(ev.app, { ignorePackages, label: labels[ev.app] })) continue;
      const rawEnd = Date.parse(ev.at);
      const dur = Math.max(0, Math.round(ev.duration_ms));
      if (!Number.isFinite(rawEnd) || dur <= 0) continue;
      const startMs = rawEnd - dur;
      const endMs = input.nowMs !== undefined ? Math.min(rawEnd, input.nowMs) : rawEnd;
      if (endMs <= startMs) continue;
      const key = `${ev.app}\u0000${startMs}\u0000${rawEnd}`;
      if (seenIntervals.has(key)) continue;
      seenIntervals.add(key);
      const clipped = clipIntervalToLocalDays(startMs, endMs, utcOffsetMinutes);
      let appMap = fgPerAppDay.get(ev.app);
      if (!appMap) {
        appMap = new Map<string, number>();
        fgPerAppDay.set(ev.app, appMap);
      }
      for (const seg of clipped) {
        appMap.set(seg.day, (appMap.get(seg.day) ?? 0) + seg.ms);
      }
    }
  }

  // Resolve top app by day-clipped foreground time across the multi-day window when `events` is passed;
  // fall back to `osTotals` when `events` is omitted.
  let topAppByTime: TopAppByTimeFact | null = null;
  if (hasEventSource && fgPerAppDay.size > 0) {
    let grandTotalMs = 0;
    const ranked: { app: string; totalMs: number; activeDays: number }[] = [];
    for (const [app, dayMap] of fgPerAppDay.entries()) {
      let totalMs = 0;
      let activeDays = 0;
      for (const msVal of dayMap.values()) {
        if (msVal > 0) {
          totalMs += msVal;
          activeDays += 1;
        }
      }
      if (totalMs > 0) {
        grandTotalMs += totalMs;
        ranked.push({ app, totalMs, activeDays });
      }
    }
    ranked.sort((a, b) => b.totalMs - a.totalMs || a.app.localeCompare(b.app));
    if (ranked.length > 0) {
      const top = ranked[0]!;
      topAppByTime = {
        app: top.app,
        label: labels[top.app] ?? top.app,
        totalMs: top.totalMs,
        avgDailyMs: Math.round(top.totalMs / Math.max(1, top.activeDays)),
        activeDays: top.activeDays,
        share: grandTotalMs > 0 ? Math.min(1, Math.max(0, top.totalMs / grandTotalMs)) : 0,
        tier: 'D',
      };
    }
  } else if (input.osTotals && input.osTotals.length > 0) {
    const validOs = input.osTotals
      .filter(
        (r) =>
          Number.isFinite(r.totalMs) &&
          r.totalMs > 0 &&
          !isExcludedApp(r.app, { ignorePackages, label: r.label ?? labels[r.app] }),
      )
      .sort((a, b) => b.totalMs - a.totalMs || a.app.localeCompare(b.app));
    if (validOs.length > 0) {
      const top = validOs[0]!;
      topAppByTime = {
        app: top.app,
        label: top.label ?? labels[top.app] ?? top.app,
        totalMs: top.totalMs,
        tier: 'D',
      };
    }
  }

  const daySet = new Set<string>();
  if (hasEventSource) {
    for (const dayMap of fgPerAppDay.values()) {
      for (const [d, msVal] of dayMap.entries()) {
        if (msVal > 0) daySet.add(d);
      }
    }
  }
  for (const s of valid) {
    daySet.add(localDay(s.startMs, utcOffsetMinutes));
  }
  const orderedDays = [...daySet].sort();

  const explicitLabels = countExplicitLabels(valid, input.intentLabels, {
    window: input.labelWindow,
    ignorePackages: input.ignorePackages,
    appLabels: labels,
  });

  if (orderedDays.length < minDays) {
    return {
      hasHistory: false,
      distinctDays: orderedDays.length,
      minDays,
      limitedHistory: true,
      historyStartDay: orderedDays[0] ?? null,
      lastDay: orderedDays[orderedDays.length - 1] ?? null,
      totalSessions: valid.length,
      sustainedSessionCount: 0,
      shortBounceCount: 0,
      totalAppsVisited: 0,
      repeatAppsCount: 0,
      singleDayAppsCount: 0,
      repeatSessionShare: 0,
      repeatForegroundShare: 0,
      repeatShareMeasurable: false,
      totalHandoffs: 0,
      routes: [],
      topAppByTime,
      newTopicsOpened: UNAVAILABLE_TOPICS,
      searchesStarted: UNAVAILABLE_SEARCHES,
      explicitLabels: { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 },
    };
  }

  const historyStartDay = orderedDays[0]!;
  const lastDay = orderedDays[orderedDays.length - 1]!;
  const limitedHistory = orderedDays.length < FULL_DISCOVERY_DAYS;

  // App-level active days across day-clipped foreground events (plus valid sessions)
  const appDaysMap = new Map<string, Set<string>>();
  for (const [app, dayMap] of fgPerAppDay.entries()) {
    for (const [d, msVal] of dayMap.entries()) {
      if (msVal <= 0) continue;
      let set = appDaysMap.get(app);
      if (!set) {
        set = new Set<string>();
        appDaysMap.set(app, set);
      }
      set.add(d);
    }
  }
  for (const s of valid) {
    const d = localDay(s.startMs, utcOffsetMinutes);
    let set = appDaysMap.get(s.app);
    if (!set) {
      set = new Set<string>();
      appDaysMap.set(s.app, set);
    }
    set.add(d);
  }

  const totalAppsVisited = appDaysMap.size;
  let repeatAppsCount = 0;
  let singleDayAppsCount = 0;
  for (const days of appDaysMap.values()) {
    if (days.size >= 2) repeatAppsCount += 1;
    else singleDayAppsCount += 1;
  }

  // Sustained sittings (>= 8s) hold attention; opens < 8s are brief bounces/redirects
  const sustained = valid
    .filter((s) => s.endMs - s.startMs >= SHORT_SESSION_MS)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const shortBounceCount = valid.length - sustained.length;

  let repeatSustainedCount = 0;
  for (const s of sustained) {
    if ((appDaysMap.get(s.app)?.size ?? 0) >= 2) {
      repeatSustainedCount += 1;
    }
  }
  const repeatSessionShare =
    sustained.length > 0 ? Math.min(1, Math.max(0, repeatSustainedCount / sustained.length)) : 0;

  // Compute `repeatForegroundShare` strictly from day-clipped foreground time
  let totalFgMs = 0;
  let repeatFgMs = 0;
  if (hasEventSource && fgPerAppDay.size > 0) {
    for (const [app, dayMap] of fgPerAppDay.entries()) {
      let appMs = 0;
      for (const msVal of dayMap.values()) appMs += msVal;
      totalFgMs += appMs;
      if ((appDaysMap.get(app)?.size ?? 0) >= 2) repeatFgMs += appMs;
    }
  } else {
    for (const s of sustained) {
      const clipped = clipIntervalToLocalDays(s.startMs, s.endMs, utcOffsetMinutes);
      let sMs = 0;
      for (const seg of clipped) sMs += seg.ms;
      totalFgMs += sMs;
      if ((appDaysMap.get(s.app)?.size ?? 0) >= 2) repeatFgMs += sMs;
    }
  }
  const repeatForegroundShare =
    totalFgMs > 0 ? Math.min(1, Math.max(0, repeatFgMs / totalFgMs)) : 0;
  const repeatShareMeasurable = hasEventSource
    ? totalFgMs >= MIN_REPEAT_SHARE_FOREGROUND_MS
    : sustained.length >= MIN_REPEAT_SHARE_SESSIONS;

  // Cross-app handoff routes: sustained App A -> sustained App B within SWITCH_GAP_MS (5 min)
  const routeStats = new Map<string, { fromApp: string; toApp: string; count: number; days: Set<string> }>();
  let totalHandoffs = 0;

  for (let i = 1; i < sustained.length; i += 1) {
    const prev = sustained[i - 1]!;
    const curr = sustained[i]!;
    if (curr.app === prev.app) continue;
    const gap = curr.startMs - prev.endMs;
    if (curr.startMs >= prev.startMs && gap <= SWITCH_GAP_MS) {
      totalHandoffs += 1;
      const key = `${prev.app}\u0000${curr.app}`;
      const day = localDay(curr.startMs, utcOffsetMinutes);
      let entry = routeStats.get(key);
      if (!entry) {
        entry = { fromApp: prev.app, toApp: curr.app, count: 0, days: new Set<string>() };
        routeStats.set(key, entry);
      }
      entry.count += 1;
      entry.days.add(day);
    }
  }

  const routes: DiscoveryRouteRow[] = [...routeStats.values()]
    .filter((r) => r.count >= MIN_REPEATED_ROUTE_COUNT)
    .map((r) => ({
      fromApp: r.fromApp,
      fromLabel: labels[r.fromApp] ?? r.fromApp,
      toApp: r.toApp,
      toLabel: labels[r.toApp] ?? r.toApp,
      count: r.count,
      activeDays: r.days.size,
      tier: 'D' as const,
    }))
    .sort(
      (a, b) =>
        b.activeDays - a.activeDays ||
        b.count - a.count ||
        a.fromApp.localeCompare(b.fromApp) ||
        a.toApp.localeCompare(b.toApp),
    )
    .slice(0, routeLimit);

  return {
    hasHistory: true,
    distinctDays: orderedDays.length,
    minDays,
    limitedHistory,
    historyStartDay,
    lastDay,
    totalSessions: valid.length,
    sustainedSessionCount: sustained.length,
    shortBounceCount,
    totalAppsVisited,
    repeatAppsCount,
    singleDayAppsCount,
    repeatSessionShare,
    repeatForegroundShare,
    repeatShareMeasurable,
    totalHandoffs,
    routes,
    topAppByTime,
    newTopicsOpened: UNAVAILABLE_TOPICS,
    searchesStarted: UNAVAILABLE_SEARCHES,
    explicitLabels,
  };
}
