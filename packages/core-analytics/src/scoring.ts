/**
 * The scoring engine.
 *
 * Four rules decide every number here, and they are the product's rules rather
 * than statistical ones:
 *
 *   1. **A score is the sum of its parts.** Every factor reports the points it
 *      contributed and the maximum it could contribute. There is no hidden
 *      re-weighting and no constant: if a part cannot be measured it is absent
 *      from both the total and the maximum, and the score is "out of 75" rather
 *      than silently inflated to 100.
 *   2. **Missing data is not zero.** A factor that cannot be measured returns
 *      `measurable: false` and contributes nothing. Zero is a measurement; null
 *      is not.
 *   3. **Length is not quality.** A long sitting is not scored as better than a
 *      short one. The only session-length signal used is the share of opens that
 *      ended before eight seconds — the one unambiguous "this did not hold
 *      attention" event. Rewarding long sessions would turn a scroll into a score.
 *   4. **Every score carries its confidence.** Coverage (how much of the window
 *      was measurable), sample size, label count and tier completeness are shown
 *      beside the number, never behind it.
 *
 * The placeholder embedder is explicitly excluded from scoring: its n-grams are
 * not semantics, so "topic depth" stays unmeasured and the composite stays capped
 * until a real encoder ships. That is why `model` is part of the vector input.
 */
import type { DataTier } from '@mirror/shared-types';
import { SHORT_SESSION_MS } from './sessionize';
import { isIgnoredSystemApp, isLabelingExcludedApp } from './usage';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The formula version. Bump when a factor, a weight or a formula changes, and
 * update `docs/metrics.md` §9 in the same commit. A stored score must not be
 * compared with one computed under a different version without saying so.
 */
export const IQS_METRICS_VERSION = 3;

/** Fixed composite scale; unmeasured factors are shown separately rather than changing the scale or counting as zero. */
export const FIXED_SCORE_MAX = 100;

/** Label facts below this are too few to be a share. */
export const MIN_LABELS = 5;
/** Bounce-share (<8 s) below this sitting count is a small-sample coin flip, not a mix. */
export const MIN_SESSION_MIX_SITTINGS = 5;
/** Minimum non-excluded sittings before computing per-sitting switching pressure. */
export const MIN_SWITCHING_SITTINGS = 3;
/** Minimum active sitting time (15 min = 0.25 h) retained for Focus Windows per-hour cell diagnostics. */
export const MIN_SWITCHING_ACTIVE_MS = 15 * MINUTE_MS;
/** Minimum total sitting time (15 min) before computing late-night quiet-hours points on <5 sustained sittings. */
export const MIN_LATE_NIGHT_ACTIVE_MS = 15 * MINUTE_MS;
/** Quiet-hours screen time (60 min in 23:00–05:00 local) at which the 15-pt late-night factor reaches 0. */
export const LATE_NIGHT_SATURATION_MS = 60 * MINUTE_MS;
/** Below these thresholds, measured scores are flagged in confidence as small-sample. */
export const SMALL_SAMPLE_SITTINGS = 15;
export const SMALL_SAMPLE_ACTIVE_MS = 30 * MINUTE_MS;
/** Two app changes further apart than this are not one sitting's switching. */
export const SWITCH_GAP_MS = 5 * MINUTE_MS;

export type ScoredSession = { id: string; app: string; startMs: number; endMs: number };
export type IntentLabel = { sessionId: string; label: 'intentional' | 'mindless' | 'unsure' };
export type ScoreGap = { reason: string; count: number; fromMs?: number; toMs?: number };
export type TopicVector = { model: string; vector: readonly number[] };

export type ScoreInput = {
  window: { fromMs: number; toMs: number };
  sessions: readonly ScoredSession[];
  labels?: readonly IntentLabel[];
  gaps?: readonly ScoreGap[];
  /** Session id → vector + the model that produced it. */
  vectors?: ReadonlyMap<string, TopicVector>;
  /** Minutes east of UTC. Late night is local, not UTC. */
  utcOffsetMinutes?: number;
  /** Default 23 → 05. */
  lateNight?: { startHour?: number; endHour?: number };
  /** If true, session boundaries come from reconstructed OS usage events (not exact per-sitting durations) – confidence capped at 0.49 */
  approximate?: boolean;
};

