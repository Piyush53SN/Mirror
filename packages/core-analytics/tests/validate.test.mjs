import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-validate.mjs') });
const { validateDailyTotals, mirrorTotalsFromRawEvents, DEVICE_FIXTURE_OS, DEVICE_FIXTURE_MIRROR_BUGGY } = core;

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

