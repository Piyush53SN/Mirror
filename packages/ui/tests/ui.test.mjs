/**
 * packages/ui/tests/ui.test.mjs — the design system's contract tests.
 *
 * Run: npm --workspace @mirror/ui test   (or: node --test packages/ui/tests/*.test.mjs)
 *
 * These bundle the design system with esbuild, aliasing `react-native` to the DOM
 * binding, then render real component trees with react-test-renderer. Nothing is
 * mocked away: the components under test are the ones the app will import.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '..', '..');
const OUT = join(HERE, '.build');
const TOKENS = JSON.parse(readFileSync(join(UI, 'tokens/image-tokens.json'), 'utf8'));

let ui;

/**
 * React 19 renders concurrently: a bare `TestRenderer.create` returns before the
 * tree commits, so `toJSON()` would see null. Every render goes through `act`
 * (the React 19 API), and `IS_REACT_ACT_ENVIRONMENT` tells React this is a test.
 * Without this, 11 of the screen tests fail with "rendered nothing".
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const create = (element) => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry.tsx');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    entry,
    `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';\n` +
      `export * from '${join(UI, 'screens/index.tsx').replace(/\\/g, '/')}';\n` +
      `export * from '${join(UI, 'screens/render.tsx').replace(/\\/g, '/')}';\n`,
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'ui.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer'],
    logLevel: 'warning',
  });
  ui = await import(pathToFileURL(join(OUT, 'ui.mjs')).href);
});

/* ------------------------------------------------------------- tokens ------ */

test('dark is the default theme and resolves to the generated values', () => {
  const theme = ui.createTheme();
  assert.equal(theme.name, 'dark');
  assert.equal(theme.isDark, true);
  assert.equal(theme.color.canvas, TOKENS.themes.dark.backdrop.canvas);
  assert.equal(theme.color.shell, TOKENS.themes.dark.surface.shell);
  assert.equal(theme.color.card, TOKENS.themes.dark.surface.card);
  assert.equal(theme.color.ink, TOKENS.themes.dark.ink.core);
  assert.equal(theme.color.inkMuted, TOKENS.themes.dark.ink.muted);
});

test('glass fills are per-theme, never one alpha reused', () => {
  const dark = ui.createTheme('dark');
  const light = ui.createTheme('light');
  const alphaOf = (fill) => parseFloat(/,\s*([\d.]+)\)/.exec(fill)[1]);
  assert.ok(Math.abs(alphaOf(dark.glass.shell.fill) - TOKENS.themes.dark.fillAlpha.shell) < 0.001);
  assert.ok(Math.abs(alphaOf(light.glass.shell.fill) - TOKENS.themes.light.fillAlpha.shell) < 0.001);
  assert.notEqual(alphaOf(dark.glass.shell.fill), alphaOf(light.glass.shell.fill), 'a fixed white alpha does not transfer between themes');
  assert.ok(alphaOf(light.glass.shell.fill) > alphaOf(dark.glass.shell.fill), 'the light shell needs more white to reach its composite');
});

test('no screen can hardcode spacing, radius or type: the theme is the only source', () => {
  const theme = ui.createTheme();
  assert.deepEqual(theme.space(4), TOKENS.space.scale[4]);
  assert.equal(theme.radius.card, TOKENS.radius.card);
  const type = theme.type('title');
  assert.equal(type.fontSize, TOKENS.type.scale.title.size);
  assert.equal(type.lineHeight, TOKENS.type.scale.title.lineHeight);
  assert.equal(type.fontWeight, String(TOKENS.type.scale.title.weight));
});

