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

export type DonutSlice = { label: string; value: number };

/** Top five apps by day-clipped foreground time, plus one "Other" slice for the rest. */
export function buildDonutSlices(totals: readonly DailyTotal[], topN = 5): DonutSlice[] {
  const sorted = [...totals].filter((t) => t.totalMs > 0).sort((a, b) => b.totalMs - a.totalMs);
  const top = sorted.slice(0, topN).map((t) => ({ label: t.label, value: t.totalMs }));
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
