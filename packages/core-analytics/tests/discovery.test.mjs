/**
 * packages/core-analytics/tests/discovery.test.mjs
 *
 * Tests for J9 Discovery Journey (`computeDiscoveryJourney`):
 *   1. Empty input -> hasHistory false, zero NaN
 *   2. Zero-duration sessions -> ignored, hasHistory false
 *   3. Single-event / single-day and 2-day windows -> hasHistory false
 *   4. All sessions under 8 s across 3+ days -> sustainedSessionCount 0, routes [], zero NaN
 *   5. Repeated cross-app handoff routes within 5 min across 4 days, brief <8s bounce skipped,
 *      gaps >5 min not paired, and system/installer/launcher packages excluded
 *   6. Honest Tier-D unavailable flags (New topics opened, Searches started), OS top app by time,
 *      explicit-labels-only counts, and limited-history flag (< 14 days vs >= 14 days)
 *   7. Property-based invariants via fast-check
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), { outfile: join(HERE, '.build', 'core-discovery.mjs') });
const { computeDiscoveryJourney, MIN_DISCOVERY_DAYS, FULL_DISCOVERY_DAYS } = core;

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const SEC_MS = 1_000;
const T0 = Date.parse('2026-10-21T10:00:00Z');

/* ------------------------------------------------------------------ edges --- */

test('edge 1 – empty: hasHistory false, no routes, unavailable Tier A/B/C fields, no NaN', () => {
  assert.equal(MIN_DISCOVERY_DAYS, 3);
  assert.equal(FULL_DISCOVERY_DAYS, 14);
  const res = computeDiscoveryJourney({ sessions: [] });
  assert.equal(res.hasHistory, false);
  assert.equal(res.distinctDays, 0);
  assert.deepEqual(res.routes, []);
  assert.equal(res.newTopicsOpened.value, 'unavailable');
  assert.deepEqual(res.newTopicsOpened.requiredTiers, ['A', 'B', 'C']);
  assert.equal(res.searchesStarted.value, 'unavailable');
  assert.deepEqual(res.searchesStarted.requiredTiers, ['C']);
  assert.ok(!JSON.stringify(res).includes('NaN'));
});

test('edge 2 – zero-duration sessions are ignored', () => {
  const res = computeDiscoveryJourney({
    sessions: [
      { id: 'z0', app: 'com.whatsapp', startMs: T0, endMs: T0 },
      { id: 'z1', app: 'org.wikipedia', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS },
      { id: 'z2', app: 'com.android.chrome', startMs: T0 + 2 * DAY_MS, endMs: T0 + 2 * DAY_MS },
    ],
  });
  assert.equal(res.hasHistory, false);
  assert.equal(res.distinctDays, 0);
  assert.equal(res.totalSessions, 0);
});

test('edge 3 – single-event and 2-day windows stay hidden (hasHistory false)', () => {
  const single = computeDiscoveryJourney({
    sessions: [{ id: 's1', app: 'org.wikipedia', startMs: T0, endMs: T0 + 10 * MIN_MS }],
  });
  assert.equal(single.hasHistory, false);
  assert.equal(single.distinctDays, 1);

  const twoDays = computeDiscoveryJourney({
    sessions: [
      { id: 's1', app: 'com.whatsapp', startMs: T0, endMs: T0 + 5 * MIN_MS },
      { id: 's2', app: 'com.android.chrome', startMs: T0 + 5 * MIN_MS + 10 * SEC_MS, endMs: T0 + 10 * MIN_MS },
      { id: 's3', app: 'com.whatsapp', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 5 * MIN_MS },
    ],
  });
  assert.equal(twoDays.hasHistory, false);
  assert.equal(twoDays.distinctDays, 2);
});

test('edge 4 – all sessions under 8 s across 3 days: sustainedSessionCount 0, routes empty, no NaN', () => {
  const res = computeDiscoveryJourney({
    sessions: [
      { id: 'b1', app: 'com.whatsapp', startMs: T0, endMs: T0 + 3 * SEC_MS },
      { id: 'b2', app: 'com.android.chrome', startMs: T0 + 5 * SEC_MS, endMs: T0 + 9 * SEC_MS },
      { id: 'b3', app: 'com.whatsapp', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 4 * SEC_MS },
      { id: 'b4', app: 'org.wikipedia', startMs: T0 + 2 * DAY_MS, endMs: T0 + 2 * DAY_MS + 7 * SEC_MS },
    ],
  });
  assert.equal(res.hasHistory, true);
  assert.equal(res.distinctDays, 3);
  assert.equal(res.sustainedSessionCount, 0);
  assert.equal(res.shortBounceCount, 4);
  assert.equal(res.totalHandoffs, 0);
  assert.deepEqual(res.routes, []);
  assert.equal(res.repeatSessionShare, 0);
  assert.ok(!JSON.stringify(res).includes('NaN'));
});

