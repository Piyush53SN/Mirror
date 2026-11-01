/**
 * Soft Attention Budgets (Tier D OS foreground time only).
 *
 * Design & privacy invariants:
 *   1. **Day-clipped foreground events only — never merged spans.** Every `usedMs`
 *      figure comes strictly from day-clipped foreground intervals (`app_background`
 *      events clipped to `[00:00 local, min(24:00 local, nowMs)]` and unioned per
 *      package via `computeDayForegroundTotalsFromStoredEvents`, or pre-resolved
 *      `dayTotals` from the same pipeline) matching Digital Wellbeing within
 *      `max(10%, 60s)`. Merged sitting spans (`<= 15m` gap) are NEVER accepted or
 *      summed here.
 *   2. **Shared system exclusion list.** Launchers, Mirror itself, Settings, Play
 *      Store/Services, and system package installers are excluded identically.
 *   3. **Partial weeks marked partial and never extrapolated.** Weekly budgets sum
 *      foreground time across recorded days in the 7-local-day window ending at
 *      `referenceDay`; `< 7` recorded days set `isPartialWindow: true` and are
 *      never multiplied up to 7 days.
 *   4. **Soft, calm arithmetic — zero app-blocking, zero streaks, zero red failure
 *      states, zero guilt copy.** Statuses are descriptive (`'within_budget'`,
 *      `'at_budget'`, `'over_budget'`, `'paused'`).
 */
import type { StoredForegroundEventInput } from './evolution';
import { dayStartMs, localDay } from './ingest';
import { formatDurationShort } from './scoring';
import {
  computeDayForegroundTotalsFromStoredEvents,
  isExcludedApp,
  type DayTotalsSource,
} from './usage';

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BudgetPeriod = 'daily' | 'weekly';
export type BudgetTargetKind = 'app' | 'group';

export type BudgetDefinition = {
  id: string;
  /** User-chosen label (for example "YouTube" or "Social & Video"). */
  name: string;
  kind: BudgetTargetKind;
  /** Non-empty list of Android package names included in this soft budget. */
  packages: readonly string[];
  period: BudgetPeriod;
  /** Positive soft ceiling in milliseconds (> 0). */
  limitMs: number;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type BudgetValidationResult =
  | { ok: true; value: BudgetDefinition }
  | { ok: false; errors: string[] };

export function validateBudgetDefinition(candidate: unknown): BudgetValidationResult {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, errors: ['budget must be an object'] };
  }
  const b = candidate as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  if (!id || id.length > 128) errors.push('id: must be a non-empty string (<= 128 chars)');

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 120) errors.push('name: must be a non-empty string (<= 120 chars)');

  const kind = b.kind;
  if (kind !== 'app' && kind !== 'group') {
    errors.push('kind: must be "app" or "group"');
  }

  const rawPkgs = Array.isArray(b.packages) ? b.packages : [];
  const packages: string[] = [];
  const seen = new Set<string>();
  for (const item of rawPkgs) {
    if (typeof item !== 'string') {
      errors.push('packages: every entry must be a string');
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      packages.push(trimmed);
    }
  }
  if (packages.length === 0) {
    errors.push('packages: must contain at least one package name');
  }
  if (kind === 'app' && packages.length > 1) {
    errors.push('packages: kind "app" must target a single package (use "group" for multiple)');
  }

  const period = b.period;
  if (period !== 'daily' && period !== 'weekly') {
    errors.push('period: must be "daily" or "weekly"');
  }

  const limitMs = typeof b.limitMs === 'number' && Number.isFinite(b.limitMs) ? Math.round(b.limitMs) : NaN;
  const maxPeriodMs = period === 'weekly' ? 7 * DAY_MS : DAY_MS;
  if (!Number.isFinite(limitMs) || limitMs <= 0 || limitMs > maxPeriodMs) {
    errors.push(`limitMs: must be a positive integer <= ${maxPeriodMs}`);
  }

  if (typeof b.enabled !== 'boolean') {
    errors.push('enabled: must be a boolean');
  }

  const createdAtMs =
    typeof b.createdAtMs === 'number' && Number.isFinite(b.createdAtMs) && b.createdAtMs >= 0
      ? Math.round(b.createdAtMs)
      : NaN;
  const updatedAtMs =
    typeof b.updatedAtMs === 'number' && Number.isFinite(b.updatedAtMs) && b.updatedAtMs >= 0
      ? Math.round(b.updatedAtMs)
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
      name,
      kind: kind as BudgetTargetKind,
      packages,
      period: period as BudgetPeriod,
      limitMs,
      enabled: Boolean(b.enabled),
      createdAtMs,
      updatedAtMs,
    },
  };
}

