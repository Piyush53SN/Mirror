/**
 * packages/ui/tests/sheet-dismiss.test.mjs
 *
 * Every way a Sheet closes, driven through the real component in a rendered tree:
 *   - drag the handle down past the threshold (PanResponder release) -> closes
 *   - short drag, or drag back up -> snaps back, stays open
 *   - quick flick down -> closes
 *   - tap the scrim -> closes
 *   - Android back (BackHandler hardwareBackPress) -> closes, and the press is consumed
 *   - the visible Close button (sheet-close, TalkBack target) -> closes, >= 48dp tall
 *   - reduce-motion -> closes at once (no animation), and the motion token is 0
 * Plus the pure maths in sheetDrag.ts, tested directly.
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
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let m;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const p = (x) => x.replace(/\\/g, '/');
  const entry = join(OUT, 'entry-sheet-dismiss.tsx');
  writeFileSync(
    entry,
    [
      `export { Sheet } from '${p(join(UI, 'src/primitives/containers.tsx'))}';`,
      `export { createTheme } from '${p(join(UI, 'src/tokens.ts'))}';`,
      `export { PanResponder, BackHandler } from 'react-native';`,
      `export * from '${p(join(UI, 'src/primitives/sheetDrag.ts'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'sheet-dismiss.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite', 'expo-secure-store'],
    logLevel: 'warning',
  });
  m = await import(pathToFileURL(join(OUT, 'sheet-dismiss.mjs')).href);
});

const TITLE = 'Test sheet';

/** Mount an open Sheet with a close counter. Returns helpers that drive each dismissal path. */
function mount({ reduceMotion = false } = {}) {
  const theme = m.createTheme('dark', { reducedMotion: reduceMotion });
  const calls = { closed: 0 };
  const onClose = () => {
    calls.closed += 1;
  };
  let renderer;
  m.PanResponder.last = null;
  m.BackHandler.listeners.clear();
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        m.Sheet,
        { open: true, title: TITLE, onClose, theme },
        React.createElement('span', null, 'body'),
      ),
    );
  });
  const find = (pred) => renderer.root.findAll(pred);
  return {
    theme,
    calls,
    renderer,
    gesture: () => m.PanResponder.last,
    drag(dy, vy = 0) {
      const g = { dy, dx: 0, vy };
      TestRenderer.act(() => {
        m.PanResponder.last.onPanResponderMove({}, g);
        m.PanResponder.last.onPanResponderRelease({}, g);
      });
    },
    scrimPress() {
      const node = find((n) => n.props.accessibilityLabel === `Dismiss ${TITLE}` && typeof n.props.onPress === 'function')[0];
      assert.ok(node, 'scrim Pressable present');
      TestRenderer.act(() => node.props.onPress());
    },
    closeButton() {
      return find((n) => n.props.testID === 'sheet-close' && typeof n.props.onPress === 'function')[0];
    },
    back() {
      let consumed = false;
      TestRenderer.act(() => {
        consumed = m.BackHandler.fire();
      });
      return consumed;
    },
  };
}

/* ------------------------------------------------------------- the paths --- */

test('dragging the handle down past the threshold closes the sheet', () => {
  const s = mount();
  s.drag(320);
  assert.equal(s.calls.closed, 1, 'one onClose after a long drag');
});

test('a short drag snaps back and the sheet stays open', () => {
  const s = mount();
  s.drag(30);
  assert.equal(s.calls.closed, 0, 'a 30dp drag does not close');
});

test('dragging back up never closes', () => {
  const s = mount();
  s.drag(-200);
  assert.equal(s.calls.closed, 0);
});

test('a quick flick down closes even when the drag is short', () => {
  const s = mount();
  s.drag(40, 1.4);
  assert.equal(s.calls.closed, 1);
});

test('tapping the scrim (outside the sheet) closes the sheet', () => {
  const s = mount();
  s.scrimPress();
  assert.equal(s.calls.closed, 1);
});

test('Android back closes the sheet and the press is consumed', () => {
  const s = mount();
  assert.equal(s.back(), true, 'back press is consumed while the sheet is open');
  assert.equal(s.calls.closed, 1);
});

test('the visible Close button closes the sheet and is at least 48dp tall', () => {
  const s = mount();
  const btn = s.closeButton();
  assert.ok(btn, 'sheet-close button is rendered for TalkBack and sighted users');
  assert.equal(btn.props.accessibilityLabel, `Close ${TITLE}`);
  const minH = [btn.props.style].flat().reduce((max, st) => Math.max(max, st?.minHeight ?? 0), 0);
  assert.ok(minH >= 48, `Close target is ${minH}dp, need at least 48`);
  TestRenderer.act(() => btn.props.onPress());
  assert.equal(s.calls.closed, 1);
});

test('reduce-motion: the sheet closes at once and the motion token is zero', () => {
  const s = mount({ reduceMotion: true });
  assert.equal(s.theme.motion('base'), 0, 'reduce-motion zeroes the base duration');
  assert.equal(s.theme.motion('fast'), 0, 'and the fast duration');
  s.drag(320);
  assert.equal(s.calls.closed, 1, 'closes without waiting for an animation');
});

test('a closed sheet renders nothing and holds no back listener', () => {
  const s = mount();
  TestRenderer.act(() => {
    s.renderer.update(React.createElement(m.Sheet, { open: false, title: TITLE, onClose: () => {}, theme: s.theme }));
  });
  assert.equal(s.renderer.toJSON(), null);
  assert.equal(m.BackHandler.listeners.size, 0, 'no hardware-back listener while closed');
});

test('an open sheet only consumes back while it is open', () => {
  const s = mount();
  TestRenderer.act(() => s.renderer.unmount());
  assert.equal(m.BackHandler.listeners.size, 0, 'unmounting removes the listener');
});

/* --------------------------------------------------------- pure maths --- */

test('sheetDragOffset resists upward drag and rubber-bands past 160dp', () => {
  assert.equal(m.sheetDragOffset(100), 100, 'follows the finger up to 160dp');
  assert.equal(m.sheetDragOffset(160), 160);
  assert.equal(m.sheetDragOffset(260), 210, 'past 160dp it moves at half speed');
  assert.ok(m.sheetDragOffset(-100) > -100 && m.sheetDragOffset(-100) < 0, 'upward drag is damped');
});

test('sheetReleaseAction dismisses past a quarter of the sheet, with a 96dp floor', () => {
  assert.equal(m.sheetReleaseAction(120, 0, 800), 'snap', '120dp is under a quarter of an 800dp sheet (200dp)');
  assert.equal(m.sheetReleaseAction(210, 0, 800), 'dismiss', 'past a quarter of an 800dp sheet');
  assert.equal(m.sheetReleaseAction(100, 0, 300), 'dismiss', 'short sheet: the 96dp floor applies (quarter is 75dp)');
  assert.equal(m.sheetReleaseAction(95, 0, 300), 'snap', 'just under the 96dp floor');
  assert.equal(m.sheetReleaseAction(40, 1.2, 800), 'dismiss', 'a flick with 24dp of travel dismisses');
  assert.equal(m.sheetReleaseAction(10, 2, 800), 'snap', 'a flick with too little travel snaps back');
  assert.equal(m.sheetReleaseAction(-50, 0, 800), 'snap', 'never dismisses on an upward release');
});

test('isSheetDragStart needs a clear downward move, not a sideways swipe', () => {
  assert.equal(m.isSheetDragStart(0, 10), true);
  assert.equal(m.isSheetDragStart(0, 4), false, 'too small to start a drag');
  assert.equal(m.isSheetDragStart(40, 20), false, 'mostly sideways is not a sheet drag');
});