test('reduced transparency swaps every glass surface for an opaque token and kills blur', () => {
  for (const name of ['dark', 'light']) {
    const theme = ui.createTheme(name, { reducedTransparency: true });
    for (const surface of ['shell', 'card', 'sheet', 'tabbar']) {
      const spec = theme.glass[surface];
      assert.ok(!/rgba\(/.test(spec.fill), `${name}/${surface} must be opaque under reduced transparency, got ${spec.fill}`);
      assert.equal(spec.blurPx, 0, `${name}/${surface} must not blur under reduced transparency`);
      assert.equal(spec.live, false, `${name}/${surface} must not claim a live-blur slot`);
    }
  }
});

test('reduced motion zeroes every duration', () => {
  const theme = ui.createTheme('dark', { reducedMotion: true });
  for (const d of Object.keys(TOKENS.motion.durations)) {
    assert.equal(theme.motion(d), 0, `${d} must be 0ms under reduce-motion`);
  }
  assert.equal(ui.createTheme('dark').motion('base'), TOKENS.motion.durations.base, 'and must be intact otherwise');
});

test('text scale multiplies type tokens and clamps at the system maximum', () => {
  const base = ui.createTheme('dark');
  const scaled = ui.createTheme('dark', { textScale: 1.5 });
  assert.equal(scaled.type('body').fontSize, TOKENS.type.scale.body.size * 1.5);
  assert.equal(scaled.type('body').lineHeight, TOKENS.type.scale.body.lineHeight * 1.5);
  assert.equal(base.type('body').fontSize, TOKENS.type.scale.body.size);
  const beyond = ui.createTheme('dark', { textScale: 3 });
  assert.equal(beyond.type('body').fontSize, TOKENS.type.scale.body.size * TOKENS.type.maxSystemScale, 'text scale must clamp at the audited maximum');
  const below = ui.createTheme('dark', { textScale: 0.5 });
  assert.equal(below.type('body').fontSize, TOKENS.type.scale.body.size, 'text scale must never shrink below 1.0');
});

test('the live-blur budget allows exactly the declared number of layers', () => {
  const theme = ui.createTheme();
  assert.equal(theme.glass.blurBudget.liveBlurredLayers, 3);
  assert.equal(theme.glass.tabbar.live, true);
  assert.equal(theme.glass.sheet.live, true);
  assert.equal(theme.glass.shell.live, false, 'the shell is pre-composited, not live-blurred');
  assert.equal(theme.glass.card.live, false);
  assert.equal(theme.glass.chip.live, false);
});

/* ---------------------------------------------------------- composition ---- */

test('composed glass keeps its ink readable over the worst backdrop', () => {
  // The token audit checks ink on opaque surfaces. This checks what a user
  // actually sees: translucent glass composited over the measured backdrop.
  for (const name of ['dark', 'light']) {
    const theme = ui.createTheme(name);
    const backdrops = theme.color.backdropStops.map((stop) => stop.hex);
    const alpha = (fill) => parseFloat(/,\s*([\d.]+)\)/.exec(fill)[1]);
    const root = /rgba?\(\s*([\d]+)\s*,\s*([\d]+)\s*,\s*([\d]+)/.exec(theme.glass.shell.fill);
    assert.ok(root, `could not parse the shell fill: ${theme.glass.shell.fill}`);
    const glassHex = '#' + [1, 2, 3].map((i) => Number(root[i]).toString(16).padStart(2, '0')).join('');
    for (const backdrop of backdrops) {
      const composed = ui.composite(glassHex, alpha(theme.glass.shell.fill), backdrop);
      const ratio = ui.contrastRatio(theme.color.ink, composed);
      assert.ok(ratio >= 4.5, `${name}: ink on shell over ${backdrop} = ${ratio.toFixed(2)}:1`);
    }
  }
});

test('muted ink is checked against the surfaces it is actually used on', () => {
  for (const name of ['dark', 'light']) {
    const theme = ui.createTheme(name);
    const surfaces = [theme.color.shell, theme.color.card, theme.color.elevated, theme.color.canvas];
    for (const surface of surfaces) {
      const ratio = ui.contrastRatio(theme.color.inkMuted, surface);
      assert.ok(ratio >= 4.5, `${name}: muted ink on ${surface} = ${ratio.toFixed(2)}:1 — below AA`);
    }
  }
});

test('anchor surfaces invert polarity and stay readable in both themes', () => {
  for (const name of ['dark', 'light']) {
    const theme = ui.createTheme(name);
    const ratio = ui.contrastRatio(theme.color.onAnchor, theme.color.anchor);
    assert.ok(ratio >= 4.5, `${name}: onAnchor over anchor = ${ratio.toFixed(2)}:1`);
    const meta = ui.contrastRatio(theme.color.mutedOnAnchor, theme.color.anchor);
    assert.ok(meta >= 4.5, `${name}: muted ink on anchor = ${meta.toFixed(2)}:1`);
  }
});

/* --------------------------------------------------------------- flags ----- */

test('the flag posture is safe by construction', () => {
  const audit = ui.auditFlagPosture();
  assert.deepEqual(audit.problems, [], 'flag posture problems');
  assert.equal(ui.FLAG_DEFAULTS.socialMatching.defaultOn, false, 'social is off by default');
  assert.equal(ui.FLAG_DEFAULTS.socialMatching.owner, 'user', 'turning social on requires the user');
  assert.equal(ui.FLAG_DEFAULTS.cloudReport.defaultOn, false);
  assert.deepEqual(ui.initialFlags.socialMatching, false);
});

test('missing data is reported as missing, with the feature named', () => {
  const result = ui.degrade(['D'], ['A', 'B', 'C'], 'Interest evolution');
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['A', 'B', 'C']);
  assert.match(result.message, /Interest evolution is unavailable/);
  assert.match(result.message, /tier A and B and C/);
  assert.match(result.message, /will not estimate it/);
  assert.equal(ui.degrade(['A', 'B', 'C', 'D'], ['A'], 'X').ok, true);
});

