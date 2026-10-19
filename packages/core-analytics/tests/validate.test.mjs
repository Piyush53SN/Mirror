import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-validate.mjs') });
const { validateDailyTotals, DEVICE_FIXTURE_OS, DEVICE_FIXTURE_MIRROR_BUGGY, DEVICE_FIXTURE_MIRROR_FIXED } = core;

test('buggy fixture fails validation >10% (WhatsApp 39m vs 12m, Brawl 42m vs 7m)', () => {
  const result = validateDailyTotals(DEVICE_FIXTURE_MIRROR_BUGGY, DEVICE_FIXTURE_OS);
  assert.equal(result.ok, false, 'buggy totals should not be ok');
  assert.ok(result.maxAbsPct > 100, `expected huge diff, got ${result.maxAbsPct}%`);
  const whatsapp = result.rows.find((r) => r.app === 'com.whatsapp');
  assert.ok(whatsapp, 'whatsapp row present');
  assert.ok(Math.abs(whatsapp.diffPct) > 200, `whatsapp diff should be >200%, got ${whatsapp.diffPct}`);
  assert.ok(result.overThreshold.length >= 2, 'at least 2 apps over threshold');
});

test('fixed fixture passes validation within 10%', () => {
  const result = validateDailyTotals(DEVICE_FIXTURE_MIRROR_FIXED, DEVICE_FIXTURE_OS);
  assert.equal(result.ok, true, `fixed should be ok, got max ${result.maxAbsPct}% over: ${result.overThreshold.map((r) => `${r.app} ${r.diffPct.toFixed(1)}%`).join(', ')}`);
  assert.ok(result.maxAbsPct <= 10, `maxAbsPct should be <=10, got ${result.maxAbsPct}`);
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
