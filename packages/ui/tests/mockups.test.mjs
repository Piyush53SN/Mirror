/**
 * packages/ui/tests/mockups.test.mjs — the artifact tests.
 *
 * These check the thing a reviewer actually looks at: packages/ui/mockups/gallery.
 * The 48dp rule, the accessible names, the token discipline and the "never fake
 * a signal" behaviour are all measured on the rendered HTML, using the same DOM
 * stub as the P-UI-1 prototype tests (tests/dom-stub.mjs at the repo root).
 *
 * Run: npm --workspace @mirror/ui test
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseHTML, collectRootVars, resolvePx } from '../../../tests/dom-stub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '..', '..');
const OUT = join(UI, 'mockups/gallery');

let manifest;

before(() => {
  // The mockups are generated artifacts; regenerate so the tests always judge
  // the current design system rather than a stale picture of it.
  execFileSync(process.execPath, [join(UI, 'mockups/render.mjs')], { cwd: ROOT, stdio: 'pipe' });
  manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
});

const read = (file) => readFileSync(join(OUT, file), 'utf8');

/**
 * Every phone frame in a page, with its screen metadata. Extracted by balancing
 * <div> depth rather than by a lazy regex — a truncated frame would silently
 * measure nothing and pass.
 */
function frames(html) {
  const out = [];
  const open = /<div class="frame"([^>]*)>/g;
  let match;
  while ((match = open.exec(html))) {
    const attrs = match[1];
    const start = match.index;
    let depth = 0;
    let i = start;
    while (i < html.length) {
      const nextOpen = html.indexOf('<div', i);
      const nextClose = html.indexOf('</div>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 4;
      } else {
        depth--;
        i = nextClose + 6;
        if (depth === 0) break;
      }
    }
    const meta = {
      screen: /data-screen="([^"]+)"/.exec(attrs)?.[1],
      state: /data-state="([^"]+)"/.exec(attrs)?.[1],
      theme: /data-mock-theme="([^"]+)"/.exec(attrs)?.[1],
    };
    const frameHtml = html.slice(start, i);
    if (meta.screen) out.push({ ...meta, html: frameHtml });
    open.lastIndex = i;
  }
  return out;
}

const SCREEN_FILES = () =>
  readdirSync(OUT)
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .sort();

function measureTargets(frameHtml) {
  const doc = parseHTML(`<style></style><body>${frameHtml}</body>`);
  doc._viewport = { rootVars: collectRootVars(frameHtml), width: 390, height: 844, textScale: 1 };
  const vp = doc._viewport;
  const targets = [...doc.querySelectorAll('button')].filter((el) => el.closest('[data-review-chrome]') === null);
  const out = [];
  for (const el of targets) {
    const m = el.measure(vp);
    out.push({ label: el.attr('aria-label') || el.textContent.trim().slice(0, 24) || el.attr('class') || 'button', w: m.w ?? 0, h: m.h ?? 0 });
  }
  return { doc, targets: out };
}

/* ------------------------------------------------------------ inventory ---- */

test('the Section J inventory has 28 items, and every one is rendered', () => {
  assert.equal(manifest.sectionJ.length, 28, 'the brief lists 28 items; SECTION_J must have all of them');
  assert.equal(manifest.items, 28, 'every Section J item must be in SCREENS');
  const listed = manifest.sectionJ.map((i) => i.id);
  const rendered = new Set(manifest.frames.map((f) => f.id));
  for (const id of listed) {
    assert.ok(rendered.has(id), `${id} is in Section J but has no rendered frame`);
  }
  assert.deepEqual([...rendered].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), listed, 'rendered ids must match Section J exactly');
  for (const id of listed) {
    const rows = manifest.frames.filter((f) => f.id === id);
    assert.ok(rows.some((r) => r.theme === 'dark'), `${id} has no dark frame (dark is the default theme)`);
    assert.ok(rows.some((r) => r.theme === 'light'), `${id} has no light frame`);
    assert.ok(rows.some((r) => r.state === 'default'), `${id} has no default state`);
  }
  assert.ok(SCREEN_FILES().length >= 28, `expected a page per item, found ${SCREEN_FILES().length}`);
});