/* ---------------------------------------------------------------- a11y ----- */

test('the 48dp rule is enforced by the shared assertion', () => {
  assert.equal(ui.assertTargetSize('ok', { width: 48, height: 48 }), null);
  const violation = ui.assertTargetSize('chip', { width: 47, height: 48 });
  assert.ok(violation, 'a 47dp-wide control must be reported');
  assert.match(violation.hint, /below the 48dp minimum/);
  assert.match(violation.hint, /do not lower this number/);
  const small = ui.assertTargetSize('dot', { width: 7, height: 7 });
  assert.match(small.hint, /both dimensions/);
});

test('touchTarget() cannot produce a control smaller than the minimum', () => {
  const theme = ui.createTheme();
  const small = ui.touchTarget(32, theme);
  assert.ok(small.minWidth >= 48 && small.minHeight >= 48);
  assert.ok(small.hitSlop.left >= 8 && small.hitSlop.top >= 8, 'the visual gap must be covered by hitSlop');
  const big = ui.touchTarget(64, theme);
  assert.equal(big.minWidth, 64, 'a larger control keeps its size');
  assert.equal(big.hitSlop.left, 0, 'and needs no slop');
});

/* ----------------------------------------------------------- rendering ----- */

const flattenStyle = (style) => (Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style || {});
/** The DOM binding emits CSS-shaped keys (min-height); accept either spelling. */
const cssPx = (style, prop) => {
  const value = style[prop] ?? style[prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)];
  return Number.parseFloat(String(value ?? '0')) || 0;
};
const collectHost = (tree, type) => tree.root.findAllByType(type, { deep: true });

test('every screen renders in every persona, state and theme', () => {
  for (const screen of ui.SCREENS) {
    for (const persona of ui.PERSONAS) {
      for (const state of screen.states) {
        for (const themeName of ['dark', 'light']) {
          const renderer = create(ui.renderScreen(screen, persona, ui.createTheme(themeName), state));
          const json = renderer.toJSON();
          assert.ok(json, `${screen.slug}/${persona.id}/${state}/${themeName} rendered nothing`);
          renderer.unmount();
        }
      }
    }
  }
});

test('every interactive element in every screen is at least 48dp', () => {
  const failures = [];
  for (const screen of ui.SCREENS) {
    for (const persona of ui.PERSONAS) {
      const renderer = create(ui.renderScreen(screen, persona, ui.createTheme('dark'), 'default'));
      for (const node of collectHost(renderer, 'button')) {
        const style = flattenStyle(node.props.style);
        const w = cssPx(style, 'width') || cssPx(style, 'minWidth');
        const h = cssPx(style, 'height') || cssPx(style, 'minHeight');
        const slop = node.props.hitSlop || {};
        const effectiveH = Math.max(h, h + (slop.top ?? 0) + (slop.bottom ?? 0));
        const effectiveW = Math.max(w, w + (slop.left ?? 0) + (slop.right ?? 0));
        if (effectiveW < 48 || effectiveH < 48) {
          failures.push(`${screen.slug}/${persona.id}: ${node.props['aria-label'] ?? '(unnamed)'} = ${effectiveW}x${effectiveH}`);
        }
      }
      renderer.unmount();
    }
  }
  assert.deepEqual(failures, [], `controls below 48dp:\n  ${failures.join('\n  ')}`);
});

