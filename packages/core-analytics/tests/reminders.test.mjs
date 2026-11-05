import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-reminders.mjs'),
});

const FORBIDDEN_GUILT_RE = /\b(streak|streaks|shame|guilt|addicted|fail|failed|failing|warning|danger)\b/i;

test('reminders: off by default, quiet-hours suppressed (23:00-05:00), deduped per week, neutral partial-week aware copy', () => {
  const IST = 330; // +05:30
  const MIN = 60_000;
  const report = core.computeWeeklyReport({
    // The engine reads `endDay`. A misspelled key falls back to the wall clock, so pin it here.
    endDay: '2026-11-01', // Sunday
    recordedDays: ['2026-10-30', '2026-10-31', '2026-11-01'],
    dayTotals: [
      { day: '2026-10-30', source: 'stored_events', totals: [{ app: 'org.wikipedia', totalMs: 30 * MIN }] },
      { day: '2026-10-31', source: 'stored_events', totals: [{ app: 'org.wikipedia', totalMs: 45 * MIN }] },
      { day: '2026-11-01', source: 'os_events', totals: [{ app: 'org.wikipedia', totalMs: 25 * MIN }] },
    ],
    sessions: [
      { id: 's1', app: 'org.wikipedia', startMs: Date.parse('2026-11-01T05:00:00Z'), endMs: Date.parse('2026-11-01T05:25:00Z') },
    ],
    utcOffsetMinutes: IST,
  });

  // The window is anchored by endDay, so the fixture days are the window under any clock.
  assert.equal(report.endDay, '2026-11-01');
  assert.equal(report.startDay, '2026-10-26');
  assert.equal(report.recordedDays, 3);

  // 1. Off by default -> never posts
  const sundayEveningIst = Date.parse('2026-11-01T14:00:00.000Z'); // 19:30 IST on Sunday
  const offRes = core.evaluateWeeklyReminder({
    prefs: { reminderEnabled: false, reminderWeekday: 0, reminderHourLocal: 19 },
    report,
    nowMs: sundayEveningIst,
    utcOffsetMinutes: IST,
  });
  assert.equal(offRes.shouldPost, false);
  assert.equal(offRes.reason, 'disabled');

  // 2. Quiet hours (23:30 IST and 03:15 IST) -> suppressed even when enabled
  const lateNightIst = Date.parse('2026-11-01T18:00:00.000Z'); // 23:30 IST
  const quietRes1 = core.evaluateWeeklyReminder({
    prefs: { reminderEnabled: true, reminderWeekday: 0, reminderHourLocal: 19 },
    report,
    nowMs: lateNightIst,
    utcOffsetMinutes: IST,
  });
  assert.equal(quietRes1.shouldPost, false);
  assert.equal(quietRes1.reason, 'quiet_hours');

  const earlyMorningIst = Date.parse('2026-11-01T21:45:00.000Z'); // 03:15 IST Monday
  assert.equal(core.isInQuietHoursLocal(earlyMorningIst, IST), true);

  // 3. Enabled on Sunday 19:30 IST -> posts once with calm, non-extrapolated partial-week copy
  const fireRes = core.evaluateWeeklyReminder({
    prefs: { reminderEnabled: true, reminderWeekday: 0, reminderHourLocal: 19 },
    report,
    nowMs: sundayEveningIst,
    utcOffsetMinutes: IST,
  });
  assert.equal(fireRes.shouldPost, true);
  assert.equal(fireRes.title, 'Weekly summary ready');
  assert.match(fireRes.body, /Partial week \(3 of 7 days recorded, not extrapolated\): 1h 40m foreground/);
  assert.equal(FORBIDDEN_GUILT_RE.test(`${fireRes.title} ${fireRes.body}`), false);

  // 4. Dedupe same week slot -> does not post twice
  const dupRes = core.evaluateWeeklyReminder({
    prefs: { reminderEnabled: true, reminderWeekday: 0, reminderHourLocal: 19 },
    report,
    nowMs: sundayEveningIst + 30 * MIN,
    utcOffsetMinutes: IST,
    lastSentSlot: fireRes.slotKey,
  });
  assert.equal(dupRes.shouldPost, false);
  assert.equal(dupRes.reason, 'already_sent');
});