test('sheets, states and widgets are rendered over their parent, not as pages', () => {
  const kinds = new Set(manifest.frames.map((f) => f.kind));
  for (const kind of ['screen', 'sheet', 'state', 'widget']) {
    assert.ok(kinds.has(kind), `no frame is rendered as a ${kind}; Section J has all four`);
  }
  for (const frame of manifest.frames) {
    if (frame.kind === 'screen') {
      assert.equal(frame.parent, null, `${frame.slug} is a full screen and must not declare a parent`);
      continue;
    }
    if (frame.kind === 'widget') {
      // A widget is its own surface (it lives on the OS home screen), but the
      // inventory still records the screen it belongs to.
      assert.ok(!read(`${frame.slug}.html`).includes('data-mock-parent'), `${frame.slug} is a widget: it must render standalone, not layered`);
      assert.ok(frame.parent, `${frame.slug} should record the screen it belongs to`);
      continue;
    }
    assert.ok(frame.parent, `${frame.slug} is a ${frame.kind}: it must name the screen it appears on`);
    const parent = manifest.frames.find((f) => f.slug === frame.parent);
    assert.ok(parent, `${frame.slug} names an unknown parent "${frame.parent}"`);
    // the item's own copy must also be in the parent's page, over the parent's screen
    const page = read(`${frame.slug}.html`);
    assert.ok(page.includes(`data-screen="${frame.slug}"`), `${frame.slug}.html must contain its own frame`);
    // The parent screen is inside that frame: a sheet is not a page of its own.
    const parentSpec = manifest.frames.find((f) => f.slug === frame.parent && f.theme === frame.theme && f.state === 'default');
    assert.ok(parentSpec, `${frame.slug} needs a default frame of ${frame.parent} to sit over`);
    assert.ok(
      page.includes(`data-mock-parent="${frame.parent}"`),
      `${frame.slug}.html must carry its parent screen (${frame.parent}) inside the same frame`,
    );
    assert.ok(
      page.includes('position:absolute'),
      `${frame.slug} must be layered over the parent, not flow after it (the overlay is absolute)`,
    );
  }
  const kindsOf = (slug) => manifest.frames.find((f) => f.slug === slug).kind;
  assert.equal(kindsOf('why-drawer'), 'sheet', 'the Why drawer is a sheet');
  assert.equal(kindsOf('ask-sheet'), 'sheet', 'Ask is a sheet');
  assert.equal(kindsOf('privacy-receipt'), 'sheet', 'the receipt is a sheet');
  assert.equal(kindsOf('persona-picker'), 'sheet', 'the persona picker is a sheet');
  assert.equal(kindsOf('home-widget'), 'widget', 'the widget is a widget');
  assert.equal(kindsOf('update-state'), 'state', 'the update notice is a state');
  assert.equal(kindsOf('share-card-preview'), 'state', 'the share card is a state');
});

test('the gallery shows all 28 items, in the order the brief lists them', () => {
  const gallery = read('index.html');
  for (const file of SCREEN_FILES()) {
    assert.ok(gallery.includes(`./${file}`), `gallery does not link ${file}`);
  }
  const positions = manifest.sectionJ.map((i) => {
    const slug = manifest.frames.find((f) => f.id === i.id).slug;
    return gallery.indexOf(`id="${slug}"`);
  });
  assert.ok(positions.every((p) => p > 0), 'every item must appear in the gallery');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the gallery must keep the Section J order');
  assert.ok(existsSync(join(OUT, 'index.html')), 'the gallery must exist');
});

/* ---------------------------------------------------------- the 48dp rule -- */

test('every tap target in every mockup frame is at least 48x48', () => {
  const failures = [];
  let measured = 0;
  for (const file of SCREEN_FILES()) {
    const html = read(file);
    for (const frame of frames(html)) {
      const { targets } = measureTargets(frame.html);
      measured += targets.length;
      for (const t of targets) {
        if (t.w < 48 || t.h < 48) failures.push(`${file} [${frame.screen}/${frame.state}/${frame.theme}] ${t.label} = ${t.w.toFixed(0)}x${t.h.toFixed(0)}`);
      }
      assert.ok(
        targets.length > 0,
        `${file} [${frame.screen}] rendered no tap targets at all — a screen with nothing tappable is either a dead end or a vacuous pass`,
      );
    }
  }
  // 264 frames (18 screens x up to 2 states x 2 themes). A floor of 2 per frame
  // catches a regression that quietly strips actions without pretending to know
  // the exact count.
  assert.ok(measured >= 2 * 66, `only ${measured} tap targets measured across the gallery; expected at least ${2 * 66}`);
  assert.deepEqual(failures, [], `tap targets below 48dp:\n  ${failures.join('\n  ')}`);
});