/* ----------------------------------------------------- multi-day behaviour --- */

test('4-day window: detects repeated A -> B handoffs within 5 min, skips <8s bounce & system installers, honours OS top app and explicit labels', () => {
  const sessions = [
    // Day 0: WhatsApp -> (2s bounce in custom tab) -> Chrome -> Wikipedia
    { id: 'd0_wa', app: 'com.whatsapp', startMs: T0, endMs: T0 + 3 * MIN_MS },
    { id: 'd0_bounce', app: 'org.mozilla.firefox', startMs: T0 + 3 * MIN_MS + SEC_MS, endMs: T0 + 3 * MIN_MS + 3 * SEC_MS },
    { id: 'd0_ch', app: 'com.android.chrome', startMs: T0 + 3 * MIN_MS + 4 * SEC_MS, endMs: T0 + 10 * MIN_MS },
    { id: 'd0_wk', app: 'org.wikipedia', startMs: T0 + 11 * MIN_MS, endMs: T0 + 20 * MIN_MS },

    // Day 1: WhatsApp -> Chrome within 30s; then 30 min gap before YouTube (must NOT pair Chrome -> YouTube)
    { id: 'd1_wa', app: 'com.whatsapp', startMs: T0 + DAY_MS, endMs: T0 + DAY_MS + 2 * MIN_MS },
    { id: 'd1_ch', app: 'com.android.chrome', startMs: T0 + DAY_MS + 2 * MIN_MS + 30 * SEC_MS, endMs: T0 + DAY_MS + 8 * MIN_MS },
    { id: 'd1_yt', app: 'com.google.android.youtube', startMs: T0 + DAY_MS + 40 * MIN_MS, endMs: T0 + DAY_MS + 55 * MIN_MS },

    // Day 2: WhatsApp -> Package installer -> Chrome -> Wikipedia
    { id: 'd2_wa', app: 'com.whatsapp', startMs: T0 + 2 * DAY_MS, endMs: T0 + 2 * DAY_MS + 4 * MIN_MS },
    { id: 'd2_pi', app: 'com.miui.packageinstaller', startMs: T0 + 2 * DAY_MS + 4 * MIN_MS + 2 * SEC_MS, endMs: T0 + 2 * DAY_MS + 4 * MIN_MS + 25 * SEC_MS },
    { id: 'd2_ch', app: 'com.android.chrome', startMs: T0 + 2 * DAY_MS + 4 * MIN_MS + 30 * SEC_MS, endMs: T0 + 2 * DAY_MS + 12 * MIN_MS },
    { id: 'd2_wk', app: 'org.wikipedia', startMs: T0 + 2 * DAY_MS + 13 * MIN_MS, endMs: T0 + 2 * DAY_MS + 25 * MIN_MS },

    // Day 3: Obsidian single sitting + launcher (launcher must be ignored)
    { id: 'd3_launcher', app: 'com.mi.android.globallauncher', startMs: T0 + 3 * DAY_MS, endMs: T0 + 3 * DAY_MS + MIN_MS },
    { id: 'd3_ob', app: 'md.obsidian', startMs: T0 + 3 * DAY_MS + MIN_MS, endMs: T0 + 3 * DAY_MS + 15 * MIN_MS },
  ];

  const res = computeDiscoveryJourney({
    sessions,
    osTotals: [
      { app: 'com.miui.packageinstaller', label: 'Package installer', totalMs: 99 * MIN_MS },
      { app: 'org.wikipedia', label: 'Wikipedia', totalMs: 42 * MIN_MS },
      { app: 'com.android.chrome', label: 'Chrome', totalMs: 28 * MIN_MS },
    ],
    intentLabels: {
      d0_wk: 'intentional',
      d2_wk: 'intentional',
      d1_yt: 'mindless',
      d2_pi: 'mindless', // attached to ignored installer -> must not count
    },
    labels: {
      'com.whatsapp': 'WhatsApp',
      'com.android.chrome': 'Chrome',
      'org.wikipedia': 'Wikipedia',
      'com.google.android.youtube': 'YouTube',
      'md.obsidian': 'Obsidian',
      'org.mozilla.firefox': 'Firefox',
      'com.miui.packageinstaller': 'Package installer',
    },
    ignorePackages: ['com.mi.android.globallauncher'],
    utcOffsetMinutes: 0,
  });

  assert.equal(res.hasHistory, true);
  assert.equal(res.limitedHistory, true);
  assert.equal(res.distinctDays, 4);
  assert.equal(res.historyStartDay, '2026-10-21');
  assert.equal(res.lastDay, '2026-10-24');

  // Repeated routes: WhatsApp -> Chrome (3x across 3 days) and Chrome -> Wikipedia (2x across 2 days)
  assert.equal(res.routes.length, 2);
  assert.deepEqual(
    res.routes.map((r) => ({ from: r.fromLabel, to: r.toLabel, count: r.count, days: r.activeDays })),
    [
      { from: 'WhatsApp', to: 'Chrome', count: 3, days: 3 },
      { from: 'Chrome', to: 'Wikipedia', count: 2, days: 2 },
    ],
  );
  assert.ok(!res.routes.some((r) => /installer|launcher|Firefox/i.test(`${r.fromLabel} ${r.toLabel}`)));

  // Top app by OS time skips Package installer and picks Wikipedia
  assert.deepEqual(res.topAppByTime, {
    app: 'org.wikipedia',
    label: 'Wikipedia',
    totalMs: 42 * MIN_MS,
    tier: 'D',
  });

  // Explicit labels count only valid user sessions (2 intentional, 1 mindless)
  assert.deepEqual(res.explicitLabels, {
    intentional: 2,
    mindless: 1,
    unsure: 0,
    total: 3,
  });

  // Repeat vs single-day apps: WhatsApp(3d), Chrome(3d), Wikipedia(2d) = 3 repeat; Firefox(1d), YouTube(1d), Obsidian(1d) = 3 single-day
  assert.equal(res.totalAppsVisited, 6);
  assert.equal(res.repeatAppsCount, 3);
  assert.equal(res.singleDayAppsCount, 3);
});

