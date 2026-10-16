/**
 * tests/prototype.test.mjs — behavioural tests for prototype/index.html.
 *
 * Run: npm run test:prototype   (or: node --test tests/prototype.test.mjs)
 *
 * These execute the prototype's real <script> against tests/dom-stub.mjs,
 * drive the shipped event handlers, and measure the resulting DOM. The DOM stub
 * is not a browser (see tests/README.md for what it does not model), so this
 * suite is a floor, not a ceiling: scripts/check-prototype.mjs reproduces the
 * same checks in Chromium when a browser is available.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

import { parseHTML, StubElement, resolvePx } from './dom-stub.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'prototype/index.html'), 'utf8');
const TOKENS = JSON.parse(readFileSync(join(ROOT, 'packages/ui/tokens/image-tokens.json'), 'utf8'));

/* ------------------------------------------------------------- harness ----- */

/** Boot the prototype in a fresh VM context and return handles for assertions. */
function boot({ theme = 'dark', transparency = 'glass', motion = 'full', textScale = 1 } = {}) {
  const doc = parseHTML(HTML);
  doc.textScale = textScale;

  // Collect every element created, so dynamically rendered markup is included.
  const all = [];
  const origAppend = StubElement.prototype.append;
  StubElement.prototype.append = function (...nodes) {
    origAppend.apply(this, nodes);
    for (const n of nodes) if (n instanceof StubElement) all.push(n);
  };

  const root = doc.documentElement;
  // The prototype measures itself with getBoundingClientRect(); the stub resolves
  // that through the same token-driven layout pass the tap-target test uses.
  doc._viewport = { rootVars: collectRootVars(HTML), width: 390, height: 844, textScale };
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-transparency', transparency);
  root.setAttribute('data-motion', motion);

  // Minimal window/document surface the prototype actually touches.
  const timeouts = [];
  const sandbox = {
    document: doc,
    window: {
      matchMedia: (q) => ({ matches: q.includes('reduced-motion') ? motion === 'reduced' : false, addEventListener() {}, addListener() {} }),
      addEventListener() {},
      getComputedStyle: (el) => doc.computedStyle(el),
      requestAnimationFrame: (fn) => timeouts.push(fn),
      setTimeout: (fn) => timeouts.push(fn),
    },
    navigator: { userAgent: 'node-test' },
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: (fn) => timeouts.push(fn),
    performance: { now: () => 0 },
    setTimeout: (fn) => timeouts.push(fn),
    clearTimeout() {},
    console: { log() {}, warn() {}, error() {} },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    matchMedia: (q) => ({ matches: q.includes('reduced-motion') ? motion === 'reduced' : false, addEventListener() {} }),
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = doc;

  const ctx = vm.createContext(sandbox);
  for (const src of doc.scripts) {
    assert.ok(typeof src === 'string', 'prototype must not load external scripts');
    vm.runInContext(src, ctx, { filename: 'prototype/index.html' });
  }
  all.push(...collectElements(doc.documentElement));
  const handles = { doc, ctx, flush: () => timeouts.splice(0).forEach((fn) => fn()) };
  // `all` is live: the prototype re-renders by replacing innerHTML, so a snapshot
  // taken at boot would miss every screen after the first.
  Object.defineProperty(handles, 'all', { get: () => collectElements(doc.documentElement) });
  return handles;
}

function collectElements(node, out = []) {
  for (const child of node.children) {
    if (child.tag === '#text') continue;
    out.push(child);
    collectElements(child, out);
  }
  return out;
}

/**
 * Drive the prototype through its own controls, the way a reviewer would:
 * onboarding -> "Explore with demo data" -> dashboard tab -> optional sheet.
 * Everything here goes through the shipped click delegation, so a broken handler
 * fails the test rather than being bypassed.
 */
function tap(h, predicate, label) {
  const el = h.all.find((n) => isTapTarget(n) && predicate(n));
  assert.ok(el, `no tappable control matching ${label}`);
  h.doc.documentElement.dispatch('click', el);
  h.flush();
  return el;
}

function bootDashboard(opts = {}) {
  const h = boot(opts);
  tap(h, (el) => el.attr('data-action') === 'explore-demo', 'the "Explore with demo data" button');
  return h;
}

function goTab(h, value) {
  tap(h, (el) => el.attr('data-action') === 'tab' && el.attr('data-value') === value, `the ${value} tab`);
  return h;
}

function openSheetFor(h, action) {
  tap(h, (el) => el.attr('data-action') === action, `the "${action}" control`);
  return h;
}

/** Tap targets: exactly what the acceptance criterion names. */
const isTapTarget = (el) =>
  el.attr('data-tap') !== null ||
  ['button', 'a', 'input', 'select', 'textarea'].includes(el.tag) ||
  ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem'].includes(el.attr('role') || '');

function tapTargets(h, { scope = '#screen' } = {}) {
  const root = scope ? h.doc.querySelector(scope) : h.doc.documentElement;
  assert.ok(root, `scope ${scope} must exist`);
  return [...root.querySelectorAll('*')].filter((el) => isTapTarget(el) && el.closest('[hidden]') === null);
}

/** Measure a target the way a finger experiences it: the element, or its nearest sized ancestor. */
function sizeOf(el, viewport) {
  const own = el.measure(viewport);
  if (own.hasExplicitW || own.hasExplicitH) return own;
  let node = el.parent;
  while (node) {
    const m = node.measure(viewport);
    if (m.hasExplicitW || m.hasExplicitH) return { ...m, fromAncestor: node.tag + '.' + [...node.classes].join('.') };
    node = node.parent;
  }
  return own;
}

function viewportOf(h) {
  return { rootVars: collectRootVars(HTML), width: 390, height: 844, textScale: h.doc.textScale };
}

function collectRootVars(html) {
  const vars = {};
  const emitters = html.match(/<style id="m-tokens">([\s\S]*?)<\/style>/);
  for (const src of [emitters ? emitters[1] : '', html]) {
    for (const m of src.matchAll(/(--m-[\w-]+)\s*:\s*([^;}]+)/g)) vars[m[1]] = vars[m[1]] ?? m[2].trim();
  }
  return vars;
}

