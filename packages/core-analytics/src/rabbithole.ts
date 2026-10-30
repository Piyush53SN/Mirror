/**
 * Rabbit Hole detector (Tier D usage-pattern degradation — raw-open return clusters).
 *
 * Why raw opens BEFORE session merging:
 *   `sessionize` merges same-app reopens within 15 minutes into a single sitting.
 *   Running Rabbit Hole on merged sittings swallowed the exact rapid-reopen pattern
 *   (4+ returns within 15 minutes) that defines a return cluster, producing 0 clusters
 *   across 11 days / 49 sittings.
 *
 * Definition (stated in one plain sentence on screen):
 *   A rabbit hole is 4 or more returns to the same app (5+ opens of at least 8 seconds,
 *   at most 30 minutes apart, with no other app in between) spanning over 30 minutes
 *   from first open to last close.
 *
 * Neutrality rule: clusters are reported descriptively, never framed as failure,
 * never scored against IQS, never blocked or nudged unprompted, and never shown
 * on any public profile.
 */
import { clipIntervalToLocalDays, type StoredForegroundEventInput } from './evolution';
import { localDay } from './ingest';
import {
  countExplicitLabels,
  lateNightMs,
  type ExplicitLabelCounts,
  type IntentLabel,
  type ScoredSession,
} from './scoring';
import { SHORT_SESSION_MS } from './sessionize';
import { isExcludedApp, isLabelingExcludedApp } from './usage';

export const MIN_RABBIT_HOLE_DAYS = 3;
export const FULL_RABBIT_HOLE_DAYS = 14;
/** Spec bar: at least 4 returns to the same app (5+ raw opens total). */
export const DEFAULT_RABBIT_MIN_RETURNS = 4;
export const DEFAULT_RABBIT_MIN_CONSECUTIVE = DEFAULT_RABBIT_MIN_RETURNS + 1;
/** Spec bar: cluster session span from first open to last close must exceed 30 minutes. */
export const DEFAULT_RABBIT_MIN_SESSION_MS = 30 * 60_000;
/** Maximum idle gap between consecutive opens of the same app inside one cluster (30 min). */
export const DEFAULT_RABBIT_MAX_GAP_MS = 30 * 60_000;

export type RabbitHoleCluster = {
  id: string;
  app: string;
  label: string;
  day: string;
  startMs: number;
  endMs: number;
  /** Cluster session span from first open start to last open close (`endMs - startMs > 30 min`). */
  spanMs: number;
  /** Number of raw opens in this cluster (`openCount >= 5`). */
  openCount: number;
  /** Alias of `openCount` kept for compatibility with existing callers. */
  sittingCount: number;
  /** Number of returns after the initial open (`openCount - 1 >= 4`). */
  returnCount: number;
  /** Day-clipped active foreground time across the opens in this cluster (ms). */
  totalForegroundMs: number;
  /** Alias of `totalForegroundMs` so time figures report real foreground time, never idle gaps. */
  totalSittingMs: number;
  lateNightMs: number;
  explicitLabels: ExplicitLabelCounts;
  tier: 'D';
};

export type RabbitHoleCapabilities = {
  tierDCanDetect: readonly string[];
  tierDCannotDetect: readonly string[];
  whatMirrorWillNotDo: string;
};

export type RabbitHoleInput = {
  /** Raw usage events (`app_background` intervals) before 15-min session merging (preferred). */
  events?: readonly StoredForegroundEventInput[];
  /** Optional pre-extracted raw opens before merging. */
  rawOpens?: readonly ScoredSession[];
  /** Merged sittings (used for explicit user label lookup, or as open source in legacy unit tests that omit `events`). */
  sessions?: readonly ScoredSession[];
  nowMs?: number;
  intentLabels?: Readonly<Record<string, IntentLabel['label']>>;
  labels?: Readonly<Record<string, string>>;
  ignorePackages?: readonly string[];
  utcOffsetMinutes?: number;
  minDays?: number;
  /** Minimum returns to the same app after the initial open (default 4 -> 5+ opens). */
  minReturns?: number;
  /** Minimum cluster span from first open to last close in ms (strictly `>`, default 30 min). */
  minTotalSessionMs?: number;
  minConsecutive?: number;
  minSittingMs?: number;
  maxGapMs?: number;
  clusterLimit?: number;
};

export type RabbitHoleResult = {
  hasHistory: boolean;
  distinctDays: number;
  minDays: number;
  limitedHistory: boolean;
  historyStartDay: string | null;
  lastDay: string | null;
  /** One plain sentence defining what counts as a rabbit hole. */
  definitionText: string;
  clusterCount: number;
  totalClusterOpens: number;
  totalClusterSittings: number;
  /** Total day-clipped foreground time across all detected clusters (ms). */
  totalClusterMs: number;
  /** Total cluster span time across all detected clusters (ms). */
  totalClusterSpanMs: number;
  /** Share of cluster foreground time in 23:00–05:00 local, bounded [0, 1]. */
  lateNightShare: number;
  /** False when total cluster foreground time is under 5 min (small sample). */
  lateNightShareMeasurable: boolean;
  /** Explicit user labels attached to opens/sittings inside detected clusters. */
  clusterExplicitLabels: ExplicitLabelCounts;
  /** Top recent clusters (up to `clusterLimit`), newest first. */
  clusters: RabbitHoleCluster[];
  capabilities: RabbitHoleCapabilities;
};

