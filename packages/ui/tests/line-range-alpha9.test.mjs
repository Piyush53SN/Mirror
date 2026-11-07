/**
 * packages/ui/tests/line-range-alpha9.test.mjs
 *
 * The Home line chart (7 days, 14 days, Month), rendered through the real WeekTrendCard with a
 * context provider. Written first as reproductions of the alpha.8 bugs, then kept as guards:
 *   R1  selecting a day must not move the window (it ends today, not on the selected day)
 *   R2  the "at least 3 recorded days" empty state only when total history is under 3 days
 *   R3  switching 7 days / 14 days / Month keeps the chart mounted (no "Loading" replacement)
 *   R4  30 alternating day taps: chart stays mounted, window does not change, no loading state
 *   R5  a day inside the window fetches nothing; a range is cached and not re-fetched
 *   R6  the 7-day window is the same whichever day is selected (anchored on today)
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

let m;
const TODAY = '2026-11-08';
const HISTORY_START = '2026-10-01';

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const p = (x) => x.replace(/\\/g, '/');
  const entry = join(OUT, 'entry-line-range.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { WeekTrendCard } from '${p(join(ROOT, 'apps/mobile/src/components/HomeCharts.tsx'))}';`,
      `export { MirrorAppContext } from '${p(join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx'))}';`,
      `export { rangeDaysChronological } from '${p(join(ROOT, 'apps/mobile/src/homeCharts.ts'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'line-range.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite', 'expo-secure-store'],
    logLevel: 'warning',
  });
  m = await import(pathToFileURL(join(OUT, 'line-range.mjs')).href);
});

/** Deterministic day total: 1h to 5h depending on the day of month. */
const valueOf = (day) => (Number(day.slice(8)) % 5 + 1) * 3600000;

/**
 * Harness: holds the selected day in state (as HomeTab does through the context), and gives the
 * card a context with a counting loader. `reportAnchoredOnSelected` reproduces the alpha.8 report,
 * which ended on the selected day.
 */
function setup({ initialSelected = TODAY, historyStart = HISTORY_START, recordedDayCount = 30, pending = false } = {}) {
  const calls = [];
  const loader = (days) => {
    calls.push(days.map((d) => d.day));
    const values = days.map((d) => (d.recorded ? valueOf(d.day) : null));
    return pending ? new Promise(() => {}) : Promise.resolve(values);
  };
  let setSel;
  function Harness() {
    const [sel, set] = React.useState(initialSelected);
    setSel = set;
    // Production (alpha.8) anchors the weekly report on the selected day: the window ends there.
    const days7 = m.rangeDaysChronological(sel, 7);
    const report = {
      isPartialWeek: false,
      perDay: days7.map((day) => ({ day, recorded: day >= historyStart, foregroundMs: valueOf(day), isProvisionalToday: day === TODAY })),
    };
    const ctx = {
      selectedDay: sel,
      setSelectedDay: set,
      loadDayTotalsRange: loader,
      recordedDayCount,
      weeklyReport: report,
    };
    return React.createElement(
      m.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        m.MirrorAppContext.Provider,
        { value: ctx },
        React.createElement(m.WeekTrendCard, { report, selectedDay: sel, todayDay: TODAY, historyStartDay: historyStart }),
      ),
    );
  }
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Harness));
  });
  const tree = () => JSON.stringify(renderer.toJSON());
  // Composite and host nodes share a testID: keep one node per day.
  const dayButtons = () => {
    const seen = new Map();
    for (const n of renderer.root.findAll((x) => typeof x.props.testID === 'string' && /^home-day-\d{4}-\d{2}-\d{2}$/.test(x.props.testID) && typeof x.props.onPress === 'function')) {
      if (!seen.has(n.props.testID)) seen.set(n.props.testID, n);
    }
    return [...seen.values()];
  };
  const press = (testID) => {
    const node = renderer.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
    assert.ok(node, `${testID} is pressable`);
    TestRenderer.act(() => node.props.onPress());
  };
  const tabPress = (label) => {
    const node = renderer.root.findAll((n) => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'tab')[0];
    assert.ok(node, `range tab "${label}" present`);
    TestRenderer.act(() => node.props.onPress());
  };
  const lineMounted = () => renderer.root.findAll((n) => n.props.testID === 'home-week-line').length > 0;
  return { renderer, calls, tree, dayButtons, press, tabPress, lineMounted, setSel: (d) => TestRenderer.act(() => setSel(d)) };
}

