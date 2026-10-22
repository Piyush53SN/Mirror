/**
 * a11y-label.test.mjs – ensures accessibilityLabel is always string, never array.
 * Reproduces crash: JSApplicationIllegalArgumentException: Error while updating property 'accessibilityLabel' of a view managed by RCTView, caused by ClassCastException: ReadableNativeArray cannot be cast to java.lang.String
 * Root cause: Pill children as array {a}{b} passed as accessibilityLabel array.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const create = (element) => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};

let ui;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-a11y.tsx');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    entry,
    `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';\nexport * from '${join(UI, 'screens/index.tsx').replace(/\\/g, '/')}';\nexport * from '${join(UI, 'screens/render.tsx').replace(/\\/g, '/')}';\n`,
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'ui-a11y.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer'],
    logLevel: 'warning',
  });
  ui = await import(pathToFileURL(join(OUT, 'ui-a11y.mjs')).href);
});

function collectA11yLabels(tree) {
  const labels = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const props = node.props || {};
    if ('accessibilityLabel' in props || 'aria-label' in props) {
      const label = props['accessibilityLabel'] ?? props['aria-label'];
      labels.push({ label, type: typeof label, isArray: Array.isArray(label), nodeType: node.type });
    }
    if (node.children) walk(node.children);
  }
  walk(tree);
  return labels;
}

test('a11yTarget coerces array to string', () => {
  const target = ui.a11yTarget(['a', 'b'], ['hint1', 'hint2']);
  assert.equal(typeof target.accessibilityLabel, 'string', 'accessibilityLabel must be string');
  assert.equal(Array.isArray(target.accessibilityLabel), false, 'must not be array');
  assert.ok(target.accessibilityLabel.includes('a') && target.accessibilityLabel.includes('b'), 'should join array');
  assert.equal(typeof target.accessibilityHint, 'string');
});

test('Pill with array children does not produce array accessibilityLabel', () => {
  // This reproduces the crash: {lbl}{saving} as two adjacent JSX expressions = array children
  const renderer = create(React.createElement(ui.Pill, { theme: ui.createTheme() }, ['intentional', '…']));
  const json = renderer.toJSON();
  const labels = collectA11yLabels(json);
  for (const { label, isArray } of labels) {
    assert.equal(isArray, false, `Pill accessibilityLabel must not be array, got ${JSON.stringify(label)}`);
    assert.equal(typeof label, 'string', `Pill accessibilityLabel must be string, got ${typeof label}: ${JSON.stringify(label)}`);
  }
  renderer.unmount();
});

test('Pill with single string children has string accessibilityLabel', () => {
  const renderer = create(React.createElement(ui.Pill, { theme: ui.createTheme() }, 'intentional'));
  const json = renderer.toJSON();
  const labels = collectA11yLabels(json);
  assert.ok(labels.length > 0, 'should have accessibilityLabel');
  for (const { label } of labels) {
    assert.equal(typeof label, 'string');
  }
  renderer.unmount();
});

test('every interactive element in SCREENS has string accessibilityLabel (not array)', () => {
  const failures = [];
  for (const screen of ui.SCREENS) {
    const renderer = create(ui.renderScreen(screen, ui.PERSONAS[1], ui.createTheme('dark'), 'default'));
    const json = renderer.toJSON();
    const labels = collectA11yLabels(json);
    for (const { label, isArray, nodeType } of labels) {
      if (isArray) {
        failures.push(`${screen.slug}: ${nodeType} has array accessibilityLabel ${JSON.stringify(label)}`);
      }
      if (typeof label !== 'string') {
        failures.push(`${screen.slug}: ${nodeType} has non-string accessibilityLabel type=${typeof label} value=${JSON.stringify(label)}`);
      }
    }
    renderer.unmount();
  }
  assert.deepEqual(failures, [], `a11y label type failures:\n  ${failures.join('\n  ')}`);
});
