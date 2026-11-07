/**
 * packages/ui/tests/glass-alpha8-ui.test.mjs
 *
 * Presentation checks for alpha.8, rendered through the real primitives:
 *   - a Card's glass panel clips its own glow and highlight layers to the card radius
 *   - the backdrop is clipped too (no layer escapes the rounded tile)
 *   - the line chart's first and last points sit inside LINE_PAD_X, so they are not cut at the edges
 *   - reduce-transparency makes the glass panel opaque
 *   - the glow is a static gradient, not an animated value
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
  const entry = join(OUT, 'entry-glass-alpha8.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { lineGeometry, LINE_PAD_X } from '${p(join(UI, 'src/primitives/charts.tsx'))}';`,
      `export { GlassPanel, Backdrop } from '${p(join(UI, 'src/primitives/containers.tsx'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'glass-alpha8.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite', 'expo-secure-store'],
    logLevel: 'warning',
  });
  m = await import(pathToFileURL(join(OUT, 'glass-alpha8.mjs')).href);
});

function flat(style) {
  return [style].flat(Infinity).filter(Boolean).reduce((acc, s) => ({ ...acc, ...s }), {});
}

/** Every rendered node (host View) in document order. */
function nodes(tree, out = []) {
  if (!tree || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) {
    tree.forEach((t) => nodes(t, out));
    return out;
  }
  out.push(tree);
  nodes(tree.children, out);
  return out;
}

for (const name of ['dark', 'light']) {
  test(`a card's glass panel clips its glow and highlight to the card radius (${name})`, () => {
    const theme = m.createTheme(name);
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(m.ThemeProvider, { initialTheme: name }, React.createElement(m.Card, { theme }, 'content')));
    });
    const all = nodes(renderer.toJSON());
    const panel = all.find((n) => n.props && n.props['data-glow'] !== undefined);
    assert.ok(panel, 'the card renders a glass panel carrying its glow');
    const style = flat(panel.props.style);
    assert.equal(style.overflow, 'hidden', 'the panel clips its layers');
    const radius = style.borderRadius ?? style["border-radius"];
    assert.equal(parseFloat(radius), parseFloat(theme.radius.card), "the clip is the card radius");
    // Every layer that paints under the content is a descendant of the clipped panel.
    const inside = nodes(panel);
    assert.ok(inside.some((n) => n.props && n.props['data-gradient']), 'the highlight gradient is inside the clip');
  });

  test(`the backdrop is clipped, so its gradient and grain never escape a rounded tile (${name})`, () => {
    const theme = m.createTheme(name);
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(m.Backdrop, { theme }));
    });
    const root = flat(renderer.toJSON()?.props?.style);
    assert.equal(root.overflow, 'hidden', 'the backdrop root clips its layers');
  });
}

test('the line chart keeps its first and last points inside the card edges', () => {
  const points = [1, 2, 3, 4, 5].map((i) => ({ label: String(i), value: i * 10, partial: false, selected: false, day: `d${i}` }));
  const geo = m.lineGeometry(points, 300, 100);
  assert.ok(m.LINE_PAD_X > 0, 'there is horizontal padding');
  assert.equal(geo.xs[0], m.LINE_PAD_X, 'first point is inset');
  assert.equal(geo.xs[geo.xs.length - 1], 300 - m.LINE_PAD_X, 'last point is inset');
});

test('reduce-transparency makes the glass panel opaque (no see-through fill)', () => {
  const t = m.createTheme('dark', { reducedTransparency: true });
  const fill = t.glass.panel.fill;
  assert.ok(!/rgba\(.*,\s*0?\.\d+\s*\)/.test(fill), `expected an opaque fill, got ${fill}`);
});

test('glows are gradients, not animated values (static under reduce-motion)', () => {
  // The glow layer is a single gradient with no Animated value: it cannot move, so reduce-motion
  // needs nothing extra. Checked by the source, which has no Animated import in the glow code.
  const src = join(UI, 'src/primitives/containers.tsx');
  const text = require_text(src);
  const glow = text.slice(text.indexOf('function GlowLayer'), text.indexOf('function GlowLayer') + 1200);
  assert.ok(glow.includes('RadialGradient') || glow.includes('Svg'), 'the glow is drawn as a gradient');
  assert.ok(!/Animated\./.test(glow), 'the glow layer does not animate');
});

import { readFileSync } from 'node:fs';
function require_text(file) {
  return readFileSync(file, 'utf8');
}