export type Factor = {
  id: string;
  label: string;
  /** Points contributed, one decimal. Zero when not measurable. */
  points: number;
  max: number;
  tier: DataTier;
  detail: string;
  measurable: boolean;
};

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export type Confidence = {
  score: number;
  level: ConfidenceLevel;
  /** Share of the window not covered by counted gaps, 0..1. */
  coverage: number;
  /** Sessions considered. */
  sample: number;
  /** Total sitting duration (ms) in this window. */
  activeMs: number;
  /** True when sitting count (<15) or active duration (<30 min) is a small sample. */
  smallSample: boolean;
  /** Decisive labels (intentional + mindless), not `unsure`. */
  labels: number;
  /** Plain-language summary explaining what the confidence percentage means and why it has this value. */
  explanation: string;
  reasons: string[];
};

export type Score = {
  id: 'iqs';
  /** The formula version that produced this score; see docs/metrics.md §9. */
  metricsVersion: number;
  /** Null when nothing could be measured. Never zero for "unknown". */
  value: number | null;
  /** Fixed composite scale (always 100); unmeasured parts are reported separately in `unmeasuredMax`. */
  max: number;
  /** Sum of maxima of the measurable factors (0..100). */
  measuredMax: number;
  /** Sum of maxima of the unmeasured factors (`100 - measuredMax`), shown separately and never scored as zero. */
  unmeasuredMax: number;
  band: string;
  factors: Factor[];
  confidence: Confidence;
  caveat: string;
};

export type DepthBand = { id: string; label: string; count: number; share: number; ms: number };

export type CuriositySplit = {
  deepMs: number;
  habitMs: number;
  unlabeledMs: number;
  switchesPerSitting: number;
  switchesPerHour: number;
  labelShare: number;
};

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const round1 = (value: number) => Math.round(value * 10) / 10;
const ms = (session: ScoredSession) => Math.max(0, session.endMs - session.startMs);

/** Sessions that touch the window and have a positive duration. */
export function sessionsInWindow(sessions: readonly ScoredSession[], window: ScoreInput['window']): ScoredSession[] {
  return sessions.filter((session) => {
    const duration = session.endMs - session.startMs;
    return Number.isFinite(session.startMs) && Number.isFinite(session.endMs) && duration > 0 && session.endMs > window.fromMs && session.startMs < window.toMs;
  });
}

export type RawDaySessionInput = {
  id: string;
  app: string;
  startMs: number;
  endMs: number;
};

/**
 * Single canonical definition of a local day's sittings shared across Home,
 * Insights (IQS, What-if, Curiosity, Depth sitting-length bands), and Sessions:
 *   1. Excludes launchers and ignored system/installer packages (`isIgnoredSystemApp`).
 *   2. Clips `[startMs, endMs]` to `[window.fromMs, window.toMs]`.
 *   3. Keeps finite intervals with `clippedEnd > clippedStart` (`duration > 0`).
 *   4. Deduplicates by `id` and sorts `(startMs ASC, id ASC)`.
 */
