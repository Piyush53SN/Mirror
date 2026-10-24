/**
 * a11y-label.test.mjs – ensures accessibilityLabel is always string, never array.
 * Reproduces crash: JSApplicationIllegalArgumentException: Error while updating property 'accessibilityLabel' of a view managed by RCTView, caused by ClassCastException: ReadableNativeArray cannot be cast to java.lang.String
 * Root cause: Pill children as array {a}{b} passed as accessibilityLabel array.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const create = (element) => {
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};

let ui;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-a11y.tsx');
  const { writeFileSync } = await import('node:fs');
  const ROOT = join(UI, '../..');
  writeFileSync(
    entry,
    `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';\nexport * from '${join(UI, 'screens/index.tsx').replace(/\\/g, '/')}';\nexport * from '${join(UI, 'screens/render.tsx').replace(/\\/g, '/')}';\nexport { MirrorTabShell } from '${join(ROOT, 'apps/mobile/src/MirrorTabShell.tsx').replace(/\\/g, '/')}';\nexport { MirrorAppContext } from '${join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx').replace(/\\/g, '/')}';\n`,
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'ui-a11y.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer'],
    logLevel: 'warning',
  });
  ui = await import(pathToFileURL(join(OUT, 'ui-a11y.mjs')).href);
});

function collectA11yLabels(tree) {
  const labels = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const props = node.props || {};
    if ('accessibilityLabel' in props || 'aria-label' in props) {
      const label = props['accessibilityLabel'] ?? props['aria-label'];
      labels.push({ label, type: typeof label, isArray: Array.isArray(label), nodeType: node.type });
    }
    if (node.children) walk(node.children);
  }
  walk(tree);
  return labels;
}

test('a11yTarget coerces array to string', () => {
  const target = ui.a11yTarget(['a', 'b'], ['hint1', 'hint2']);
  assert.equal(typeof target.accessibilityLabel, 'string', 'accessibilityLabel must be string');
  assert.equal(Array.isArray(target.accessibilityLabel), false, 'must not be array');
  assert.ok(target.accessibilityLabel.includes('a') && target.accessibilityLabel.includes('b'), 'should join array');
  assert.equal(typeof target.accessibilityHint, 'string');
});

test('Pill with array children does not produce array accessibilityLabel', () => {
  // This reproduces the crash: {lbl}{saving} as two adjacent JSX expressions = array children
  const renderer = create(React.createElement(ui.Pill, { theme: ui.createTheme() }, ['intentional', '…']));
  const json = renderer.toJSON();
  const labels = collectA11yLabels(json);
  for (const { label, isArray } of labels) {
    assert.equal(isArray, false, `Pill accessibilityLabel must not be array, got ${JSON.stringify(label)}`);
    assert.equal(typeof label, 'string', `Pill accessibilityLabel must be string, got ${typeof label}: ${JSON.stringify(label)}`);
  }
  renderer.unmount();
});

test('Pill with single string children has string accessibilityLabel', () => {
  const renderer = create(React.createElement(ui.Pill, { theme: ui.createTheme() }, 'intentional'));
  const json = renderer.toJSON();
  const labels = collectA11yLabels(json);
  assert.ok(labels.length > 0, 'should have accessibilityLabel');
  for (const { label } of labels) {
    assert.equal(typeof label, 'string');
  }
  renderer.unmount();
});

test('every interactive element in SCREENS has string accessibilityLabel (not array)', () => {
  const failures = [];
  for (const screen of ui.SCREENS) {
    const renderer = create(ui.renderScreen(screen, ui.PERSONAS[1], ui.createTheme('dark'), 'default'));
    const json = renderer.toJSON();
    const labels = collectA11yLabels(json);
    for (const { label, isArray, nodeType } of labels) {
      if (isArray) {
        failures.push(`${screen.slug}: ${nodeType} has array accessibilityLabel ${JSON.stringify(label)}`);
      }
      if (typeof label !== 'string') {
        failures.push(`${screen.slug}: ${nodeType} has non-string accessibilityLabel type=${typeof label} value=${JSON.stringify(label)}`);
      }
    }
    renderer.unmount();
  }
  assert.deepEqual(failures, [], `a11y label type failures:\n  ${failures.join('\n  ')}`);
});

function collectText(node, acc = []) {
  if (node === null || node === undefined) return acc;
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, acc));
    return acc;
  }
  if (typeof node === 'object' && node.children) {
    collectText(node.children, acc);
  }
  return acc;
}

function countLiveBlurNodes(node) {
  let count = 0;
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.props && n.props['data-live-blur'] === 'true') count += 1;
    if (n.children) walk(n.children);
  }
  walk(node);
  return count;
}

function makeMockMobileContext(overrides = {}) {
  const noopAsync = async () => {};
  return {
    activeTab: 'home',
    setActiveTab: () => {},
    permission: 'granted',
    setPermission: () => {},
    loading: false,
    error: null,
    lastCollect: 'collect: 12 events (12 new, 0 skipped), 0 unmatched events',
    collectingSince: '2026-10-25 09:00',
    keyMismatch: null,
    dismissKeyMismatch: () => {},
    resetStoredData: noopAsync,
    selectedDay: '2026-10-25',
    setSelectedDay: () => {},
    dayOptions: ['2026-10-25', '2026-10-24', '2026-10-23'],
    sessions: [],
    dailyTotals: [],
    labels: {},
    quality: {
      count: 0,
      byReason: {},
      measuredGapMs: 0,
      sentence: 'No collection gaps in this window.',
    },
    validation: null,
    singleDayRows: [],
    debugEvents: [{ packageName: 'org.wikipedia', typeName: 'ACTIVITY_RESUMED', eventType: 1, timeStamp: 1761364800000 }],
    honkaiDebug: [],
    invalidTop: [],
    copyStatus: null,
    scaledSessions: [],
    iqs: {
      id: 'iqs',
      metricsVersion: 2,
      value: null,
      max: 0,
      band: 'not measured',
      factors: [
        { id: 'session_length', label: 'Session length mix', points: 0, max: 25, tier: 'D', detail: 'Needs 5+ sittings.', measurable: false },
        { id: 'deliberate', label: 'Deliberate share', points: 0, max: 20, tier: 'D', detail: '0 of 5 labels.', measurable: false },
        { id: 'switching', label: 'Switching pressure', points: 0, max: 15, tier: 'D', detail: 'Needs 15 min.', measurable: false },
        { id: 'late_night', label: 'Late-night share', points: 0, max: 15, tier: 'D', detail: 'Needs 15 min.', measurable: false },
        { id: 'topic', label: 'Topic depth', points: 0, max: 25, tier: 'A', detail: 'No vectors.', measurable: false },
      ],
      confidence: {
        score: 0,
        level: 'none',
        coverage: 1,
        sample: 0,
        activeMs: 0,
        smallSample: true,
        labels: 0,
        reasons: ['No complete sittings in this window.'],
      },
      caveat: 'Not enough data to score. Mirror will not fill the gap with an estimate.',
    },
    curiosity: null,
    depthBands: [],
    dayScoredSessions: [],
    dayScoreGaps: [],
    evolution: {
      hasHistory: false,
      distinctDays: 1,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-25',
      lastDay: '2026-10-25',
      rows: [],
      summaryLine: 'Needs 3+ distinct local days.',
    },
    discovery: {
      hasHistory: false,
      distinctDays: 1,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-25',
      lastDay: '2026-10-25',
      totalHandoffs: 0,
      sustainedSessionCount: 0,
      shortBounceCount: 0,
      routes: [],
      repeatAppsCount: 0,
      singleDayAppsCount: 1,
      totalAppsVisited: 1,
      repeatSessionShare: 0,
      repeatShareMeasurable: false,
      topAppByTime: null,
      newTopicsOpened: { value: 'unavailable', detail: 'requires Tier A/B/C' },
      searchesStarted: { value: 'unavailable', detail: 'requires Tier A/B/C' },
      explicitLabels: { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 },
    },
    rabbitHole: {
      hasHistory: false,
      distinctDays: 1,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-25',
      lastDay: '2026-10-25',
      definitionText: '3+ consecutive short sittings.',
      clusterCount: 0,
      totalClusterSittings: 0,
      totalClusterMs: 0,
      lateNightShare: 0,
      lateNightShareMeasurable: false,
      clusterExplicitLabels: { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 },
      clusters: [],
      capabilities: {
        tierDCanDetect: ['3+ short sittings'],
        tierDCannotDetect: ['Search intent'],
        whatMirrorWillNotDo: 'Never penalises IQS.',
      },
    },
    focusWindows: {
      ready: false,
      distinctDays: 2,
      minDays: 21,
      minCellSessions: 5,
      cellsMeetingSampleFloor: 0,
      totalCells: 42,
      historyStartDay: '2026-10-24',
      lastDay: '2026-10-25',
      suggestedWindows: [],
      emptyStateTitle: 'Needs 3 weeks of data and 5 sittings per cell',
      emptyStateBody: 'Focus Windows waits for at least 21 distinct local days.',
      progressLabel: '2 of 21 local days · 0 of 42 cells at 5+ sittings',
      capabilities: {
        tierDCanShow: ['Weekday blocks'],
        tierDCannotShow: ['Topic focus'],
        nonDiagnosticRule: 'Purely descriptive phone-timing blocks.',
      },
    },
    whatIf: {
      hasBaseline: false,
      baselineTimeMs: 0,
      timeSource: 'sittings',
      smallSampleBaseline: true,
      baselineIqs: {
        id: 'iqs',
        metricsVersion: 2,
        value: null,
        max: 0,
        band: 'not measured',
        factors: [],
        confidence: { score: 0, level: 'none', coverage: 1, sample: 0, activeMs: 0, smallSample: true, labels: 0, reasons: [] },
        caveat: '',
      },
      measuredFactorSummary: [],
      unmeasuredFactorSummary: [],
      minimumActivityNote: null,
      scenarios: [],
      disclaimer: 'Estimate only.',
    },
    whatIfCapMin: 10,
    setWhatIfCapMin: () => {},
    whatIfQuietPreset: '23-05',
    setWhatIfQuietPreset: () => {},
    latestSyncOrphans: { total: 0, byEventType: [], byApp: [], newest: [] },
    raw24hOrphans: { total: 0, byEventType: [], byApp: [], newest: [] },
    showWhy: false,
    setShowWhy: () => {},
    showDebug: false,
    setShowDebug: () => {},
    buildTapCount: 3,
    handleBuildTap: () => {},
    intentLabels: {},
    labelSaving: null,
    expandedSessionId: null,
    setExpandedSessionId: () => {},
    labelOptIn: false,
    setLabelOptIn: () => {},
    orphanCount: 0,
    totalGaps: 0,
    p3Reliable: true,
    checkPermissionAndCollect: noopAsync,
    openSettings: () => {},
    saveSessionLabel: noopAsync,
    clearStoredLabels: noopAsync,
    copyRawEvents: noopAsync,
    ...overrides,
  };
}

test('mobile 5-tab shell renders string accessibilityLabels, short-history empty states, <=3 live blur layers, and 7-tap debug entry', () => {
  const tabs = ['home', 'insights', 'journey', 'sessions', 'you'];
  for (const activeTab of tabs) {
    const ctx = makeMockMobileContext({ activeTab, showWhy: activeTab === 'home' });
    const tree = React.createElement(
      ui.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        ui.MirrorAppContext.Provider,
        { value: ctx },
        React.createElement(ui.MirrorTabShell),
      ),
    );
    const renderer = create(tree);
    const json = renderer.toJSON();
    const labels = collectA11yLabels(json);
    assert.ok(labels.length >= 6, `${activeTab}: expected interactive accessibilityLabels`);
    for (const { label, isArray, nodeType } of labels) {
      assert.equal(isArray, false, `${activeTab}: ${nodeType} has array accessibilityLabel`);
      assert.equal(typeof label, 'string', `${activeTab}: ${nodeType} has non-string accessibilityLabel`);
      assert.ok(label.trim().length > 0, `${activeTab}: ${nodeType} has empty accessibilityLabel`);
    }

    const blurCount = countLiveBlurNodes(json);
    assert.ok(blurCount <= 3, `${activeTab}: live blur layers (${blurCount}) exceeded budget of 3`);

    const fullText = collectText(json).join(' ');
    for (const tabLabel of ['Home', 'Insights', 'Journey', 'Sessions', 'You']) {
      assert.ok(fullText.includes(tabLabel), `${activeTab}: TabBar missing ${tabLabel}`);
    }

    if (activeTab === 'journey') {
      // Short-history (< 3 days) must render explicit empty states, never disappear!
      assert.ok(fullText.includes('Interest Evolution'), 'Journey must keep Interest Evolution visible on <3d');
      assert.ok(fullText.includes('Discovery Journey'), 'Journey must keep Discovery Journey visible on <3d');
      assert.ok(fullText.includes('Rabbit Hole'), 'Journey must keep Rabbit Hole visible on <3d');
      assert.ok(fullText.includes('Learning arcs is unavailable'), 'Journey must keep Learning Arcs empty state visible');
      assert.ok(fullText.includes('Needs at least 3 days of local history'), 'Journey must show <3d empty state');
    }

    if (activeTab === 'insights') {
      assert.ok(fullText.includes('What-if Simulator'), 'Insights must keep What-if Simulator visible on 0-sitting day');
      assert.ok(fullText.includes('Curiosity vs Habit'), 'Insights must keep Curiosity vs Habit visible on <5 labels');
      assert.ok(fullText.includes('Depth & Sitting Length Mix'), 'Insights must keep Depth visible');
    }

    if (activeTab === 'sessions') {
      assert.ok(fullText.includes('No opens for 2026-10-25'), 'Sessions must show empty state when 0 opens');
    }

    if (activeTab === 'you') {
      assert.ok(fullText.includes('Focus Windows'), 'You must keep Focus Windows visible on <21d');
      assert.ok(fullText.includes('Needs 3 weeks of data and 5 sittings per cell'), 'You must show <21d empty state');
      assert.ok(fullText.includes('Tap 7 times for debug – build 3/7'), 'You must preserve 7-tap debug entry');
    }

    renderer.unmount();
  }

  // Verify Debug view renders cleanly when 7-tap threshold opens showDebug
  const debugRenderer = create(
    React.createElement(
      ui.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        ui.MirrorAppContext.Provider,
        { value: makeMockMobileContext({ showDebug: true }) },
        React.createElement(ui.MirrorTabShell),
      ),
    ),
  );
  const debugJson = debugRenderer.toJSON();
  const debugLabels = collectA11yLabels(debugJson);
  for (const { label, isArray } of debugLabels) {
    assert.equal(isArray, false);
    assert.equal(typeof label, 'string');
  }
  const debugText = collectText(debugJson).join(' ');
  assert.ok(debugText.includes('Close debug'), 'Debug screen must show Close debug control');
  debugRenderer.unmount();
});

test('mobile 5-tab shell populated cards, expanded session pills, TabBar switching, and 7-tap debug action keep string accessibilityLabels', () => {
  const switchedTabs = [];
  let buildTaps = 0;

  const populatedCtx = makeMockMobileContext({
    setActiveTab: (t) => switchedTabs.push(t),
    handleBuildTap: () => { buildTaps += 1; },
    dailyTotals: Array.from({ length: 8 }, (_, i) => ({
      app: `org.example.app${i}`,
      label: `App ${i + 1}`,
      totalMs: (8 - i) * 600_000,
    })),
    scaledSessions: [
      {
        id: 'sess-alpha-01',
        app: 'org.wikipedia',
        label: 'Wikipedia',
        start_ms: 1761364800000,
        end_ms: 1761364800000,
        duration_ms: 720_000,
        scaled_duration_ms: 0,
        isScaled: false,
      },
      {
        id: 'sess-beta-02',
        app: 'org.mozilla.firefox',
        label: 'Firefox',
        start_ms: 1761368400000,
        end_ms: 1761368400000,
        duration_ms: 480_000,
        scaled_duration_ms: 0,
        isScaled: false,
      },
    ],
    intentLabels: { 'sess-alpha-01': 'intentional' },
    labelSaving: 'sess-alpha-01',
    expandedSessionId: 'sess-alpha-01',
    iqs: {
      id: 'iqs',
      metricsVersion: 2,
      value: 44.5,
      max: 55,
      band: 'usage-only band',
      factors: [
        { id: 'session_length', label: 'Session length mix', points: 20, max: 25, tier: 'D', detail: '80% sustained.', measurable: true },
        { id: 'deliberate', label: 'Deliberate share', points: 0, max: 20, tier: 'D', detail: '1 of 5 labels.', measurable: false },
        { id: 'switching', label: 'Switching pressure', points: 11.5, max: 15, tier: 'D', detail: '3.2/h.', measurable: true },
        { id: 'late_night', label: 'Late-night share', points: 13, max: 15, tier: 'D', detail: '6% late night.', measurable: true },
        { id: 'topic', label: 'Topic depth', points: 0, max: 25, tier: 'A', detail: 'No vectors.', measurable: false },
      ],
      confidence: {
        score: 0.49,
        level: 'low',
        coverage: 1,
        sample: 18,
        activeMs: 2_400_000,
        smallSample: false,
        labels: 1,
        reasons: ['18 complete sittings (40 min sitting time).'],
      },
      caveat: 'Out of 55: deliberate share, topic depth are not measured.',
    },
    curiosity: {
      deepMs: 1_200_000,
      habitMs: 600_000,
      unlabeledMs: 600_000,
      switchesPerHour: 3.2,
      labelShare: 0.75,
    },
    dayScoredSessions: [{ id: 'sess-alpha-01', app: 'org.wikipedia', startMs: 1761364800000, endMs: 1761365520000 }],
    depthBands: [
      { id: '5-20m', label: '5 – 20 min', count: 1, share: 1, ms: 720_000 },
    ],
    evolution: {
      hasHistory: true,
      distinctDays: 5,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-21',
      lastDay: '2026-10-25',
      summaryLine: '2 apps across 5 days',
      rows: [
        {
          app: 'org.wikipedia',
          label: 'Wikipedia',
          activeDays: 4,
          sessionCount: 9,
          dominantBand: '5 – 20 min',
          trendLabel: 'Growing (limited history)',
          seenSinceText: 'Seen since 2026-10-21 (history starts 2026-10-21)',
        },
      ],
    },
    discovery: {
      hasHistory: true,
      distinctDays: 5,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-21',
      lastDay: '2026-10-25',
      totalHandoffs: 3,
      sustainedSessionCount: 9,
      shortBounceCount: 1,
      routes: [{ fromApp: 'org.mozilla.firefox', toApp: 'org.wikipedia', fromLabel: 'Firefox', toLabel: 'Wikipedia', count: 3, activeDays: 2 }],
      repeatAppsCount: 2,
      singleDayAppsCount: 1,
      totalAppsVisited: 3,
      repeatSessionShare: 0.78,
      repeatShareMeasurable: true,
      topAppByTime: { app: 'org.wikipedia', label: 'Wikipedia', totalMs: 1_800_000 },
      newTopicsOpened: { value: 'unavailable', detail: 'requires Tier A/B/C' },
      searchesStarted: { value: 'unavailable', detail: 'requires Tier A/B/C' },
      explicitLabels: { intentional: 1, mindless: 0, unsure: 0, decisive: 1, total: 1 },
    },
    rabbitHole: {
      hasHistory: true,
      distinctDays: 5,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-21',
      lastDay: '2026-10-25',
      definitionText: '3+ consecutive short sittings.',
      clusterCount: 1,
      totalClusterSittings: 3,
      totalClusterMs: 420_000,
      lateNightShare: 0,
      lateNightShareMeasurable: true,
      clusterExplicitLabels: { intentional: 1, mindless: 0, unsure: 0, decisive: 1, total: 1 },
      clusters: [{ id: 'rh-1', app: 'org.mozilla.firefox', label: 'Firefox', day: '2026-10-25', sittingCount: 3, totalSittingMs: 420_000 }],
      capabilities: {
        tierDCanDetect: ['3+ short sittings'],
        tierDCannotDetect: ['Search intent'],
        whatMirrorWillNotDo: 'Never penalises IQS.',
      },
    },
    focusWindows: {
      ready: true,
      distinctDays: 24,
      minDays: 21,
      minCellSessions: 5,
      cellsMeetingSampleFloor: 2,
      totalCells: 42,
      historyStartDay: '2026-10-02',
      lastDay: '2026-10-25',
      suggestedWindows: [
        { cellId: 'Mon-08-12', label: 'Mon 08:00–12:00', sessionCount: 8, distinctDays: 4, sustainedShare: 0.88, switchesPerHour: 3.1 },
      ],
      emptyStateTitle: null,
      emptyStateBody: null,
      progressLabel: '24 local days · 2 cells at 5+ sittings',
      capabilities: {
        tierDCanShow: ['Weekday blocks'],
        tierDCannotShow: ['Topic focus'],
        nonDiagnosticRule: 'Purely descriptive phone-timing blocks.',
      },
    },
    whatIf: {
      hasBaseline: true,
      baselineTimeMs: 2_400_000,
      timeSource: 'os_aggregate',
      smallSampleBaseline: false,
      baselineIqs: {
        id: 'iqs',
        metricsVersion: 2,
        value: 44.5,
        max: 55,
        band: 'usage-only band',
        factors: [],
        confidence: { score: 0.49, level: 'low', coverage: 1, sample: 18, activeMs: 2_400_000, smallSample: false, labels: 1, reasons: [] },
        caveat: '',
      },
      measuredFactorSummary: ['Session length mix 20/25', 'Switching pressure 11.5/15', 'Late-night share 13/15'],
      unmeasuredFactorSummary: ['Deliberate share (1/5 labels)', 'Topic depth (Tier A/B/C)'],
      minimumActivityNote: null,
      scenarios: [
        {
          id: 'cap-sitting',
          title: 'Cap individual sittings at 10 min',
          badge: 'Estimate',
          timeEstimateLabel: 'Estimate: −2m (40m → 38m)',
          iqsEstimateLabel: 'Estimate: 44.5 → 44.5 / 55 (0.0 pts)',
          noChangeReason: 'Time drops by 2m without changing under-8s bounce share or switching.',
          assumption: 'Assumes sittings longer than 10m end at 10m without extra re-opens.',
          estimatedIqs: { measuredFactors: [{ id: 'session_length', estimateLabel: 'Session length 20/25 (Estimate)' }] },
        },
      ],
      disclaimer: 'Counterfactual arithmetic only.',
    },
  });

  for (const activeTab of ['home', 'insights', 'journey', 'sessions', 'you']) {
    const renderer = create(
      React.createElement(
        ui.ThemeProvider,
        { initialTheme: 'dark' },
        React.createElement(
          ui.MirrorAppContext.Provider,
          { value: { ...populatedCtx, activeTab } },
          React.createElement(ui.MirrorTabShell),
        ),
      ),
    );
    const json = renderer.toJSON();
    for (const { label, isArray, nodeType } of collectA11yLabels(json)) {
      assert.equal(isArray, false, `populated ${activeTab}: ${nodeType} array label`);
      assert.equal(typeof label, 'string', `populated ${activeTab}: ${nodeType} non-string label`);
    }

    if (activeTab === 'you') {
      // Trigger TabBar tabs + 7-tap debug button
      const buttons = renderer.root.findAll((el) => el.type === 'button');
      const homeTabBtn = buttons.find((b) => b.props['aria-label'] === 'Home');
      assert.ok(homeTabBtn, 'expected Home tab button');
      TestRenderer.act(() => {
        homeTabBtn.props.onPress();
      });
      const debugCardBtn = buttons.find((b) => String(b.props['aria-label'] ?? '').startsWith('What this build is'));
      assert.ok(debugCardBtn, 'expected 7-tap What this build is button');
      for (let i = 0; i < 7; i += 1) {
        TestRenderer.act(() => {
          debugCardBtn.props.onPress();
        });
      }
    }
    renderer.unmount();
  }

  assert.deepEqual(switchedTabs, ['home'], 'TabBar click should invoke setActiveTab("home")');
  assert.equal(buildTaps, 7, '7 taps on What this build is should invoke handleBuildTap 7 times');
});
