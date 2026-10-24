import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { computeRabbitHoles, MIN_RABBIT_HOLE_DAYS } = await bundleTs(
  join(HERE, '..', 'src/index.ts'),
  { outfile: join(HERE, '.build', 'core-rabbithole.mjs') },
);

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const BASE_MS = Date.parse('2026-10-21T10:00:00.000Z');

/* ----------------------------------------------------- 4 standing edge cases --- */

test('edge: empty sessions returns hasHistory false and zero clusters without NaN', () => {
  const res = computeRabbitHoles({ sessions: [] });
  assert.equal(res.hasHistory, false);
  assert.equal(res.distinctDays, 0);
  assert.equal(res.clusterCount, 0);
  assert.equal(res.lateNightShare, 0);
  assert.deepEqual(res.clusters, []);
  assert.ok(res.capabilities.tierDCanDetect.length >= 3);
  assert.ok(res.capabilities.tierDCannotDetect.length >= 3);
});

test('edge: zero-duration sessions are ignored cleanly', () => {
  const sessions = [0, 1, 2, 3].map((d) => ({
    id: `z_${d}`,
    app: 'com.reddit.frontpage',
    startMs: BASE_MS + d * DAY_MS,
    endMs: BASE_MS + d * DAY_MS,
  }));
  const res = computeRabbitHoles({ sessions });
  assert.equal(res.hasHistory, false);
  assert.equal(res.distinctDays, 0);
  assert.equal(res.clusterCount, 0);
});

test('edge: single-event and 2-day windows stay below MIN_RABBIT_HOLE_DAYS (hasHistory false)', () => {
  const oneSession = [
    { id: 's1', app: 'com.reddit.frontpage', startMs: BASE_MS, endMs: BASE_MS + 2 * MIN_MS },
  ];
  assert.equal(computeRabbitHoles({ sessions: oneSession }).hasHistory, false);

  const twoDays = [
    { id: 'd1_1', app: 'com.reddit.frontpage', startMs: BASE_MS, endMs: BASE_MS + 2 * MIN_MS },
    { id: 'd1_2', app: 'com.reddit.frontpage', startMs: BASE_MS + 20 * MIN_MS, endMs: BASE_MS + 22 * MIN_MS },
    { id: 'd1_3', app: 'com.reddit.frontpage', startMs: BASE_MS + 40 * MIN_MS, endMs: BASE_MS + 42 * MIN_MS },
    { id: 'd2_1', app: 'org.wikipedia', startMs: BASE_MS + DAY_MS, endMs: BASE_MS + DAY_MS + 3 * MIN_MS },
  ];
  const res2 = computeRabbitHoles({ sessions: twoDays });
  assert.equal(res2.hasHistory, false);
  assert.equal(res2.distinctDays, 2);
  assert.equal(res2.minDays, MIN_RABBIT_HOLE_DAYS);
  assert.deepEqual(res2.clusters, []);
});

test('edge: all-sessions-under-8s across 4 days unlocks history with 0 clusters and no NaN', () => {
  const sessions = [];
  for (let d = 0; d < 4; d += 1) {
    const dayStart = BASE_MS + d * DAY_MS;
    for (let k = 0; k < 5; k += 1) {
      sessions.push({
        id: `b_${d}_${k}`,
        app: 'com.reddit.frontpage',
        startMs: dayStart + k * 5 * MIN_MS,
        endMs: dayStart + k * 5 * MIN_MS + 4_000, // 4s < 8s
      });
    }
  }
  const res = computeRabbitHoles({ sessions, utcOffsetMinutes: 0 });
  assert.equal(res.hasHistory, true);
  assert.equal(res.distinctDays, 4);
  assert.equal(res.limitedHistory, true);
  assert.equal(res.clusterCount, 0);
  assert.equal(res.lateNightShare, 0);
  assert.equal(Number.isNaN(res.lateNightShare), false);
});

/* ------------------------------------------- detection & boundary rules --- */

