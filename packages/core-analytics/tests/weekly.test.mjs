/**
 * packages/core-analytics/tests/weekly.test.mjs
 *
 * Unit & fast-check property tests for the pure 7-local-day Weekly Report engine:
 *   - Per-app & daily foreground time strictly from day-clipped foreground events,
 *     NEVER merged sitting spans.
 *   - Partial weeks (< 7 days) marked partial (`isPartialWeek: true`, `extrapolated: false`)
 *     and never extrapolated.
 *   - Prior-week deltas locked below 14 distinct recorded days and unlocked at >= 14.
 *   - "your labels (Tier D feedback)" (never Tier A), >= 5 threshold, Not sure excluded.
 *   - Stored / Approximate day badges, raw-open Rabbit Hole loops, and 23:00–05:00 late night.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-weekly.mjs'),
});

const {
  computeWeeklyReport,
  WEEKLY_LABELS_ATTRIBUTION,
  dayStartMs,
} = core;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

test('per-app & daily foreground time uses day-clipped foreground events, NEVER merged sitting spans', () => {
  const dayStart = dayStartMs('2026-11-01', 0);
  // Two 4-minute Wikipedia opens separated by a 10-minute idle gap:
  //   Open 1: 10:00..10:04 (4m)
  //   Open 2: 10:14..10:18 (4m)
  // `sessionize` merges <=15m gaps into ONE 18-minute sitting (`10:00..10:18`).
  // Weekly report MUST report 8m foreground time and 1 sitting — NEVER 18m!
  const events = [
    {
      kind: 'app_background',
      app: 'org.wikipedia',
      at: new Date(dayStart + 10 * HOUR_MS + 4 * MIN_MS).toISOString(),
      duration_ms: 4 * MIN_MS,
    },
    {
      kind: 'app_background',
      app: 'org.wikipedia',
      at: new Date(dayStart + 10 * HOUR_MS + 18 * MIN_MS).toISOString(),
      duration_ms: 4 * MIN_MS,
    },
  ];
  const mergedSessions = [
    {
      id: 'ses_merged_18m',
      app: 'org.wikipedia',
      startMs: dayStart + 10 * HOUR_MS,
      endMs: dayStart + 10 * HOUR_MS + 18 * MIN_MS, // 18m merged span!
    },
  ];

  const report = computeWeeklyReport({
    endDay: '2026-11-01',
    historyStartDay: '2026-11-01',
    events,
    sessions: mergedSessions,
    utcOffsetMinutes: 0,
    appLabels: { 'org.wikipedia': 'Wikipedia' },
  });

  assert.equal(report.tier, 'D');
  assert.equal(report.totalForegroundMs, 8 * MIN_MS, 'must equal 8m foreground, NEVER 18m merged span');
  assert.equal(report.totalSittingCount, 1, 'merged sitting count stays 1');
  assert.equal(report.topApps.length, 1);
  assert.equal(report.topApps[0].foregroundMs, 8 * MIN_MS);
  assert.equal(report.topApps[0].sittingCount, 1);
  assert.equal(report.topApps[0].foregroundShare, 1);
});

test('partial week (< 7 recorded days) is marked partial, never extrapolated, and withholds prior-week delta', () => {
  // 4 recorded days (30m/day = 120m total). Never extrapolated to 210m!
  const report = computeWeeklyReport({
    endDay: '2026-11-01',
    historyStartDay: '2026-10-29',
    dayTotals: [
      { day: '2026-10-29', source: 'os_bucket_approx', totals: [{ app: 'com.whatsapp', totalMs: 30 * MIN_MS }] },
      { day: '2026-10-30', source: 'stored_events', totals: [{ app: 'com.whatsapp', totalMs: 30 * MIN_MS }] },
      { day: '2026-10-31', source: 'stored_events', totals: [{ app: 'com.whatsapp', totalMs: 30 * MIN_MS }] },
      { day: '2026-11-01', source: 'os_events', totals: [{ app: 'com.whatsapp', totalMs: 30 * MIN_MS }] },
    ],
  });

  assert.equal(report.recordedDays, 4);
  assert.equal(report.unrecordedDays, 3);
  assert.equal(report.isPartialWeek, true);
  assert.equal(report.extrapolated, false);
  assert.equal(report.totalForegroundMs, 120 * MIN_MS, 'exact 4-day sum, never extrapolated to 7 days');
  assert.equal(report.avgDailyForegroundMs, 30 * MIN_MS, 'daily average divides by 4 recorded days, not 7');
  assert.match(report.partialWeekNote, /Partial week \(4 of 7 days recorded\)/);
  assert.equal(report.hasStoredDays, true);
  assert.equal(report.hasApproximateDays, true);
  assert.equal(report.storedDayCount, 2);
  assert.equal(report.approximateDayCount, 1);
  assert.equal(report.perDay[0].badge, 'unrecorded');
  assert.equal(report.perDay[3].badge, 'approximate');
  assert.equal(report.perDay[4].badge, 'stored');
  assert.equal(report.perDay[6].badge, 'live');
  assert.equal(report.hasPriorWeekComparison, false);
  assert.equal(report.priorWeekComparison, null);
});

test('prior-week comparison stays locked at 13 days and unlocks at >= 14 recorded local days', () => {
  const makeDays = (count, endDayStr) => {
    const endMs = Date.parse(`${endDayStr}T00:00:00Z`);
    return Array.from({ length: count }, (_, idx) => {
      const day = new Date(endMs - (count - 1 - idx) * 86_400_000).toISOString().slice(0, 10);
      const isCurrentWeek = idx >= count - 7;
      return {
        day,
        source: 'stored_events',
        totals: [{ app: 'org.wikipedia', totalMs: (isCurrentWeek ? 40 : 50) * MIN_MS }],
      };
    });
  };

  const thirteen = computeWeeklyReport({
    endDay: '2026-11-01',
    recordedDays: makeDays(13, '2026-11-01').map((d) => d.day),
    dayTotals: makeDays(13, '2026-11-01'),
  });
  assert.equal(thirteen.distinctRecordedDaysTotal, 13);
  assert.equal(thirteen.hasPriorWeekComparison, false);
  assert.equal(thirteen.priorWeekComparison, null);
  assert.match(thirteen.priorWeekUnavailableReason, /14\+ recorded local days/);

  const fourteen = computeWeeklyReport({
    endDay: '2026-11-01',
    recordedDays: makeDays(14, '2026-11-01').map((d) => d.day),
    dayTotals: makeDays(14, '2026-11-01'),
  });
  assert.equal(fourteen.distinctRecordedDaysTotal, 14);
  assert.equal(fourteen.hasPriorWeekComparison, true);
  assert.ok(fourteen.priorWeekComparison);
  assert.equal(fourteen.priorWeekComparison.priorTotalForegroundMs, 350 * MIN_MS);
  assert.equal(fourteen.totalForegroundMs, 280 * MIN_MS);
  assert.equal(fourteen.priorWeekComparison.deltaForegroundMs, -70 * MIN_MS);
});

test('your labels (Tier D feedback): never called Tier A, requires >= 5 decisive labels, and excludes Not sure', () => {
  const dayStart = dayStartMs('2026-11-01', 0);
  const sessions = Array.from({ length: 7 }, (_, i) => ({
    id: `s_${i}`,
    app: 'org.wikipedia',
    startMs: dayStart + (9 + i) * HOUR_MS,
    endMs: dayStart + (9 + i) * HOUR_MS + 10 * MIN_MS,
  }));

  // 4 decisive + 3 unsure -> still below 5 decisive labels!
  const underThreshold = computeWeeklyReport({
    endDay: '2026-11-01',
    historyStartDay: '2026-11-01',
    dayTotals: [{ day: '2026-11-01', totals: [{ app: 'org.wikipedia', totalMs: 70 * MIN_MS }] }],
    sessions,
    intentLabels: {
      s_0: 'intentional',
      s_1: 'intentional',
      s_2: 'mindless',
      s_3: 'mindless',
      s_4: 'unsure',
      s_5: 'unsure',
      s_6: 'unsure',
    },
  });

  assert.equal(underThreshold.yourLabels.attribution, WEEKLY_LABELS_ATTRIBUTION);
  assert.equal(underThreshold.yourLabels.attribution, 'your labels (Tier D feedback)');
  assert.equal(underThreshold.yourLabels.tier, 'D');
  assert.equal(underThreshold.yourLabels.decisive, 4);
  assert.equal(underThreshold.yourLabels.unsure, 3);
  assert.equal(underThreshold.yourLabels.measurable, false);
  assert.equal(underThreshold.yourLabels.intentionalShare, null, 'must be null when unmeasured, never 0');
  assert.doesNotMatch(underThreshold.yourLabels.summaryText, /Tier A/i);

  // 5 decisive labels (4 intentional, 1 mindless) + 2 unsure -> 80% intentional!
  const unlocked = computeWeeklyReport({
    endDay: '2026-11-01',
    historyStartDay: '2026-11-01',
    dayTotals: [{ day: '2026-11-01', totals: [{ app: 'org.wikipedia', totalMs: 70 * MIN_MS }] }],
    sessions,
    intentLabels: {
      s_0: 'intentional',
      s_1: 'intentional',
      s_2: 'intentional',
      s_3: 'intentional',
      s_4: 'mindless',
      s_5: 'unsure',
      s_6: 'unsure',
    },
  });
  assert.equal(unlocked.yourLabels.measurable, true);
  assert.equal(unlocked.yourLabels.decisive, 5);
  assert.equal(unlocked.yourLabels.intentionalShare, 0.8);
  assert.match(unlocked.yourLabels.summaryText, /80% intentional/);
  assert.match(unlocked.yourLabels.summaryText, /your labels \(Tier D feedback\)/);
});

test('weekly report detects raw-open Rabbit Hole loops (5 opens >=8s over >30m across >=3 days) and 23:00–05:00 late-night foreground time', () => {
  const oct30Start = dayStartMs('2026-10-30', 0);
  const oct31Start = dayStartMs('2026-10-31', 0);
  const nov01Start = dayStartMs('2026-11-01', 0);
  // 5 consecutive Reddit opens on Oct 30 (2m each, 7m apart -> total span 38m > 30m, 4 returns)
  const rabbitEvents = Array.from({ length: 5 }, (_, idx) => {
    const start = oct30Start + 14 * HOUR_MS + idx * 9 * MIN_MS;
    const end = start + 2 * MIN_MS;
    return {
      kind: 'app_background',
      app: 'com.reddit.frontpage',
      at: new Date(end).toISOString(),
      duration_ms: 2 * MIN_MS,
    };
  });
  // Late-night YouTube open on Oct 30: 23:15..23:35 (20m)
  const lateEvent = {
    kind: 'app_background',
    app: 'com.google.android.youtube',
    at: new Date(oct30Start + 23 * HOUR_MS + 35 * MIN_MS).toISOString(),
    duration_ms: 20 * MIN_MS,
  };
  // Activity on Oct 31 & Nov 01 (5m each) so the >=3 local-day multi-day gate is met
  const extraDaysEvents = [
    {
      kind: 'app_background',
      app: 'org.wikipedia',
      at: new Date(oct31Start + 12 * HOUR_MS + 5 * MIN_MS).toISOString(),
      duration_ms: 5 * MIN_MS,
    },
    {
      kind: 'app_background',
      app: 'org.wikipedia',
      at: new Date(nov01Start + 12 * HOUR_MS + 5 * MIN_MS).toISOString(),
      duration_ms: 5 * MIN_MS,
    },
  ];

  const report = computeWeeklyReport({
    endDay: '2026-11-01',
    historyStartDay: '2026-10-30',
    events: [...rabbitEvents, lateEvent, ...extraDaysEvents],
    utcOffsetMinutes: 0,
  });

  assert.equal(report.rabbitHoleCount, 1);
  assert.equal(report.rabbitHoleClusters[0].returnCount, 4);
  assert.equal(report.lateNightForegroundMs, 20 * MIN_MS);
  assert.equal(report.totalForegroundMs, 40 * MIN_MS); // 5*2m + 20m + 5m + 5m
});

test('property: perDay foreground sum always equals totalForegroundMs and partial weeks never extrapolate', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 180 }), { minLength: 0, maxLength: 7 }),
      (mins) => {
        const allDays = [
          '2026-10-26',
          '2026-10-27',
          '2026-10-28',
          '2026-10-29',
          '2026-10-30',
          '2026-10-31',
          '2026-11-01',
        ];
        const covered = allDays.slice(allDays.length - mins.length);
        const dayTotals = covered.map((day, idx) => ({
          day,
          source: 'stored_events',
          totals: [{ app: 'org.wikipedia', totalMs: mins[idx] * MIN_MS }],
        }));

        const report = computeWeeklyReport({
          endDay: '2026-11-01',
          recordedDays: covered,
          dayTotals,
        });

        const sumDays = report.perDay.reduce((acc, d) => acc + d.foregroundMs, 0);
        const expected = mins.reduce((acc, m) => acc + m * MIN_MS, 0);
        assert.equal(report.totalForegroundMs, expected);
        assert.equal(sumDays, expected);
        assert.equal(report.extrapolated, false);
        assert.equal(report.isPartialWeek, covered.length < 7);
        for (const row of report.topApps) {
          assert.ok(row.foregroundShare >= 0 && row.foregroundShare <= 1);
        }
      },
    ),
    { numRuns: 100 },
  );
});
