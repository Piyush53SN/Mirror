/**
 * Pure 7-local-day Weekly Report engine (Tier D OS usage + "your labels (Tier D feedback)").
 *
 * Non-negotiable invariants:
 *   1. **Tier D only.** Summarizes app foreground time, sitting counts, raw-open
 *      Rabbit Hole return loops, `23:00–05:00` local quiet-hours foreground time,
 *      and optional session labels (`"your labels (Tier D feedback)"`). Never claims
 *      topics, URLs, search intent, or content completion (deferred to Tiers A/B/C).
 *   2. **Per-app & daily time strictly from day-clipped foreground events, never
 *      merged spans.** `totalForegroundMs`, `perDay[].foregroundMs`, `topApps[].foregroundMs`,
 *      and `topApps[].foregroundShare` come strictly from day-clipped foreground
 *      intervals (`computeDayForegroundTotalsFromStoredEvents` / `dayTotals`),
 *      never from merged sitting spans (`<= 15m` gap). Merged `sessions` are used
 *      ONLY for sitting counts and linking `your labels (Tier D feedback)`.
 *   3. **Partial weeks marked partial and NEVER extrapolated.** Fewer than 7
 *      recorded days in `[startDay .. endDay]` sets `isPartialWeek: true` and keeps
 *      exact recorded sums without multiplying up to 7 days.
 *   4. **Prior-week deltas unlock only at `>= 14` distinct recorded local days**
 *      when both 7-day windows are covered.
 *   5. **Your labels (`Tier D feedback`, never Tier A).** Weekly intentionality
 *      share requires `>= 5` explicit `Intentional` or `Mindless` labels in the
 *      7-day window (`Not sure` and row hints never count); otherwise listed as
 *      unmeasured (`intentionalShare: null`).
 *   6. **Preserves `Stored` and `Approximate` badges** on older days.
 */
import {
  resolveClippedDayMap,
  type BudgetDayForegroundInput,
} from './budgets';
import type { StoredForegroundEventInput } from './evolution';
import { dayStartMs, localDay, overlapMs } from './ingest';
import { computeRabbitHoles, type RabbitHoleCluster } from './rabbithole';
import {
  countExplicitLabels,
  formatDurationShort,
  lateNightMs,
  MIN_LABELS,
  type IntentLabel,
  type ScoredSession,
} from './scoring';
import { isExcludedApp, type DayTotalsSource } from './usage';

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const WEEKLY_WINDOW_DAYS = 7;
export const MIN_PRIOR_WEEK_COMPARISON_DAYS = 14;
export const MIN_WEEKLY_INTENT_LABELS = MIN_LABELS; // 5
export const WEEKLY_LABELS_ATTRIBUTION = 'your labels (Tier D feedback)' as const;

export type WeeklyDayBadge =
  | 'live'
  | 'provisional'
  | 'stored'
  | 'approximate'
  | 'unrecorded';

export type WeeklyDayEntry = {
  day: string;
  recorded: boolean;
  isProvisionalToday: boolean;
  source: DayTotalsSource | 'unrecorded';
  badge: WeeklyDayBadge;
  /** Exact day-clipped foreground time on `day` (ms), never merged sitting spans. */
  foregroundMs: number;
  /** Count of merged sittings overlapping `day` (merged spans used ONLY for sitting counts). */
  sittingCount: number;
  /** `23:00–05:00` local foreground time from day-clipped foreground events (ms). */
  lateNightForegroundMs: number;
};

export type WeeklyAppRow = {
  app: string;
  label: string;
  /** Sum of day-clipped foreground time across recorded days in the week (ms). */
  foregroundMs: number;
  /** Mean day-clipped foreground time per recorded day in the week (ms/day). */
  avgDailyForegroundMs: number;
  /** Share of `totalForegroundMs` in `[0, 1]`, strictly from day-clipped foreground time. */
  foregroundShare: number;
  /** Count of merged sittings for `app` overlapping the week (kept strictly for sitting counts). */
  sittingCount: number;
  /** Number of days in the week where `app` had positive foreground time. */
  activeDays: number;
};