test('gentle budget note: separate toggle off by default, quiet-hours suppressed, deduped per budget window, neutral copy', () => {
  const IST = 330;
  const MIN = 60_000;
  const summary = core.evaluateBudgets({
    budgets: [
      {
        id: 'b_yt',
        name: 'YouTube',
        kind: 'app',
        packages: ['com.google.android.youtube'],
        period: 'daily',
        limitMs: 45 * MIN,
        enabled: true,
        createdAtMs: 1000,
        updatedAtMs: 1000,
      },
    ],
    referenceDay: '2026-11-02',
    dayTotals: [
      {
        day: '2026-11-02',
        source: 'os_events',
        totals: [{ app: 'com.google.android.youtube', totalMs: 57 * MIN }],
      },
    ],
    recordedDays: ['2026-11-02'],
    isSelectedToday: true,
  });

  const daytimeIst = Date.parse('2026-11-02T09:00:00.000Z'); // 14:30 IST
  const quietIst = Date.parse('2026-11-02T18:10:00.000Z'); // 23:40 IST

  // 1. Off by default even when weekly reminder is enabled
  const offDecision = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: false },
    summary,
    nowMs: daytimeIst,
    utcOffsetMinutes: IST,
  });
  assert.equal(offDecision.notes.length, 0);
  assert.equal(offDecision.suppressedReason, 'disabled');

  // 2. Quiet hours -> suppressed
  const quietDecision = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary,
    nowMs: quietIst,
    utcOffsetMinutes: IST,
  });
  assert.equal(quietDecision.notes.length, 0);
  assert.equal(quietDecision.suppressedReason, 'quiet_hours');

  // 3. Enabled during daytime -> gentle neutral note, once per window
  const onDecision = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary,
    nowMs: daytimeIst,
    utcOffsetMinutes: IST,
  });
  assert.equal(onDecision.notes.length, 1);
  assert.equal(onDecision.notes[0].title, 'Soft budget note · YouTube');
  assert.match(onDecision.notes[0].body, /12m over 45m today/);
  assert.match(onDecision.notes[0].body, /Soft reference only — nothing is blocked/);
  assert.equal(FORBIDDEN_GUILT_RE.test(onDecision.notes[0].body), false);

  const dedupedDecision = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary,
    nowMs: daytimeIst + 20 * MIN,
    utcOffsetMinutes: IST,
    sentKeys: [onDecision.notes[0].dedupeKey],
  });
  assert.equal(dedupedDecision.notes.length, 0);

  // 4. MIUI best-effort wording constant mentions MIUI and no internet permission
  assert.match(core.MIUI_BEST_EFFORT_REMINDER_NOTE, /MIUI/);
  assert.match(core.MIUI_BEST_EFFORT_REMINDER_NOTE, /no internet permission/);
});

// ---------------------------------------------------------------------------
// Night-window single definition, configurable reminder quiet hours, and the
// once-per-budget-per-day note cap.
// ---------------------------------------------------------------------------

const MIN_CAP = 60_000;

function over45Summary(budgetId, name, period = 'daily') {
  return core.evaluateBudgets({
    budgets: [
      {
        id: budgetId,
        name,
        kind: 'app',
        packages: [`pkg.${budgetId}`],
        period,
        limitMs: 45 * MIN_CAP,
        enabled: true,
        createdAtMs: 1000,
        updatedAtMs: 1000,
      },
    ],
    referenceDay: '2026-11-02',
    dayTotals: [
      { day: '2026-11-02', source: 'os_events', totals: [{ app: `pkg.${budgetId}`, totalMs: 57 * MIN_CAP }] },
    ],
    recordedDays: ['2026-11-02'],
    isSelectedToday: true,
  });
}

