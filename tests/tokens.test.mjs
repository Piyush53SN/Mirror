/**
 * tests/tokens.test.mjs — token contract tests for P-UI-1.
 *
 * Run: npm run test:tokens   (or: node --test tests/tokens.test.mjs)
 *
 * These assert the *contract*, not the current numbers: if the generator's
 * output changes, the tests still have to hold. Anything the generator cannot
 * satisfy fails the build here, before it can fail on a device.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { contrast, hexToRgb, buildTokens, tokensToCss, tokensToTs } from '../scripts/generate-tokens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = JSON.parse(read('packages/ui/tokens/image-tokens.json'));

const THEMES = ['dark', 'light'];
const HEX = /^#[0-9a-f]{6}$/i;

const allHex = (obj, path = '') => {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string' && v.startsWith('#')) out.push([p, v]);
    else if (v && typeof v === 'object') out.push(...allHex(v, p));
  }
  return out;
};


/* ------------------------------------------------------------ contrast ----- */

test('every audited contrast pair meets its declared floor', () => {
  assert.ok(Array.isArray(json.contrast) && json.contrast.length >= 10, 'expected a meaningful audit set');
  for (const pair of json.contrast) {
    assert.ok(
      pair.ratio >= pair.minRatio - 0.005,
      `${pair.theme} ${pair.fg} on ${pair.bg}: ${pair.ratio} < floor ${pair.minRatio}`,
    );
    const recomputed = contrast(hexToRgb(pair.fgHex), hexToRgb(pair.bgHex));
    assert.ok(
      Math.abs(recomputed - pair.ratio) < 0.05,
      `${pair.theme} ${pair.fg}: recorded ${pair.ratio} but recomputes to ${recomputed.toFixed(2)}`,
    );
  }
});

test('the audit covers both themes and the real worst cases', () => {
  const byTheme = (t) => json.contrast.filter((p) => p.theme === t);
  assert.ok(byTheme('dark').length >= 5, 'dark theme (the default) must be audited');
  assert.ok(byTheme('light').length >= 5, 'light theme must be audited');
  for (const theme of THEMES) {
    const labels = byTheme(theme).map((p) => `${p.fg}|${p.bg}`);
    assert.ok(labels.some((l) => /muted/i.test(l)), `${theme}: muted ink must be audited`);
    assert.ok(labels.some((l) => /anchor/i.test(l)), `${theme}: the anchor surface must be audited`);
  }
});

test('no text pair ships below WCAG AA (4.5:1)', () => {
  for (const pair of json.contrast) {
    assert.ok(
      pair.ratio >= 4.5,
      `${pair.theme} ${pair.fg} on ${pair.bg} = ${pair.ratio}:1 — below the 4.5:1 floor. ` +
        'Raise the token or record it as large-text-only; never lower the gate.',
    );
  }
});

test('the reference image is not treated as automatically correct', () => {
  const m = json.meta.measured.contrastInReference;
  assert.ok(m, 'meta must record what the reference image itself scores');
  assert.equal(m.mutedOnGraphitePassesAA, false, 'the reference fails AA for muted ink on graphite — that must be recorded, not smoothed over');
  assert.ok(m.mutedOnGraphite < 4.5, `measured muted-on-graphite is ${m.mutedOnGraphite}, expected below 4.5`);
  const shipped = json.contrast.find((p) => p.theme === 'dark' && /muted/i.test(p.fg) && !/anchor/i.test(p.fg));
  assert.ok(shipped.ratio >= 4.5, 'the shipped muted ink must clear the floor the reference itself misses');
});

/* ------------------------------------------------------------ structure ---- */

test('dark is the default theme, declared in one place', () => {
  assert.equal(json.meta.defaultTheme, 'dark');
  const css = read('packages/ui/tokens/tokens.css');
  const lightIdx = css.indexOf('[data-theme="light"]');
  assert.ok(lightIdx > 0, 'light must be selectable via [data-theme]');
  const defaultBlock = css.slice(0, lightIdx);
  assert.ok(defaultBlock.includes(':root'), ':root must carry the default theme');
  assert.ok(defaultBlock.includes('--m-color-canvas:'), ':root must define the backdrop canvas');
  assert.ok(defaultBlock.includes('color-scheme: dark'), 'the default block must set color-scheme: dark');
  const darkCanvas = new RegExp(`--m-color-canvas:\\s*${json.themes.dark.backdrop.canvas};`, 'i');
  assert.ok(darkCanvas.test(defaultBlock), ':root canvas must be the dark canvas, not the light one');
});

