/**
 * packages/ui/tests/wcag-rendered-ui.test.mjs
 *
 * WCAG 2.x AA contrast checked against the rendered tree, not the token table. The real Home
 * (hero, charts, budgets, weekly summary, Intent Check) and the Why sheet are rendered in both
 * appearances. For every text node the test walks up the rendered ancestors, composites their
 * translucent fills over each palette backdrop colour, and checks the ink against the result:
 *   - 4.5:1 for body text, 3:1 for large text (>= 24px, or >= 18.66px bold).
 * Donut and line strokes must reach 3:1 against the tile they sit on.
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
import { makeMockMobileContext } from './support/mobile-fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '../..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let ui;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const p = (x) => x.replace(/\\/g, '/');
  const entry = join(OUT, 'entry-wcag-ui.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { MirrorTabShell } from '${p(join(ROOT, 'apps/mobile/src/MirrorTabShell.tsx'))}';`,
      `export { MirrorAppContext } from '${p(join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx'))}';`,
      `export { heroTheme } from '${p(join(UI, 'src/tokens.ts'))}';`,
      `export { PALETTE } from '${p(join(UI, 'src/palette.ts'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'ui-wcag.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite', 'expo-secure-store'],
    logLevel: 'warning',
  });
  ui = await import(pathToFileURL(join(OUT, 'ui-wcag.mjs')).href);
});

/* ------------------------------------------------------------ colour maths --- */

