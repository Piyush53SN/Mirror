/**
 * packages/ui/tests/budget-suggestions-ui.test.mjs
 *
 * P4.4a: the Weekly Report shows "Set a 1h budget?" with Accept / Dismiss.
 *   - Nothing is created on mount or on render (no budget write without a tap).
 *   - Accept calls only acceptBudgetSuggestion; Dismiss calls only dismissBudgetSuggestion.
 *   - Neutral copy: no streak, guilt, or red-state wording.
 *   - No suggestions -> no card.
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
  const entry = join(OUT, 'entry-budget-suggestions-ui.tsx');
  const p = (x) => x.replace(/\\/g, '/');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { WeeklyReportSheet } from '${p(join(ROOT, 'apps/mobile/src/components/WeeklyReportSheet.tsx'))}';`,
      `export { MirrorAppContext } from '${p(join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx'))}';`,
      `export { computeWeeklyReport, suggestBudgets } from '${p(join(ROOT, 'packages/core-analytics/src/index.ts'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'budget-suggestions-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'budget-suggestions-ui.bundle.mjs')).href);
});

const MIN = 60_000;
const DAYS = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
const GUILT_RE = /\b(streak|streaks|shame|guilt|addicted|fail|failed|failing|warning|danger|exceeded|over budget)\b/i;

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

function buildContext(overrides = {}) {
  const dayTotals = DAYS.map((day) => ({
    day,
    source: 'stored_events',
    totals: [{ app: 'com.google.android.youtube', totalMs: 58 * MIN }],
  }));
  const weeklyReport = mod.computeWeeklyReport({
    endDay: '2026-11-03',
    dayTotals,
    sessions: [],
    recordedDays: DAYS,
    historyStartDay: DAYS[0],
    utcOffsetMinutes: 0,
    ignorePackages: [],
  });
  const suggestions = mod.suggestBudgets({
    endDay: '2026-11-03',
    dayTotals,
    recordedDays: DAYS,
    nowMs: Date.parse('2026-11-03T12:00:00Z'),
    appLabels: { 'com.google.android.youtube': 'YouTube' },
  });
  const calls = { accept: [], dismiss: [], save: 0 };
  return {
    calls,
    value: {
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      goals: [],
      goalsSummary: null,
      selectedDay: '2026-11-03',
      budgetWeekTotals: dayTotals,
      budgetRecordedDays: DAYS,
      dayScoredSessions: [],
      labels: { 'com.google.android.youtube': 'YouTube' },
      weeklyReport,
      budgetSuggestions: suggestions,
      acceptBudgetSuggestion: async (s) => {
        calls.accept.push(s.app);
        return { ok: true, value: { id: 'x', name: s.label, kind: 'app', packages: [s.app], period: 'daily', limitMs: s.suggestedLimitMs, enabled: true, createdAtMs: 0, updatedAtMs: 0 } };
      },
      dismissBudgetSuggestion: async (app) => {
        calls.dismiss.push(app);
      },
      saveBudget: async () => {
        calls.save += 1;
        return { ok: true };
      },
      ...overrides,
    },
  };
}

function mountSheet(value) {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        mod.ThemeProvider,
        null,
        React.createElement(
          mod.MirrorAppContext.Provider,
          { value },
          React.createElement(mod.WeeklyReportSheet, { open: true, onClose: () => {} }),
        ),
      ),
    );
  });
  return renderer;
}

test('P4.4a: "Set a 1h budget?" shows with Accept / Dismiss and never writes a budget on render', () => {
  const ctx = buildContext();
  const renderer = mountSheet(ctx.value);
  const card = renderer.root.findAll((el) => el.props?.['data-testid'] === 'weekly-budget-suggestions');
  assert.equal(card.length, 1, 'suggestion card is visible');
  const text = collectText(renderer.toJSON()).join(' ');
  assert.match(text, /Set a 1h budget\?/);
  assert.match(text, /YOU DECIDE/);
  assert.match(text, /Nothing is created unless you tap Accept/);
  assert.equal(GUILT_RE.test(text.replace(/Set a 1h budget\?/, '')), false, 'neutral copy only');
  assert.equal(ctx.calls.save, 0, 'no budget is written on render');
  assert.deepEqual(ctx.calls.accept, []);
  assert.deepEqual(ctx.calls.dismiss, []);
});

test('P4.4a: Accept creates only on tap (calls acceptBudgetSuggestion once, never dismiss)', async () => {
  const ctx = buildContext();
  const renderer = mountSheet(ctx.value);
  await TestRenderer.act(async () => {
    renderer.root.find((el) => el.props?.['data-testid'] === 'budget-suggestion-accept-com.google.android.youtube').props.onPress();
  });
  assert.deepEqual(ctx.calls.accept, ['com.google.android.youtube']);
  assert.deepEqual(ctx.calls.dismiss, []);
});

test('P4.4a: Dismiss records a 7-day dismissal only (never creates a budget)', async () => {
  const ctx = buildContext();
  const renderer = mountSheet(ctx.value);
  await TestRenderer.act(async () => {
    renderer.root.find((el) => el.props?.['data-testid'] === 'budget-suggestion-dismiss-com.google.android.youtube').props.onPress();
  });
  assert.deepEqual(ctx.calls.dismiss, ['com.google.android.youtube']);
  assert.deepEqual(ctx.calls.accept, []);
  assert.equal(ctx.calls.save, 0);
});

test('P4.4a: no suggestions -> no card', () => {
  const ctx = buildContext({ budgetSuggestions: [] });
  const renderer = mountSheet(ctx.value);
  assert.equal(
    renderer.root.findAll((el) => el.props?.['data-testid'] === 'weekly-budget-suggestions').length,
    0,
  );
});

function buildMulti() {
  const days = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
  const dayTotals = days.map((day) => ({
    day,
    source: 'stored_events',
    totals: [
      { app: 'x.big', totalMs: 180 * MIN },
      { app: 'x.mid', totalMs: 90 * MIN },
      { app: 'x.small', totalMs: 40 * MIN },
    ],
  }));
  const suggestions = mod.suggestBudgets({ endDay: '2026-11-03', dayTotals, recordedDays: days, nowMs: 0 });
  const calls = { accept: [], dismiss: [], save: 0 };
  const value = {
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    goals: [],
    goalsSummary: null,
    selectedDay: '2026-11-03',
    budgetWeekTotals: dayTotals,
    budgetRecordedDays: days,
    dayScoredSessions: [],
    labels: {},
    weeklyReport: mod.computeWeeklyReport({ endDay: '2026-11-03', dayTotals, sessions: [], recordedDays: days, historyStartDay: days[0], utcOffsetMinutes: 0, ignorePackages: [] }),
    budgetSuggestions: suggestions,
    acceptBudgetSuggestion: async (s) => {
      calls.accept.push(s.app);
      return { ok: true, value: {} };
    },
    dismissBudgetSuggestion: async (app) => {
      calls.dismiss.push(app);
    },
  };
  return { value, calls, suggestions };
}

test('P4.4-UX: up to three suggestions render; nothing is written on render', () => {
  const m = buildMulti();
  assert.equal(m.suggestions.length, 3);
  const r = mountSheet(m.value);
  assert.equal(m.calls.accept.length, 0, 'no accept on render');
  assert.equal(m.calls.dismiss.length, 0, 'no dismiss on render');
  assert.equal(r.root.findAll((el) => el.props?.['data-testid'] === 'budget-suggestions-accept-all').length, 1);
  for (const s of m.suggestions) {
    assert.equal(r.root.findAll((el) => el.props?.['data-testid'] === `budget-suggestion-accept-${s.app}`).length, 1);
    assert.equal(r.root.findAll((el) => el.props?.['data-testid'] === `budget-suggestion-dismiss-${s.app}`).length, 1);
  }
});

test('P4.4-UX: Accept all accepts each suggestion once, in order, only on tap', async () => {
  const m = buildMulti();
  const r = mountSheet(m.value);
  await TestRenderer.act(async () => {
    r.root.find((el) => el.props?.['data-testid'] === 'budget-suggestions-accept-all').props.onPress();
  });
  assert.deepEqual(m.calls.accept, ['x.big', 'x.mid', 'x.small']);
  assert.deepEqual(m.calls.dismiss, []);
});

test('P4.4-UX: per-item Dismiss dismisses only that app; per-item Accept accepts only that app', async () => {
  const m = buildMulti();
  const r = mountSheet(m.value);
  await TestRenderer.act(async () => {
    r.root.find((el) => el.props?.['data-testid'] === 'budget-suggestion-dismiss-x.mid').props.onPress();
  });
  assert.deepEqual(m.calls.dismiss, ['x.mid']);
  assert.deepEqual(m.calls.accept, []);
  await TestRenderer.act(async () => {
    r.root.find((el) => el.props?.['data-testid'] === 'budget-suggestion-accept-x.small').props.onPress();
  });
  assert.deepEqual(m.calls.accept, ['x.small']);
});
