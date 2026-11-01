/**
 * Calm User-Created Weekly Goals engine (Tier D OS usage only).
 *
 * Non-negotiable product & privacy rules:
 *   1. **User-created only — zero auto-suggested goals.** When the user has not
 *      created any goal, `evaluateGoals` returns `items: []` without inventing or
 *      recommending targets.
 *   2. **Calm ratios only — zero streaks, zero day-counters, zero red failure
 *      states, zero guilt copy.** Progress is reported strictly as calm ratios
 *      (`"4 of 7 days within target"`, or `"2 of 4 recorded days within target (partial week)"`).
 *      No streak counter, consecutive-day run, missed-day badge, or failure state exists.
 *   3. **Partial weeks marked partial and never extrapolated.** Fewer than 7
 *      evaluated days sets `isPartialWeek: true` and `extrapolated: false`.
 *   4. **Day-clipped foreground events only — never merged spans.** Both
 *      `daily_total_foreground` and `daily_app_foreground` read day-clipped
 *      foreground totals (`resolveClippedDayMap`), never merged sitting durations.
 */
import {
  resolveClippedDayMap,
  type BudgetDayForegroundInput,
} from './budgets';
import type { StoredForegroundEventInput } from './evolution';
import { dayStartMs, localDay, overlapMs } from './ingest';
import { formatDurationShort, lateNightMs, type ScoredSession } from './scoring';
import { isExcludedApp, type DayTotalsSource } from './usage';

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GoalKind =
  | 'daily_total_foreground'
  | 'daily_app_foreground'
  | 'daily_late_night_max'
  | 'daily_sitting_count_max';

export type GoalDefinition = {
  id: string;
  /** User-written label, e.g. "Quiet nights after 23:00" or "YouTube under 30m/day". */
  title: string;
  kind: GoalKind;
  /** Target ceiling in milliseconds (`>= 0` for `daily_late_night_max`, `> 0` for foreground time goals). */
  targetMs?: number;
  /** Target ceiling in sittings (`>= 0` integer for `daily_sitting_count_max`). */
  targetCount?: number;
  /** Target package names (required & non-empty for `daily_app_foreground`, optional for `daily_sitting_count_max`). */
  packages?: readonly string[];
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type GoalValidationResult =
  | { ok: true; value: GoalDefinition }
  | { ok: false; errors: string[] };

const VALID_GOAL_KINDS = new Set<GoalKind>([
  'daily_total_foreground',
  'daily_app_foreground',
  'daily_late_night_max',
  'daily_sitting_count_max',
]);

export function validateGoalDefinition(candidate: unknown): GoalValidationResult {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, errors: ['goal must be an object'] };
  }
  const g = candidate as Record<string, unknown>;
  const id = typeof g.id === 'string' ? g.id.trim() : '';
  if (!id || id.length > 128) errors.push('id: must be a non-empty string (<= 128 chars)');

  const title = typeof g.title === 'string' ? g.title.trim() : '';
  if (!title || title.length > 140) errors.push('title: must be a non-empty string (<= 140 chars)');

  const kind = g.kind as GoalKind;
  if (!VALID_GOAL_KINDS.has(kind)) {
    errors.push('kind: unsupported goal kind');
  }

  let packages: string[] | undefined;
  if (g.packages !== undefined) {
    if (!Array.isArray(g.packages)) {
      errors.push('packages: must be an array of package strings when provided');
    } else {
      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const item of g.packages) {
        if (typeof item !== 'string') {
          errors.push('packages: every entry must be a string');
          continue;
        }
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          deduped.push(trimmed);
        }
      }
      if (deduped.length > 0) packages = deduped;
    }
  }

  if (kind === 'daily_app_foreground' && (!packages || packages.length === 0)) {
    errors.push('packages: daily_app_foreground requires at least one package');
  }

  let targetMs: number | undefined;
  let targetCount: number | undefined;

  if (kind === 'daily_total_foreground' || kind === 'daily_app_foreground') {
    const raw = typeof g.targetMs === 'number' && Number.isFinite(g.targetMs) ? Math.round(g.targetMs) : NaN;
    if (!Number.isFinite(raw) || raw <= 0 || raw > DAY_MS) {
      errors.push(`targetMs: must be a positive integer <= ${DAY_MS}`);
    } else {
      targetMs = raw;
    }
  } else if (kind === 'daily_late_night_max') {
    const raw = typeof g.targetMs === 'number' && Number.isFinite(g.targetMs) ? Math.round(g.targetMs) : NaN;
    const maxLateWindowMs = 6 * 3_600_000;
    if (!Number.isFinite(raw) || raw < 0 || raw > maxLateWindowMs) {
      errors.push(`targetMs: must be an integer between 0 and ${maxLateWindowMs}`);
    } else {
      targetMs = raw;
    }
  } else if (kind === 'daily_sitting_count_max') {
    const raw =
      typeof g.targetCount === 'number' && Number.isFinite(g.targetCount)
        ? Math.round(g.targetCount)
        : NaN;
    if (!Number.isFinite(raw) || raw < 0 || raw > 1000) {
      errors.push('targetCount: must be an integer between 0 and 1000');
    } else {
      targetCount = raw;
    }
  }

  if (typeof g.enabled !== 'boolean') {
    errors.push('enabled: must be a boolean');
  }

  const createdAtMs =
    typeof g.createdAtMs === 'number' && Number.isFinite(g.createdAtMs) && g.createdAtMs >= 0
      ? Math.round(g.createdAtMs)
      : NaN;
  const updatedAtMs =
    typeof g.updatedAtMs === 'number' && Number.isFinite(g.updatedAtMs) && g.updatedAtMs >= 0
      ? Math.round(g.updatedAtMs)
      : NaN;
  if (!Number.isFinite(createdAtMs)) errors.push('createdAtMs: must be a non-negative timestamp');
  if (!Number.isFinite(updatedAtMs)) errors.push('updatedAtMs: must be a non-negative timestamp');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      id,
      title,
      kind,
      ...(targetMs !== undefined ? { targetMs } : {}),
      ...(targetCount !== undefined ? { targetCount } : {}),
      ...(packages !== undefined ? { packages } : {}),
      enabled: Boolean(g.enabled),
      createdAtMs,
      updatedAtMs,
    },
  };
}