test('both themes expose the same token names (no theme-only tokens)', () => {
  const names = (theme) => {
    const out = [];
    for (const group of ['backdrop', 'surface', 'ink']) {
      for (const k of Object.keys(json.themes[theme][group] || {})) out.push(`${group}.${k}`);
    }
    return out.sort();
  };
  assert.ok(names('dark').length >= 10, 'themes must export a full token set');
  assert.deepEqual(names('dark'), names('light'), 'dark and light must expose identical names');
  for (const [path, hex] of [...allHex(json.themes.dark, 'dark'), ...allHex(json.themes.light, 'light')]) {
    assert.match(hex, HEX, `${path} is not a 6-digit hex (${hex})`);
  }
});

test('dark surfaces form a monotonic luminance ladder above the backdrop', () => {
  const L = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const b = json.themes.dark.backdrop;
  const s = json.themes.dark.surface;
  assert.ok(L(b.canvas) > L(b.veil), 'the veil must be darker than the canvas');
  assert.ok(L(b.glow) > L(b.canvas), 'the glow (light source from below) must be lighter than the canvas');
  const order = [['canvas', b.canvas], ['shell', s.shell], ['card', s.card], ['elevated', s.white]];
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      L(order[i][1]) > L(order[i - 1][1]),
      `dark ladder broken: ${order[i - 1][0]} ${order[i - 1][1]} >= ${order[i][0]} ${order[i][1]}`,
    );
  }
  assert.ok(L(s.anchor) > L(s.white), 'the anchor surface is the lightest thing on screen (it inverts polarity)');
});

test('the dark ladder escapes the sRGB dead zone near black', () => {
  const L = Object.values(json.themes.dark.ladderLstar).sort((a, b) => a - b);
  assert.ok(L.length >= 5, 'the derived ladder must be recorded');
  assert.ok(L[0] <= 20, 'the dark ladder must start near black');
  for (let i = 1; i < L.length; i++) {
    assert.ok(L[i] - L[i - 1] >= 2, `ladder steps must be visible (gap ${(L[i] - L[i - 1]).toFixed(1)} L*)`);
  }
});