export type WeeklyIntentLabelsSummary = {
  attribution: typeof WEEKLY_LABELS_ATTRIBUTION;
  tier: 'D';
  intentional: number;
  mindless: number;
  unsure: number;
  decisive: number;
  minRequired: number;
  measurable: boolean;
  /** Ratio `intentional / decisive` in `[0, 1]` when `decisive >= 5`, else `null` (never counted as 0). */
  intentionalShare: number | null;
  summaryText: string;
};

export type PriorWeekComparison = {
  priorStartDay: string;
  priorEndDay: string;
  priorTotalForegroundMs: number;
  deltaForegroundMs: number;
  /** Relative change `(current - prior) / prior`, or `null` when `priorTotalForegroundMs === 0`. */
  deltaForegroundPct: number | null;
  priorSittingCount: number;
  deltaSittingCount: number;
  includesProvisionalToday: boolean;
  summaryText: string;
};

export type WeeklyReportInput = {
  /** End local day `YYYY-MM-DD` of the 7-day window `[endDay - 6d .. endDay]`. */
  endDay: string;
  /**
   * Optional pre-resolved day-clipped foreground totals per day (cover 14+ days when
   * available so prior-week comparison and `Stored` / `Approximate` badges resolve).
   */
  dayTotals?: readonly BudgetDayForegroundInput[];
  /**
   * Stored/built `app_background` foreground events (used for day-clipped foreground
   * totals when `dayTotals` omits a day, for `23:00–05:00` quiet-hours foreground
   * time, and for raw-open Rabbit Hole detection before 15-min merging).
   */
  events?: readonly StoredForegroundEventInput[];
  /**
   * Merged sittings — used ONLY for `sittingCount` and linking explicit user labels
   * (`sessionId`), NEVER for foreground duration or foreground share!
   */
  sessions?: readonly ScoredSession[];
  /** Explicit user labels (`Intentional` / `Mindless` / `Not sure` — Tier D feedback). */
  intentLabels?: readonly IntentLabel[] | Readonly<Record<string, IntentLabel['label']>>;
  /** Optional explicit set of all recorded local days across history (`YYYY-MM-DD`). */
  recordedDays?: readonly string[];
  /** Optional earliest local day in Mirror's history. */
  historyStartDay?: string | null;
  utcOffsetMinutes?: number;
  nowMs?: number;
  ignorePackages?: readonly string[];
  appLabels?: Readonly<Record<string, string>>;
  topAppsLimit?: number;
};

export type WeeklyReportResult = {
  tier: 'D';
  startDay: string;
  endDay: string;
  windowDays: 7;
  recordedDays: number;
  unrecordedDays: number;
  /** True whenever `recordedDays < 7`; totals are NEVER extrapolated to 7 days. */
  isPartialWeek: boolean;
  extrapolated: false;
  partialWeekNote: string | null;
  includesProvisionalToday: boolean;
  /** Sum of day-clipped foreground time across recorded days in `[startDay .. endDay]` (ms). */
  totalForegroundMs: number;
  /** Mean day-clipped foreground time across `recordedDays` (`0` when `recordedDays === 0`). */
  avgDailyForegroundMs: number;
  /** Count of merged sittings overlapping `[startDay .. endDay]`. */
  totalSittingCount: number;
  /** `23:00–05:00` local foreground time from day-clipped foreground intervals (ms). */
  lateNightForegroundMs: number;
  /** Raw-open Rabbit Hole return clusters inside `[startDay .. endDay]`. */
  rabbitHoleCount: number;
  rabbitHoleClusters: RabbitHoleCluster[];
  /** Explicit user labels (`"your labels (Tier D feedback)"`). */
  yourLabels: WeeklyIntentLabelsSummary;
  perDay: WeeklyDayEntry[];
  topApps: WeeklyAppRow[];
  storedDayCount: number;
  approximateDayCount: number;
  hasStoredDays: boolean;
  hasApproximateDays: boolean;
  dataBadgeSummary: string;
  distinctRecordedDaysTotal: number;
  hasPriorWeekComparison: boolean;
  priorWeekComparison: PriorWeekComparison | null;
  priorWeekUnavailableReason: string | null;
  measuredSignals: readonly string[];
  unmeasuredSignals: readonly string[];
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

/**
 * Compute `23:00–05:00` local foreground time on `day` strictly from raw
 * `app_background` foreground events clipped to `[dayStart, min(dayEnd, nowMs)]`
 * and unioned per package (never from merged sitting spans).
 */
function computeDayLateNightForegroundMs(params: {
  dayStart: number;
  dayEnd: number;
  nowMs?: number;
  utcOffsetMinutes: number;
  events: readonly StoredForegroundEventInput[];
  ignorePackages: readonly string[];
  appLabels: Readonly<Record<string, string>>;
}): number {
  const effectiveEnd =
    params.nowMs !== undefined ? Math.min(params.dayEnd, params.nowMs) : params.dayEnd;
  if (effectiveEnd <= params.dayStart) return 0;

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
    const clippedEnd = Math.min(effectiveEnd, endMs);
    if (clippedEnd <= clippedStart) continue;
    const list = spansByApp.get(ev.app);
    if (list) list.push({ start: clippedStart, end: clippedEnd });
    else spansByApp.set(ev.app, [{ start: clippedStart, end: clippedEnd }]);
  }

  let totalLateMs = 0;
  for (const spans of spansByApp.values()) {
    for (const seg of mergeOverlappingIntervals(spans)) {
      totalLateMs += lateNightMs(seg.start, seg.end, params.utcOffsetMinutes);
    }
  }
  return totalLateMs;
}

