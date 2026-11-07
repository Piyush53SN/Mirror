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

/** The line chart's range choices, in days. "Month" is the last 30 days. */
export const RANGE_DAYS = [7, 14, 30] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

/** The last `n` local days ending at `today`, oldest first (chronological, as a line reads). Pure. */
export function rangeDaysChronological(today: string, n: number): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(y, mo, d - i);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Line points for a range. `values` are per day, null where the day is not recorded (a gap, never
 * zero). Today is partial: drawn hollow and labelled, and never extrapolated. Pure.
 */
export function buildRangePoints(
  days: readonly string[],
  values: readonly (number | null)[],
  selectedDay: string,
  todayDay: string,
): { label: string; value: number | null; partial: boolean; selected: boolean; day: string }[] {
  return days.map((day, i) => ({
    label: String(Number(day.slice(8))),
    value: values[i] ?? null,
    partial: day === todayDay,
    selected: day === selectedDay,
    day,
  }));
}

/** Coloured sitting block on the day ribbon. `left` and `width` are fractions of the day (0..1). */
export type RibbonBlock = {
  key: string;
  app: string;
  startMs: number;
  endMs: number;
  left: number;
  width: number;
  /** Index into the category palette. Top apps get their own hue; the rest share the last one. */
  colourIndex: number;
};

/**
 * Sittings across one local day as ribbon blocks. Each sitting is clipped to the day. The colour is
 * the app's rank among the day's apps (`appOrder`, most used first), with everything past the
 * top `topN` sharing one neutral hue. Colour separates categories only. Pure.
 */
export function ribbonBlocks(
  sessions: readonly { id?: string; app: string; startMs: number; endMs: number }[],
  day: string,
  appOrder: readonly string[],
  topN = 5,
): RibbonBlock[] {
  const bounds = dayBounds(day);
  if (!bounds) return [];
  const span = bounds.toMs - bounds.fromMs;
  const out: RibbonBlock[] = [];
  sessions.forEach((s, i) => {
    const start = Math.max(bounds.fromMs, s.startMs);
    const end = Math.min(bounds.toMs, s.endMs);
    if (end <= start) return;
    const rank = appOrder.indexOf(s.app);
    out.push({
      key: s.id ?? `${s.app}-${i}`,
      app: s.app,
      startMs: start,
      endMs: end,
      left: (start - bounds.fromMs) / span,
      width: (end - start) / span,
      colourIndex: rank >= 0 && rank < topN ? rank : topN,
    });
  });
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The block under a fraction `x` (0..1) of the ribbon, or the nearest within `slop` (fraction). Pure. */
export function ribbonIndexAt(blocks: readonly RibbonBlock[], x: number, slop = 0.02): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  blocks.forEach((b, i) => {
    const dist = x >= b.left && x <= b.left + b.width ? 0 : Math.min(Math.abs(x - b.left), Math.abs(x - (b.left + b.width)));
    if (dist <= slop && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}

/** "09:10" for an epoch-ms time on the local clock. Pure given the timezone. */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
