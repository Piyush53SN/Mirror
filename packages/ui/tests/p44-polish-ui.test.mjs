/**
 * packages/ui/tests/p44-polish-ui.test.mjs
 *
 * P4.4-UX (5) small fixes:
 *   - bottom nav: one geometry source; the solid band covers the system nav inset and
 *     reaches past the top edge of the floating bar (no translucent bleed under the bar)
 *   - Pill grows with wrapped labels (no clipped "App time / day")
 *   - Pill `selected` is exposed to TalkBack (What-if scenario chips)
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-p44-polish-ui.tsx');
  writeFileSync(entry, `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';\n`);
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'p44-polish-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'p44-polish-ui.bundle.mjs')).href);
});

const space = (n) => n * 4; // 4dp grid
const TAB = 64;

test('tabBarMetrics: values for a 3-button bar (48dp) and a gesture bar (0 inset) keep the bar on solid canvas', () => {
  const none = mod.tabBarMetrics({ insetsBottom: 0, tabBarHeight: TAB, space });
  assert.equal(none.navBarReserve, 20, 'never less than space(5) even with no inset');
  assert.equal(none.barBottom, 16);
  assert.equal(none.barTop, 20 + 16 + TAB);
  assert.equal(none.solidBandHeight, none.barTop + 8, 'solid band reaches past the bar top');
  assert.equal(none.scrimHeight, none.solidBandHeight + 2 * 8);

  const threeButton = mod.tabBarMetrics({ insetsBottom: 48, tabBarHeight: TAB, space });
  assert.equal(threeButton.navBarReserve, 48, 'system nav inset is reserved');
  assert.ok(threeButton.solidBandHeight >= threeButton.navBarReserve + threeButton.barBottom + TAB + 8);
});

test('tabBarMetrics invariants hold across insets', () => {
  for (const insetsBottom of [0, 12, 20, 34, 48, 72]) {
    const m = mod.tabBarMetrics({ insetsBottom, tabBarHeight: TAB, space });
    assert.ok(m.navBarReserve >= insetsBottom, `reserve >= inset (${insetsBottom})`);
    assert.ok(m.navBarReserve >= space(5), 'reserve >= space(5)');
    assert.ok(m.solidBandHeight > m.barTop, 'solid band passes the bar top');
    assert.ok(m.scrimHeight > m.solidBandHeight, 'fade bands sit above the solid band');
    assert.equal(m.barBottom, space(4), 'bar and backing share one bottom offset');
  }
});

function renderPill(props) {
  let r;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(
        mod.ThemeProvider,
        { initialTheme: 'dark' },
        React.createElement(mod.Pill, { ...props, theme: undefined }, props.children),
      ),
    );
  });
  return r;
}

test('Pill selected: exposed to TalkBack as selected; absent when no selection is given', () => {
  const on = renderPill({ children: 'Pause top app · On', selected: true, onPress: () => {} });
  const pressable = on.root.findAll((el) => el.props?.accessibilityRole === 'button' && el.props?.accessibilityState)[0];
  assert.ok(pressable, 'pill is a button');
  assert.equal(pressable.props.accessibilityState.selected, true);

  const off = renderPill({ children: 'Pause top app · Off', selected: false, onPress: () => {} });
  const offPressable = off.root.findAll((el) => el.props?.accessibilityRole === 'button' && el.props?.accessibilityState)[0];
  assert.equal(offPressable.props.accessibilityState.selected, false);

  const plain = renderPill({ children: 'Refresh', onPress: () => {} });
  const plainPressable = plain.root.findAll((el) => el.props?.accessibilityRole === 'button')[0];
  assert.equal(plainPressable.props.accessibilityState, undefined, 'no selection state when not used');
});

test('Pill grows with wrapped labels: inner row uses minHeight, not a fixed height (no clipped "App time / day")', () => {
  const r = renderPill({ children: 'App time / day', onPress: () => {} });
  const rows = r.root.findAll(
    (el) => el.props?.style && !Array.isArray(el.props.style) && el.props.style.flexDirection === 'row' && el.props.style.borderRadius !== undefined,
  );
  assert.ok(rows.length >= 1, 'pill row exists');
  const style = rows[0].props.style;
  assert.equal(style.height, undefined, 'no fixed height that would clip a second line');
  assert.equal(style.minHeight, 44);
});
