/**
 * J11 Rabbit Hole (Tier D usage-pattern degradation — neutral short-return clusters).
 *
 * Full rabbit-hole detection in `SPEC.md` / `RabbitHoleScreen` combines OS session
 * boundaries (Tier D) with content/search signals (Tier A/B/C) to tell whether
 * repeated short visits had no search or save and were feed drift vs purposeful
 * quick checks.
 *
 * When only Tier D OS usage exists (and session boundaries pass the reliability
 * gate: orphans ≤ 50, gaps ≤ 100, and 3+ distinct local days exist), Mirror
 * states the exact Tier-D definition and capability boundary on screen:
 *
 *   What Tier D CAN detect:
 *     - Clusters of 3+ consecutive short sittings (8 s to under 5 min each,
 *       separated by at most 60 min) on the same app with no other app opened
 *       in between (after excluding launchers, system/installer packages, and
 *       utility apps like dialer/camera/clock/calculator).
 *     - Share of cluster time falling between 23:00 and 05:00 local.
 *     - Explicit user `intent_label` annotations (`intentional` / `mindless` /
 *       `unsure`) attached to sittings inside those clusters.
 *
 *   What Tier D CANNOT detect (requires Tier A/B/C):
 *     - Whether a sitting began with a search query or saved item (`unavailable`).
 *     - Algorithmic feed scrolling vs purposeful quick checks (e.g. checking
 *       transit, messages, or reference docs).
 *     - Intent when no explicit user label was given (duration and frequency
 *       never guess intent).
 *
 * Neutrality rule: clusters are reported descriptively, never framed as failure,
 * never scored against IQS, never blocked or nudged unprompted, and never shown
 * on any public profile.
 */
import { localDay } from './ingest';
import {
  countExplicitLabels,
  lateNightMs,
  type ExplicitLabelCounts,
  type IntentLabel,
  type ScoredSession,
} from './scoring';
import { SHORT_SESSION_MS } from './sessionize';
import { isIgnoredSystemApp, isLabelingExcludedApp } from './usage';

export const MIN_RABBIT_HOLE_DAYS = 3;
export const FULL_RABBIT_HOLE_DAYS = 14;
export const DEFAULT_RABBIT_MIN_CONSECUTIVE = 3;
export const DEFAULT_RABBIT_MAX_SITTING_MS = 5 * 60_000;
export const DEFAULT_RABBIT_MAX_GAP_MS = 60 * 60_000;

export type RabbitHoleCluster = {
  id: string;
  app: string;
  label: string;
  day: string;
  startMs: number;
  endMs: number;
  sittingCount: number;
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
  sessions: readonly ScoredSession[];
  intentLabels?: Readonly<Record<string, IntentLabel['label']>>;
  labels?: Readonly<Record<string, string>>;
  ignorePackages?: readonly string[];
  utcOffsetMinutes?: number;
  minDays?: number;
  minConsecutive?: number;
  minSittingMs?: number;
  maxSittingMs?: number;
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
  definitionText: string;
  clusterCount: number;
  totalClusterSittings: number;
  totalClusterMs: number;
  /** Share of cluster sitting time in 23:00–05:00 local, bounded [0, 1]. */
  lateNightShare: number;
  /** False when total cluster sitting time is under 5 min (small sample). */
  lateNightShareMeasurable: boolean;
  /** Explicit user labels attached to sittings inside detected clusters. */
  clusterExplicitLabels: ExplicitLabelCounts;
  /** Top recent clusters (up to `clusterLimit`), newest first. */
  clusters: RabbitHoleCluster[];
  capabilities: RabbitHoleCapabilities;
};

const CAPABILITIES: RabbitHoleCapabilities = {
  tierDCanDetect: [
    '3+ consecutive short sittings (8 s to under 5 min) on the same app within 60 min, with no other app in between',
    'Share of those sittings falling between 23:00 and 05:00 local',
    'Any explicit intentional or mindless labels you added to those sittings',
  ],
  tierDCannotDetect: [
    'Whether a visit started from a search or resulted in a save (needs Tier A/B/C)',
    'Feed scrolling vs purposeful quick checks such as messages, transit, or docs (needs Tier A/B/C)',
    'Intent without your explicit label (duration and repeat opens never imply mindless use)',
  ],
  whatMirrorWillNotDo:
    'Mirror does not block apps, send unprompted nudges, penalise IQS for this count, or include it on any public profile.',
};