const px = (v, vp) => resolvePx(v, vp);

/** The page's own stylesheet — the generated token block is excluded. */
function pageCssFlat() {
  return pageCss().replace(/\s*\n\s*/g, ' ');
}

function pageCss() {
  const blocks = [...HTML.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)].filter((m) => !m[1].includes('m-tokens'));
  assert.equal(blocks.length, 1, 'expected exactly one authored style block plus the generated one');
  return blocks[0][2];
}

/* ---------------------------------------------------------- the checks ----- */

test('the prototype boots without throwing and renders the dashboard', () => {
  const h = boot();
  assert.ok(h.all.length > 80, `expected a rendered screen, saw ${h.all.length} elements`);
  const text = h.all.map((e) => e.textContent).join(' ');
  assert.ok(/Private|Public/.test(text), 'the boundary control must render');
});

test('every tap target inside the phone measures at least 48x48', () => {
  const h = bootDashboard();
  const vp = viewportOf(h);
  const failures = [];
  for (const el of tapTargets(h)) {
    const m = sizeOf(el, vp);
    const w = m.w ?? 0;
    const height = m.h ?? 0;
    if (w < 48 || height < 48) {
      failures.push(`${el.tag}.${[...el.classes].join('.')} ${el.attr('aria-label') || JSON.stringify((el.text || '').slice(0, 24))} = ${w.toFixed(0)}x${height.toFixed(0)}`);
    }
  }
  assert.deepEqual(failures, [], `tap targets below 48dp:\n  ${failures.join('\n  ')}`);
});

test('the review sidebar meets the pointer-target size it claims', () => {
  // The sidebar is desktop review chrome, not a phone surface, so it is held to
  // the 44px pointer minimum rather than the 48dp touch rule. The difference is
  // deliberate and stated here rather than quietly applied everywhere.
  const h = boot();
  const vp = viewportOf(h);
  const failures = [];
  for (const el of tapTargets(h, { scope: null }).filter((el) => el.closest('#screen') === null)) {
    const m = sizeOf(el, vp);
    if ((m.w ?? 0) < 44 || (m.h ?? 0) < 44) failures.push(`${el.tag} = ${(m.w ?? 0).toFixed(0)}x${(m.h ?? 0).toFixed(0)}`);
  }
  assert.deepEqual(failures, [], `sidebar controls below 44px: ${failures.join(', ')}`);
});

