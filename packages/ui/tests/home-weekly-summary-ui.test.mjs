/**
 * packages/ui/tests/home-weekly-summary-ui.test.mjs
 *
 * P4.4-UX (1): Home weekly summary card + one-time first-run reminder offer.
 *   - Totals/top app come from the weekly-report engine (day-clipped foreground).
 *   - Change vs last week appears only when the engine has both weeks' recorded days.
 *   - Offer: shown once; "Turn on" uses the opt-in path (only on tap); "Not now" records
 *     the answer; reminders stay OFF unless turned on; no guilt, streak, or red copy.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '../..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-home-weekly-summary-ui.tsx');
  const p = (x) => x.replace(/\\/g, '/');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { WeeklySummaryCard } from '${p(join(ROOT, 'apps/mobile/src/components/WeeklySummaryCard.tsx'))}';`,
      `export { MirrorAppContext } from '${p(join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx'))}';`,
      `export { computeWeeklyReport } from '${p(join(ROOT, 'packages/core-analytics/src/index.ts'))}';`,
      `export { DEFAULT_WEEKLY_REPORT_PREFS } from '${p(join(ROOT, 'packages/store/src/index.ts'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'home-weekly-summary-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'home-weekly-summary-ui.bundle.mjs')).href);
});

const MIN = 60_000;
const GUILT_RE = /\b(streak|streaks|shame|guilt|addicted|fail|failed|failing|warning|danger|exceeded|over budget|behind|missed)\b/i;

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

function daysBack(endDay, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const t = Date.parse(`${endDay}T00:00:00Z`) - i * 86_400_000;
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function buildValue({ days, prefs, weekMinPerDay = 60, priorMinPerDay = 30, updateResult } = {}) {
  const endDay = '2026-11-03';
  const all = daysBack(endDay, 14);
  const recorded = all.slice(-days);
  const dayTotals = all.map((day) => {
    const isCurrent = day >= daysBack(endDay, 7)[0];
    const min = isCurrent ? weekMinPerDay : priorMinPerDay;
    return { day, source: 'stored_events', totals: [{ app: 'com.google.android.youtube', totalMs: min * MIN }] };
  });
  const weeklyReport = mod.computeWeeklyReport({
    endDay,
    dayTotals: dayTotals.filter((d) => recorded.includes(d.day)),
    sessions: [],
    recordedDays: recorded,
    historyStartDay: recorded[0],
    utcOffsetMinutes: 0,
    ignorePackages: [],
    appLabels: { 'com.google.android.youtube': 'YouTube' },
  });
  const calls = { update: [], show: 0 };
  return {
    calls,
    value: {
      weeklyReport,
      setShowWeeklyReport: () => {
        calls.show += 1;
      },
      weeklyReportPrefs: { ...mod.DEFAULT_WEEKLY_REPORT_PREFS, ...(prefs ?? {}) },
      updateWeeklyReportPrefs: async (patch) => {
        calls.update.push(patch);
        return updateResult ? updateResult(patch) : { ok: true, prefs: { ...mod.DEFAULT_WEEKLY_REPORT_PREFS, ...patch } };
      },
    },
  };
}

function mount(value) {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        mod.ThemeProvider,
        null,
        React.createElement(
          mod.MirrorAppContext.Provider,
          { value },
          React.createElement(mod.WeeklySummaryCard),
        ),
      ),
    );
  });
  return renderer;
}

const press = (renderer, id) =>
  TestRenderer.act(async () => {
    renderer.root.find((el) => el.props?.['data-testid'] === id).props.onPress();
  });

test('summary: total, top app, and partial-week note come from the engine; no comparison below 14 recorded days', () => {
  const ctx = buildValue({ days: 7 });
  const r = mount(ctx.value);
  const text = collectText(r.toJSON()).join(' ');
  assert.match(text, /This week/);
  assert.match(text, /7h/); // 60 min x 7 days = 7h
  assert.match(text, /Top app: YouTube/);
  assert.equal(ctx.value.weeklyReport.hasPriorWeekComparison, false);
  assert.doesNotMatch(text, /vs last week/);
  assert.match(text, /Prior-week comparison unlocks at 14\+ recorded local days/);
  assert.equal(GUILT_RE.test(text), false);
});

test('summary: change vs last week appears only when both weeks have enough recorded days (14)', () => {
  const ctx = buildValue({ days: 14 });
  const r = mount(ctx.value);
  const text = collectText(r.toJSON()).join(' ');
  assert.equal(ctx.value.weeklyReport.hasPriorWeekComparison, true);
  assert.match(text, /Up 3h 30m \(\+100%\) vs last week/);
  assert.equal(GUILT_RE.test(text), false);
});

test('summary: tapping opens the full report', () => {
  const ctx = buildValue({ days: 7 });
  const r = mount(ctx.value);
  const label = r.root.find((el) => el.props?.children === 'Open full report' && typeof el.type === 'function' || el.props?.children === 'Open full report');
  let node = label;
  while (node && typeof node.props?.onPress !== 'function') node = node.parent;
  assert.ok(node, 'link button with onPress found');
  TestRenderer.act(() => node.props.onPress());
  assert.equal(ctx.calls.show, 1);
});

test('offer: shown once by default; "Not now" records the answer and never enables reminders', async () => {
  const ctx = buildValue({ days: 7 });
  const r = mount(ctx.value);
  assert.equal(r.root.findAll((el) => el.props?.['data-testid'] === 'home-weekly-reminder-offer').length, 1);
  await press(r, 'weekly-offer-not-now');
  assert.deepEqual(ctx.calls.update, [{ reminderOfferSeen: true }]);
  assert.equal(
    ctx.calls.update.some((p) => p.reminderEnabled === true),
    false,
    'declining never turns reminders on',
  );
});

test('offer: "Turn on" goes through the opt-in path only on tap, and records the answer', async () => {
  const ctx = buildValue({ days: 7 });
  const r = mount(ctx.value);
  assert.deepEqual(ctx.calls.update, [], 'nothing is written on render');
  await press(r, 'weekly-offer-turn-on');
  assert.deepEqual(ctx.calls.update, [{ reminderEnabled: true, reminderOfferSeen: true }]);
});

test('offer: permission denied keeps reminders off and still records the one-time offer as answered', async () => {
  const ctx = buildValue({
    days: 7,
    updateResult: (patch) =>
      patch.reminderEnabled
        ? { ok: false, reason: 'permission_denied', prefs: { ...mod.DEFAULT_WEEKLY_REPORT_PREFS } }
        : { ok: true, prefs: { ...mod.DEFAULT_WEEKLY_REPORT_PREFS, ...patch } },
  });
  const r = mount(ctx.value);
  await press(r, 'weekly-offer-turn-on');
  assert.deepEqual(ctx.calls.update, [
    { reminderEnabled: true, reminderOfferSeen: true },
    { reminderOfferSeen: true },
  ]);
  const text = collectText(r.toJSON()).join(' ');
  assert.match(text, /reminder stays off/);
});

test('offer: hidden once answered, or when a reminder is already on', () => {
  const seen = mount(buildValue({ days: 7, prefs: { reminderOfferSeen: true } }).value);
  assert.equal(seen.root.findAll((el) => el.props?.['data-testid'] === 'home-weekly-reminder-offer').length, 0);
  const on = mount(buildValue({ days: 7, prefs: { reminderEnabled: true } }).value);
  assert.equal(on.root.findAll((el) => el.props?.['data-testid'] === 'home-weekly-reminder-offer').length, 0);
});

test('offer copy is opt-in, off by default, quiet-hours aware, and neutral', () => {
  const r = mount(buildValue({ days: 7 }).value);
  const text = collectText(r.toJSON()).join(' ');
  assert.match(text, /off by default/);
  assert.match(text, /quiet hours \(23:00–05:00\) are respected/);
  assert.equal(GUILT_RE.test(text), false);
});
