/**
 * packages/ui/tests/budgets-ui.test.mjs
 *
 * P4.2 Attention Budget UI + live SQLite store tests:
 *   - Compact budget strip on Home + full Attention Budget editor on Insights
 *   - Soft only (zero blocking, overlays, nudges, streaks, defaults, or suggestions)
 *   - Neutral over-budget wording ("12m over 45m today") and ZERO red colors
 *   - Per-app foreground time strictly from Home's day-clipped foreground totals
 *     (never merged sitting spans)
 *   - Weekly budgets on partial weeks (< 7 recorded days) marked partial and
 *     never extrapolated
 *   - Editor create, edit, pause/resume, delete (with 2-step confirmation), and
 *     validation errors
 *   - Accessible plain-string labels and >= 48dp touch targets across all states
 *   - Live persistence in XChaCha20-Poly1305 SQLite store surviving full restart
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
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
  const entry = join(OUT, 'entry-budgets-ui.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';`,
      `export { MirrorTabShell } from '${join(ROOT, 'apps/mobile/src/MirrorTabShell.tsx').replace(/\\/g, '/')}';`,
      `export { MirrorAppContext, lastNDays, toDayStr } from '${join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx').replace(/\\/g, '/')}';`,
      `export { evaluateBudgets, validateBudgetDefinition } from '${join(ROOT, 'packages/core-analytics/src/index.ts').replace(/\\/g, '/')}';`,
      `export { MirrorStore } from '${join(ROOT, 'packages/store/src/index.ts').replace(/\\/g, '/')}';`,
      `export { NodeSqliteDriver, TEST_ROOT_KEY } from '${join(ROOT, 'packages/store/testing/node-driver.ts').replace(/\\/g, '/')}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'budgets-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: nativeAliases(UI),
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'budgets-ui.bundle.mjs')).href);
});

const MIN_MS = 60_000;

function collectText(node) {
  const out = [];
  function walk(n) {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n.children) walk(n.children);
  }
  walk(node);
  return out;
}

function collectA11yLabels(tree) {
  const labels = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const props = node.props || {};
    if ('accessibilityLabel' in props || 'aria-label' in props) {
      const label = props.accessibilityLabel ?? props['aria-label'];
      labels.push({ label, isArray: Array.isArray(label), nodeType: node.type });
    }
    if (node.children) walk(node.children);
  }
  walk(tree);
  return labels;
}

function parsePx(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = /^([\d.]+)(?:px)?$/.exec(v.trim());
    return m ? parseFloat(m[1]) : 0;
  }
  return 0;
}

function assertNoRedColorsAnywhere(tree, contextLabel) {
  const redWords = /\b(crimson|darkred|firebrick|indianred|maroon|orangered|red|salmon|scarlet|tomato)\b/i;
  function checkColor(raw) {
    if (typeof raw !== 'string') return;
    assert.doesNotMatch(raw, redWords, `${contextLabel}: forbidden red keyword color "${raw}"`);
    const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(raw.trim());
    if (hexMatch) {
      const hex = hexMatch[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      // Flag any saturated red-dominant color (r - max(g, b) >= 48)
      assert.ok(
        !(r - Math.max(g, b) >= 48 && r >= 140),
        `${contextLabel}: forbidden red-dominant hex "${raw}"`,
      );
    }
    const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(raw.trim());
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      assert.ok(
        !(r - Math.max(g, b) >= 48 && r >= 140),
        `${contextLabel}: forbidden red-dominant rgb "${raw}"`,
      );
    }
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const style = node.props?.style;
    if (style && typeof style === 'object') {
      for (const val of Object.values(style)) checkColor(val);
    }
    if (node.children) walk(node.children);
  }
  walk(tree);
}

function assertSubtreeTargetsAtLeast48dp(subtreeRoot, contextLabel) {
  const controls = subtreeRoot.findAll(
    (el) => el.type === 'button' || el.type === 'input',
  );
  assert.ok(controls.length > 0, `${contextLabel}: expected at least 1 interactive control`);
  for (const ctrl of controls) {
    const style = ctrl.props?.style ?? {};
    const h = Math.max(parsePx(style['min-height']), parsePx(style.height));
    const w =
      ctrl.type === 'input'
        ? 48 // single-line TextFields stretch horizontally inside flex containers with minHeight >= 48dp
        : style.width === '100%'
          ? 48 // full-width control: its width is the container's, which is at least the screen column
          : Math.max(parsePx(style['min-width']), parsePx(style.width));
    assert.ok(
      h >= 48 && w >= 48,
      `${contextLabel}: control "${ctrl.props?.['aria-label'] ?? ctrl.type}" must be >=48x48dp (got ${w}x${h})`,
    );
    const ariaLabel = ctrl.props?.['aria-label'];
    assert.equal(typeof ariaLabel, 'string', `${contextLabel}: control must have string aria-label`);
    assert.ok(ariaLabel.trim().length > 0, `${contextLabel}: control aria-label must be non-empty`);
  }
}

function buildLiveTestHarness({ store, initialBudgets, activeTab = 'home', todayDay, priorDaysTotals }) {
  // YouTube on `todayDay`: 57m day-clipped foreground (`dailyTotals`), while merged sitting span is 74m!
  // Wikipedia on `todayDay`: 20m day-clipped foreground.
  const dailyTotals = [
    { app: 'com.google.android.youtube', label: 'YouTube', totalMs: 57 * MIN_MS },
    { app: 'org.wikipedia', label: 'Wikipedia', totalMs: 20 * MIN_MS },
  ];
  const labels = {
    'com.google.android.youtube': 'YouTube',
    'org.wikipedia': 'Wikipedia',
    'com.reddit.frontpage': 'Reddit',
  };

  function Harness() {
    const [tab, setTab] = React.useState(activeTab);
    const [budgets, setBudgets] = React.useState(initialBudgets);

    const saveBudget = React.useCallback(async (draft) => {
      const check = mod.validateBudgetDefinition(draft);
      if (!check.ok) return { ok: false, errors: check.errors };
      await store.putBudget(check.value);
      const fresh = await store.budgets();
      setBudgets(fresh);
      return { ok: true, value: check.value };
    }, []);

    const deleteBudget = React.useCallback(async (id) => {
      const ok = await store.deleteBudget(id);
      const fresh = await store.budgets();
      setBudgets(fresh);
      return ok;
    }, []);

    // Mirrors MirrorAppProvider's exact `budgetsSummary` calculation (3 recorded days -> partial week!)
    const dayTotals = React.useMemo(
      () => [
        {
          day: todayDay,
          source: 'os_events',
          totals: dailyTotals.map((t) => ({ app: t.app, totalMs: t.totalMs })),
        },
        ...priorDaysTotals,
      ],
      [],
    );
    const recordedDays = React.useMemo(
      () => [todayDay, ...priorDaysTotals.map((p) => p.day)],
      [],
    );

    const budgetsSummary = React.useMemo(
      () =>
        mod.evaluateBudgets({
          budgets,
          referenceDay: todayDay,
          dayTotals,
          recordedDays,
          historyStartDay: priorDaysTotals[priorDaysTotals.length - 1]?.day ?? todayDay,
          isSelectedToday: true,
          appLabels: labels,
        }),
      [budgets, dayTotals, recordedDays],
    );

    const budgetApps = React.useMemo(
      () => [
        { app: 'com.google.android.youtube', label: 'YouTube', todayMs: 57 * MIN_MS },
        { app: 'org.wikipedia', label: 'Wikipedia', todayMs: 20 * MIN_MS },
        { app: 'com.reddit.frontpage', label: 'Reddit', todayMs: 0 },
      ],
      [],
    );

    const ctxValue = {
      activeTab: tab,
      setActiveTab: setTab,
      permission: 'granted',
      setPermission: () => {},
      permissionDismissed: false,
      dismissPermissionPrimer: () => {},
      showPermissionPrimer: () => {},
      loading: false,
      error: null,
      lastCollect: 'collect: ok',
      lastSyncedAt: '14:00',
      collectingSince: '2026-10-30',
      keyMismatch: null,
      dismissKeyMismatch: () => {},
      resetStoredData: async () => {
        await store.deleteAll();
        setBudgets([]);
      },
      selectedDay: todayDay,
      setSelectedDay: () => {},
      dayOptions: mod.lastNDays(7, todayDay),
      sessions: [
        // Deliberately 74m merged sitting span on YouTube (> 57m day-clipped foreground!)
        // to prove budgets use Home's 57m day-clipped foreground totals, NEVER 74m merged span!
        {
          id: 'ses_yt_merged',
          app: 'com.google.android.youtube',
          start_ms: 1_762_000_000_000,
          end_ms: 1_762_000_000_000 + 74 * MIN_MS,
          duration_ms: 74 * MIN_MS,
        },
      ],
      dailyTotals,
      dailyTotalsSource: 'os_events',
      labels,
      quality: { count: 0, byReason: {}, measuredGapMs: 0, sentence: 'No gaps.' },
      validation: null,
      flaggedDiscrepancies: [],
      singleDayRows: [],
      debugEvents: [],
      honkaiDebug: [],
      invalidTop: [],
      storeDayRowCounts: [],
      sessionRepairSnapshot: null,
      tracedAppIntervals: [],
      hasEventsWithoutSittings: false,
      copyStatus: null,
      scaledSessions: [],
      iqs: null,
      curiosity: null,
      depthBands: [],
      dayScoredSessions: [
        {
          id: 'ses_yt_merged',
          app: 'com.google.android.youtube',
          startMs: 1_762_000_000_000,
          endMs: 1_762_000_000_000 + 74 * MIN_MS,
        },
      ],
      sittingSpanMs: 74 * MIN_MS,
      dayScoreGaps: [],
      evolution: null,
      discovery: null,
      rabbitHole: null,
      focusWindows: null,
      whatIf: null,
      whatIfCapMin: 10,
      setWhatIfCapMin: () => {},
      whatIfQuietPreset: '23-05',
      setWhatIfQuietPreset: () => {},
      whatIfActiveScenarios: [],
      toggleWhatIfScenario: () => {},
      latestSyncOrphans: null,
      raw24hOrphans: null,
      showWhy: false,
      setShowWhy: () => {},
      showDebug: false,
      setShowDebug: () => {},
      buildTapCount: 0,
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
      checkPermissionAndCollect: async () => {},
      openSettings: () => {},
      saveSessionLabel: async () => {},
      clearStoredLabels: async () => {},
      copyRawEvents: async () => {},
      budgets,
      budgetsSummary,
      budgetApps,
      budgetWeekTotals: dayTotals,
      budgetRecordedDays: recordedDays,
      saveBudget,
      deleteBudget,
    };

    return React.createElement(
      mod.ThemeProvider,
      { initialTheme: 'dark' },
      React.createElement(
        mod.MirrorAppContext.Provider,
        { value: ctxValue },
        React.createElement(mod.MirrorTabShell),
      ),
    );
  }

  return Harness;
}

test('Attention Budget UI: empty states, validation errors, create/edit/delete, neutral "12m over 45m today" (never red), partial week non-extrapolation, Home day-clipped parity, 48dp/a11y, and SQLite restart persistence', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mirror-p42-budgets-'));
  const dbPath = join(tmpDir, 'mirror-budgets.db');
  const rootKeyBytes = new Uint8Array(mod.TEST_ROOT_KEY);
  const keyProvider = {
    keyId: async () => 'key-p42-test',
    rootKey: async () => new Uint8Array(rootKeyBytes),
  };

  // Fixed local day: the fixtures never read the wall clock, so results do not change with the date or TZ.
  const todayDay = '2026-11-03';
  const recentDays = mod.lastNDays(3, todayDay); // Only 3 recorded days -> partial week!
  const priorDaysTotals = [
    {
      day: recentDays[1],
      source: 'stored_events',
      totals: [
        { app: 'com.google.android.youtube', totalMs: 5 * MIN_MS },
        { app: 'org.wikipedia', totalMs: 4 * MIN_MS },
      ],
    },
    {
      day: recentDays[2],
      source: 'stored_events',
      totals: [
        { app: 'com.google.android.youtube', totalMs: 2 * MIN_MS },
        { app: 'org.wikipedia', totalMs: 2 * MIN_MS },
      ],
    },
  ];
  // Total across the 3 recorded days for (YouTube + Wikipedia):
  //   today: 57m + 20m = 77m
  //   day-1:  5m +  4m =  9m
  //   day-2:  2m +  2m =  4m
  //   Exact 3-day sum = 90m (1h 30m).
  //   If wrongly extrapolated to 7 days: 90m * (7 / 3) = 210m (3h 30m), which would
  //   falsely push a 2h (120m) weekly budget over target!

  let driver1 = mod.NodeSqliteDriver.file(dbPath);
  try {
    const store1 = new mod.MirrorStore({
      driver: driver1,
      keys: keyProvider,
      random: (n) => new Uint8Array(randomBytes(n)),
    });
    await store1.open();
    const initialFromDb = await store1.budgets();
    assert.deepEqual(initialFromDb, [], 'new v3 store starts with zero default budgets');

    const App1 = buildLiveTestHarness({
      store: store1,
      initialBudgets: initialFromDb,
      activeTab: 'home',
      todayDay,
      priorDaysTotals,
    });

    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(App1));
    });

    // 1. HOME EMPTY STATE: no default/suggested budgets, 48dp button navigates to Insights
    const homeStripEmpty = renderer.root.find((el) => el.props?.['data-testid'] === 'home-budget-strip');
    assert.ok(homeStripEmpty, 'Home renders compact Attention Budget strip');
    assert.ok(
      renderer.root.find((el) => el.props?.['data-testid'] === 'home-budget-empty'),
      'Home strip renders empty state when 0 budgets exist',
    );
    assertSubtreeTargetsAtLeast48dp(homeStripEmpty, 'Home empty budget strip');
    const homeEmptyText = collectText(renderer.toJSON()).join(' ');
    assert.match(homeEmptyText, /No attention budgets set/);
    assert.doesNotMatch(homeEmptyText, /suggested|recommended|try 30m/i);

    const setupBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'home-budget-setup-btn');
    await TestRenderer.act(async () => {
      setupBtn.props.onPress();
    });

    // 2. INSIGHTS EMPTY STATE: user-created only, zero defaults/suggestions
    const insightsSection = renderer.root.find((el) => el.props?.['data-testid'] === 'insights-budget-section');
    assert.ok(insightsSection, 'Set up in Insights navigates to Insights Attention Budget section');
    assert.ok(
      renderer.root.find((el) => el.props?.['data-testid'] === 'insights-budget-empty'),
      'Insights renders budget empty state when 0 budgets exist',
    );
    assertSubtreeTargetsAtLeast48dp(insightsSection, 'Insights empty budget section');

    // Open editor
    const emptyCreateBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-empty-create-btn');
    await TestRenderer.act(async () => {
      emptyCreateBtn.props.onPress();
    });
    const editorPanel = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-editor-panel');
    assert.ok(editorPanel, 'Editor panel opens on Create budget');
    assertSubtreeTargetsAtLeast48dp(editorPanel, 'Insights open budget editor');

    // 3. VALIDATION ERRORS:
    // 3a) Save with no app selected and 0 duration
    const saveBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn');
    await TestRenderer.act(async () => {
      await saveBtn.props.onPress();
    });
    const errBox1 = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-editor-errors');
    const errText1 = collectText(errBox1.props ? errBox1 : renderer.toJSON()).join(' ');
    assert.match(errText1, /Choose one app for this budget/);
    assert.match(errText1, /Enter a target duration of at least 1 minute/);
    assert.equal((await store1.budgets()).length, 0, 'failed validation writes nothing to SQLite');

    // 3b) Switch to Named group, leave group name empty, set minutes = 75 (>= 60)
    const groupKindBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-kind-group');
    await TestRenderer.act(async () => {
      groupKindBtn.props.onPress();
    });
    const minInput = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-minutes-input');
    await TestRenderer.act(async () => {
      minInput.props.onChange({ target: { value: '75' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn').props.onPress();
    });
    const errText2 = collectText(renderer.toJSON()).join(' ');
    assert.match(errText2, /Choose at least one app for this group/);
    assert.match(errText2, /Enter a name for this app group/);
    assert.match(errText2, /Minutes must be between 0 and 59/);

    // 3c) Switch back to Single app, Daily, select YouTube, enter 25 hours (> 24h daily max)
    const appKindBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-kind-app');
    await TestRenderer.act(async () => {
      appKindBtn.props.onPress();
    });
    const ytOption = renderer.root.find(
      (el) => el.props?.['data-testid'] === 'budget-app-option-com.google.android.youtube',
    );
    await TestRenderer.act(async () => {
      ytOption.props.onPress();
    });
    const hoursInput = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-hours-input');
    await TestRenderer.act(async () => {
      hoursInput.props.onChange({ target: { value: '25' } });
      minInput.props.onChange({ target: { value: '0' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn').props.onPress();
    });
    assert.match(collectText(renderer.toJSON()).join(' '), /A daily budget cannot exceed 24 hours/);
    assertNoRedColorsAnywhere(renderer.toJSON(), 'Validation error state');

    // 4. CREATE SINGLE-APP DAILY BUDGET (45m on YouTube, which has 57m day-clipped foreground on Home vs 74m merged span!)
    await TestRenderer.act(async () => {
      hoursInput.props.onChange({ target: { value: '0' } });
      minInput.props.onChange({ target: { value: '45' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn').props.onPress();
    });

    const storedAfterCreate1 = await store1.budgets();
    assert.equal(storedAfterCreate1.length, 1);
    const ytBudgetId = storedAfterCreate1[0].id;
    assert.equal(storedAfterCreate1[0].name, 'YouTube');
    assert.equal(storedAfterCreate1[0].limitMs, 45 * MIN_MS);

    const insightsAfterCreateText = collectText(renderer.toJSON()).join(' ');
    assert.ok(
      insightsAfterCreateText.includes('57m foreground'),
      'Insights budget card must use Home day-clipped 57m foreground total, NEVER 74m merged sitting span',
    );
    assert.ok(
      !insightsAfterCreateText.includes('74m foreground') && !insightsAfterCreateText.includes('1h 14m foreground'),
      'Merged sitting span (1h 14m) must never leak into budget foreground usage',
    );
    assert.ok(
      insightsAfterCreateText.includes('12m over 45m today'),
      'Over-budget wording must be neutral ("12m over 45m today")',
    );
    assertNoRedColorsAnywhere(renderer.toJSON(), 'Insights over-budget state');

    // 5. CREATE NAMED-GROUP WEEKLY BUDGET ON PARTIAL WEEK (3 of 7 days recorded, 2h target vs 1h 30m used)
    const newBudgetBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'budget-new-btn');
    await TestRenderer.act(async () => {
      newBudgetBtn.props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-kind-group').props.onPress();
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-period-weekly').props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-name-input')
        .props.onChange({ target: { value: 'Reading and Video' } });
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-app-option-com.google.android.youtube')
        .props.onPress();
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-app-option-org.wikipedia')
        .props.onPress();
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-hours-input')
        .props.onChange({ target: { value: '2' } });
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-minutes-input')
        .props.onChange({ target: { value: '0' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn').props.onPress();
    });

    const storedAfterCreate2 = await store1.budgets();
    assert.equal(storedAfterCreate2.length, 2);
    const groupBudget = storedAfterCreate2.find((b) => b.kind === 'group');
    assert.ok(groupBudget);
    assert.equal(groupBudget.name, 'Reading and Video');

    const insightsBothText = collectText(renderer.toJSON()).join(' ');
    assert.ok(
      insightsBothText.includes('1h 30m of 2h · partial week (3 of 7 days)'),
      `Partial weekly budget must show exact 1h 30m across 3 of 7 days without extrapolating (got: ${insightsBothText})`,
    );
    assert.ok(
      insightsBothText.includes('never extrapolated to 7 days'),
      'Insights weekly card must state partial week is never extrapolated',
    );
    assertSubtreeTargetsAtLeast48dp(
      renderer.root.find((el) => el.props?.['data-testid'] === 'insights-budget-section'),
      'Insights populated budget cards',
    );

    // Switch back to Home tab via bottom TabBar and verify compact Home strip matches!
    const homeTabBtn = renderer.root.find(
      (el) => el.props?.role === 'tab' && el.props?.['aria-label'] === 'Home',
    );
    await TestRenderer.act(async () => {
      homeTabBtn.props.onPress();
    });
    const homePopulatedStrip = renderer.root.find((el) => el.props?.['data-testid'] === 'home-budget-strip');
    assertSubtreeTargetsAtLeast48dp(homePopulatedStrip, 'Home populated budget strip');
    const homePopulatedText = collectText(renderer.toJSON()).join(' ');
    assert.ok(homePopulatedText.includes('12m over 45m today'), 'Home strip shows neutral "12m over 45m today"');
    assert.ok(
      homePopulatedText.includes('1h 30m of 2h · partial week (3 of 7 days)'),
      'Home strip marks partial weekly budget and never extrapolates',
    );
    assertNoRedColorsAnywhere(renderer.toJSON(), 'Home over-budget strip');

    // Verify all accessibility labels across Home & Insights are plain strings (never arrays)
    for (const { label, isArray, nodeType } of collectA11yLabels(renderer.toJSON())) {
      assert.equal(isArray, false, `Home ${nodeType} produced array accessibilityLabel`);
      assert.equal(typeof label, 'string');
    }

    // 6. EDIT EXISTING BUDGET & DELETE WITH 2-STEP CONFIRMATION:
    // Tap "Manage in Insights" on Home strip -> opens Insights, edit YouTube from 45m -> 1h 15m (75m)
    const manageBtn = renderer.root.find((el) => el.props?.['data-testid'] === 'home-budget-manage-btn');
    await TestRenderer.act(async () => {
      manageBtn.props.onPress();
    });
    const editYtBtn = renderer.root.find((el) => el.props?.['data-testid'] === `budget-edit-btn-${ytBudgetId}`);
    await TestRenderer.act(async () => {
      editYtBtn.props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-hours-input')
        .props.onChange({ target: { value: '1' } });
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'budget-minutes-input')
        .props.onChange({ target: { value: '15' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn').props.onPress();
    });
    const afterEditText = collectText(renderer.toJSON()).join(' ');
    assert.ok(
      afterEditText.includes('57m of 1h 15m today · 18m left'),
      `Edited YouTube budget updates to 1h 15m (18m left), got: ${afterEditText}`,
    );

    // Delete YouTube budget: first tap opens confirmation; "Keep" cancels; second tap + "Confirm delete" removes it
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `budget-delete-btn-${ytBudgetId}`).props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `budget-cancel-delete-btn-${ytBudgetId}`).props.onPress();
    });
    assert.equal((await store1.budgets()).length, 2, 'Keep cancels deletion');

    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `budget-delete-btn-${ytBudgetId}`).props.onPress();
    });
    await TestRenderer.act(async () => {
      await renderer.root
        .find((el) => el.props?.['data-testid'] === `budget-confirm-delete-btn-${ytBudgetId}`)
        .props.onPress();
    });
    assert.equal((await store1.budgets()).length, 1, 'Confirm delete removes YouTube budget from SQLite');
    assert.equal(
      renderer.root.findAll((el) => el.props?.['data-testid'] === `insights-budget-card-${ytBudgetId}`).length,
      0,
      'Deleted budget card disappears from Insights UI',
    );

    renderer.unmount();
    driver1.close();
    driver1 = null;

    // 7. RESTART PERSISTENCE + ENCRYPTION AT REST CHECK:
    const rawBytesText = readFileSync(dbPath).toString('utf8');
    assert.ok(
      !rawBytesText.includes('Reading and Video') && !rawBytesText.includes('com.google.android.youtube'),
      'SQLite file on disk must encrypt budget names and packages with XChaCha20-Poly1305',
    );

    // Reopen fresh SQLite connection + MirrorStore + fresh UI tree ("cold app restart")
    const driver2 = mod.NodeSqliteDriver.file(dbPath);
    try {
      const store2 = new mod.MirrorStore({
        driver: driver2,
        keys: keyProvider,
        random: (n) => new Uint8Array(randomBytes(n)),
      });
      await store2.open();
      const reloadedBudgets = await store2.budgets();
      assert.equal(reloadedBudgets.length, 1, 'surviving group budget reloads after cold restart');
      assert.equal(reloadedBudgets[0].name, 'Reading and Video');
      assert.equal(reloadedBudgets[0].period, 'weekly');
      assert.equal(reloadedBudgets[0].limitMs, 120 * MIN_MS);

      const AppAfterRestart = buildLiveTestHarness({
        store: store2,
        initialBudgets: reloadedBudgets,
        activeTab: 'home',
        todayDay,
        priorDaysTotals,
      });
      let restartedRenderer;
      TestRenderer.act(() => {
        restartedRenderer = TestRenderer.create(React.createElement(AppAfterRestart));
      });
      const restartedHomeText = collectText(restartedRenderer.toJSON()).join(' ');
      assert.ok(
        restartedHomeText.includes('Reading and Video · Weekly (2 apps)'),
        'Restarted Home strip renders persisted group budget',
      );
      assert.ok(
        restartedHomeText.includes('1h 30m of 2h · partial week (3 of 7 days)'),
        'Restarted Home strip preserves partial-week non-extrapolated total',
      );
      restartedRenderer.unmount();
    } finally {
      driver2.close();
    }
  } finally {
    if (driver1) driver1.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P4.2 polish: single non-duplicated status line on Insights budget card, and "Start from my average" + 30m/1h/2h quick chips never auto-run or save before Save is tapped', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mirror-p42-polish-'));
  const dbPath = join(tmpDir, 'mirror-budgets-polish.db');
  const rootKeyBytes = new Uint8Array(mod.TEST_ROOT_KEY);
  const keyProvider = {
    keyId: async () => 'key-p42-polish',
    rootKey: async () => new Uint8Array(rootKeyBytes),
  };

  // Fixed local day: the fixtures never read the wall clock, so results do not change with the date or TZ.
  const todayDay = '2026-11-03';
  const recentDays = mod.lastNDays(3, todayDay);
  // YouTube 3-day day-clipped foreground sum: 57m + 18m + 15m = 90m across 3 recorded days -> 30m/day average!
  // (Whereas today's merged sitting span in harness is 74m — proving "Start from my average" uses day-clipped foreground!)
  const priorDaysTotals = [
    {
      day: recentDays[1],
      source: 'stored_events',
      totals: [
        { app: 'com.google.android.youtube', totalMs: 18 * MIN_MS },
        { app: 'org.wikipedia', totalMs: 6 * MIN_MS },
      ],
    },
    {
      day: recentDays[2],
      source: 'stored_events',
      totals: [
        { app: 'com.google.android.youtube', totalMs: 15 * MIN_MS },
        { app: 'org.wikipedia', totalMs: 6 * MIN_MS },
      ],
    },
  ];

  const driver = mod.NodeSqliteDriver.file(dbPath);
  try {
    const store = new mod.MirrorStore({
      driver,
      keys: keyProvider,
      random: (n) => new Uint8Array(randomBytes(n)),
    });
    await store.open();

    const App = buildLiveTestHarness({
      store,
      initialBudgets: [],
      activeTab: 'insights',
      todayDay,
      priorDaysTotals,
    });
    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(App));
    });

    // 1. Open editor: must NEVER auto-run "Start from my average" on its own!
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-empty-create-btn').props.onPress();
    });
    const hoursInput = () => renderer.root.find((el) => el.props?.['data-testid'] === 'budget-hours-input');
    const minutesInput = () => renderer.root.find((el) => el.props?.['data-testid'] === 'budget-minutes-input');
    assert.equal(hoursInput().props.value, '', 'hours input starts blank (never pre-filled automatically)');
    assert.equal(minutesInput().props.value, '', 'minutes input starts blank (never pre-filled automatically)');
    assert.equal(
      renderer.root.findAll((el) => el.props?.['data-testid'] === 'budget-prefill-note').length,
      0,
      'prefill note absent before user taps Start from my average',
    );
    assert.equal((await store.budgets()).length, 0, 'store remains empty when editor opens');

    // 2. Tap "Start from my average": pre-fills YouTube + 30m ((57+18+15)/3 = 30m), NEVER saves!
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-start-from-avg-btn').props.onPress();
    });
    assert.equal(hoursInput().props.value, '0');
    assert.equal(minutesInput().props.value, '30', 'pre-fills 30m day-clipped 3-day average (never 74m merged span)');
    const ytChip = renderer.root.find(
      (el) => el.props?.['data-testid'] === 'budget-app-option-com.google.android.youtube',
    );
    assert.match(String(ytChip.props['aria-label'] ?? ''), /selected/i, 'pre-selects top 7-day app YouTube');
    assert.equal((await store.budgets()).length, 0, 'Start from my average NEVER saves before Save is tapped');

    // 3. Quick-amount chips (30m, 1h, 2h) update local fields ONLY and NEVER save before Save is tapped!
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-quick-1h').props.onPress();
    });
    assert.equal(hoursInput().props.value, '1');
    assert.equal(minutesInput().props.value, '0');
    assert.equal((await store.budgets()).length, 0, '1h quick chip NEVER saves before Save is tapped');

    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-quick-2h').props.onPress();
    });
    assert.equal(hoursInput().props.value, '2');
    assert.equal(minutesInput().props.value, '0');

    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-quick-30m').props.onPress();
    });
    assert.equal(hoursInput().props.value, '0');
    assert.equal(minutesInput().props.value, '30');
    assert.equal((await store.budgets()).length, 0, '30m quick chip NEVER saves before Save is tapped');

    // Cancel without saving -> SQLite store is STILL empty!
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-cancel-btn').props.onPress();
    });
    assert.equal((await store.budgets()).length, 0, 'cancelling after Start from my average leaves 0 saved budgets');

    // 4. Reopen, tap Start from my average, then tap Save -> saves once, and card renders statusLine ONCE (not duplicated!)
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-empty-create-btn').props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'budget-start-from-avg-btn').props.onPress();
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'budget-save-btn').props.onPress();
    });
    const saved = await store.budgets();
    assert.equal(saved.length, 1, 'persisted only after tapping Save');
    assert.equal(saved[0].limitMs, 30 * MIN_MS);

    const cardNode = renderer.root.find(
      (el) => el.props?.['data-testid'] === `insights-budget-card-${saved[0].id}`,
    );
    const cardStrings = collectText(cardNode);
    const statusOccurrences = cardStrings.filter((s) => s.includes('27m over 30m today')).length;
    assert.equal(
      statusOccurrences,
      1,
      `Insights budget card must render status line once (no duplicate header line), got ${statusOccurrences} in ${JSON.stringify(cardStrings)}`,
    );

    renderer.unmount();
  } finally {
    driver.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
