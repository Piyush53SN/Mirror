// alpha.8 presentation helpers (apps/mobile/src/homeCharts.ts): the range selector, the day
// ribbon, and the one-label-count rule shared by Curiosity and the Sessions unlock.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', '.build');
let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, 'home-alpha8.bundle.mjs');
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

/* ------------------------------------------------------------ range --- */

test('range choices are 7, 14 and 30 days (Month is the last 30)', () => {
  assert.deepEqual([...mod.RANGE_DAYS], [7, 14, 30]);
});

test('rangeDaysChronological returns oldest first, ending on today, across month boundaries', () => {
  const week = mod.rangeDaysChronological('2026-11-07', 7);
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-11-01');
  assert.equal(week[6], '2026-11-07');
  const month = mod.rangeDaysChronological('2026-11-07', 30);
  assert.equal(month.length, 30);
  assert.equal(month[0], '2026-10-09', 'the 30-day view reaches back into October');
  assert.equal(mod.rangeDaysChronological('not-a-day', 7).length, 0);
});

test('range points keep gaps as null (never zero) and mark only today as partial', () => {
  const days = ['2026-11-05', '2026-11-06', '2026-11-07'];
  const pts = mod.buildRangePoints(days, [1200000, null, 600000], '2026-11-06', '2026-11-07');
  assert.equal(pts[1].value, null, 'an unrecorded day is a gap, not zero');
  assert.equal(pts[0].partial, false);
  assert.equal(pts[2].partial, true, 'today is partial');
  assert.equal(pts[1].selected, true);
  assert.equal(pts[2].label, '7', 'labels are day-of-month for the longer ranges');
  assert.equal(pts.filter((p) => p.partial).length, 1, 'no extrapolation: one partial day at most');
});

/* ------------------------------------------------------------ ribbon --- */

const DAY = '2026-11-07';

function at(day, h, m = 0) {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
}

test('ribbon blocks sit on the day as fractions, sorted by start', () => {
  const sessions = [
    { id: 'b', app: 'com.a', startMs: at(DAY, 14), endMs: at(DAY, 15) },
    { id: 'a', app: 'com.b', startMs: at(DAY, 9), endMs: at(DAY, 10) },
  ];
  const blocks = mod.ribbonBlocks(sessions, DAY, ['com.a', 'com.b']);
  assert.deepEqual(blocks.map((b) => b.key), ['a', 'b']);
  assert.ok(Math.abs(blocks[0].left - 9 / 24) < 1e-9, 'a 09:00 start is 9/24 of the day');
  assert.ok(Math.abs(blocks[0].width - 1 / 24) < 1e-9, 'one hour is 1/24 of the day');
});

test('a sitting that crosses midnight is clipped to the day', () => {
  const [y, mo, d] = DAY.split('-').map(Number);
  const sessions = [{ id: 'x', app: 'com.a', startMs: at(DAY, 23), endMs: new Date(y, mo - 1, d + 1, 2).getTime() }];
  const [block] = mod.ribbonBlocks(sessions, DAY, ['com.a']);
  assert.ok(Math.abs(block.left - 23 / 24) < 1e-9);
  assert.ok(block.left + block.width <= 1 + 1e-9, 'never runs past the end of the day');
});

test('colour is app rank; apps past the top five share one neutral hue; empty sittings are dropped', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  const sessions = order.map((app, i) => ({ id: app, app, startMs: at(DAY, i * 2), endMs: at(DAY, i * 2 + 1) }));
  sessions.push({ id: 'empty', app: 'a', startMs: at(DAY, 20), endMs: at(DAY, 20) });
  const blocks = mod.ribbonBlocks(sessions, DAY, order);
  assert.equal(blocks.length, 6, 'the zero-length sitting is dropped');
  assert.equal(blocks.find((b) => b.key === 'a').colourIndex, 0);
  assert.equal(blocks.find((b) => b.key === 'e').colourIndex, 4);
  assert.equal(blocks.find((b) => b.key === 'f').colourIndex, 5, 'the sixth app takes the shared hue');
});

test('ribbonIndexAt finds the block under a tap, and the nearest within the slop', () => {
  const blocks = [
    { left: 0.1, width: 0.05 },
    { left: 0.5, width: 0.05 },
  ];
  assert.equal(mod.ribbonIndexAt(blocks, 0.12), 0);
  assert.equal(mod.ribbonIndexAt(blocks, 0.53), 1);
  assert.equal(mod.ribbonIndexAt(blocks, 0.3), null, 'a tap far from every block selects nothing');
  assert.equal(mod.ribbonIndexAt(blocks, 0.085, 0.02), 0, 'just outside a block still picks it up');
});

test('clockLabel is local HH:MM', () => {
  assert.match(mod.clockLabel(at(DAY, 9, 5)), /^09:05$/);
});

/* ------------------------------------------------------- one label count --- */

test('Curiosity and the Sessions unlock read the same count against the same threshold', () => {
  const scoring = readFileSync(join(ROOT, 'packages/core-analytics/src/scoring.ts'), 'utf8');
  assert.match(scoring, /export const MIN_LABELS = 5;/, 'the shared threshold is 5');
  const insights = readFileSync(join(ROOT, 'apps/mobile/src/tabs/InsightsTab.tsx'), 'utf8');
  const sessions = readFileSync(join(ROOT, 'apps/mobile/src/tabs/SessionsTab.tsx'), 'utf8');
  assert.match(insights, /const explicitLabelCount = dayLabelCounts\?\.decisive \?\? 0;/, 'Insights reads the selected-day count');
  assert.match(insights, /curiosityUnlocked = explicitLabelCount >= MIN_LABELS/, 'Insights gates on MIN_LABELS');
  assert.match(sessions, /Math\.min\(1, explicitLabelStats\.totalExplicit \/ MIN_LABELS\)/, 'Sessions meter uses MIN_LABELS');
  assert.match(sessions, /MIN_LABELS - explicitLabelStats\.totalExplicit\} more to unlock/, 'Sessions "more to unlock" uses MIN_LABELS');
  assert.doesNotMatch(insights, /allLabelCounts/, 'Insights no longer uses the all-history count for Curiosity');
});
