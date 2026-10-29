import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-validate.mjs') });
const {
  validateDailyTotals,
  evaluateAppOsDiscrepancies,
  isWithinDailyTotalTolerance,
  dailyTotalToleranceMs,
  mirrorTotalsFromRawEvents,
  DEVICE_FIXTURE_OS,
  DEVICE_FIXTURE_MIRROR_BUGGY,
} = core;

const rawRows = JSON.parse(readFileSync(join(HERE, 'fixtures/device-day-raw.json'), 'utf8'));
const osFixture = JSON.parse(readFileSync(join(HERE, 'fixtures/device-day-os.json'), 'utf8'));

test('buggy fixture fails validation >10% (WhatsApp 39m vs 12m, Brawl 42m vs 7m)', () => {
  const result = validateDailyTotals(DEVICE_FIXTURE_MIRROR_BUGGY, DEVICE_FIXTURE_OS);
  assert.equal(result.ok, false, 'buggy totals should not be ok');
  assert.ok(result.maxAbsPct > 100, `expected huge diff, got ${result.maxAbsPct}%`);
  const whatsapp = result.rows.find((r) => r.app === 'com.whatsapp');
  assert.ok(whatsapp, 'whatsapp row present');
  assert.ok(Math.abs(whatsapp.diffPct) > 200, `whatsapp diff should be >200%, got ${whatsapp.diffPct}`);
  assert.ok(result.overThreshold.length >= 2, 'at least 2 apps over threshold');
});

test('replay fixture from real device day passes within max(10%, 60s)', () => {
  // Window covering the raw fixture day
  const sinceMs = Math.min(...rawRows.map((r) => r.timeStamp)) - 1000;
  const untilMs = Math.max(...rawRows.map((r) => r.timeStamp)) + 1000;
  const mirrorTotals = mirrorTotalsFromRawEvents(rawRows, { sinceMs, untilMs });
  const result = validateDailyTotals(mirrorTotals, osFixture);
  // Should be ok within max(10%, 60s) after fixes (single foreground, launcher closer, STOPPED as bg)
  assert.equal(result.ok, true, `replay should be ok, got max ${result.maxAbsPct.toFixed(1)}% / ${result.maxAbsMs}ms over: ${result.overThreshold.map((r) => `${r.app} ${r.diffPct.toFixed(1)}% ${r.diffMs}ms`).join(', ')}`);
  assert.ok(result.maxAbsMs <= 60000 || result.maxAbsPct <= 10, `should be within max(10%,60s), got ${result.maxAbsPct}% ${result.maxAbsMs}ms`);
  // Ensure totals match OS within tolerance
  for (const row of result.rows) {
    const tolMs = Math.max((10 / 100) * row.osMs, 60000);
    assert.ok(Math.abs(row.diffMs) <= tolMs, `${row.app} diff ${row.diffMs}ms should be <= max(10%,60s)=${tolMs}ms (OS ${row.osMs}, Mirror ${row.mirrorMs})`);
  }
});

test('fixed fixture via replay matches OS fixture', () => {
  const sinceMs = Math.min(...rawRows.map((r) => r.timeStamp)) - 1000;
  const untilMs = Math.max(...rawRows.map((r) => r.timeStamp)) + 1000;
  const mirrorTotals = mirrorTotalsFromRawEvents(rawRows, { sinceMs, untilMs });
  // Mirror totals should be close to OS fixture (which is same as device-day-os.json)
  const result = validateDailyTotals(mirrorTotals, DEVICE_FIXTURE_OS);
  assert.equal(result.ok, true, `replay vs DEVICE_FIXTURE_OS should be ok`);
});

test('empty OS data is ok (no comparison)', () => {
  const result = validateDailyTotals([{ app: 'com.a', totalMs: 1000 }], []);
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 0);
});

test('exact match is ok', () => {
  const result = validateDailyTotals([{ app: 'com.a', totalMs: 60000 }], [{ packageName: 'com.a', totalMs: 60000 }]);
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].diffPct, 0);
});