export function computeWeeklyReport(input: WeeklyReportInput): WeeklyReportResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const ignorePackages = input.ignorePackages ?? [];
  const appLabels = input.appLabels ?? {};
  const topAppsLimit = Math.max(1, input.topAppsLimit ?? 8);
  const events = input.events ?? [];
  const rawSessions = input.sessions ?? [];

  const endDay = DAY_RE.test(input.endDay)
    ? input.endDay
    : localDay(input.nowMs ?? Date.now(), utcOffsetMinutes);
  const weekDays = listWindowDays(endDay, WEEKLY_WINDOW_DAYS);
  const startDay = weekDays[0]!;
  const priorWeekDays = listWindowDays(shiftLocalDay(startDay, -1), WEEKLY_WINDOW_DAYS);
  const fourteenDays = [...priorWeekDays, ...weekDays];

  const todayDay = input.nowMs !== undefined ? localDay(input.nowMs, utcOffsetMinutes) : null;

  const dayMap = resolveClippedDayMap({
    days: fourteenDays,
    dayTotals: input.dayTotals,
    events,
    recordedDays: input.recordedDays,
    historyStartDay: input.historyStartDay,
    utcOffsetMinutes,
    nowMs: input.nowMs,
    ignorePackages,
    appLabels,
  });

  // Count distinct recorded local days across all supplied history so the 14-day
  // prior-week gate reflects real recorded history length.
  const allRecordedDaysSet = new Set<string>();
  if (input.recordedDays) {
    for (const d of input.recordedDays) {
      if (DAY_RE.test(d)) allRecordedDaysSet.add(d);
    }
  } else {
    for (const [d, entry] of dayMap.entries()) {
      if (entry.recorded) allRecordedDaysSet.add(d);
    }
    for (const dt of input.dayTotals ?? []) {
      if (dt && DAY_RE.test(dt.day)) allRecordedDaysSet.add(dt.day);
    }
    for (const ev of events) {
      if (!ev || ev.kind !== 'app_background' || typeof ev.duration_ms !== 'number') continue;
      const endMs = Date.parse(ev.at);
      const dur = Math.max(0, Math.round(ev.duration_ms));
      if (!Number.isFinite(endMs) || dur <= 0) continue;
      const d = localDay(endMs - dur, utcOffsetMinutes);
      if (todayDay === null || d <= todayDay) allRecordedDaysSet.add(d);
    }
    if (input.historyStartDay && DAY_RE.test(input.historyStartDay)) {
      const capDay = todayDay && todayDay < endDay ? todayDay : endDay;
      if (input.historyStartDay <= capDay) {
        let cur = input.historyStartDay;
        let guard = 0;
        while (cur <= capDay && guard < 4000) {
          allRecordedDaysSet.add(cur);
          cur = shiftLocalDay(cur, 1);
          guard += 1;
        }
      }
    }
  }
  const distinctRecordedDaysTotal = allRecordedDaysSet.size;

  // Filter merged sittings strictly for sitting counts & user label attribution.
  const validSessions = rawSessions.filter((s) => {
    if (!s || !Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || s.endMs <= s.startMs) {
      return false;
    }
    if (isExcludedApp(s.app, { ignorePackages, label: appLabels[s.app] })) return false;
    return true;
  });

  const weekFromMs = dayStartMs(startDay, utcOffsetMinutes);
  const weekToMs = dayStartMs(endDay, utcOffsetMinutes) + DAY_MS;
  const effectiveWeekToMs =
    input.nowMs !== undefined ? Math.min(weekToMs, input.nowMs) : weekToMs;

  const weekSessions = validSessions.filter(
    (s) => overlapMs(s.startMs, s.endMs, weekFromMs, effectiveWeekToMs) > 0,
  );

  // Build chronological 7-day entries
  const perDay: WeeklyDayEntry[] = [];
  const perAppWeekMs = new Map<string, number>();
  const perAppActiveDays = new Map<string, number>();
  let recordedDays = 0;
  let totalForegroundMs = 0;
  let lateNightForegroundMs = 0;
  let storedDayCount = 0;
  let approximateDayCount = 0;
  let includesProvisionalToday = false;

  for (const day of weekDays) {
    const dStart = dayStartMs(day, utcOffsetMinutes);
    const dEnd = dStart + DAY_MS;
    const effectiveDEnd = input.nowMs !== undefined ? Math.min(dEnd, input.nowMs) : dEnd;
    const entry = dayMap.get(day) ?? {
      byApp: new Map<string, number>(),
      source: 'unrecorded' as const,
      recorded: false,
    };

    const isProvisionalToday =
      entry.recorded &&
      todayDay !== null &&
      day === todayDay &&
      input.nowMs !== undefined &&
      input.nowMs < dEnd;
    if (isProvisionalToday) includesProvisionalToday = true;

    let dayFgMs = 0;
    if (entry.recorded) {
      recordedDays += 1;
      for (const [app, ms] of entry.byApp.entries()) {
        if (ms <= 0) continue;
        dayFgMs += ms;
        perAppWeekMs.set(app, (perAppWeekMs.get(app) ?? 0) + ms);
        perAppActiveDays.set(app, (perAppActiveDays.get(app) ?? 0) + 1);
      }
      totalForegroundMs += dayFgMs;
      if (entry.source === 'stored_events') storedDayCount += 1;
      if (entry.source === 'os_bucket_approx') approximateDayCount += 1;
    }

    const daySittingCount = entry.recorded
      ? validSessions.filter((s) => overlapMs(s.startMs, s.endMs, dStart, effectiveDEnd) > 0).length
      : 0;

    const dayLateMs = entry.recorded
      ? computeDayLateNightForegroundMs({
          dayStart: dStart,
          dayEnd: dEnd,
          nowMs: input.nowMs,
          utcOffsetMinutes,
          events,
          ignorePackages,
          appLabels,
        })
      : 0;
    lateNightForegroundMs += dayLateMs;

    let badge: WeeklyDayBadge;
    if (!entry.recorded) {
      badge = 'unrecorded';
    } else if (isProvisionalToday) {
      badge = 'provisional';
    } else if (entry.source === 'os_bucket_approx') {
      badge = 'approximate';
    } else if (entry.source === 'stored_events') {
      badge = 'stored';
    } else {
      badge = 'live';
    }

    perDay.push({
      day,
      recorded: entry.recorded,
      isProvisionalToday,
      source: entry.source,
      badge,
      foregroundMs: dayFgMs,
      sittingCount: daySittingCount,
      lateNightForegroundMs: dayLateMs,
    });
  }

  const unrecordedDays = WEEKLY_WINDOW_DAYS - recordedDays;
  const isPartialWeek = recordedDays < WEEKLY_WINDOW_DAYS;
  const avgDailyForegroundMs = recordedDays > 0 ? Math.round(totalForegroundMs / recordedDays) : 0;

  const partialWeekNote = isPartialWeek
    ? recordedDays === 0
      ? 'Partial week (0 of 7 days recorded in this window) — totals are never extrapolated.'
      : `Partial week (${recordedDays} of 7 days recorded) — totals and daily averages cover recorded days only and are never extrapolated to a full week.`
    : null;

  // Sitting counts per app across the week (strictly from merged sittings)
  const sittingCountByApp = new Map<string, number>();
  for (const s of weekSessions) {
    sittingCountByApp.set(s.app, (sittingCountByApp.get(s.app) ?? 0) + 1);
  }

  const topApps: WeeklyAppRow[] = [...perAppWeekMs.entries()]
    .filter(([, ms]) => ms > 0)
    .map(([app, fgMs]) => ({
      app,
      label: appLabels[app] ?? app,
      foregroundMs: fgMs,
      avgDailyForegroundMs: recordedDays > 0 ? Math.round(fgMs / recordedDays) : 0,
      foregroundShare: totalForegroundMs > 0 ? fgMs / totalForegroundMs : 0,
      sittingCount: sittingCountByApp.get(app) ?? 0,
      activeDays: perAppActiveDays.get(app) ?? 0,
    }))
    .sort((a, b) => b.foregroundMs - a.foregroundMs || a.label.localeCompare(b.label))
    .slice(0, topAppsLimit);

  // Raw-open Rabbit Hole loops inside `[startDay .. endDay]` (honoring the >= 3-day multi-day gate)
  const rabbitRes =
    events.length > 0
      ? computeRabbitHoles({
          events,
          sessions: validSessions,
          nowMs: input.nowMs,
          labels: appLabels,
          ignorePackages,
          utcOffsetMinutes,
          clusterLimit: 50,
        })
      : null;
  const rabbitHoleClusters = (rabbitRes?.clusters ?? []).filter(
    (c) => c.day >= startDay && c.day <= endDay,
  );

  // Explicit user labels ("your labels (Tier D feedback)", never Tier A)
  const labelCounts = countExplicitLabels(weekSessions, input.intentLabels);
  const labelsMeasurable = labelCounts.decisive >= MIN_WEEKLY_INTENT_LABELS;
  const intentionalShare = labelsMeasurable
    ? labelCounts.intentional / labelCounts.decisive
    : null;
  const yourLabels: WeeklyIntentLabelsSummary = {
    attribution: WEEKLY_LABELS_ATTRIBUTION,
    tier: 'D',
    intentional: labelCounts.intentional,
    mindless: labelCounts.mindless,
    unsure: labelCounts.unsure,
    decisive: labelCounts.decisive,
    minRequired: MIN_WEEKLY_INTENT_LABELS,
    measurable: labelsMeasurable,
    intentionalShare,
    summaryText: labelsMeasurable
      ? `${Math.round(intentionalShare! * 100)}% intentional (${labelCounts.intentional} intentional, ${labelCounts.mindless} mindless across ${WEEKLY_LABELS_ATTRIBUTION}${labelCounts.unsure > 0 ? `; ${labelCounts.unsure} not sure excluded` : ''}).`
      : `Not measured yet: ${labelCounts.decisive} of ${MIN_WEEKLY_INTENT_LABELS} needed from ${WEEKLY_LABELS_ATTRIBUTION} (Intentional or Mindless; Not sure and duration hints never count).`,
  };

  // Prior-week comparison: strictly requires >= 14 distinct recorded local days AND
  // both 7-day windows fully covered (`!isPartialWeek && priorRecordedDays === 7`).
  let priorRecordedDays = 0;
  let priorTotalForegroundMs = 0;
  for (const day of priorWeekDays) {
    const entry = dayMap.get(day);
    if (entry && entry.recorded) {
      priorRecordedDays += 1;
      for (const ms of entry.byApp.values()) {
        priorTotalForegroundMs += ms;
      }
    }
  }
  const priorFromMs = dayStartMs(priorWeekDays[0]!, utcOffsetMinutes);
  const priorToMs = dayStartMs(priorWeekDays[priorWeekDays.length - 1]!, utcOffsetMinutes) + DAY_MS;
  const priorSittingCount = validSessions.filter(
    (s) => overlapMs(s.startMs, s.endMs, priorFromMs, priorToMs) > 0,
  ).length;

  let hasPriorWeekComparison = false;
  let priorWeekComparison: PriorWeekComparison | null = null;
  let priorWeekUnavailableReason: string | null = null;

  if (distinctRecordedDaysTotal < MIN_PRIOR_WEEK_COMPARISON_DAYS) {
    priorWeekUnavailableReason = `Prior-week comparison unlocks at ${MIN_PRIOR_WEEK_COMPARISON_DAYS}+ recorded local days (${distinctRecordedDaysTotal} recorded so far).`;
  } else if (isPartialWeek || priorRecordedDays < WEEKLY_WINDOW_DAYS) {
    priorWeekUnavailableReason = `Prior-week comparison requires 7 recorded days in both weeks (${recordedDays}/7 current, ${priorRecordedDays}/7 prior).`;
  } else {
    hasPriorWeekComparison = true;
    const deltaForegroundMs = totalForegroundMs - priorTotalForegroundMs;
    const deltaForegroundPct =
      priorTotalForegroundMs > 0 ? deltaForegroundMs / priorTotalForegroundMs : null;
    const deltaSittingCount = weekSessions.length - priorSittingCount;
    const sign = deltaForegroundMs > 0 ? '+' : deltaForegroundMs < 0 ? '−' : '';
    const absText = formatDurationShort(Math.abs(deltaForegroundMs));
    const pctClause =
      deltaForegroundPct !== null
        ? ` (${deltaForegroundPct >= 0 ? '+' : '−'}${Math.round(Math.abs(deltaForegroundPct) * 100)}%)`
        : '';
    const provisionalClause = includesProvisionalToday
      ? ' · includes today so far (provisional)'
      : '';
    priorWeekComparison = {
      priorStartDay: priorWeekDays[0]!,
      priorEndDay: priorWeekDays[priorWeekDays.length - 1]!,
      priorTotalForegroundMs,
      deltaForegroundMs,
      deltaForegroundPct,
      priorSittingCount,
      deltaSittingCount,
      includesProvisionalToday,
      summaryText:
        deltaForegroundMs === 0
          ? `Unchanged vs ${priorWeekDays[0]}–${priorWeekDays[6]} (${formatDurationShort(priorTotalForegroundMs)})${provisionalClause}.`
          : `${sign}${absText}${pctClause} vs ${priorWeekDays[0]}–${priorWeekDays[6]} (${formatDurationShort(priorTotalForegroundMs)})${provisionalClause}.`,
    };
  }

  const badgeParts: string[] = [];
  if (storedDayCount > 0) {
    badgeParts.push(`${storedDayCount} stored day${storedDayCount === 1 ? '' : 's'}`);
  }
  if (approximateDayCount > 0) {
    badgeParts.push(`${approximateDayCount} approximate day${approximateDayCount === 1 ? '' : 's'}`);
  }
  if (includesProvisionalToday) {
    badgeParts.push('today so far (provisional)');
  }
  const dataBadgeSummary =
    badgeParts.length > 0
      ? `Includes ${badgeParts.join(' · ')}.`
      : recordedDays > 0
        ? 'All recorded days come from live day-clipped OS foreground events.'
        : 'No recorded days in this 7-day window yet.';

  return {
    tier: 'D',
    startDay,
    endDay,
    windowDays: 7,
    recordedDays,
    unrecordedDays,
    isPartialWeek,
    extrapolated: false,
    partialWeekNote,
    includesProvisionalToday,
    totalForegroundMs,
    avgDailyForegroundMs,
    totalSittingCount: weekSessions.length,
    lateNightForegroundMs,
    rabbitHoleCount: rabbitHoleClusters.length,
    rabbitHoleClusters,
    yourLabels,
    perDay,
    topApps,
    storedDayCount,
    approximateDayCount,
    hasStoredDays: storedDayCount > 0,
    hasApproximateDays: approximateDayCount > 0,
    dataBadgeSummary,
    distinctRecordedDaysTotal,
    hasPriorWeekComparison,
    priorWeekComparison,
    priorWeekUnavailableReason,
    measuredSignals: [
      'Day-clipped foreground time per app and day (Tier D OS usage)',
      'Merged sitting counts (<= 15 min reopen merge)',
      'Raw-open Rabbit Hole return loops (4+ returns across > 30 min)',
      '23:00–05:00 local foreground time',
      'Optional session tags from your labels (Tier D feedback, requires 5+ labels)',
    ],
    unmeasuredSignals: [
      'Topics, page titles, URLs, search queries, and content completion (requires Tiers A/B/C)',
    ],
  };
}
