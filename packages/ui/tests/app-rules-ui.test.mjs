/**
 * packages/ui/tests/app-rules-ui.test.mjs
 *
 * P4.4b: the Sessions "App rules" card and per-sitting rule actions.
 *   - Lists the user's own rules, labelled as Tier D feedback and as the user's rule.
 *   - Writes nothing on render. Removal happens only on a tap (one tap).
 *   - Copy is neutral and says what a rule counts (no guesses, no guilt).
 *   - Sessions tab calls saveAppRule / removeAppRule only from press handlers.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const entry = join(OUT, 'entry-app-rules-ui.tsx');
  const p = (x) => x.replace(/\\/g, '/');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { AppRulesCard } from '${p(join(ROOT, 'apps/mobile/src/components/AppRulesCard.tsx'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'app-rules-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'app-rules-ui.bundle.mjs')).href);
});

const GUILT_RE = /\b(streak|streaks|shame|guilt|addicted|fail|failed|failing|warning|danger|exceeded|over budget|bad|good job)\b/i;

function collectText(node) {
  const out = [];
  (function walk(n) {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') return void out.push(String(n));
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.children) n.children.forEach(walk);
    if (n.props?.children) walk(n.props.children);
  })(node);
  return out;
}

const YT = 'com.google.android.youtube';
const WIKI = 'org.wikipedia';

function mount(props) {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        mod.ThemeProvider,
        null,
        React.createElement(mod.AppRulesCard, props),
      ),
    );
  });
  return renderer;
}

function baseProps(overrides = {}) {
  const calls = { remove: [] };
  return {
    calls,
    props: {
      rules: {
        [YT]: { label: 'mindless', setAtMs: 1 },
        [WIKI]: { label: 'intentional', setAtMs: 2 },
      },
      coverage: {
        [YT]: { label: 'mindless', ruleSittings: 3, keptOwnLabels: 1 },
        [WIKI]: { label: 'intentional', ruleSittings: 0, keptOwnLabels: 0 },
      },
      appLabel: (app) => (app === YT ? 'YouTube' : app),
      onRemove: async (app) => {
        calls.remove.push(app);
      },
      ...overrides,
    },
  };
}

test('P4.4b: rules are listed as the user\'s own, labelled Tier D, with coverage copy', () => {
  const { props } = baseProps();
  const renderer = mount(props);
  const text = collectText(renderer.toJSON()).join(' ');
  assert.match(text, /App rules/);
  assert.match(text, /your rules \(Tier D feedback\)/);
  assert.match(text, /YouTube · Always mindless/);
  assert.match(text, /Counts 3 unlabeled sittings \(including earlier days\) as mindless\./);
  assert.match(text, /1 sitting keeps your own label\./);
  assert.match(text, /No unlabeled sittings of this app yet\./);
  assert.match(text, /Mirror does not guess from how long you used it\./);
  assert.equal(GUILT_RE.test(text.replace(/Tier D feedback|Always (mindless|intentional)/g, '')), false, 'neutral copy only');
});

test('P4.4b: empty state says how to set a rule and creates nothing', () => {
  const { props, calls } = baseProps({ rules: {}, coverage: {} });
  const renderer = mount(props);
  const text = collectText(renderer.toJSON()).join(' ');
  assert.match(text, /No app rules yet\. Open a sitting and choose Always intentional or Always mindless for that app\./);
  assert.deepEqual(calls.remove, [], 'nothing is written on render');
});

test('P4.4b: removal happens on one tap and only removes that app', async () => {
  const { props, calls } = baseProps();
  const renderer = mount(props);
  assert.deepEqual(calls.remove, [], 'render alone removes nothing');
  const button = renderer.root.find(
    (el) => el.props?.accessibilityLabel === 'Remove the Always mindless rule for YouTube' && typeof el.props.onPress === 'function',
  );
  await TestRenderer.act(async () => {
    button.props.onPress();
  });
  assert.deepEqual(calls.remove, [YT]);
});

test('P4.4b: each rule row is addressable by test id (one row per app)', () => {
  const { props } = baseProps();
  const renderer = mount(props);
  assert.equal(renderer.root.findAll((el) => el.props?.testID === `app-rule-${YT}`).length >= 1, true);
  assert.equal(renderer.root.findAll((el) => el.props?.testID === `app-rule-${WIKI}`).length >= 1, true);
});

test('P4.4b: rule writes are only reachable from press handlers (static check)', () => {
  const sessions = readFileSync(join(ROOT, 'apps/mobile/src/tabs/SessionsTab.tsx'), 'utf8');
  const card = readFileSync(join(ROOT, 'apps/mobile/src/components/AppRulesCard.tsx'), 'utf8');
  const writeLines = sessions
    .split('\n')
    .filter((l) => /saveAppRule\?\.\(|removeAppRule\?\.\(/.test(l));
  assert.ok(writeLines.length >= 3, 'Sessions wires save and remove');
  for (const line of writeLines) {
    assert.match(line, /onPress=\{|onRemove=\{/, `write only inside a press handler: ${line.trim()}`);
  }
  // The card calls onRemove only inside onPress.
  const removeCalls = card.split('\n').filter((l) => /onRemove\(/.test(l));
  assert.equal(removeCalls.length, 1);
  assert.match(removeCalls[0], /onPress=\{/);
  // Sessions never writes on render: no bare call at top level of the component.
  assert.doesNotMatch(sessions, /useEffect\([^)]*\)[^;]*saveAppRule/s);
});
