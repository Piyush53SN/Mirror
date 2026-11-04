import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-budget-suggestions.mjs'),
});

const MIN = 60_000;
const DAY = 86_400_000;
const FORBIDDEN_RE = /\b(streak|streaks|shame|guilt|addicted|fail|failed|failing|warning|danger|exceeded|over budget|red)\b/i;

// 7-day window ending 2026-11-03 => 2026-10-28 .. 2026-11-03
const END = '2026-11-03';
const DAYS = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];

function days(perDayMs, app, dayList = DAYS) {
  return dayList.map((day) => ({ day, source: 'stored_events', totals: [{ app, totalMs: perDayMs }] }));
}

test('budget suggestion: "Set a 1h budget?" from 7-day day-clipped average, rounded to 15 minutes', () => {
  const out = core.suggestBudgets({
    endDay: END,
    dayTotals: days(58 * MIN, 'com.google.android.youtube'),
    recordedDays: DAYS,
    nowMs: Date.parse('2026-11-03T12:00:00Z'),
    appLabels: { 'com.google.android.youtube': 'YouTube' },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].app, 'com.google.android.youtube');
  assert.equal(out[0].suggestedLimitMs, 60 * MIN);
  assert.equal(out[0].title, 'Set a 1h budget?');
  assert.match(out[0].body, /Nothing is created unless you tap Accept/);
  assert.equal(FORBIDDEN_RE.test(`${out[0].title} ${out[0].body}`), false);
});

test('suggestion needs at least 3 recorded days and divides by recorded days, never by 7 when partial', () => {
  // Only 2 recorded days -> nothing.
  assert.equal(
    core.suggestBudgets({
      endDay: END,
      dayTotals: days(60 * MIN, 'a.app', DAYS.slice(0, 2)),
      recordedDays: DAYS.slice(0, 2),
      nowMs: 0,
    }).length,
    0,
  );
  // 3 recorded days at 1h each -> average is 1h, not 3h/7.
  const three = core.suggestBudgets({
    endDay: END,
    dayTotals: days(60 * MIN, 'a.app', DAYS.slice(4)),
    recordedDays: DAYS.slice(4),
    nowMs: 0,
  });
  assert.equal(three.length, 1);
  assert.equal(three[0].recordedDays, 3);
  assert.equal(three[0].suggestedLimitMs, 60 * MIN);
});

test('below 30 minutes is never suggested; rounding is to nearest 15 minutes', () => {
  assert.equal(
    core.suggestBudgets({ endDay: END, dayTotals: days(20 * MIN, 'a.app'), recordedDays: DAYS, nowMs: 0 }).length,
    0,
  );
  const out = core.suggestBudgets({ endDay: END, dayTotals: days(44 * MIN, 'a.app'), recordedDays: DAYS, nowMs: 0 });
  assert.equal(out[0].suggestedLimitMs, 45 * MIN);
});

test('already-budgeted, excluded, and recently dismissed apps are skipped; dismissal returns after 7 days', () => {
  const dayTotals = days(90 * MIN, 'a.budgeted');
  const base = { endDay: END, recordedDays: DAYS, dayTotals, nowMs: Date.parse('2026-11-03T12:00:00Z') };

  assert.equal(core.suggestBudgets({ ...base, existingBudgetPackages: ['a.budgeted'] }).length, 0);
  assert.equal(core.suggestBudgets({ ...base, ignorePackages: ['a.budgeted'] }).length, 0);

  const dismissedAt = base.nowMs - 6 * DAY;
  assert.equal(core.suggestBudgets({ ...base, dismissals: { 'a.budgeted': dismissedAt } }).length, 0);

  // 7 full days after dismissal -> suggestion may return.
  const later = { ...base, nowMs: dismissedAt + core.BUDGET_SUGGESTION_DISMISS_MS, dismissals: { 'a.budgeted': dismissedAt } };
  assert.equal(core.suggestBudgets(later).length, 1);
  assert.equal(core.BUDGET_SUGGESTION_DISMISS_MS, 7 * DAY);
});

test('suggestions are capped at three (strongest first), maxSuggestions can lower it, and the engine creates nothing', () => {
  const window3 = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const dayTotals = window3.map((day) => ({
    day,
    source: 'stored_events',
    totals: [
      { app: 'x.big', totalMs: 180 * MIN },
      { app: 'x.mid', totalMs: 90 * MIN },
      { app: 'x.small', totalMs: 40 * MIN },
      { app: 'x.tiny', totalMs: 20 * MIN }, // below 30m: never suggested
    ],
  }));
  const base = { endDay: END, dayTotals, recordedDays: window3, nowMs: 0 };
  const out = core.suggestBudgets(base);
  assert.deepEqual(out.map((s) => s.app), ['x.big', 'x.mid', 'x.small']);
  assert.equal(out[0].title, 'Set a 3h budget?');
  assert.equal(core.suggestBudgets({ ...base, maxSuggestions: 1 }).length, 1);
  assert.equal(core.suggestBudgets({ ...base, maxSuggestions: 2 }).length, 2);
  assert.equal(core.BUDGET_SUGGESTION_MAX_ITEMS, 3);
});

test('the 7-day window is the local day range ending on endDay (no days outside the window count)', () => {
  const win = core.budgetSuggestionWindowDays(END);
  assert.deepEqual(win, DAYS);
  // An older day with huge time must not affect the average.
  const out = core.suggestBudgets({
    endDay: END,
    dayTotals: [
      { day: '2026-10-01', source: 'stored_events', totals: [{ app: 'a.app', totalMs: 9 * 60 * MIN }] },
      ...days(30 * MIN, 'a.app', DAYS.slice(4)),
    ],
    recordedDays: ['2026-10-01', ...DAYS.slice(4)],
    nowMs: 0,
  });
  assert.equal(out[0].suggestedLimitMs, 30 * MIN);
});