export type BudgetDayTotalRow = {
  /** Package identifier (`app` or `packageName`). */
  app?: string;
  packageName?: string;
  totalMs: number;
};

export type BudgetDayForegroundInput = {
  /** Local day key `YYYY-MM-DD`. */
  day: string;
  /** Day-clipped foreground totals for `day` (never merged sitting spans). */
  totals: readonly BudgetDayTotalRow[];
  source?: DayTotalsSource;
};

export type EvaluateBudgetsInput = {
  budgets: readonly BudgetDefinition[];
  /** Reference local day `YYYY-MM-DD` (today or selected day). */
  referenceDay: string;
  /**
   * Optional pre-resolved day-clipped foreground totals per day (preferred when
   * older days include fallback `os_bucket_approx` or live `os_events` totals).
   */
  dayTotals?: readonly BudgetDayForegroundInput[];
  /**
   * Stored/built `app_background` foreground events, clipped strictly to each
   * local day `[00:00, min(24:00, nowMs)]` when `dayTotals` does not cover a day.
   */
  events?: readonly StoredForegroundEventInput[];
  /** Optional explicit list of recorded local days `YYYY-MM-DD`. */
  recordedDays?: readonly string[];
  /** Optional earliest local day in Mirror's history (marks days before it unrecorded). */
  historyStartDay?: string | null;
  utcOffsetMinutes?: number;
  nowMs?: number;
  ignorePackages?: readonly string[];
  appLabels?: Readonly<Record<string, string>>;
};

/**
 * Calm, factual soft-budget state — never a red failure state, streak, or app block.
 */
export type BudgetState = 'within_budget' | 'at_budget' | 'over_budget' | 'paused';

export type BudgetPackageBreakdown = {
  app: string;
  label: string;
  usedMs: number;
};

export type BudgetEvaluation = {
  id: string;
  name: string;
  kind: BudgetTargetKind;
  packages: readonly string[];
  period: BudgetPeriod;
  enabled: boolean;
  tier: 'D';
  windowStartDay: string;
  windowEndDay: string;
  expectedDays: 1 | 7;
  recordedDays: number;
  /** True for weekly budgets when fewer than 7 days are recorded (never extrapolated). */
  isPartialWindow: boolean;
  isProvisionalToday: boolean;
  usedMs: number;
  limitMs: number;
  remainingMs: number;
  overMs: number;
  /** Unclamped ratio `usedMs / limitMs` (`>= 0`). */
  usedRatio: number;
  /** Clamped meter ratio in `[0, 1]` for calm progress bars. */
  meterFillRatio: number;
  state: BudgetState;
  perPackageUsedMs: BudgetPackageBreakdown[];
  sources: DayTotalsSource[];
  hasStoredDays: boolean;
  hasApproximateDays: boolean;
  /** Calm, non-judgmental one-line summary (never extrapolated on partial weeks). */
  summaryText: string;
};

