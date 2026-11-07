// alpha.8 presentation helpers (apps/mobile/src/homeCharts.ts): the range selector and the
// one-label-count rule shared by Curiosity and the Sessions unlock. (The ribbon tests were replaced in alpha.9.)
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

// alpha.9: the gap, partial and selected rules for the chart points are tested in home-alpha9.test.mjs (chartSeries).

/* The day ribbon was replaced by the swimlane in alpha.9: its tests now live in home-alpha9.test.mjs. */

const DAY = '2026-11-07';

function at(day, h, m = 0) {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
}

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