/**
 * Neutral state enum — intentionally contains NO red/failure/danger/streak states.
 */
export type GoalDisplayState = 'calm_progress' | 'no_recorded_days' | 'paused';

export type GoalDayOutcome = {
  day: string;
  recorded: boolean;
  /** False when unrecorded or held out (e.g. unfinished late-night window on provisional today). */
  evaluated: boolean;
  heldOutReason: 'unrecorded' | 'provisional_late_night' | 'bucket_fallback_no_timestamps' | null;
  source: DayTotalsSource | 'unrecorded';
  observedMs: number | null;
  observedCount: number | null;
  withinTarget: boolean | null;
};

export type GoalEvaluation = {
  id: string;
  title: string;
  kind: GoalKind;
  enabled: boolean;
  tier: 'D';
  startDay: string;
  endDay: string;
  windowDays: 7;
  recordedDays: number;
  evaluatedDays: number;
  daysWithinTarget: number;
  /** True when fewer than 7 days could be evaluated; never extrapolated to 7 days. */
  isPartialWeek: boolean;
  extrapolated: false;
  /** Ratio `daysWithinTarget / evaluatedDays` in `[0, 1]`, or `null` when `evaluatedDays === 0`. */
  withinTargetRatio: number | null;
  state: GoalDisplayState;
  /** Calm plain-language ratio, e.g. `"4 of 7 days within target"`. */
  ratioLabel: string;
  /** Target description, e.g. `"<= 30m/day in YouTube"`. */
  targetDescription: string;
  days: GoalDayOutcome[];
};