test('R1: selecting Mon 2026-11-02 keeps Tue to Sun in the 7-day window', () => {
  const s = setup();
  s.press('home-day-2026-11-02');
  const days = s.dayButtons().map((n) => n.props.testID.replace('home-day-', ''));
  for (const d of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    assert.ok(days.includes(d), `${d} must stay in the window after selecting 2026-11-02 (window: ${days.join(', ')})`);
  }
});

test('R1b: the highlight follows the selection; the window does not', () => {
  const s = setup();
  s.press('home-day-2026-11-02');
  const sel = s.dayButtons().find((n) => n.props.testID === 'home-day-2026-11-02');
  assert.equal(sel.props.accessibilityState.selected, true, 'the selected day is highlighted');
  assert.equal(s.dayButtons().length, 7, 'still seven days');
});

test('R2: a window with no recorded days is drawn (not replaced) when total history has 3+ days', () => {
  // History holds 5 recorded days in total, but the selected window is before history starts.
  const s = setup({ initialSelected: '2026-10-02', historyStart: '2026-10-01', recordedDayCount: 5 });
  assert.equal(s.lineMounted(), true, 'the chart is mounted');
  assert.doesNotMatch(s.tree(), /at least 3 recorded days/, 'no empty state from the window position');
});

test('R2b: under 3 recorded days in total, the empty state is shown', () => {
  const s = setup({ recordedDayCount: 2 });
  assert.match(s.tree(), /at least 3 recorded days/, 'the honest empty state when history is too short');
});

test('R2c: days before history start are drawn as "before history"', () => {
  const s = setup({ initialSelected: '2026-10-03', historyStart: '2026-10-03', recordedDayCount: 30 });
  s.tabPress('14 days');
  assert.match(s.tree(), /before history/i, 'a pre-history day is labelled, not blank');
});

test('R3: switching 7 days, 14 days and Month keeps the chart mounted, with no Loading replacement', () => {
  const s = setup({ pending: true });
  s.tabPress('14 days');
  assert.equal(s.lineMounted(), true, 'chart mounted while 14 days loads');
  assert.doesNotMatch(s.tree(), /Loading this range/, 'no loading text replaces the chart');
  s.tabPress('Month');
  assert.equal(s.lineMounted(), true, 'chart mounted for Month too');
  s.tabPress('7 days');
  assert.equal(s.lineMounted(), true);
});

test('R4: 30 alternating day taps never unmount the chart, show loading, or move the window', async () => {
  const s = setup({ recordedDayCount: 30 });
  // Let the first load finish, as it does on a real Home before the user taps.
  await TestRenderer.act(async () => {});
  const before = s.dayButtons().map((n) => n.props.testID);
  const picks = ['2026-11-02', '2026-11-05'];
  for (let i = 0; i < 30; i += 1) {
    s.press(`home-day-${picks[i % 2]}`);
    assert.equal(s.lineMounted(), true, `chart mounted after tap ${i + 1}`);
    assert.doesNotMatch(s.tree(), /Loading this range|needs at least|at least 3 recorded/, `no loading or empty state after tap ${i + 1}`);
    assert.doesNotMatch(s.tree(), /line-skeleton/, `no skeleton after tap ${i + 1}`);
    assert.deepEqual(s.dayButtons().map((n) => n.props.testID), before, `window unchanged after tap ${i + 1}`);
  }
  await TestRenderer.act(async () => {});
});