test('every interactive element has an accessible name and a role', () => {
  const failures = [];
  for (const screen of ui.SCREENS) {
    const renderer = create(ui.renderScreen(screen, ui.PERSONAS[1], ui.createTheme('dark'), 'default'));
    for (const node of collectHost(renderer, 'button')) {
      const label = node.props['aria-label'];
      const text = (node.children ?? [])
        .map((child) => (typeof child === 'string' ? child : child && typeof child === 'object' ? String(child.children ?? '') : ''))
        .join('');
      if (!label && !/[A-Za-z]/.test(text)) failures.push(`${screen.slug}: ${node.props.role ?? 'no-role'} with no name`);
      if (!node.props.role) failures.push(`${screen.slug}: ${label ?? 'unnamed'} has no accessibility role`);
    }
    renderer.unmount();
  }
  assert.deepEqual(failures, [], `a11y gaps:\n  ${failures.join('\n  ')}`);
});

test('the live-blur budget is enforced at runtime, not just declared', () => {
  const { useLiveBlur, ThemeProvider, Text } = ui;
  const Probe = () => {
    const grants = [useLiveBlur('a'), useLiveBlur('b'), useLiveBlur('c'), useLiveBlur('d'), useLiveBlur('e')];
    return React.createElement(Text, null, grants.map((g, i) => `${i}:${g ? 'live' : 'solid'}`).join(' , '));
  };
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(ThemeProvider, { followSystem: false, overrides: {} }, React.createElement(Probe)));
  });
  const text = JSON.stringify(renderer.toJSON());
  const liveCount = (text.match(/:live/g) || []).length;
  assert.equal(liveCount, 3, `expected exactly 3 granted live-blur layers, got ${liveCount}: ${text.slice(0, 240)}`);
  assert.match(text, /3:solid/, 'the fourth surface must fall back to a pre-composited fill');
  assert.match(text, /4:solid/, 'and so must the fifth');
  renderer.unmount();
});

test('boundary toggle states the consequence in the UI for both directions', () => {
  const renderer = create(
    React.createElement(ui.BoundaryToggle, {
      theme: ui.createTheme(),
      value: 'private',
      onChange: () => {},
      consequence: 'Private. Only your selections are ever shared.',
    }),
  );
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /Private/);
  assert.match(text, /Only your selections are ever shared/);
  assert.ok(!/"DIP"|"PIP"/.test(text), 'internal names must never reach the UI');
  renderer.unmount();
});

test('the privacy receipt renders real numbers, not reassurance', () => {
  const renderer = create(
    React.createElement(ui.PrivacyReceipt, {
      theme: ui.createTheme(),
      periodLabel: 'October',
      rows: [
        { label: 'Sent this month', value: '0 B', detail: 'Privacy Mode has never made an outbound request.' },
        { label: 'Raw events sent', value: '0', detail: 'Titles, searches and timestamps stay here.' },
        { label: 'Update check', value: '0 B' },
      ],
      zeroCopy: 'In Privacy Mode this list is empty by construction.',
    }),
  );
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /0 B/, 'the receipt must state a byte count');
  assert.match(text, /Raw events sent/);
  assert.match(text, /by construction/, 'and must explain why it is empty');
  renderer.unmount();
});

test('the capability matrix names what Mirror cannot see, with the reason', () => {
  const renderer = create(
    React.createElement(ui.CapabilityMatrix, {
      theme: ui.createTheme(),
      available: ['D'],
      rows: [
        { label: 'Per-app foreground time', tier: 'D', connected: true, note: 'Android Usage access.' },
        { label: 'Watch completion', tier: 'C', connected: false, note: 'Needs the extension.' },
      ],
    }),
  );
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /What Mirror can see/);
  assert.match(text, /What Mirror will not do/);
  assert.match(text, /accessibility services or screen capture/, 'the reason must be stated, not implied');
  assert.match(text, /no|not/i);
  renderer.unmount();
});

