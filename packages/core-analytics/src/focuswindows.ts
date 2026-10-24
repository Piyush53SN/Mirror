/**
 * J20 Focus Windows (Tier-D descriptive timing blocks + clear empty state).
 *
 * Non-negotiable rules:
 *   1. Minimum history: requires at least `MIN_FOCUS_WINDOW_DAYS = 21` (3 weeks)
 *      of distinct local days before surfacing any candidate window.
 *   2. Minimum sample per cell: a `(weekday × 4-hour)` cell must contain at least
 *      `MIN_FOCUS_CELL_SESSIONS = 5` sittings before it qualifies; cells below 5
 *      sittings are never ranked or rated.
 *   3. Minimum activity for per-hour rates: `switchesPerHour` inside a cell is
 *      computed only when the cell has at least `MIN_FOCUS_CELL_ACTIVE_MS = 15 min`
 *      (`0.25 h`) of sitting time; below 15 min it is `null`.
 *   4. Clear empty state: when `< 21` days exist or `0` cells reach `5+` sittings,
 *      returns exact progress (`distinctDays` of `21`, `daysRemaining`, and cells
 *      at `5+` sittings so far) with calm, non-judgmental copy.
 *   5. Strictly descriptive, zero clinical/diagnostic/chronotype wording: describes
 *      only observed phone-sitting patterns from original OS event timestamps
 *      (never scaled timestamps, never inferred content, never blocks or shames).
 */
import { localDay } from './ingest';
import {
  MIN_SWITCHING_ACTIVE_MS,
  SWITCH_GAP_MS,
  countExplicitLabels,
  type ExplicitLabelCounts,
  type IntentLabel,
  type ScoredSession,
} from './scoring';
import { SHORT_SESSION_MS } from './sessionize';
import { isIgnoredSystemApp, isLabelingExcludedApp } from './usage';

export const MIN_FOCUS_WINDOW_DAYS = 21;
export const MIN_FOCUS_CELL_SESSIONS = 5;
export const MIN_FOCUS_CELL_ACTIVE_MS = MIN_SWITCHING_ACTIVE_MS;

export const FOCUS_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type FocusWeekday = (typeof FOCUS_WEEKDAYS)[number];

export const FOCUS_TIME_BLOCKS = [
  '00:00–04:00',
  '04:00–08:00',
  '08:00–12:00',
  '12:00–16:00',
  '16:00–20:00',
  '20:00–24:00',
] as const;
export type FocusTimeBlock = (typeof FOCUS_TIME_BLOCKS)[number];

export type FocusWindowsStatus =
  | 'insufficient_days'
  | 'insufficient_cell_samples'
  | 'ready';

export type FocusWindowCell = {
  cellId: string;
  weekdayIndex: number;
  weekday: FocusWeekday;
  blockIndex: number;
  blockLabel: FocusTimeBlock;
  label: string;
  sessionCount: number;
  distinctDays: number;
  totalSittingMs: number;
  /** Share of sittings lasting >= 8 s, bounded in [0, 1]. */
  sustainedShare: number;
  /** Null when totalSittingMs < 15 min (0.25 active hours). */
  switchesPerHour: number | null;
  explicitLabels: ExplicitLabelCounts;
};

export type FocusWindowsCapabilities = {
  tierDCanShow: string[];
  tierDCannotShow: string[];
  nonDiagnosticRule: string;
};

export type FocusWindowsInput = {
  sessions: readonly ScoredSession[];
  intentLabels?: readonly IntentLabel[] | Readonly<Record<string, IntentLabel['label']>>;
  labels?: Readonly<Record<string, string>>;
  ignorePackages?: readonly string[];
  utcOffsetMinutes?: number;
  minDays?: number;
  minCellSessions?: number;
  windowLimit?: number;
};

