import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { computeRabbitHoles, sessionize, MIN_RABBIT_HOLE_DAYS } = await bundleTs(
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

test('enforces Rabbit Hole spec bar: 4+ returns (5+ sittings) AND combined session > 30 min, skipping cross-app splits and utility/installer apps', () => {
  const d1 = Date.parse('2026-10-21T12:00:00.000Z');
  const d2 = Date.parse('2026-10-22T23:05:00.000Z'); // late-night UTC
  const d3 = Date.parse('2026-10-23T14:00:00.000Z');
  const d4 = Date.parse('2026-10-24T15:00:00.000Z');

  const sessions = [
    // Day 1: 3 returns (4 sittings) totalling 40m (> 30m, < 4 returns) -> NOT a cluster!
    { id: 'd1_1', app: 'com.reddit.frontpage', startMs: d1, endMs: d1 + 10 * MIN_MS },
    { id: 'd1_2', app: 'com.reddit.frontpage', startMs: d1 + 15 * MIN_MS, endMs: d1 + 25 * MIN_MS },
    { id: 'd1_3', app: 'com.reddit.frontpage', startMs: d1 + 30 * MIN_MS, endMs: d1 + 40 * MIN_MS },
    { id: 'd1_4', app: 'com.reddit.frontpage', startMs: d1 + 45 * MIN_MS, endMs: d1 + 55 * MIN_MS },

    // Day 2 (late night): 4 returns (5 consecutive Reddit sittings: 7m, 8m, 6m, 7m, 7m = 35m > 30m) -> VALID CLUSTER!
    { id: 'd2_1', app: 'com.reddit.frontpage', startMs: d2, endMs: d2 + 7 * MIN_MS },
    { id: 'd2_2', app: 'com.reddit.frontpage', startMs: d2 + 12 * MIN_MS, endMs: d2 + 20 * MIN_MS },
    { id: 'd2_3', app: 'com.reddit.frontpage', startMs: d2 + 26 * MIN_MS, endMs: d2 + 32 * MIN_MS },
    { id: 'd2_4', app: 'com.reddit.frontpage', startMs: d2 + 38 * MIN_MS, endMs: d2 + 45 * MIN_MS },
    { id: 'd2_5', app: 'com.reddit.frontpage', startMs: d2 + 50 * MIN_MS, endMs: d2 + 57 * MIN_MS },

    // Day 3: 4 returns (5 opens) spanning EXACTLY 30m (0..30m, NOT strictly > 30m) -> NOT a cluster!
    { id: 'd3_1', app: 'com.google.android.youtube', startMs: d3, endMs: d3 + 4 * MIN_MS },
    { id: 'd3_2', app: 'com.google.android.youtube', startMs: d3 + 7 * MIN_MS, endMs: d3 + 11 * MIN_MS },
    { id: 'd3_3', app: 'com.google.android.youtube', startMs: d3 + 14 * MIN_MS, endMs: d3 + 18 * MIN_MS },
    { id: 'd3_4', app: 'com.google.android.youtube', startMs: d3 + 21 * MIN_MS, endMs: d3 + 25 * MIN_MS },
    { id: 'd3_5', app: 'com.google.android.youtube', startMs: d3 + 26 * MIN_MS, endMs: d3 + 30 * MIN_MS },

    // Day 4: 5 consecutive opens > 30m on Calculator (utility) & Package installer -> MUST BE EXCLUDED!
    { id: 'd4_c1', app: 'com.google.android.calculator', startMs: d4, endMs: d4 + 8 * MIN_MS },
    { id: 'd4_c2', app: 'com.google.android.calculator', startMs: d4 + 10 * MIN_MS, endMs: d4 + 18 * MIN_MS },
    { id: 'd4_c3', app: 'com.google.android.calculator', startMs: d4 + 20 * MIN_MS, endMs: d4 + 28 * MIN_MS },
    { id: 'd4_c4', app: 'com.google.android.calculator', startMs: d4 + 30 * MIN_MS, endMs: d4 + 38 * MIN_MS },
    { id: 'd4_c5', app: 'com.google.android.calculator', startMs: d4 + 40 * MIN_MS, endMs: d4 + 48 * MIN_MS },
    { id: 'd4_p1', app: 'com.miui.packageinstaller', startMs: d4 + 50 * MIN_MS, endMs: d4 + 52 * MIN_MS },
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
  assert.equal(res.totalClusterSittings, 5);
  assert.equal(res.clusters[0].returnCount, 4);
  assert.equal(res.totalClusterMs, 35 * MIN_MS);
  assert.ok(res.lateNightShare > 0.9, 'cluster occurred inside 23:00-05:00 UTC');
  assert.deepEqual(res.clusterExplicitLabels, {
    intentional: 1,
    mindless: 1,
    unsure: 0,
    decisive: 2,
    total: 2,
  });
  assert.equal(res.clusters[0].label, 'Reddit');
  assert.equal(res.clusters[0].day, '2026-10-22');
  assert.match(res.definitionText, /4\+ returns/);
  assert.match(res.definitionText, /over 30 minutes/);
  // Must be stated in ONE plain sentence (exactly one sentence-ending period)
  assert.equal((res.definitionText.match(/\./g) ?? []).length, 1, 'definitionText must be one plain sentence');
});

test('synthetic spec test: 5 raw opens of 40 s to 4 min within 50 min (spanning over 30 min total) MUST fire before 15-min merging', () => {
  // Day 0 & Day 1 anchor multi-day history (MIN_RABBIT_HOLE_DAYS = 3)
  const rawEvents = [];
  const pushOpen = (id, app, startMs, durMs) => {
    rawEvents.push({
      schema_version: 1,
      id: `fg_${id}`,
      kind: 'app_foreground',
      at: new Date(startMs).toISOString(),
      tier: 'D',
      origin: 'os',
      content: 'metadata',
      app,
    });
    rawEvents.push({
      schema_version: 1,
      id: `bg_${id}`,
      kind: 'app_background',
      at: new Date(startMs + durMs).toISOString(),
      tier: 'D',
      origin: 'os',
      content: 'metadata',
      app,
      duration_ms: durMs,
    });
  };

  pushOpen('d0_wk', 'org.wikipedia', BASE_MS, 5 * MIN_MS);
  pushOpen('d1_wk', 'org.wikipedia', BASE_MS + DAY_MS, 6 * MIN_MS);

  // Day 2: 5 opens of YouTube, each strictly between 40 s and 4 min, all gaps < 15 min,
  // spanning 43m 40s (> 30 min AND <= 50 min):
  //   Open 1: t = 00:00 .. 02:00 (2m 00s)
  //   Open 2: t = 10:00 .. 13:30 (3m 30s, gap 8m 00s)
  //   Open 3: t = 21:00 .. 25:00 (4m 00s, gap 7m 30s)
  //   Open 4: t = 33:00 .. 33:40 (0m 40s, gap 8m 00s)
  //   Open 5: t = 41:50 .. 43:40 (1m 50s, gap 8m 10s)
  const d2 = BASE_MS + 2 * DAY_MS;
  pushOpen('yt_1', 'com.google.android.youtube', d2, 2 * MIN_MS);
  pushOpen('yt_2', 'com.google.android.youtube', d2 + 10 * MIN_MS, 3.5 * MIN_MS);
  pushOpen('yt_3', 'com.google.android.youtube', d2 + 21 * MIN_MS, 4 * MIN_MS);
  pushOpen('yt_4', 'com.google.android.youtube', d2 + 33 * MIN_MS, 40_000);
  pushOpen('yt_5', 'com.google.android.youtube', d2 + 41 * MIN_MS + 50_000, 110_000);

  // Prove why the old post-merge detector failed: sessionize merges all 5 opens into 1 sitting!
  const { sessions: merged } = sessionize(rawEvents);
  const scoredMerged = merged.map((s) => ({ id: s.id, app: s.app, startMs: s.startMs, endMs: s.endMs }));
  const ytMerged = scoredMerged.filter((s) => s.app === 'com.google.android.youtube');
  assert.equal(ytMerged.length, 1, 'sessionize merges <=15m same-app reopens into 1 sitting');

  const postMergeOnly = computeRabbitHoles({ sessions: scoredMerged, utcOffsetMinutes: 0 });
  assert.equal(postMergeOnly.clusterCount, 0, 'running only on merged sittings misses <=15m return loops');

  // Running on raw opens (`events`) BEFORE merging MUST fire!
  const res = computeRabbitHoles({
    events: rawEvents,
    sessions: scoredMerged,
    intentLabels: { [ytMerged[0].id]: 'mindless' },
    labels: { 'com.google.android.youtube': 'YouTube', 'org.wikipedia': 'Wikipedia' },
    utcOffsetMinutes: 0,
  });

  assert.equal(res.hasHistory, true);
  assert.equal(res.clusterCount, 1, '5 raw opens of 40s..4m within 50m (>30m span) MUST fire');
  const cluster = res.clusters[0];
  assert.equal(cluster.app, 'com.google.android.youtube');
  assert.equal(cluster.label, 'YouTube');
  assert.equal(cluster.openCount, 5);
  assert.equal(cluster.returnCount, 4);
  assert.equal(cluster.spanMs, 43 * MIN_MS + 40_000);
  assert.ok(cluster.spanMs > 30 * MIN_MS && cluster.spanMs <= 50 * MIN_MS);
  // Foreground time is exact sum of open durations (2m + 3m30s + 4m + 40s + 1m50s = 12m), never inflated by idle gaps
  assert.equal(cluster.totalForegroundMs, 12 * MIN_MS);
  assert.equal(cluster.explicitLabels.mindless, 1, 'label on merged sitting carries onto overlapping raw-open cluster');
  assert.equal((res.definitionText.match(/\./g) ?? []).length, 1, 'definition is one plain sentence');
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
          assert.ok(c.openCount >= 5);
          assert.ok(c.sittingCount >= 5);
          assert.ok(c.returnCount >= 4);
          assert.ok(c.spanMs > 30 * MIN_MS);
          assert.ok(c.totalForegroundMs > 0);
          assert.notEqual(c.app, 'com.google.android.calculator');
          assert.notEqual(c.app, 'com.miui.packageinstaller');
          assert.notEqual(c.app, 'dev.mirror.app');
        }
      },
    ),
    { numRuns: 150 },
  );
});