test('max(10%, 60s) tolerance: small OS total allows 60s absolute', () => {
  // OS 30s, Mirror 80s: diff 50s, pct 166% but abs 50s <60s so ok
  const result = validateDailyTotals([{ app: 'com.a', totalMs: 80000 }], [{ packageName: 'com.a', totalMs: 30000 }]);
  assert.equal(result.ok, true, '50s diff on 30s OS should be ok via 60s absolute tolerance');
  // OS 30s, Mirror 100s: diff 70s >60s and >10% so fail
  const result2 = validateDailyTotals([{ app: 'com.a', totalMs: 100000 }], [{ packageName: 'com.a', totalMs: 30000 }]);
  assert.equal(result2.ok, false, '70s diff should fail');
});

test('validateDailyTotals catches dropped OS apps (0m vs 47m) and phantom Mirror apps (78m vs 0m) when OS data exists', () => {
  const MIN = 60_000;
  const res = validateDailyTotals(
    [
      { app: 'com.google.android.youtube', totalMs: 36 * MIN },
      { app: 'com.phantom.app', totalMs: 78 * MIN }, // Mirror has 78m, OS has 0m
    ],
    [
      { packageName: 'com.google.android.youtube', totalMs: 36 * MIN },
      { packageName: 'com.openai.chatgpt', totalMs: 47 * MIN }, // OS has 47m, Mirror dropped to 0m
    ],
  );
  assert.equal(res.ok, false);
  assert.equal(res.overThreshold.length, 2);
  const dropped = res.overThreshold.find((r) => r.app === 'com.openai.chatgpt');
  const phantom = res.overThreshold.find((r) => r.app === 'com.phantom.app');
  assert.equal(dropped?.status, 'under');
  assert.equal(dropped?.diffMs, -47 * MIN);
  assert.equal(phantom?.status, 'over');
  assert.equal(phantom?.diffMs, 78 * MIN);
});

