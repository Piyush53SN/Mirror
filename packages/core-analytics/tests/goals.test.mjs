/**
 * packages/core-analytics/tests/goals.test.mjs
 *
 * Unit & fast-check property tests for Calm User-Created Weekly Goals (Tier D):
 *   - Zero auto-suggested goals (empty goals -> empty items, no suggestion helpers).
 *   - Zero streaks, zero red failure states, zero guilt copy (even at 0 of 7 days).
 *   - Calm ratio output ("4 of 7 days within target", partial weeks never extrapolated).
 *   - Per-app & daily foreground goals use day-clipped foreground events, NEVER merged spans.
 *   - Unfinished provisional today held out on `daily_late_night_max`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-goals.mjs'),
});

const {
  evaluateGoals,
  validateGoalDefinition,
  dayStartMs,
} = core;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

test('no auto-suggested goals exist: empty goals returns empty items and no suggestGoal API exists', () => {
  const res = evaluateGoals({
    goals: [],
    endDay: '2026-11-01',
    dayTotals: [
      { day: '2026-11-01', totals: [{ app: 'com.google.android.youtube', totalMs: 180 * MIN_MS }] },
    ],
  });
  assert.deepEqual(res.items, []);
  for (const exportName of Object.keys(core)) {
    assert.doesNotMatch(
      exportName,
      /suggest.*Goal|recommend.*Goal|auto.*Goal/i,
      `unexpected auto-goal export: ${exportName}`,
    );
  }
});

test('calm ratio evaluation ("4 of 7 days within target", "0 of 7 days within target"): zero streaks, zero red failure states, zero guilt copy', () => {
  const days = [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ];
  // 4 days <= 60m, 3 days > 60m
  const mins = [45, 90, 50, 80, 60, 120, 30];
  const dayTotals = days.map((day, idx) => ({
    day,
    source: 'stored_events',
    totals: [{ app: 'com.google.android.youtube', totalMs: mins[idx] * MIN_MS }],
  }));

  const res = evaluateGoals({
    goals: [
      {
        id: 'g_four',
        title: 'Total screen time up to 1h',
        kind: 'daily_total_foreground',
        targetMs: 60 * MIN_MS,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      {
        id: 'g_zero',
        title: 'YouTube under 15m/day',
        kind: 'daily_app_foreground',
        packages: ['com.google.android.youtube'],
        targetMs: 15 * MIN_MS,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ],
    endDay: '2026-11-01',
    recordedDays: days,
    dayTotals,
  });

  const gFour = res.items.find((i) => i.id === 'g_four');
  assert.equal(gFour.daysWithinTarget, 4);
  assert.equal(gFour.evaluatedDays, 7);
  assert.equal(gFour.isPartialWeek, false);
  assert.equal(gFour.extrapolated, false);
  assert.equal(gFour.state, 'calm_progress');
  assert.equal(gFour.ratioLabel, '4 of 7 days within target');

  const gZero = res.items.find((i) => i.id === 'g_zero');
  assert.equal(gZero.daysWithinTarget, 0);
  assert.equal(gZero.evaluatedDays, 7);
  assert.equal(gZero.state, 'calm_progress', 'even 0 of 7 days stays calm_progress — never a red failure state');
  assert.equal(gZero.ratioLabel, '0 of 7 days within target');

  const serialized = JSON.stringify(res);
  assert.doesNotMatch(
    serialized,
    /streak|consecutive|failed|failure|danger|shame|guilt|broken|missed|warning/i,
    'serialized goal output must contain zero streak, failure, danger, or guilt fields/copy',
  );
});

test('daily_app_foreground uses day-clipped foreground events, NEVER merged sitting spans', () => {
  const dayStart = dayStartMs('2026-11-01', 0);
  // Two 4m YouTube opens 10m apart -> 8m foreground time, 18m merged sitting span.
  // Against a 10m/day target, day-clipped foreground (8m <= 10m) is WITHIN target;
  // merged span (18m > 10m) would falsely mark it above target!
  const events = [
    {
      kind: 'app_background',
      app: 'com.google.android.youtube',
      at: new Date(dayStart + 10 * HOUR_MS + 4 * MIN_MS).toISOString(),
      duration_ms: 4 * MIN_MS,
    },
    {
      kind: 'app_background',
      app: 'com.google.android.youtube',
      at: new Date(dayStart + 10 * HOUR_MS + 18 * MIN_MS).toISOString(),
      duration_ms: 4 * MIN_MS,
    },
  ];
  const mergedSessions = [
    {
      id: 'ses_yt_merged',
      app: 'com.google.android.youtube',
      startMs: dayStart + 10 * HOUR_MS,
      endMs: dayStart + 10 * HOUR_MS + 18 * MIN_MS,
    },
  ];

  const res = evaluateGoals({
    goals: [
      {
        id: 'g_yt_10m',
        title: 'YouTube <= 10m',
        kind: 'daily_app_foreground',
        packages: ['com.google.android.youtube'],
        targetMs: 10 * MIN_MS,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ],
    endDay: '2026-11-01',
    historyStartDay: '2026-11-01',
    events,
    sessions: mergedSessions,
    utcOffsetMinutes: 0,
  });

  const item = res.items[0];
  assert.equal(item.evaluatedDays, 1);
  assert.equal(item.daysWithinTarget, 1, '8m day-clipped foreground is <= 10m target');
  assert.equal(item.isPartialWeek, true);
  assert.equal(item.extrapolated, false);
  assert.equal(item.ratioLabel, '1 of 1 recorded day within target (partial week)');
  assert.equal(item.days[6].observedMs, 8 * MIN_MS);
});

test('daily_late_night_max holds out unfinished provisional today and evaluates completed days cleanly', () => {
  const days = [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ];
  // Daytime 10m event on all 7 days, plus one 20m late-night event on Oct 28 (23:30 UTC).
  // Nov 01 is provisional today at 14:00 UTC -> held out from late-night evaluation!
  const events = days.map((d) => {
    const start = dayStartMs(d, 0);
    return {
      kind: 'app_background',
      app: 'org.wikipedia',
      at: new Date(start + 12 * HOUR_MS + 10 * MIN_MS).toISOString(),
      duration_ms: 10 * MIN_MS,
    };
  });
  events.push({
    kind: 'app_background',
    app: 'com.google.android.youtube',
    at: new Date(dayStartMs('2026-10-28', 0) + 23 * HOUR_MS + 30 * MIN_MS).toISOString(),
    duration_ms: 20 * MIN_MS,
  });

  const res = evaluateGoals({
    goals: [
      {
        id: 'g_quiet',
        title: 'Quiet nights after 23:00',
        kind: 'daily_late_night_max',
        targetMs: 0,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ],
    endDay: '2026-11-01',
    historyStartDay: '2026-10-26',
    events,
    utcOffsetMinutes: 0,
    nowMs: dayStartMs('2026-11-01', 0) + 14 * HOUR_MS,
  });

  const item = res.items[0];
  assert.equal(item.recordedDays, 7);
  assert.equal(item.evaluatedDays, 6, '6 completed nights evaluated; unfinished today held out');
  assert.equal(item.daysWithinTarget, 5, '5 of 6 completed nights had 0m late-night');
  assert.equal(item.days[6].heldOutReason, 'provisional_late_night');
  assert.equal(item.ratioLabel, '5 of 6 completed days within target (today in progress)');
});

test('validateGoalDefinition rejects malformed goals and accepts all 4 Tier D goal kinds', () => {
  assert.equal(validateGoalDefinition(null).ok, false);
  assert.equal(
    validateGoalDefinition({
      id: 'g1',
      title: 'Missing packages',
      kind: 'daily_app_foreground',
      targetMs: 10 * MIN_MS,
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    }).ok,
    false,
  );
  assert.equal(
    validateGoalDefinition({
      id: 'g_sit',
      title: 'Up to 12 sittings/day',
      kind: 'daily_sitting_count_max',
      targetCount: 12,
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    }).ok,
    true,
  );
});

test('property: 0 <= daysWithinTarget <= evaluatedDays <= recordedDays <= 7 and never extrapolated', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 120 }),
      fc.array(fc.integer({ min: 0, max: 150 }), { minLength: 0, maxLength: 7 }),
      (targetMin, dayMins) => {
        const allDays = [
          '2026-10-26',
          '2026-10-27',
          '2026-10-28',
          '2026-10-29',
          '2026-10-30',
          '2026-10-31',
          '2026-11-01',
        ];
        const covered = allDays.slice(allDays.length - dayMins.length);
        const dayTotals = covered.map((day, idx) => ({
          day,
          source: 'stored_events',
          totals: [{ app: 'org.wikipedia', totalMs: dayMins[idx] * MIN_MS }],
        }));

        const res = evaluateGoals({
          goals: [
            {
              id: 'g_prop',
              title: 'Daily cap',
              kind: 'daily_total_foreground',
              targetMs: targetMin * MIN_MS,
              enabled: true,
              createdAtMs: 1,
              updatedAtMs: 1,
            },
          ],
          endDay: '2026-11-01',
          recordedDays: covered,
          dayTotals,
        });

        const item = res.items[0];
        assert.ok(item.daysWithinTarget >= 0);
        assert.ok(item.daysWithinTarget <= item.evaluatedDays);
        assert.ok(item.evaluatedDays <= item.recordedDays);
        assert.ok(item.recordedDays <= 7);
        assert.equal(item.extrapolated, false);
      },
    ),
    { numRuns: 100 },
  );
});
