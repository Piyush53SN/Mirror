import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  scoreIqs,
  computeDiscoveryJourney,
  countExplicitLabels,
  isLabelingExcludedApp,
} = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-labels-consistency.mjs'),
});

const DAY_MS = 86_400_000;
const BASE_MS = Date.parse('2026-10-21T08:00:00.000Z'); // Day 1 (Oct 21)

test('reproduces and fixes the 79 historical scroll-labels vs 0 decisive labels on selectedDay bug', () => {
  // 4-day history: Oct 21 .. Oct 24.
  // Oct 22 has 79 accidental historical labels (23 intentional, 27 mindless, 29 unsure).
  // Oct 24 (selectedDay) has 0 labels — Why sheet reports 0 decisive labels.
  const sessions = [];
  const labelMap = {};

  // Day 1 (Oct 21): 2 sessions, unlabelled
  sessions.push({ id: 'd1_1', app: 'org.wikipedia', startMs: BASE_MS, endMs: BASE_MS + 60_000 });
  sessions.push({ id: 'd1_2', app: 'com.reddit.frontpage', startMs: BASE_MS + 120_000, endMs: BASE_MS + 240_000 });

  // Day 2 (Oct 22): 79 sessions labelled (23 intentional, 27 mindless, 29 unsure)
  const day2Base = BASE_MS + DAY_MS;
  for (let i = 0; i < 79; i += 1) {
    const id = `d2_${i}`;
    const startMs = day2Base + i * 300_000;
    sessions.push({
      id,
      app: i % 2 === 0 ? 'com.reddit.frontpage' : 'com.google.android.youtube',
      startMs,
      endMs: startMs + 45_000,
    });
    if (i < 23) labelMap[id] = 'intentional';
    else if (i < 23 + 27) labelMap[id] = 'mindless';
    else labelMap[id] = 'unsure';
  }

  // Day 3 (Oct 23): 2 sessions, unlabelled
  const day3Base = BASE_MS + 2 * DAY_MS;
  sessions.push({ id: 'd3_1', app: 'org.wikipedia', startMs: day3Base, endMs: day3Base + 90_000 });

  // Day 4 (Oct 24 = selectedDay): 3 sessions, 0 labels on non-excluded apps, plus 1 stray label on Calculator (utility excluded)
  const day4Start = Date.parse('2026-10-24T00:00:00.000Z');
  const day4End = day4Start + DAY_MS;
  const day4Sessions = [
    { id: 'd4_1', app: 'org.wikipedia', startMs: day4Start + 3_600_000, endMs: day4Start + 3_720_000 },
    { id: 'd4_2', app: 'com.reddit.frontpage', startMs: day4Start + 7_200_000, endMs: day4Start + 7_380_000 },
    { id: 'd4_calc', app: 'com.google.android.calculator', startMs: day4Start + 9_000_000, endMs: day4Start + 9_030_000 },
  ];
  sessions.push(...day4Sessions);
  // Even if a historical label existed on a utility app on Oct 24, both Why sheet and J9 skip it
  labelMap.d4_calc = 'intentional';

  const labelArray = Object.entries(labelMap).map(([sessionId, label]) => ({ sessionId, label }));

  const iqs = scoreIqs({
    window: { fromMs: day4Start, toMs: day4End },
    sessions: day4Sessions,
    labels: labelArray,
    utcOffsetMinutes: 0,
    approximate: true,
  });

  const discovery = computeDiscoveryJourney({
    sessions,
    intentLabels: labelMap,
    labelWindow: { fromMs: day4Start, toMs: day4End },
    utcOffsetMinutes: 0,
  });

  assert.equal(discovery.hasHistory, true);
  assert.equal(discovery.distinctDays, 4);
  assert.equal(iqs.confidence.labels, 0, 'Why sheet has 0 decisive labels on Oct 24');
  const deliberateFactor = iqs.factors.find((f) => f.id === 'deliberate_share');
  assert.ok(deliberateFactor.detail.includes('0 decisive labels'));
  assert.deepEqual(discovery.explicitLabels, {
    intentional: 0,
    mindless: 0,
    unsure: 0,
    decisive: 0,
    total: 0,
  });
  assert.equal(discovery.explicitLabels.decisive, iqs.confidence.labels);
});