export function buildCanonicalDaySittings(
  rawSessions: readonly RawDaySessionInput[],
  options: {
    window: { fromMs: number; toMs: number };
    ignorePackages?: readonly string[];
    appLabels?: Readonly<Record<string, string>>;
  },
): ScoredSession[] {
  const { window } = options;
  if (!Number.isFinite(window.fromMs) || !Number.isFinite(window.toMs) || window.toMs <= window.fromMs) {
    return [];
  }
  const launcherSet = new Set<string>(options.ignorePackages ?? []);
  const appLabels = options.appLabels ?? {};
  const seenIds = new Set<string>();
  const out: ScoredSession[] = [];
  for (const s of rawSessions) {
    if (!s || typeof s.id !== 'string' || seenIds.has(s.id)) continue;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs)) continue;
    if (launcherSet.has(s.app) || isIgnoredSystemApp(s.app, appLabels[s.app])) continue;
    const clippedStart = Math.max(window.fromMs, s.startMs);
    const clippedEnd = Math.min(window.toMs, s.endMs);
    if (clippedEnd > clippedStart) {
      seenIds.add(s.id);
      out.push({
        id: s.id,
        app: s.app,
        startMs: clippedStart,
        endMs: clippedEnd,
      });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  return out;
}

/**
 * Canonical sum of day-clipped merged sitting spans (`endMs - startMs`).
 * Shared across Home, Insights, What-if Simulator, and Sitting-Length Bands so
 * every screen reports the exact same figure.
 */
export function sumSittingSpanMs(sittings: readonly ScoredSession[]): number {
  let total = 0;
  for (const s of sittings) {
    if (!s || !Number.isFinite(s.startMs) || !Number.isFinite(s.endMs)) continue;
    if (s.endMs > s.startMs) {
      total += s.endMs - s.startMs;
    }
  }
  return total;
}

/**
 * Canonical compact duration formatter (`Math.floor` whole seconds) shared by UI
 * cards and `@mirror/core-analytics` copy so Home (`Sitting spans`) and Insights
 * (`What-if` / `Depth` / `IQS`) never diverge by rounding.
 */
export function formatDurationShort(ms: number): string {
  const totalSec = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Milliseconds of `[start, end)` inside `[from, to)`. */
function overlap(start: number, end: number, from: number, to: number): number {
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

/**
 * Milliseconds inside the local late-night window.
 *
 * Handles a window that wraps midnight (23 → 5) by walking the local days the
 * session touches. A session spanning two days is counted on both.
 */
export function lateNightMs(startMs: number, endMs: number, utcOffsetMinutes: number, startHour = 23, endHour = 5): number {
  const start = Math.max(0, Math.min(startHour, 23));
  const end = Math.max(0, Math.min(endHour, 24));
  const offset = utcOffsetMinutes * MINUTE_MS;
  const localStart = startMs + offset;
  const localEnd = endMs + offset;
  if (!(end > start) || localEnd <= localStart) {
    // Wrapped window: compute as [start, 24) plus [0, end).
    const dayStart = Math.floor(localStart / DAY_MS) * DAY_MS;
    let total = 0;
    for (let day = dayStart - DAY_MS; day <= localEnd; day += DAY_MS) {
      total += overlap(localStart, localEnd, day + start * HOUR_MS, day + DAY_MS);
      total += overlap(localStart, localEnd, day, day + end * HOUR_MS);
    }
    return total;
  }
  const dayStart = Math.floor(localStart / DAY_MS) * DAY_MS;
  let total = 0;
  for (let day = dayStart - DAY_MS; day <= localEnd; day += DAY_MS) {
    total += overlap(localStart, localEnd, day + start * HOUR_MS, day + end * HOUR_MS);
  }
  return total;
}

/**
 * App changes per sitting (and per active hour for diagnostics).
 * A change after a gap longer than 5 min is a new sitting, not a switch.
 * Uses the unified shared system/launcher/utility exclusion predicate.
 */
export function switchingRate(sessions: readonly ScoredSession[]): {
  switches: number;
  sittings: number;
  perSitting: number;
  activeHours: number;
  perHour: number;
} {
  // Brief <8s bounces are already counted in `session_length`; switching pressure
  // measures cross-app hopping across sustained (>=8s) non-utility sittings.
  const filtered = sessions.filter(
    (s) => ms(s) >= SHORT_SESSION_MS && !isLabelingExcludedApp(s.app) && !isIgnoredSystemApp(s.app),
  );
  const ordered = [...filtered].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  let switches = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]!;
    const current = ordered[i]!;
    if (current.app !== previous.app && current.startMs - previous.endMs <= SWITCH_GAP_MS) switches += 1;
  }
  const sittings = ordered.length;
  const totalMs = ordered.reduce((sum, session) => sum + ms(session), 0);
  const activeHours = totalMs / HOUR_MS;
  return {
    switches,
    sittings,
    perSitting: sittings > 0 ? switches / sittings : 0,
    activeHours,
    perHour: activeHours > 0 ? switches / activeHours : 0,
  };
}

