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
 *   - Multi-day repeat vs single-day app visits summarise familiar rhythm vs
 *     occasional visits across the recorded window, carrying a `limitedHistory`
 *     caveat (`< 14` days) so single-day visits are never misread as newly
 *     installed apps.
 *   - `topAppByTime` comes from authoritative OS `queryUsageStats` totals.
 *   - `explicitLabels` uses `countExplicitLabels` from `scoring.ts` (single
 *     source of truth shared with `scoreIqs`/Why sheet, scoped to `labelWindow`
 *     when supplied so day-level Why sheet and J9 never disagree).
 */
import type { DataTier } from '@mirror/shared-types';
import { localDay } from './ingest';
import {
  SWITCH_GAP_MS,
  countExplicitLabels,
  type ExplicitLabelCounts,
  type IntentLabel,
  type ScoredSession,
} from './scoring';
import { SHORT_SESSION_MS } from './sessionize';
import { isIgnoredSystemApp } from './usage';

export const MIN_DISCOVERY_DAYS = 3;
export const FULL_DISCOVERY_DAYS = 14;
export const MIN_REPEATED_ROUTE_COUNT = 2;
export const MIN_REPEAT_SHARE_SESSIONS = 5;

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
  tier: 'D';
};

export type DiscoveryOsTotalInput = {
  app: string;
  label?: string;
  totalMs: number;
};

export type DiscoveryJourneyInput = {
  sessions: readonly ScoredSession[];
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
  /** Share of sustained sittings spent in apps active on 2+ days, bounded [0, 1]. */
  repeatSessionShare: number;
  /** False when fewer than `MIN_REPEAT_SHARE_SESSIONS` (5) sustained sittings exist. */
  repeatShareMeasurable: boolean;
  /** Total sustained cross-app handoffs (A -> B within 5 min) across window. */
  totalHandoffs: number;
  /** Repeated cross-app handoffs (count >= 2), ranked by activeDays then count. */
  routes: DiscoveryRouteRow[];
  /** Authoritative OS foreground top app for selected day/range when supplied. */
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
  const launcherSet = new Set<string>(input.ignorePackages ?? []);
  const labels = input.labels ?? {};

  const valid = input.sessions.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    if (launcherSet.has(s.app)) return false;
    if (isIgnoredSystemApp(s.app, labels[s.app])) return false;
    return true;
  });

  // Resolve authoritative OS top app (excluding launchers & ignored system/installer packages)
  let topAppByTime: TopAppByTimeFact | null = null;
  if (input.osTotals && input.osTotals.length > 0) {
    const validOs = input.osTotals
      .filter(
        (r) =>
          Number.isFinite(r.totalMs) &&
          r.totalMs > 0 &&
          !launcherSet.has(r.app) &&
          !isIgnoredSystemApp(r.app, r.label ?? labels[r.app]),
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

  // App-level active days across all valid sessions
  const appDaysMap = new Map<string, Set<string>>();
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
    repeatShareMeasurable: sustained.length >= MIN_REPEAT_SHARE_SESSIONS,
    totalHandoffs,
    routes,
    topAppByTime,
    newTopicsOpened: UNAVAILABLE_TOPICS,
    searchesStarted: UNAVAILABLE_SEARCHES,
    explicitLabels,
  };
}