export type BudgetsEvaluationSummary = {
  referenceDay: string;
  tier: 'D';
  items: BudgetEvaluation[];
  activeCount: number;
  withinOrAtCount: number;
  overCount: number;
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

/**
 * Resolve per-day, per-package day-clipped foreground ms across a set of days.
 * Never reads merged sitting spans.
 */
export function resolveClippedDayMap(params: {
  days: readonly string[];
  dayTotals?: readonly BudgetDayForegroundInput[];
  events?: readonly StoredForegroundEventInput[];
  recordedDays?: readonly string[];
  historyStartDay?: string | null;
  utcOffsetMinutes: number;
  nowMs?: number;
  ignorePackages: readonly string[];
  appLabels: Readonly<Record<string, string>>;
}): Map<
  string,
  {
    byApp: Map<string, number>;
    source: DayTotalsSource | 'unrecorded';
    recorded: boolean;
  }
> {
  const {
    days,
    dayTotals = [],
    events = [],
    recordedDays,
    historyStartDay,
    utcOffsetMinutes,
    nowMs,
    ignorePackages,
    appLabels,
  } = params;

  const todayDay = nowMs !== undefined ? localDay(nowMs, utcOffsetMinutes) : null;
  const explicitRecorded = recordedDays ? new Set(recordedDays.filter((d) => DAY_RE.test(d))) : null;

  const providedByDay = new Map<string, BudgetDayForegroundInput>();
  for (const entry of dayTotals) {
    if (entry && DAY_RE.test(entry.day)) {
      providedByDay.set(entry.day, entry);
    }
  }

  // Derive earliest day seen in events or dayTotals when `historyStartDay` is omitted.
  let inferredEarliestDay: string | null =
    historyStartDay && DAY_RE.test(historyStartDay) ? historyStartDay : null;
  if (!inferredEarliestDay) {
    for (const d of providedByDay.keys()) {
      if (!inferredEarliestDay || d < inferredEarliestDay) inferredEarliestDay = d;
    }
    for (const ev of events) {
      if (!ev || ev.kind !== 'app_background' || typeof ev.duration_ms !== 'number') continue;
      const endMs = Date.parse(ev.at);
      const dur = Math.max(0, Math.round(ev.duration_ms));
      if (!Number.isFinite(endMs) || dur <= 0) continue;
      const startDay = localDay(endMs - dur, utcOffsetMinutes);
      if (!inferredEarliestDay || startDay < inferredEarliestDay) inferredEarliestDay = startDay;
    }
    if (explicitRecorded) {
      for (const d of explicitRecorded) {
        if (!inferredEarliestDay || d < inferredEarliestDay) inferredEarliestDay = d;
      }
    }
  }

  const normalizedEvents = events
    .filter(
      (ev): ev is StoredForegroundEventInput & { app: string; duration_ms: number } =>
        Boolean(ev) &&
        ev.kind === 'app_background' &&
        typeof ev.app === 'string' &&
        typeof ev.duration_ms === 'number' &&
        Number.isFinite(ev.duration_ms) &&
        ev.duration_ms > 0,
    )
    .map((ev) => ({
      kind: 'app_background' as const,
      app: ev.app,
      at: ev.at,
      duration_ms: Math.round(ev.duration_ms),
    }));

  const out = new Map<
    string,
    {
      byApp: Map<string, number>;
      source: DayTotalsSource | 'unrecorded';
      recorded: boolean;
    }
  >();

  for (const day of days) {
    const startMs = dayStartMs(day, utcOffsetMinutes);
    const endMs = startMs + DAY_MS;
    if (nowMs !== undefined && startMs > nowMs) {
      out.set(day, { byApp: new Map(), source: 'unrecorded', recorded: false });
      continue;
    }

    const provided = providedByDay.get(day);
    if (provided) {
      const byApp = new Map<string, number>();
      for (const row of provided.totals) {
        const pkg = (row.app ?? row.packageName ?? '').trim();
        if (!pkg) continue;
        if (isExcludedApp(pkg, { ignorePackages, label: appLabels[pkg] })) continue;
        const ms = Math.max(0, Math.round(row.totalMs));
        if (ms <= 0) continue;
        byApp.set(pkg, (byApp.get(pkg) ?? 0) + ms);
      }
      const source: DayTotalsSource = provided.source ?? 'stored_events';
      const isRecorded = explicitRecorded ? explicitRecorded.has(day) : true;
      out.set(day, {
        byApp: isRecorded ? byApp : new Map(),
        source: isRecorded ? source : 'unrecorded',
        recorded: isRecorded,
      });
      continue;
    }

    const eventTotals =
      normalizedEvents.length > 0
        ? computeDayForegroundTotalsFromStoredEvents(normalizedEvents, {
            window: { fromMs: startMs, toMs: endMs },
            nowMs,
            ignorePackages,
            appLabels,
          })
        : [];
    const byApp = new Map<string, number>();
    for (const row of eventTotals) {
      byApp.set(row.packageName, row.totalMs);
    }

    let recorded = false;
    if (explicitRecorded) {
      recorded = explicitRecorded.has(day);
    } else if (byApp.size > 0) {
      recorded = true;
    } else if (inferredEarliestDay !== null && day >= inferredEarliestDay) {
      // Once collection has started (`day >= historyStartDay`) and the day is not
      // in the future, a zero-foreground day is a genuinely quiet recorded day.
      recorded = todayDay === null || day <= todayDay;
    }

    out.set(day, {
      byApp: recorded ? byApp : new Map(),
      source: recorded ? 'stored_events' : 'unrecorded',
      recorded,
    });
  }

  return out;
}

export function evaluateBudgets(input: EvaluateBudgetsInput): BudgetsEvaluationSummary {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const ignorePackages = input.ignorePackages ?? [];
  const appLabels = input.appLabels ?? {};
  const referenceDay = DAY_RE.test(input.referenceDay)
    ? input.referenceDay
    : localDay(input.nowMs ?? Date.now(), utcOffsetMinutes);
  const todayDay = input.nowMs !== undefined ? localDay(input.nowMs, utcOffsetMinutes) : null;

  const weekDays = listWindowDays(referenceDay, 7);
  const dayMap = resolveClippedDayMap({
    days: weekDays,
    dayTotals: input.dayTotals,
    events: input.events,
    recordedDays: input.recordedDays,
    historyStartDay: input.historyStartDay,
    utcOffsetMinutes,
    nowMs: input.nowMs,
    ignorePackages,
    appLabels,
  });

  const items: BudgetEvaluation[] = [];
  let activeCount = 0;
  let withinOrAtCount = 0;
  let overCount = 0;

  for (const def of input.budgets) {
    const check = validateBudgetDefinition(def);
    if (!check.ok) continue;
    const budget = check.value;

    const targetPackages = budget.packages.filter(
      (pkg) => !isExcludedApp(pkg, { ignorePackages, label: appLabels[pkg] }),
    );
    const windowDays = budget.period === 'daily' ? [referenceDay] : weekDays;
    const expectedDays: 1 | 7 = budget.period === 'daily' ? 1 : 7;

    let usedMs = 0;
    let recordedDays = 0;
    const perPkgMap = new Map<string, number>();
    const sourceSet = new Set<DayTotalsSource>();

    for (const pkg of targetPackages) {
      perPkgMap.set(pkg, 0);
    }

    for (const day of windowDays) {
      const entry = dayMap.get(day);
      if (!entry || !entry.recorded) continue;
      recordedDays += 1;
      if (entry.source !== 'unrecorded') {
        sourceSet.add(entry.source);
      }
      for (const pkg of targetPackages) {
        const ms = entry.byApp.get(pkg) ?? 0;
        usedMs += ms;
        perPkgMap.set(pkg, (perPkgMap.get(pkg) ?? 0) + ms);
      }
    }

    const isPartialWindow = budget.period === 'weekly' && recordedDays < 7;
    const isProvisionalToday =
      todayDay !== null &&
      windowDays.includes(todayDay) &&
      input.nowMs !== undefined &&
      input.nowMs < dayStartMs(todayDay, utcOffsetMinutes) + DAY_MS;

    const remainingMs = Math.max(0, budget.limitMs - usedMs);
    const overMs = Math.max(0, usedMs - budget.limitMs);
    const usedRatio = budget.limitMs > 0 ? usedMs / budget.limitMs : 0;
    const meterFillRatio = Math.min(1, Math.max(0, usedRatio));

    let state: BudgetState;
    if (!budget.enabled) {
      state = 'paused';
    } else {
      activeCount += 1;
      if (usedMs > budget.limitMs) {
        state = 'over_budget';
        overCount += 1;
      } else if (usedMs === budget.limitMs) {
        state = 'at_budget';
        withinOrAtCount += 1;
      } else {
        state = 'within_budget';
        withinOrAtCount += 1;
      }
    }

    const perPackageUsedMs: BudgetPackageBreakdown[] = [...perPkgMap.entries()]
      .map(([app, ms]) => ({
        app,
        label: appLabels[app] ?? app,
        usedMs: ms,
      }))
      .sort((a, b) => b.usedMs - a.usedMs || a.label.localeCompare(b.label));

    const sources = [...sourceSet];
    const hasStoredDays = sources.includes('stored_events');
    const hasApproximateDays = sources.includes('os_bucket_approx');

    const usedText = formatDurationShort(usedMs);
    const limitText = formatDurationShort(budget.limitMs);
    const windowClause =
      budget.period === 'daily'
        ? isProvisionalToday
          ? 'today so far'
          : `on ${referenceDay}`
        : isPartialWindow
          ? `across ${recordedDays} of 7 days (partial week, not extrapolated)`
          : 'across 7 days';

    let summaryText: string;
    if (!budget.enabled) {
      summaryText = `Paused · ${usedText} recorded ${windowClause} (soft budget ${limitText}).`;
    } else if (recordedDays === 0) {
      summaryText = `No recorded activity in this ${budget.period} window yet (soft budget ${limitText}).`;
    } else if (overMs > 0) {
      summaryText = `${usedText} of ${limitText} soft budget ${windowClause} (${formatDurationShort(overMs)} above target).`;
    } else if (remainingMs === 0) {
      summaryText = `${usedText} of ${limitText} soft budget ${windowClause} (at target).`;
    } else {
      summaryText = `${usedText} of ${limitText} soft budget ${windowClause} (${formatDurationShort(remainingMs)} remaining).`;
    }

    items.push({
      id: budget.id,
      name: budget.name,
      kind: budget.kind,
      packages: targetPackages,
      period: budget.period,
      enabled: budget.enabled,
      tier: 'D',
      windowStartDay: windowDays[0]!,
      windowEndDay: windowDays[windowDays.length - 1]!,
      expectedDays,
      recordedDays,
      isPartialWindow,
      isProvisionalToday,
      usedMs,
      limitMs: budget.limitMs,
      remainingMs,
      overMs,
      usedRatio,
      meterFillRatio,
      state,
      perPackageUsedMs,
      sources,
      hasStoredDays,
      hasApproximateDays,
      summaryText,
    });
  }

  return {
    referenceDay,
    tier: 'D',
    items,
    activeCount,
    withinOrAtCount,
    overCount,
  };
}