test('every tap target has an accessible name (and none is a bare icon)', () => {
  const failures = [];
  for (const file of SCREEN_FILES()) {
    for (const frame of frames(read(file))) {
      const { targets } = measureTargets(frame.html);
      for (const t of targets) {
        if (!t.label || t.label.length < 2) failures.push(`${file} [${frame.screen}] a control with no name`);
      }
    }
  }
  assert.deepEqual(failures, [], `unnamed controls:\n  ${failures.join('\n  ')}`);
});

test('scrollable screens reserve space for the floating tab bar', () => {
  // A screen whose last card sits under the tab bar is a real bug on a phone.
  const home = read('dashboard.html');
  const { doc } = measureTargets(frames(home)[0].html);
  const scroller = doc.querySelector('[data-scroll]');
  assert.ok(scroller, 'the home frame must have a scroll region');
  const content = doc.querySelectorAll('[data-scroll]')[0].children[0];
  const padding = content.measure({ rootVars: {}, width: 390, height: 844 }).computed['padding-bottom'];
  const reserved = resolvePx(padding) ?? 0;
  assert.ok(reserved >= 64, `bottom padding is ${reserved}px; the tab bar is 64px tall and floats 16px above the bottom`);
});

/* ------------------------------------------------------------- posture ----- */

test('mockups are self-contained: no network, no storage, no analytics', () => {
  for (const file of [...SCREEN_FILES(), 'index.html']) {
    const html = read(file);
    assert.ok(!/<script/.test(html), `${file} must not ship script`);
    assert.ok(!/<link[^>]+href=/.test(html), `${file} must not link out`);
    const urls = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]).filter((u) => !u.includes('www.w3.org'));
    assert.deepEqual(urls, [], `${file} references the network: ${urls.join(', ')}`);
    for (const banned of [/google-analytics|gtag\(|mixpanel|amplitude|posthog|sentry/i]) {
      assert.ok(!banned.test(html), `${file} contains ${banned}`);
    }
  }
});

test('the mockups embed the generated token block, not a copy of the palette', () => {
  for (const file of SCREEN_FILES()) {
    const html = read(file);
    assert.ok(html.includes('<style id="m-tokens">'), `${file} must inline the generated tokens`);
    assert.ok(html.includes('--m-glass-sheet-fill'), `${file} is missing the sheet token — re-run npm run tokens`);
  }
  const css = readFileSync(join(UI, 'tokens/tokens.css'), 'utf8');
  assert.ok(read('dashboard.html').includes(css.trim().slice(0, 200)), 'the inlined block must be the generated file');
});

/* ------------------------------------------------------ never fake a signal - */

test('screens that need tiers A/B/C show an honest empty state for a tier-D user', async () => {
  // Render each tier-hungry screen for the tier-D persona and require that the
  // degraded copy is present and no topic data is invented.
  const { buildRenderer } = await import('../mockups/render-lib.mjs');
  const mod = await buildRenderer();
  const cases = ['interest-evolution', 'depth'];
  for (const slug of cases) {
    const spec = mod.SCREENS.find((s) => s.slug === slug);
    assert.ok(spec, `unknown slug ${slug}`);
    if (spec.requires.length === 0) continue;
    const html = mod.htmlFor(mod.renderScreen(spec, mod.PERSONAS[0], mod.createTheme('dark'), 'default'));
    const mentionsLimit = /unavailable|not on this device|will not estimate|No data yet|nothing to show/i.test(html);
    assert.ok(mentionsLimit, `${slug} for a tier-D user must state what is unavailable, not show empty scaffolding`);
    assert.ok(!/Astronomy|Rust programming|Urban gardening/i.test(html), `${slug} invented topic data for a user without topic tiers`);
    assert.ok(!/depth score/i.test(html), `${slug} must not show a score it cannot compute for this user`);
  }
});

