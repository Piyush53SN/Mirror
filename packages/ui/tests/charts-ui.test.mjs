/**
 * packages/ui/tests/charts-ui.test.mjs
 *
 * Chart primitives, the appearance preference, the Home hero's inverted theme, and reduce-motion.
 * Renders the real components through react-test-renderer (react-native mapped to DOM).
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

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const p = (x) => x.replace(/\\/g, '/');
  const entry = join(OUT, 'entry-charts-ui.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { ProgressRing, Donut, LineChart, LineSparkline, describeDonut, describeLine } from '${p(join(UI, 'src/primitives/charts.tsx'))}';`,
      `export { inverseHeroTheme } from '${p(join(ROOT, 'apps/mobile/src/tabs/HomeTab.tsx'))}';`,
      `export { parseAppearance } from '${p(join(ROOT, 'apps/mobile/src/appearance/AppearanceContext.tsx'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'charts-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite', 'expo-secure-store'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'charts-ui.bundle.mjs')).href);
});

const fmt = (ms) => `${Math.round(ms / 60000)}m`;

function render(element) {
  let r;
  TestRenderer.act(() => {
    r = TestRenderer.create(element);
  });
  return r;
}

function themeFor(name, overrides = {}) {
  return mod.createTheme(name, overrides);
}

test('ProgressRing exposes a progressbar with the value and a text alternative', () => {
  const theme = themeFor('dark', { reducedMotion: true });
  const r = render(
    React.createElement(mod.ProgressRing, {
      value: 0.5,
      max: 1,
      theme,
      testID: 'ring',
      accessibilityLabel: 'Short video. 50 percent of budget',
    }),
  );
  const node = r.root.findAll((el) => el.props?.['data-testid'] === 'ring')[0];
  assert.equal(node.props.role, 'progressbar');
  assert.equal(node.props['aria-label'], 'Short video. 50 percent of budget');
  assert.equal(node.props['aria-valuenow'], '0.5');
});

test('ProgressRing with no measurement says not measured and never shows a fill', () => {
  const theme = themeFor('dark', { reducedMotion: true });
  const r = render(React.createElement(mod.ProgressRing, { value: null, max: 100, theme, testID: 'ring', accessibilityLabel: 'Interaction quality' }));
  const node = r.root.findAll((el) => el.props?.['data-testid'] === 'ring')[0];
  assert.equal(node.props.role, 'progressbar');
  assert.ok(!node.props['aria-valuenow'], 'no value is announced when nothing is measured');
  assert.match(node.props['aria-label'], /Interaction quality\. Not measured/);
});

test('Donut text alternative lists each share, and nothing to share reads as nothing', () => {
  assert.equal(
    mod.describeDonut([
      { label: 'YouTube', value: 60, color: '#000' },
      { label: 'Other', value: 40, color: '#111' },
    ]),
    'YouTube 60%, Other 40%',
  );
  assert.equal(mod.describeDonut([{ label: 'A', value: 0, color: '#000' }]), 'Nothing to share yet');
});

test('LineChart text alternative keeps gaps as "no data", never zero, and marks partial days', () => {
  const text = mod.describeLine(
    [
      { label: 'Mon', value: 3600000 },
      { label: 'Tue', value: null },
      { label: 'Wed', value: 60000, partial: true },
    ],
    fmt,
    'Foreground time',
  );
  assert.equal(text, 'Foreground time. Mon 60m. Tue no data. Wed 1m (partial day).');
  assert.ok(!/Tue 0m/.test(text), 'a gap is never reported as zero');
});

test('LineChart renders a labelled image with a text alternative', () => {
  const theme = themeFor('light', { reducedMotion: true });
  const points = [
    { label: 'Mon', value: 1000, selected: false },
    { label: 'Tue', value: 2000, selected: true },
  ];
  const r = render(React.createElement(mod.LineChart, { points, theme, formatValue: fmt, title: 'Week', testID: 'line' }));
  const node = r.root.findAll((el) => el.props?.['data-testid'] === 'line')[0];
  assert.equal(node.props.role, 'image');
  assert.match(node.props['aria-label'], /^Week\. Mon 0m\. Tue 0m\.$/);
});

test('LineSparkline is labelled and has no day labels', () => {
  const theme = themeFor('dark', { reducedMotion: true });
  const r = render(React.createElement(mod.LineSparkline, { values: [1, null, 3], theme, accessibilityLabel: 'Last three values', testID: 'spark' }));
  const node = r.root.findAll((el) => el.props?.['data-testid'] === 'spark')[0];
  assert.equal(node.props['aria-label'], 'Last three values');
});

test('reduce-motion turns every chart animation off (duration 0)', () => {
  const on = themeFor('dark', { reducedMotion: true });
  const off = themeFor('dark', { reducedMotion: false });
  assert.equal(on.motion('base'), 0);
  assert.equal(on.motion('fast'), 0);
  assert.equal(off.motion('base'), 240);
  assert.ok(off.motion('fast') <= 200, 'tab transitions stay within 200 ms');
});

test('the Home hero inverts the palette: text stays readable on the dark tile (WCAG AA)', () => {
  for (const name of ['dark', 'light']) {
    const theme = themeFor(name);
    const hero = mod.inverseHeroTheme(theme);
    const ratio = contrast(hero.color.ink, hero.color.card);
    assert.ok(ratio >= 4.5, `${name}: hero ink on hero tile ${ratio.toFixed(2)}:1 must be >= 4.5`);
    assert.equal(hero.glass.card.blurPx, 0, 'the hero never blurs');
    assert.equal(hero.glass.card.live, false, 'the hero is not a live blur layer');
  }
});

test('appearance preference: only system, light, dark are accepted; anything else is Auto', () => {
  assert.equal(mod.parseAppearance('light'), 'light');
  assert.equal(mod.parseAppearance('dark'), 'dark');
  assert.equal(mod.parseAppearance('system'), 'system');
  assert.equal(mod.parseAppearance('purple'), 'system');
  assert.equal(mod.parseAppearance(null), 'system');
});

test('ThemeProvider resolves a fixed appearance and follows the OS only for Auto', () => {
  const seen = [];
  function Probe() {
    seen.push(mod.useTheme().name);
    return null;
  }
  render(React.createElement(mod.ThemeProvider, { appearance: 'light' }, React.createElement(Probe)));
  render(React.createElement(mod.ThemeProvider, { appearance: 'dark' }, React.createElement(Probe)));
  render(React.createElement(mod.ThemeProvider, { appearance: 'system' }, React.createElement(Probe)));
  assert.deepEqual(seen, ['light', 'dark', 'dark']);
});

// WCAG 2.x contrast ratio between two #rrggbb colours.
function contrast(a, b) {
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    assert.ok(m, `expected a #rrggbb colour, got ${hex}`);
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
