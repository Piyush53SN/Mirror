/**
 * J18 What-if Simulator (local counterfactual arithmetic over recorded history).
 *
 * Non-negotiable rules:
 *   1. Every scenario output (`timeEstimateLabel`, `iqsEstimateLabel`, and every
 *      per-factor line) is explicitly labelled `"Estimate"`.
 *   2. Scores are NEVER rescaled to 100: `computeWhatIf` calls `scoreIqs` directly,
 *      so `max` is always the exact sum of measured factors (`/55` without 5
 *      decisive labels, `/75` with 5+ decisive labels on Tier D, `/40` if <3
 *      sittings remain, `/100` only when Tier A/B/C topic vectors are measured).
 *   3. ONLY measured factors enter `value` and `max`; unmeasured factors stay
 *      unmeasured and are listed explicitly rather than imputed or guessed.
 *      Only explicit user `intent_label`s feed Deliberate share (never duration hints).
 *   4. Every scenario states its exact assumptions (e.g. zero cross-app
 *      substitution, per-sitting truncation vs OS daily aggregate, no evening
 *      displacement before quiet hours).
 */
import {
  scoreIqs,
  type Factor,
  type IntentLabel,
  type Score,
  type ScoreGap,
  type ScoredSession,
} from './scoring';
import { SHORT_SESSION_MS } from './sessionize';
import { isIgnoredSystemApp } from './usage';

export const DEFAULT_WHATIF_CAP_MINUTES = 10;
export const DEFAULT_WHATIF_QUIET_START_HOUR = 23;
export const DEFAULT_WHATIF_QUIET_END_HOUR = 5;

export type WhatIfOsTotal = {
  app: string;
  label?: string;
  totalMs: number;
};

export type WhatIfMeasuredFactorEstimate = {
  id: Factor['id'];
  label: string;
  points: number;
  max: number;
  baselinePoints: number | null;
  deltaPoints: number | null;
  /** Always prefixed with `Estimate:`. */
  estimateLabel: string;
};

export type WhatIfIqsEstimate = {
  badge: 'Estimate';
  value: number | null;
  max: number;
  sameDenominator: boolean;
  deltaPoints: number | null;
  measuredFactors: WhatIfMeasuredFactorEstimate[];
  unmeasuredFactors: string[];
};

export type WhatIfScenarioId =
  | 'pause_top_app'
  | 'cap_sittings'
  | 'quiet_hours'
  | 'skip_short_bounces';

export type WhatIfScenario = {
  id: WhatIfScenarioId;
  title: string;
  badge: 'Estimate';
  remainingSessions: number;
  affectedSessions: number;
  estimatedTimeMs: number;
  deltaTimeMs: number;
  /** Bounded in [-1, 0]. */
  deltaTimePct: number;
  /** Always prefixed with `Estimate:`. */
  timeEstimateLabel: string;
  estimatedIqs: WhatIfIqsEstimate;
  /** Always prefixed with `Estimate:`. */
  iqsEstimateLabel: string;
  /** Explains why time and/or IQS did not change (or fell below minimum activity) today. */
  noChangeReason: string | null;
  /** Explicit assumption stated alongside the estimate. */
  assumption: string;
};

export type WhatIfInput = {
  window: { fromMs: number; toMs: number };
  sessions: readonly ScoredSession[];
  osTotals?: readonly WhatIfOsTotal[];
  labels?: readonly IntentLabel[] | Readonly<Record<string, IntentLabel['label']>>;
  appLabels?: Readonly<Record<string, string>>;
  ignorePackages?: readonly string[];
  gaps?: readonly ScoreGap[];
  utcOffsetMinutes?: number;
  approximate?: boolean;
  sittingCapMinutes?: number;
  quietHours?: { startHour: number; endHour: number };
};