/** Cosine similarity for the topic factor. Kept local: core-analytics has no model dependency. */
function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Is this vector produced by a real encoder, or the P1b placeholder? */
export function isScorableModel(model: string): boolean {
  return typeof model === 'string' && model.length > 0 && !/placeholder/i.test(model);
}

export function sessionBands(sessions: readonly ScoredSession[]): DepthBand[] {
  const bands = [
    { id: 'under-8s', label: 'under 8 s', from: 0, to: SHORT_SESSION_MS },
    { id: '8s-1m', label: '8 s – 1 min', from: SHORT_SESSION_MS, to: MINUTE_MS },
    { id: '1-5m', label: '1 – 5 min', from: MINUTE_MS, to: 5 * MINUTE_MS },
    { id: '5-20m', label: '5 – 20 min', from: 5 * MINUTE_MS, to: 20 * MINUTE_MS },
    { id: 'over-20m', label: 'over 20 min', from: 20 * MINUTE_MS, to: Number.POSITIVE_INFINITY },
  ];
  const total = sessions.length;
  return bands.map((band) => {
    const inBand = sessions.filter((session) => {
      const duration = ms(session);
      return duration >= band.from && duration < band.to;
    });
    return {
      id: band.id,
      label: band.label,
      count: inBand.length,
      share: total > 0 ? inBand.length / total : 0,
      ms: inBand.reduce((sum, session) => sum + ms(session), 0),
    };
  });
}

export type ExplicitLabelCounts = {
  intentional: number;
  mindless: number;
  unsure: number;
  /** intentional + mindless — the exact count used by Deliberate share and the Why sheet. */
  decisive: number;
  /** intentional + mindless + unsure. */
  total: number;
};

/**
 * Single source of truth for explicit user `intent_label` counts across IQS,
 * Why sheet, J9 Discovery Journey, and J11 Rabbit Hole.
 *
 * Counts only labels attached to valid, non-system, non-utility sittings inside
 * `options.window` (when provided), deduplicated by session id. Duration hints
 * never enter here.
 */
export function countExplicitLabels(
  sessions: readonly ScoredSession[],
  labels: readonly IntentLabel[] | Readonly<Record<string, IntentLabel['label']>> | undefined,
  options: {
    window?: { fromMs: number; toMs: number };
    ignorePackages?: readonly string[];
    appLabels?: Readonly<Record<string, string>>;
  } = {},
): ExplicitLabelCounts {
  if (!labels) return { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 };

  const labelMap = new Map<string, IntentLabel['label']>();
  if (Array.isArray(labels)) {
    for (const entry of labels as readonly IntentLabel[]) {
      if (entry && typeof entry.sessionId === 'string') {
        labelMap.set(entry.sessionId, entry.label);
      }
    }
  } else {
    for (const [sid, lbl] of Object.entries(labels as Readonly<Record<string, IntentLabel['label']>>)) {
      if (lbl === 'intentional' || lbl === 'mindless' || lbl === 'unsure') {
        labelMap.set(sid, lbl);
      }
    }
  }
  if (labelMap.size === 0) return { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 };

  const scoped = options.window ? sessionsInWindow(sessions, options.window) : sessions.filter((s) => ms(s) > 0);
  const launcherSet = new Set<string>(options.ignorePackages ?? []);
  const appLabels = options.appLabels ?? {};
  const seenIds = new Set<string>();

  let intentional = 0;
  let mindless = 0;
  let unsure = 0;
  for (const session of scoped) {
    if (seenIds.has(session.id)) continue;
    seenIds.add(session.id);
    if (launcherSet.has(session.app)) continue;
    if (isLabelingExcludedApp(session.app, appLabels[session.app])) continue;
    const lbl = labelMap.get(session.id);
    if (lbl === 'intentional') intentional += 1;
    else if (lbl === 'mindless') mindless += 1;
    else if (lbl === 'unsure') unsure += 1;
  }

  const decisive = intentional + mindless;
  return {
    intentional,
    mindless,
    unsure,
    decisive,
    total: decisive + unsure,
  };
}

