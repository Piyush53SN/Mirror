/**
 * packages/ui/tests/p44b-fixes-ui.test.mjs
 *
 * Pre-release device fixes (P4.4b review):
 *   1. Goal-type chips wrap instead of clipping: short labels, and Pill text can shrink
 *      and wrap inside its row. (Real device widths and 200% font are NOT measured here;
 *      these checks pin the layout rules the fix depends on.)
 *   2. Weekly report, weekly goals, and budget suggestion cards use the padded Card,
 *      not the padding-less Surface (titles and the D badge touched the card edge).
 *   3. The Weekly report sheet's scroll area is bounded, so three budget suggestions
 *      scroll instead of clipping, and suggestion cards are padded.
 *   6. The weekly stat is "Late-night time", not "Quiet hours".
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '../..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-p44b-fixes-ui.tsx');
  const p = (x) => x.replace(/\\/g, '/');
  writeFileSync(entry, `export * from '${p(join(UI, 'src/index.ts'))}';`);
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'p44b-fixes-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'p44b-fixes-ui.bundle.mjs')).href);
});

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ------------------------------------------------------------ 1. chips wrap */

test('chips: the Pill label text can shrink and wrap inside its row (no fixed text height)', () => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(mod.ThemeProvider, null, React.createElement(mod.Pill, { onPress: () => {} }, 'App time/day')),
    );
  });
  // The DOM test renderer exposes text as host nodes with data-text and kebab-case styles.
  const texts = renderer.root.findAll((el) => el.props?.['data-text'] === '1' && [el.props?.children].flat(Infinity).join('') === 'App time/day');
  assert.ok(texts.length >= 1, 'label text is rendered');
  const style = texts[0].props.style;
  assert.equal(style['flex-shrink'], 1, 'Pill text may shrink so it wraps');
  assert.equal(style['text-align'], 'center');
});

test('chips: goal-type labels are short enough to fit one or two lines at normal width', () => {
  const src = read('apps/mobile/src/components/GoalTypeOptions.tsx');
  const block = src.slice(src.indexOf('export const GOAL_KIND_OPTIONS'), src.indexOf('];', src.indexOf('export const GOAL_KIND_OPTIONS')));
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['App time/day', 'Total time/day', 'Late-night max', 'Max sittings/day']);
  for (const label of labels) {
    assert.ok(label.length <= 16, `"${label}" should be 16 characters or fewer`);
  }
});

/* ----------------------------------------------------- 2. padded report cards */

test('cards: weekly report and weekly goals cards use the padded Card, not Surface', () => {
  const src = read('apps/mobile/src/components/WeeklyGoalsSection.tsx');
  assert.doesNotMatch(src, /<Surface\b/, 'no padding-less Surface cards remain');
  assert.match(src, /<Card theme=\{theme\} style=\{\{ marginBottom: 0 \}\}>\s*<View testID="insights-weekly-report-card"/);
  assert.match(src, /<Card theme=\{theme\} style=\{\{ marginBottom: 0 \}\}>\s*<View testID="insights-goals-section"/);
});

test('cards: the budget suggestion card in the report sheet is padded (Card), not Surface', () => {
  const src = read('apps/mobile/src/components/WeeklyReportSheet.tsx');
  assert.doesNotMatch(src, /<Surface\b/);
  assert.match(src, /<Card theme=\{theme\} style=\{\{ marginBottom: 0 \}\}>\s*<View testID="weekly-budget-suggestions"/);
});

test('cards: Card supplies padding (space 4), so the fixed cards have a left inset', () => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(mod.ThemeProvider, null, React.createElement(mod.Card, null, 'x')));
  });
  const views = renderer.root.findAll((el) => el.props?.['data-view'] === '1' && el.props?.style?.padding !== undefined);
  assert.ok(views.length >= 1, 'Card renders a padded view');
  const padding = parseInt(views[0].props.style.padding, 10);
  assert.ok(padding >= 12, `padding ${padding}px is at least 12px`);
});

/* -------------------------------------------------- 3. bounded, scrollable sheet */

test('sheet: the scroll area is bounded and scrolls, so long content is reachable', () => {
  const src = read('packages/ui/src/primitives/containers.tsx');
  const sheet = src.slice(src.indexOf('export function Sheet('), src.indexOf('export function WeeklyReportSheet') > 0 ? src.length : src.length);
  assert.match(sheet, /maxHeight: \(height \* parseInt\(maxHeight, 10\)\) \/ 100,\s*flexShrink: 1/);
  assert.match(sheet, /<ScrollView\s*style=\{\{ flexGrow: 0, flexShrink: 1 \}\}/);
  assert.match(sheet, /nestedScrollEnabled/);
});

test('sheet: the report sheet is rendered inside the Sheet (so it inherits the scroll area)', () => {
  const src = read('apps/mobile/src/components/WeeklyReportSheet.tsx');
  assert.match(src, /<Sheet\s+open=\{open\}/);
});

/* --------------------------------------------------------- 6. stat rename */

test('stat: the weekly stat is "Late-night time", not "Quiet hours"', () => {
  const src = read('apps/mobile/src/components/WeeklyReportSheet.tsx');
  assert.match(src, /label="Late-night time"/);
  assert.doesNotMatch(src, /label="Quiet hours"/);
  assert.match(src, /hint="23:00 to 05:00 local"/);
});