export function computeRabbitHoles(input: RabbitHoleInput): RabbitHoleResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const minDays = Math.max(2, input.minDays ?? MIN_RABBIT_HOLE_DAYS);
  const minConsecutive = Math.max(2, Math.floor(input.minConsecutive ?? DEFAULT_RABBIT_MIN_CONSECUTIVE));
  const minSittingMs = Math.max(1, input.minSittingMs ?? SHORT_SESSION_MS);
  const maxSittingMs = Math.max(minSittingMs + 1, input.maxSittingMs ?? DEFAULT_RABBIT_MAX_SITTING_MS);
  const maxGapMs = Math.max(1_000, input.maxGapMs ?? DEFAULT_RABBIT_MAX_GAP_MS);
  const clusterLimit = Math.max(1, input.clusterLimit ?? 5);
  const launcherSet = new Set<string>(input.ignorePackages ?? []);
  const labels = input.labels ?? {};

  const maxMinLabel = Math.round(maxSittingMs / 60_000);
  const maxGapMinLabel = Math.round(maxGapMs / 60_000);
  const minSecLabel = Math.round(minSittingMs / 1_000);
  const definitionText = `${minConsecutive}+ consecutive short sittings (${minSecLabel} s to under ${maxMinLabel} min each, within ${maxGapMinLabel} min) on the same app with no other app opened in between. Search and save signals are unavailable on Tier D.`;

  // Exclude launchers, system/installer packages, and utility apps (dialer, camera, clock, calculator, etc.)
  const valid = input.sessions.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    if (launcherSet.has(s.app)) return false;
    if (isIgnoredSystemApp(s.app, labels[s.app])) return false;
    if (isLabelingExcludedApp(s.app, labels[s.app])) return false;
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
      definitionText,
      clusterCount: 0,
      totalClusterSittings: 0,
      totalClusterMs: 0,
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

  // Consider sustained sittings (>= minSittingMs, default 8s); brief <8s flashes do not hold attention
  const sustained = valid
    .filter((s) => s.endMs - s.startMs >= minSittingMs)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));

  const allClusters: RabbitHoleCluster[] = [];
  let run: ScoredSession[] = [];

  const flushRun = () => {
    if (run.length >= minConsecutive) {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      let totalSittingMs = 0;
      let nightMs = 0;
      for (const s of run) {
        totalSittingMs += Math.max(0, s.endMs - s.startMs);
        nightMs += lateNightMs(s.startMs, s.endMs, utcOffsetMinutes);
      }
      const explicit = countExplicitLabels(run, input.intentLabels, {
        ignorePackages: input.ignorePackages,
        appLabels: labels,
      });
      allClusters.push({
        id: `rh_${first.id}_${run.length}`,
        app: first.app,
        label: labels[first.app] ?? first.app,
        day: localDay(first.startMs, utcOffsetMinutes),
        startMs: first.startMs,
        endMs: last.endMs,
        sittingCount: run.length,
        totalSittingMs,
        lateNightMs: nightMs,
        explicitLabels: explicit,
        tier: 'D',
      });
    }
    run = [];
  };

  for (const s of sustained) {
    const dur = s.endMs - s.startMs;
    const isShort = dur >= minSittingMs && dur < maxSittingMs;
    if (!isShort) {
      // A longer (>= maxSittingMs) sitting breaks any short-return run
      flushRun();
      continue;
    }
    if (run.length === 0) {
      run.push(s);
      continue;
    }
    const prev = run[run.length - 1]!;
    const gap = s.startMs - prev.endMs;
    if (s.app === prev.app && s.startMs >= prev.startMs && gap <= maxGapMs) {
      run.push(s);
    } else {
      // Either a cross-app switch or a gap > maxGapMs breaks the consecutive run
      flushRun();
      run.push(s);
    }
  }
  flushRun();

  const clusterCount = allClusters.length;
  let totalClusterSittings = 0;
  let totalClusterMs = 0;
  let totalLateNightMs = 0;
  const clusterMemberSessions: ScoredSession[] = [];

  // Re-collect member sessions for clean deduplicated explicit-label summary across all clusters
  let intentional = 0;
  let mindless = 0;
  let unsure = 0;
  for (const c of allClusters) {
    totalClusterSittings += c.sittingCount;
    totalClusterMs += c.totalSittingMs;
    totalLateNightMs += c.lateNightMs;
    intentional += c.explicitLabels.intentional;
    mindless += c.explicitLabels.mindless;
    unsure += c.explicitLabels.unsure;
  }
  void clusterMemberSessions;

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
    totalClusterSittings,
    totalClusterMs,
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