export function curiositySplit(input: ScoreInput): CuriositySplit | null {
  const sessions = sessionsInWindow(input.sessions, input.window);
  if (sessions.length === 0) return null;
  const labels = new Map<string, IntentLabel['label']>();
  for (const label of input.labels ?? []) labels.set(label.sessionId, label.label);
  let deepMs = 0;
  let habitMs = 0;
  let unlabeledMs = 0;
  let decisive = 0;
  for (const session of sessions) {
    if (isLabelingExcludedApp(session.app)) {
      unlabeledMs += ms(session);
      continue;
    }
    const label = labels.get(session.id);
    if (label === 'intentional') {
      deepMs += ms(session);
      decisive += 1;
    } else if (label === 'mindless') {
      habitMs += ms(session);
      decisive += 1;
    } else {
      unlabeledMs += ms(session);
    }
  }
  if (decisive < MIN_LABELS) return null;
  const sw = switchingRate(sessions);
  return {
    deepMs,
    habitMs,
    unlabeledMs,
    switchesPerSitting: sw.perSitting,
    switchesPerHour: sw.perHour,
    labelShare: decisive / sessions.length,
  };
}

/**
 * The Interaction Quality Score.
 *
 * Fixed 100-point scale across five factors: session length 25, deliberate share 20,
 * switching 15, late night 15, topic depth 25. Only measured factors enter `value`
 * and `measuredMax`; unmeasured factors (`unmeasuredMax = 100 - measuredMax`) are
 * reported separately and never counted as zero or rescaled.
 */