export type FocusWindowsResult = {
  status: FocusWindowsStatus;
  ready: boolean;
  distinctDays: number;
  minDays: number;
  daysRemaining: number;
  minCellSessions: number;
  historyStartDay: string | null;
  lastDay: string | null;
  totalCells: number;
  cellsWithAnySessions: number;
  /** Count of weekday × 4-hour cells with `sessionCount >= minCellSessions` so far. */
  cellsMeetingSampleFloor: number;
  emptyStateTitle: string | null;
  emptyStateBody: string | null;
  progressLabel: string;
  /** Qualified cells (`>= minCellSessions`), ordered by weekday then block. */
  qualifiedCells: FocusWindowCell[];
  /** Top sustained, low-switching cells among qualified cells (`>= 15 min` active). */
  suggestedWindows: FocusWindowCell[];
  capabilities: FocusWindowsCapabilities;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const CAPABILITIES: FocusWindowsCapabilities = {
  tierDCanShow: [
    'Weekday × 4-hour blocks (across 21+ local days and 5+ sittings per block) where fewer opens ended under 8 s and cross-app switching was lower',
    'Explicit intentional or mindless labels you chose to attach to sittings in those blocks',
  ],
  tierDCannotShow: [
    'Whether time inside an app was spent reading or working versus scrolling a feed (requires Tier A/B/C topic or page signals)',
    'Activity away from this phone, or why an app was opened without your explicit label',
  ],
  nonDiagnosticRule:
    'Focus Windows reports observed phone-timing blocks from your own device history. It never assesses attention or sleep, never blocks apps, and never sends unprompted nudges.',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** ISO Monday-first index (0 = Mon .. 6 = Sun) and 4-hour block index (0..5) in local time. */
function localWeekdayAndBlock(
  startMs: number,
  utcOffsetMinutes: number,
): { weekdayIndex: number; blockIndex: number } {
  const shifted = new Date(startMs + utcOffsetMinutes * MINUTE_MS);
  const utcDay = shifted.getUTCDay(); // 0 = Sun .. 6 = Sat
  const weekdayIndex = (utcDay + 6) % 7; // 0 = Mon .. 6 = Sun
  const utcHour = shifted.getUTCHours(); // 0..23
  const blockIndex = Math.min(5, Math.max(0, Math.floor(utcHour / 4)));
  return { weekdayIndex, blockIndex };
}

export function computeFocusWindows(input: FocusWindowsInput): FocusWindowsResult {
  const utcOffsetMinutes = input.utcOffsetMinutes ?? 0;
  const minDays = Math.max(1, Math.floor(input.minDays ?? MIN_FOCUS_WINDOW_DAYS));
  const minCellSessions = Math.max(1, Math.floor(input.minCellSessions ?? MIN_FOCUS_CELL_SESSIONS));
  const windowLimit = Math.max(1, Math.floor(input.windowLimit ?? 4));
  const launcherSet = new Set<string>(input.ignorePackages ?? []);
  const labels = input.labels ?? {};

  // Non-system sittings establish distinct local days (matching J4/J9 day count)
  const nonSystem = input.sessions.filter((s) => {
    const dur = s.endMs - s.startMs;
    if (!Number.isFinite(s.startMs) || !Number.isFinite(s.endMs) || dur <= 0) return false;
    if (launcherSet.has(s.app)) return false;
    if (isIgnoredSystemApp(s.app, labels[s.app])) return false;
    return true;
  });

  const daySet = new Set<string>();
  for (const s of nonSystem) {
    daySet.add(localDay(s.startMs, utcOffsetMinutes));
  }
  const orderedDays = [...daySet].sort();
  const distinctDays = orderedDays.length;
  const daysRemaining = Math.max(0, minDays - distinctDays);
  const historyStartDay = orderedDays[0] ?? null;
  const lastDay = orderedDays[orderedDays.length - 1] ?? null;

  // Exclude utility apps (clock, calculator, dialer, camera, etc.) from cell buckets
  const cellEligible = nonSystem.filter((s) => !isLabelingExcludedApp(s.app, labels[s.app]));

  type Bucket = {
    weekdayIndex: number;
    blockIndex: number;
    sessions: ScoredSession[];
    days: Set<string>;
  };

  const buckets = new Map<string, Bucket>();
  for (const s of cellEligible) {
    const { weekdayIndex, blockIndex } = localWeekdayAndBlock(s.startMs, utcOffsetMinutes);
    const key = `${weekdayIndex}:${blockIndex}`;
    let b = buckets.get(key);
    if (!b) {
      b = { weekdayIndex, blockIndex, sessions: [], days: new Set<string>() };
      buckets.set(key, b);
    }
    b.sessions.push(s);
    b.days.add(localDay(s.startMs, utcOffsetMinutes));
  }

  const totalCells = FOCUS_WEEKDAYS.length * FOCUS_TIME_BLOCKS.length;
  const cellsWithAnySessions = buckets.size;

  const builtQualified: FocusWindowCell[] = [];
  for (const b of buckets.values()) {
    if (b.sessions.length < minCellSessions) continue;
    const ordered = [...b.sessions].sort(
      (x, y) => x.startMs - y.startMs || x.id.localeCompare(y.id),
    );
    let totalSittingMs = 0;
    let sustainedCount = 0;
    let switches = 0;
    for (let i = 0; i < ordered.length; i += 1) {
      const cur = ordered[i]!;
      const dur = Math.max(0, cur.endMs - cur.startMs);
      totalSittingMs += dur;
      if (dur >= SHORT_SESSION_MS) sustainedCount += 1;
      if (i > 0) {
        const prev = ordered[i - 1]!;
        if (cur.app !== prev.app && cur.startMs >= prev.startMs && cur.startMs - prev.endMs <= SWITCH_GAP_MS) {
          switches += 1;
        }
      }
    }
    const sustainedShare = ordered.length > 0 ? sustainedCount / ordered.length : 0;
    const switchesPerHour =
      totalSittingMs >= MIN_FOCUS_CELL_ACTIVE_MS
        ? round1(switches / (totalSittingMs / HOUR_MS))
        : null;
    const explicitLabels = countExplicitLabels(ordered, input.intentLabels, {
      ignorePackages: input.ignorePackages,
      appLabels: labels,
    });
    const weekday = FOCUS_WEEKDAYS[b.weekdayIndex]!;
    const blockLabel = FOCUS_TIME_BLOCKS[b.blockIndex]!;
    builtQualified.push({
      cellId: `${weekday}-${blockLabel}`,
      weekdayIndex: b.weekdayIndex,
      weekday,
      blockIndex: b.blockIndex,
      blockLabel,
      label: `${weekday} ${blockLabel}`,
      sessionCount: ordered.length,
      distinctDays: b.days.size,
      totalSittingMs,
      sustainedShare,
      switchesPerHour,
      explicitLabels,
    });
  }

  builtQualified.sort(
    (a, b) => a.weekdayIndex - b.weekdayIndex || a.blockIndex - b.blockIndex,
  );
  const cellsMeetingSampleFloor = builtQualified.length;

  if (distinctDays < minDays) {
    const progressLabel = `${distinctDays} of ${minDays} local days recorded (${daysRemaining} more day${daysRemaining === 1 ? '' : 's'} needed) · ${cellsMeetingSampleFloor} of ${totalCells} weekday × 4-hour cells at ${minCellSessions}+ sittings so far`;
    return {
      status: 'insufficient_days',
      ready: false,
      distinctDays,
      minDays,
      daysRemaining,
      minCellSessions,
      historyStartDay,
      lastDay,
      totalCells,
      cellsWithAnySessions,
      cellsMeetingSampleFloor,
      emptyStateTitle: `Needs at least ${minDays} days (3 weeks) and ${minCellSessions} sittings per cell`,
      emptyStateBody:
        distinctDays === 0
          ? `0 of ${minDays} local days recorded yet. Focus Windows waits until at least ${minDays} local days of usage history and at least ${minCellSessions} sittings inside a weekday × 4-hour block exist before highlighting recurring blocks.`
          : `${distinctDays} of ${minDays} local days recorded since ${historyStartDay} (${daysRemaining} more day${daysRemaining === 1 ? '' : 's'} needed). Focus Windows stays empty until 3 weeks of local history and ${minCellSessions}+ sittings per weekday × 4-hour cell are available, rather than extrapolating from a few days.`,
      progressLabel,
      qualifiedCells: [],
      suggestedWindows: [],
      capabilities: CAPABILITIES,
    };
  }

  if (builtQualified.length === 0) {
    const progressLabel = `${distinctDays} local days recorded (meets ${minDays}-day floor) · 0 of ${totalCells} weekday × 4-hour cells have ${minCellSessions}+ sittings yet`;
    return {
      status: 'insufficient_cell_samples',
      ready: false,
      distinctDays,
      minDays,
      daysRemaining: 0,
      minCellSessions,
      historyStartDay,
      lastDay,
      totalCells,
      cellsWithAnySessions,
      cellsMeetingSampleFloor: 0,
      emptyStateTitle: `No weekday × 4-hour cell has ${minCellSessions}+ sittings yet`,
      emptyStateBody: `${distinctDays} local days are recorded (${historyStartDay} to ${lastDay}), across ${cellsWithAnySessions} active cell${cellsWithAnySessions === 1 ? '' : 's'}, and none has reached ${minCellSessions} sittings yet. Cells with fewer than ${minCellSessions} sittings are left unrated rather than ranked on small samples.`,
      progressLabel,
      qualifiedCells: [],
      suggestedWindows: [],
      capabilities: CAPABILITIES,
    };
  }

  // Highlight cells with >= 15 min total sitting time, >= 80% non-bounce opens, and <= 12 switches/h
  const suggestedWindows = [...builtQualified]
    .filter(
      (c) =>
        c.totalSittingMs >= MIN_FOCUS_CELL_ACTIVE_MS &&
        c.sustainedShare >= 0.8 &&
        c.switchesPerHour !== null &&
        c.switchesPerHour <= 12,
    )
    .sort(
      (a, b) =>
        b.sustainedShare - a.sustainedShare ||
        (a.switchesPerHour ?? 999) - (b.switchesPerHour ?? 999) ||
        b.sessionCount - a.sessionCount ||
        a.weekdayIndex - b.weekdayIndex ||
        a.blockIndex - b.blockIndex,
    )
    .slice(0, windowLimit);

  const progressLabel = `${distinctDays} local days recorded (${historyStartDay} to ${lastDay}) · ${builtQualified.length} of ${totalCells} weekday × 4-hour cells meet the ${minCellSessions}-sitting floor`;

  return {
    status: 'ready',
    ready: true,
    distinctDays,
    minDays,
    daysRemaining: 0,
    minCellSessions,
    historyStartDay,
    lastDay,
    totalCells,
    cellsWithAnySessions,
    cellsMeetingSampleFloor: builtQualified.length,
    emptyStateTitle: null,
    emptyStateBody: null,
    progressLabel,
    qualifiedCells: builtQualified,
    suggestedWindows,
    capabilities: CAPABILITIES,
  };
}