const CAPABILITIES: RabbitHoleCapabilities = {
  tierDCanDetect: [
    '4+ returns to the same app (5+ raw opens before merging, up to 30 min apart) spanning over 30 min from first open to last close',
    'Day-clipped active foreground time inside each cluster and share falling between 23:00 and 05:00 local',
    'Any explicit intentional or mindless labels you added to sittings overlapping those clusters',
  ],
  tierDCannotDetect: [
    'Whether an open started from a search or resulted in a save (needs content or connector sources)',
    'Feed scrolling vs purposeful work or messaging inside an app (needs content sources)',
    'Intent without your explicit label (duration and repeat opens never imply mindless use)',
  ],
  whatMirrorWillNotDo:
    'Mirror does not block apps, send unprompted nudges, penalise your score for this count, or include it on any public profile.',
};

function extractRawOpensFromEvents(
  events: readonly StoredForegroundEventInput[],
  nowMs?: number,
): ScoredSession[] {
  const opens: ScoredSession[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const ev of events) {
    if (ev.kind !== 'app_background' || typeof ev.app !== 'string' || typeof ev.duration_ms !== 'number') continue;
    const rawEnd = Date.parse(ev.at);
    const dur = Math.max(0, Math.round(ev.duration_ms));
    if (!Number.isFinite(rawEnd) || dur <= 0) continue;
    const startMs = rawEnd - dur;
    const endMs = nowMs !== undefined ? Math.min(rawEnd, nowMs) : rawEnd;
    if (endMs <= startMs) continue;
    const dedupeKey = `${ev.app}\u0000${startMs}\u0000${rawEnd}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    idx += 1;
    opens.push({
      id: ev.id ?? `raw_open_${idx}`,
      app: ev.app,
      startMs,
      endMs,
    });
  }
  return opens;
}

export function computeRabbitHoles(input: RabbitHoleInput): RabbitHoleResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const minDays = Math.max(2, input.minDays ?? MIN_RABBIT_HOLE_DAYS);
  const minReturns = Math.max(
    1,
    Math.floor(
      input.minReturns ??
        (input.minConsecutive !== undefined ? input.minConsecutive - 1 : DEFAULT_RABBIT_MIN_RETURNS),
    ),
  );
  const minConsecutive = minReturns + 1;
  const minSittingMs = Math.max(1, input.minSittingMs ?? SHORT_SESSION_MS);
  const minTotalSessionMs = Math.max(0, input.minTotalSessionMs ?? DEFAULT_RABBIT_MIN_SESSION_MS);
  const maxGapMs = Math.max(1_000, input.maxGapMs ?? DEFAULT_RABBIT_MAX_GAP_MS);
  const clusterLimit = Math.max(1, input.clusterLimit ?? 5);
  const ignorePackages = input.ignorePackages ?? [];
  const labels = input.labels ?? {};

  const minSessionMinLabel = Math.round(minTotalSessionMs / 60_000);
  const maxGapMinLabel = Math.round(maxGapMs / 60_000);
  const minSecLabel = Math.round(minSittingMs / 1_000);
  // One plain sentence, no technical jargon or internal codes:
  const definitionText = `A rabbit hole is ${minReturns}+ returns (${minConsecutive}+ opens of at least ${minSecLabel} seconds, up to ${maxGapMinLabel} minutes apart, with no other app in between) spanning over ${minSessionMinLabel} minutes from first open to last close.`;

  const sourceOpens: readonly ScoredSession[] =
    input.events !== undefined
      ? extractRawOpensFromEvents(input.events, input.nowMs)
      : input.rawOpens ?? input.sessions ?? [];

  // Exclude launchers, system/installer packages, and utility apps (dialer, camera, clock, calculator, etc.)
  const isEligibleApp = (app: string) =>
    !isExcludedApp(app, { ignorePackages, label: labels[app] }) &&
    !isLabelingExcludedApp(app, labels[app]);

  const valid = sourceOpens.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    return isEligibleApp(s.app);
  });

  const mergedSessionsForLabels = (input.sessions ?? []).filter((s) => {
    const dur = s.endMs - s.startMs;
    return Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && dur > 0 && isEligibleApp(s.app);
  });

  const daySet = new Set<string>();
  for (const s of valid) {
    daySet.add(localDay(s.startMs, utcOffsetMinutes));
  }
  for (const s of mergedSessionsForLabels) {
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
      definitionText,
      clusterCount: 0,
      totalClusterOpens: 0,
      totalClusterSittings: 0,
      totalClusterMs: 0,
      totalClusterSpanMs: 0,
      lateNightShare: 0,
      lateNightShareMeasurable: false,
      clusterExplicitLabels: { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 },
      clusters: [],
      capabilities: CAPABILITIES,
    };
  }

  const historyStartDay = orderedDays[0]!;
  const lastDay = orderedDays[orderedDays.length - 1]!;
  const limitedHistory = orderedDays.length < FULL_RABBIT_HOLE_DAYS;

  // Consider sustained opens (>= minSittingMs, default 8s) BEFORE 15-min merging;
  // brief <8s flashes do not hold attention and do not break a same-app cluster.
  const sustained = valid
    .filter((s) => s.endMs - s.startMs >= minSittingMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));

  const allClusters: RabbitHoleCluster[] = [];
  let run: ScoredSession[] = [];

  const resolveClusterLabels = (clusterRun: readonly ScoredSession[], app: string, startMs: number, endMs: number): ExplicitLabelCounts => {
    // Check explicit labels on the raw opens themselves first
    const direct = countExplicitLabels(clusterRun, input.intentLabels, {
      ignorePackages: input.ignorePackages,
      appLabels: labels,
    });
    if (direct.total > 0 || mergedSessionsForLabels.length === 0) {
      return direct;
    }
    // In the mobile app, users attach intent labels to merged sittings (`sessions`).
    // Match any merged sitting of the same app overlapping this cluster's [startMs, endMs].
    const overlappingMerged = mergedSessionsForLabels.filter(
      (s) => s.app === app && s.endMs > startMs && s.startMs < endMs,
    );
    return countExplicitLabels(overlappingMerged, input.intentLabels, {
      ignorePackages: input.ignorePackages,
      appLabels: labels,
    });
  };

  const flushRun = () => {
    if (run.length >= minConsecutive) {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const spanMs = Math.max(0, last.endMs - first.startMs);
      if (spanMs > minTotalSessionMs) {
        let totalForegroundMs = 0;
        let nightMs = 0;
        for (const s of run) {
          const clipped = clipIntervalToLocalDays(s.startMs, s.endMs, utcOffsetMinutes);
          for (const seg of clipped) totalForegroundMs += seg.ms;
          nightMs += lateNightMs(s.startMs, s.endMs, utcOffsetMinutes);
        }
        const explicit = resolveClusterLabels(run, first.app, first.startMs, last.endMs);
        allClusters.push({
          id: `rh_${first.id}_${run.length}`,
          app: first.app,
          label: labels[first.app] ?? first.app,
          day: localDay(first.startMs, utcOffsetMinutes),
          startMs: first.startMs,
          endMs: last.endMs,
          spanMs,
          openCount: run.length,
          sittingCount: run.length,
          returnCount: run.length - 1,
          totalForegroundMs,
          totalSittingMs: totalForegroundMs,
          lateNightMs: nightMs,
          explicitLabels: explicit,
          tier: 'D',
        });
      }
    }
    run = [];
  };

  for (const s of sustained) {
    if (run.length === 0) {
      run.push(s);
      continue;
    }
    const prev = run[run.length - 1]!;
    const gap = s.startMs - prev.endMs;
    if (s.app === prev.app && s.startMs >= prev.startMs && gap <= maxGapMs) {
      run.push(s);
    } else {
      // Either another app was opened (>=8s) or an idle gap > maxGapMs ended the cluster
      flushRun();
      run.push(s);
    }
  }
  flushRun();

  const clusterCount = allClusters.length;
  let totalClusterOpens = 0;
  let totalClusterMs = 0;
  let totalClusterSpanMs = 0;
  let totalLateNightMs = 0;
  let intentional = 0;
  let mindless = 0;
  let unsure = 0;

  for (const c of allClusters) {
    totalClusterOpens += c.openCount;
    totalClusterMs += c.totalForegroundMs;
    totalClusterSpanMs += c.spanMs;
    totalLateNightMs += c.lateNightMs;
    intentional += c.explicitLabels.intentional;
    mindless += c.explicitLabels.mindless;
    unsure += c.explicitLabels.unsure;
  }

  const lateNightShare =
    totalClusterMs > 0 ? Math.min(1, Math.max(0, totalLateNightMs / totalClusterMs)) : 0;

  const clusters = [...allClusters]
    .sort((a, b) => b.startMs - a.startMs || a.id.localeCompare(b.id))
    .slice(0, clusterLimit);

  return {
    hasHistory: true,
    distinctDays: orderedDays.length,
    minDays,
    limitedHistory,
    historyStartDay,
    lastDay,
    definitionText,
    clusterCount,
    totalClusterOpens,
    totalClusterSittings: totalClusterOpens,
    totalClusterMs,
    totalClusterSpanMs,
    lateNightShare,
    lateNightShareMeasurable: totalClusterMs >= 5 * 60_000,
    clusterExplicitLabels: {
      intentional,
      mindless,
      unsure,
      decisive: intentional + mindless,
      total: intentional + mindless + unsure,
    },
    clusters,
    capabilities: CAPABILITIES,
  };
}
