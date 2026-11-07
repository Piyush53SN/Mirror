/**
 * Pure shaping for the Home charts. Presentation only: every number comes from the existing
 * weekly report (day-clipped foreground time) or the existing daily totals. Nothing here
 * computes a new metric.
 */
import type { WeeklyReportResult } from '@mirror/core-analytics';
import type { DailyTotal } from './context/MirrorAppContext';

export const WEEK_MIN_RECORDED_DAYS = 3;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type WeekPoint = { label: string; value: number | null; partial: boolean; selected: boolean; day: string };

/** Short weekday for a YYYY-MM-DD day string (no timezone shift: parsed as local calendar date). */
export function weekdayShort(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return WEEKDAYS[d.getDay()];
}

/**
 * Seven points, oldest first. A day with no recorded totals is a gap (value null), never zero.
 * Today, while still provisional, is marked partial. Returns null when there are not enough
 * recorded days for a multi-day view (the chart is then hidden with a plain note).
 */
export function buildWeekPoints(report: WeeklyReportResult | null | undefined, selectedDay: string): WeekPoint[] | null {
  if (!report) return null;
  const recorded = report.perDay.filter((d) => d.recorded).length;
  if (recorded < WEEK_MIN_RECORDED_DAYS) return null;
  return report.perDay.map((d) => ({
    label: weekdayShort(d.day),
    value: d.recorded ? d.foregroundMs : null,
    partial: d.isProvisionalToday,
    selected: d.day === selectedDay,
    day: d.day,
  }));
}

export type DonutSlice = { label: string; value: number; /** Package name; absent for the "Other" slice. */ app?: string };

/** Top five apps by day-clipped foreground time, plus one "Other" slice for the rest. */
export function buildDonutSlices(totals: readonly DailyTotal[], topN = 5): DonutSlice[] {
  const sorted = [...totals].filter((t) => t.totalMs > 0).sort((a, b) => b.totalMs - a.totalMs);
  const top: DonutSlice[] = sorted.slice(0, topN).map((t) => ({ label: t.label, value: t.totalMs, app: t.app }));
  const rest = sorted.slice(topN).reduce((sum, t) => sum + t.totalMs, 0);
  if (rest > 0) top.push({ label: 'Other', value: rest });
  return top;
}

export type HourBucket = { hour: number; ms: number };

/**
 * Sitting time per local clock hour for one local day. Pure. Each sitting is split across the
 * hours it covers and clipped to the day, so the 24 values add up to the day's sitting time
 * (no new metric: the same spans the sittings already define).
 */
export function buildHourBuckets(
  sessions: readonly { startMs: number; endMs: number }[],
  day: string,
): HourBucket[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0 }));
  if (!m) return buckets;
  const dayStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const dayEnd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime();
  for (const s of sessions) {
    const from = Math.max(s.startMs, dayStart);
    const to = Math.min(s.endMs, dayEnd);
    if (to <= from) continue;
    for (let h = 0; h < 24; h += 1) {
      const hStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h).getTime();
      const hEnd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h + 1).getTime();
      const overlap = Math.min(to, hEnd) - Math.max(from, hStart);
      if (overlap > 0) buckets[h].ms += overlap;
    }
  }
  return buckets;
}

/** Hour label for a 0..23 hour, e.g. 9 -> "09:00". */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Local-midnight bounds of a YYYY-MM-DD day, as epoch milliseconds. Pure. */
export function dayBounds(day: string): { fromMs: number; toMs: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return { fromMs: new Date(y, mo, d).getTime(), toMs: new Date(y, mo, d + 1).getTime() };
}

/** Local-hour bounds of hour `hour` (0..23) on `day`. Pure. */
export function hourBounds(day: string, hour: number): { fromMs: number; toMs: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return { fromMs: new Date(y, mo, d, hour).getTime(), toMs: new Date(y, mo, d, hour + 1).getTime() };
}

/**
 * The day one step away from `day` in `options` (newest first, as `lastNDays` returns them).
 * `delta` +1 is the next newer day, -1 the previous older day. Null at either end. Pure.
 */
export function adjacentDay(options: readonly string[], day: string, delta: 1 | -1): string | null {
  const i = options.indexOf(day);
  if (i < 0) return null;
  const j = i - delta; // newest first: moving to a newer day lowers the index
  return j >= 0 && j < options.length ? options[j] : null;
}

/** Hour (0..23) under x for a strip `width` wide. Pure, clamped. */
export function hourFromX(x: number, width: number): number {
  if (width <= 0) return 0;
  const h = Math.floor((Math.max(0, Math.min(width - 1e-6, x)) / width) * 24);
  return Math.max(0, Math.min(23, h));
}