test('the why-sheet refuses to hide a mismatch between its parts and its score', () => {
  const theme = ui.createTheme();
  const consistent = create(
    React.createElement(ui.WhySheet, {
      theme,
      score: 10,
      maxScore: 20,
      components: [
        { label: 'a', points: 6, tier: 'D' },
        { label: 'b', points: 4, tier: 'C' },
      ],
      caveat: 'an estimate',
    }),
  );
  assert.match(JSON.stringify(consistent.toJSON()), /an estimate/);
  consistent.unmount();

  const inconsistent = create(
    React.createElement(ui.WhySheet, {
      theme,
      score: 10,
      maxScore: 20,
      components: [{ label: 'a', points: 6, tier: 'D' }],
      caveat: 'an estimate',
    }),
  );
  assert.match(JSON.stringify(inconsistent.toJSON()), /do not add up to the score/, 'a mismatch must be reported');
  inconsistent.unmount();
});

test('degraded states are rendered by the pattern, never by ad-hoc copy', () => {
  const renderer = create(
    React.createElement(ui.DegradedNotice, { theme: ui.createTheme(), needs: ['A', 'B', 'C'], available: ['D'], feature: 'Interest evolution' }),
  );
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /Interest evolution is unavailable/);
  assert.match(text, /not on this device/);
  renderer.unmount();
  const ok = create(React.createElement(ui.DegradedNotice, { theme: ui.createTheme(), needs: ['D'], available: ['D'], feature: 'Insights' }));
  assert.equal(ok.toJSON(), null, 'nothing renders when the data is there');
  ok.unmount();
});

/* ------------------------------------------------- Section J inventory ---- */

test('the inventory covers the 28 Section J items exactly, in order', () => {
  assert.equal(ui.SECTION_J.length, 28, 'Section J has 28 items');
  assert.equal(ui.SCREENS.length, 28, 'every Section J item is a SCREENS entry');
  assert.deepEqual(
    ui.SCREENS.map((s) => s.id),
    ui.SECTION_J.map((i) => i.id),
    'the rendered inventory must keep Section J order',
  );
  for (const item of ui.SECTION_J) {
    const spec = ui.specBySlug(ui.SCREENS.find((s) => s.id === item.id).slug);
    assert.equal(spec.title, item.title, `${item.id}: title must match the brief`);
    assert.equal(spec.kind, item.kind, `${item.id}: kind must match the brief`);
    if (item.parent) assert.equal(spec.parent, item.parent, `${item.id}: parent must match the brief`);
  }
  const slugs = new Set(ui.SCREENS.map((s) => s.slug));
  assert.equal(slugs.size, 28, 'slugs are unique');
});

test('the four kinds are all represented: screens, sheets, states and a widget', () => {
  const byKind = {};
  for (const spec of ui.SCREENS) byKind[spec.kind] = (byKind[spec.kind] ?? 0) + 1;
  assert.ok(byKind.screen >= 20, `expected the list to be mostly screens, got ${byKind.screen}`);
  assert.equal(byKind.sheet, 4, 'the Why drawer, Ask, the receipt and the persona picker are sheets');
  assert.equal(byKind.state, 2, 'the share card and the update notice are states');
  assert.equal(byKind.widget, 1, 'the home-screen widget is a widget');
  for (const spec of ui.SCREENS) {
    if (spec.kind === 'sheet' || spec.kind === 'state') {
      assert.ok(spec.parent, `${spec.slug} is a ${spec.kind}: it must name the screen it appears on`);
      assert.ok(ui.specBySlug(spec.parent), `${spec.slug} names an unknown parent "${spec.parent}"`);
    }
  }
});