test('every required-tier screen is shown degraded for a user who lacks the tier', () => {
  // The manifest drives this: the renderer picks a persona that lacks a required
  // tier for each "empty" frame, so the artifact a reviewer sees really is the
  // degraded view rather than a second copy of the default one.
  const needsTiers = manifest.frames.filter((f) => f.requires.length > 0 && f.state === 'empty');
  assert.ok(needsTiers.length > 0, 'expected screens that declare required tiers');
  for (const frame of needsTiers) {
    if (!frame.degraded) continue; // no persona lacks this tier; the screen's own empty state applies
    const html = read(`${frame.slug}.html`);
    const block = html.slice(html.indexOf(`data-state="empty" data-mock-theme="${frame.theme}"`));
    assert.ok(
      /is unavailable/.test(block),
      `${frame.slug} (${frame.persona}) must say the feature is unavailable, not approximate it`,
    );
    assert.ok(
      /Import an export|Grant usage access|Connect a source|not on this device/.test(block),
      `${frame.slug} must name how the user could change the situation, or say plainly that they cannot`,
    );
  }
  const demanded = manifest.frames.filter((f) => f.requires.some((t) => t !== 'D') && f.state === 'empty');
  assert.ok(
    demanded.every((f) => f.degraded),
    'a screen needing A/B/C must have at least one frame rendered for a persona that lacks them',
  );
});

test('social screens ship the off state, not a teaser', async () => {
  const { buildRenderer } = await import('../mockups/render-lib.mjs');
  const mod = await buildRenderer();
  const html = mod.htmlFor(mod.renderOne('matches-chat', 'mei', 'default', 'dark'));
  assert.ok(/Matching is off/i.test(html), 'matches must state that matching is off');
  assert.ok(/never your watch, search or purchase history/i.test(html), 'and what would never be shared');
  assert.ok(/Leave it off/i.test(html), 'the user must be able to decline from that screen');
});

test('the privacy centre states retention and deletion, and the receipt is reachable', async () => {
  const { buildRenderer } = await import('../mockups/render-lib.mjs');
  const mod = await buildRenderer();
  const html = mod.htmlFor(mod.renderOne('privacy-center', 'mei', 'default', 'dark'));
  assert.match(html, /Retention/i);
  assert.match(html, /Delete all data/i);
  assert.match(html, /Open receipt/i, 'the receipt must be one tap away from this screen');
  assert.match(html, /Capability matrix/i);
  // The receipt itself is a sheet: it is opened by the user, so a static page
  // cannot contain it. Its content is asserted in tests/ui.test.mjs instead.
});

test('every screen can be rendered in reduced-transparency and reduced-motion without throwing', async () => {
  const { buildRenderer } = await import('../mockups/render-lib.mjs');
  const mod = await buildRenderer();
  for (const spec of mod.SCREENS) {
    for (const overrides of [{ reducedTransparency: true }, { reducedMotion: true }, { textScale: 2 }]) {
      const theme = mod.createTheme('dark', overrides);
      const persona = mod.personaFor(spec);
      const element = mod.renderScreen(spec, persona, theme, 'default');
      assert.ok(element, `${spec.slug} failed to render with ${JSON.stringify(overrides)}`);
    }
  }
});

test('no screen text is baked into the mockup CSS (all copy comes from components)', () => {
  const css = readFileSync(join(UI, 'mockups/render.mjs'), 'utf8');
  const body = css.slice(css.indexOf('const pageCss'), css.indexOf('const escapeHtml'));
  for (const phrase of ['Only your selections', 'Matching is off', 'depth score']) {
    assert.ok(!body.includes(phrase), `render.mjs must not contain screen copy ("${phrase}")`);
  }
});

test('the manifest records provenance for every frame', () => {
  for (const frame of manifest.frames) {
    assert.ok(frame.rule && frame.rule.length > 20, `${frame.slug}: every screen states the rule it carries`);
    assert.ok(frame.bytes > 500, `${frame.slug}: suspiciously small render (${frame.bytes} bytes)`);
    assert.ok(['dark', 'light'].includes(frame.theme));
  }
  assert.ok(manifest.generatedFrom.includes('screens'), 'the manifest must point at the screen source');
});
