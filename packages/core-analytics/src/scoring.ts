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
export const IQS_METRICS_VERSION = 1;

/** Label facts below this are too few to be a share. */
export const MIN_LABELS = 5;
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
  /** Decisive labels (intentional + mindless), not `unsure`. */
  labels: number;
  reasons: string[];
};

export type Score = {
  id: 'iqs';
  /** The formula version that produced this score; see docs/metrics.md §9. */
  metricsVersion: number;
  /** Null when nothing could be measured. Never zero for "unknown". */
  value: number | null;
  /** Sum of the maxima of the measurable factors: 100, 75, or less. */
  max: number;
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

/** System apps that should not count toward switching pressure (installer, Play Store, Settings-type) */
const SWITCHING_EXCLUDED_APPS = new Set<string>([
  'dev.mirror.app',
  'com.android.systemui',
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
  'com.android.intentresolver',
  'com.google.android.intentresolver',
  'com.android.settings',
  'com.android.vending', // Play Store
  'com.google.android.gms',
  'com.google.android.gsf',
  'android',
]);

/** App changes per active hour. A change after a gap longer than 5 min is a new sitting. Excludes installer/Play Store/Settings-type system apps from switching pressure. */
export function switchingRate(sessions: readonly ScoredSession[]): { switches: number; activeHours: number; perHour: number } {
  // Filter out system apps (including all OEM package installers) for switching pressure
  const filtered = sessions.filter((s) => !SWITCHING_EXCLUDED_APPS.has(s.app) && !isIgnoredSystemApp(s.app));
  const ordered = [...filtered].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  let switches = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]!;
    const current = ordered[i]!;
    if (current.app !== previous.app && current.startMs - previous.endMs <= SWITCH_GAP_MS) switches += 1;
  }
  const totalMs = ordered.reduce((sum, session) => sum + ms(session), 0);
  const activeHours = totalMs / HOUR_MS;
  return { switches, activeHours, perHour: activeHours > 0 ? switches / activeHours : 0 };
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
  return {
    deepMs,
    habitMs,
    unlabeledMs,
    switchesPerHour: switchingRate(sessions).perHour,
    labelShare: decisive / sessions.length,
  };
}

/**
 * The Interaction Quality Score.
 *
 * Weights: session length 25, deliberate share 20, switching 15, late night 15,
 * topic depth 25. The four OS-only parts sum to 75, which is why a usage-only
 * score is out of 75 rather than 100 — the old mockup weights summed to 90 while
 * its copy claimed a 75 cap; the engine makes the copy true.
 */