test('a sheet is rendered over its parent screen, not instead of it', () => {
  for (const spec of ui.SCREENS.filter((s) => s.kind === 'sheet' || s.kind === 'state')) {
    const theme = ui.createTheme('dark');
    const parent = ui.specBySlug(spec.parent);
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(ui.renderScreen(spec, ui.PERSONAS[1], theme, spec.states[0]));
    });
    const text = JSON.stringify(renderer.toJSON());
    // Exactly one screen container: the parent's. A sheet that rendered its own
    // full screen would be a page, not a sheet.
    const labels = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      // The DOM binding maps accessibilityLabel → aria-label; read both so the
      // test does not depend on which host it is looking at.
      const label = node.props?.['aria-label'] ?? node.props?.accessibilityLabel;
      if (typeof label === 'string') labels.push(label);
      walk(node.children);
    })(renderer.toJSON());
    // "…on screen" hero-dot labels also end in "screen"; a Screen container's label
    // is "<title> screen" and is not a slide indicator.
    const screens = labels.filter((l) => l.endsWith(' screen') && !/^Slide /.test(l));
    assert.equal(
      screens.length,
      1,
      `${spec.slug} must render over exactly one screen (${spec.parent}); found ${JSON.stringify(screens)}`,
    );
    assert.ok(text.length > 500, `${spec.slug} rendered nothing over ${spec.parent}`);
    renderer.unmount();
  }
});

test('every item declares the rule it carries and the tiers it needs', () => {
  for (const spec of ui.SCREENS) {
    assert.ok(spec.rule.length > 20, `${spec.slug} needs a rule a reviewer can check (got "${spec.rule}")`);
    assert.ok(spec.states.includes('default'), `${spec.slug} must render in its default state`);
    assert.ok(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].includes(spec.phase), `${spec.slug}: unknown phase ${spec.phase}`);
    for (const tier of spec.requires) assert.ok(['A', 'B', 'C', 'D'].includes(tier), `${spec.slug}: unknown tier ${tier}`);
  }
});

/* ------------------------------------------------- tiers, phases, chrome --- */

test('features that are not tier-D features say so', () => {
  // The brief's honest-capability rule: a feature that needs more than usage data
  // must not be declared (or rendered) as if usage data were enough.
  const notTierD = ['depth', 'curiosity-vs-habit', 'rabbit-hole', 'focus-windows'];
  for (const slug of notTierD) {
    const spec = ui.specBySlug(slug);
    assert.ok(spec, `unknown slug ${slug}`);
    assert.deepEqual(spec.requires, ['D'], `${slug}: session data is still required`);
    assert.ok(
      spec.requiresAnyOf && spec.requiresAnyOf.length > 0,
      `${slug} needs a content-level signal in addition to tier D, and must declare requiresAnyOf`,
    );
    for (const tier of spec.requiresAnyOf) assert.ok(['A', 'B', 'C'].includes(tier), `${slug}: unknown tier ${tier}`);
    // with only tier D, the screen must refuse rather than relabel session length
    const html = JSON.stringify(
      create(ui.renderScreen(spec, ui.PERSONAS[0], ui.createTheme('dark'), 'default')).toJSON(),
    );
    assert.ok(html.includes('is unavailable'), `${slug} must refuse for a tier-D-only persona`);
    assert.ok(/at least one of tier/i.test(html), `${slug} must state that any one of A/B/C would do`);
  }
});

test('a feature that genuinely runs on tier D alone still runs', () => {
  // The mirror of the test above: the rule is per-feature, not a blanket blockage.
  for (const slug of ['dashboard', 'sessions', 'attention-budget', 'ask-sheet']) {
    const spec = ui.specBySlug(slug);
    assert.ok(!spec.requiresAnyOf || spec.requiresAnyOf.length === 0, `${slug} should not need a content signal`);
    const html = JSON.stringify(create(ui.renderScreen(spec, ui.PERSONAS[0], ui.createTheme('dark'), 'default')).toJSON());
    assert.ok(!html.includes(`${spec.title} is unavailable`), `${slug} must render for a tier-D user`);
  }
});