test('isLabelingExcludedApp excludes system, installer, and utility packages consistently', () => {
  assert.equal(isLabelingExcludedApp('com.google.android.calculator'), true);
  assert.equal(isLabelingExcludedApp('com.google.android.dialer'), true);
  assert.equal(isLabelingExcludedApp('com.miui.packageinstaller'), true);
  assert.equal(isLabelingExcludedApp('com.oem.custom', 'Package installer'), true);
  assert.equal(isLabelingExcludedApp('org.wikipedia', 'Wikipedia'), false);
  assert.equal(isLabelingExcludedApp('com.reddit.frontpage', 'Reddit'), false);
});

test('property: scoreIqs Why-sheet decisive labels and computeDiscoveryJourney explicitLabels.decisive match 1-for-1 for any selectedDay', () => {
  const appArb = fc.constantFrom(
    'org.wikipedia',
    'com.reddit.frontpage',
    'com.google.android.youtube',
    'com.google.android.calculator', // utility excluded
    'com.miui.packageinstaller', // system/installer excluded
    'dev.mirror.app', // self excluded
  );
  const labelKindArb = fc.constantFrom('intentional', 'mindless', 'unsure', null);

  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          dayOffset: fc.integer({ min: 0, max: 5 }),
          minuteInDay: fc.integer({ min: 10, max: 1300 }),
          durSec: fc.integer({ min: 2, max: 900 }),
          app: appArb,
          lbl: labelKindArb,
        }),
        { minLength: 1, maxLength: 60 },
      ),
      fc.integer({ min: 0, max: 5 }),
      (items, selectedDayOffset) => {
        const day0Start = Date.parse('2026-10-20T00:00:00.000Z');
        const allSessions = [];
        const labelMap = {};

        items.forEach((it, idx) => {
          const id = `ses_${idx}`;
          const startMs = day0Start + it.dayOffset * DAY_MS + it.minuteInDay * 60_000;
          const endMs = startMs + it.durSec * 1000;
          allSessions.push({ id, app: it.app, startMs, endMs });
          if (it.lbl) labelMap[id] = it.lbl;
        });

        // Guarantee 3+ distinct valid days so computeDiscoveryJourney hasHistory is true
        for (let d = 0; d < 3; d += 1) {
          const startMs = day0Start + d * DAY_MS + 3_600_000 + d * 1000;
          allSessions.push({
            id: `anchor_${d}`,
            app: 'org.wikipedia',
            startMs,
            endMs: startMs + 30_000,
          });
        }

        const windowFrom = day0Start + selectedDayOffset * DAY_MS;
        const windowTo = windowFrom + DAY_MS;
        const daySessions = allSessions.filter((s) => s.endMs > windowFrom && s.startMs < windowTo);
        const labelArray = Object.entries(labelMap).map(([sessionId, label]) => ({ sessionId, label }));

        const iqs = scoreIqs({
          window: { fromMs: windowFrom, toMs: windowTo },
          sessions: daySessions,
          labels: labelArray,
          utcOffsetMinutes: 0,
        });

        const disc = computeDiscoveryJourney({
          sessions: allSessions,
          intentLabels: labelMap,
          labelWindow: { fromMs: windowFrom, toMs: windowTo },
          utcOffsetMinutes: 0,
        });

        const direct = countExplicitLabels(allSessions, labelMap, {
          window: { fromMs: windowFrom, toMs: windowTo },
        });

        assert.equal(disc.hasHistory, true);
        assert.equal(disc.explicitLabels.decisive, iqs.confidence.labels);
        assert.deepEqual(disc.explicitLabels, direct);
      },
    ),
    { numRuns: 150 },
  );
});