export function scoreIqs(input: ScoreInput): Score {
  const window = input.window;
  const windowMs = Math.max(1, window.toMs - window.fromMs);
  const sessions = sessionsInWindow(input.sessions, window).filter((s) => !isIgnoredSystemApp(s.app));
  const totalMs = sessions.reduce((sum, session) => sum + ms(session), 0);
  const offset = input.utcOffsetMinutes ?? 0;

  /* ---------------------------------------------------------- base factors -- */

  const shortCount = sessions.filter((session) => ms(session) < SHORT_SESSION_MS).length;
  const sustainedCount = sessions.length - shortCount;
  const shortShare = sessions.length > 0 ? shortCount / sessions.length : 0;
  const lengthMeasurable = sessions.length >= MIN_SESSION_MIX_SITTINGS;
  const lengthPoints = round1(25 * (1 - shortShare));
  const lengthFactor: Factor = {
    id: 'session_length',
    label: 'Session length mix',
    points: lengthMeasurable ? lengthPoints : 0,
    max: 25,
    tier: 'D',
    detail: lengthMeasurable
      ? `${shortCount} of ${sessions.length} opens ended under 8 s (${Math.round(shortShare * 100)}%). Longer is not scored as better.`
      : sessions.length === 0
        ? 'No complete sittings in this window.'
        : `Not measured: ${sessions.length} complete sitting${sessions.length === 1 ? '' : 's'} (${MIN_SESSION_MIX_SITTINGS} needed before computing bounce rate).`,
    measurable: lengthMeasurable,
  };

  const labelCounts = countExplicitLabels(sessions, input.labels);
  const { intentional, decisive } = labelCounts;
  const labelled = decisive >= MIN_LABELS;
  const deliberateShare = decisive > 0 ? intentional / decisive : 0;
  const deliberateFactor: Factor = {
    id: 'deliberate_share',
    label: 'Deliberate share',
    points: labelled ? round1(20 * deliberateShare) : 0,
    max: 20,
    tier: 'D',
    detail: labelled
      ? `${intentional} of ${decisive} labelled sittings were marked intentional (${Math.round(deliberateShare * 100)}%).`
      : `Not measured: ${decisive} decisive label${decisive === 1 ? '' : 's'} (${MIN_LABELS} needed).`,
    measurable: labelled,
  };

  const switching = switchingRate(sessions);
  const switchingMeasurable = switching.sittings >= MIN_SWITCHING_SITTINGS;
  const switchingFactor: Factor = {
    id: 'switching',
    label: 'Switching pressure',
    // Per-sitting rate: switches / sittings is bounded in [0, 1) and monotonically
    // non-increasing when sittings shorten (gaps widen), so using less never lowers points.
    points: switchingMeasurable ? round1(15 * (1 - switching.perSitting)) : 0,
    max: 15,
    tier: 'D',
    detail: switchingMeasurable
      ? `${switching.switches} rapid cross-app switch${switching.switches === 1 ? '' : 'es'} across ${switching.sittings} sittings (${switching.perSitting.toFixed(2)} per sitting).`
      : `Not measured: fewer than ${MIN_SWITCHING_SITTINGS} non-utility sittings (${switching.sittings} recorded).`,
    measurable: switchingMeasurable,
  };

  const lateMs = sessions.reduce((sum, session) => sum + lateNightMs(session.startMs, session.endMs, offset, input.lateNight?.startHour, input.lateNight?.endHour), 0);
  const lateMeasurable =
    totalMs >= MIN_LATE_NIGHT_ACTIVE_MS || sustainedCount >= MIN_SESSION_MIX_SITTINGS;
  const lateRatio = clamp01(lateMs / LATE_NIGHT_SATURATION_MS);
  const lateMinRounded = Math.round(lateMs / MINUTE_MS);
  const lateFactor: Factor = {
    id: 'late_night',
    label: 'Late-night quiet hours',
    points: lateMeasurable ? round1(15 * (1 - lateRatio)) : 0,
    max: 15,
    tier: 'D',
    detail: lateMeasurable
      ? lateMs === 0
        ? '0 min between 23:00 and 05:00 local (full 15 pts; reaches 0 at 60 min).'
        : `${lateMinRounded > 0 ? `${lateMinRounded} min` : `${Math.max(1, Math.round(lateMs / 1000))} s`} between 23:00 and 05:00 local (${Math.round(lateRatio * 100)}% of 60 min quiet-hours budget).`
      : totalMs === 0
        ? 'Not measured: no sitting spans.'
        : `Not measured: ${Math.max(1, Math.round(totalMs / MINUTE_MS))} min across ${sustainedCount} sustained sitting${sustainedCount === 1 ? '' : 's'} (at least ${Math.round(MIN_LATE_NIGHT_ACTIVE_MS / MINUTE_MS)} min or ${MIN_SESSION_MIX_SITTINGS} sustained sittings needed).`,
    measurable: lateMeasurable,
  };

  /* ----------------------------------------------------------- topic depth -- */

  const vectorBySession = input.vectors;
  const usable: { model: string; vector: readonly number[] }[] = [];
  if (vectorBySession) {
    for (const session of sessions) {
      const entry = vectorBySession.get(session.id);
      if (!entry || !isScorableModel(entry.model) || entry.vector.length === 0) continue;
      usable.push(entry);
    }
  }
  // Cap the sample: 120 sittings is 7,140 pairs over 384 dimensions, which is
  // cheap; an unbounded O(n²) pass over a year of sessions is not.
  const sample = usable.slice(0, 120);
  let meanCosine = 0;
  if (sample.length >= MIN_LABELS) {
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < sample.length; i += 1) {
      for (let j = i + 1; j < sample.length; j += 1) {
        sum += cosine(sample[i]!.vector, sample[j]!.vector);
        pairs += 1;
      }
    }
    meanCosine = pairs > 0 ? clamp01(sum / pairs) : 0;
  }
  const topicMeasurable = sample.length >= MIN_LABELS;
  const placeholder = (input.vectors?.size ?? 0) > 0 && !topicMeasurable;
  const topicFactor: Factor = {
    id: 'topic_depth',
    label: 'Topic depth',
    points: topicMeasurable ? round1(25 * meanCosine) : 0,
    max: 25,
    tier: 'A',
    detail: topicMeasurable
      ? `Mean topic similarity across ${sample.length} labelled sittings (${meanCosine.toFixed(2)}).`
      : placeholder
        ? 'Not measured: the on-device embedder is a placeholder, so lexical similarity is not treated as depth.'
        : `Not measured: topic vectors for fewer than ${MIN_LABELS} sittings.`,
    measurable: topicMeasurable,
  };

  const factors = [lengthFactor, deliberateFactor, switchingFactor, lateFactor, topicFactor];
  const measured = factors.filter((factor) => factor.measurable);
  const unmeasured = factors.filter((factor) => !factor.measurable);
  const measuredMax = measured.reduce((sum, factor) => sum + factor.max, 0);
  const unmeasuredMax = Math.max(0, FIXED_SCORE_MAX - measuredMax);
  const value = measured.length > 0 ? round1(measured.reduce((sum, factor) => sum + factor.points, 0)) : null;
  const confidence = confidenceFor(
    input,
    sessions,
    totalMs,
    decisive,
    measured.length / factors.length,
    measuredMax,
    windowMs,
  );
  if (unmeasuredMax > 0 && value !== null) {
    confidence.reasons.push(
      `${measuredMax} of ${FIXED_SCORE_MAX} points measured today; ${unmeasuredMax} points remain unmeasured and are shown separately rather than scored as zero.`,
    );
  }

  const totalMinLabel = totalMs < MINUTE_MS ? `${Math.max(1, Math.round(totalMs / 1000))} s` : `${Math.round(totalMs / MINUTE_MS)} min`;
  const caveat =
    value === null
      ? sessions.length === 0
        ? 'Not enough data to score. Mirror will not fill the gap with an estimate.'
        : `Minimum activity not met yet (${totalMinLabel} across ${sessions.length} sitting${sessions.length === 1 ? '' : 's'} — needs at least ${MIN_SWITCHING_SITTINGS} non-utility sittings, ${MIN_SESSION_MIX_SITTINGS} sittings, or ${Math.round(MIN_LATE_NIGHT_ACTIVE_MS / MINUTE_MS)} min before scoring; small-sample rates are hidden rather than guessed).`
      : unmeasuredMax > 0
        ? `Fixed 100-point scale: ${measuredMax} pts measured today and ${unmeasuredMax} pts unmeasured (${unmeasured.map((f) => `${f.label.toLowerCase()} ${f.max} pts`).join(', ')}). Unmeasured parts are shown separately — never counted as zero and never rescaled.`
        : 'All 100 points are measured today. The measured parts add up to the exact score.';

  return {
    id: 'iqs',
    metricsVersion: IQS_METRICS_VERSION,
    value,
    max: FIXED_SCORE_MAX,
    measuredMax,
    unmeasuredMax,
    band: value === null ? 'not measured' : measuredMax >= FIXED_SCORE_MAX ? 'full band' : 'usage-only band',
    factors,
    confidence,
    caveat,
  };
}