test('degrade() explains an anyOf requirement without inventing a missing tier', () => {
  const onlyD = ui.degrade(['D'], ['D'], 'Depth', ['A', 'B', 'C']);
  assert.equal(onlyD.ok, false);
  assert.deepEqual(onlyD.missing, []);
  assert.deepEqual(onlyD.missingAny, ['A', 'B', 'C']);
  assert.match(onlyD.message, /at least one of tier A\/B\/C/);
  assert.match(onlyD.message, /will not estimate it/);
  const withC = ui.degrade(['D', 'C'], ['D'], 'Depth', ['A', 'B', 'C']);
  assert.equal(withC.ok, true, 'one content tier is enough');
  const nothing = ui.degrade([], ['D'], 'Depth', ['A', 'B', 'C']);
  assert.deepEqual(nothing.missing, ['D']);
  assert.deepEqual(nothing.missingAny, ['A', 'B', 'C']);
  assert.match(nothing.message, /tier D data and at least one of tier/);
});

test('every item declares the phase the roadmap gives it', () => {
  const expected = {
    J1: 'P1', J2: 'P1', J3: 'P2', J4: 'P3', J5: 'P2', J6: 'P2', J7: 'P2', J8: 'P2',
    J9: 'P3', J10: 'P4', J11: 'P3', J12: 'P4', J13: 'P5', J14: 'P5', J15: 'P6', J16: 'P6',
    J17: 'P2', J18: 'P3', J19: 'P4', J20: 'P3', J21: 'P3', J22: 'P4', J23: 'P5', J24: 'P2',
    J25: 'P3', J26: 'P6', J27: 'P4', J28: 'P5',
  };
  for (const spec of ui.SCREENS) {
    assert.equal(spec.phase, expected[spec.id], `${spec.id} ${spec.slug}: phase drifted from the roadmap`);
  }
  // The two the user called out explicitly.
  assert.equal(ui.specBySlug('share-card-preview').phase, 'P6', 'share cards ship with the social layer (P6)');
  assert.equal(ui.specBySlug('privacy-receipt').phase, 'P5', 'the receipt ships with the connectors (P5)');
  // PHASES must cover the inventory exactly once.
  const covered = ui.PHASES.flatMap((p) => p.items);
  assert.equal(covered.length, 28);
  assert.deepEqual([...covered].sort(), ui.SCREENS.map((s) => s.id).sort());
  for (const phase of ui.PHASES) {
    for (const id of phase.items) assert.equal(ui.SCREENS.find((s) => s.id === id).phase, phase.id);
  }
});

test('the tab bar is the five sections, in order, on every tab screen', () => {
  assert.deepEqual(ui.TAB_ITEMS.map((t) => t.label), ['Home', 'Insights', 'Journey', 'Sessions', 'You']);
  const tabScreens = ui.SCREENS.filter((s) => s.tab);
  assert.ok(tabScreens.length >= 15, 'most screens live under a tab');
  for (const spec of tabScreens) {
    assert.ok(ui.TAB_ITEMS.some((t) => t.id === spec.tab), `${spec.slug} points at unknown tab "${spec.tab}"`);
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(ui.renderScreen(spec, ui.PERSONAS[1], ui.createTheme('dark'), 'default'));
    });
    // Find the tab bar itself (role="tablist") and read only its children: the
    // Private | Public control is also a tablist-shaped control, and counting every
    // role="tab" on the screen would conflate the two.
    const tree = renderer.toJSON();
    let bar = null;
    (function find(node) {
      if (!node || typeof node !== 'object' || bar) return;
      if (Array.isArray(node)) return node.forEach(find);
      if ((node.props?.role ?? node.props?.accessibilityRole) === 'tablist' && node.props?.['aria-label'] === 'Sections') bar = node;
      find(node.children);
    })(tree);
    assert.ok(bar, `${spec.slug} must render the tab bar`);
    const tabs = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if ((node.props?.role ?? node.props?.accessibilityRole) === 'tab') tabs.push(node.props);
      walk(node.children);
    })(bar);
    assert.equal(tabs.length, 5, `${spec.slug} must render all five tabs (found ${tabs.length})`);
    assert.deepEqual(tabs.map((t) => t['aria-label'] ?? t.accessibilityLabel), ['Home', 'Insights', 'Journey', 'Sessions', 'You']);
    const selected = tabs.filter((t) => {
      const v = t['aria-selected'] ?? t.accessibilityState?.selected;
      return v === true || v === 'true';
    });
    assert.equal(selected.length, 1, `${spec.slug}: exactly one tab is selected`);
    assert.equal(selected[0]['aria-label'] ?? selected[0].accessibilityLabel, ui.TAB_ITEMS.find((x) => x.id === spec.tab).label);
    renderer.unmount();
  }
});

