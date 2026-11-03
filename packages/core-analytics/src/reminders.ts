/**
 * Opt-in Local Reminder & Gentle Budget Note Policy (P4.3 — Tier D local only).
 *
 * Non-negotiable invariants:
 *   1. Strictly off by default (`reminderEnabled = false`, `budgetNoteEnabled = false`).
 *   2. Zero network / push servers — evaluated locally on-device during app opens and
 *      periodic WorkManager refreshes.
 *   3. Quiet-hours aware (`23:00–05:00` local time by default): notifications are NEVER
 *      posted during quiet hours.
 *   4. Calm, neutral copy: no streaks, no red failure states, no guilt or scolding,
 *      and partial weeks are never extrapolated.
 *   5. Honest best-effort MIUI / OEM battery disclosure.
 */

import type { BudgetsEvaluationSummary } from './budgets';
import { isHourInWindow, NIGHT_WINDOW, type NightWindow } from './nightWindow';
import type { WeeklyReportResult } from './weekly';

function formatReminderDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe === 0) return '0m';
  const totalMin = Math.round(safe / 60_000);
  if (totalMin === 0) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const WEEKLY_REMINDER_NOTIFICATION_ID = 4301;

export const MIUI_BEST_EFFORT_REMINDER_NOTE =
  'Local best-effort delivery: Reminders run locally on this phone during app refreshes and periodic background checks (no push servers and no internet permission). On MIUI / HyperOS and strict battery savers, background delivery can be delayed unless Mirror is allowed background activity in system battery settings.';

export type ReminderPrefsInput = {
  reminderEnabled: boolean;
  reminderWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  reminderHourLocal: number;
  budgetNoteEnabled?: boolean;
};

/** Reminder quiet hours; default is the shared night window (`NIGHT_WINDOW`). */
export type QuietHoursRange = NightWindow;

export type LocalClockSnapshot = {
  dayKey: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hour: number;
  minute: number;
};

