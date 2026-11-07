// alpha.9 pure helpers (apps/mobile/src/homeCharts.ts): the line-chart window, its loader rules,
// the chart series and ticks, and the day swimlane (which replaces the alpha.8 ribbon).
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
  const outfile = join(OUT, 'home-alpha9.bundle.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'apps/mobile/src/homeCharts.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  mod = await import(pathToFileURL(outfile).href);
});

const TODAY = '2026-11-08';
const fmt = (ms) => `${Math.round(ms / 60000)}m`;

function at(day, h, m = 0) {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
}

/* ------------------------------------------------------------ window --- */

test('the 7-day window ends on today and a day inside it does not move it', () => {
  assert.deepEqual(mod.rangeDaysChronological(TODAY, 7), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', TODAY]);
  assert.equal(mod.windowEndFor('2026-11-02', TODAY, 7, TODAY), TODAY, 'picking the oldest day in the window keeps it');
  assert.equal(mod.windowEndFor(TODAY, TODAY, 7, TODAY), TODAY);
});

test('rangeDaysChronological crosses month boundaries, oldest first', () => {
  assert.deepEqual(mod.rangeDaysChronological('2026-11-03', 7), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
});

test('picking a day before the window brings it to the window start, never past today', () => {
  const end = mod.windowEndFor('2026-10-20', TODAY, 7, TODAY);
  assert.equal(end, '2026-10-26');
  assert.equal(mod.rangeDaysChronological(end, 7)[0], '2026-10-20');
});

test('picking a future day clamps the window to today', () => {
  assert.equal(mod.windowEndFor('2026-11-30', TODAY, 7, TODAY), TODAY);
});

test('Prev and Next move the highlight; the window scrolls only at its edge, never past today', () => {
  const start = '2026-10-30';
  const end = '2026-11-05';
  assert.deepEqual(mod.stepSelection('2026-11-03', 1, end, 7, TODAY), { selectedDay: '2026-11-04', endDay: end }, 'inside: no scroll');
  assert.deepEqual(mod.stepSelection('2026-11-05', 1, end, 7, TODAY), { selectedDay: '2026-11-06', endDay: '2026-11-06' }, 'leaving the right edge scrolls');
  assert.deepEqual(mod.stepSelection(start, -1, end, 7, TODAY), { selectedDay: '2026-10-29', endDay: '2026-11-04' }, 'leaving the left edge scrolls');
  assert.deepEqual(mod.stepSelection(TODAY, 1, TODAY, 7, TODAY), { selectedDay: TODAY, endDay: TODAY }, 'never past today');
});

test('missingDays fetches only what is not cached, inside history and up to today', () => {
  const days = mod.rangeDaysChronological(TODAY, 7);
  const cache = new Map([['2026-11-05', 100]]);
  const missing = mod.missingDays(days, cache, '2026-11-03', TODAY);
  assert.ok(!missing.includes('2026-11-05'), 'a cached day is not fetched');
  assert.ok(!missing.includes('2026-11-02'), 'a day before history is not fetched');
  assert.equal(mod.missingDays(['2026-11-09'], new Map(), '2026-11-01', TODAY).length, 0, 'a future day is not fetched');
  assert.equal(mod.missingDays(days, new Map(days.map((d) => [d, 1])), '2026-11-01', TODAY).length, 0, 'an all-cached window fetches nothing');
});

/* ------------------------------------------------------------ series --- */

test('chartSeries: before history is a gap, a missing total is "no data", and today is partial', () => {
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', TODAY];
  const series = mod.chartSeries({
    days,
    totals: new Map([['2026-11-03', null], ['2026-11-04', 3600000], [TODAY, 60000]]),
    historyStartDay: '2026-11-03',
    todayDay: TODAY,
    selectedDay: '2026-11-04',
    formatValue: fmt,
  });
  assert.equal(series[0].gap, 'before history');
  assert.equal(series[0].value, null);
  assert.equal(series[1].gap, 'no data');
  assert.equal(series[1].value, null, 'a gap is never zero');
  assert.equal(series[2].value, 3600000);
  assert.equal(series[2].selected, true);
  assert.equal(series[3].partial, true);
  assert.match(series[3].tooltip, /today so far/);
});

test('chartSeries: an unfetched recorded day reads as loading, not as zero', () => {
  const [p] = mod.chartSeries({ days: ['2026-11-04'], totals: new Map(), historyStartDay: '2026-11-01', todayDay: TODAY, selectedDay: TODAY, formatValue: fmt });
  assert.equal(p.gap, 'loading');
  assert.equal(p.value, null);
});

test('tooltip reads "Thu 5 Nov · 4h 19m" and the x-label is the weekday on a 7-day axis', () => {
  const s = mod.chartSeries({
    days: ['2026-11-05'],
    totals: new Map([['2026-11-05', 15540000]]),
    historyStartDay: '2026-11-01',
    todayDay: TODAY,
    selectedDay: '2026-11-05',
    formatValue: (ms) => `${Math.floor(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`,
  });
  assert.equal(s[0].tooltip, 'Thu 5 Nov · 4h 19m');
  assert.equal(mod.axisLabelFor('2026-11-05', 0, 7), 'Thu');
});

test('month labels: the 14-day and Month axes name the month on the first point and on the 1st', () => {
  assert.equal(mod.axisLabelFor('2026-10-25', 0, 14), '25 Oct', 'first point carries its month');
  assert.equal(mod.axisLabelFor('2026-11-01', 6, 14), '1 Nov', 'the 1st carries its month');
  assert.equal(mod.axisLabelFor('2026-11-04', 9, 14), '4', 'other days are plain numbers');
});

test('y-axis ticks are round: 4h19m gives 0, 2h, 4h, 6h', () => {
  assert.deepEqual(mod.niceTicks(15540000), [0, 7200000, 14400000, 21600000]);
  assert.equal(mod.tickLabel(0), '0');
  assert.equal(mod.tickLabel(7200000), '2h');
  assert.equal(mod.tickLabel(21600000), '6h');
});

/* ---------------------------------------------------------- swimlane --- */

test('swimlane: one row per top app by rank, plus Other only when a lower app has sittings', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  const labels = { a: 'Alpha' };
  const base = order.slice(0, 5).map((app, i) => ({ id: app, app, startMs: at('2026-11-07', i * 2), endMs: at('2026-11-07', i * 2 + 1) }));
  const noOther = mod.swimlaneRows(base, '2026-11-07', order, labels);
  assert.equal(noOther.length, 5);
  assert.equal(noOther[0].label, 'Alpha', 'a label comes from the app labels');
  assert.equal(noOther[0].colourIndex, 0);
  assert.equal(noOther.some((r) => r.key === 'other'), false, 'no Other row without a lower app');
  const withOther = mod.swimlaneRows([...base, { id: 'f', app: 'f', startMs: at('2026-11-07', 20), endMs: at('2026-11-07', 21) }], '2026-11-07', order, labels);
  const other = withOther.find((r) => r.key === 'other');
  assert.ok(other, 'Other is shown when a lower app has sittings');
  assert.equal(other.blocks.length, 1);
});

test('swimlane: a sitting that crosses midnight is clipped to the day, and blocks sit as day fractions', () => {
  const [y, mo, d] = '2026-11-07'.split('-').map(Number);
  const rows = mod.swimlaneRows([{ id: 'x', app: 'a', startMs: at('2026-11-07', 23), endMs: new Date(y, mo - 1, d + 1, 2).getTime() }], '2026-11-07', ['a'], {});
  const [b] = rows[0].blocks;
  assert.ok(Math.abs(b.left - 23 / 24) < 1e-9, 'a 23:00 start is 23/24 of the day');
  assert.ok(b.left + b.width <= 1 + 1e-9, 'never runs past the end of the day');
});

test('swimlane: sittings of one app with a gap under 60 s merge; a gap of 60 s or more does not', () => {
  const sessions = [
    { id: 'a1', app: 'a', startMs: at('2026-11-07', 9, 0), endMs: at('2026-11-07', 9, 10) },
    { id: 'a2', app: 'a', startMs: at('2026-11-07', 9, 10) + 30000, endMs: at('2026-11-07', 9, 20) },
    { id: 'a3', app: 'a', startMs: at('2026-11-07', 9, 21) + 0, endMs: at('2026-11-07', 9, 30) },
  ];
  const [row] = mod.swimlaneRows(sessions, '2026-11-07', ['a'], {});
  assert.equal(row.blocks.length, 2, 'the 30 s gap merges; the 60 s gap stays a separate block');
  assert.equal(row.blocks[0].count, 2);
});

test('swimlane: the minimum block width is 3dp, and a block stays on the track', () => {
  const p = mod.blockPixels(0.999, 1 / 1440, 300);
  assert.equal(p.w, 3, 'a one-minute sitting is still 3dp wide');
  assert.ok(p.x + p.w <= 300 + 1e-9, 'the block never leaves the track');
  assert.deepEqual(mod.blockPixels(0, 0.5, 200), { x: 0, w: 100 });
});

test('swimlane: an empty day has no rows; a day with no sittings in the top apps still shows their rows', () => {
  assert.equal(mod.swimlaneRows([], '2026-11-07', ['a', 'b'], {}).length, 2, 'the top apps keep their rows');
});

test('clockLabel is local HH:MM', () => {
  assert.match(mod.clockLabel(at('2026-11-07', 9, 5)), /^09:05$/);
});
