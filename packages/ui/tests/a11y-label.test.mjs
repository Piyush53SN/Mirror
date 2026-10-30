/**
 * a11y-label.test.mjs – verifies string accessibilityLabels, TalkBack spoken labels,
 * Frosted Horizon 5-tab layout & safe-area clearance, plain-language UI (zero J-codes / P3 /
 * debug-tap hints), fixed 0–100 score scale with separate unmeasured parts & confidence explanation,
 * "Coming with more data" empty tabs, revoked Usage Access banner/dismissal, Keystore invalidation
 * reset audit, and typed "DELETE" confirmation.
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
    `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';\nexport * from '${join(UI, 'screens/index.tsx').replace(/\\/g, '/')}';\nexport * from '${join(UI, 'screens/render.tsx').replace(/\\/g, '/')}';\nexport { MirrorTabShell } from '${join(ROOT, 'apps/mobile/src/MirrorTabShell.tsx').replace(/\\/g, '/')}';\nexport { MirrorAppContext, lastNDays, formatSpokenDay } from '${join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx').replace(/\\/g, '/')}';\nexport { sessionize, computeInterestEvolution, computeDiscoveryJourney, computeRabbitHoles } from '${join(ROOT, 'packages/core-analytics/src/index.ts').replace(/\\/g, '/')}';\n`,
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
  const renderer = create(React.createElement(ui.Pill, { theme: ui.createTheme() }, ['intentional', '…']));
  const json = renderer.toJSON();
  const labels = collectA11yLabels(json);
  for (const { label, isArray } of labels) {
    assert.equal(isArray, false, `Pill accessibilityLabel must not be array, got ${JSON.stringify(label)}`);
    assert.equal(typeof label, 'string', `Pill accessibilityLabel must be string, got ${typeof label}: ${JSON.stringify(label)}`);
  }
  renderer.unmount();
});

test('Pill with explicit accessibilityLabel overrides glyph/short visual label for TalkBack', () => {
  const renderer = create(
    React.createElement(
      ui.Pill,
      { theme: ui.createTheme(), accessibilityLabel: 'Today, October 25, 2026, selected' },
      'Today (10-25)',
    ),
  );
  const btn = renderer.root.find((el) => el.type === 'button');
  assert.equal(btn.props['aria-label'], 'Today, October 25, 2026, selected');
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
  const noopBoolAsync = async () => true;
  return {
    activeTab: 'home',
    setActiveTab: () => {},
    permission: 'granted',
    setPermission: () => {},
    permissionDismissed: false,
    dismissPermissionPrimer: () => {},
    showPermissionPrimer: () => {},
    insets: { top: 32, bottom: 24, left: 0, right: 0 },
    loading: false,
    error: null,
    lastCollect: 'collect: 12 events (12 new, 0 skipped), 0 unmatched events',
    collectingSince: '2026-10-25 09:00',
    lastSyncedAt: '09:00',
    keyMismatch: null,
    dismissKeyMismatch: () => {},
    resetStoredData: noopAsync,
    exportAllData: noopBoolAsync,
    lastReset: null,
    selectedDay: '2026-10-25',
    setSelectedDay: () => {},
    dayOptions: ['2026-10-25', '2026-10-24', '2026-10-23'],
    sessions: [],
    dailyTotals: [],
    dailyTotalsSource: 'os_events',
    hasEventsWithoutSittings: false,
    labels: {},
    quality: {
      count: 0,
      byReason: {},
      measuredGapMs: 0,
      sentence: 'No collection gaps in this window.',
    },
    validation: null,
    flaggedDiscrepancies: [],
    singleDayRows: [],
    tracedApp: 'com.openai.chatgpt',
    tracedAppIntervals: [],
    storeDayRowCounts: [],
    sessionRepairSnapshot: null,
    debugEvents: [{ packageName: 'org.wikipedia', typeName: 'ACTIVITY_RESUMED', eventType: 1, timeStamp: 1761364800000 }],
    honkaiDebug: [],
    invalidTop: [],
    copyStatus: null,
    scaledSessions: [],
    sittingSpanMs: 0,
    iqs: {
      id: 'iqs',
      metricsVersion: 3,
      value: null,
      max: 100,
      measuredMax: 0,
      unmeasuredMax: 100,
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
        explanation: 'Confidence is 0% (none): 0 sittings recorded today (at least 5 sittings or 15 min needed to score).',
        reasons: ['No complete sittings in this window.'],
      },
      caveat: 'Not enough data to score on the 0–100 scale. Mirror will not fill the gap with an estimate.',
    },
    curiosity: null,
    depthBands: [],
    dayScoredSessions: [],
    dayScoreGaps: [],
    evolution: {
      hasHistory: false,
      distinctDays: 1,
      minDays: 3,
      windowDays: 14,
      limitedHistory: true,
      historyStartDay: '2026-10-25',
      lastDay: '2026-10-25',
      caveat: 'Limited history (1 day).',
      rows: [],
    },
    discovery: {
      hasHistory: false,
      distinctDays: 1,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-25',
      lastDay: '2026-10-25',
      caveat: 'Limited history (1 day).',
      topRoutes: [],
      recentAppearances: [],
      explicitLabelCount: 0,
      minExplicitLabels: 5,
      explicitLabelsReady: false,
    },
    rabbitHole: {
      hasHistory: false,
      distinctDays: 1,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-25',
      lastDay: '2026-10-25',
      caveat: 'Limited history (1 day).',
      clusters: [],
    },
    focusWindows: {
      ready: false,
      distinctDays: 2,
      minDays: 21,
      minCellSessions: 5,
      qualifyingCells: 0,
      totalCells: 8,
      historyStartDay: '2026-10-24',
      lastDay: '2026-10-25',
      windows: [],
      summary: '',
      caveat: '',
      emptyStateTitle: 'Needs 3 weeks of data and 5 sittings per cell',
      emptyStateDetail: 'Focus Windows waits for at least 21 distinct local days.',
      progressLabel: '2 of 21 local days · 0 of 8 cells at 5+ sittings',
    },
    whatIf: {
      hasBaseline: false,
      baselineTimeMs: 0,
      sittingTimeMs: 0,
      timeSource: 'sittings',
      smallSampleBaseline: true,
      baselineIqs: {
        id: 'iqs',
        metricsVersion: 3,
        value: null,
        max: 100,
        measuredMax: 0,
        unmeasuredMax: 100,
        band: 'not measured',
        factors: [],
        confidence: {
          score: 0,
          level: 'none',
          coverage: 1,
          sample: 0,
          activeMs: 0,
          smallSample: true,
          labels: 0,
          explanation: 'Confidence is 0% (none).',
          reasons: [],
        },
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
    saveIntentLabel: noopAsync,
    clearStoredLabels: noopAsync,
    orphanCount: 0,
    totalGaps: 0,
    p3Reliable: true,
    checkPermissionAndCollect: noopAsync,
    openSettings: () => {},
    copyRawEvents: noopAsync,
    shareDiagnosticReport: noopAsync,
    ...overrides,
  };
}

test('mobile 5-tab shell hides empty tabs behind "Coming with more data", removes J-codes / P3 / debug-tap hints, and preserves spoken TalkBack labels', () => {
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
      assert.doesNotMatch(label, /●/, `${activeTab}: accessibilityLabel must not contain raw bullet glyph: ${label}`);
      assert.doesNotMatch(label, /Tap 7 times/i, `${activeTab}: accessibilityLabel must not reveal debug tap hint`);
    }

    const blurCount = countLiveBlurNodes(json);
    assert.ok(blurCount <= 3, `${activeTab}: live blur layers (${blurCount}) exceeded budget of 3`);

    const fullText = collectText(json).join(' ');
    for (const tabLabel of ['Home', 'Insights', 'Journey', 'Sessions', 'You']) {
      assert.ok(fullText.includes(tabLabel), `${activeTab}: TabBar missing ${tabLabel}`);
    }

    // Zero J-codes, zero "P3" / "P3 cards" wording, and zero "Tap 7 times" hints anywhere in user-facing UI
    assert.doesNotMatch(fullText, /\bJ([1-9]|1[0-9]|2[0-8])\b/, `${activeTab} must not show internal J-codes`);
    assert.doesNotMatch(fullText, /\bP3\b/, `${activeTab} must not show internal "P3" phase codes`);
    assert.doesNotMatch(fullText, /Tap 7 times/i, `${activeTab} must not show debug-tap hint`);

    if (activeTab === 'home') {
      const plainSentence = renderer.root.findAll((el) => el.props?.['data-testid'] === 'home-plain-sentence');
      assert.equal(plainSentence.length, 1, 'Home must render plain-language summary sentence card');
      assert.ok(fullText.includes('DAY IN PLAIN WORDS'), 'Home must show plain-language summary heading');
      // DayPickerStrip spoken label check
      assert.ok(
        labels.some((l) => l.label.includes('October 25, 2026, selected')),
        'DayPickerStrip must provide spoken date accessibilityLabel',
      );
    }

    if (activeTab === 'journey') {
      assert.ok(fullText.includes('Coming with more data'), 'Empty Journey (<3d) must show "Coming with more data"');
      assert.ok(fullText.includes('Needs at least 3 days of local history'), 'Journey must explain 3-day requirement');
      assert.ok(!fullText.includes('Discovery Journey'), 'Empty Journey must hide empty individual sub-cards behind unified card');
    }

    if (activeTab === 'insights') {
      assert.ok(fullText.includes('Coming with more data'), 'Empty Insights must show "Coming with more data"');
      assert.ok(!fullText.includes('What-if Simulator'), 'Empty Insights must hide empty What-if card behind unified card');
    }

    if (activeTab === 'sessions') {
      assert.ok(fullText.includes('Coming with more data'), 'Empty Sessions must show "Coming with more data"');
    }

    if (activeTab === 'you') {
      assert.ok(fullText.includes('Focus Windows'), 'You must render Focus Windows card');
      assert.ok(fullText.includes('Coming with more data'), 'Unready Focus Windows (<21d) must say "Coming with more data"');
      assert.ok(fullText.includes('Needs 3 weeks of data and 5 sittings per cell'), 'You must show 21d + 5 sittings/cell bar');
      assert.ok(fullText.includes('What this build is'), 'You must render What this build is card without visible tap hint');
    }

    renderer.unmount();
  }

  // Verify Debug view still renders cleanly when 7-tap threshold opens showDebug
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

test('populated 5-tab shell renders fixed 0–100 score scale with separate unmeasured parts, confidence explanation, plain Home sentence, silent 7-tap debug, and typed DELETE confirmation', async () => {
  const switchedTabs = [];
  let buildTaps = 0;
  let resetCalls = 0;

  const populatedCtx = makeMockMobileContext({
    setActiveTab: (t) => switchedTabs.push(t),
    handleBuildTap: () => { buildTaps += 1; },
    resetStoredData: async () => { resetCalls += 1; },
    dailyTotals: Array.from({ length: 8 }, (_, i) => ({
      app: `org.example.app${i}`,
      label: `App ${i + 1}`,
      totalMs: (8 - i) * 600_000,
    })),
    labels: {
      'org.wikipedia': 'Wikipedia',
      'org.mozilla.firefox': 'Firefox',
    },
    scaledSessions: [
      {
        id: 'sess-alpha-01',
        app: 'org.wikipedia',
        label: 'Wikipedia',
        start_ms: 1761364800000,
        end_ms: 1761365520000,
        duration_ms: 720_000,
        scaled_duration_ms: 720_000,
        isScaled: false,
      },
      {
        id: 'sess-beta-02',
        app: 'org.mozilla.firefox',
        label: 'Firefox',
        start_ms: 1761368400000,
        end_ms: 1761368880000,
        duration_ms: 480_000,
        scaled_duration_ms: 480_000,
        isScaled: false,
      },
    ],
    sittingSpanMs: 1_200_000,
    intentLabels: { 'sess-alpha-01': 'intentional' },
    labelSaving: 'sess-alpha-01',
    expandedSessionId: 'sess-alpha-01',
    iqs: {
      id: 'iqs',
      metricsVersion: 3,
      value: 44.5,
      max: 100,
      measuredMax: 55,
      unmeasuredMax: 45,
      band: 'usage-only band',
      factors: [
        { id: 'session_length', label: 'Session length mix', points: 20, max: 25, tier: 'D', detail: '80% sustained.', measurable: true },
        { id: 'deliberate', label: 'Deliberate share', points: 0, max: 20, tier: 'D', detail: '1 of 5 explicit labels.', measurable: false },
        { id: 'switching', label: 'Switching pressure', points: 11.5, max: 15, tier: 'D', detail: '0.22 switches/sitting.', measurable: true },
        { id: 'late_night', label: 'Late-night share', points: 13, max: 15, tier: 'D', detail: '8 min late night (vs 60 min saturation).', measurable: true },
        { id: 'topic', label: 'Topic depth', points: 0, max: 25, tier: 'A', detail: 'Needs content or export sources.', measurable: false },
      ],
      confidence: {
        score: 0.49,
        level: 'low',
        coverage: 1,
        sample: 18,
        activeMs: 2_400_000,
        smallSample: false,
        labels: 1,
        explanation: 'Confidence is 49% (low): 100% day coverage across 18 sittings (40m active), and 1 of 5 explicit intent labels provided.',
        reasons: ['18 complete sittings (40 min sitting time).'],
      },
      caveat: '44.5 of 55 measured points (45 points not measured: deliberate share 20 pts, topic depth 25 pts). Unmeasured parts are listed separately — never counted as zero and never rescaled.',
    },
    curiosity: {
      deepMs: 1_200_000,
      habitMs: 600_000,
      unlabeledMs: 600_000,
      switchesPerHour: 3.2,
      switchesPerSitting: 0.22,
      labelShare: 0.75,
    },
    dayScoredSessions: [
      { id: 'sess-alpha-01', app: 'org.wikipedia', startMs: 1761364800000, endMs: 1761365520000 },
      { id: 'sess-alpha-02', app: 'com.reddit.frontpage', startMs: 1761366000000, endMs: 1761366004000 },
    ],
    depthBands: [
      { id: 'under-8s', label: 'under 8 s', count: 1, share: 0.5, ms: 4_000 },
      { id: '8s-1m', label: '8 s – 1 min', count: 0, share: 0, ms: 0 },
      { id: '1-5m', label: '1 – 5 min', count: 0, share: 0, ms: 0 },
      { id: '5-20m', label: '5 – 20 min', count: 1, share: 0.5, ms: 720_000 },
      { id: 'over-20m', label: 'over 20 min', count: 0, share: 0, ms: 0 },
    ],
    evolution: {
      hasHistory: true,
      distinctDays: 5,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-21',
      lastDay: '2026-10-25',
      growingCount: 1,
      fadedCount: 0,
      summaryLine: '1 growing across 5 days',
      depthBands: [],
      rows: [
        {
          app: 'org.wikipedia',
          label: 'Wikipedia',
          seenSinceMs: 1761000000000,
          seenSinceDay: '2026-10-21',
          seenSinceText: 'Seen since 2026-10-21 (history starts 2026-10-21)',
          lastSeenDay: '2026-10-25',
          activeDays: 4,
          sessionCount: 9,
          totalForegroundMs: 1_500_000,
          avgDailyForegroundMs: 300_000,
          foregroundShare: 0.62,
          totalSessionMs: 1_800_000,
          dominantBand: '5 – 20 min',
          trend: 'growing',
          trendLabel: 'Growing (limited history)',
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
      totalSessions: 10,
      sustainedSessionCount: 9,
      shortBounceCount: 1,
      totalAppsVisited: 3,
      repeatAppsCount: 2,
      singleDayAppsCount: 1,
      repeatSessionShare: 0.78,
      repeatShareMeasurable: true,
      totalHandoffs: 3,
      routes: [
        {
          fromApp: 'org.mozilla.firefox',
          toApp: 'org.wikipedia',
          fromLabel: 'Firefox',
          toLabel: 'Wikipedia',
          count: 3,
          activeDays: 2,
          tier: 'D',
        },
      ],
      topAppByTime: { app: 'org.wikipedia', label: 'Wikipedia', totalMs: 1_800_000, tier: 'D' },
      newTopicsOpened: { status: 'unavailable', value: 'unavailable', requiredTiers: ['A', 'B', 'C'], detail: 'requires Tier A/B/C' },
      searchesStarted: { status: 'unavailable', value: 'unavailable', requiredTiers: ['C'], detail: 'requires Tier C' },
      explicitLabels: { intentional: 1, mindless: 0, unsure: 0, decisive: 1, total: 1 },
    },
    rabbitHole: {
      hasHistory: true,
      distinctDays: 5,
      minDays: 3,
      limitedHistory: true,
      historyStartDay: '2026-10-21',
      lastDay: '2026-10-25',
      definitionText: '4+ returns to the same app across >30 min of active sitting time.',
      clusterCount: 1,
      totalClusterSittings: 5,
      totalClusterMs: 2_100_000,
      lateNightShare: 0,
      lateNightShareMeasurable: true,
      clusterExplicitLabels: { intentional: 1, mindless: 0, unsure: 0, decisive: 1, total: 1 },
      clusters: [
        {
          id: 'rh-1',
          app: 'org.mozilla.firefox',
          label: 'Firefox',
          day: '2026-10-25',
          startMs: 1761364800000,
          endMs: 1761367200000,
          sittingCount: 5,
          returnCount: 4,
          totalSittingMs: 2_100_000,
          lateNightMs: 0,
          explicitLabels: { intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0 },
          tier: 'D',
        },
      ],
      capabilities: {
        tierDCanDetect: ['4+ returns over 30 min'],
        tierDCannotDetect: ['Search intent'],
        whatMirrorWillNotDo: 'Mirror does not block apps, send unprompted nudges, or penalise your score.',
      },
    },
    focusWindows: {
      status: 'ready',
      ready: true,
      distinctDays: 24,
      minDays: 21,
      daysRemaining: 0,
      minCellSessions: 5,
      cellsWithAnySessions: 6,
      cellsMeetingSampleFloor: 2,
      totalCells: 42,
      historyStartDay: '2026-10-02',
      lastDay: '2026-10-25',
      qualifiedCells: [],
      suggestedWindows: [
        {
          cellId: 'Mon-08-12',
          weekdayIndex: 0,
          weekday: 'Mon',
          blockIndex: 2,
          blockLabel: '08:00–12:00',
          label: 'Mon · 08:00–12:00',
          sessionCount: 8,
          distinctDays: 4,
          totalSittingMs: 2_880_000,
          sustainedShare: 0.88,
          switchesPerHour: 3.1,
          explicitLabels: { intentional: 1, mindless: 0, unsure: 0, decisive: 1, total: 1 },
        },
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
      sittingTimeMs: 2_400_000,
      timeSource: 'os_aggregate',
      smallSampleBaseline: false,
      baselineIqs: {
        id: 'iqs',
        metricsVersion: 3,
        value: 44.5,
        max: 100,
        measuredMax: 55,
        unmeasuredMax: 45,
        band: 'usage-only band',
        factors: [],
        confidence: {
          score: 0.49,
          level: 'low',
          coverage: 1,
          sample: 18,
          activeMs: 2_400_000,
          smallSample: false,
          labels: 1,
          explanation: 'Confidence is 49% (low).',
          reasons: [],
        },
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
          baselineTimeMs: 2_400_000,
          estimatedTimeMs: 2_280_000,
          deltaTimeMs: -120_000,
          timeEstimateLabel: 'Estimate: −2m (40m → 38m)',
          iqsEstimateLabel: 'Estimate: 44.5 → 44.5 / 100 (0.0 pts, 55 pts measured)',
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
          { value: { ...populatedCtx, activeTab, showWhy: activeTab === 'home' } },
          React.createElement(ui.MirrorTabShell),
        ),
      ),
    );
    const json = renderer.toJSON();
    const rawTree = JSON.stringify(json);
    const fullText = collectText(json).join(' ');
    assert.doesNotMatch(rawTree, /none of which is not/i, `tab ${activeTab} must never render double negative`);
    assert.doesNotMatch(rawTree, /You sign in with OAuth/i, `tab ${activeTab} must hide OAuth copy until a connector exists`);
    assert.doesNotMatch(fullText, /\bJ([1-9]|1[0-9]|2[0-8])\b/, `populated ${activeTab} must not show internal J-codes`);
    assert.doesNotMatch(fullText, /\bP3\b/, `populated ${activeTab} must not show internal "P3" phase codes`);
    assert.doesNotMatch(fullText, /Tap 7 times/i, `populated ${activeTab} must not show debug-tap hint`);

    const spacers = renderer.root.findAll((el) => el.props?.['data-testid'] === 'tab-scroll-bottom-spacer');
    assert.equal(spacers.length, 1, `tab ${activeTab} must render tab-scroll-bottom-spacer inside AppShell ScrollView`);
    const spacerHeight = parseFloat(String(spacers[0].props?.style?.height ?? '0'));
    assert.ok(spacerHeight >= 128, `tab ${activeTab} bottom spacer must clear floating TabBar + nav bar (got ${spacerHeight}px)`);

    const scrims = renderer.root.findAll((el) => el.props?.['data-testid'] === 'tab-bar-bottom-scrim');
    assert.equal(scrims.length, 1, `tab ${activeTab} must render bottom backdrop scrim behind floating TabBar`);
    const backings = renderer.root.findAll((el) => el.props?.['data-testid'] === 'tab-bar-opaque-backing');
    assert.equal(backings.length, 1, `tab ${activeTab} must render high-opacity pill backing behind floating TabBar`);

    if (activeTab === 'home') {
      const gauges = renderer.root.findAll(
        (el) =>
          el.props?.role === 'progressbar' &&
          String(el.props?.['aria-label'] ?? '').startsWith('Attention signal'),
      );
      assert.equal(gauges.length, 1, 'HomeTab must render the Frosted Horizon Attention signal hero gauge');
      assert.match(String(gauges[0].props['aria-label']), /of 55 measured/, 'Attention signal gauge must announce measured points (45 of 55 measured)');
      assert.doesNotMatch(String(gauges[0].props['aria-label']), /\/ 100|out of 100/, 'Attention signal gauge must not read as / 100');
      assert.equal(gauges[0].props['aria-valuenow'], '45', 'Gauge valuenow rounds 44.5 to 45');
      assert.ok(fullText.includes('of 55 measured'), 'Home headline must show "45 of 55 measured"');
      assert.ok(!/44[-–]89|45[-–]90/.test(fullText), 'Home must NOT show a score range');
      assert.ok(fullText.includes('45 points not measured (listed separately)'), 'Home must list the unmeasured 45 points separately');
      assert.ok(fullText.includes('mostly in App 1'), 'Home plain sentence must name top app and duration');
      assert.ok(fullText.includes('Confidence is 49% (low): 100% day coverage'), 'Home must render plain-language confidence explanation');
      assert.match(rawTree, /OS screen time/i, 'HomeTab must label OS screen time');
      assert.match(rawTree, /Sitting spans/i, 'HomeTab must label Sitting spans');
      assert.match(rawTree, /merge reopens of the same app within 15 min/i, 'HomeTab must explain OS screen time vs sitting spans');
    }

    if (activeTab === 'insights') {
      assert.match(rawTree, /COUNTERFACTUAL ARITHMETIC/i, 'InsightsTab must render Frosted Horizon What-if hero');
      assert.ok(fullText.includes('Scenarios (you can combine)'), 'InsightsTab What-if must label chips "Scenarios (you can combine)"');
      assert.ok(fullText.includes('Cap sittings (10m) · On'), 'InsightsTab must show which scenarios are On');
      assert.ok(fullText.includes('Skip short bounces · Off'), 'InsightsTab must show which scenarios are Off');
      assert.ok(fullText.includes('trims each sitting longer than 10 min down to 10 min'), 'InsightsTab must explain what Cap sittings does in one line');
      assert.ok(fullText.includes('drops brief opens shorter than 8 seconds'), 'InsightsTab must explain what Skip short bounces does in one line');
      assert.match(rawTree, /Sitting-length bands \(2 sittings\)/i, 'InsightsTab sitting-length bands must sum to canonical sitting count');
      assert.ok(fullText.includes('0.22 switches / sitting'), 'InsightsTab must display per-sitting switching rate');
      assert.ok(fullText.includes('45 points not measured (listed separately, not counted as 0)'), 'Insights Score Breakdown must separate unmeasured factors');
      const remainingSpanMeters = renderer.root.findAll(
        (el) =>
          el.props?.role === 'progressbar' &&
          String(el.props?.['aria-label'] ?? '').startsWith('Remaining span,'),
      );
      assert.equal(remainingSpanMeters.length, 1, 'What-if scenario must use concise Remaining span Meter label');
      const meterHeaderRow = remainingSpanMeters[0].children?.[0];
      assert.equal(meterHeaderRow?.props?.style?.flexWrap, 'wrap', 'Meter header row must wrap instead of colliding text');
    }

    if (activeTab === 'journey') {
      assert.match(rawTree, /MULTI-DAY RHYTHM/i, 'JourneyTab must render Frosted Horizon Interest Evolution hero');
      assert.ok(fullText.includes('Foreground share (62%)'), 'JourneyTab Interest Evolution must use day-clipped foreground share');
      assert.ok(fullText.includes('5m/day foreground · 9 sittings'), 'JourneyTab Interest Evolution must use day-clipped foreground time and keep merged spans only for sitting counts');
      assert.ok(fullText.includes('Repeat-app foreground share'), 'JourneyTab Discovery must use day-clipped foreground share');
      assert.ok(fullText.includes('4+ returns across over 30 min on raw opens'), 'JourneyTab Rabbit Hole must state raw-open spec bar (4+ returns, >30 min)');
      assert.ok(fullText.includes('4×'), 'JourneyTab Rabbit Hole cluster must show 4+ returns');
      const routeMeters = renderer.root.findAll(
        (el) =>
          el.props?.role === 'progressbar' &&
          String(el.props?.['aria-label'] ?? '').startsWith('Firefox → Wikipedia,'),
      );
      assert.equal(routeMeters.length, 1, 'JourneyTab must render Frosted Horizon Meter for cross-app routes');
    }

    if (activeTab === 'sessions') {
      assert.match(rawTree, /CHRONOLOGICAL LOG/i, 'SessionsTab must render Frosted Horizon hero');
      // Item 7: Labeled row ('sess-alpha-01') may show hint AFTER labeling; unlabeled row ('sess-beta-02') must NOT show brief/long sitting hint!
      assert.ok(fullText.includes('user label: intentional · long sitting'), 'Labeled sitting row shows hint only after user labels it');
      assert.doesNotMatch(fullText, /unlabeled · hint:/, 'Unlabeled sitting rows must NOT show brief/long sitting hints before labeling');
      const thresholdMeters = renderer.root.findAll(
        (el) =>
          el.props?.role === 'progressbar' &&
          String(el.props?.['aria-label'] ?? '').startsWith('Deliberate share threshold,'),
      );
      assert.equal(thresholdMeters.length, 1, 'SessionsTab must render Deliberate share threshold Meter');
      const intentionalBtn = renderer.root.findAll(
        (el) => el.type === 'button' && el.props['aria-label'] === 'Intentional, selected',
      );
      assert.equal(intentionalBtn.length, 1, 'Expanded Session label pill must announce selected state cleanly without check glyph');
    }

    for (const { label, isArray, nodeType } of collectA11yLabels(json)) {
      assert.equal(isArray, false, `populated ${activeTab}: ${nodeType} array label`);
      assert.equal(typeof label, 'string', `populated ${activeTab}: ${nodeType} non-string label`);
    }

    if (activeTab === 'you') {
      assert.match(rawTree, /OBSERVED TIMING BLOCKS/i, 'YouTab must render Frosted Horizon Focus Windows hero');
      assert.match(rawTree, /Local Data & Privacy/i, 'YouTab must render Local Data & Privacy card');
      // Item 5: Accurate encryption, permission, and Tier A copy
      assert.ok(fullText.includes('XChaCha20-Poly1305'), 'YouTab must name XChaCha20-Poly1305');
      assert.ok(!fullText.includes('AES-256-GCM'), 'YouTab must NOT claim AES-256-GCM');
      assert.ok(fullText.includes('no internet permission'), 'YouTab must state "no internet permission"');
      assert.ok(!fullText.includes('zero network permissions'), 'YouTab must NOT claim "zero network permissions"');
      assert.ok(!fullText.includes('Explicit labels active'), 'Tier A must NOT say "Explicit labels active"');
      assert.match(rawTree, /Manual file import is not enabled in v0\.1 yet/i, 'YouTab must state Tier B is unavailable in v0.1');

      // Item 9: Export JSON opens plaintext warning + optional passphrase + Save / Share buttons
      const exportTrigger = renderer.root.find((el) => el.props?.['data-testid'] === 'export-data-trigger');
      await TestRenderer.act(async () => {
        exportTrigger.props.onPress();
      });
      const exportPanel = renderer.root.findAll((el) => el.props?.['data-testid'] === 'export-data-panel');
      assert.equal(exportPanel.length, 1, 'tapping Export all local data must open inline export panel');
      const exportText = collectText(renderer.toJSON()).join(' ');
      assert.match(exportText, /Plaintext warning:/, 'Export panel must show plaintext warning');
      const passInput = renderer.root.find((el) => el.props?.['data-testid'] === 'export-passphrase-input');
      assert.equal(passInput.props.type, 'password', 'Optional passphrase input must mask characters');
      assert.ok(renderer.root.find((el) => el.props?.['data-testid'] === 'export-save-btn'), 'Export panel must offer Save JSON file button');
      assert.ok(renderer.root.find((el) => el.props?.['data-testid'] === 'export-share-btn'), 'Export panel must offer Share JSON button');
      const cancelExportBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'export-cancel-btn');
      await TestRenderer.act(async () => {
        cancelExportBtn.props.onPress();
      });

      // Typed DELETE confirmation flow:
      // 1) First tap opens confirmation panel; confirm button starts disabled; wrong text cannot delete
      const deleteTrigger = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-trigger');
      await TestRenderer.act(async () => {
        deleteTrigger.props.onPress();
      });
      assert.equal(resetCalls, 0, 'first tap on Delete all local data must only open inline confirmation');
      const deleteConfirmPanel = renderer.root.findAll((el) => el.props?.['data-testid'] === 'delete-all-data-confirm-panel');
      assert.equal(deleteConfirmPanel.length, 1, 'inline delete confirmation panel must be visible');

      const confirmBtnInitial = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-confirm-btn');
      assert.equal(confirmBtnInitial.props['aria-disabled'], 'true', 'Confirm button must be disabled before typing DELETE');

      // Lowercase 'delete' must NOT unlock deletion
      const deleteInput = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-input');
      await TestRenderer.act(async () => {
        deleteInput.props.onChange({ target: { value: 'delete' } });
      });
      const confirmBtnLower = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-confirm-btn');
      assert.equal(confirmBtnLower.props['aria-disabled'], 'true', 'Lowercase "delete" must keep confirm button disabled');

      // Cancel clears input and closes panel
      const cancelDeleteBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-cancel-btn');
      await TestRenderer.act(async () => {
        cancelDeleteBtn.props.onPress();
      });
      assert.equal(
        renderer.root.findAll((el) => el.props?.['data-testid'] === 'delete-all-data-confirm-panel').length,
        0,
        'Cancel must dismiss delete confirmation panel',
      );
      assert.equal(resetCalls, 0);

      // Reopen, type exact 'DELETE', and confirm deletion
      const deleteTriggerAgain = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-trigger');
      await TestRenderer.act(async () => {
        deleteTriggerAgain.props.onPress();
      });
      const deleteInputAgain = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-input');
      await TestRenderer.act(async () => {
        deleteInputAgain.props.onChange({ target: { value: 'DELETE' } });
      });
      const confirmDeleteBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'delete-all-data-confirm-btn');
      assert.equal(Boolean(confirmDeleteBtn.props['aria-disabled']), false, 'Typing exact DELETE must enable confirm button');
      await TestRenderer.act(async () => {
        await confirmDeleteBtn.props.onPress();
      });
      assert.equal(resetCalls, 1, 'Typed DELETE + Confirm must invoke resetStoredData once');

      // Verify all dynamic confirmation accessibilityLabels are plain strings too
      for (const { label, isArray, nodeType } of collectA11yLabels(renderer.toJSON())) {
        assert.equal(isArray, false, `YouTab post-confirm: ${nodeType} array label`);
        assert.equal(typeof label, 'string', `YouTab post-confirm: ${nodeType} non-string label`);
      }

      // Trigger TabBar tabs + silent 7-tap debug button
      const buttons = renderer.root.findAll((el) => el.type === 'button');
      const homeTabBtn = buttons.find((b) => b.props['aria-label'] === 'Home');
      assert.ok(homeTabBtn, 'expected Home tab button');
      TestRenderer.act(() => {
        homeTabBtn.props.onPress();
      });
      const debugCardBtn = buttons.find((b) => b.props['aria-label'] === 'What this build is');
      assert.ok(debugCardBtn, 'expected silent 7-tap What this build is button');
      for (let i = 0; i < 7; i += 1) {
        TestRenderer.act(() => {
          debugCardBtn.props.onPress();
        });
      }
    }
    renderer.unmount();
  }

  assert.deepEqual(switchedTabs, ['home'], 'TabBar click should invoke setActiveTab("home")');
  assert.equal(buildTaps, 7, '7 silent taps on What this build is should invoke handleBuildTap 7 times');
});

test('revoked Usage Access & Keystore invalidation recovery render non-blocking banner, Not-now dismissal, and honest reset audit', async () => {
  // 1) Brand-new install with permission === 'denied': shows PermissionPrimer, and "Not now" enters the 5-tab shell
  const freshDeniedRenderer = create(
    React.createElement(
      ui.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        ui.MirrorAppContext.Provider,
        { value: makeMockMobileContext({ permission: 'denied', storeDayRowCounts: [], dailyTotals: [] }) },
        React.createElement(ui.MirrorTabShell),
      ),
    ),
  );
  const primerText = collectText(freshDeniedRenderer.toJSON()).join(' ');
  assert.ok(primerText.includes('Mirror keeps working without it'), 'Fresh denied state must show PermissionPrimer');
  const notNowBtn = freshDeniedRenderer.root.find(
    (el) => el.type === 'button' && el.props['aria-label'] === 'Not now',
  );
  await TestRenderer.act(async () => {
    notNowBtn.props.onPress();
  });
  const afterNotNowText = collectText(freshDeniedRenderer.toJSON()).join(' ');
  assert.ok(afterNotNowText.includes('Usage access is turned off'), 'Tapping Not now must open tab shell with calm banner');
  freshDeniedRenderer.unmount();

  // 2) Usage Access revoked AFTER local history exists: never locks user out of stored data or You delete controls
  let settingsOpened = 0;
  const revokedWithHistoryRenderer = create(
    React.createElement(
      ui.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        ui.MirrorAppContext.Provider,
        {
          value: makeMockMobileContext({
            activeTab: 'you',
            permission: 'denied',
            openSettings: () => { settingsOpened += 1; },
            storeDayRowCounts: [
              { day: '2026-10-24', events: 20, fgEvents: 10, bgEvents: 10, labelEvents: 0, otherEvents: 0, sessions: 8 },
            ],
            lastReset: {
              at: '2026-10-25T08:30:00.000Z',
              reason: 'keystore_invalidated',
              previousHistoryStartDay: '2026-10-21',
            },
          }),
        },
        React.createElement(ui.MirrorTabShell),
      ),
    ),
  );
  const bannerNodes = revokedWithHistoryRenderer.root.findAll(
    (el) => el.props?.['data-testid'] === 'usage-access-revoked-banner',
  );
  assert.equal(bannerNodes.length, 1, 'Revoked permission with stored history must show non-blocking banner');
  const revokedText = collectText(revokedWithHistoryRenderer.toJSON()).join(' ');
  assert.ok(revokedText.includes('Delete all local data'), 'User must retain access to Delete all local data when Usage Access is off');
  assert.ok(revokedText.includes('History reset on 2026-10-25'), 'YouTab must show History reset on 2026-10-25');
  assert.ok(revokedText.includes('Android Keystore key was invalidated'), 'YouTab must explain Keystore invalidation reset honestly');
  assert.ok(revokedText.includes('previous history began 2026-10-21'), 'YouTab must include previous history start day when present');

  const openSettingsBtn = revokedWithHistoryRenderer.root.find(
    (el) => el.type === 'button' && el.props['aria-label'] === 'Open Android settings',
  );
  TestRenderer.act(() => {
    openSettingsBtn.props.onPress();
  });
  assert.equal(settingsOpened, 1, 'Open Android settings CTA in banner must invoke openSettings');
  revokedWithHistoryRenderer.unmount();
});

test('day picker defaults to today, events-without-sittings renders plain message (never "—"), and DebugView flags per-app Mirror vs OS > max(10%, 60s)', () => {
  const MIN = 60_000;
  const days = ui.lastNDays(14, '2026-10-29');
  assert.equal(days.length, 14);
  assert.equal(days[0], '2026-10-29', 'dayOptions starts with today');
  assert.equal(days[1], '2026-10-28');

  for (const activeTab of ['home', 'insights', 'sessions']) {
    const noSittingsCtx = makeMockMobileContext({
      activeTab,
      selectedDay: '2026-10-28',
      dayOptions: days,
      hasEventsWithoutSittings: true,
      dailyTotals: [
        { app: 'com.google.android.youtube', label: 'YouTube', totalMs: 80 * MIN },
        { app: 'com.openai.chatgpt', label: 'ChatGPT', totalMs: 78 * MIN },
        { app: 'com.discord', label: 'Discord', totalMs: 27 * MIN },
      ],
      dayScoredSessions: [],
      scaledSessions: [],
      sessions: [],
    });
    const renderer = create(
      React.createElement(
        ui.ThemeProvider,
        { initialTheme: 'dark' },
        React.createElement(
          ui.MirrorAppContext.Provider,
          { value: noSittingsCtx },
          React.createElement(ui.MirrorTabShell),
        ),
      ),
    );
    const textNodes = collectText(renderer.toJSON());
    const text = textNodes.join(' ');
    assert.ok(
      text.includes('Usage events recorded on 2026-10-28, but no sittings were built yet'),
      `${activeTab} must show plain message when events exist without sittings`,
    );
    assert.ok(
      !textNodes.some((n) => n.trim() === '—'),
      `${activeTab} must not render standalone "—" placeholder when events exist without sittings`,
    );
    renderer.unmount();
  }

  const debugCtx = makeMockMobileContext({
    showDebug: true,
    selectedDay: '2026-10-28',
    dayOptions: days,
    flaggedDiscrepancies: [
      {
        app: 'com.openai.chatgpt',
        label: 'ChatGPT',
        displayedMs: 78 * MIN,
        dayFgMs: 47 * MIN,
        storedMs: 78 * MIN,
        sittingSpanMs: 47 * MIN,
        rawBucketMs: 47 * MIN,
        preMidnightBucketMs: 0,
        mirrorMs: 78 * MIN,
        osMs: 47 * MIN,
        diffMs: 31 * MIN,
        diffPct: (31 / 47) * 100,
        toleranceMs: 4.7 * MIN,
        status: 'over',
        comparison: 'Home vs OS UsageEvents',
      },
    ],
    singleDayRows: [
      {
        app: 'com.openai.chatgpt',
        label: 'ChatGPT',
        displayedMs: 78 * MIN,
        mirrorMs: 78 * MIN,
        osMs: 78 * MIN,
        rawBucketMs: 87 * MIN,
        preMidnightBucketMs: 40 * MIN,
        sameDayBucketMs: 47 * MIN,
        bucketCount: 2,
        sittingSpanMs: 78 * MIN,
        diffPct: (31 / 47) * 100,
        status: 'over',
        flagged: true,
        flagReason: 'Home vs OS UsageStats: Mirror 1h 18m vs OS 47m, +1860s (+66.0%)',
      },
      {
        app: 'com.google.android.youtube',
        label: 'YouTube',
        displayedMs: 80 * MIN,
        mirrorMs: 80 * MIN,
        osMs: 80 * MIN,
        rawBucketMs: 80 * MIN,
        preMidnightBucketMs: 0,
        sameDayBucketMs: 80 * MIN,
        bucketCount: 1,
        sittingSpanMs: 74 * MIN,
        diffPct: 0,
        status: 'ok',
        flagged: false,
      },
    ],
    storeDayRowCounts: [
      { day: '2026-10-28', events: 110, fgEvents: 55, bgEvents: 55, labelEvents: 0, otherEvents: 0, sessions: 43 },
      { day: '2026-10-29', events: 2, fgEvents: 1, bgEvents: 1, labelEvents: 0, otherEvents: 0, sessions: 1 },
    ],
    tracedAppIntervals: [
      {
        app: 'com.openai.chatgpt',
        startMs: Date.parse('2026-10-28T03:50:00.000Z'),
        endMs: Date.parse('2026-10-28T04:37:00.000Z'),
        startIso: '2026-10-28T03:50:00.000Z',
        endIso: '2026-10-28T04:37:00.000Z',
        durationMs: 47 * MIN,
        clippedDayMs: 47 * MIN,
        classNames: ['com.openai.chatgpt.MainActivity'],
        openEventType: 1,
        openEventName: 'ACTIVITY_RESUMED',
        closeEventType: 2,
        closeEventName: 'ACTIVITY_PAUSED',
        closePackage: 'com.openai.chatgpt',
        screenOffDuring: false,
        msWhileScreenOff: 0,
        keyguardLockedDuring: false,
        msWhileKeyguardLocked: 0,
      },
    ],
  });
  const debugRenderer = create(
    React.createElement(
      ui.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        ui.MirrorAppContext.Provider,
        { value: debugCtx },
        React.createElement(ui.MirrorTabShell),
      ),
    ),
  );
  const debugText = collectText(debugRenderer.toJSON()).join(' ');
  assert.ok(debugText.includes('FLAGGED 1 app'));
  assert.ok(debugText.includes('[FLAGGED OVER] ChatGPT (com.openai.chatgpt)'));
  assert.ok(debugText.includes('4-source trace: Home 1h 18m · Day fg 47m · Stored 1h 18m · Sittings 47m · Raw INTERVAL_DAILY 47m'));
  assert.ok(debugText.includes('[FLAGGED > max(10%, 60s)] ChatGPT – Mirror 1h 18m vs OS 47m'));
  assert.ok(debugText.includes('[OK] YouTube – Mirror 1h 20m vs OS 1h 20m'));
  assert.ok(debugText.includes('2026-10-28: events=110 (fg=55, bg=55) · sessions=43'));
  assert.ok(debugText.includes('Foreground interval trace on 2026-10-28 (1)'));
  debugRenderer.unmount();
});

test('JourneyTab 11 days with ~10 min/day foreground time never renders hours in Interest Evolution or Discovery', async () => {
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const base0 = Date.parse('2026-10-19T00:00:00.000Z');
  const events = [];
  for (let d = 0; d < 11; d += 1) {
    const dayStart = base0 + d * DAY;
    // 20 quick 30s WhatsApp opens, 8m apart -> 10m/day foreground, ~2h 32m/day merged sitting span (~28h over 11d)
    for (let k = 0; k < 20; k += 1) {
      const s = dayStart + 9 * HOUR + k * 8 * MIN;
      events.push(
        { schema_version: 1, id: `fg_wa_${d}_${k}`, kind: 'app_foreground', at: new Date(s).toISOString(), tier: 'D', origin: 'os', content: 'metadata', app: 'com.whatsapp' },
        { schema_version: 1, id: `bg_wa_${d}_${k}`, kind: 'app_background', at: new Date(s + 30_000).toISOString(), tier: 'D', origin: 'os', content: 'metadata', app: 'com.whatsapp', duration_ms: 30_000 },
      );
    }
    // 10m/day Wikipedia sitting
    const wk = dayStart + 19 * HOUR;
    events.push(
      { schema_version: 1, id: `fg_wk_${d}`, kind: 'app_foreground', at: new Date(wk).toISOString(), tier: 'D', origin: 'os', content: 'metadata', app: 'org.wikipedia' },
      { schema_version: 1, id: `bg_wk_${d}`, kind: 'app_background', at: new Date(wk + 10 * MIN).toISOString(), tier: 'D', origin: 'os', content: 'metadata', app: 'org.wikipedia', duration_ms: 10 * MIN },
    );
  }
  const { sessions: merged } = ui.sessionize(events);
  const scored = merged.map((s) => ({ id: s.id, app: s.app, startMs: s.startMs, endMs: s.endMs }));
  const labels = { 'com.whatsapp': 'WhatsApp', 'org.wikipedia': 'Wikipedia' };
  const evolution = ui.computeInterestEvolution({ sessions: scored, events, labels, utcOffsetMinutes: 0 });
  const discovery = ui.computeDiscoveryJourney({ sessions: scored, events, labels, utcOffsetMinutes: 0 });
  const rabbitHole = ui.computeRabbitHoles({ events, sessions: scored, labels, utcOffsetMinutes: 0 });

  const ctx = makeMockMobileContext({
    activeTab: 'journey',
    selectedDay: '2026-10-29',
    p3Reliable: true,
    evolution,
    discovery,
    rabbitHole,
  });
  const renderer = create(
    React.createElement(
      ui.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        ui.MirrorAppContext.Provider,
        { value: ctx },
        React.createElement(ui.MirrorTabShell),
      ),
    ),
  );
  const journeyText = collectText(renderer.toJSON()).join(' ');
  assert.ok(journeyText.includes('10m/day foreground · 11 sittings'), `expected 10m/day foreground · 11 sittings in: ${journeyText}`);
  assert.ok(journeyText.includes('Foreground share (50%)'), `expected 50% foreground share in: ${journeyText}`);
  assert.doesNotMatch(
    journeyText,
    /\b\d+h\b/,
    `11 days with ~10 min/day foreground must NEVER show hours on JourneyTab; got: ${journeyText}`,
  );
  renderer.unmount();
});