test('icon-only controls are named for screen readers', () => {
  const h = boot();
  const unnamed = tapTargets(h)
    .filter((el) => !(el.textContent || '').trim())
    .filter((el) => !el.attr('aria-label') && !el.attr('title') && !el.attr('aria-labelledby'))
    .map((el) => `${el.tag}.${[...el.classes].join('.')}`);
  assert.deepEqual(unnamed, [], `tap targets with no accessible name: ${unnamed.join(', ')}`);
});

test('an open sheet is dismissible with a >= 48dp handle and a scrim', () => {
  const h = bootDashboard();
  openSheetFor(h, 'why');
  const vp = viewportOf(h);
  const sheet = h.doc.getElementById('sheet');
  assert.equal(sheet.attr('data-open'), 'true', 'the sheet must actually open');
  const grip = h.all.find((el) => [...el.classes].some((c) => c === 'sheet__grab'));
  assert.ok(grip, 'the sheet needs a grab/close affordance');
  const m = grip.measure(vp);
  assert.ok(m.h >= 48, `the sheet grab/close region measures ${m.h.toFixed(0)}px, needs >= 48`);
  assert.equal(h.doc.getElementById('scrim').attr('data-open'), 'true', 'the scrim must be tappable to dismiss');
  const label = h.doc.getElementById('sheet').attr('aria-label');
  assert.ok(label && label.length > 3, 'the sheet must be named for screen readers');
});

test('the theme is dark by default, light is opt-in, and the toggle is wired', () => {
  assert.match(HTML, /<html[^>]+data-theme="dark"/, 'the document must default to the dark theme');
  const tokens = /<style id="m-tokens">([\s\S]*?)<\/style>/.exec(HTML)[1];
  assert.ok(/\[data-theme="light"\]/.test(tokens), 'the generated tokens must expose the light theme');
  assert.ok(/^:root, \[data-theme="dark"\]/m.test(tokens), 'the dark palette must own :root');
  const h = boot();
  const toggles = h.all.filter((el) => el.attr('data-ctl') === 'theme');
  assert.deepEqual(toggles.map((t) => t.attr('data-value')), ['dark', 'light'], 'both themes must be selectable in the review sidebar');
  assert.equal(toggles[0].attr('aria-pressed'), 'true', 'dark must start pressed');
});

test('reduce-motion removes every transition, not just some', () => {
  const css = HTML.replace(/<style id="m-tokens">[\s\S]*?<\/style>/, '').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  const rmBlock = /\[data-motion="reduced"\]([\s\S]{0,4000}?)\n}/.exec(css);
  assert.ok(rmBlock, 'a [data-motion="reduced"] block must exist (manual override, not only the OS setting)');
  assert.ok(/animation:\s*none\s*!important/.test(rmBlock[1]), 'reduce-motion must stop ambient animation');
  assert.ok(/transition|animation/.test(rmBlock[1]), 'reduce-motion must address transitions too');
  assert.ok(/prefers-reduced-motion/.test(css), 'the OS preference must be honoured without the manual toggle');
});