export type WhatIfResult = {
  hasBaseline: boolean;
  baselineTimeMs: number;
  timeSource: 'os_aggregate' | 'sessions';
  baselineSessionCount: number;
  baselineIqs: Score;
  smallSampleBaseline: boolean;
  minimumActivityNote: string | null;
  measuredFactorSummary: string[];
  unmeasuredFactorSummary: string[];
  sittingCapMinutes: number;
  quietHoursLabel: string;
  scenarios: WhatIfScenario[];
  disclaimer: string;
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function fmtHour(h: number): string {
  const norm = ((Math.floor(h) % 24) + 24) % 24;
  return `${String(norm).padStart(2, '0')}:00`;
}

function fmtDurationShort(ms: number): string {
  const safe = Math.max(0, Math.round(ms / 1000));
  if (safe < 60) return `${safe}s`;
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtSignedPoints(delta: number): string {
  if (delta === 0) return '0.0 pts';
  return delta > 0 ? `+${delta.toFixed(1)} pts` : `−${Math.abs(delta).toFixed(1)} pts`;
}

function toLabelArray(
  labels: readonly IntentLabel[] | Readonly<Record<string, IntentLabel['label']>> | undefined,
): IntentLabel[] {
  if (!labels) return [];
  if (Array.isArray(labels)) {
    return (labels as readonly IntentLabel[]).filter(
      (entry) =>
        entry &&
        typeof entry.sessionId === 'string' &&
        (entry.label === 'intentional' || entry.label === 'mindless' || entry.label === 'unsure'),
    );
  }
  const out: IntentLabel[] = [];
  for (const [sessionId, label] of Object.entries(labels as Readonly<Record<string, IntentLabel['label']>>)) {
    if (label === 'intentional' || label === 'mindless' || label === 'unsure') {
      out.push({ sessionId, label });
    }
  }
  return out;
}

/** Subtract a single forbidden interval [cutStart, cutEnd) from segments. */
function subtractSpan(
  segments: { startMs: number; endMs: number }[],
  cutStart: number,
  cutEnd: number,
): { startMs: number; endMs: number }[] {
  if (cutEnd <= cutStart) return segments;
  const next: { startMs: number; endMs: number }[] = [];
  for (const seg of segments) {
    if (seg.endMs <= cutStart || seg.startMs >= cutEnd) {
      next.push(seg);
      continue;
    }
    if (seg.startMs < cutStart) {
      next.push({ startMs: seg.startMs, endMs: cutStart });
    }
    if (seg.endMs > cutEnd) {
      next.push({ startMs: cutEnd, endMs: seg.endMs });
    }
  }
  return next;
}

/**
 * Trim any portion of `session` that falls inside local quiet hours
 * (`[startHour, endHour)`), returning 0, 1, or more surviving sub-sessions.
 */
function trimSessionQuietHours(
  session: ScoredSession,
  startHour: number,
  endHour: number,
  utcOffsetMinutes: number,
): { kept: ScoredSession[]; removedMs: number } {
  const origMs = Math.max(0, session.endMs - session.startMs);
  if (origMs <= 0 || startHour === endHour) {
    return { kept: origMs > 0 ? [session] : [], removedMs: 0 };
  }
  const shift = utcOffsetMinutes * MIN_MS;
  const shiftedStart = session.startMs + shift;
  const shiftedEnd = session.endMs + shift;
  const firstMidnight = Math.floor(shiftedStart / DAY_MS) * DAY_MS;

  let segments: { startMs: number; endMs: number }[] = [
    { startMs: shiftedStart, endMs: shiftedEnd },
  ];

  for (let day = firstMidnight - DAY_MS; day <= shiftedEnd; day += DAY_MS) {
    if (startHour < endHour) {
      segments = subtractSpan(segments, day + startHour * HOUR_MS, day + endHour * HOUR_MS);
    } else {
      // Overnight window, e.g. 23:00–05:00 -> [00:00, 05:00) and [23:00, 24:00)
      segments = subtractSpan(segments, day, day + endHour * HOUR_MS);
      segments = subtractSpan(segments, day + startHour * HOUR_MS, day + DAY_MS);
    }
    if (segments.length === 0) break;
  }

  let keptMs = 0;
  const kept: ScoredSession[] = segments
    .filter((seg) => seg.endMs > seg.startMs)
    .map((seg, idx) => {
      keptMs += seg.endMs - seg.startMs;
      return {
        ...session,
        id: idx === 0 ? session.id : `${session.id}_qh${idx}`,
        startMs: seg.startMs - shift,
        endMs: seg.endMs - shift,
      };
    });

  return {
    kept,
    removedMs: Math.max(0, origMs - keptMs),
  };
}

export function computeWhatIf(input: WhatIfInput): WhatIfResult {
  const window = input.window;
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const appLabels = input.appLabels ?? {};
  const launcherSet = new Set<string>(input.ignorePackages ?? []);
  const labelArray = toLabelArray(input.labels);
  const approximate = input.approximate ?? true;

  const sittingCapMinutes = Math.max(1, Math.round(input.sittingCapMinutes ?? DEFAULT_WHATIF_CAP_MINUTES));
  const sittingCapMs = sittingCapMinutes * MIN_MS;
  const startHour = ((Math.floor(input.quietHours?.startHour ?? DEFAULT_WHATIF_QUIET_START_HOUR) % 24) + 24) % 24;
  const endHour = ((Math.floor(input.quietHours?.endHour ?? DEFAULT_WHATIF_QUIET_END_HOUR) % 24) + 24) % 24;
  const quietHoursLabel = `${fmtHour(startHour)}–${fmtHour(endHour)}`;

  // Clip & filter valid non-system, non-launcher sessions overlapping `window`
  const validSessions: ScoredSession[] = [];
  for (const s of input.sessions) {
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs)) continue;
    if (launcherSet.has(s.app) || isIgnoredSystemApp(s.app, appLabels[s.app])) continue;
    const clippedStart = Math.max(s.startMs, window.fromMs);
    const clippedEnd = Math.min(s.endMs, window.toMs);
    if (clippedEnd > clippedStart) {
      validSessions.push({
        ...s,
        startMs: clippedStart,
        endMs: clippedEnd,
      });
    }
  }
  validSessions.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));

  const validOsTotals = (input.osTotals ?? [])
    .filter(
      (r) =>
        Number.isFinite(r.totalMs) &&
        r.totalMs > 0 &&
        !launcherSet.has(r.app) &&
        !isIgnoredSystemApp(r.app, r.label ?? appLabels[r.app]),
    )
    .sort((a, b) => b.totalMs - a.totalMs || a.app.localeCompare(b.app));

  const osSumMs = validOsTotals.reduce((sum, r) => sum + r.totalMs, 0);
  const sessionSumMs = validSessions.reduce((sum, s) => sum + Math.max(0, s.endMs - s.startMs), 0);
  const timeSource: 'os_aggregate' | 'sessions' = osSumMs > 0 ? 'os_aggregate' : 'sessions';
  const baselineTimeMs = osSumMs > 0 ? osSumMs : sessionSumMs;

  const baselineIqs = scoreIqs({
    window,
    sessions: validSessions,
    labels: labelArray,
    gaps: input.gaps,
    utcOffsetMinutes,
    approximate,
  });

  const measuredFactorSummary = baselineIqs.factors
    .filter((f) => f.measurable)
    .map((f) => `${f.label} (${f.points}/${f.max})`);
  const unmeasuredFactorSummary = baselineIqs.factors
    .filter((f) => !f.measurable)
    .map((f) => `${f.label}: ${f.detail}`);

  const disclaimer =
    'Every What-if row is a local arithmetic Estimate over your recorded history, never a prediction or goal. Scores include only measured factors and are never rescaled to 100.';

  const smallSampleBaseline = baselineIqs.value === null || baselineIqs.confidence.smallSample;
  const minimumActivityNote =
    validSessions.length === 0
      ? null
      : baselineIqs.value === null
        ? baselineIqs.caveat
        : baselineIqs.confidence.smallSample
          ? `Small sample today (${validSessions.length} sitting${validSessions.length === 1 ? '' : 's'}, ${fmtDurationShort(sessionSumMs)} sitting time) — rates below their minimum-activity floor stay unmeasured.`
          : null;

  if (validSessions.length === 0) {
    return {
      hasBaseline: false,
      baselineTimeMs,
      timeSource,
      baselineSessionCount: 0,
      baselineIqs,
      smallSampleBaseline: true,
      minimumActivityNote,
      measuredFactorSummary,
      unmeasuredFactorSummary,
      sittingCapMinutes,
      quietHoursLabel,
      scenarios: [],
      disclaimer,
    };
  }

  const longestSittingMs = validSessions.reduce(
    (maxDur, s) => Math.max(maxDur, Math.max(0, s.endMs - s.startMs)),
    0,
  );

  const baselineFactorMap = new Map<Factor['id'], Factor>();
  for (const f of baselineIqs.factors) baselineFactorMap.set(f.id, f);

  const buildScenario = (params: {
    id: WhatIfScenarioId;
    title: string;
    cfSessions: ScoredSession[];
    affectedSessions: number;
    removedTimeMs: number;
    zeroAffectedReason: string;
    zeroIqsDeltaReason?: string;
    assumption: string;
  }): WhatIfScenario => {
    const cfScore = scoreIqs({
      window,
      sessions: params.cfSessions,
      labels: labelArray,
      gaps: input.gaps,
      utcOffsetMinutes,
      approximate,
    });

    const clampedRemovedMs = Math.min(baselineTimeMs, Math.max(0, Math.round(params.removedTimeMs)));
    const estimatedTimeMs = Math.max(0, baselineTimeMs - clampedRemovedMs);
    const deltaTimeMs = estimatedTimeMs - baselineTimeMs;
    const deltaTimePct =
      baselineTimeMs > 0 ? Math.max(-1, Math.min(0, deltaTimeMs / baselineTimeMs)) : 0;

    const timeEstimateLabel =
      deltaTimeMs === 0
        ? `Estimate: ${fmtDurationShort(estimatedTimeMs)} (0m change vs baseline)`
        : `Estimate: ${fmtDurationShort(estimatedTimeMs)} (−${fmtDurationShort(Math.abs(deltaTimeMs))}, ${Math.round(deltaTimePct * 100)}% vs baseline)`;

    const sameDenominator =
      cfScore.value !== null && baselineIqs.value !== null && cfScore.max === baselineIqs.max;
    const deltaPoints =
      sameDenominator && cfScore.value !== null && baselineIqs.value !== null
        ? round1(cfScore.value - baselineIqs.value)
        : null;

    const measuredFactors: WhatIfMeasuredFactorEstimate[] = cfScore.factors
      .filter((f) => f.measurable)
      .map((f) => {
        const baseF = baselineFactorMap.get(f.id);
        const basePts = baseF && baseF.measurable ? baseF.points : null;
        const fDelta = basePts !== null ? round1(f.points - basePts) : null;
        return {
          id: f.id,
          label: f.label,
          points: f.points,
          max: f.max,
          baselinePoints: basePts,
          deltaPoints: fDelta,
          estimateLabel:
            fDelta !== null
              ? `Estimate: ${f.label} ${f.points}/${f.max} (${fmtSignedPoints(fDelta)})`
              : `Estimate: ${f.label} ${f.points}/${f.max}`,
        };
      });

    const unmeasuredFactors = cfScore.factors
      .filter((f) => !f.measurable)
      .map((f) => `${f.label} (not measured)`);

    let iqsEstimateLabel: string;
    if (cfScore.value === null || cfScore.max === 0) {
      iqsEstimateLabel =
        params.cfSessions.length === 0
          ? 'Estimate: IQS not measurable (0 remaining sittings in window; not rescaled to 100)'
          : 'Estimate: IQS not measurable (remaining activity below minimum-activity threshold; not rescaled to 100)';
    } else if (baselineIqs.value === null) {
      iqsEstimateLabel = `Estimate: IQS ${cfScore.value} / ${cfScore.max} (baseline below minimum activity; not rescaled to 100)`;
    } else if (sameDenominator && deltaPoints !== null) {
      iqsEstimateLabel = `Estimate: IQS ${cfScore.value} / ${cfScore.max} (${fmtSignedPoints(deltaPoints)} across ${measuredFactors.length} measured factor${measuredFactors.length === 1 ? '' : 's'}; not rescaled to 100)`;
    } else {
      iqsEstimateLabel = `Estimate: IQS ${cfScore.value} / ${cfScore.max} (measured max changed from /${baselineIqs.max} to /${cfScore.max}; not rescaled to 100)`;
    }

    let noChangeReason: string | null = null;
    if (params.affectedSessions === 0 && deltaTimeMs === 0) {
      noChangeReason = params.zeroAffectedReason;
    } else if (cfScore.value === null && baselineIqs.value !== null) {
      noChangeReason =
        params.cfSessions.length === 0
          ? 'After this scenario, 0 sittings remain in the window, so counterfactual IQS is hidden rather than guessed.'
          : 'After this scenario, remaining activity falls below the minimum-activity threshold (needs at least 5 sittings or 15 min), so counterfactual IQS is hidden rather than computed on a tiny sample.';
    } else if (sameDenominator && deltaPoints === 0) {
      noChangeReason =
        params.zeroIqsDeltaReason ??
        'Screen time changes, while composite IQS stays unchanged (0.0 pts) across the measured factors today.';
    }

    return {
      id: params.id,
      title: params.title,
      badge: 'Estimate',
      remainingSessions: params.cfSessions.length,
      affectedSessions: params.affectedSessions,
      estimatedTimeMs,
      deltaTimeMs,
      deltaTimePct,
      timeEstimateLabel,
      estimatedIqs: {
        badge: 'Estimate',
        value: cfScore.value,
        max: cfScore.max,
        sameDenominator,
        deltaPoints,
        measuredFactors,
        unmeasuredFactors,
      },
      iqsEstimateLabel,
      noChangeReason,
      assumption: params.assumption,
    };
  };

  // Resolve top app by OS aggregate total when present, else by session duration sum
  let topApp: { app: string; label: string; removedMs: number } | null = null;
  if (validOsTotals.length > 0) {
    const first = validOsTotals[0]!;
    topApp = {
      app: first.app,
      label: first.label ?? appLabels[first.app] ?? first.app,
      removedMs: first.totalMs,
    };
  } else {
    const byAppMs = new Map<string, number>();
    for (const s of validSessions) {
      byAppMs.set(s.app, (byAppMs.get(s.app) ?? 0) + (s.endMs - s.startMs));
    }
    const ranked = [...byAppMs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 0) {
      const [app, msVal] = ranked[0]!;
      topApp = { app, label: appLabels[app] ?? app, removedMs: msVal };
    }
  }

  const scenarios: WhatIfScenario[] = [];

  // Scenario 1: Pause top app by time
  if (topApp) {
    const remaining = validSessions.filter((s) => s.app !== topApp!.app);
    const affected = validSessions.length - remaining.length;
    scenarios.push(
      buildScenario({
        id: 'pause_top_app',
        title: `Pause top app (${topApp.label})`,
        cfSessions: remaining,
        affectedSessions: affected,
        removedTimeMs: topApp.removedMs,
        zeroAffectedReason: `No change today: no recorded sittings for ${topApp.label} in this window.`,
        assumption: `Assumes time spent in ${topApp.label} is not replaced by another app (in practice, part of it usually shifts), and recomputes only measured factors on the remaining sittings.`,
      }),
    );
  }

  // Scenario 2: Cap single sittings at N minutes
  {
    let trimmedMs = 0;
    let affected = 0;
    const capped: ScoredSession[] = validSessions.map((s) => {
      const dur = s.endMs - s.startMs;
      if (dur > sittingCapMs) {
        affected += 1;
        trimmedMs += dur - sittingCapMs;
        return { ...s, endMs: s.startMs + sittingCapMs };
      }
      return s;
    });
    scenarios.push(
      buildScenario({
        id: 'cap_sittings',
        title: `Cap single sittings at ${sittingCapMinutes} min`,
        cfSessions: capped,
        affectedSessions: affected,
        removedTimeMs: trimmedMs,
        zeroAffectedReason: `No change today: no sitting longer than ${sittingCapMinutes} min today (longest sitting was ${fmtDurationShort(longestSittingMs)}).`,
        zeroIqsDeltaReason: `Screen time drops by ${fmtDurationShort(trimmedMs)}, while IQS stays unchanged (0.0 pts): capping above ${sittingCapMinutes} min keeps opens at 8 s or longer (longer is not scored as better) and did not shift switching or late-night share enough to move rounded points today.`,
        assumption: `Assumes sittings longer than ${sittingCapMinutes} min end at ${sittingCapMinutes} min without extra re-opens later. Time delta sums recorded sitting time above ${sittingCapMinutes} min${timeSource === 'os_aggregate' ? ' (subtracted from the OS total and clamped to ≥ 0)' : ''}.`,
      }),
    );
  }

  // Scenario 3: Quiet hours (default 23:00–05:00 local)
  {
    let removedQuietMs = 0;
    let affected = 0;
    const quietFiltered: ScoredSession[] = [];
    for (const s of validSessions) {
      const { kept, removedMs } = trimSessionQuietHours(s, startHour, endHour, utcOffsetMinutes);
      if (removedMs > 0) {
        affected += 1;
        removedQuietMs += removedMs;
      }
      quietFiltered.push(...kept);
    }
    scenarios.push(
      buildScenario({
        id: 'quiet_hours',
        title: `Quiet hours ${quietHoursLabel} local`,
        cfSessions: quietFiltered,
        affectedSessions: affected,
        removedTimeMs: removedQuietMs,
        zeroAffectedReason: `No change today: no sitting activity fell inside ${quietHoursLabel} local today.`,
        assumption: `Assumes usage inside ${quietHoursLabel} local does not happen and is not shifted earlier into the evening, leaving daytime sittings unchanged.`,
      }),
    );
  }

  // Scenario 4: Skip brief opens under 8 s
  {
    let removedBounceMs = 0;
    let affected = 0;
    const sustainedOnly: ScoredSession[] = [];
    for (const s of validSessions) {
      const dur = s.endMs - s.startMs;
      if (dur < SHORT_SESSION_MS) {
        affected += 1;
        removedBounceMs += dur;
      } else {
        sustainedOnly.push(s);
      }
    }
    scenarios.push(
      buildScenario({
        id: 'skip_short_bounces',
        title: 'Skip brief opens under 8 s',
        cfSessions: sustainedOnly,
        affectedSessions: affected,
        removedTimeMs: removedBounceMs,
        zeroAffectedReason: 'No change today: no brief open under 8 s recorded today.',
        assumption:
          'Assumes reflex or accidental opens under 8 s do not occur, leaving all sittings of 8 s or longer unchanged.',
      }),
    );
  }

  return {
    hasBaseline: true,
    baselineTimeMs,
    timeSource,
    baselineSessionCount: validSessions.length,
    baselineIqs,
    smallSampleBaseline,
    minimumActivityNote,
    measuredFactorSummary,
    unmeasuredFactorSummary,
    sittingCapMinutes,
    quietHoursLabel,
    scenarios,
    disclaimer,
  };
}