export function localClockAt(nowMs: number, utcOffsetMinutes: number): LocalClockSnapshot {
  const shifted = new Date(nowMs + utcOffsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return {
    dayKey: `${y}-${m}-${d}`,
    weekday: shifted.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function isInQuietHoursLocal(
  nowMs: number,
  utcOffsetMinutes: number,
  quietHours: QuietHoursRange = NIGHT_WINDOW,
): boolean {
  const { hour } = localClockAt(nowMs, utcOffsetMinutes);
  return isHourInWindow(hour, quietHours);
}

export type WeeklyReminderDecision =
  | {
      shouldPost: false;
      reason: 'disabled' | 'quiet_hours' | 'wrong_day_or_hour' | 'already_sent' | 'no_data';
      slotKey?: string;
    }
  | {
      shouldPost: true;
      slotKey: string;
      notificationId: number;
      title: string;
      body: string;
    };

export function evaluateWeeklyReminder(input: {
  prefs: ReminderPrefsInput;
  report: WeeklyReportResult | null;
  nowMs: number;
  utcOffsetMinutes: number;
  lastSentSlot?: string | null;
  quietHours?: QuietHoursRange;
}): WeeklyReminderDecision {
  const {
    prefs,
    report,
    nowMs,
    utcOffsetMinutes,
    lastSentSlot = null,
    quietHours = NIGHT_WINDOW,
  } = input;

  if (!prefs.reminderEnabled) {
    return { shouldPost: false, reason: 'disabled' };
  }
  const clock = localClockAt(nowMs, utcOffsetMinutes);
  if (isHourInWindow(clock.hour, quietHours)) {
    return { shouldPost: false, reason: 'quiet_hours' };
  }
  if (!report || report.recordedDays <= 0) {
    return { shouldPost: false, reason: 'no_data' };
  }

  // If the configured hour somehow fell inside quiet hours, defer to 08:00 daytime.
  const effectiveHour = isHourInWindow(prefs.reminderHourLocal, quietHours)
    ? 8
    : prefs.reminderHourLocal;

  if (clock.weekday !== prefs.reminderWeekday || clock.hour < effectiveHour) {
    return { shouldPost: false, reason: 'wrong_day_or_hour' };
  }

  const slotKey = `${clock.dayKey}:w${prefs.reminderWeekday}`;
  if (lastSentSlot === slotKey) {
    return { shouldPost: false, reason: 'already_sent', slotKey };
  }

  const totalText = formatReminderDuration(report.totalForegroundMs);
  const sittingsWord = report.totalSittingCount === 1 ? 'sitting' : 'sittings';
  const body = report.isPartialWeek
    ? `Partial week (${report.recordedDays} of 7 days recorded, not extrapolated): ${totalText} foreground across ${report.totalSittingCount} ${sittingsWord}. Open Mirror to view your local weekly report.`
    : `Last 7 local days: ${totalText} foreground across ${report.totalSittingCount} ${sittingsWord}. Open Mirror to view your local weekly report.`;

  return {
    shouldPost: true,
    slotKey,
    notificationId: WEEKLY_REMINDER_NOTIFICATION_ID,
    title: 'Weekly summary ready',
    body,
  };
}

export type BudgetExceededNoteItem = {
  dedupeKey: string;
  notificationId: number;
  budgetId: string;
  title: string;
  body: string;
};

export type BudgetExceededNotesDecision = {
  notes: BudgetExceededNoteItem[];
  suppressedReason: 'none' | 'disabled' | 'quiet_hours';
};

function stableBudgetNotificationId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 4400 + (Math.abs(hash) % 5000);
}

/** Key for the once-per-day budget note: `budget-note:<budgetId>:<YYYY-MM-DD>`. */
export function budgetNoteDedupeKey(budgetId: string, dayKey: string): string {
  return `budget-note:${budgetId}:${dayKey}`;
}

/** Drops delivery keys that belong to a day other than `dayKey` (keeps storage bounded). */
export function pruneBudgetNoteKeys(keys: readonly string[], dayKey: string): string[] {
  const suffix = `:${dayKey}`;
  return keys.filter((k) => k.startsWith('budget-note:') && k.endsWith(suffix));
}

export function evaluateBudgetExceededNotes(input: {
  prefs: Pick<ReminderPrefsInput, 'budgetNoteEnabled'>;
  summary: BudgetsEvaluationSummary | null;
  nowMs: number;
  utcOffsetMinutes: number;
  sentKeys?: readonly string[];
  quietHours?: QuietHoursRange;
}): BudgetExceededNotesDecision {
  const {
    prefs,
    summary,
    nowMs,
    utcOffsetMinutes,
    sentKeys = [],
    quietHours = NIGHT_WINDOW,
  } = input;

  if (!prefs.budgetNoteEnabled) {
    return { notes: [], suppressedReason: 'disabled' };
  }
  if (isInQuietHoursLocal(nowMs, utcOffsetMinutes, quietHours)) {
    return { notes: [], suppressedReason: 'quiet_hours' };
  }
  if (!summary || summary.items.length === 0) {
    return { notes: [], suppressedReason: 'none' };
  }

  const sentSet = new Set(sentKeys);
  const notes: BudgetExceededNoteItem[] = [];
  const { dayKey } = localClockAt(nowMs, utcOffsetMinutes);

  for (const item of summary.items) {
    if (!item.enabled || item.state !== 'over_budget' || item.overMs <= 0) continue;
    // At most one note per budget per local day, whatever the budget period.
    const dedupeKey = budgetNoteDedupeKey(item.id, dayKey);
    if (sentSet.has(dedupeKey)) continue;
    notes.push({
      dedupeKey,
      notificationId: stableBudgetNotificationId(dedupeKey),
      budgetId: item.id,
      title: `Soft budget note · ${item.name}`,
      body: `${item.name}: ${item.statusLine}. Soft reference only — nothing is blocked.`,
    });
  }

  return { notes, suppressedReason: 'none' };
}
