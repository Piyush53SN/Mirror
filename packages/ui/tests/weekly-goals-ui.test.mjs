/**
 * packages/ui/tests/weekly-goals-ui.test.mjs
 *
 * P4.3 Weekly Report Sheet + Calm Weekly Goals + Opt-in Local Reminder +
 * Portability (JSON Export & Typed DELETE) + SQLite Restart Tests:
 *   1. Weekly Report opens from Insights as a Sheet: Tier D + "your labels (Tier D feedback)"
 *      (never Tier A), 7 local days, partial weeks marked partial and never extrapolated,
 *      prior-week comparison gated at >= 14 days, per-app time strictly from day-clipped
 *      foreground (never merged sitting spans), Stored & Approximate badges preserved,
 *      neutral wording.
 *   2. Goals UI: user-created only, calm ratios ("4 of 7 days within target"), zero streaks,
 *      zero red colors, zero guilt copy, zero auto-suggested goals. Full CRUD (create, edit,
 *      delete) + cold SQLite restart persistence (XChaCha20-Poly1305 encrypted on disk).
 *   3. Opt-in local reminder & optional gentle budget note: both OFF by default; zero
 *      POST_NOTIFICATIONS permission requests on mount; permission requested ONLY after the
 *      user turns a toggle on; stays Off when denied; MIUI best-effort + no internet
 *      permission wording present.
 *   4. JSON export (plaintext + passphrase XChaCha20-Poly1305) and typed DELETE cover
 *      budgets, goals, and weekly report preferences.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '../..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-weekly-goals-ui.tsx');
  writeFileSync(
    entry,
    [
      `export * from '${join(UI, 'src/index.ts').replace(/\\/g, '/')}';`,
      `export { MirrorTabShell } from '${join(ROOT, 'apps/mobile/src/MirrorTabShell.tsx').replace(/\\/g, '/')}';`,
      `export { MirrorAppContext, lastNDays, toDayStr } from '${join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx').replace(/\\/g, '/')}';`,
      `export { computeWeeklyReport, evaluateBudgets, evaluateGoals, validateBudgetDefinition, validateGoalDefinition } from '${join(ROOT, 'packages/core-analytics/src/index.ts').replace(/\\/g, '/')}';`,
      `export { DEFAULT_WEEKLY_REPORT_PREFS, MirrorStore, decryptExportBundle, encryptExportBundle } from '${join(ROOT, 'packages/store/src/index.ts').replace(/\\/g, '/')}';`,
      `export { NodeSqliteDriver, TEST_ROOT_KEY } from '${join(ROOT, 'packages/store/testing/node-driver.ts').replace(/\\/g, '/')}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'weekly-goals-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'weekly-goals-ui.bundle.mjs')).href);
});

const MIN_MS = 60_000;
const FORBIDDEN_GUILT_RE = /\b(streak|streaks|shame|guilt|addicted|failing|failed|danger)\b/i;

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
      assert.ok(
        !(r - Math.max(g, b) >= 48 && r >= 140),
        `${contextLabel}: forbidden red-dominant hex "${raw}"`,
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

function buildP43Harness({
  store,
  initialBudgets = [],
  initialGoals = [],
  initialPrefs = null,
  activeTab = 'insights',
  selectedDay,
  fortnightTotals,
  allRecordedDays,
  sessions = [],
  intentLabels = {},
  onRequestNotificationPermission = async () => 'granted',
  onExportCapture = () => {},
}) {
  const labels = {
    'com.google.android.youtube': 'YouTube',
    'org.wikipedia': 'Wikipedia',
    'com.discord': 'Discord',
  };

  function Harness() {
    const [tab, setTab] = React.useState(activeTab);
    const [budgets, setBudgets] = React.useState(initialBudgets);
    const [goals, setGoals] = React.useState(initialGoals);
    const [weeklyReportPrefs, setWeeklyReportPrefs] = React.useState(
      initialPrefs ?? { ...mod.DEFAULT_WEEKLY_REPORT_PREFS },
    );
    const [showWeeklyReport, setShowWeeklyReport] = React.useState(false);
    const [lastReset, setLastReset] = React.useState(null);

    const weekSet = React.useMemo(() => new Set(mod.lastNDays(7, selectedDay)), []);
    const weekTotals = React.useMemo(
      () => fortnightTotals.filter((d) => weekSet.has(d.day)),
      [weekSet],
    );
    const weekRecordedDays = React.useMemo(
      () => allRecordedDays.filter((d) => weekSet.has(d)),
      [weekSet],
    );
    const todayEntry = fortnightTotals.find((d) => d.day === selectedDay);
    const dailyTotals = React.useMemo(
      () =>
        (todayEntry?.totals ?? []).map((t) => ({
          app: t.app,
          label: labels[t.app] ?? t.app,
          totalMs: t.totalMs,
        })),
      [todayEntry],
    );

    const historyStartDay = allRecordedDays.length > 0 ? [...allRecordedDays].sort()[0] : selectedDay;

    const budgetsSummary = React.useMemo(
      () =>
        mod.evaluateBudgets({
          budgets,
          referenceDay: selectedDay,
          dayTotals: weekTotals,
          recordedDays: weekRecordedDays,
          historyStartDay,
          isSelectedToday: false,
          appLabels: labels,
        }),
      [budgets, weekTotals, weekRecordedDays, historyStartDay],
    );

    const weeklyReport = React.useMemo(
      () =>
        mod.computeWeeklyReport({
          endDay: selectedDay,
          dayTotals: fortnightTotals,
          sessions,
          intentLabels,
          recordedDays: allRecordedDays,
          historyStartDay,
          utcOffsetMinutes: 330,
          appLabels: labels,
        }),
      [historyStartDay],
    );

    const goalsSummary = React.useMemo(
      () =>
        mod.evaluateGoals({
          goals,
          endDay: selectedDay,
          dayTotals: weekTotals,
          sessions,
          recordedDays: weekRecordedDays,
          historyStartDay,
          utcOffsetMinutes: 330,
          appLabels: labels,
        }),
      [goals, weekTotals, weekRecordedDays, historyStartDay],
    );

    const saveBudget = async (draft) => {
      const check = mod.validateBudgetDefinition(draft);
      if (!check.ok) return { ok: false, errors: check.errors };
      await store.putBudget(check.value);
      setBudgets(await store.budgets());
      return { ok: true, value: check.value };
    };

    const deleteBudget = async (id) => {
      const removed = await store.deleteBudget(id);
      setBudgets(await store.budgets());
      return removed;
    };

    const saveGoal = async (draft) => {
      const check = mod.validateGoalDefinition(draft);
      if (!check.ok) return { ok: false, errors: check.errors };
      await store.putGoal(check.value);
      setGoals(await store.goals());
      return { ok: true, value: check.value };
    };

    const deleteGoal = async (id) => {
      const removed = await store.deleteGoal(id);
      setGoals(await store.goals());
      return removed;
    };

    const updateWeeklyReportPrefs = async (patch) => {
      const current = await store.weeklyReportPrefs();
      const enablingWeekly = patch.reminderEnabled === true && !current.reminderEnabled;
      const enablingBudget = patch.budgetNoteEnabled === true && !Boolean(current.budgetNoteEnabled);
      if (enablingWeekly || enablingBudget) {
        const perm = await onRequestNotificationPermission();
        if (perm !== 'granted') {
          return { ok: false, reason: 'permission_denied', prefs: current };
        }
      }
      const next = await store.setWeeklyReportPrefs(patch);
      setWeeklyReportPrefs(next);
      return { ok: true, prefs: next };
    };

    const exportAllData = async (opts = {}) => {
      const pass = (opts.passphrase ?? '').trim();
      const plain = await store.exportBundle('2026-11-03T10:00:00.000Z');
      const plainJson = JSON.stringify(plain, null, 2);
      const payload = pass
        ? JSON.stringify(
            mod.encryptExportBundle(plainJson, pass, (n) => new Uint8Array(randomBytes(n)), {
              iterations: 10_000,
              exportedAt: '2026-11-03T10:00:00.000Z',
            }),
            null,
            2,
          )
        : plainJson;
      onExportCapture({ encrypted: pass.length > 0, json: payload });
      return { ok: true, encrypted: pass.length > 0, savedVia: 'save_dialog' };
    };

    const resetStoredData = async (reason = 'user_delete_all') => {
      await store.deleteAll();
      await store.open();
      const audit = { at: Date.now(), day: selectedDay, reason };
      await store.recordResetAudit(audit);
      setLastReset(audit);
      setBudgets([]);
      setGoals([]);
      setWeeklyReportPrefs({ ...mod.DEFAULT_WEEKLY_REPORT_PREFS });
      setShowWeeklyReport(false);
    };

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
      lastSyncedAt: '18:00',
      collectingSince: historyStartDay,
      keyMismatch: null,
      dismissKeyMismatch: () => {},
      resetStoredData,
      exportAllData,
      lastReset,
      selectedDay,
      setSelectedDay: () => {},
      dayOptions: mod.lastNDays(7, selectedDay),
      sessions: [],
      dailyTotals,
      dailyTotalsSource: todayEntry?.source ?? 'os_events',
      labels,
      quality: { count: 0, byReason: {}, measuredGapMs: 0, sentence: 'No gaps.' },
      validation: null,
      flaggedDiscrepancies: [],
      singleDayRows: [],
      debugEvents: [],
      honkaiDebug: [],
      invalidTop: [],
      storeDayRowCounts: allRecordedDays.map((d) => ({
        day: d,
        events: 4,
        fgEvents: 2,
        bgEvents: 2,
        labelEvents: 0,
        otherEvents: 0,
        sessions: 2,
      })),
      sessionRepairSnapshot: null,
      tracedAppIntervals: [],
      hasEventsWithoutSittings: false,
      copyStatus: null,
      scaledSessions: [],
      iqs: null,
      curiosity: null,
      depthBands: [],
      dayScoredSessions: sessions,
      sittingSpanMs: 0,
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
      intentLabels,
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
      budgetApps: [
        { app: 'com.google.android.youtube', label: 'YouTube', todayMs: 35 * MIN_MS },
        { app: 'org.wikipedia', label: 'Wikipedia', todayMs: 20 * MIN_MS },
      ],
      budgetWeekTotals: weekTotals,
      budgetRecordedDays: weekRecordedDays,
      saveBudget,
      deleteBudget,
      goals,
      goalsSummary,
      saveGoal,
      deleteGoal,
      weeklyReport,
      showWeeklyReport,
      setShowWeeklyReport,
      weeklyReportPrefs,
      updateWeeklyReportPrefs,
      openNotificationSettings: () => {},
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

test('P4.3 Goals CRUD + restart, calm "4 of 7 days within target" ratios, Weekly Report sheet (>=14d gate, Tier D feedback, Stored/Approximate), opt-in POST_NOTIFICATIONS, export & typed DELETE', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mirror-p43-ui-'));
  const dbPath = join(tmpDir, 'mirror-p43.db');
  const rootKeyBytes = new Uint8Array(mod.TEST_ROOT_KEY);
  const keyProvider = {
    keyId: async () => 'key-p43-test',
    rootKey: async () => new Uint8Array(rootKeyBytes),
  };

  // Build 14 local days ending 2026-11-02 so:
  //   - Current 7-day window (2026-10-27 .. 2026-11-02) has 4 days <= 30m YouTube and 3 days > 30m -> "4 of 7 days within target"!
  //   - Days include `stored_events` and `os_bucket_approx` to prove Stored & Approximate badges are preserved!
  //   - Merged sitting on 2026-11-02 has a 95m span (> 25m day-clipped foreground!) to prove both Weekly Report and Goals use day-clipped foreground!
  const endDay = '2026-11-02';
  const days14 = mod.lastNDays(14, endDay); // [2026-11-02, 2026-11-01, ..., 2026-10-20]
  const ytMinutesCurrent7 = [25, 20, 45, 30, 50, 15, 40]; // 4 of 7 <= 30m! (25, 20, 30, 15)
  const fortnightTotals = days14.map((day, idx) => {
    const isCurrentWeek = idx < 7;
    const ytMin = isCurrentWeek ? ytMinutesCurrent7[idx] : 35;
    const source = idx === 0 ? 'os_events' : idx === 6 ? 'os_bucket_approx' : 'stored_events';
    return {
      day,
      source,
      totals: [
        { app: 'com.google.android.youtube', totalMs: ytMin * MIN_MS },
        { app: 'org.wikipedia', totalMs: 10 * MIN_MS },
      ],
    };
  });

  // 6 sessions with 5 decisive labels (4 intentional, 1 mindless, 1 unsure excluded) -> 80% intentional share ("your labels (Tier D feedback)")
  const baseTs = Date.parse('2026-11-02T05:00:00.000Z');
  const sessions = [
    // Deliberately 95m merged sitting span on YouTube (while day-clipped foreground is 25m!)
    { id: 's1', app: 'com.google.android.youtube', startMs: baseTs, endMs: baseTs + 95 * MIN_MS },
    { id: 's2', app: 'org.wikipedia', startMs: baseTs + 110 * MIN_MS, endMs: baseTs + 120 * MIN_MS },
    { id: 's3', app: 'org.wikipedia', startMs: baseTs - 86_400_000, endMs: baseTs - 86_400_000 + 12 * MIN_MS },
    { id: 's4', app: 'com.google.android.youtube', startMs: baseTs - 2 * 86_400_000, endMs: baseTs - 2 * 86_400_000 + 20 * MIN_MS },
    { id: 's5', app: 'org.wikipedia', startMs: baseTs - 3 * 86_400_000, endMs: baseTs - 3 * 86_400_000 + 15 * MIN_MS },
    { id: 's6', app: 'org.wikipedia', startMs: baseTs - 4 * 86_400_000, endMs: baseTs - 4 * 86_400_000 + 10 * MIN_MS },
  ];
  const intentLabels = {
    s1: 'mindless',
    s2: 'intentional',
    s3: 'intentional',
    s4: 'intentional',
    s5: 'intentional',
    s6: 'unsure',
  };

  let permissionPrompts = 0;
  let nextPermResult = 'denied';
  const exportedCaptures = [];

  let driver1 = mod.NodeSqliteDriver.file(dbPath);
  try {
    const store1 = new mod.MirrorStore({
      driver: driver1,
      keys: keyProvider,
      random: (n) => new Uint8Array(randomBytes(n)),
    });
    await store1.open();

    // Seed one soft budget so export & typed DELETE verify budgets + goals + reminder prefs together
    await store1.putBudget({
      id: 'b_wiki_p43',
      name: 'Wikipedia reading',
      kind: 'app',
      packages: ['org.wikipedia'],
      period: 'daily',
      limitMs: 30 * MIN_MS,
      enabled: true,
      createdAtMs: 1_762_000_000_000,
      updatedAtMs: 1_762_000_000_000,
    });

    const App14 = buildP43Harness({
      store: store1,
      initialBudgets: await store1.budgets(),
      initialGoals: [],
      selectedDay: endDay,
      fortnightTotals,
      allRecordedDays: days14,
      sessions,
      intentLabels,
      onRequestNotificationPermission: async () => {
        permissionPrompts += 1;
        return nextPermResult;
      },
      onExportCapture: (cap) => exportedCaptures.push(cap),
    });

    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(App14));
    });

    // 1. INITIAL MOUNT INVARIANTS:
    //    - Zero auto-suggested goals
    //    - Both reminder toggles OFF by default
    //    - ZERO POST_NOTIFICATIONS permission requests on mount!
    assert.equal(permissionPrompts, 0, 'POST_NOTIFICATIONS must NEVER be requested on mount');
    assert.ok(
      renderer.root.findAll((el) => el.props?.['data-testid'] === 'insights-goals-empty').length === 1,
      'Goals start empty with zero auto-suggested goals',
    );
    const weeklyToggle = () => renderer.root.find((el) => el.props?.['data-testid'] === 'weekly-reminder-toggle');
    const budgetNoteToggle = () => renderer.root.find((el) => el.props?.['data-testid'] === 'budget-note-toggle');
    assert.ok(collectText(weeklyToggle()).includes('Off'), 'Weekly reminder toggle starts Off');
    assert.ok(collectText(budgetNoteToggle()).includes('Off'), 'Gentle budget note toggle starts Off');

    const initialScreenText = collectText(renderer.toJSON()).join(' ');
    assert.match(initialScreenText, /MIUI/, 'Best-effort MIUI wording is visible');
    assert.match(initialScreenText, /no internet permission/, 'No internet permission wording is visible');
    assert.equal(FORBIDDEN_GUILT_RE.test(initialScreenText), false, 'Zero streaks or guilt copy on Insights');

    // 2. WEEKLY REPORT SHEET OPENED FROM INSIGHTS (>= 14 days):
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'open-weekly-report-btn').props.onPress();
    });
    const sheetNode = renderer.root.find((el) => el.props?.['data-testid'] === 'weekly-report-sheet');
    const sheetText = collectText(sheetNode).join(' ');
    assert.match(sheetText, /your labels \(Tier D feedback\)/, 'Sheet attributes labels to Tier D feedback');
    assert.equal(/\bTier A\b/.test(sheetText), false, 'Sheet never calls session labels Tier A');
    assert.match(sheetText, /80%/, '5 decisive labels (4 intentional, 1 mindless) -> 80% intentional share');
    assert.match(sheetText, /Stored/, 'Preserves Stored day badge');
    assert.match(sheetText, /Approximate/, 'Preserves Approximate day badge');
    assert.ok(
      renderer.root.findAll((el) => el.props?.['data-testid'] === 'weekly-report-prior-ready').length === 1,
      'Prior-week comparison unlocks at 14 recorded days',
    );
    // Sum of YouTube day-clipped foreground in current 7d = (25+20+45+30+50+15+40) = 225m = 3h 45m (NEVER 95m merged span inflation!)
    assert.match(sheetText, /3h 45m/, 'Weekly report YouTube total comes strictly from day-clipped foreground (3h 45m)');
    assertNoRedColorsAnywhere(renderer.toJSON(), 'Weekly report sheet');

    // 3. GOALS CREATE -> CALM RATIO ("4 of 7 days within target") -> EDIT -> DELETE -> CREATE SECOND GOAL FOR RESTART:
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'goal-new-btn').props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-title-input')
        .props.onChange({ target: { value: 'Calm YouTube window' } });
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-app-option-com.google.android.youtube')
        .props.onPress();
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-hours-input')
        .props.onChange({ target: { value: '0' } });
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-minutes-input')
        .props.onChange({ target: { value: '30' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'goal-save-btn').props.onPress();
    });

    const createdGoals = await store1.goals();
    assert.equal(createdGoals.length, 1);
    const goal1Id = createdGoals[0].id;
    const goalCard1 = renderer.root.find((el) => el.props?.['data-testid'] === `insights-goal-card-${goal1Id}`);
    const goalCard1Text = collectText(goalCard1).join(' ');
    assert.match(
      goalCard1Text,
      /4 of 7 days within target/,
      `Expected calm ratio "4 of 7 days within target" (proving 25m day-clipped foreground was used instead of 95m merged sitting span), got: ${goalCard1Text}`,
    );
    assert.equal(FORBIDDEN_GUILT_RE.test(goalCard1Text), false, 'Zero streaks or guilt words on goal card');
    assertNoRedColorsAnywhere(renderer.toJSON(), 'Goals list');

    // Edit goal from 30m -> 45m -> now 6 of 7 days within target (all except 50m day)!
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `goal-edit-btn-${goal1Id}`).props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-minutes-input')
        .props.onChange({ target: { value: '45' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'goal-save-btn').props.onPress();
    });
    const editedCardText = collectText(
      renderer.root.find((el) => el.props?.['data-testid'] === `insights-goal-card-${goal1Id}`),
    ).join(' ');
    assert.match(editedCardText, /6 of 7 days within target/, 'Edited 45m goal updates ratio to 6 of 7 days within target');

    // Delete goal (2-step: Keep cancels, Confirm delete removes)
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `goal-delete-btn-${goal1Id}`).props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `goal-cancel-delete-btn-${goal1Id}`).props.onPress();
    });
    assert.equal((await store1.goals()).length, 1, 'Keep preserves goal');

    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === `goal-delete-btn-${goal1Id}`).props.onPress();
    });
    await TestRenderer.act(async () => {
      await renderer.root
        .find((el) => el.props?.['data-testid'] === `goal-confirm-delete-btn-${goal1Id}`)
        .props.onPress();
    });
    assert.equal((await store1.goals()).length, 0, 'Confirm delete removes goal from SQLite');

    // Create a persistent goal to verify cold SQLite restart + export + typed DELETE
    await TestRenderer.act(async () => {
      renderer.root.find((el) => el.props?.['data-testid'] === 'goal-empty-create-btn').props.onPress();
    });
    await TestRenderer.act(async () => {
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-title-input')
        .props.onChange({ target: { value: 'MRRCANARY-Persistent-Goal' } });
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-app-option-com.google.android.youtube')
        .props.onPress();
      renderer.root
        .find((el) => el.props?.['data-testid'] === 'goal-minutes-input')
        .props.onChange({ target: { value: '30' } });
    });
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'goal-save-btn').props.onPress();
    });
    assert.equal((await store1.goals()).length, 1);

    // 4. OPT-IN LOCAL REMINDER PERMISSION FLOW:
    // First attempt: user denies Android POST_NOTIFICATIONS dialog -> toggle stays Off!
    nextPermResult = 'denied';
    await TestRenderer.act(async () => {
      await weeklyToggle().props.onPress();
    });
    assert.equal(permissionPrompts, 1, 'POST_NOTIFICATIONS requested only after user tapped toggle');
    assert.ok(collectText(weeklyToggle()).includes('Off'), 'Denied permission keeps toggle Off');
    assert.equal((await store1.weeklyReportPrefs()).reminderEnabled, false);
    assert.equal(
      renderer.root.findAll((el) => el.props?.['data-testid'] === 'reminder-permission-notice').length,
      1,
      'Shows calm permission notice when notifications are off',
    );

    // Second attempt: user grants permission -> toggle turns On & persists!
    nextPermResult = 'granted';
    await TestRenderer.act(async () => {
      await weeklyToggle().props.onPress();
    });
    assert.equal(permissionPrompts, 2);
    assert.ok(collectText(weeklyToggle()).includes('On'), 'Granted permission enables weekly reminder');
    await TestRenderer.act(async () => {
      await renderer.root.find((el) => el.props?.['data-testid'] === 'reminder-weekday-1').props.onPress();
      await renderer.root.find((el) => el.props?.['data-testid'] === 'reminder-hour-21').props.onPress();
      await budgetNoteToggle().props.onPress();
    });
    const savedPrefs = await store1.weeklyReportPrefs();
    assert.equal(savedPrefs.reminderEnabled, true);
    assert.equal(savedPrefs.reminderWeekday, 1);
    assert.equal(savedPrefs.reminderHourLocal, 21);
    assert.equal(savedPrefs.budgetNoteEnabled, true);

    for (const { label, isArray, nodeType } of collectA11yLabels(renderer.toJSON())) {
      assert.equal(isArray, false, `${nodeType} produced array accessibilityLabel`);
      assert.equal(typeof label, 'string');
    }

    renderer.unmount();
    driver1.close();
    driver1 = null;

    // 5. ENCRYPTION AT REST + COLD RESTART + PARTIAL WEEK (< 7 DAYS) + < 14 DAYS PRIOR-WEEK GATE + EXPORT + TYPED DELETE:
    const rawSqlite = readFileSync(dbPath).toString('utf8');
    assert.equal(
      rawSqlite.includes('MRRCANARY-Persistent-Goal'),
      false,
      'Goal title must be encrypted with XChaCha20-Poly1305 on disk',
    );

    const driver2 = mod.NodeSqliteDriver.file(dbPath);
    try {
      const store2 = new mod.MirrorStore({
        driver: driver2,
        keys: keyProvider,
        random: (n) => new Uint8Array(randomBytes(n)),
      });
      await store2.open();
      const reloadedGoals = await store2.goals();
      const reloadedPrefs = await store2.weeklyReportPrefs();
      const reloadedBudgets = await store2.budgets();
      assert.equal(reloadedGoals.length, 1, 'Goal survives cold SQLite restart');
      assert.equal(reloadedGoals[0].title, 'MRRCANARY-Persistent-Goal');
      assert.equal(reloadedPrefs.reminderEnabled, true, 'Reminder prefs survive cold SQLite restart');
      assert.equal(reloadedPrefs.budgetNoteEnabled, true, 'Gentle budget note pref survives cold SQLite restart');
      assert.equal(reloadedPrefs.reminderWeekday, 1);
      assert.equal(reloadedPrefs.reminderHourLocal, 21);

      // Render after restart with only 3 recorded days (< 7 partial week AND < 14 no prior-week comparison!)
      const partialDays = days14.slice(0, 3); // [2026-11-02 (25m), 2026-11-01 (20m), 2026-10-31 (45m)] -> 2 of 3 <= 30m!
      const partialTotals = fortnightTotals.slice(0, 3);
      const RestartedApp = buildP43Harness({
        store: store2,
        initialBudgets: reloadedBudgets,
        initialGoals: reloadedGoals,
        initialPrefs: reloadedPrefs,
        selectedDay: endDay,
        fortnightTotals: partialTotals,
        allRecordedDays: partialDays,
        sessions: sessions.slice(0, 2),
        intentLabels: { s1: 'intentional' },
        onExportCapture: (cap) => exportedCaptures.push(cap),
      });

      let restartedRenderer;
      TestRenderer.act(() => {
        restartedRenderer = TestRenderer.create(React.createElement(RestartedApp));
      });

      const restartedText = collectText(restartedRenderer.toJSON()).join(' ');
      assert.match(restartedText, /MRRCANARY-Persistent-Goal/, 'Restarted Insights renders persisted goal');
      assert.match(
        restartedText,
        /2 of 3 recorded days within target \(partial week\)/,
        'Partial week goal ratio marks partial week and never extrapolates to 7 days',
      );

      // Open Weekly Report sheet on 3-day history -> partial week note present & prior-week comparison gated (< 14 days)!
      await TestRenderer.act(async () => {
        restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'open-weekly-report-btn')
          .props.onPress();
      });
      assert.equal(
        restartedRenderer.root.findAll((el) => el.props?.['data-testid'] === 'weekly-report-partial-note').length,
        1,
        'Partial week callout shown on < 7 recorded days',
      );
      assert.equal(
        restartedRenderer.root.findAll((el) => el.props?.['data-testid'] === 'weekly-report-prior-ready').length,
        0,
        'Prior-week comparison stays gated below 14 recorded days',
      );

      // Switch to You tab -> test JSON Export (passphrase encrypted) AND typed DELETE!
      const youTabButtons = restartedRenderer.root.findAll(
        (el) => el.type === 'button' && collectText(el).includes('You'),
      );
      await TestRenderer.act(async () => {
        youTabButtons[youTabButtons.length - 1].props.onPress();
      });

      // Export encrypted JSON via YouTab UI
      await TestRenderer.act(async () => {
        restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'export-data-trigger')
          .props.onPress();
      });
      await TestRenderer.act(async () => {
        restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'export-passphrase-input')
          .props.onChange({ target: { value: 'p43-export-passphrase' } });
      });
      await TestRenderer.act(async () => {
        await restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'export-save-btn')
          .props.onPress();
      });
      assert.equal(exportedCaptures.length, 1);
      assert.equal(exportedCaptures[0].encrypted, true);
      assert.equal(
        exportedCaptures[0].json.includes('MRRCANARY-Persistent-Goal'),
        false,
        'Encrypted export hides goal title',
      );
      const decrypted = JSON.parse(
        mod.decryptExportBundle(JSON.parse(exportedCaptures[0].json), 'p43-export-passphrase'),
      );
      assert.equal(decrypted.budgets.length, 1);
      assert.equal(decrypted.goals.length, 1);
      assert.equal(decrypted.goals[0].title, 'MRRCANARY-Persistent-Goal');
      assert.equal(decrypted.weeklyReportPrefs.reminderEnabled, true);
      assert.equal(decrypted.weeklyReportPrefs.budgetNoteEnabled, true);

      // Typed DELETE via YouTab UI wipes budgets, goals, and resets reminder prefs!
      await TestRenderer.act(async () => {
        restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'delete-all-data-trigger')
          .props.onPress();
      });
      await TestRenderer.act(async () => {
        restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'delete-all-data-input')
          .props.onChange({ target: { value: 'DELETE' } });
      });
      await TestRenderer.act(async () => {
        await restartedRenderer.root
          .find((el) => el.props?.['data-testid'] === 'delete-all-data-confirm-btn')
          .props.onPress();
      });

      assert.deepEqual(await store2.budgets(), [], 'Typed DELETE wipes budgets');
      assert.deepEqual(await store2.goals(), [], 'Typed DELETE wipes goals');
      const prefsAfterDelete = await store2.weeklyReportPrefs();
      assert.equal(prefsAfterDelete.reminderEnabled, false, 'Typed DELETE resets weekly reminder to Off');
      assert.equal(prefsAfterDelete.budgetNoteEnabled, false, 'Typed DELETE resets gentle budget note to Off');

      restartedRenderer.unmount();
    } finally {
      driver2.close();
    }
  } finally {
    if (driver1) driver1.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