test('14+ day window clears limitedHistory flag', () => {
  const sessions = [];
  for (let d = 0; d < 14; d += 1) {
    sessions.push({
      id: `a_${d}`,
      app: 'com.whatsapp',
      startMs: T0 + d * DAY_MS,
      endMs: T0 + d * DAY_MS + 2 * MIN_MS,
    });
    sessions.push({
      id: `b_${d}`,
      app: 'com.android.chrome',
      startMs: T0 + d * DAY_MS + 2 * MIN_MS + 10 * SEC_MS,
      endMs: T0 + d * DAY_MS + 6 * MIN_MS,
    });
  }
  const res = computeDiscoveryJourney({ sessions, utcOffsetMinutes: 0 });
  assert.equal(res.hasHistory, true);
  assert.equal(res.limitedHistory, false);
  assert.equal(res.routes[0].count, 14);
  assert.equal(res.routes[0].activeDays, 14);
});

/* ----------------------------------------------------------- property test --- */

test('property: shares bounded [0,1], counts partition cleanly, routes >= 2, and zero NaN', () => {
  const sessionArb = fc.record({
    day: fc.integer({ min: 0, max: 18 }),
    offsetSec: fc.integer({ min: 0, max: 40_000 }),
    durSec: fc.integer({ min: 0, max: 1_800 }),
    app: fc.constantFrom(
      'com.whatsapp',
      'com.android.chrome',
      'org.wikipedia',
      'md.obsidian',
      'com.miui.packageinstaller',
      'dev.mirror.app',
    ),
  });

  fc.assert(
    fc.property(fc.array(sessionArb, { maxLength: 70 }), (items) => {
      const sessions = items.map((it, idx) => {
        const startMs = T0 + it.day * DAY_MS + it.offsetSec * SEC_MS;
        return { id: `ses_${idx}`, app: it.app, startMs, endMs: startMs + it.durSec * SEC_MS };
      });
      const res = computeDiscoveryJourney({ sessions, utcOffsetMinutes: 0 });
      assert.ok(!JSON.stringify(res).includes('NaN'));
      assert.ok(res.repeatSessionShare >= 0 && res.repeatSessionShare <= 1);
      if (res.hasHistory) {
        assert.equal(res.repeatAppsCount + res.singleDayAppsCount, res.totalAppsVisited);
        assert.equal(res.sustainedSessionCount + res.shortBounceCount, res.totalSessions);
        for (const rt of res.routes) {
          assert.ok(rt.count >= 2);
          assert.ok(rt.activeDays >= 1 && rt.activeDays <= res.distinctDays);
          assert.notEqual(rt.fromApp, rt.toApp);
          assert.notEqual(rt.fromApp, 'com.miui.packageinstaller');
          assert.notEqual(rt.toApp, 'com.miui.packageinstaller');
          assert.notEqual(rt.fromApp, 'dev.mirror.app');
          assert.notEqual(rt.toApp, 'dev.mirror.app');
        }
      } else {
        assert.deepEqual(res.routes, []);
      }
    }),
    { numRuns: 100 },
  );
});
