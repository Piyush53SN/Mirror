/**
 * The single definition of Mirror's night window (`23:00–05:00` local).
 *
 * Every consumer imports from here: the late-night score factor (`scoring.ts`),
 * late-night goals (`goals.ts`), the weekly report and rabbit-hole late-night
 * shares (`weekly.ts`, `rabbithole.ts`), the what-if quiet-hours scenario
 * (`whatif.ts`), and the default for reminder quiet hours (`reminders.ts`).
 *
 * Reminder quiet hours are the one part a user can change (see
 * `WeeklyReportPrefs.quietHoursStartHour/EndHour`). They default to this window.
 * Score and goal definitions do not change with that setting.
 */

export type NightWindow = {
  /** Local start hour `0..23` inclusive (e.g. `23` for `23:00`). */
  readonly startHour: number;
  /** Local end hour `0..23` exclusive (e.g. `5` for `05:00`). */
  readonly endHour: number;
};

export const NIGHT_WINDOW: NightWindow = Object.freeze({ startHour: 23, endHour: 5 });

export const NIGHT_WINDOW_LABEL = '23:00–05:00';

export function formatHourLabel(hour: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

export function formatWindowLabel(window: { startHour: number; endHour: number }): string {
  return `${formatHourLabel(window.startHour)}–${formatHourLabel(window.endHour)}`;
}

/** True when `hour` (local, `0..23`) falls inside `[startHour, endHour)`, wrapping midnight. */
export function isHourInWindow(hour: number, window: NightWindow = NIGHT_WINDOW): boolean {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const start = ((Math.trunc(window.startHour) % 24) + 24) % 24;
  const end = ((Math.trunc(window.endHour) % 24) + 24) % 24;
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}