test('detects 3+ consecutive short sittings on same app within 60m, skips cross-app splits, long sittings, and utility/installer apps', () => {
  const d1 = Date.parse('2026-10-21T12:00:00.000Z');
  const d2 = Date.parse('2026-10-22T23:10:00.000Z'); // late-night 23:10 UTC
  const d3 = Date.parse('2026-10-23T14:00:00.000Z');
  const d4 = Date.parse('2026-10-24T15:00:00.000Z');

  const sessions = [
    // Day 1: Reddit -> Wikipedia -> Reddit -> Reddit (broken by Wikipedia -> max consecutive Reddit is 2, NOT a cluster)
    { id: 'd1_1', app: 'com.reddit.frontpage', startMs: d1, endMs: d1 + 2 * MIN_MS },
    { id: 'd1_2', app: 'org.wikipedia', startMs: d1 + 10 * MIN_MS, endMs: d1 + 12 * MIN_MS },
    { id: 'd1_3', app: 'com.reddit.frontpage', startMs: d1 + 20 * MIN_MS, endMs: d1 + 22 * MIN_MS },
    { id: 'd1_4', app: 'com.reddit.frontpage', startMs: d1 + 40 * MIN_MS, endMs: d1 + 42 * MIN_MS },

    // Day 2 (23:10 UTC, late night): 3 consecutive short Reddit sittings (2m, 3m, 2m, 20m apart) -> VALID CLUSTER!
    { id: 'd2_1', app: 'com.reddit.frontpage', startMs: d2, endMs: d2 + 2 * MIN_MS },
    { id: 'd2_2', app: 'com.reddit.frontpage', startMs: d2 + 22 * MIN_MS, endMs: d2 + 25 * MIN_MS },
    { id: 'd2_3', app: 'com.reddit.frontpage', startMs: d2 + 45 * MIN_MS, endMs: d2 + 47 * MIN_MS },

    // Day 3: 3 consecutive LONG sittings on YouTube (12m each, >= 5m) -> NOT short-return cluster
    { id: 'd3_1', app: 'com.google.android.youtube', startMs: d3, endMs: d3 + 12 * MIN_MS },
    { id: 'd3_2', app: 'com.google.android.youtube', startMs: d3 + 30 * MIN_MS, endMs: d3 + 42 * MIN_MS },
    { id: 'd3_3', app: 'com.google.android.youtube', startMs: d3 + 60 * MIN_MS, endMs: d3 + 72 * MIN_MS },

    // Day 4: 4 consecutive short opens on Calculator (utility) & Package installer -> MUST BE EXCLUDED!
    { id: 'd4_c1', app: 'com.google.android.calculator', startMs: d4, endMs: d4 + 30_000 },
    { id: 'd4_c2', app: 'com.google.android.calculator', startMs: d4 + 5 * MIN_MS, endMs: d4 + 5 * MIN_MS + 30_000 },
    { id: 'd4_c3', app: 'com.google.android.calculator', startMs: d4 + 10 * MIN_MS, endMs: d4 + 10 * MIN_MS + 30_000 },
    { id: 'd4_p1', app: 'com.miui.packageinstaller', startMs: d4 + 20 * MIN_MS, endMs: d4 + 20 * MIN_MS + 30_000 },
    // Anchor valid session on Day 4
    { id: 'd4_wiki', app: 'org.wikipedia', startMs: d4 + 60 * MIN_MS, endMs: d4 + 70 * MIN_MS },
  ];

  const res = computeRabbitHoles({
    sessions,
    intentLabels: {
      d2_1: 'intentional',
      d2_2: 'mindless',
    },
    labels: {
      'com.reddit.frontpage': 'Reddit',
      'org.wikipedia': 'Wikipedia',
      'com.google.android.youtube': 'YouTube',
    },
    utcOffsetMinutes: 0,
  });

  assert.equal(res.hasHistory, true);
  assert.equal(res.distinctDays, 4);
  assert.equal(res.limitedHistory, true);
  assert.equal(res.clusterCount, 1);
  assert.equal(res.totalClusterSittings, 3);
  assert.equal(res.totalClusterMs, 7 * MIN_MS);
  assert.equal(res.lateNightShare, 1, 'all 3 sittings occurred in 23:00-05:00 UTC');
  assert.deepEqual(res.clusterExplicitLabels, {
    intentional: 1,
    mindless: 1,
    unsure: 0,
    decisive: 2,
    total: 2,
  });
  assert.equal(res.clusters[0].label, 'Reddit');
  assert.equal(res.clusters[0].day, '2026-10-22');
  assert.ok(res.definitionText.includes('Search and save signals are unavailable on Tier D'));
});

test('property: invariants hold across arbitrary multi-day session streams', () => {
  const appArb = fc.constantFrom(
    'com.reddit.frontpage',
    'org.wikipedia',
    'com.google.android.youtube',
    'com.google.android.calculator',
    'com.miui.packageinstaller',
    'dev.mirror.app',
  );

  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          dayOffset: fc.integer({ min: 0, max: 16 }),
          minute: fc.integer({ min: 0, max: 1400 }),
          durSec: fc.integer({ min: 0, max: 900 }),
          app: appArb,
          lbl: fc.constantFrom('intentional', 'mindless', 'unsure', null),
        }),
        { minLength: 0, maxLength: 80 },
      ),
      (items) => {
        const sessions = [];
        const labelMap = {};
        items.forEach((it, idx) => {
          const id = `r_${idx}`;
          const startMs = BASE_MS + it.dayOffset * DAY_MS + it.minute * MIN_MS;
          const endMs = startMs + it.durSec * 1000;
          sessions.push({ id, app: it.app, startMs, endMs });
          if (it.lbl) labelMap[id] = it.lbl;
        });

        const res = computeRabbitHoles({
          sessions,
          intentLabels: labelMap,
          utcOffsetMinutes: 330,
        });

        assert.equal(Number.isNaN(res.lateNightShare), false);
        assert.ok(res.lateNightShare >= 0 && res.lateNightShare <= 1);
        assert.ok(res.clusterExplicitLabels.total <= res.totalClusterSittings);

        for (const c of res.clusters) {
          assert.ok(c.sittingCount >= 3);
          assert.notEqual(c.app, 'com.google.android.calculator');
          assert.notEqual(c.app, 'com.miui.packageinstaller');
          assert.notEqual(c.app, 'dev.mirror.app');
        }
      },
    ),
    { numRuns: 150 },
  );
});