test('the demo-data chip is on screen whenever demo data is', () => {
  const screen = create(
    ui.renderScreen(ui.specBySlug('dashboard'), ui.PERSONAS[0], ui.createTheme('dark'), 'default'),
  );
  const text = JSON.stringify(screen.toJSON());
  assert.match(text, /DEMO DATA/, 'demo data must be labelled on the screen itself');
  assert.match(text, /Ananya/, 'and must name the persona whose data is showing');
  assert.match(text, /Not your data/i, 'the accessible name says it is not the user\'s data');
  screen.unmount();

  // Off when the app passes no persona (i.e. real data).
  const plain = create(
    React.createElement(ui.Screen, { title: 'Real', theme: ui.createTheme('dark') }, React.createElement(ui.Text, { theme: ui.createTheme('dark') }, 'x')),
  );
  assert.ok(!JSON.stringify(plain.toJSON()).includes('DEMO DATA'), 'a screen without demo must not claim demo');
  plain.unmount();
});

test('the Private | Public control shows both options and the consequence of each', () => {
  const seen = [];
  let setter;
  function Probe() {
    const [v, set] = React.useState('private');
    setter = set;
    seen.push(v);
    return React.createElement(ui.BoundaryToggle, {
      theme: ui.createTheme('dark'),
      value: v,
      onChange: set,
      consequence: v === 'private' ? 'Private consequence sentence.' : 'Public consequence sentence.',
    });
  }
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  const priv = JSON.stringify(renderer.toJSON());
  assert.match(priv, /Private/, 'the Private side is labelled, not just an icon');
  assert.match(priv, /Public/, 'the Public side is labelled');
  assert.match(priv, /Private consequence sentence/, 'the consequence for the current side is stated');
  TestRenderer.act(() => setter('public'));
  const pub = JSON.stringify(renderer.toJSON());
  assert.match(pub, /Public consequence sentence/, 'switching states the other consequence');
  assert.ok(!/\bDIP\b|\bPIP\b/.test(priv + pub), 'DIP/PIP are code terms and must never reach the UI');
  renderer.unmount();
});

test('every screen that can share renders the Private | Public control', () => {
  for (const slug of ['dashboard', 'connections', 'public-profile-editor', 'share-card-preview']) {
    const spec = ui.specBySlug(slug);
    const html = JSON.stringify(create(ui.renderScreen(spec, ui.PERSONAS[2], ui.createTheme('dark'), 'default')).toJSON());
    assert.match(html, /Private/, `${slug} must show the boundary`);
    assert.match(html, /Public/, `${slug} must show the boundary`);
  }
});

/* --------------------------------------------------------------- source ---- */

test('components carry no colour literals: every colour comes from the theme', () => {
  const dirs = [join(UI, 'src/primitives'), join(UI, 'src/patterns.tsx'), join(UI, 'screens')];
  const files = [];
  const walk = (p) => {
    const stat = readdirSync(p, { withFileTypes: true });
    for (const entry of stat) {
      const full = join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  for (const target of dirs) {
    if (target.endsWith('.tsx') || target.endsWith('.ts')) files.push(target);
    else walk(target);
  }
  assert.ok(files.length >= 5, 'expected the design system sources to be present');

  const offenders = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g)) {
      offenders.push(`${relative(ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `hardcoded colours in components:\n  ${offenders.join('\n  ')}`);
});

test('the design system never reaches the network, storage or analytics', () => {
  const source = readdirSync(join(UI, 'src'), { recursive: true })
    .filter((f) => /\.(ts|tsx)$/.test(String(f)))
    .map((f) => readFileSync(join(UI, 'src', String(f)), 'utf8'))
    .join('\n');
  for (const banned of [/fetch\s*\(/, /XMLHttpRequest/, /localStorage/, /AsyncStorage/, /analytics/i, /track\(/, /axios/]) {
    assert.ok(!banned.test(source), `design system must not use ${banned}`);
  }
});
