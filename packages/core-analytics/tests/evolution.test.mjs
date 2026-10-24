/**
 * packages/core-analytics/tests/evolution.test.mjs
 *
 * Tests for Round 19 + Round 20 device findings on IQS, system installers, and J4:
 *   - Why sheet never mentions "scaled to daily totals", and unspanned gaps
 *     (e.g. 39 orphan_background) never claim "No collection gaps".
 *   - Package installer excluded across Android & OEM package names and labels.
 *   - J4 Interest Evolution:
 *       * hidden below 3 distinct local days (empty, zero, 1 day, 2 days)
 *       * uses "Seen since YYYY-MM-DD (history starts ...)" — never "First seen"
 *       * never emits "New after ..." or 'new' trend on limited history
 *       * attaches "(limited history)" caveat on growing/fading below 14 days,
 *         and omits the caveat once 14+ distinct days exist
 *       * summary growing/fading counts match displayed rows 1-for-1
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

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
  FULL_EVOLUTION_DAYS,
} = core;

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const T0 = Date.parse('2026-10-21T09:00:00Z');

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
    { id: 's4', app: 'org.wikipedia', startMs: T0 + 95 * MIN_MS, endMs: T0 + 105 * MIN_MS },
    { id: 's5', app: 'com.whatsapp', startMs: T0 + 120 * MIN_MS, endMs: T0 + 130 * MIN_MS },
  ];
  const score = scoreIqs({
    window,
    sessions,
    gaps: [{ reason: 'orphan_background', count: 39 }],
    approximate: true,
  });

  assert.equal(score.max, 55, 'with 5+ sittings and 15+ min active (without 5 labels or vectors), usage-only max is 55');
  assert.ok(!score.confidence.reasons.some((r) => /No collection gaps/i.test(r)));
  assert.ok(score.confidence.reasons.some((r) => /39 unmatched OS events recorded/i.test(r)));
  assert.ok(!score.confidence.reasons.some((r) => /0 min unmeasured/i.test(r)));
  assert.ok(!score.confidence.reasons.some((r) => /scaled to daily totals/i.test(r)));
});

test('computeInterestEvolution: hidden on empty, zero-duration, single-event, and 1–2 day windows', () => {
  assert.equal(MIN_EVOLUTION_DAYS, 3);
  assert.equal(FULL_EVOLUTION_DAYS, 14);
  assert.equal(computeInterestEvolution({ sessions: [] }).hasHistory, false);
  assert.equal(
    computeInterestEvolution({
      sessions: [{ id: 'z1', app: 'org.wikipedia', startMs: T0, endMs: T0 }],
    }).hasHistory,
    false,
  );

  const singleEvent = computeInterestEvolution({
    sessions: [{ id: 's1', app: 'org.wikipedia', startMs: T0, endMs: T0 + 10 * MIN_MS }],
  });
  assert.equal(singleEvent.hasHistory, false);
  assert.equal(singleEvent.distinctDays, 1);
  assert.deepEqual(singleEvent.rows, []);

  const twoDays = computeInterestEvolution({
    sessions: [
      { id: 's1', app: 'org.wikipedia', startMs: T0, endMs: T0 + 10 * MIN_MS },
      { id: 's2', app: 'org.wikipedia', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 10 * MIN_MS },
    ],
  });
  assert.equal(twoDays.hasHistory, false);
  assert.equal(twoDays.distinctDays, 2);
});

test('computeInterestEvolution: 4-day window uses "Seen since ... (history starts)", omits "New after", and caveats growing/fading', () => {
  const sessions = [
    // Day 0 & Day 1: Reddit heavy earlier, then gone -> fading (limited history)
    { id: 'r1', app: 'com.reddit.frontpage', startMs: T0, endMs: T0 + 25 * MIN_MS },
    { id: 'r2', app: 'com.reddit.frontpage', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 25 * MIN_MS },
    // Day 0..3: Wikipedia growing -> growing (limited history)
    { id: 'w0', app: 'org.wikipedia', startMs: T0 + 60 * MIN_MS, endMs: T0 + 68 * MIN_MS },
    { id: 'w1', app: 'org.wikipedia', startMs: T0 + DAY_MS + 60 * MIN_MS, endMs: T0 + DAY_MS + 68 * MIN_MS },
    { id: 'w2', app: 'org.wikipedia', startMs: T0 + 2 * DAY_MS + 60 * MIN_MS, endMs: T0 + 2 * DAY_MS + 80 * MIN_MS },
    { id: 'w3', app: 'org.wikipedia', startMs: T0 + 3 * DAY_MS + 60 * MIN_MS, endMs: T0 + 3 * DAY_MS + 85 * MIN_MS },
    // Day 3 only: Obsidian opened on 1 day of a 4-day window -> steady (never called 'new')
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
  assert.equal(evo.limitedHistory, true);
  assert.equal(evo.distinctDays, 4);
  assert.equal(evo.historyStartDay, '2026-10-21');
  assert.equal(evo.lastDay, '2026-10-24');
  assert.ok(!evo.rows.some((r) => r.app.includes('packageinstaller')), 'Package installer must never appear in J4');

  const dumped = JSON.stringify(evo);
  assert.ok(!/first seen/i.test(dumped), 'must never say "First seen"');
  assert.ok(!/new after/i.test(dumped), 'must never say "New after"');

  const wiki = evo.rows.find((r) => r.app === 'org.wikipedia');
  const reddit = evo.rows.find((r) => r.app === 'com.reddit.frontpage');
  const obsidian = evo.rows.find((r) => r.app === 'md.obsidian');
  assert.ok(wiki && reddit && obsidian);

  assert.equal(wiki.seenSinceText, 'Seen since 2026-10-21 (history starts)');
  assert.equal(wiki.trend, 'growing');
  assert.equal(wiki.trendLabel, 'growing (limited history)');

  assert.equal(reddit.seenSinceText, 'Seen since 2026-10-21 (history starts)');
  assert.equal(reddit.trend, 'fading');
  assert.equal(reddit.trendLabel, 'fading (limited history)');

  assert.equal(obsidian.seenSinceText, 'Seen since 2026-10-24 (history starts 2026-10-21)');
  assert.equal(obsidian.trend, 'steady');
  assert.equal(obsidian.trendLabel, 'steady');

  assert.equal(evo.growingCount, 1);
  assert.equal(evo.fadedCount, 1);
  assert.match(evo.summaryLine, /History starts 2026-10-21 \(4 days, limited history\)/);
});

test('computeInterestEvolution: 14+ day window drops limited-history caveat', () => {
  const sessions = [];
  for (let d = 0; d < 14; d += 1) {
    const mins = d < 7 ? 5 : 20;
    sessions.push({
      id: `w_${d}`,
      app: 'org.wikipedia',
      startMs: T0 + d * DAY_MS,
      endMs: T0 + d * DAY_MS + mins * MIN_MS,
    });
  }
  const evo = computeInterestEvolution({ sessions, utcOffsetMinutes: 0 });
  assert.equal(evo.hasHistory, true);
  assert.equal(evo.limitedHistory, false);
  assert.equal(evo.rows[0].trendLabel, 'growing');
  assert.ok(!/limited history/i.test(evo.summaryLine));
});

test('computeInterestEvolution property: counts reconcile with shown rows and no NaN appears', () => {
  const sessionArb = fc.record({
    day: fc.integer({ min: 0, max: 20 }),
    offsetMin: fc.integer({ min: 0, max: 600 }),
    durSec: fc.integer({ min: 1, max: 3600 }),
    app: fc.constantFrom('org.wikipedia', 'com.whatsapp', 'md.obsidian', 'com.miui.packageinstaller'),
  });
  fc.assert(
    fc.property(fc.array(sessionArb, { maxLength: 60 }), (items) => {
      const sessions = items.map((it, idx) => {
        const startMs = T0 + it.day * DAY_MS + it.offsetMin * MIN_MS;
        return { id: `s_${idx}`, app: it.app, startMs, endMs: startMs + it.durSec * 1000 };
      });
      const res = computeInterestEvolution({ sessions, utcOffsetMinutes: 0, limit: 5 });
      assert.ok(!JSON.stringify(res).includes('NaN'));
      assert.equal(res.growingCount, res.rows.filter((r) => r.trend === 'growing').length);
      assert.equal(res.fadedCount, res.rows.filter((r) => r.trend === 'fading').length);
      assert.ok(!res.rows.some((r) => r.app === 'com.miui.packageinstaller'));
    }),
    { numRuns: 80 },
  );
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
  assert.equal(state.gaps.reduce((sum, g) => sum + g.count, 0), 1);

  await collectUsage(source, store, { now: T0 + 15 * MIN_MS });
  assert.equal(state.gaps.reduce((sum, g) => sum + g.count, 0), 1, 'overlap re-read must not inflate gap count');
});