export function scoreIqs(input: ScoreInput): Score {
  const window = input.window;
  const windowMs = Math.max(1, window.toMs - window.fromMs);
  const sessions = sessionsInWindow(input.sessions, window);
  const totalMs = sessions.reduce((sum, session) => sum + ms(session), 0);
  const offset = input.utcOffsetMinutes ?? 0;

  /* ---------------------------------------------------------- base factors -- */

  const shortCount = sessions.filter((session) => ms(session) < SHORT_SESSION_MS).length;
  const shortShare = sessions.length > 0 ? shortCount / sessions.length : 0;
  const lengthPoints = round1(25 * (1 - shortShare));
  const lengthFactor: Factor = {
    id: 'session_length',
    label: 'Session length mix',
    points: sessions.length > 0 ? lengthPoints : 0,
    max: 25,
    tier: 'D',
    detail:
      sessions.length > 0
        ? `${shortCount} of ${sessions.length} opens ended under 8 s (${Math.round(shortShare * 100)}%). Longer is not scored as better.`
        : 'No complete sittings in this window.',
    measurable: sessions.length > 0,
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
  const switchingMeasurable = sessions.length >= 3;
  const switchingFactor: Factor = {
    id: 'switching',
    label: 'Switching pressure',
    // Smooth and bounded: 15 at no switching, 7.5 at 20/h, never zero. A cliff
    // would punish one unusual hour; a benchmark against other people would be
    // a comparison the product promises not to make.
    points: switchingMeasurable ? round1((15 * 20) / (switching.perHour + 20)) : 0,
    max: 15,
    tier: 'D',
    detail: switchingMeasurable
      ? `${switching.switches} app switches across ${switching.activeHours.toFixed(1)} active hours (${switching.perHour.toFixed(1)}/h).`
      : 'Not measured: fewer than three sittings.',
    measurable: switchingMeasurable,
  };

  const lateMs = sessions.reduce((sum, session) => sum + lateNightMs(session.startMs, session.endMs, offset, input.lateNight?.startHour, input.lateNight?.endHour), 0);
  const lateShare = totalMs > 0 ? clamp01(lateMs / totalMs) : 0;
  const lateFactor: Factor = {
    id: 'late_night',
    label: 'Late-night share',
    points: totalMs > 0 ? round1(15 * (1 - lateShare)) : 0,
    max: 15,
    tier: 'D',
    detail: totalMs > 0 ? `${Math.round(lateShare * 100)}% of sitting time fell between 23:00 and 05:00 local.` : 'Not measured: no sitting time.',
    measurable: totalMs > 0,
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
  const max = measured.reduce((sum, factor) => sum + factor.max, 0);
  const value = measured.length > 0 ? round1(measured.reduce((sum, factor) => sum + factor.points, 0)) : null;
  const confidence = confidenceFor(input, sessions, decisive, measured.length / factors.length, windowMs);
  if (max < 100 && value !== null) confidence.reasons.push(`The score covers ${max} of 100 points; the missing parts are listed, not estimated.`);

  const caveat =
    value === null
      ? 'Not enough data to score. Mirror will not fill the gap with an estimate.'
      : max < 100
        ? `Out of ${max}: ${factors.filter((f) => !f.measurable).map((f) => f.label.toLowerCase()).join(', ')} ${measured.length === 1 ? 'is' : 'are'} not measured. The score is not rescaled to 100.`
        : 'Every part is measured. The parts add up exactly; a total you cannot take apart is not a measurement.';

  return {
    id: 'iqs',
    metricsVersion: IQS_METRICS_VERSION,
    value,
    max,
    band: value === null ? 'not measured' : max >= 100 ? 'full band' : 'usage-only band',
    factors,
    confidence,
    caveat,
  };
}

function confidenceFor(
  input: ScoreInput,
  sessions: readonly ScoredSession[],
  labels: number,
  tierCompleteness: number,
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
        ? `${gapCount} collection gap${gapCount === 1 ? '' : 's'} recorded (0 min unmeasured span — unspanned orphan/close events).`
        : 'No collection gaps in this window.';
  if (sessions.length === 0) {
    return {
      score: 0,
      level: 'none',
      coverage,
      sample: 0,
      labels,
      reasons: [
        gapReason,
        'No complete sittings in this window.',
        'No deliberate share: no intent labels.',
        'No topic depth: no topic vectors.',
      ],
    };
  }
  const sampleScore = clamp01(sessions.length / 30);
  const labelScore = clamp01(labels / 20);
  let score = round1((0.4 * coverage + 0.25 * sampleScore + 0.2 * labelScore + 0.15 * clamp01(tierCompleteness)) * 100) / 100;

  const reasons: string[] = [gapReason];
  reasons.push(`${sessions.length} complete sitting${sessions.length === 1 ? '' : 's'}${sessions.length < 15 ? ' — a small sample' : ''}.`);
  if (labels >= MIN_LABELS) reasons.push(`${labels} decisive intent labels.`);
  else reasons.push(`No deliberate-share score: ${labels} of ${MIN_LABELS} labels needed.`);
  const topic = input.vectors && input.vectors.size > 0;
  reasons.push(topic ? 'Topic depth is not scored from the placeholder embedder.' : 'Topic depth is not scored: no topic vectors yet.');

  // Reconstructed session boundaries should not feed scores as high/medium-confidence exact
  if (input.approximate) {
    reasons.push('Session boundaries are reconstructed from OS usage events (not scaled); daily totals come from the OS aggregate.');
    score = Math.min(score, 0.49);
  }

  const level: ConfidenceLevel = sessions.length === 0 ? 'none' : input.approximate ? 'low' : score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  return { score, level, coverage, sample: sessions.length, labels, reasons };
}