test('R7: a stale response for an older range is ignored; the latest range is what shows', async () => {
  const pendingResolvers = [];
  const calls = [];
  const loader = (days) => {
    calls.push(days.length);
    return new Promise((resolve) => pendingResolvers.push({ n: days.length, days, resolve }));
  };
  let setSel;
  function Harness() {
    const [sel, set] = React.useState(TODAY);
    setSel = set;
    const ctx = { selectedDay: sel, setSelectedDay: set, loadDayTotalsRange: loader, recordedDayCount: 30 };
    return React.createElement(m.ThemeProvider, { initialTheme: 'light' }, React.createElement(m.MirrorAppContext.Provider, { value: ctx }, React.createElement(m.WeekTrendCard, { selectedDay: sel, todayDay: TODAY, historyStartDay: HISTORY_START })));
  }
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Harness));
  });
  const tabPress = (label) => {
    const node = renderer.root.findAll((n) => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'tab')[0];
    TestRenderer.act(() => node.props.onPress());
  };
  // The 7-day request is in flight; switch to Month before it returns.
  tabPress('Month');
  const monthReq = pendingResolvers[pendingResolvers.length - 1];
  const weekReq = pendingResolvers[0];
  // The latest request (Month) answers first, then the stale 7-day request answers late.
  await TestRenderer.act(async () => {
    monthReq.resolve(monthReq.days.map((d) => (d.recorded ? 3600000 : null)));
  });
  await TestRenderer.act(async () => {
    weekReq.resolve(weekReq.days.map(() => 1));
  });
  assert.equal(renderer.root.findAll((n) => n.props.testID === 'line-skeleton').length, 0, 'the latest request finished');
  const line = renderer.root.findAll((n) => n.props.testID === 'home-week-line' && Array.isArray(n.props.points))[0];
  assert.ok(line, 'chart mounted');
  const recordedValues = line.props.points.filter((p) => p.value !== null).map((p) => p.value);
  assert.ok(recordedValues.length > 0 && recordedValues.every((v) => v === 3600000), 'the Month values are shown, not the stale 1 ms ones');
});

test('R5: a day inside the window fetches nothing; the 14-day range is loaded once and cached', async () => {
  const s = setup({ recordedDayCount: 30 });
  s.tabPress('14 days');
  await TestRenderer.act(async () => {});
  const afterLoad = s.calls.length;
  // Changing the selected day inside the 14-day window must not fetch. 14 and 30-day days are
  // reached through the chart itself (tap or drag), so select through its onSelectIndex.
  const idx = m.rangeDaysChronological(TODAY, 14).indexOf('2026-11-02');
  const chart = s.renderer.root.findAll((n) => n.props.testID === 'home-week-line' && typeof n.props.onSelectIndex === 'function')[0];
  assert.ok(chart, 'the 14-day chart is pressable');
  TestRenderer.act(() => chart.props.onSelectIndex(idx));
  await TestRenderer.act(async () => {});
  assert.equal(s.calls.length, afterLoad, 'selecting a day inside the window fetches nothing');
  // Going back to 7 days and then 14 again must not re-fetch days already loaded.
  s.tabPress('7 days');
  s.tabPress('14 days');
  await TestRenderer.act(async () => {});
  const refetched = s.calls.slice(afterLoad).flat();
  assert.equal(refetched.length, 0, `cached days are not re-fetched (fetched: ${refetched.join(', ')})`);
});

test('R6: the 7-day window is the same whichever day is selected (anchored on today)', () => {
  const a = setup({ initialSelected: TODAY });
  const aDays = a.dayButtons().map((n) => n.props.testID);
  const b = setup({ initialSelected: '2026-11-02' });
  const bDays = b.dayButtons().map((n) => n.props.testID);
  assert.deepEqual(bDays, aDays, 'the window does not depend on the selected day');
});