test('night window: one shared definition (23:00-05:00) used as the reminder default', () => {
  assert.deepEqual({ ...core.NIGHT_WINDOW }, { startHour: 23, endHour: 5 });
  assert.equal(core.NIGHT_WINDOW_LABEL, '23:00–05:00');
  // Default reminder quiet hours equal the night window: 23:30 and 04:59 suppressed, 05:00 allowed.
  const IST = 330;
  assert.equal(core.isInQuietHoursLocal(Date.parse('2026-11-02T18:00:00Z'), IST), true); // 23:30 IST
  assert.equal(core.isInQuietHoursLocal(Date.parse('2026-11-01T23:29:00Z'), IST), true); // 04:59 IST
  assert.equal(core.isInQuietHoursLocal(Date.parse('2026-11-01T23:30:00Z'), IST), false); // 05:00 IST
  // Score/goal definition uses the same window: a 23:30-23:40 session counts as late-night.
  const late = core.lateNightMs(Date.parse('2026-11-02T18:00:00Z'), Date.parse('2026-11-02T18:10:00Z'), IST);
  assert.equal(late, 10 * MIN_CAP);
  assert.equal(core.formatWindowLabel(core.NIGHT_WINDOW), '23:00–05:00');
});

test('configurable reminder quiet hours: custom window suppresses reminders and notes', () => {
  const IST = 330;
  const quiet = { startHour: 22, endHour: 7 };
  // 06:30 IST is inside 22:00-07:00 but outside the default 23:00-05:00 (which would allow it).
  const at0630 = Date.parse('2026-11-01T01:00:00Z');
  assert.equal(core.isInQuietHoursLocal(at0630, IST), false);
  assert.equal(core.isInQuietHoursLocal(at0630, IST, quiet), true);

  const summary = over45Summary('b_q', 'Quiet check');
  const suppressed = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary,
    nowMs: at0630,
    utcOffsetMinutes: IST,
    quietHours: quiet,
  });
  assert.equal(suppressed.notes.length, 0);
  assert.equal(suppressed.suppressedReason, 'quiet_hours');
});

test('budget note cap: at most one note per budget per local day, with a test', () => {
  const IST = 330;
  const day1Noon = Date.parse('2026-11-02T06:30:00Z'); // 12:00 IST
  const day1Later = Date.parse('2026-11-02T09:00:00Z'); // 14:30 IST, same day
  const day2Noon = Date.parse('2026-11-03T06:30:00Z'); // next local day
  const yt = over45Summary('b_yt', 'YouTube');
  const news = over45Summary('b_news', 'News');

  const first = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary: yt,
    nowMs: day1Noon,
    utcOffsetMinutes: IST,
  });
  assert.equal(first.notes.length, 1);
  assert.equal(first.notes[0].dedupeKey, 'budget-note:b_yt:2026-11-02');

  // Same local day, later evaluation, key already recorded -> no second note.
  const again = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary: yt,
    nowMs: day1Later,
    utcOffsetMinutes: IST,
    sentKeys: [first.notes[0].dedupeKey],
  });
  assert.equal(again.notes.length, 0);

  // Two different budgets on the same day -> one note each (cap is per budget).
  const combined = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary: { items: [...yt.items, ...news.items] },
    nowMs: day1Later,
    utcOffsetMinutes: IST,
    sentKeys: [first.notes[0].dedupeKey],
  });
  assert.deepEqual(combined.notes.map((n) => n.budgetId), ['b_news']);

  // Next local day -> the same budget may note once again.
  const nextDay = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary: yt,
    nowMs: day2Noon,
    utcOffsetMinutes: IST,
    sentKeys: [first.notes[0].dedupeKey],
  });
  assert.equal(nextDay.notes.length, 1);
  assert.equal(nextDay.notes[0].dedupeKey, 'budget-note:b_yt:2026-11-03');

  // Weekly-period budgets are also capped at one per day (not one per week).
  const weekly = over45Summary('b_wk', 'Weekly cap', 'weekly');
  const weeklyFirst = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary: weekly,
    nowMs: day1Noon,
    utcOffsetMinutes: IST,
  });
  const weeklySecond = core.evaluateBudgetExceededNotes({
    prefs: { budgetNoteEnabled: true },
    summary: weekly,
    nowMs: day1Later,
    utcOffsetMinutes: IST,
    sentKeys: weeklyFirst.notes.map((n) => n.dedupeKey),
  });
  assert.equal(weeklyFirst.notes.length, 1);
  assert.equal(weeklySecond.notes.length, 0);

  // Delivery keys from other days are pruned, today's are kept.
  assert.deepEqual(
    core.pruneBudgetNoteKeys(['budget-note:b_yt:2026-11-02', 'budget-note:b_yt:2026-11-03', 'weekly_slot:x'], '2026-11-03'),
    ['budget-note:b_yt:2026-11-03'],
  );
});