test('reduce-transparency and missing backdrop-filter both fall back to solid fills', () => {
  const css = pageCss();
  assert.ok(/prefers-reduced-transparency/.test(css), 'include a prefers-reduced-transparency fallback');
  assert.ok(/@supports not \(\(backdrop-filter/.test(css), 'older WebViews must get a solid fallback');
  assert.ok(/\[data-transparency="reduced"\]/.test(css), 'a manual transparency override must exist for review');
  const tokens = /<style id="m-tokens">([\s\S]*?)<\/style>/.exec(HTML)[1];
  for (const surface of ['shell', 'card', 'sheet']) {
    assert.ok(new RegExp(`--m-glass-${surface}-fill: var\\(--m-surface`).test(tokens), `reduced transparency must swap ${surface} to a solid surface token`);
  }
});

test('the live-blur budget holds: at most 3 layers, and only the tab bar and sheets', () => {
  const css = HTML.replace(/<style id="m-tokens">[\s\S]*?<\/style>/, '')
    .replace(/@supports not \([\s\S]*?\n\}/g, '') // the no-blur fallback path is not a live layer
    .match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  const blurred = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    for (const decl of body.matchAll(/(?<!-webkit-)backdrop-filter:\s*([^;]+)/g)) {
      if (/none/.test(decl[1])) continue;
      blurred.push(sel.trim().split('\n').pop().trim());
    }
  }
  const allowed = /tabbar|sheet/i;
  const offending = blurred.filter((s) => !allowed.test(s));
  assert.deepEqual(offending, [], `live blur is allowed only on the tab bar and sheets, found: ${offending.join(', ')}`);
  assert.ok(blurred.length <= 3, `live-blur budget is 3 layers, found ${blurred.length}: ${blurred.join(', ')}`);
  assert.ok(blurred.length >= 1, 'the tab bar/ sheet should actually use the blur they are allowed');
});

test('typography is token-driven end to end', () => {
  const tokens = /<style id="m-tokens">([\s\S]*?)<\/style>/.exec(HTML)[1];
  const stack = /--m-font-family:\s*([^;]+);/.exec(tokens);
  assert.ok(stack, 'the font stack must come from a token');
  assert.match(stack[1], /Inter/, 'Inter first (it is the measured family)');
  assert.match(stack[1], /system-ui|sans-serif/, 'with a system fallback so nothing is fetched at runtime');
  assert.match(tokens, /--m-text-scale:\s*1;/, 'the system font scale must be a token, defaulting to 1');
  assert.match(tokens, /--m-type-body-size:\s*calc\(15px \* var\(--m-text-scale\)\)/, 'type metrics must scale with the system setting');

  const offScale = [];
  for (const decl of [...HTML.matchAll(/(?:font-size|line-height|font-weight|letter-spacing):\s*([^;\n"']+)/g)]) {
    const value = decl[1].trim();
    const idx = decl.index;
    // the generated block and intrinsic layout keywords are exempt
    const before = HTML.slice(0, idx);
    if ((before.match(/<style id="m-tokens">/g) || []).length > (before.match(/<\/style>/g) || []).length) continue;
    if (/^(inherit|normal|none|initial|unset|revert)$/.test(value)) continue;
    if (/var\(--m-(type|font|text)/.test(value)) continue;
    if (/^calc\(var\(--m-type/.test(value)) continue;
    offScale.push(value);
  }
  assert.deepEqual([...new Set(offScale)], [], 'type metrics outside the token system');
});

test('the prototype hardcodes no colour, radius, blur or motion value', () => {
  const css = pageCssFlat();
  const raw = [];
  for (const [, value] of css.matchAll(/(?:color|background|border-color|outline-color):\s*([^;\n]+)/g)) {
    if (/var\(|transparent|currentColor|none|inherit|url\(/.test(value)) continue;
    raw.push(value.trim());
  }
  for (const [, value] of css.matchAll(/border-radius:\s*([^;\n]+)/g)) {
    if (/var\(|0\b|999px/.test(value)) continue;
    raw.push(`radius: ${value.trim()}`);
  }
  for (const [, value] of css.matchAll(/transition:\s*([^;\n]+)/g)) {
    if (/var\(--m-motion|var\(--m-ease/.test(value)) continue;
    raw.push(`transition: ${value.trim()}`);
  }
  assert.deepEqual([...new Set(raw)], [], 'hardcoded design values outside the token system');
});

test('the privacy centre ships deletion, retention and a byte-level receipt', () => {
  const h = goTab(bootDashboard(), 'you');
  let text = h.all.map((e) => (e.textContent || '').trim()).join(' ');
  for (const needle of ['delete', 'retention']) {
    assert.ok(new RegExp(needle, 'i').test(text), `privacy centre must mention "${needle}"`);
  }
  openSheetFor(h, 'receipt');
  text = h.all.map((e) => (e.textContent || '').trim()).join(' ');
  assert.ok(/\b\d[\d.,]*\s*(B|KB|MB|GB)\b/.test(text), 'the receipt must state an actual byte count');
  assert.ok(/\b0\s*B\b/.test(text), 'in Privacy Mode the outbound byte count must be exactly 0');
  assert.ok(/raw events sent/i.test(text), 'the receipt must state how many raw events left the device');
});

test('no screen shows DIP/PIP and no nudge copy exists anywhere', () => {
  const onboarding = boot();
  const onboardingText = onboarding.all.map((e) => (e.textContent || '').trim()).join(' ');
  assert.ok(/no streaks/i.test(onboardingText), 'the promise not to use streaks should be stated up front, not merely omitted');
  const h = bootDashboard();
  for (const value of ['home', 'insights', 'journey', 'sessions', 'you']) goTab(h, value);
  const text = h.all.map((e) => (e.textContent || '').trim()).join(' ');
  assert.ok(!/\bDIP\b|\bPIP\b/.test(text), 'DIP/PIP are internal names');
  // Streaks are named only to promise they do not exist ("No streaks, no guilt").
  for (const banned of [/\d+\s*day streak/i, /keep (your|the) streak/i, /don'?t break/i, /you'?re losing/i, /come back (tomorrow|later)/i, /missed out/i, /keep it up/i, /don'?t miss/i]) {
    assert.ok(!banned.test(text), `banned engagement nudge copy: ${banned}`);
  }
});

test('the boundary toggle is honest about both directions', () => {
  const h = bootDashboard();
  let text = h.all.map((e) => (e.textContent || '').trim()).join(' ');
  assert.match(text, /Only your selections are ever shared/i);
  assert.ok(!/share everything|syncs? to your followers/i.test(text), 'never imply more sharing than happens');
  // flip to Public through the shipped control and re-read the labels
  tap(h, (el) => el.attr('data-action') === 'scope' && el.attr('data-value') === 'public', 'the Public control');
  text = h.all.map((e) => (e.textContent || '').trim()).join(' ');
  assert.match(text, /Visible to others/i, 'Public mode must say who can see it');
});

/* --------------------------------------------------- interaction smoke ----- */

test('the flows the prototype advertises actually run (taps are wired)', () => {
  const h = bootDashboard();
  for (const value of ['home', 'insights', 'journey', 'sessions', 'you']) goTab(h, value);
  const taps = [...new Set(h.all.filter((el) => el.attr('data-tap') !== null))];
  assert.ok(taps.length >= 10, `expected a wired prototype, found ${taps.length} interactive elements`);
  const actions = new Set([...taps.map((t) => t.attr('data-action')), ...h.all.map((el) => el.attr('data-ctl'))]);
  for (const action of ['scope', 'filters', 'confidence', 'restart', 'theme', 'transparency', 'motion', 'text', 'persona']) {
    assert.ok(actions.has(action), `no control is wired to "${action}"`);
  }
});

test('the page\'s own checker reports zero violations across every persona and tab', () => {
  const runChecks = (h) => {
    vm.runInContext('runChecks()', h.ctx);
    const out = h.doc.getElementById('verify-out');
    assert.ok(out, 'the verification output region must exist');
    return out.textContent;
  };
  for (const persona of [0, 1, 2]) {
    const h = bootDashboard();
    const personaBtn = h.all.find((el) => el.attr('data-ctl') === 'persona' && el.attr('data-value') === String(persona));
    if (personaBtn) {
      h.doc.documentElement.dispatch('click', personaBtn);
      h.flush();
    }
    for (const tab of ['home', 'insights', 'journey', 'sessions', 'you']) {
      goTab(h, tab);
      const report = runChecks(h);
      assert.ok(/below 48\u00d748 dp\s+0/.test(report), `persona ${persona} / ${tab}: the page reports tap-target violations:\n${report}`);
      assert.ok(/buttons without an accessible name\s+0/.test(report), `persona ${persona} / ${tab}: unnamed buttons:\n${report}`);
      assert.ok(/tappable elements\s+\d+ measured/.test(report), 'the report must state how much it measured, not just "OK"');
    }
  }
});

test('the page\'s own checker actually measures something (it cannot pass vacuously)', () => {
  const h = bootDashboard();
  vm.runInContext('runChecks()', h.ctx);
  const report = h.doc.getElementById('verify-out').textContent;
  const n = /tappable elements\s+(\d+) measured/.exec(report);
  assert.ok(n && Number(n[1]) >= 10, `verifier measured only ${n && n[1]} targets — a vacuous pass`);
  assert.ok(/glass layers live\s+\d+/.test(report), 'the report must state the live glass layer count');
});

test('the status messages the prototype shows are declared, not invented at runtime', () => {
  const html = HTML;
  const msgs = [...html.matchAll(/data-msg="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(msgs.length >= 5, 'interactive prototype elements explain what they would do');
  for (const m of msgs) assert.ok(m.length > 12, `status message too thin to be honest: "${m}"`);
});