test('evaluateAppOsDiscrepancies flags ChatGPT 78m vs OS 47m (> max(10%, 60s)) across Stored, Day fg, and independent OS UsageStats while matching apps pass', () => {
  const MIN = 60_000;
  const CHATGPT = 'com.openai.chatgpt';
  const YOUTUBE = 'com.google.android.youtube';
  const DISCORD = 'com.discord';
  const WHATSAPP = 'com.whatsapp';
  const BRAWL = 'com.supercell.brawlstars';
  const labels = {
    [CHATGPT]: 'ChatGPT',
    [YOUTUBE]: 'YouTube',
    [DISCORD]: 'Discord',
    [WHATSAPP]: 'WhatsApp',
    [BRAWL]: 'Brawl Stars',
  };

  assert.equal(dailyTotalToleranceMs(47 * MIN), 4.7 * MIN);
  assert.equal(isWithinDailyTotalTolerance(78 * MIN, 47 * MIN), false);
  assert.equal(isWithinDailyTotalTolerance(51 * MIN, 47 * MIN), true);

  // Case 1: Self-comparison blind spot closed — even if Home, Day fg, and Stored all reported 78m
  // while independent same-day OS UsageStats reported 47m, ChatGPT is flagged automatically!
  const flaggedFromOsStats = evaluateAppOsDiscrepancies({
    displayedTotals: [
      { app: CHATGPT, totalMs: 78 * MIN },
      { app: YOUTUBE, totalMs: 36 * MIN },
      { app: DISCORD, totalMs: 19 * MIN },
      { app: WHATSAPP, totalMs: 15 * MIN },
      { app: BRAWL, totalMs: 22 * MIN },
    ],
    dayFgTotals: [
      { packageName: CHATGPT, totalMs: 78 * MIN },
      { packageName: YOUTUBE, totalMs: 36 * MIN },
      { packageName: DISCORD, totalMs: 19 * MIN },
      { packageName: WHATSAPP, totalMs: 15 * MIN },
      { packageName: BRAWL, totalMs: 22 * MIN },
    ],
    storedTotals: [
      { packageName: CHATGPT, totalMs: 78 * MIN },
      { packageName: YOUTUBE, totalMs: 36 * MIN },
      { packageName: DISCORD, totalMs: 19 * MIN },
      { packageName: WHATSAPP, totalMs: 15 * MIN },
      { packageName: BRAWL, totalMs: 22 * MIN },
    ],
    rawBucketDiagnostics: [
      { packageName: CHATGPT, totalMs: 47 * MIN, preMidnightBucketMs: 0, bucketCount: 1 },
      { packageName: YOUTUBE, totalMs: 36 * MIN, preMidnightBucketMs: 0, bucketCount: 1 },
      { packageName: DISCORD, totalMs: 19 * MIN, preMidnightBucketMs: 0, bucketCount: 1 },
      { packageName: WHATSAPP, totalMs: 15 * MIN, preMidnightBucketMs: 0, bucketCount: 1 },
      { packageName: BRAWL, totalMs: 22 * MIN, preMidnightBucketMs: 0, bucketCount: 1 },
    ],
    labels,
  });
  assert.equal(flaggedFromOsStats.length, 1, 'only ChatGPT exceeds max(10%, 60s)');
  assert.equal(flaggedFromOsStats[0].app, CHATGPT);
  assert.equal(flaggedFromOsStats[0].label, 'ChatGPT');
  assert.equal(flaggedFromOsStats[0].status, 'over');
  assert.equal(flaggedFromOsStats[0].comparison, 'Home vs OS UsageStats');
  assert.equal(flaggedFromOsStats[0].diffMs, 31 * MIN);

  // Case 2: Leftover stored intervals (Stored = 78m while Day fg = 47m and Home = 47m) -> flagged!
  const flaggedFromStored = evaluateAppOsDiscrepancies({
    displayedTotals: [{ app: CHATGPT, totalMs: 47 * MIN }],
    dayFgTotals: [{ packageName: CHATGPT, totalMs: 47 * MIN }],
    storedTotals: [{ packageName: CHATGPT, totalMs: 78 * MIN }],
    rawBucketDiagnostics: [{ packageName: CHATGPT, totalMs: 47 * MIN, preMidnightBucketMs: 0, bucketCount: 1 }],
    labels,
  });
  assert.equal(flaggedFromStored.length, 1);
  assert.equal(flaggedFromStored[0].comparison, 'Stored vs OS UsageEvents');
  assert.equal(flaggedFromStored[0].diffMs, 31 * MIN);

  // Case 3: Clean post-fix state where Home=47m, Day fg=47m, Stored=47m, and Raw INTERVAL_DAILY=78m
  // solely from pre-midnight bucket bleed (preMidnightBucketMs = 31m > 0, sameDayBucketMs = 47m) -> 0 false flags!
  const cleanWithBleed = evaluateAppOsDiscrepancies({
    displayedTotals: [{ app: CHATGPT, totalMs: 47 * MIN }],
    dayFgTotals: [{ packageName: CHATGPT, totalMs: 47 * MIN }],
    storedTotals: [{ packageName: CHATGPT, totalMs: 47 * MIN }],
    rawBucketDiagnostics: [{ packageName: CHATGPT, totalMs: 78 * MIN, preMidnightBucketMs: 31 * MIN, sameDayBucketMs: 47 * MIN, bucketCount: 2 }],
    labels,
  });
  assert.equal(cleanWithBleed.length, 0, 'pre-midnight bucket bleed does not false-flag when Mirror matches OS UsageEvents');

  // Case 4: Real IST (UTC+05:30) scenario where ChatGPT was ALSO used yesterday (preMidnightBucketMs = 40m)
  // AND today's OS bucket is 47m (totalMs = 87m > displayedMs 78m), while Mirror shows 78m -> STILL FLAGGED (+31m)!
  const flaggedInIstWithYesterdayBleed = evaluateAppOsDiscrepancies({
    displayedTotals: [{ app: CHATGPT, totalMs: 78 * MIN }],
    dayFgTotals: [{ packageName: CHATGPT, totalMs: 78 * MIN }],
    storedTotals: [{ packageName: CHATGPT, totalMs: 78 * MIN }],
    rawBucketDiagnostics: [{ packageName: CHATGPT, totalMs: 87 * MIN, preMidnightBucketMs: 40 * MIN, sameDayBucketMs: 47 * MIN, bucketCount: 2 }],
    labels,
  });
  assert.equal(flaggedInIstWithYesterdayBleed.length, 1);
  assert.equal(flaggedInIstWithYesterdayBleed[0].app, CHATGPT);
  assert.equal(flaggedInIstWithYesterdayBleed[0].osMs, 47 * MIN);
  assert.equal(flaggedInIstWithYesterdayBleed[0].diffMs, 31 * MIN);
});

