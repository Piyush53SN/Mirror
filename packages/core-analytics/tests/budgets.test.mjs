/**
 * packages/core-analytics/tests/budgets.test.mjs
 *
 * Unit & fast-check property tests for Soft Attention Budgets (Tier D only):
 *   - Per-app & group time strictly from day-clipped foreground events / dayTotals,
 *     NEVER merged sitting spans (including midnight-straddling intervals & IST offset).
 *   - Shared system/launcher/Mirror/Settings/Play-Store/installer exclusion list.
 *   - Partial weeks (< 7 recorded days) marked partial (`isPartialWindow: true`) and
 *     NEVER extrapolated to 7 days.
 *   - Calm states (`within_budget` / `at_budget` / `over_budget` / `paused`) — zero
 *     streaks, zero red failure states, zero guilt copy, zero app-blocking fields.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-budgets.mjs'),
});

const {
  evaluateBudgets,
  validateBudgetDefinition,
  dayStartMs,
} = core;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

test('validateBudgetDefinition enforces app vs group, positive limitMs, and non-empty packages', () => {
  const validApp = validateBudgetDefinition({
    id: 'b_yt',
    name: 'YouTube',
    kind: 'app',
    packages: ['com.google.android.youtube'],
    period: 'daily',
    limitMs: 45 * MIN_MS,
    enabled: true,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
  });
  assert.equal(validApp.ok, true);

  const validGroup = validateBudgetDefinition({
    id: 'b_social',
    name: 'Social & Video',
    kind: 'group',
    packages: ['com.google.android.youtube', 'com.reddit.frontpage', 'com.google.android.youtube'],
    period: 'weekly',
    limitMs: 4 * HOUR_MS,
    enabled: true,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
  });
  assert.equal(validGroup.ok, true);
  assert.deepEqual(validGroup.value.packages, ['com.google.android.youtube', 'com.reddit.frontpage']);

  assert.equal(
    validateBudgetDefinition({
      id: 'bad_multi_app',
      name: 'Two apps as single app',
      kind: 'app',
      packages: ['com.a', 'com.b'],
      period: 'daily',
      limitMs: 30 * MIN_MS,
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    }).ok,
    false,
  );

  assert.equal(
    validateBudgetDefinition({
      id: 'bad_zero',
      name: 'Zero limit',
      kind: 'app',
      packages: ['com.a'],
      period: 'daily',
      limitMs: 0,
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    }).ok,
    false,
  );
});

test('daily & group budgets clip strictly at local midnight (+330 IST), union overlapping intervals, and exclude launchers/Settings', () => {
  const istOffset = 330; // +05:30 IST
  const oct31Start = dayStartMs('2026-10-31', istOffset);
  const nov01Start = dayStartMs('2026-11-01', istOffset);

  // 1) Cross-midnight YouTube interval: 23:40 IST Oct 31 -> 00:25 IST Nov 01 (20m yesterday, 25m today)
  // 2) Overlapping duplicate YouTube interval on Nov 01: 00:10 -> 00:25 IST (must NOT double count!)
  // 3) Reddit interval on Nov 01: 10:00 -> 10:15 IST (15m)
  // 4) Settings + Launcher intervals (must be excluded!)
  const events = [
    {
      kind: 'app_background',
      app: 'com.google.android.youtube',
      at: new Date(nov01Start + 25 * MIN_MS).toISOString(),
      duration_ms: 45 * MIN_MS, // starts 20m before Nov 01 IST midnight
    },
    {
      kind: 'app_background',
      app: 'com.google.android.youtube',
      at: new Date(nov01Start + 25 * MIN_MS).toISOString(),
      duration_ms: 15 * MIN_MS, // overlapping subset inside [00:10, 00:25]
    },
    {
      kind: 'app_background',
      app: 'com.reddit.frontpage',
      at: new Date(nov01Start + 10 * HOUR_MS + 15 * MIN_MS).toISOString(),
      duration_ms: 15 * MIN_MS,
    },
    {
      kind: 'app_background',
      app: 'com.android.settings',
      at: new Date(nov01Start + 11 * HOUR_MS + 30 * MIN_MS).toISOString(),
      duration_ms: 30 * MIN_MS,
    },
    {
      kind: 'app_background',
      app: 'com.custom.launcher',
      at: new Date(nov01Start + 12 * HOUR_MS + 20 * MIN_MS).toISOString(),
      duration_ms: 20 * MIN_MS,
    },
  ];
  assert.equal(nov01Start - oct31Start, 86_400_000);

  const summary = evaluateBudgets({
    budgets: [
      {
        id: 'yt_daily',
        name: 'YouTube',
        kind: 'app',
        packages: ['com.google.android.youtube'],
        period: 'daily',
        limitMs: 30 * MIN_MS,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      {
        id: 'group_daily',
        name: 'Video & Feeds',
        kind: 'group',
        packages: [
          'com.google.android.youtube',
          'com.reddit.frontpage',
          'com.android.settings',
          'com.custom.launcher',
        ],
        period: 'daily',
        limitMs: 35 * MIN_MS,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ],
    referenceDay: '2026-11-01',
    events,
    utcOffsetMinutes: istOffset,
    nowMs: nov01Start + 14 * HOUR_MS,
    ignorePackages: ['com.custom.launcher'],
    appLabels: {
      'com.google.android.youtube': 'YouTube',
      'com.reddit.frontpage': 'Reddit',
    },
  });

  assert.equal(summary.tier, 'D');
  const yt = summary.items.find((i) => i.id === 'yt_daily');
  assert.ok(yt);
  assert.equal(yt.usedMs, 25 * MIN_MS, 'only the 25m after Nov 01 IST midnight counts, with overlap deduped');
  assert.equal(yt.remainingMs, 5 * MIN_MS);
  assert.equal(yt.overMs, 0);
  assert.equal(yt.state, 'within_budget');
  assert.equal(yt.isProvisionalToday, true);

  const grp = summary.items.find((i) => i.id === 'group_daily');
  assert.ok(grp);
  assert.equal(grp.usedMs, 40 * MIN_MS, '25m YouTube + 15m Reddit; Settings and launcher excluded');
  assert.equal(grp.overMs, 5 * MIN_MS);
  assert.equal(grp.remainingMs, 0);
  assert.equal(grp.meterFillRatio, 1);
  assert.equal(grp.state, 'over_budget');
  assert.doesNotMatch(grp.summaryText, /fail|streak|warning|shame|block/i);
});

test('weekly budget marks < 7 recorded days as partial and NEVER extrapolates', () => {
  // Only 3 days recorded so far (20m/day = 60m total). A naive extrapolation would
  // multiply 60m * (7/3) = 140m and falsely push a 120m weekly budget into over_budget!
  const summary = evaluateBudgets({
    budgets: [
      {
        id: 'yt_weekly',
        name: 'YouTube weekly',
        kind: 'app',
        packages: ['com.google.android.youtube'],
        period: 'weekly',
        limitMs: 120 * MIN_MS,
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ],
    referenceDay: '2026-11-01',
    historyStartDay: '2026-10-30',
    dayTotals: [
      { day: '2026-10-30', source: 'stored_events', totals: [{ app: 'com.google.android.youtube', totalMs: 20 * MIN_MS }] },
      { day: '2026-10-31', source: 'os_bucket_approx', totals: [{ app: 'com.google.android.youtube', totalMs: 20 * MIN_MS }] },
      { day: '2026-11-01', source: 'os_events', totals: [{ app: 'com.google.android.youtube', totalMs: 20 * MIN_MS }] },
    ],
  });

  const item = summary.items[0];
  assert.equal(item.recordedDays, 3);
  assert.equal(item.expectedDays, 7);
  assert.equal(item.isPartialWindow, true);
  assert.equal(item.usedMs, 60 * MIN_MS, 'must equal exact 60m recorded, never 140m extrapolated');
  assert.equal(item.remainingMs, 60 * MIN_MS);
  assert.equal(item.state, 'within_budget');
  assert.equal(item.hasStoredDays, true);
  assert.equal(item.hasApproximateDays, true);
  assert.match(item.summaryText, /3 of 7 days \(partial week, not extrapolated\)/);
});

test('property: budget arithmetic satisfies remainingMs + overMs === |limitMs - usedMs| and meterFillRatio in [0, 1]', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 300 }),
      fc.array(fc.integer({ min: 0, max: 120 }), { minLength: 0, maxLength: 7 }),
      fc.constantFrom('daily', 'weekly'),
      (limitMin, dayMins, period) => {
        const limitMs = limitMin * MIN_MS;
        const baseDays = [
          '2026-10-26',
          '2026-10-27',
          '2026-10-28',
          '2026-10-29',
          '2026-10-30',
          '2026-10-31',
          '2026-11-01',
        ];
        const coveredDays = baseDays.slice(baseDays.length - dayMins.length);
        const dayTotals = coveredDays.map((day, idx) => ({
          day,
          source: 'stored_events',
          totals: [{ app: 'org.wikipedia', totalMs: dayMins[idx] * MIN_MS }],
        }));

        const res = evaluateBudgets({
          budgets: [
            {
              id: 'prop_b',
              name: 'Wiki',
              kind: 'app',
              packages: ['org.wikipedia'],
              period,
              limitMs,
              enabled: true,
              createdAtMs: 1,
              updatedAtMs: 1,
            },
          ],
          referenceDay: '2026-11-01',
          recordedDays: coveredDays,
          dayTotals,
        });

        const item = res.items[0];
        assert.ok(item.meterFillRatio >= 0 && item.meterFillRatio <= 1);
        assert.equal(item.remainingMs, Math.max(0, limitMs - item.usedMs));
        assert.equal(item.overMs, Math.max(0, item.usedMs - limitMs));
        if (period === 'weekly' && coveredDays.length < 7) {
          assert.equal(item.isPartialWindow, true);
        }
      },
    ),
    { numRuns: 100 },
  );
});