test('dark and light are not naive inversions of each other', () => {
  const inv = (hex) => '#' + [1, 3, 5].map((i) => (255 - parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('');
  assert.notEqual(json.themes.dark.backdrop.canvas, inv(json.themes.light.backdrop.canvas), 'dark canvas must be re-derived, not 1-light');
  assert.notEqual(json.themes.dark.surface.shell, inv(json.themes.light.surface.shell), 'dark shell must be re-derived: a fixed white fill alpha does not transfer between themes');
  const d = json.meta.darkDerivation;
  assert.ok(d && d.D1 && d.D2, 'dark must document how it was derived from the reference');
  assert.match(d.D2, /re-spread|ladder/i, 'the derivation must state that the mirrored ladder is re-spread');
});

test('glass fills are alpha-composited, never opaque, and the blur budget is respected', () => {
  for (const [key, spec] of Object.entries(json.glass)) {
    if (!spec || typeof spec !== 'object' || !('fill' in spec)) continue;
    assert.ok(spec.alpha > 0 && spec.alpha < 1, `glass.${key} alpha ${spec.alpha} must be strictly translucent`);
    assert.match(spec.fill, HEX, `glass.${key}.fill must be a hex colour`);
  }
  const budget = json.glass.blurBudget;
  assert.ok(budget, 'the live-blur budget must be declared');
  assert.equal(budget.liveBlurredLayers, 3, 'the brief fixes the mobile budget at 3 live-blurred layers');
  assert.ok(/tab bar/i.test(budget.layersOnlyIn.join(' ')), 'live blur is limited to the tab bar');
  assert.ok(/sheet/i.test(budget.layersOnlyIn.join(' ')), 'live blur is limited to sheets');
  assert.ok(budget.liveBlurredUsed <= budget.liveBlurredLayers, 'the prototype cannot spend more than the budget');
  assert.ok(budget.staticGlass.includes('shell'), 'the shell must be pre-composited, not live-blurred, on phone');
  // The two live surfaces must have a non-zero blur radius to spend.
  assert.ok(json.glass.blurPx.tabbar > 0, 'the tab bar is a live surface and needs a blur radius');
  assert.ok(json.glass.blurPx.sheet > 0, 'sheets are a live surface and need a blur radius');
});

test('blur radii sit inside the measured 40-60px band for the shell', () => {
  assert.ok(json.glass.blurPx.shell >= 40 && json.glass.blurPx.shell <= 60, `shell blur ${json.glass.blurPx.shell}px outside 40-60px`);
  assert.ok(json.glass.blurPx.card < json.glass.blurPx.shell, 'cards sit on the shell, so they need less blur');
});

test('every transition collapses to nothing under reduce-motion', () => {
  const rm = json.motion.reducedMotion;
  assert.ok(rm, 'reduced-motion overrides must exist');
  for (const [name, value] of Object.entries(rm.durations || {})) {
    assert.equal(value, 0, `reducedMotion ${name} must be 0ms`);
  }
  assert.ok((json.motion.durations.base ?? 0) <= 300, 'base motion must stay short');
  assert.ok(!('breathe' in (json.motion.durations || {})) || json.motion.durations.breathe >= 4000, 'breathe must be slow/ambient');
});

test('touch target token is at least 48dp', () => {
  assert.ok(json.size.touchTarget >= 48, `touchTarget is ${json.size.touchTarget}`);
  const css = read('packages/ui/tokens/tokens.css');
  const m = /--m-touch:\s*(\d+)px/.exec(css);
  assert.ok(m, 'tokens.css must expose --m-touch for the prototype');
  assert.ok(Number(m[1]) >= 48, `--m-touch is ${m[1]}px`);
});

test('the type scale hits every shipped role with visible steps', () => {
  const scale = json.type.scale;
  for (const role of ['display', 'headline', 'title', 'body', 'label', 'micro']) {
    assert.ok(scale[role], `type scale missing ${role}`);
    assert.ok(scale[role].lineHeight >= scale[role].size, `${role}: line height must not be below the font size`);
  }
  const sizes = Object.entries(scale).map(([k, v]) => [k, v.size]).sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i][1] > sizes[i - 1][1], `${sizes[i - 1][0]} and ${sizes[i][0]} share a size — the scale is not a scale`);
    assert.ok(sizes[i][1] / sizes[i - 1][1] >= 1.08, `step ${sizes[i - 1][0]}->${sizes[i][0]} is only ${(sizes[i][1] / sizes[i - 1][1]).toFixed(2)}x`);
  }
  assert.ok(scale.body.size >= 15, 'body text below 15pt is not reachable with a thumb');
  assert.equal(json.type.family, 'Inter');
});

test('radius set matches the measured evidence band', () => {
  assert.equal(json.radius.sheet, 28, 'the sheet radius carries the measured shell fit (28px, rms 0.9px)');
  assert.equal(json.radius.card, 20, 'cards measured 20px in the reference');
  for (const key of ['hero', 'sheet']) {
    assert.ok(json.radius[key] >= 20 && json.radius[key] <= 28, `${key} radius ${json.radius[key]} outside the measured 20-28px band`);
  }
  assert.equal(json.radius.pill, 999);
});

/* --------------------------------------------------------------- drift ----- */

test('generated files are in sync with a fresh build (no stale artifacts)', () => {
  const fresh = buildTokens();
  assert.deepEqual(
    JSON.parse(read('packages/ui/tokens/image-tokens.json')),
    JSON.parse(JSON.stringify(fresh)),
    'image-tokens.json differs from a fresh build — run `npm run tokens`',
  );
  assert.equal(read('packages/ui/tokens/tokens.css'), tokensToCss(fresh), 'tokens.css is stale — run `npm run tokens`');
  assert.equal(read('packages/ui/tokens/index.ts'), tokensToTs(fresh), 'index.ts is stale — run `npm run tokens`');
});

test('the token generator is deterministic (same input -> same bytes)', () => {
  assert.equal(JSON.stringify(buildTokens()), JSON.stringify(buildTokens()), 'generator must be deterministic');
});

test('provenance is recorded: tokens trace to measurement or to a documented rule', () => {
  assert.equal(json.meta.reference.sha256, '84f420428b19826ede30a9ebc2793b1f5a4303d4e6f5147107a33eefc49179f6');
  assert.ok(Array.isArray(json.validation) && json.validation.length > 0, 'authored values must be validated against measurement');
  const allowed = new Set(['identical', 'within-band', 'adjusted', 'reconciled']);
  for (const row of json.validation) {
    assert.ok(row.token, 'every validation row names its token');
    assert.ok(typeof row.proposed === 'number', `${row.token}: proposed value must be numeric`);
    assert.ok(Array.isArray(row.band) && row.band.length === 2, `${row.token}: needs the measured evidence band`);
    assert.ok(allowed.has(row.status), `unknown validation status "${row.status}" for ${row.token}`);
    assert.ok(typeof row.note === 'string' && row.note.length > 10, `${row.token} needs a human-readable note`);
    if (row.status === 'within-band') {
      assert.ok(row.proposed >= row.band[0] && row.proposed <= row.band[1], `${row.token}: claims within-band but ${row.proposed} is outside [${row.band}]`);
    }
    if (/authored/i.test(row.note)) {
      assert.ok(row.band[1] <= 40, `${row.token}: an authored value must be bounded by the measured scale, not free-floating`);
    }
  }
});

