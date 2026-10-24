/**
 * packages/core-analytics/tests/evolution.test.mjs
 *
 * Tests for Round 19 device findings:
 *   - Finding (2): Why sheet never mentions "scaled to daily totals", and
 *     unspanned gaps (e.g. 39 orphan_background) never claim "No collection gaps".
 *   - Finding (3): Package installer excluded across Android & OEM package names
 *     and by resolved display label.
 *   - Finding (4): J4 Interest Evolution requires 3+ distinct local days of
 *     history (hidden when only today / 2 days exist), never duplicates today's
 *     totals, and never emits "needs reliable sessions" when open.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), { outfile: join(HERE, '.build', 'core-evo.mjs') });
const {
  computeInterestEvolution,
  isIgnoredSystemApp,
  scoreIqs,
  collectUsage,
  USAGE_EVENT_TYPE,
  MIN_EVOLUTION_DAYS,
} = core;

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const T0 = Date.parse('2026-10-20T09:00:00Z');

test('isIgnoredSystemApp: excludes Android and OEM Package installers by package and label', () => {
  assert.equal(isIgnoredSystemApp('com.android.packageinstaller'), true);
  assert.equal(isIgnoredSystemApp('com.google.android.packageinstaller'), true);
  assert.equal(isIgnoredSystemApp('com.miui.packageinstaller'), true);
  assert.equal(isIgnoredSystemApp('com.samsung.android.packageinstaller'), true);
  assert.equal(isIgnoredSystemApp('com.vendor.custom.packageinstaller'), true);
  assert.equal(isIgnoredSystemApp('com.oplus.appdetail'), true);
  assert.equal(isIgnoredSystemApp('com.unknown.oem.installer', 'Package installer'), true);
  assert.equal(isIgnoredSystemApp('com.unknown.oem.installer', 'package installer'), true);
  assert.equal(isIgnoredSystemApp('org.wikipedia', 'Wikipedia'), false);
  assert.equal(isIgnoredSystemApp('com.whatsapp', 'WhatsApp'), false);
});

test('scoreIqs confidence: 39 unspanned orphan gaps never say "No collection gaps", and approximate never says "scaled"', () => {
  const window = { fromMs: T0, toMs: T0 + DAY_MS };
  const sessions = [
    { id: 's1', app: 'com.whatsapp', startMs: T0 + 10 * MIN_MS, endMs: T0 + 25 * MIN_MS },
    { id: 's2', app: 'org.wikipedia', startMs: T0 + 40 * MIN_MS, endMs: T0 + 55 * MIN_MS },
    { id: 's3', app: 'com.whatsapp', startMs: T0 + 70 * MIN_MS, endMs: T0 + 80 * MIN_MS },
  ];
  const score = scoreIqs({
    window,
    sessions,
    gaps: [{ reason: 'orphan_background', count: 39 }],
    approximate: true,
  });

  assert.equal(score.max, 55, 'without 5 labels or vectors, usage-only max is 55');
  assert.ok(
    !score.confidence.reasons.some((r) => /No collection gaps/i.test(r)),
    `must not claim no gaps when 39 gaps exist: ${JSON.stringify(score.confidence.reasons)}`,
  );
  assert.ok(
    score.confidence.reasons.some((r) => /39 collection gaps recorded/i.test(r)),
    `must name the 39 collection gaps: ${JSON.stringify(score.confidence.reasons)}`,
  );
  assert.ok(
    !score.confidence.reasons.some((r) => /scaled to daily totals/i.test(r)),
    `must not say scaled to daily totals: ${JSON.stringify(score.confidence.reasons)}`,
  );
});

test('computeInterestEvolution: hidden when fewer than 3 distinct local days exist (empty, today only, 2 days)', () => {
  assert.equal(MIN_EVOLUTION_DAYS, 3);
  assert.equal(computeInterestEvolution({ sessions: [] }).hasHistory, false);

  const oneDay = computeInterestEvolution({
    sessions: [
      { id: 's1', app: 'org.wikipedia', startMs: T0, endMs: T0 + 10 * MIN_MS },
      { id: 's2', app: 'com.whatsapp', startMs: T0 + 30 * MIN_MS, endMs: T0 + 40 * MIN_MS },
    ],
  });
  assert.equal(oneDay.hasHistory, false);
  assert.equal(oneDay.distinctDays, 1);
  assert.deepEqual(oneDay.rows, []);

  const twoDays = computeInterestEvolution({
    sessions: [
      { id: 's1', app: 'org.wikipedia', startMs: T0, endMs: T0 + 10 * MIN_MS },
      { id: 's2', app: 'org.wikipedia', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 10 * MIN_MS },
    ],
  });
  assert.equal(twoDays.hasHistory, false);
  assert.equal(twoDays.distinctDays, 2);
});

test('computeInterestEvolution: computes first-seen day, active days, trend, and excludes installers across 4 days', () => {
  const sessions = [
    // Day 0 & Day 1: Reddit heavy earlier, then gone (fading)
    { id: 'r1', app: 'com.reddit.frontpage', startMs: T0, endMs: T0 + 25 * MIN_MS },
    { id: 'r2', app: 'com.reddit.frontpage', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 25 * MIN_MS },
    // Day 0..3: Wikipedia steady/growing
    { id: 'w0', app: 'org.wikipedia', startMs: T0 + 60 * MIN_MS, endMs: T0 + 68 * MIN_MS },
    { id: 'w1', app: 'org.wikipedia', startMs: T0 + DAY_MS + 60 * MIN_MS, endMs: T0 + DAY_MS + 68 * MIN_MS },
    { id: 'w2', app: 'org.wikipedia', startMs: T0 + 2 * DAY_MS + 60 * MIN_MS, endMs: T0 + 2 * DAY_MS + 80 * MIN_MS },
    { id: 'w3', app: 'org.wikipedia', startMs: T0 + 3 * DAY_MS + 60 * MIN_MS, endMs: T0 + 3 * DAY_MS + 85 * MIN_MS },
    // Day 3 only: Obsidian newly discovered
    { id: 'o3', app: 'md.obsidian', startMs: T0 + 3 * DAY_MS + 120 * MIN_MS, endMs: T0 + 3 * DAY_MS + 135 * MIN_MS },
    // Package installer on Day 2 (must be excluded)
    { id: 'pi', app: 'com.miui.packageinstaller', startMs: T0 + 2 * DAY_MS, endMs: T0 + 2 * DAY_MS + 2 * MIN_MS },
  ];

  const evo = computeInterestEvolution({
    sessions,
    utcOffsetMinutes: 0,
    labels: {
      'com.reddit.frontpage': 'Reddit',
      'org.wikipedia': 'Wikipedia',
      'md.obsidian': 'Obsidian',
      'com.miui.packageinstaller': 'Package installer',
    },
  });

  assert.equal(evo.hasHistory, true);
  assert.equal(evo.distinctDays, 4);
  assert.equal(evo.firstDay, '2026-10-20');
  assert.equal(evo.lastDay, '2026-10-23');
  assert.ok(!evo.rows.some((r) => r.app.includes('packageinstaller')), 'Package installer must never appear in J4');

  const wiki = evo.rows.find((r) => r.app === 'org.wikipedia');
  const reddit = evo.rows.find((r) => r.app === 'com.reddit.frontpage');
  const obsidian = evo.rows.find((r) => r.app === 'md.obsidian');
  assert.ok(wiki && reddit && obsidian);
  assert.equal(wiki.firstSeenDay, '2026-10-20');
  assert.equal(wiki.activeDays, 4);
  assert.equal(wiki.trend, 'growing');
  assert.equal(reddit.trend, 'fading');
  assert.equal(obsidian.firstSeenDay, '2026-10-23');
  assert.equal(obsidian.trend, 'new');
  assert.equal(evo.newlySeenCount, 1);
  assert.equal(evo.fadedCount, 1);
});

test('collectUsage: repeated syncs over 1h overlap do not double-count earlier orphan gaps', async () => {
  const orphanRow = { packageName: 'com.whatsapp', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: T0 + 5 * MIN_MS };
  const rows = [orphanRow];
  const state = { cursor: { at: null, open: [] }, gaps: [] };
  const store = {
    getCursorState: async () => ({ at: state.cursor.at, open: [...state.cursor.open] }),
    setCursorState: async (_s, next) => { state.cursor = next; },
    appendEvents: async () => ({ inserted: 0, duplicate: 0, rejected: [] }),
    recordGaps: async (_s, gaps) => { state.gaps.push(...gaps); },
  };
  const source = {
    hasPermission: async () => true,
    queryEvents: async (from, to) => rows.filter((r) => r.timeStamp >= from && r.timeStamp < to),
  };

  await collectUsage(source, store, { now: T0 + 10 * MIN_MS });
  const totalAfterFirst = state.gaps.reduce((sum, g) => sum + g.count, 0);
  assert.equal(totalAfterFirst, 1);

  // Second sync 5 minutes later re-reads 1h overlap containing orphanRow — must NOT record it again
  await collectUsage(source, store, { now: T0 + 15 * MIN_MS });
  const totalAfterSecond = state.gaps.reduce((sum, g) => sum + g.count, 0);
  assert.equal(totalAfterSecond, 1, 'overlap re-read must not inflate gap count');
});