export type EvaluateGoalsInput = {
  goals: readonly GoalDefinition[];
  /** End local day `YYYY-MM-DD` of the 7-day window `[endDay - 6d .. endDay]`. */
  endDay: string;
  /** Day-clipped foreground totals per day (never merged sitting spans). */
  dayTotals?: readonly BudgetDayForegroundInput[];
  /** Stored/built `app_background` foreground events (used for day-clipped foreground & `23:00–05:00` quiet hours). */
  events?: readonly StoredForegroundEventInput[];
  /** Merged sittings — used ONLY for `daily_sitting_count_max`, never for foreground duration! */
  sessions?: readonly ScoredSession[];
  recordedDays?: readonly string[];
  historyStartDay?: string | null;
  utcOffsetMinutes?: number;
  nowMs?: number;
  ignorePackages?: readonly string[];
  appLabels?: Readonly<Record<string, string>>;
};

export type GoalsEvaluationSummary = {
  tier: 'D';
  startDay: string;
  endDay: string;
  items: GoalEvaluation[];
};

function shiftLocalDay(day: string, deltaDays: number): string {
  const baseMs = Date.parse(`${day}T00:00:00Z`);
  return new Date(baseMs + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

function listWindowDays(endDay: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(shiftLocalDay(endDay, -i));
  }
  return out;
}

function mergeOverlappingIntervals(
  spans: readonly { start: number; end: number }[],
): { start: number; end: number }[] {
  if (spans.length <= 1) return [...spans];
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]!;
    if (next.start <= cur.end) {
      if (next.end > cur.end) cur.end = next.end;
    } else {
      merged.push(cur);
      cur = { ...next };
    }
  }
  merged.push(cur);
  return merged;
}

function computeLateNightMsForDay(params: {
  dayStart: number;
  dayEnd: number;
  utcOffsetMinutes: number;
  events: readonly StoredForegroundEventInput[];
  ignorePackages: readonly string[];
  appLabels: Readonly<Record<string, string>>;
}): number {
  const spansByApp = new Map<string, { start: number; end: number }[]>();
  for (const ev of params.events) {
    if (!ev || ev.kind !== 'app_background' || typeof ev.app !== 'string' || typeof ev.duration_ms !== 'number') {
      continue;
    }
    if (isExcludedApp(ev.app, { ignorePackages: params.ignorePackages, label: params.appLabels[ev.app] })) {
      continue;
    }
    const endMs = Date.parse(ev.at);
    const dur = Math.max(0, Math.round(ev.duration_ms));
    if (!Number.isFinite(endMs) || dur <= 0) continue;
    const clippedStart = Math.max(params.dayStart, endMs - dur);
    const clippedEnd = Math.min(params.dayEnd, endMs);
    if (clippedEnd <= clippedStart) continue;
    const list = spansByApp.get(ev.app);
    if (list) list.push({ start: clippedStart, end: clippedEnd });
    else spansByApp.set(ev.app, [{ start: clippedStart, end: clippedEnd }]);
  }

  let total = 0;
  for (const spans of spansByApp.values()) {
    for (const seg of mergeOverlappingIntervals(spans)) {
      total += lateNightMs(seg.start, seg.end, params.utcOffsetMinutes);
    }
  }
  return total;
}

function buildTargetDescription(
  goal: GoalDefinition,
  appLabels: Readonly<Record<string, string>>,
): string {
  if (goal.kind === 'daily_total_foreground') {
    return `Up to ${formatDurationShort(goal.targetMs ?? 0)} total foreground time per day`;
  }
  if (goal.kind === 'daily_app_foreground') {
    const names = (goal.packages ?? []).map((p) => appLabels[p] ?? p);
    const labelText = names.length <= 2 ? names.join(', ') : `${names[0]} + ${names.length - 1} more`;
    return `Up to ${formatDurationShort(goal.targetMs ?? 0)}/day in ${labelText}`;
  }
  if (goal.kind === 'daily_late_night_max') {
    const t = goal.targetMs ?? 0;
    return t === 0
      ? '0m foreground time during 23:00–05:00 local'
      : `Up to ${formatDurationShort(t)} during 23:00–05:00 local`;
  }
  const c = goal.targetCount ?? 0;
  if (goal.packages && goal.packages.length > 0) {
    const names = goal.packages.map((p) => appLabels[p] ?? p);
    const labelText = names.length <= 2 ? names.join(', ') : `${names[0]} + ${names.length - 1} more`;
    return `Up to ${c} sitting${c === 1 ? '' : 's'}/day in ${labelText}`;
  }
  return `Up to ${c} sitting${c === 1 ? '' : 's'} per day`;
}