/** "Updated just now" / "Updated 5 min ago" / "Updated at 14:05". Pure. */
export function updatedLabel(nowMs: number, atMs: number | null): string {
  if (atMs === null) return 'Not updated yet this session';
  const sec = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (sec < 60) return 'Updated just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min} min ago`;
  const d = new Date(atMs);
  return `Updated at ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The line chart's range choices, in days. "Month" is the last 30. */
export const RANGE_DAYS = [7, 14, 30] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day `delta` days from `day` (local calendar arithmetic, no timezone shift). Pure. */
export function addDays(day: string, delta: number): string {
  const d = parseDay(day);
  if (!d) return day;
  return formatDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
}

/** The last `n` local days ending at `endDay`, oldest first. Pure. */
export function rangeDaysChronological(endDay: string, n: number): string[] {
  if (!parseDay(endDay)) return [];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(addDays(endDay, -i));
  return out;
}

/**
 * The window's end day. It is anchored on today (or the latest day) and only moves when the user
 * picks a day outside it. Selecting a day inside the window leaves it unchanged. Pure.
 */
export function windowEndFor(selectedDay: string, currentEnd: string, n: number, todayDay: string): string {
  const start = addDays(currentEnd, -(n - 1));
  if (selectedDay >= start && selectedDay <= currentEnd) return currentEnd;
  if (selectedDay > currentEnd) return selectedDay > todayDay ? todayDay : selectedDay;
  // Picked before the window: bring that day to the start of the window, never past today.
  const end = addDays(selectedDay, n - 1);
  return end > todayDay ? todayDay : end;
}

/**
 * Prev / Next: move the highlight one day. The window scrolls only when the highlight would leave
 * it at an edge. Never moves past today. Pure.
 */
export function stepSelection(
  selectedDay: string,
  direction: 1 | -1,
  currentEnd: string,
  n: number,
  todayDay: string,
): { selectedDay: string; endDay: string } {
  const next = addDays(selectedDay, direction);
  if (next > todayDay) return { selectedDay, endDay: currentEnd };
  const start = addDays(currentEnd, -(n - 1));
  if (next < start) return { selectedDay: next, endDay: addDays(next, n - 1) };
  if (next > currentEnd) return { selectedDay: next, endDay: next };
  return { selectedDay: next, endDay: currentEnd };
}

/**
 * Days in the window that still need a fetch. Days before history starts, and days after today,
 * are never fetched: they resolve to no data. Pure.
 */
export function missingDays(days: readonly string[], cache: ReadonlyMap<string, number | null>, historyStartDay: string | null, todayDay: string): string[] {
  return days.filter((d) => !cache.has(d) && historyStartDay !== null && d >= historyStartDay && d <= todayDay);
}

/** Short axis label. Seven days: weekday. Longer ranges: day of month, with the month on the 1st and the first point. */
export function axisLabelFor(day: string, index: number, n: number): string {
  const d = parseDay(day);
  if (!d) return day;
  if (n <= 7) return WEEKDAYS[d.getDay()];
  if (index === 0 || d.getDate() === 1) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return String(d.getDate());
}

/** "Thu 5 Nov", the tooltip day. Pure. */
export function tooltipDayLabel(day: string): string {
  const d = parseDay(day);
  if (!d) return day;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export type SeriesPoint = {
  label: string;
  tooltip: string;
  value: number | null;
  partial: boolean;
  selected: boolean;
  day: string;
  /** Why there is no value, for the text alternative: 'before history', 'no data', or 'loading'. */
  gap?: 'before history' | 'no data' | 'loading';
};

/**
 * Points for the line chart. A day before history is a gap labelled "before history"; a day with
 * no total is "no data" (never zero); a day not yet fetched is "loading". Today is partial. Pure.
 */
export function chartSeries(args: {
  days: readonly string[];
  totals: ReadonlyMap<string, number | null>;
  historyStartDay: string | null;
  todayDay: string;
  selectedDay: string;
  formatValue: (ms: number) => string;
}): SeriesPoint[] {
  const n = args.days.length;
  return args.days.map((day, i) => {
    const before = args.historyStartDay !== null && day < args.historyStartDay;
    const loaded = args.totals.has(day);
    const raw = loaded ? args.totals.get(day) ?? null : null;
    const value = before ? null : raw;
    const gap: SeriesPoint['gap'] = value !== null ? undefined : before ? 'before history' : loaded ? 'no data' : 'loading';
    const partial = day === args.todayDay;
    const when = tooltipDayLabel(day);
    const tooltip =
      value !== null
        ? `${when}${partial ? ' · today so far' : ''} · ${args.formatValue(value)}`
        : `${when} · ${gap === 'before history' ? 'before history' : gap === 'loading' ? 'loading' : 'no data'}`;
    return {
      label: axisLabelFor(day, i, n),
      tooltip,
      value,
      partial,
      selected: day === args.selectedDay,
      day,
      gap,
    };
  });
}

/**
 * Nice y-axis ticks in ms: 0 and multiples of `stepMs`, enough to cover `max`, at most four
 * intervals. Pure. Example: 4h19m with a 2h step gives [0, 2h, 4h, 6h].
 */
export function niceTicks(max: number, stepMs = 7200000): number[] {
  let step = stepMs;
  let top = Math.max(1, Math.ceil(max / step)) * step;
  if (top / step > 4) {
    step *= 2;
    top = Math.ceil(max / step) * step;
  }
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/** Tick label for the y-axis: "0", "2h", "4h", "6h" (whole hours, one short line). Pure. */
export function tickLabel(ms: number): string {
  if (ms === 0) return '0';
  const h = ms / 3600000;
  return Number.isInteger(h) ? `${h}h` : `${Math.round(h * 10) / 10}h`;
}

/** Coloured sitting block, placed as fractions of the day. Pure data for the swimlane. */
export type LaneBlock = {
  key: string;
  app: string;
  startMs: number;
  endMs: number;
  /** Start and width as fractions of the day (0..1). */
  left: number;
  width: number;
  /** Sittings merged into this block (1 when not merged). */
  count: number;
};

export type SwimlaneRow = {
  key: string;
  label: string;
  /** Package for a top app; absent for the "Other" row. */
  app?: string;
  /** Index into the category palette (top apps: rank; Other: the shared last hue). */
  colourIndex: number;
  blocks: LaneBlock[];
};

/**
 * Merge same-app sittings whose gap is under `gapMs` (60 s by default), so a few seconds between two
 * sittings of one app read as one block. Pure. Input must be sorted by start.
 */
export function mergeLaneBlocks(blocks: readonly LaneBlock[], gapMs = 60000): LaneBlock[] {
  const out: LaneBlock[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.app === b.app && b.startMs - last.endMs < gapMs) {
      last.endMs = Math.max(last.endMs, b.endMs);
      last.count += b.count;
      continue;
    }
    out.push({ ...b });
  }
  return out;
}

/**
 * The swimlane: one row for each of the top `topN` apps (by rank in `appOrder`), plus an "Other" row
 * when any sitting belongs to a lower app. Sittings are clipped to the day, merged per app, and
 * placed on one shared 0–24 axis. Empty rows are kept for the top apps. Pure.
 */
export function swimlaneRows(
  sessions: readonly { id?: string; app: string; startMs: number; endMs: number }[],
  day: string,
  appOrder: readonly string[],
  labels: Readonly<Record<string, string>>,
  topN = 5,
): SwimlaneRow[] {
  const bounds = dayBounds(day);
  if (!bounds) return [];
  const span = bounds.toMs - bounds.fromMs;
  const top = appOrder.slice(0, topN);
  const byApp = new Map<string, LaneBlock[]>();
  const sorted = [...sessions].sort((a, b) => a.startMs - b.startMs);
  for (const [i, s] of sorted.entries()) {
    const start = Math.max(bounds.fromMs, s.startMs);
    const end = Math.min(bounds.toMs, s.endMs);
    if (end <= start) continue;
    const key = s.app;
    const list = byApp.get(key) ?? [];
    list.push({ key: s.id ?? `${s.app}-${i}`, app: s.app, startMs: start, endMs: end, left: (start - bounds.fromMs) / span, width: (end - start) / span, count: 1 });
    byApp.set(key, list);
  }
  const rows: SwimlaneRow[] = top.map((app, rank) => ({
    key: `app-${app}`,
    label: labels[app] ?? app,
    app,
    colourIndex: rank,
    blocks: mergeLaneBlocks(byApp.get(app) ?? []),
  }));
  const otherBlocks: LaneBlock[] = [];
  for (const [app, list] of byApp) if (!top.includes(app)) otherBlocks.push(...list);
  if (otherBlocks.length > 0) {
    rows.push({
      key: 'other',
      label: 'Other',
      colourIndex: topN,
      blocks: mergeLaneBlocks(otherBlocks.sort((a, b) => a.startMs - b.startMs)),
    });
  }
  return rows;
}

/** Pixel placement for a block on a track `trackWidth` wide: never narrower than `minDp`. Pure. */
export function blockPixels(left: number, width: number, trackWidth: number, minDp = 3): { x: number; w: number } {
  const w = Math.min(trackWidth, Math.max(minDp, width * trackWidth));
  const x = Math.max(0, Math.min(left * trackWidth, trackWidth - w));
  return { x, w };
}

/** "09:10" for an epoch-ms time on the local clock. Pure given the timezone. */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