function parseColour(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(',').map((x) => parseFloat(x));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

function over(top, bottom) {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite the layers (outermost first) over an opaque base colour. */
function composite(layers, base) {
  return layers.reduce((acc, layer) => over(layer, acc), base);
}

/* ---------------------------------------------------------- tree walking --- */

/** Merge style arrays and camel-case the keys (the DOM shim emits kebab-case CSS). */
function flatten(style) {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce((acc, s) => ({ ...acc, ...flatten(s) }), {});
  if (typeof style !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(style)) {
    out[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

function px(value, fallback) {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Walk the rendered JSON. Returns text nodes with the layers above them, and every stroked or
 * filled graphic element with its layers. Layers are the translucent or solid backgrounds of
 * the ancestors, outermost first.
 */
export function collectRendered(tree) {
  const texts = [];
  const graphics = [];
  function walk(node, layers, inherited) {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, layers, inherited));
      return;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      if (String(node).trim()) texts.push({ text: String(node), colour: inherited.colour, fontSize: inherited.fontSize, fontWeight: inherited.fontWeight, layers });
      return;
    }
    const props = node.props || {};
    const style = flatten(props.style);
    const here = { ...inherited };
    if (style.color) here.colour = style.color;
    if (style.fontSize !== undefined) here.fontSize = px(style.fontSize, here.fontSize);
    if (style.fontWeight !== undefined) here.fontWeight = String(style.fontWeight);
    const nextLayers = style.backgroundColor ? [...layers, style.backgroundColor] : layers;
    if (props['data-svg'] === 'path' || props['data-svg'] === 'circle' || props['data-svg'] === 'rect') {
      if (props.stroke && props.stroke !== 'none') graphics.push({ kind: 'stroke', colour: props.stroke, layers: nextLayers });
      if (props.fill && props.fill !== 'none' && !String(props.fill).startsWith('url(')) graphics.push({ kind: 'fill', colour: props.fill, layers: nextLayers });
    }
    walk(node.children, nextLayers, here);
  }
  walk(tree, [], { colour: undefined, fontSize: 14, fontWeight: '400' });
  return { texts, graphics };
}

/** Lowest contrast across every backdrop colour of the palette (the gradient is the true base). */
function worstContrast(fgString, layers, gradient) {
  const fg = parseColour(fgString);
  if (!fg) return { ratio: Infinity, unparsed: fgString };
  let worst = Infinity;
  for (const baseHex of gradient) {
    const base = parseColour(baseHex);
    const bg = composite(layers.map(parseColour).filter(Boolean), base);
    const solidFg = fg.a < 1 ? over(fg, bg) : fg;
    worst = Math.min(worst, contrast(solidFg, bg));
  }
  return { ratio: worst };
}

function isLarge(fontSize, fontWeight) {
  return fontSize >= 24 || (fontSize >= 18.66 && Number(fontWeight) >= 700);
}

function audit(tree, theme, label) {
  const { texts, graphics } = collectRendered(tree);
  const gradient = theme.palette.gradient;
  const failures = [];
  let checkedText = 0;
  let checkedGraphics = 0;
  for (const t of texts) {
    if (!t.colour) continue;
    checkedText += 1;
    const required = isLarge(t.fontSize, t.fontWeight) ? 3 : 4.5;
    const { ratio, unparsed } = worstContrast(t.colour, t.layers, gradient);
    if (unparsed) {
      failures.push(`${label}: unparsed colour ${unparsed} on "${t.text.slice(0, 40)}"`);
      continue;
    }
    if (ratio < required) failures.push(`${label}: "${t.text.slice(0, 48)}" ${t.colour} ${ratio.toFixed(2)}:1 < ${required}`);
  }
  for (const g of graphics) {
    if (g.kind !== 'stroke') continue;
    checkedGraphics += 1;
    const { ratio, unparsed } = worstContrast(g.colour, g.layers, gradient);
    if (unparsed) continue;
    if (ratio < 3) failures.push(`${label}: stroke ${g.colour} ${ratio.toFixed(2)}:1 < 3 against its tile`);
  }
  return { checkedText, checkedGraphics, failures };
}

/* -------------------------------------------------------------- the tests --- */

/** A populated day: five apps (so the donut has Other), sittings across the day, a full week. */
function populatedContext() {
  const base = makeMockMobileContext({ showWhy: true });
  const day = base.selectedDay;
  const [y, m, d] = day.split('-').map(Number);
  const at = (h) => new Date(y, m - 1, d, h).getTime();
  const apps = [
    ['com.example.video', 'Video', 3600000],
    ['com.example.chat', 'Chat', 2400000],
    ['com.example.mail', 'Mail', 1200000],
    ['com.example.maps', 'Maps', 600000],
    ['com.example.news', 'News', 300000],
    ['com.example.notes', 'Notes', 120000],
    ['com.example.games', 'Games', 60000],
  ].map(([app, label, totalMs]) => ({ app, label, totalMs }));
  const sessions = [9, 11, 14, 20].map((h, i) => ({ id: `s${i}`, app: apps[i].app, startMs: at(h), endMs: at(h) + 40 * 60000 }));
  return { ...base, dailyTotals: apps, dayScoredSessions: sessions, sittingSpanMs: 160 * 60000 };
}



const SURFACES = [
  { name: 'home+why', tab: 'home', extra: { showWhy: true } },
  { name: 'insights', tab: 'insights', extra: {} },
  { name: 'you+settings', tab: 'you', extra: { showSettings: true } },
];

for (const name of ['dark', 'light']) {
  for (const surface of SURFACES) {
    test(`rendered ${surface.name} meets WCAG AA in ${name}`, () => {
      const ctx = { ...populatedContext(), ...surface.extra };
      let renderer;
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          React.createElement(
            ui.ThemeProvider,
            { initialTheme: name },
            React.createElement(ui.MirrorAppContext.Provider, { value: { ...ctx, activeTab: surface.tab } }, React.createElement(ui.MirrorTabShell)),
          ),
        );
      });
      const theme = ui.createTheme(name);
      const result = audit(renderer.toJSON(), theme, `${surface.name}/${name}`);
      assert.ok(result.checkedText > 20, `expected many rendered text nodes, checked ${result.checkedText}`);
      if (surface.name === 'home+why') assert.ok(result.checkedGraphics >= 1, 'expected the donut arcs to be audited');
      assert.deepEqual(result.failures, [], result.failures.join('\n'));
    });
  }
}

test('the hero tile is solid in both appearances, so its ink never sits on a translucent layer', () => {
  for (const name of ['dark', 'light']) {
    const theme = ui.createTheme(name);
    const hero = ui.heroTheme(theme);
    assert.equal(hero.glass.card.blurPx, 0);
    assert.equal(hero.glass.card.live, false);
    assert.equal(hero.color.card, theme.palette.heroFill);
    assert.equal(hero.color.ink, theme.palette.heroInk);
    const ratio = contrast(parseColour(hero.color.ink), parseColour(hero.color.card));
    assert.ok(ratio >= 4.5, `${name} hero ink ${ratio.toFixed(2)}:1`);
  }
});

test('the audit catches a failing pair (so a pass means something)', () => {
  const bad = {
    type: 'div',
    props: { style: { backgroundColor: '#ffffff' } },
    children: [{ type: 'div', props: { style: { color: '#cccccc', fontSize: 14 } }, children: ['faint'] }],
  };
  const result = audit(bad, ui.createTheme('light'), 'probe');
  assert.equal(result.failures.length, 1, 'a light grey on white must fail body contrast');
});