export function evaluateGoals(input: EvaluateGoalsInput): GoalsEvaluationSummary {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const ignorePackages = input.ignorePackages ?? [];
  const appLabels = input.appLabels ?? {};
  const events = input.events ?? [];
  const rawSessions = input.sessions ?? [];

  const endDay = DAY_RE.test(input.endDay)
    ? input.endDay
    : localDay(input.nowMs ?? Date.now(), utcOffsetMinutes);
  const weekDays = listWindowDays(endDay, 7);
  const startDay = weekDays[0]!;
  const todayDay = input.nowMs !== undefined ? localDay(input.nowMs, utcOffsetMinutes) : null;

  if (input.goals.length === 0) {
    return {
      tier: 'D',
      startDay,
      endDay,
      items: [],
    };
  }

  const dayMap = resolveClippedDayMap({
    days: weekDays,
    dayTotals: input.dayTotals,
    events,
    recordedDays: input.recordedDays,
    historyStartDay: input.historyStartDay,
    utcOffsetMinutes,
    nowMs: input.nowMs,
    ignorePackages,
    appLabels,
  });

  const validSessions = rawSessions.filter((s) => {
    if (!s || !Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || s.endMs <= s.startMs) {
      return false;
    }
    if (isExcludedApp(s.app, { ignorePackages, label: appLabels[s.app] })) return false;
    return true;
  });

  const items: GoalEvaluation[] = [];

  for (const candidate of input.goals) {
    const check = validateGoalDefinition(candidate);
    if (!check.ok) continue;
    const goal = check.value;

    const targetPackages = goal.packages
      ? new Set(goal.packages.filter((p) => !isExcludedApp(p, { ignorePackages, label: appLabels[p] })))
      : null;

    const days: GoalDayOutcome[] = [];
    let recordedDays = 0;
    let evaluatedDays = 0;
    let daysWithinTarget = 0;

    for (const day of weekDays) {
      const dStart = dayStartMs(day, utcOffsetMinutes);
      const dEnd = dStart + DAY_MS;
      const effectiveDEnd = input.nowMs !== undefined ? Math.min(dEnd, input.nowMs) : dEnd;
      const entry = dayMap.get(day) ?? {
        byApp: new Map<string, number>(),
        source: 'unrecorded' as const,
        recorded: false,
      };

      if (!entry.recorded) {
        days.push({
          day,
          recorded: false,
          evaluated: false,
          heldOutReason: 'unrecorded',
          source: 'unrecorded',
          observedMs: null,
          observedCount: null,
          withinTarget: null,
        });
        continue;
      }

      recordedDays += 1;
      const isProvisionalToday =
        todayDay !== null &&
        day === todayDay &&
        input.nowMs !== undefined &&
        input.nowMs < dEnd;

      if (goal.kind === 'daily_total_foreground') {
        let dayMs = 0;
        for (const ms of entry.byApp.values()) dayMs += ms;
        const within = dayMs <= (goal.targetMs ?? 0);
        evaluatedDays += 1;
        if (within) daysWithinTarget += 1;
        days.push({
          day,
          recorded: true,
          evaluated: true,
          heldOutReason: null,
          source: entry.source,
          observedMs: dayMs,
          observedCount: null,
          withinTarget: within,
        });
      } else if (goal.kind === 'daily_app_foreground') {
        let appMs = 0;
        if (targetPackages) {
          for (const pkg of targetPackages) {
            appMs += entry.byApp.get(pkg) ?? 0;
          }
        }
        const within = appMs <= (goal.targetMs ?? 0);
        evaluatedDays += 1;
        if (within) daysWithinTarget += 1;
        days.push({
          day,
          recorded: true,
          evaluated: true,
          heldOutReason: null,
          source: entry.source,
          observedMs: appMs,
          observedCount: null,
          withinTarget: within,
        });
      } else if (goal.kind === 'daily_late_night_max') {
        // Hold out unfinished provisional today (just like Attention signal) and
        // bucket-only fallback days that carry no intra-day timestamps.
        if (isProvisionalToday) {
          days.push({
            day,
            recorded: true,
            evaluated: false,
            heldOutReason: 'provisional_late_night',
            source: entry.source,
            observedMs: null,
            observedCount: null,
            withinTarget: null,
          });
          continue;
        }
        if (entry.source === 'os_bucket_approx') {
          days.push({
            day,
            recorded: true,
            evaluated: false,
            heldOutReason: 'bucket_fallback_no_timestamps',
            source: entry.source,
            observedMs: null,
            observedCount: null,
            withinTarget: null,
          });
          continue;
        }
        const lateMs = computeLateNightMsForDay({
          dayStart: dStart,
          dayEnd: dEnd,
          utcOffsetMinutes,
          events,
          ignorePackages,
          appLabels,
        });
        const within = lateMs <= (goal.targetMs ?? 0);
        evaluatedDays += 1;
        if (within) daysWithinTarget += 1;
        days.push({
          day,
          recorded: true,
          evaluated: true,
          heldOutReason: null,
          source: entry.source,
          observedMs: lateMs,
          observedCount: null,
          withinTarget: within,
        });
      } else {
        // `daily_sitting_count_max`
        if (entry.source === 'os_bucket_approx') {
          days.push({
            day,
            recorded: true,
            evaluated: false,
            heldOutReason: 'bucket_fallback_no_timestamps',
            source: entry.source,
            observedMs: null,
            observedCount: null,
            withinTarget: null,
          });
          continue;
        }
        const count = validSessions.filter((s) => {
          if (targetPackages && !targetPackages.has(s.app)) return false;
          return overlapMs(s.startMs, s.endMs, dStart, effectiveDEnd) > 0;
        }).length;
        const within = count <= (goal.targetCount ?? 0);
        evaluatedDays += 1;
        if (within) daysWithinTarget += 1;
        days.push({
          day,
          recorded: true,
          evaluated: true,
          heldOutReason: null,
          source: entry.source,
          observedMs: null,
          observedCount: count,
          withinTarget: within,
        });
      }
    }

    const isPartialWeek = evaluatedDays < 7;
    const withinTargetRatio = evaluatedDays > 0 ? daysWithinTarget / evaluatedDays : null;

    let state: GoalDisplayState;
    if (!goal.enabled) {
      state = 'paused';
    } else if (evaluatedDays === 0) {
      state = 'no_recorded_days';
    } else {
      state = 'calm_progress';
    }

    let ratioLabel: string;
    if (!goal.enabled) {
      ratioLabel =
        evaluatedDays > 0
          ? `Paused · ${daysWithinTarget} of ${evaluatedDays} recorded day${evaluatedDays === 1 ? '' : 's'} within target`
          : 'Paused · no recorded days in this window yet';
    } else if (evaluatedDays === 0) {
      ratioLabel = '0 recorded days evaluated in this window yet';
    } else if (!isPartialWeek) {
      ratioLabel = `${daysWithinTarget} of 7 days within target`;
    } else if (recordedDays === 7 && evaluatedDays === 6 && goal.kind === 'daily_late_night_max') {
      ratioLabel = `${daysWithinTarget} of 6 completed days within target (today in progress)`;
    } else {
      ratioLabel = `${daysWithinTarget} of ${evaluatedDays} recorded day${evaluatedDays === 1 ? '' : 's'} within target (partial week)`;
    }

    items.push({
      id: goal.id,
      title: goal.title,
      kind: goal.kind,
      enabled: goal.enabled,
      tier: 'D',
      startDay,
      endDay,
      windowDays: 7,
      recordedDays,
      evaluatedDays,
      daysWithinTarget,
      isPartialWeek,
      extrapolated: false,
      withinTargetRatio,
      state,
      ratioLabel,
      targetDescription: buildTargetDescription(goal, appLabels),
      days,
    });
  }

  return {
    tier: 'D',
    startDay,
    endDay,
    items,
  };
}