test('adjustments are logged with before/after ratios (auditable, never silent)', () => {
  assert.ok(json.adjustments.length > 0, 'the generator performed adjustments; they must be recorded');
  for (const adj of json.adjustments) {
    assert.ok(THEMES.includes(adj.theme), `unknown theme ${adj.theme}`);
    assert.notEqual(adj.from, adj.to, 'an adjustment that changes nothing is noise');
    assert.ok(adj.ratioAfter > adj.ratioBefore, `${adj.token}: adjustment must improve contrast`);
    assert.ok(adj.ratioBefore < adj.minRatio, `${adj.token}: only failing values should be adjusted`);
    assert.ok(adj.ratioAfter >= adj.minRatio, `${adj.token}: still below floor after adjustment`);
    assert.ok(adj.reason && adj.reason.length > 10, `${adj.token}: adjustments need a reason`);
  }
});

test('the contrast audit document is generated from the same numbers', () => {
  const doc = read('docs/design/contrast-audit.md');
  for (const pair of json.contrast) {
    assert.ok(doc.includes(pair.fgHex), `contrast-audit.md is missing ${pair.fgHex} (${pair.fg})`);
  }
  const measured = json.meta.measured.contrastInReference.mutedOnGraphite.toFixed(2);
  assert.ok(doc.includes(measured), `the audit must record the reference's own failing value (${measured}:1)`);
});

/* ------------------------------------------------------------- prototype --- */

test('the prototype consumes tokens only — no hardcoded palette', () => {
  const html = read('prototype/index.html');
  const withoutTokens = html
    .replace(/<style id="m-tokens">[\s\S]*?<\/style>/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // SVG url(#id) references are not colours.
  const hexes = [...withoutTokens.matchAll(/(?<!url\()#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(hexes, [], `prototype hardcodes colours: ${[...new Set(hexes)].join(', ')}`);
  assert.ok(withoutTokens.includes('var(--m-'), 'prototype must use CSS custom properties');
});

test('the prototype is self-contained: no network, no storage, no analytics', () => {
  const html = read('prototype/index.html').replace(/\n\s*\*\s[^\n]*/g, '\n');
  assert.ok(!/<link[^>]+href/.test(html), 'no external stylesheets');
  assert.ok(!/<script[^>]+\bsrc=/.test(html), 'no external scripts');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s*\(/.test(html), 'prototype must not reach the network');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(html), 'prototype must not persist anything');
  assert.ok(!/google-analytics|gtag\(|mixpanel|amplitude|posthog|sentry/i.test(html), 'no third-party analytics');
  const urls = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]).filter((u) => !u.includes('www.w3.org/2000/svg'));
  assert.deepEqual(urls, [], `prototype references external URLs: ${urls.join(', ')}`);
});

test('the prototype declares its privacy boundary in the UI, not only in docs', () => {
  const html = read('prototype/index.html');
  assert.ok(/Only your selections are ever shared/.test(html), 'Private mode must state the boundary in-product');
  assert.ok(/Visible to others/.test(html), 'Public mode must be labelled in-product');
  assert.ok(!/\bDIP\b|\bPIP\b/.test(html), 'DIP/PIP are code/doc terms — never shown in the UI');
  assert.ok(/delete/i.test(html) && /receipt/i.test(html), 'privacy centre must offer deletion and a receipt');
});

test('the generated token block is present and non-empty in the prototype', () => {
  const html = read('prototype/index.html');
  assert.ok(html.includes('@generated:tokens:start'), 'marker pair must exist');
  const block = /\/\* @generated:tokens:start \*\/([\s\S]*?)\/\* @generated:tokens:end \*\//.exec(html);
  assert.ok(block && block[1].trim().length > 200, 'run `npm run tokens` to inject the token block');
  assert.ok(block[1].includes('--m-glass-shell-fill'), 'injected block must carry the glass tokens');
});
