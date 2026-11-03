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
    referenceDay: '2026-11-01', // Sunday
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