function confidenceFor(
  input: ScoreInput,
  sessions: readonly ScoredSession[],
  totalMs: number,
  labels: number,
  tierCompleteness: number,
  measuredMax: number,
  windowMs: number,
): Confidence {
  const window = input.window;
  let gapMs = 0;
  let gapCount = 0;
  for (const gap of input.gaps ?? []) {
    gapCount += Math.max(0, gap.count);
    if (gap.fromMs !== undefined && gap.toMs !== undefined) {
      gapMs += overlap(gap.fromMs, gap.toMs, window.fromMs, window.toMs);
    }
  }
  const coverage = clamp01(1 - gapMs / windowMs);
  const gapReason =
    gapMs > 0
      ? `${Math.round((gapMs / windowMs) * 100)}% of this window could not be measured (${gapCount} counted gap${gapCount === 1 ? '' : 's'}).`
      : gapCount > 0
        ? `${gapCount} unmatched OS event${gapCount === 1 ? '' : 's'} recorded (point-in-time boundary events, not lost usage time).`
        : 'No collection gaps in this window.';
  if (sessions.length === 0) {
    return {
      score: 0,
      level: 'none',
      coverage,
      sample: 0,
      activeMs: 0,
      smallSample: true,
      labels,
      explanation:
        'Confidence is 0% (none) because no complete sittings were recorded in this window yet. Confidence measures how complete the data behind the score is — never how good or bad your phone use was.',
      reasons: [
        gapReason,
        'No complete sittings in this window.',
        'No deliberate share: no intent labels.',
        'No topic depth: no topic vectors.',
      ],
    };
  }
  const smallSample = sessions.length < SMALL_SAMPLE_SITTINGS || totalMs < SMALL_SAMPLE_ACTIVE_MS;
  const sampleScore = clamp01(sessions.length / 30);
  const labelScore = clamp01(labels / 20);
  let score = round1((0.4 * coverage + 0.25 * sampleScore + 0.2 * labelScore + 0.15 * clamp01(tierCompleteness)) * 100) / 100;

  const activeMinLabel = totalMs < MINUTE_MS ? `${Math.max(1, Math.round(totalMs / 1000))} s` : `${Math.round(totalMs / MINUTE_MS)} min`;
  const reasons: string[] = [gapReason];
  reasons.push(
    `${sessions.length} complete sitting${sessions.length === 1 ? '' : 's'} (${activeMinLabel} sitting spans)${smallSample ? ' — a small sample' : ''}.`,
  );
  if (labels >= MIN_LABELS) reasons.push(`${labels} decisive intent labels.`);
  else reasons.push(`No deliberate-share score: ${labels} of ${MIN_LABELS} labels needed.`);
  const topic = input.vectors && input.vectors.size > 0;
  reasons.push(topic ? 'Topic depth is not scored from the placeholder embedder.' : 'Topic depth is not scored: no topic vectors yet.');

  // Reconstructed session boundaries should not feed scores as high/medium-confidence exact
  if (input.approximate) {
    reasons.push(
      'Session boundaries are reconstructed from OS usage events (not scaled); daily foreground totals clip OS usage events strictly to the local day.',
    );
    score = Math.min(score, 0.49);
  }
  if (smallSample) {
    score = Math.min(score, 0.49);
  }

  const level: ConfidenceLevel =
    sessions.length === 0 ? 'none' : input.approximate || smallSample ? 'low' : score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  const pct = Math.round(score * 100);
  const capCauses: string[] = [];
  if (input.approximate) capCauses.push('OS app-switch timing without content tiers');
  if (smallSample) capCauses.push(`a small sample (${sessions.length} sitting${sessions.length === 1 ? '' : 's'}, ${activeMinLabel})`);
  const capSentence =
    capCauses.length > 0
      ? ` Capped at ${pct}% (${level}) because of ${capCauses.join(' and ')}.`
      : '';
  const explanation =
    `Confidence (${pct}% · ${level}) reflects how complete the inputs behind this score are — never a judgement of your screen time. ` +
    `It weighs window coverage (${Math.round(coverage * 100)}%), sample size (${sessions.length} of 30 sittings), ` +
    `explicit intent labels (${labels} of 20), and measured scale (${measuredMax} of ${FIXED_SCORE_MAX} pts).` +
    capSentence;

  return { score, level, coverage, sample: sessions.length, activeMs: totalMs, smallSample, labels, explanation, reasons };
}
