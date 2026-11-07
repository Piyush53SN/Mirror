// Home chart data (apps/mobile/src/homeCharts.ts): presentation shaping only.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', '.build');
let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, 'home-charts.bundle.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'apps/mobile/src/homeCharts.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(outfile).href);
});

function day(d, recorded, foregroundMs, isProvisionalToday = false) {
  return { day: d, recorded, isProvisionalToday, foregroundMs, source: recorded ? 'stored_events' : 'unrecorded', badge: 'stored', sittingCount: 0, lateNightForegroundMs: 0 };
}

function report(perDay) {
  const recorded = perDay.filter((d) => d.recorded).length;
  return { perDay, recordedDays: recorded, isPartialWeek: recorded < 7 };
}

test('the week chart needs at least 3 recorded days, otherwise it is hidden', () => {
  const two = report([day('2026-11-01', true, 1000), day('2026-11-02', true, 2000), ...[3, 4, 5, 6, 7].map((n) => day(`2026-11-0${n}`, false, 0))]);
  assert.equal(mod.buildWeekPoints(two, '2026-11-02'), null);
  assert.equal(mod.buildWeekPoints(null, '2026-11-02'), null);
});

test('unrecorded days are gaps (null), never zero, and today is marked partial', () => {
  const days = [
    day('2026-11-01', true, 3600000),
    day('2026-11-02', false, 0),
    day('2026-11-03', true, 1200000),
    day('2026-11-04', true, 60000),
    day('2026-11-05', true, 0),
    day('2026-11-06', true, 0),
    day('2026-11-07', true, 90000, true),
  ];
  const points = mod.buildWeekPoints(report(days), '2026-11-03');
  assert.equal(points.length, 7);
  assert.equal(points[1].value, null, 'unrecorded day is a gap');
  assert.equal(points[6].partial, true, 'provisional today is partial');
  assert.equal(points[2].selected, true);
  assert.equal(points.filter((p) => p.selected).length, 1);
  assert.equal(points[0].value, 3600000, 'values are the existing day-clipped foreground ms');
});

test('weekday labels come from the local calendar date, not a timezone shift', () => {
  assert.equal(mod.weekdayShort('2026-11-07'), 'Sat');
  assert.equal(mod.weekdayShort('2026-11-02'), 'Mon');
});

test('donut: top five apps, then one Other slice; nothing invented', () => {
  const totals = [
    { app: 'a', label: 'A', totalMs: 500 },
    { app: 'b', label: 'B', totalMs: 400 },
    { app: 'c', label: 'C', totalMs: 300 },
    { app: 'd', label: 'D', totalMs: 200 },
    { app: 'e', label: 'E', totalMs: 100 },
    { app: 'f', label: 'F', totalMs: 50 },
    { app: 'g', label: 'G', totalMs: 25 },
    { app: 'h', label: 'H', totalMs: 0 },
  ];
  const slices = mod.buildDonutSlices(totals);
  assert.deepEqual(slices.map((s) => s.label), ['A', 'B', 'C', 'D', 'E', 'Other']);
  assert.equal(slices[5].value, 75, 'Other is the sum of the rest, zero-time apps excluded');
  assert.equal(slices.reduce((s, x) => s + x.value, 0), 1575, 'slices add up to the existing total');
  assert.deepEqual(mod.buildDonutSlices([]), []);
});
