/**
 * packages/ui/tests/goal-type-options-ui.test.mjs
 *
 * Weekly goal-type chips (fix after alpha.3 device test: "Total time/" was clipped).
 *
 * The layout no longer depends on text fitting a chip:
 *   - a fixed two-column grid, each cell 48% wide, with flex-shrink 0;
 *   - each chip fills its cell (width 100%, flex-shrink 0);
 *   - labels may wrap to two lines, but are never truncated.
 *
 * Checked by rendering the real component with react-test-renderer (DOM mapping of
 * react-native, as the other UI tests do). Font scale is NOT rendered: the harness has
 * no font-scale input, so the 200% check is a static guard (no fixed heights, no
 * truncation styles). It is not a device measurement.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';
import { nativeAliases } from './support/native-aliases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '../..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mod;
const LABELS = ['App time', 'Total time', 'Late-night limit', 'Sitting limit'];

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const p = (x) => x.replace(/\\/g, '/');
  const entry = join(OUT, 'entry-goal-type-options-ui.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { GoalTypeOptions, GOAL_KIND_OPTIONS } from '${p(join(ROOT, 'apps/mobile/src/components/GoalTypeOptions.tsx'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'goal-type-options-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'goal-type-options-ui.bundle.mjs')).href);
});

function renderGrid(value = 'daily_app_foreground') {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        mod.ThemeProvider,
        null,
        React.createElement(mod.GoalTypeOptions, { value, onSelect: () => {} }),
      ),
    );
  });
  return renderer;
}

test('goal types: four labels, exact wording, in the agreed order', () => {
  assert.deepEqual(
    mod.GOAL_KIND_OPTIONS.map((o) => o.label),
    LABELS,
  );
});

test('goal types: four full-width stacked rows, each a radio with a label and description', () => {
  const renderer = renderGrid();
  const list = renderer.root.findAll((el) => el.props?.testID === 'goal-type-grid');
  assert.equal(list.length, 1, 'one list');
  for (const opt of mod.GOAL_KIND_OPTIONS) {
    const rows = renderer.root.findAll((el) => el.props?.testID === `goal-kind-${opt.id}`);
    assert.ok(rows.length >= 1, `row for ${opt.id}`);
    const style = rows[0].props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : style;
    assert.equal(flat.width, '100%', `full width for ${opt.id}`);
    assert.equal(flat.flexShrink, 0, `no shrink for ${opt.id}`);
    assert.equal(flat.height, undefined, `no fixed height for ${opt.id}`);
    assert.ok(flat['min-height'] >= 48 || flat.minHeight >= 48, `48dp target for ${opt.id}`);
    assert.match(String(rows[0].props.accessibilityLabel), new RegExp(opt.label.replace(/[-]/g, '\\-')));
  }
});

test('goal types: no label is rendered with a truncating style', () => {
  const renderer = renderGrid();
  for (const label of LABELS) {
    const texts = renderer.root.findAll(
      (el) => el.props?.['data-text'] === '1' && [el.props?.children].flat(Infinity).join('') === label,
    );
    assert.ok(texts.length >= 1, `"${label}" is rendered`);
    for (const node of texts) {
      assert.equal(node.props.numberOfLines, undefined, `"${label}" has no numberOfLines clamp`);
      const st = node.props.style ?? {};
      assert.notEqual(st['text-overflow'], 'ellipsis', `"${label}" has no ellipsis`);
      assert.notEqual(st['white-space'], 'nowrap', `"${label}" may wrap`);
      assert.notEqual(st.overflow, 'hidden', `"${label}" is not clipped`);
      assert.equal(st.height, undefined, `"${label}" has no fixed height`);
      assert.equal(st['max-height'], undefined, `"${label}" has no max height`);
      // Walk up to the grid: no ancestor clips or fixes the height of a chip.
      for (let up = node.parent; up && up.props?.testID !== 'goal-type-grid'; up = up.parent) {
        const s = up.props?.style;
        const flat = Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s ?? {};
        assert.notEqual(flat.overflow, 'hidden', `ancestor of "${label}" does not clip`);
        assert.equal(flat.height, undefined, `ancestor of "${label}" has no fixed height`);
      }
    }
  }
});

test('goal types: the selected chip is marked for screen readers', () => {
  const renderer = renderGrid('daily_total_foreground');
  const chip = renderer.root.findAll((el) => el.props?.testID === 'goal-kind-daily_total_foreground');
  assert.ok(chip.length >= 1);
  const a11y = chip[0].props.accessibilityLabel ?? chip[0].props['aria-label'];
  assert.match(String(a11y), /^Total time\. .*Selected\.$/);
});
