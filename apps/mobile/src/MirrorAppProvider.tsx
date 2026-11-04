/* eslint-disable no-console */
import * as React from 'react';
import { AppState, Share } from 'react-native';
import {
  DEFAULT_WEEKLY_REPORT_PREFS,
  encryptExportBundle,
  type DayStoreRowCounts,
  type SessionRepairSnapshot,
  type SessionRow,
  type StoreResetAudit,
  type StoreResetReason,
  type WeeklyReportPrefs,
} from '@mirror/store';
import type {
  BudgetDayForegroundInput,
  BudgetDefinition,
  BudgetsEvaluationSummary,
  CuriositySplit,
  DayTotalsSource,
  DepthBand,
  DiscoveryJourneyResult,
  FlaggedAppDiscrepancy,
  FocusWindowsResult,
  GoalDefinition,
  GoalsEvaluationSummary,
  InterestEvolutionResult,
  OrphanDiagnosticSummary,
  RabbitHoleResult,
  RawUsageBucketDiagnostic,
  Score,
  ScoreGap,
  ScoredSession,
  StoredForegroundEventInput,
  TracedAppInterval,
  ValidationResult,
  WeeklyReportResult,
  WhatIfResult,
} from '@mirror/core-analytics';
import { NIGHT_WINDOW } from '@mirror/shared-types';
import {
  DEFAULT_MAX_INTERVAL_MS,
  SHARED_EXCLUDED_PACKAGES,
  buildCanonicalDaySittings,
  buildUsageEvents,
  computeDiscoveryJourney,
  computeFocusWindows,
  computeInterestEvolution,
  computeRabbitHoles,
  computeWeeklyReport,
  computeWhatIf,
  curiositySplit,
  evaluateAppOsDiscrepancies,
  evaluateBudgets,
  evaluateGoals,
  getTopInvalidPackages,
  isExcludedApp,
  scoreIqs,
  sessionBands,
  sumSittingSpanMs,
  summarizeOrphanDrops,
  validateBudgetDefinition,
  validateGoalDefinition,
  suggestBudgets,
  type BudgetSuggestion,
  resolveIntentLabels,
} from '@mirror/core-analytics';
import { createRuntime, type DataQuality } from './runtime';
import { osRandom } from './storage/keys';
import {
  defineUsageTask,
  provideRuntime,
  registerUsageTask,
  unregisterUsageTask,
} from './collector/background';
import { getCachedLabel, resolveAppLabels } from './collector/appLabels';
import { requestOptInNotificationPermission } from './collector/notifications';
import { fallbackSafeInsets, normalizeSafeInsets, type SafeInsets } from './components/useSafeInsets';
import {
  MirrorAppContext,
  dayEndMs,
  dayStartMs,
  formatDuration,
  lastNDays,
  toDayStr,
  type BudgetCandidateApp,
  type CombinableWhatIfScenarioId,
  type DailyTotal,
  type DebugRawEvent,
  type ExportDataOptions,
  type ExportDataResult,
  type MirrorAppContextValue,
  type PermissionState,
  type SaveBudgetResult,
  type SaveGoalResult,
  type ScaledSessionRow,
  type SingleDayRow,
  type TabKey,
  type UpdateReminderPrefsResult,
} from './context/MirrorAppContext';

export function MirrorAppProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<TabKey>('home');
  const [permission, setPermission] = React.useState<PermissionState>('checking');
  const [permissionDismissed, setPermissionDismissed] = React.useState<boolean>(false);
  const [insets, setInsets] = React.useState<SafeInsets>(() => fallbackSafeInsets());
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [dailyTotals, setDailyTotals] = React.useState<DailyTotal[]>([]);
  const [dailyTotalsSource, setDailyTotalsSource] = React.useState<DayTotalsSource>('os_events');
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [quality, setQuality] = React.useState<DataQuality | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [flaggedDiscrepancies, setFlaggedDiscrepancies] = React.useState<FlaggedAppDiscrepancy[]>([]);
  const [debugEvents, setDebugEvents] = React.useState<DebugRawEvent[]>([]);
  const [invalidTop, setInvalidTop] = React.useState<{ pkg: string; count: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastCollect, setLastCollect] = React.useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null);
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  const [keyMismatch, setKeyMismatch] = React.useState<{ oldKey: string; newKey: string } | null>(null);
  const [lastReset, setLastReset] = React.useState<StoreResetAudit | null>(null);
  const [todayStr, setTodayStr] = React.useState<string>(() => toDayStr(Date.now()));
  const [selectedDay, setSelectedDay] = React.useState<string>(() => toDayStr(Date.now()));
  const [singleDayRows, setSingleDayRows] = React.useState<SingleDayRow[]>([]);
  const [storeDayRowCounts, setStoreDayRowCounts] = React.useState<DayStoreRowCounts[]>([]);
  const [sessionRepairSnapshot, setSessionRepairSnapshot] =
    React.useState<SessionRepairSnapshot | null>(null);
  const [tracedAppIntervals, setTracedAppIntervals] = React.useState<TracedAppInterval[]>([]);
  const [collectingSince, setCollectingSince] = React.useState<string | null>(null);
  const [honkaiDebug, setHonkaiDebug] = React.useState<DebugRawEvent[]>([]);
  const [showDebug, setShowDebug] = React.useState(false);
  const [buildTapCount, setBuildTapCount] = React.useState(0);
  const [scaledSessions, setScaledSessions] = React.useState<ScaledSessionRow[]>([]);
  const [dayReady, setDayReady] = React.useState(false);
  const [dayWindow, setDayWindow] = React.useState<{ day: string; fromMs: number; toMs: number }>(() => {
    const today = toDayStr(Date.now());
    return { day: today, fromMs: dayStartMs(today), toMs: dayEndMs(today) };
  });
  const [evolution, setEvolution] = React.useState<InterestEvolutionResult | null>(null);
  const [discovery, setDiscovery] = React.useState<DiscoveryJourneyResult | null>(null);
  const [rabbitHole, setRabbitHole] = React.useState<RabbitHoleResult | null>(null);
  const [focusWindows, setFocusWindows] = React.useState<FocusWindowsResult | null>(null);
  const [dayScoredSessions, setDayScoredSessions] = React.useState<ScoredSession[]>([]);
  const [dayScoreGaps, setDayScoreGaps] = React.useState<ScoreGap[]>([]);
  const [launcherPackages, setLauncherPackages] = React.useState<string[]>([]);
  const [whatIfCapMin, setWhatIfCapMin] = React.useState<10 | 20>(10);
  const [whatIfQuietPreset, setWhatIfQuietPreset] = React.useState<'23-05' | '22-07'>('23-05');
  const [whatIfActiveScenarios, setWhatIfActiveScenarios] = React.useState<CombinableWhatIfScenarioId[]>([]);

  const toggleWhatIfScenario = React.useCallback((id: CombinableWhatIfScenarioId) => {
    setWhatIfActiveScenarios((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);
  const [latestSyncOrphans, setLatestSyncOrphans] = React.useState<OrphanDiagnosticSummary | null>(null);
  const [raw24hOrphans, setRaw24hOrphans] = React.useState<OrphanDiagnosticSummary | null>(null);
  const [showWhy, setShowWhy] = React.useState(false);
  /** Raw per-sitting labels the user chose (the only thing written to storage). */
  const [sittingLabels, setSittingLabels] = React.useState<Record<string, 'intentional' | 'mindless' | 'unsure'>>({});
  /** P4.4b user app rules; they fill in unlabeled sittings only, never past labels. */
  const [appRules, setAppRules] = React.useState<Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }>>({});
  const appRulesRef = React.useRef(appRules);
  appRulesRef.current = appRules;
  /** Resolve effective labels: a sitting's own label wins, else the app rule. Pure; never reads duration. */
  const applyAppRules = (
    sessionRows: readonly { id: string; app: string }[],
    raw: Record<string, 'intentional' | 'mindless' | 'unsure'>,
  ): Record<string, 'intentional' | 'mindless' | 'unsure'> =>
    resolveIntentLabels({ sessions: sessionRows, sittingLabels: raw, rules: appRulesRef.current }).labels;
  const [labelSaving, setLabelSaving] = React.useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = React.useState<string | null>(null);
  const [labelOptIn, setLabelOptIn] = React.useState(false);
  const [budgets, setBudgets] = React.useState<BudgetDefinition[]>([]);
  const [suggestionDismissals, setSuggestionDismissals] = React.useState<Record<string, number>>({});
  const [budgetWeekOtherDays, setBudgetWeekOtherDays] = React.useState<BudgetDayForegroundInput[]>([]);
  const [budgetHistoryStartDay, setBudgetHistoryStartDay] = React.useState<string | null>(null);
  const [goals, setGoals] = React.useState<GoalDefinition[]>([]);
  const [weeklyReportPrefs, setWeeklyReportPrefs] = React.useState<WeeklyReportPrefs>(
    () => ({ ...DEFAULT_WEEKLY_REPORT_PREFS }),
  );
  const [showWeeklyReport, setShowWeeklyReport] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [histScoredSessions, setHistScoredSessions] = React.useState<ScoredSession[]>([]);
  /** Effective labels for every consumer (Sessions, Insights, Journey, Why, IQS, What-if). */
  const labelResolution = React.useMemo(() => {
    const byId = new Map<string, { id: string; app: string }>();
    for (const x of histScoredSessions) byId.set(x.id, { id: x.id, app: x.app });
    for (const x of dayScoredSessions) byId.set(x.id, { id: x.id, app: x.app });
    return resolveIntentLabels({
      sessions: [...byId.values()],
      sittingLabels,
      rules: appRules,
    });
  }, [histScoredSessions, dayScoredSessions, sittingLabels, appRules]);
  const intentLabels = labelResolution.labels;
  const [histStoredEvents, setHistStoredEvents] = React.useState<StoredForegroundEventInput[]>([]);

  const runtimeRef = React.useRef<Awaited<ReturnType<typeof createRuntime>> | null>(null);
  const hasLoadedOnceRef = React.useRef(false);
  const loadSeqRef = React.useRef(0);
  const lastKnownTodayRef = React.useRef<string>(toDayStr(Date.now()));

  const checkPermissionAndCollect = React.useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const isCurrent = () => loadSeqRef.current === seq;
    const currentToday = toDayStr(Date.now());
    setTodayStr((prev) => (prev === currentToday ? prev : currentToday));
    if (lastKnownTodayRef.current !== currentToday) {
      lastKnownTodayRef.current = currentToday;
      if (selectedDay !== currentToday) {
        setSelectedDay(currentToday);
        return;
      }
    }
    const targetDay = selectedDay;
    try {
      if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      const runtime = await createRuntime();
      runtimeRef.current = runtime;
      try {
        const [resetAudit, storedBudgets, storedGoals, storedPrefs] = await Promise.all([
          runtime.lastReset(),
          runtime.listBudgets(),
          runtime.listGoals(),
          runtime.getWeeklyReportPrefs(),
        ]);
        if (isCurrent()) {
          setLastReset(resetAudit);
          setBudgets(storedBudgets);
          setGoals(storedGoals);
          setWeeklyReportPrefs(storedPrefs);
          setSuggestionDismissals(await runtime.budgetSuggestionDismissals().catch(() => ({})));
        }
        const savedPkgs = [
          ...new Set([
            ...storedBudgets.flatMap((b) => [...b.packages]),
            ...storedGoals.flatMap((g) => [...(g.packages ?? [])]),
          ]),
        ];
        if (savedPkgs.length > 0) {
          const resolvedSavedLabels = await resolveAppLabels(savedPkgs).catch(
            () => ({}) as Record<string, string>,
          );
          if (isCurrent() && Object.keys(resolvedSavedLabels).length > 0) {
            setLabels((prev) => ({ ...prev, ...resolvedSavedLabels }));
          }
        }
      } catch {}
      provideRuntime({
        store: runtime.store,
        collectNow: runtime.collectNow,
        ingestRecent: runtime.ingestRecent,
        syncLocalReminders: runtime.syncLocalReminders,
      });
      defineUsageTask();

      const usage = runtime.usage();
      const nativeInsets = usage.getWindowInsets();
      if (nativeInsets && isCurrent()) {
        setInsets(normalizeSafeInsets(nativeInsets));
      }
      if (!usage.available) {
        if (!isCurrent()) return;
        setPermission('unavailable');
        hasLoadedOnceRef.current = true;
        setLoading(false);
        return;
      }

      const has = await usage.hasPermission();
      if (!has) {
        if (!isCurrent()) return;
        setPermission('denied');
        await unregisterUsageTask().catch(() => {});
        setLastCollect('usage access turned off — showing stored on-device history');
      } else {
        if (!isCurrent()) return;
        setPermission('granted');
        try {
          await registerUsageTask();
        } catch {}

        const collectResult = await runtime.collectNow();
        if (!isCurrent()) return;
        if (collectResult.status === 'permission-required') {
          setPermission('denied');
          await unregisterUsageTask().catch(() => {});
          setLastCollect('usage access turned off — showing stored on-device history');
        } else if (collectResult.status === 'collected') {
          const byReason = collectResult.gaps.reduce((acc: Record<string, number>, g) => {
            acc[g.reason] = (acc[g.reason] ?? 0) + g.count;
            return acc;
          }, {});
          const gapTotal = collectResult.gaps.reduce((sum, g) => sum + g.count, 0);
          const spannedCount = collectResult.gaps
            .filter((g) => g.fromMs !== undefined && g.toMs !== undefined && g.toMs > g.fromMs)
            .reduce((sum, g) => sum + g.count, 0);
          const kindLabel =
            gapTotal === 0
              ? '0 unmatched events'
              : spannedCount === 0
                ? `${gapTotal} unmatched event${gapTotal === 1 ? '' : 's'}`
                : `${gapTotal} gap/unmatched event${gapTotal === 1 ? '' : 's'}`;
          setLastCollect(
            `collect: ${collectResult.events} events (${collectResult.inserted} new, ${collectResult.duplicate} skipped), ${kindLabel}${gapTotal > 0 ? ` (${Object.entries(byReason).map(([k, v]) => `${k}:${v}`).join(', ')})` : ''}`,
          );
          try {
            const orphanPkgs = [
              ...new Set(collectResult.dropped.filter((d) => d.reason === 'orphan_background' && d.app).map((d) => d.app!)),
            ];
            const orphanLabels = orphanPkgs.length > 0 ? await resolveAppLabels(orphanPkgs) : {};
            if (isCurrent()) {
              setLatestSyncOrphans(summarizeOrphanDrops(collectResult.dropped, orphanLabels, 6));
            }
          } catch {}
          try {
            const top = getTopInvalidPackages(collectResult.dropped as Parameters<typeof getTopInvalidPackages>[0]);
            if (isCurrent()) setInvalidTop(top);
            console.log('Top invalid_package:', top);
          } catch {}
        } else {
          setLastCollect(`collect: ${collectResult.status}`);
        }

        await runtime.ingestRecent();
        runtime.syncLocalReminders().catch(() => {});
        if (!isCurrent()) return;
      }

      // Refresh reset audit, budgets, goals, & prefs in case runtime.collectNow() recovered from a Keystore invalidation
      try {
        const [resetAudit, refreshedBudgets, refreshedGoals, refreshedPrefs] = await Promise.all([
          runtime.lastReset(),
          runtime.listBudgets(),
          runtime.listGoals(),
          runtime.getWeeklyReportPrefs(),
        ]);
        if (isCurrent()) {
          setLastReset(resetAudit);
          setBudgets(refreshedBudgets);
          setGoals(refreshedGoals);
          setWeeklyReportPrefs(refreshedPrefs);
        }
      } catch {}

      let earliestStoreDayFromCounts: string | null = null;
      try {
        const [rowCounts, repairSnap, earliestEvAt] = await Promise.all([
          runtime.storeDayRowCounts(),
          runtime.sessionRepairSnapshot(),
          runtime.store.earliestEventAt().catch(() => null),
        ]);
        if (rowCounts.length > 0) {
          earliestStoreDayFromCounts = rowCounts[0]!.day;
        }
        if (typeof earliestEvAt === 'number' && Number.isFinite(earliestEvAt)) {
          const evDay = toDayStr(earliestEvAt);
          if (!earliestStoreDayFromCounts || evDay < earliestStoreDayFromCounts) {
            earliestStoreDayFromCounts = evDay;
          }
        }
        if (isCurrent()) {
          setStoreDayRowCounts(rowCounts);
          setSessionRepairSnapshot(repairSnap);
          setBudgetHistoryStartDay(earliestStoreDayFromCounts);
        }
      } catch {}

      let flaggedAppsForDebug = new Set<string>();
      try {
        const dayFrom = dayStartMs(targetDay);
        const dayTo = dayEndMs(targetDay);
        const resolvedOs = await runtime.osTotalsWithSource({ fromMs: dayFrom, toMs: dayTo });
        const osRows = resolvedOs.totals;
        let launcherPkgs: string[] = [];
        try {
          launcherPkgs = await usage.getLauncherPackages();
        } catch {}
        const sharedIgnore = [...new Set([...SHARED_EXCLUDED_PACKAGES, ...launcherPkgs])];
        const candidateOs = osRows.filter(
          (r) => !isExcludedApp(r.packageName, { ignorePackages: sharedIgnore }) && r.totalMs > 0,
        );
        const resolved = await resolveAppLabels(candidateOs.map((r) => r.packageName));
        const filteredOs = candidateOs.filter(
          (r) =>
            !isExcludedApp(r.packageName, {
              ignorePackages: sharedIgnore,
              label: resolved[r.packageName],
            }),
        );
        const osMap = new Map<string, number>();
        for (const r of filteredOs) {
          osMap.set(r.packageName, (osMap.get(r.packageName) ?? 0) + r.totalMs);
        }
        const totals: DailyTotal[] = [...osMap.entries()]
          .map(([app, totalMs]) => ({ app, label: resolved[app] ?? app, totalMs }))
          .sort((a, b) => b.totalMs - a.totalMs || a.app.localeCompare(b.app));

        const sessDay = await runtime.store.sessions({ fromMs: dayFrom, toMs: dayTo });
        const sessResolved = await resolveAppLabels(sessDay.map((s) => s.app));
        const allLabelsForDay = { ...resolved, ...sessResolved };

        // Single canonical day sitting set used everywhere across Home, Insights, IQS, and Sessions.
        const canonicalSittings = buildCanonicalDaySittings(
          sessDay.map((s) => ({ id: s.id, app: s.app, startMs: s.start_ms, endMs: s.end_ms })),
          {
            window: { fromMs: dayFrom, toMs: dayTo },
            ignorePackages: sharedIgnore,
            appLabels: allLabelsForDay,
          },
        );
        const sessById = new Map<string, SessionRow>();
        for (const s of sessDay) sessById.set(s.id, s);
        const canonicalSessionRows: SessionRow[] = canonicalSittings
          .map((c) => {
            const orig = sessById.get(c.id);
            if (!orig) return null;
            return {
              ...orig,
              start_ms: c.startMs,
              end_ms: c.endMs,
              duration_ms: c.endMs - c.startMs,
            };
          })
          .filter((r): r is SessionRow => r !== null)
          .reverse();

        const openOnly: ScaledSessionRow[] = canonicalSittings
          .map((c) => ({
            id: c.id,
            app: c.app,
            label: allLabelsForDay[c.app] ?? getCachedLabel(c.app),
            start_ms: c.startMs,
            end_ms: c.endMs,
            duration_ms: c.endMs - c.startMs,
            scaled_duration_ms: 0,
            isScaled: false,
          }))
          .sort((a, b) => b.start_ms - a.start_ms);

        let loadedLabels: Record<string, 'intentional' | 'mindless' | 'unsure'> = {};
        try {
          loadedLabels = await runtime.loadIntentLabels();
        } catch {}
        try {
          const loadedRules = await runtime.appRules();
          appRulesRef.current = loadedRules;
          setAppRules(loadedRules);
        } catch {}

        const gapsRaw = await runtime.store.gaps({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
        const scoreGaps: ScoreGap[] = gapsRaw.map((g) => ({
          reason: g.reason,
          count: g.count,
          fromMs: g.from_ms ?? undefined,
          toMs: g.to_ms ?? undefined,
        }));

        if (!isCurrent()) return;
        setLauncherPackages(sharedIgnore);
        setLabels((prev) => ({ ...prev, ...allLabelsForDay }));
        setDailyTotals(totals);
        setDailyTotalsSource(resolvedOs.source);
        setSessions(canonicalSessionRows);
        setScaledSessions(openOnly);
        setSittingLabels(loadedLabels);
        setDayWindow({ day: targetDay, fromMs: dayFrom, toMs: dayTo });
        setDayScoredSessions(canonicalSittings);
        setDayScoreGaps(scoreGaps);
        setLastSyncedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        );
        setDayReady(true);

        // Resolve day-clipped foreground totals for the preceding 13 days in the 14-day
        // window (`targetDay - 13 .. targetDay - 1`) using the exact same `osTotalsWithSource`
        // + `isExcludedApp` pipeline as `Home`. Days before `effectiveHistoryStart` remain
        // unrecorded so partial weeks are never extrapolated, while 14+ recorded days unlock
        // Weekly Report prior-week comparison.
        try {
          const effectiveHistoryStart =
            earliestStoreDayFromCounts ??
            (totals.length > 0 ? targetDay : null);
          if (effectiveHistoryStart && isCurrent()) {
            setBudgetHistoryStartDay(effectiveHistoryStart);
          }
          const priorDays = lastNDays(14, targetDay)
            .slice(1)
            .filter((d) => effectiveHistoryStart !== null && d >= effectiveHistoryStart);
          const priorEntries = await Promise.all(
            priorDays.map(async (d) => {
              const resDay = await runtime.osTotalsWithSource({
                fromMs: dayStartMs(d),
                toMs: dayEndMs(d),
              });
              const cand = resDay.totals.filter(
                (r) => !isExcludedApp(r.packageName, { ignorePackages: sharedIgnore }) && r.totalMs > 0,
              );
              const dayLabels = cand.length > 0 ? await resolveAppLabels(cand.map((r) => r.packageName)) : {};
              const filt = cand.filter(
                (r) =>
                  !isExcludedApp(r.packageName, {
                    ignorePackages: sharedIgnore,
                    label: dayLabels[r.packageName],
                  }),
              );
              return {
                entry: {
                  day: d,
                  source: resDay.source,
                  totals: filt.map((r) => ({ app: r.packageName, totalMs: r.totalMs })),
                } satisfies BudgetDayForegroundInput,
                dayLabels,
              };
            }),
          );
          if (isCurrent()) {
            const extraLabels: Record<string, string> = {};
            for (const item of priorEntries) {
              Object.assign(extraLabels, item.dayLabels);
            }
            if (Object.keys(extraLabels).length > 0) {
              setLabels((prev) => ({ ...prev, ...extraLabels }));
            }
            setBudgetWeekOtherDays(priorEntries.map((x) => x.entry));
          }
        } catch {
          if (isCurrent()) {
            setBudgetWeekOtherDays([]);
          }
        }

        try {
          const histFrom = dayTo - 30 * 86_400_000;
          const focusHistFrom = dayTo - 84 * 86_400_000;
          const [allHistSessions, storedHistBgRows] = await Promise.all([
            runtime.store.sessions({ fromMs: focusHistFrom, toMs: dayTo }),
            runtime.store.events({
              from: histFrom - DEFAULT_MAX_INTERVAL_MS,
              to: dayTo + DEFAULT_MAX_INTERVAL_MS,
              kind: 'app_background',
            }),
          ]);
          const histEvents = storedHistBgRows
            .map(
              (r) =>
                r.payload as unknown as {
                  id?: string;
                  kind: string;
                  app?: string;
                  at: string;
                  duration_ms?: number;
                },
            )
            .filter(
              (ev) =>
                ev.kind === 'app_background' &&
                typeof ev.app === 'string' &&
                typeof ev.duration_ms === 'number' &&
                Date.parse(ev.at) > histFrom &&
                Date.parse(ev.at) - ev.duration_ms < dayTo,
            );
          const histSessions = allHistSessions.filter((s) => s.end_ms > histFrom && s.start_ms < dayTo);
          const eventApps = histEvents
            .map((ev) => (typeof ev.app === 'string' ? ev.app : null))
            .filter((pkg): pkg is string => pkg !== null);
          const histApps = [...new Set([...allHistSessions.map((s) => s.app), ...eventApps])].filter(
            (app) => !isExcludedApp(app, { ignorePackages: sharedIgnore }),
          );
          const histResolved = await resolveAppLabels(histApps);
          const mergedLabels = { ...allLabelsForDay, ...histResolved };
          if (!isCurrent()) return;
          setLabels((prev) => ({ ...prev, ...mergedLabels }));
          const histScored: ScoredSession[] = histSessions.map((s) => ({
            id: s.id,
            app: s.app,
            startMs: s.start_ms,
            endMs: s.end_ms,
          }));
          const focusScored: ScoredSession[] = allHistSessions.map((s) => ({
            id: s.id,
            app: s.app,
            startMs: s.start_ms,
            endMs: s.end_ms,
          }));
          setHistScoredSessions(histScored);
          setHistStoredEvents(histEvents);
          const utcOffsetMinutes = -new Date().getTimezoneOffset();
          const evalNowMs = Math.min(Date.now(), dayTo);
          setEvolution(
            computeInterestEvolution({
              sessions: histScored,
              events: histEvents,
              nowMs: evalNowMs,
              utcOffsetMinutes,
              labels: mergedLabels,
              ignorePackages: sharedIgnore,
            }),
          );
          setDiscovery(
            computeDiscoveryJourney({
              sessions: histScored,
              events: histEvents,
              nowMs: evalNowMs,
              osTotals: totals,
              intentLabels: applyAppRules(histScored, loadedLabels),
              labelWindow: { fromMs: dayFrom, toMs: dayTo },
              labels: mergedLabels,
              ignorePackages: sharedIgnore,
              utcOffsetMinutes,
            }),
          );
          setRabbitHole(
            computeRabbitHoles({
              events: histEvents,
              sessions: histScored,
              nowMs: evalNowMs,
              intentLabels: applyAppRules(histScored, loadedLabels),
              labels: mergedLabels,
              ignorePackages: sharedIgnore,
              utcOffsetMinutes,
            }),
          );
          setFocusWindows(
            computeFocusWindows({
              sessions: focusScored,
              intentLabels: applyAppRules(focusScored, loadedLabels),
              labels: mergedLabels,
              ignorePackages: sharedIgnore,
              utcOffsetMinutes,
            }),
          );
        } catch {
          if (isCurrent()) {
            setEvolution(null);
            setDiscovery(null);
            setRabbitHole(null);
            setFocusWindows(null);
            setHistScoredSessions([]);
            setHistStoredEvents([]);
          }
        }

        try {
          const v = await runtime.validate({ fromMs: dayFrom, toMs: dayTo });
          if (isCurrent()) setValidation(v);
        } catch {}

        try {
          const [liveDayFg, storedFg, rawBuckets] = await Promise.all([
            runtime.liveDayForegroundTotals({ fromMs: dayFrom, toMs: dayTo }),
            runtime.storedForegroundTotals({ fromMs: dayFrom, toMs: dayTo }),
            runtime.rawBucketTotals({ fromMs: dayFrom, toMs: dayTo }),
          ]);
          const liveDayFgMap = new Map<string, number>();
          for (const r of liveDayFg) liveDayFgMap.set(r.packageName, r.totalMs);
          const effectiveDayFgMap = liveDayFgMap.size > 0 ? liveDayFgMap : osMap;
          const storedMap = new Map<string, number>();
          for (const r of storedFg) storedMap.set(r.packageName, r.totalMs);
          const rawBucketMap = new Map<string, RawUsageBucketDiagnostic>();
          for (const r of rawBuckets) rawBucketMap.set(r.packageName, r);
          const sittingMap = new Map<string, number>();
          for (const s of canonicalSittings) {
            sittingMap.set(s.app, (sittingMap.get(s.app) ?? 0) + (s.endMs - s.startMs));
          }
          const allApps = new Set<string>([
            ...storedMap.keys(),
            ...osMap.keys(),
            ...effectiveDayFgMap.keys(),
            ...sittingMap.keys(),
            ...rawBucketMap.keys(),
          ]);
          const candidateApps = [...allApps].filter(
            (app) => !isExcludedApp(app, { ignorePackages: sharedIgnore }),
          );
          const resolvedDay = await resolveAppLabels(candidateApps);
          const filteredApps = candidateApps.filter(
            (app) =>
              !isExcludedApp(app, {
                ignorePackages: sharedIgnore,
                label: resolvedDay[app],
              }),
          );
          const allowedSet = new Set(filteredApps);

          const discrepancies = evaluateAppOsDiscrepancies({
            displayedTotals: totals.filter((t) => allowedSet.has(t.app)).map((t) => ({ app: t.app, totalMs: t.totalMs })),
            dayFgTotals: [...effectiveDayFgMap.entries()]
              .filter(([pkg]) => allowedSet.has(pkg))
              .map(([packageName, totalMs]) => ({ packageName, totalMs })),
            storedTotals: [...storedMap.entries()]
              .filter(([pkg]) => allowedSet.has(pkg))
              .map(([packageName, totalMs]) => ({ packageName, totalMs })),
            sittingTotals: [...sittingMap.entries()]
              .filter(([pkg]) => allowedSet.has(pkg))
              .map(([app, totalMs]) => ({ app, totalMs })),
            rawBucketDiagnostics: [...rawBucketMap.values()].filter((d) => allowedSet.has(d.packageName)),
            labels: resolvedDay,
          });
          flaggedAppsForDebug = new Set(discrepancies.map((d) => d.app));
          const discrepancyByApp = new Map<string, FlaggedAppDiscrepancy>();
          for (const d of discrepancies) discrepancyByApp.set(d.app, d);

          const rows: SingleDayRow[] = filteredApps
            .map((app) => {
              const displayedMs = osMap.get(app) ?? 0;
              const mirrorMs = storedMap.get(app) ?? 0;
              const osMs = effectiveDayFgMap.get(app) ?? 0;
              const rawDiag = rawBucketMap.get(app);
              const rawBucketMs = rawDiag?.totalMs ?? 0;
              const preMidnightBucketMs = rawDiag?.preMidnightBucketMs ?? 0;
              const sameDayBucketMs =
                rawDiag?.sameDayBucketMs ?? Math.max(0, rawBucketMs - preMidnightBucketMs);
              const appSittingSpanMs = sittingMap.get(app) ?? 0;
              const referenceOsMs = sameDayBucketMs > 0 ? sameDayBucketMs : osMs;
              const diff =
                referenceOsMs > 0
                  ? ((displayedMs - referenceOsMs) / referenceOsMs) * 100
                  : displayedMs > 0
                    ? 100
                    : 0;
              const disc = discrepancyByApp.get(app);
              const status = disc
                ? disc.status
                : Math.abs(displayedMs - referenceOsMs) <= Math.max(referenceOsMs * 0.1, 60_000)
                  ? 'ok'
                  : displayedMs < referenceOsMs
                    ? 'low'
                    : 'high';
              return {
                app,
                label: resolvedDay[app] ?? app,
                displayedMs,
                mirrorMs,
                osMs,
                rawBucketMs,
                preMidnightBucketMs,
                sameDayBucketMs,
                bucketCount: rawDiag?.bucketCount ?? 0,
                earliestBucketStartMs: rawDiag?.earliestBucketStartMs,
                latestBucketEndMs: rawDiag?.latestBucketEndMs,
                sittingSpanMs: appSittingSpanMs,
                diffPct: diff,
                status,
                flagged: Boolean(disc),
                flagReason: disc
                  ? `${disc.comparison}: Mirror ${formatDuration(disc.mirrorMs)} vs OS ${formatDuration(disc.osMs)}, ${disc.diffMs >= 0 ? '+' : '-'}${Math.round(Math.abs(disc.diffMs) / 1000)}s (${disc.diffPct >= 0 ? '+' : ''}${disc.diffPct.toFixed(1)}%)`
                  : undefined,
              };
            })
            .sort((a, b) => {
              const aFlag = a.flagged ? 1 : 0;
              const bFlag = b.flagged ? 1 : 0;
              if (aFlag !== bFlag) return bFlag - aFlag;
              return b.osMs - a.osMs || (b.displayedMs ?? 0) - (a.displayedMs ?? 0) || b.rawBucketMs! - a.rawBucketMs!;
            });
          if (isCurrent()) {
            setLabels((prev) => ({ ...prev, ...resolvedDay }));
            setFlaggedDiscrepancies(discrepancies);
            setSingleDayRows(rows);
          }
        } catch {}
      } catch (e) {
        console.log('OS totals failed', e);
      }

      try {
        const now = Date.now();
        const dayFrom = dayStartMs(targetDay);
        const dayTo = dayEndMs(targetDay);
        const debugFrom = dayFrom - DEFAULT_MAX_INTERVAL_MS;
        const debugTo = Math.min(dayTo + DEFAULT_MAX_INTERVAL_MS, now);
        const debug =
          has && debugTo > debugFrom ? await usage.queryEventsDebug(debugFrom, debugTo) : [];
        if (isCurrent()) setDebugEvents(debug.slice(-120));
        console.log(
          `RAW UsageEvents debug (${targetDay}, count):`,
          debug.length,
          JSON.stringify(debug.slice(-30), null, 2),
        );
        try {
          let launcherPkgs: string[] = [];
          try {
            launcherPkgs = await usage.getLauncherPackages();
          } catch {}
          const since24h = now - 24 * 3_600_000;
          const debug24h =
            !has
              ? []
              : targetDay === toDayStr(now)
                ? debug.filter((e) => e.timeStamp >= since24h)
                : await usage.queryEventsDebug(since24h, now);
          const built24h = buildUsageEvents(debug24h, {
            sinceMs: since24h,
            untilMs: now,
            ignorePackages: [...new Set([...SHARED_EXCLUDED_PACKAGES, ...launcherPkgs])],
          });
          const orphanPkgs = [
            ...new Set(built24h.dropped.filter((d) => d.reason === 'orphan_background' && d.app).map((d) => d.app!)),
          ];
          const orphanLabels = orphanPkgs.length > 0 ? await resolveAppLabels(orphanPkgs) : {};
          if (isCurrent()) {
            setLabels((prev) => ({ ...prev, ...orphanLabels }));
            setRaw24hOrphans(summarizeOrphanDrops(built24h.dropped, orphanLabels, 8));
          }
        } catch {}

        const traceApps = [...new Set<string>(['com.openai.chatgpt', ...flaggedAppsForDebug])];
        try {
          const allTraced = await Promise.all(
            traceApps.map((pkg) => runtime.traceAppDayIntervals(pkg, { fromMs: dayFrom, toMs: dayTo })),
          );
          const flatTraced = allTraced.flat();
          if (isCurrent()) {
            setTracedAppIntervals(flatTraced);
            if (flatTraced.length > 0) {
              console.log(
                `Traced foreground intervals (${targetDay}):`,
                JSON.stringify(flatTraced, null, 2),
              );
            }
          }
        } catch {}

        const inspectedPkgs = new Set<string>([
          'com.openai.chatgpt',
          'com.HoYoverse.hkrpgoversea',
          'com.miHoYo.hkrpg',
          'com.HoYoverse.StarRail',
          'com.miHoYo.GenshinImpact',
          ...flaggedAppsForDebug,
        ]);
        const inspected = debug.filter(
          (e) =>
            inspectedPkgs.has(e.packageName) ||
            e.packageName.toLowerCase().includes('chatgpt') ||
            e.packageName.toLowerCase().includes('hkrpg') ||
            e.packageName.toLowerCase().includes('honkai') ||
            e.packageName.toLowerCase().includes('genshin'),
        );
        if (isCurrent()) {
          setHonkaiDebug(inspected.slice(-200));
          if (inspected.length > 0) {
            console.log(
              `Inspected/Flagged app raw events (${targetDay}):`,
              JSON.stringify(inspected.slice(-80), null, 2),
            );
          }
        }
      } catch {}

      try {
        const cursor = await runtime.cursorState();
        if (isCurrent()) {
          if (cursor.at) {
            setCollectingSince(
              new Date(cursor.at).toLocaleDateString() + ' ' + new Date(cursor.at).toLocaleTimeString(),
            );
          } else {
            setCollectingSince(new Date(Date.now() - 86_400_000).toLocaleDateString() + ' (first sync reads 1 day back)');
          }
        }
      } catch {}

      const q = await runtime.dataQuality({ fromMs: dayStartMs(targetDay), toMs: dayEndMs(targetDay) });
      if (!isCurrent()) return;
      setQuality(q);
      hasLoadedOnceRef.current = true;
      setLoading(false);
    } catch (e: unknown) {
      if (!isCurrent()) return;
      const msg = e instanceof Error ? e.message : String(e);
      const m = /record was sealed with key "([^"]+)", current key is "([^"]+)"/.exec(msg);
      if (m) {
        console.info(
          '[MirrorStore:keyMismatch]',
          JSON.stringify({ at: new Date().toISOString(), sealedWith: m[1], currentKey: m[2] }),
        );
        setKeyMismatch({ oldKey: m[1]!, newKey: m[2]! });
        setError(
          `Stored data can't be read – it was sealed with key "${m[1]}", current key is "${m[2]}". This can happen after reinstall or backup restore.`,
        );
      } else {
        setError(msg);
      }
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [selectedDay]);

  React.useEffect(() => {
    checkPermissionAndCollect();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const currentToday = toDayStr(Date.now());
        setTodayStr((prev) => (prev === currentToday ? prev : currentToday));
        if (lastKnownTodayRef.current !== currentToday) {
          lastKnownTodayRef.current = currentToday;
          setSelectedDay(currentToday);
          return;
        }
        checkPermissionAndCollect();
      }
    });
    return () => sub.remove();
  }, [checkPermissionAndCollect]);

  const openSettings = React.useCallback(() => {
    try {
      runtimeRef.current?.usage().openSettings();
    } catch {}
  }, []);

  const recomputeFromLabels = React.useCallback(
    async (updatedLabels: Record<string, 'intentional' | 'mindless' | 'unsure'>) => {
      const rt = runtimeRef.current;
      if (!rt) return;
      try {
        const dayFrom = dayWindow.fromMs;
        const dayTo = dayWindow.toMs;
        let launcherPkgs: string[] = [];
        try {
          launcherPkgs = await rt.usage().getLauncherPackages();
        } catch {}
        const utcOffsetMinutes = -new Date().getTimezoneOffset();
        const histFrom = dayTo - 30 * 86_400_000;
        const sharedIgnore = [...new Set([...SHARED_EXCLUDED_PACKAGES, ...launcherPkgs])];
        const [allHistSessions, storedHistBgRows] = await Promise.all([
          rt.store.sessions({ fromMs: dayTo - 84 * 86_400_000, toMs: dayTo }),
          rt.store.events({
            from: histFrom - DEFAULT_MAX_INTERVAL_MS,
            to: dayTo + DEFAULT_MAX_INTERVAL_MS,
            kind: 'app_background',
          }),
        ]);
        const histEvents = storedHistBgRows
          .map(
            (r) =>
              r.payload as unknown as {
                id?: string;
                kind: string;
                app?: string;
                at: string;
                duration_ms?: number;
              },
          )
          .filter(
            (ev) =>
              ev.kind === 'app_background' &&
              typeof ev.app === 'string' &&
              typeof ev.duration_ms === 'number' &&
              Date.parse(ev.at) > histFrom &&
              Date.parse(ev.at) - ev.duration_ms < dayTo,
          );
        const evalNowMs = Math.min(Date.now(), dayTo);
        const histScored: ScoredSession[] = allHistSessions
          .filter((x) => x.end_ms > histFrom && x.start_ms < dayTo)
          .map((x) => ({
            id: x.id,
            app: x.app,
            startMs: x.start_ms,
            endMs: x.end_ms,
          }));
        const focusScored: ScoredSession[] = allHistSessions.map((x) => ({
          id: x.id,
          app: x.app,
          startMs: x.start_ms,
          endMs: x.end_ms,
        }));
        setHistScoredSessions(histScored);
        setHistStoredEvents(histEvents);
        setDiscovery(
          computeDiscoveryJourney({
            sessions: histScored,
            events: histEvents,
            nowMs: evalNowMs,
            osTotals: dailyTotals,
            intentLabels: applyAppRules(histScored, updatedLabels),
            labelWindow: { fromMs: dayFrom, toMs: dayTo },
            labels,
            ignorePackages: sharedIgnore,
            utcOffsetMinutes,
          }),
        );
        setRabbitHole(
          computeRabbitHoles({
            events: histEvents,
            sessions: histScored,
            nowMs: evalNowMs,
            intentLabels: applyAppRules(histScored, updatedLabels),
            labels,
            ignorePackages: sharedIgnore,
            utcOffsetMinutes,
          }),
        );
        setFocusWindows(
          computeFocusWindows({
            sessions: focusScored,
            intentLabels: applyAppRules(focusScored, updatedLabels),
            labels,
            ignorePackages: sharedIgnore,
            utcOffsetMinutes,
          }),
        );
      } catch {}
    },
    [dayWindow, labels, dailyTotals],
  );

  const saveSessionLabel = React.useCallback(
    async (sessionId: string, lbl: 'intentional' | 'mindless' | 'unsure') => {
      try {
        setLabelSaving(sessionId);
        const runtime = runtimeRef.current;
        if (runtime) {
          await runtime.saveIntentLabel(sessionId, lbl);
          const updatedLabels = { ...sittingLabels, [sessionId]: lbl };
          setSittingLabels(updatedLabels);
          await recomputeFromLabels(updatedLabels);
        }
      } finally {
        setLabelSaving(null);
      }
    },
    [sittingLabels, recomputeFromLabels],
  );

  const clearStoredLabels = React.useCallback(async () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    await rt.clearAllIntentLabels();
    setSittingLabels({});
    await recomputeFromLabels({});
  }, [recomputeFromLabels]);

  const exportAllData = React.useCallback(
    async (opts?: ExportDataOptions): Promise<ExportDataResult> => {
      const passphrase = opts?.passphrase?.trim() ?? '';
      const encrypted = passphrase.length > 0;
      const mode = opts?.mode ?? 'share';
      try {
        const rt = runtimeRef.current ?? (await createRuntime());
        runtimeRef.current = rt;
        const plainBundle = await rt.store.exportBundle(new Date().toISOString());
        const plainJson = JSON.stringify(plainBundle, null, 2);
        const json = encrypted
          ? JSON.stringify(encryptExportBundle(plainJson, passphrase, osRandom), null, 2)
          : plainJson;
        const stamp = new Date().toISOString().slice(0, 10);
        const fileName = encrypted
          ? `mirror-export-${stamp}.encrypted.json`
          : `mirror-export-${stamp}.json`;

        if (mode === 'save') {
          const safSaved = await rt.usage().saveExportJson(fileName, json);
          if (safSaved === true) {
            return { ok: true, encrypted, savedVia: 'save_dialog' };
          }
          if (safSaved === false) {
            return { ok: false, encrypted, savedVia: 'failed' };
          }
          // `null` means SAF isn't linked in this host — fall back to system share sheet
        }

        await Share.share({ title: fileName, message: json });
        return { ok: true, encrypted, savedVia: 'share_sheet' };
      } catch {
        return { ok: false, encrypted, savedVia: 'failed' };
      }
    },
    [],
  );

  const resetStoredData = React.useCallback(
    async (reason: StoreResetReason = 'user_delete_all') => {
      try {
        const rt = runtimeRef.current;
        if (rt) {
          const previousHistoryStartDay =
            focusWindows?.historyStartDay ?? evolution?.historyStartDay ?? null;
          const detail =
            reason === 'key_mismatch_reset' && keyMismatch
              ? `sealed=${keyMismatch.oldKey}, current=${keyMismatch.newKey}`
              : undefined;
          const audit = await rt.resetStore({
            reason,
            previousHistoryStartDay,
            detail,
          });
          setLastReset(audit);
          setKeyMismatch(null);
          setError(null);
          setFlaggedDiscrepancies([]);
          setSessions([]);
          setDailyTotals([]);
          setDailyTotalsSource('os_events');
          setScaledSessions([]);
          setDayScoredSessions([]);
          setDayScoreGaps([]);
          setDayReady(false);
          setSittingLabels({});
          appRulesRef.current = {};
          setAppRules({});
          setExpandedSessionId(null);
          setQuality(null);
          setValidation(null);
          setSingleDayRows([]);
          setLatestSyncOrphans(null);
          setRaw24hOrphans(null);
          setCollectingSince(null);
          setLastSyncedAt(null);
          setEvolution(null);
          setDiscovery(null);
          setRabbitHole(null);
          setFocusWindows(null);
          setBudgets([]);
          setBudgetWeekOtherDays([]);
          setBudgetHistoryStartDay(null);
          setGoals([]);
          setWeeklyReportPrefs({ ...DEFAULT_WEEKLY_REPORT_PREFS });
          setShowWeeklyReport(false);
          setHistScoredSessions([]);
          setHistStoredEvents([]);
          setLastCollect(`store reset (${reason})`);
          await checkPermissionAndCollect();
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [checkPermissionAndCollect, evolution?.historyStartDay, focusWindows?.historyStartDay, keyMismatch],
  );

  const dismissKeyMismatch = React.useCallback(() => {
    setKeyMismatch(null);
  }, []);

  // Derive IQS, What-if, Curiosity, and Sitting-Length Bands synchronously from the
  // exact same canonical `dayScoredSessions` + `dayWindow` snapshot so Home, Insights,
  // IQS, and Sessions always report identical sitting counts and band sums.
  const iqs: Score | null = React.useMemo(() => {
    if (!dayReady) return null;
    try {
      const labelArray = Object.entries(intentLabels).map(([sessionId, label]) => ({ sessionId, label }));
      const isProvisionalToday = dayWindow.day === todayStr;
      return scoreIqs({
        window: { fromMs: dayWindow.fromMs, toMs: dayWindow.toMs },
        sessions: dayScoredSessions,
        labels: labelArray,
        gaps: dayScoreGaps,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        approximate: true,
        provisional: isProvisionalToday,
        nowMs: isProvisionalToday ? Date.now() : undefined,
      });
    } catch (e) {
      console.log('IQS compute failed', e);
      return null;
    }
  }, [dayReady, dayWindow, todayStr, dayScoredSessions, intentLabels, dayScoreGaps]);

  const whatIf: WhatIfResult | null = React.useMemo(() => {
    if (!dayReady) return null;
    try {
      const quietHours =
        whatIfQuietPreset === '22-07'
          ? { startHour: 22, endHour: 7 }
          : { startHour: NIGHT_WINDOW.startHour, endHour: NIGHT_WINDOW.endHour };
      const isProvisionalToday = dayWindow.day === todayStr;
      return computeWhatIf({
        window: { fromMs: dayWindow.fromMs, toMs: dayWindow.toMs },
        sessions: dayScoredSessions,
        osTotals: dailyTotals,
        totalsSource: dailyTotalsSource,
        labels: intentLabels,
        appLabels: labels,
        ignorePackages: launcherPackages,
        gaps: dayScoreGaps,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        approximate: true,
        provisional: isProvisionalToday,
        nowMs: isProvisionalToday ? Date.now() : undefined,
        sittingCapMinutes: whatIfCapMin,
        quietHours,
        activeScenarioIds: whatIfActiveScenarios,
      });
    } catch {
      return null;
    }
  }, [
    dayReady,
    dayWindow,
    todayStr,
    dayScoredSessions,
    dailyTotals,
    dailyTotalsSource,
    intentLabels,
    labels,
    launcherPackages,
    dayScoreGaps,
    whatIfCapMin,
    whatIfQuietPreset,
    whatIfActiveScenarios,
  ]);

  const curiosity: CuriositySplit | null = React.useMemo(() => {
    if (!dayReady) return null;
    try {
      const labelArray = Object.entries(intentLabels).map(([sessionId, label]) => ({ sessionId, label }));
      return curiositySplit({
        window: { fromMs: dayWindow.fromMs, toMs: dayWindow.toMs },
        sessions: dayScoredSessions,
        labels: labelArray,
        gaps: dayScoreGaps,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        approximate: true,
      });
    } catch {
      return null;
    }
  }, [dayReady, dayWindow, dayScoredSessions, intentLabels, dayScoreGaps]);

  const depthBands: DepthBand[] = React.useMemo(
    () => sessionBands(dayScoredSessions),
    [dayScoredSessions],
  );

  const sittingSpanMs: number = React.useMemo(
    () => sumSittingSpanMs(dayScoredSessions),
    [dayScoredSessions],
  );

  const saveBudget = React.useCallback(
    async (draft: BudgetDefinition): Promise<SaveBudgetResult> => {
      const check = validateBudgetDefinition(draft);
      if (!check.ok) {
        return { ok: false, errors: check.errors };
      }
      const rt = runtimeRef.current ?? (await createRuntime());
      runtimeRef.current = rt;
      await rt.saveBudget(check.value);
      const fresh = await rt.listBudgets();
      setBudgets(fresh);
      try {
        const resolvedNew = await resolveAppLabels([...check.value.packages]);
        if (Object.keys(resolvedNew).length > 0) {
          setLabels((prev) => ({ ...prev, ...resolvedNew }));
        }
      } catch {}
      rt.syncLocalReminders().catch(() => {});
      return { ok: true, value: check.value };
    },
    [],
  );

  /** Accept is the only path that creates a budget from a suggestion, and it runs on a tap. */
  const acceptBudgetSuggestion = React.useCallback(
    async (suggestion: BudgetSuggestion): Promise<SaveBudgetResult> => {
      const now = Date.now();
      const safeApp = suggestion.app.replace(/[^a-zA-Z0-9._-]/g, '_');
      return saveBudget({
        id: `b_sugg_${safeApp}_${now}`,
        name: suggestion.label,
        kind: 'app',
        packages: [suggestion.app],
        period: 'daily',
        limitMs: suggestion.suggestedLimitMs,
        enabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    },
    [saveBudget],
  );

  const dismissBudgetSuggestion = React.useCallback(async (app: string): Promise<void> => {
    const rt = runtimeRef.current ?? (await createRuntime());
    runtimeRef.current = rt;
    const next = await rt.dismissBudgetSuggestion(app);
    setSuggestionDismissals(next);
  }, []);

  /** P4.4b: the user marks an app once as always intentional / always mindless. Only the user's tap writes. */
  const saveAppRule = React.useCallback(async (app: string, label: 'intentional' | 'mindless'): Promise<void> => {
    const rt = runtimeRef.current ?? (await createRuntime());
    runtimeRef.current = rt;
    const next = await rt.setAppRule(app, label);
    appRulesRef.current = next;
    setAppRules(next);
    await recomputeFromLabels(sittingLabels);
  }, [recomputeFromLabels, sittingLabels]);

  /** P4.4b: one tap removes a rule. Per-sitting labels are never changed. */
  const removeAppRule = React.useCallback(async (app: string): Promise<void> => {
    const rt = runtimeRef.current ?? (await createRuntime());
    runtimeRef.current = rt;
    const next = await rt.clearAppRule(app);
    appRulesRef.current = next;
    setAppRules(next);
    await recomputeFromLabels(sittingLabels);
  }, [recomputeFromLabels, sittingLabels]);

  const deleteBudget = React.useCallback(async (id: string): Promise<boolean> => {
    const rt = runtimeRef.current ?? (await createRuntime());
    runtimeRef.current = rt;
    const removed = await rt.removeBudget(id);
    const fresh = await rt.listBudgets();
    setBudgets(fresh);
    return removed;
  }, []);

  const saveGoal = React.useCallback(
    async (draft: GoalDefinition): Promise<SaveGoalResult> => {
      const check = validateGoalDefinition(draft);
      if (!check.ok) {
        return { ok: false, errors: check.errors };
      }
      const rt = runtimeRef.current ?? (await createRuntime());
      runtimeRef.current = rt;
      await rt.saveGoal(check.value);
      const fresh = await rt.listGoals();
      setGoals(fresh);
      if (check.value.packages && check.value.packages.length > 0) {
        try {
          const resolvedNew = await resolveAppLabels([...check.value.packages]);
          if (Object.keys(resolvedNew).length > 0) {
            setLabels((prev) => ({ ...prev, ...resolvedNew }));
          }
        } catch {}
      }
      return { ok: true, value: check.value };
    },
    [],
  );

  const deleteGoal = React.useCallback(async (id: string): Promise<boolean> => {
    const rt = runtimeRef.current ?? (await createRuntime());
    runtimeRef.current = rt;
    const removed = await rt.removeGoal(id);
    const fresh = await rt.listGoals();
    setGoals(fresh);
    return removed;
  }, []);

  const updateWeeklyReportPrefs = React.useCallback(
    async (
      patch: Partial<Omit<WeeklyReportPrefs, 'updatedAtMs'>>,
    ): Promise<UpdateReminderPrefsResult> => {
      const rt = runtimeRef.current ?? (await createRuntime());
      runtimeRef.current = rt;
      const currentPrefs = await rt.getWeeklyReportPrefs().catch(() => weeklyReportPrefs);
      const enablingWeekly = patch.reminderEnabled === true && !currentPrefs.reminderEnabled;
      const enablingBudgetNote =
        patch.budgetNoteEnabled === true && !Boolean(currentPrefs.budgetNoteEnabled);
      if (enablingWeekly || enablingBudgetNote) {
        const perm = await requestOptInNotificationPermission(rt.usage());
        if (perm !== 'granted') {
          return { ok: false, reason: 'permission_denied', prefs: currentPrefs };
        }
      }
      try {
        const updated = await rt.updateWeeklyReportPrefs(patch);
        setWeeklyReportPrefs(updated);
        if (updated.reminderEnabled || updated.budgetNoteEnabled) {
          rt.syncLocalReminders().catch(() => {});
        }
        return { ok: true, prefs: updated };
      } catch {
        return { ok: false, reason: 'invalid', prefs: currentPrefs };
      }
    },
    [weeklyReportPrefs],
  );

  const openNotificationSettings = React.useCallback(() => {
    try {
      runtimeRef.current?.usage().openNotificationSettings();
    } catch {}
  }, []);

  const effectiveBudgetHistoryStart =
    budgetHistoryStartDay ??
    focusWindows?.historyStartDay ??
    evolution?.historyStartDay ??
    (dailyTotals.length > 0 ? selectedDay : null);

  const budgetWeekTotals: BudgetDayForegroundInput[] = React.useMemo(() => {
    const priorWindowDays = new Set(lastNDays(7, selectedDay).slice(1));
    return [
      {
        day: selectedDay,
        source: dailyTotalsSource,
        totals: dailyTotals.map((t) => ({ app: t.app, totalMs: t.totalMs })),
      },
      ...budgetWeekOtherDays.filter((entry) => priorWindowDays.has(entry.day)),
    ];
  }, [selectedDay, dailyTotalsSource, dailyTotals, budgetWeekOtherDays]);

  const budgetRecordedDays: string[] = React.useMemo(() => {
    const weekWindow = lastNDays(7, selectedDay);
    return weekWindow.filter((d) => {
      if (d > todayStr) return false;
      if (d === selectedDay && dailyTotals.length > 0) return true;
      if (budgetWeekOtherDays.some((entry) => entry.day === d)) return true;
      return effectiveBudgetHistoryStart !== null && d >= effectiveBudgetHistoryStart;
    });
  }, [selectedDay, todayStr, dailyTotals, budgetWeekOtherDays, effectiveBudgetHistoryStart]);

  const budgetSuggestions: BudgetSuggestion[] = React.useMemo(() => {
    return suggestBudgets({
      endDay: selectedDay,
      dayTotals: budgetWeekTotals,
      recordedDays: budgetRecordedDays,
      existingBudgetPackages: budgets.filter((b) => b.enabled).flatMap((b) => [...b.packages]),
      ignorePackages: [...launcherPackages],
      dismissals: suggestionDismissals,
      nowMs: Date.now(),
      appLabels: labels,
    });
  }, [selectedDay, budgetWeekTotals, budgetRecordedDays, budgets, launcherPackages, suggestionDismissals, labels]);

  const budgetsSummary: BudgetsEvaluationSummary = React.useMemo(() => {
    return evaluateBudgets({
      budgets,
      referenceDay: selectedDay,
      dayTotals: budgetWeekTotals,
      recordedDays: budgetRecordedDays,
      historyStartDay: effectiveBudgetHistoryStart,
      isSelectedToday: selectedDay === todayStr,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      nowMs: selectedDay === todayStr ? Date.now() : undefined,
      ignorePackages: launcherPackages,
      appLabels: labels,
    });
  }, [
    budgets,
    selectedDay,
    budgetWeekTotals,
    budgetRecordedDays,
    todayStr,
    effectiveBudgetHistoryStart,
    launcherPackages,
    labels,
  ]);

  const fortnightDayTotals: BudgetDayForegroundInput[] = React.useMemo(() => {
    const prior14Days = new Set(lastNDays(14, selectedDay).slice(1));
    return [
      {
        day: selectedDay,
        source: dailyTotalsSource,
        totals: dailyTotals.map((t) => ({ app: t.app, totalMs: t.totalMs })),
      },
      ...budgetWeekOtherDays.filter((entry) => prior14Days.has(entry.day)),
    ];
  }, [selectedDay, dailyTotalsSource, dailyTotals, budgetWeekOtherDays]);

  const allDistinctRecordedDays: string[] = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of storeDayRowCounts) {
      if (r.day <= selectedDay) set.add(r.day);
    }
    for (const d of budgetRecordedDays) {
      if (d <= selectedDay) set.add(d);
    }
    for (const entry of budgetWeekOtherDays) {
      if (entry.day <= selectedDay) set.add(entry.day);
    }
    return [...set].sort();
  }, [storeDayRowCounts, budgetRecordedDays, budgetWeekOtherDays, selectedDay]);

  const mergedReportSessions: ScoredSession[] = React.useMemo(() => {
    const byId = new Map<string, ScoredSession>();
    for (const s of histScoredSessions) byId.set(s.id, s);
    for (const s of dayScoredSessions) byId.set(s.id, s);
    return [...byId.values()];
  }, [histScoredSessions, dayScoredSessions]);

  const weeklyReport: WeeklyReportResult = React.useMemo(() => {
    return computeWeeklyReport({
      endDay: selectedDay,
      dayTotals: fortnightDayTotals,
      events: histStoredEvents,
      sessions: mergedReportSessions,
      intentLabels,
      recordedDays: allDistinctRecordedDays,
      historyStartDay: effectiveBudgetHistoryStart,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      nowMs: selectedDay === todayStr ? Date.now() : undefined,
      ignorePackages: launcherPackages,
      appLabels: labels,
    });
  }, [
    selectedDay,
    fortnightDayTotals,
    histStoredEvents,
    mergedReportSessions,
    intentLabels,
    allDistinctRecordedDays,
    effectiveBudgetHistoryStart,
    todayStr,
    launcherPackages,
    labels,
  ]);

  const goalsSummary: GoalsEvaluationSummary = React.useMemo(() => {
    return evaluateGoals({
      goals,
      endDay: selectedDay,
      dayTotals: budgetWeekTotals,
      events: histStoredEvents,
      sessions: mergedReportSessions,
      recordedDays: budgetRecordedDays,
      historyStartDay: effectiveBudgetHistoryStart,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      nowMs: selectedDay === todayStr ? Date.now() : undefined,
      ignorePackages: launcherPackages,
      appLabels: labels,
    });
  }, [
    goals,
    selectedDay,
    budgetWeekTotals,
    histStoredEvents,
    mergedReportSessions,
    budgetRecordedDays,
    effectiveBudgetHistoryStart,
    todayStr,
    launcherPackages,
    labels,
  ]);

  const budgetApps: BudgetCandidateApp[] = React.useMemo(() => {
    const todayMap = new Map<string, { label: string; todayMs: number }>();
    for (const row of dailyTotals) {
      if (isExcludedApp(row.app, { ignorePackages: launcherPackages, label: row.label })) continue;
      todayMap.set(row.app, { label: row.label || labels[row.app] || row.app, todayMs: row.totalMs });
    }
    const ensurePkg = (pkg: string, fallbackLabel?: string) => {
      const trimmed = pkg.trim();
      if (!trimmed || todayMap.has(trimmed)) return;
      const lbl = fallbackLabel ?? labels[trimmed] ?? getCachedLabel(trimmed);
      if (isExcludedApp(trimmed, { ignorePackages: launcherPackages, label: lbl })) return;
      todayMap.set(trimmed, { label: lbl, todayMs: 0 });
    };
    for (const dayEntry of budgetWeekOtherDays) {
      for (const row of dayEntry.totals) {
        const pkg = row.app ?? row.packageName;
        if (pkg) ensurePkg(pkg);
      }
    }
    for (const s of sessions) {
      ensurePkg(s.app);
    }
    if (evolution?.rows) {
      for (const r of evolution.rows) {
        ensurePkg(r.app, r.label);
      }
    }
    for (const b of budgets) {
      for (const pkg of b.packages) {
        ensurePkg(pkg);
      }
    }
    for (const g of goals) {
      for (const pkg of g.packages ?? []) {
        ensurePkg(pkg);
      }
    }
    return [...todayMap.entries()]
      .map(([app, info]) => ({ app, label: info.label, todayMs: info.todayMs }))
      .sort((a, b) => b.todayMs - a.todayMs || a.label.localeCompare(b.label) || a.app.localeCompare(b.app));
  }, [dailyTotals, budgetWeekOtherDays, sessions, evolution?.rows, budgets, goals, labels, launcherPackages]);

  const copyRawEvents = React.useCallback(async () => {
    try {
      const payload = {
        selectedDay,
        exportedAt: new Date().toISOString(),
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        storeDayRowCounts,
        sessionRepairSnapshot,
        flaggedDiscrepancies,
        singleDayRows,
        tracedAppIntervals,
        inspectedRawEvents: honkaiDebug.map((e) => ({
          eventType: e.eventType,
          typeName: e.typeName,
          packageName: e.packageName,
          className: e.className ?? '',
          timeStamp: e.timeStamp,
          iso: new Date(e.timeStamp).toISOString(),
        })),
        recentRawEvents: debugEvents.map((e) => ({
          eventType: e.eventType,
          typeName: e.typeName,
          packageName: e.packageName,
          className: e.className ?? '',
          timeStamp: e.timeStamp,
          iso: new Date(e.timeStamp).toISOString(),
        })),
      };
      const json = JSON.stringify(payload, null, 2);
      await Share.share({ message: json });
      setCopyStatus(
        `Shared diagnostics (${storeDayRowCounts.length} store days, ${tracedAppIntervals.length} traced intervals, ${honkaiDebug.length} inspected events)`,
      );
      setTimeout(() => setCopyStatus(null), 3000);
    } catch (e: unknown) {
      setCopyStatus(`Share failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [
    selectedDay,
    storeDayRowCounts,
    sessionRepairSnapshot,
    flaggedDiscrepancies,
    singleDayRows,
    tracedAppIntervals,
    honkaiDebug,
    debugEvents,
  ]);

  const handleBuildTap = React.useCallback(() => {
    const next = buildTapCount + 1;
    setBuildTapCount(next);
    if (next >= 7) {
      setShowDebug(true);
      setBuildTapCount(0);
    }
    setTimeout(() => setBuildTapCount(0), 3000);
  }, [buildTapCount]);

  const dayOptions = React.useMemo(() => lastNDays(14, todayStr), [todayStr]);
  const selectedDayStoreRow = React.useMemo(
    () => storeDayRowCounts.find((r) => r.day === selectedDay) ?? null,
    [storeDayRowCounts, selectedDay],
  );
  const selectedDayStoredUsageEvents =
    (selectedDayStoreRow?.fgEvents ?? 0) +
    (selectedDayStoreRow?.bgEvents ?? 0) +
    (selectedDayStoreRow?.otherEvents ?? 0);
  const hasEventsWithoutSittings =
    dayReady &&
    dayScoredSessions.length === 0 &&
    (selectedDayStoredUsageEvents > 0 || dailyTotals.length > 0);
  const storedOrphanCount = quality?.byReason?.orphan_background ?? 0;
  const storedTotalGaps = quality?.count ?? 0;
  const isTodaySelected = selectedDay === todayStr;
  const orphanCount =
    isTodaySelected && raw24hOrphans !== null
      ? Math.min(storedOrphanCount, raw24hOrphans.total)
      : storedOrphanCount;
  const totalGaps = Math.max(0, storedTotalGaps - Math.max(0, storedOrphanCount - orphanCount));
  const p3Reliable = orphanCount <= 50 && totalGaps <= 100;

  const dismissPermissionPrimer = React.useCallback(() => {
    setPermissionDismissed(true);
  }, []);

  const showPermissionPrimer = React.useCallback(() => {
    setPermissionDismissed(false);
  }, []);

  const value = React.useMemo<MirrorAppContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      permission,
      setPermission,
      permissionDismissed,
      dismissPermissionPrimer,
      showPermissionPrimer,
      insets,
      loading,
      error,
      lastCollect,
      lastSyncedAt,
      collectingSince,
      keyMismatch,
      dismissKeyMismatch,
      resetStoredData,
      exportAllData,
      lastReset,
      selectedDay,
      setSelectedDay,
      dayOptions,
      sessions,
      dailyTotals,
      dailyTotalsSource,
      labels,
      quality,
      validation,
      flaggedDiscrepancies,
      singleDayRows,
      debugEvents,
      honkaiDebug,
      invalidTop,
      storeDayRowCounts,
      sessionRepairSnapshot,
      tracedAppIntervals,
      hasEventsWithoutSittings,
      copyStatus,
      scaledSessions,
      iqs,
      curiosity,
      depthBands,
      dayScoredSessions,
      sittingSpanMs,
      dayScoreGaps,
      evolution,
      discovery,
      rabbitHole,
      focusWindows,
      whatIf,
      whatIfCapMin,
      setWhatIfCapMin,
      whatIfQuietPreset,
      setWhatIfQuietPreset,
      whatIfActiveScenarios,
      toggleWhatIfScenario,
      latestSyncOrphans,
      raw24hOrphans,
      showWhy,
      setShowWhy,
      showDebug,
      setShowDebug,
      buildTapCount,
      handleBuildTap,
      intentLabels,
      labelSaving,
      expandedSessionId,
      setExpandedSessionId,
      labelOptIn,
      setLabelOptIn,
      orphanCount,
      totalGaps,
      p3Reliable,
      checkPermissionAndCollect,
      openSettings,
      saveSessionLabel,
      clearStoredLabels,
      copyRawEvents,
      budgets,
      budgetsSummary,
      budgetApps,
      budgetWeekTotals,
      budgetRecordedDays,
      saveBudget,
      deleteBudget,
      budgetSuggestions,
      acceptBudgetSuggestion,
      dismissBudgetSuggestion,
      appRules,
      appRuleCoverage: labelResolution.coverage,
      ruleSourceIds: labelResolution.ruleSourceIds,
      saveAppRule,
      removeAppRule,
      goals,
      goalsSummary,
      saveGoal,
      deleteGoal,
      weeklyReport,
      showWeeklyReport,
      setShowWeeklyReport,
      showSettings,
      setShowSettings,
      weeklyReportPrefs,
      updateWeeklyReportPrefs,
      openNotificationSettings,
    }),
    [
      activeTab,
      permission,
      permissionDismissed,
      dismissPermissionPrimer,
      showPermissionPrimer,
      insets,
      loading,
      error,
      lastCollect,
      lastSyncedAt,
      collectingSince,
      keyMismatch,
      dismissKeyMismatch,
      resetStoredData,
      exportAllData,
      lastReset,
      selectedDay,
      dayOptions,
      sessions,
      dailyTotals,
      dailyTotalsSource,
      labels,
      quality,
      validation,
      flaggedDiscrepancies,
      singleDayRows,
      debugEvents,
      honkaiDebug,
      invalidTop,
      storeDayRowCounts,
      sessionRepairSnapshot,
      tracedAppIntervals,
      hasEventsWithoutSittings,
      copyStatus,
      scaledSessions,
      iqs,
      curiosity,
      depthBands,
      dayScoredSessions,
      sittingSpanMs,
      dayScoreGaps,
      evolution,
      discovery,
      rabbitHole,
      focusWindows,
      whatIf,
      whatIfCapMin,
      whatIfQuietPreset,
      whatIfActiveScenarios,
      toggleWhatIfScenario,
      latestSyncOrphans,
      raw24hOrphans,
      showWhy,
      showDebug,
      buildTapCount,
      handleBuildTap,
      intentLabels,
      labelSaving,
      expandedSessionId,
      labelOptIn,
      orphanCount,
      totalGaps,
      p3Reliable,
      checkPermissionAndCollect,
      openSettings,
      saveSessionLabel,
      clearStoredLabels,
      copyRawEvents,
      budgets,
      budgetsSummary,
      budgetApps,
      budgetWeekTotals,
      budgetRecordedDays,
      saveBudget,
      deleteBudget,
      budgetSuggestions,
      acceptBudgetSuggestion,
      dismissBudgetSuggestion,
      appRules,
      labelResolution,
      saveAppRule,
      removeAppRule,
      goals,
      goalsSummary,
      saveGoal,
      deleteGoal,
      weeklyReport,
      showWeeklyReport,
      showSettings,
      weeklyReportPrefs,
      updateWeeklyReportPrefs,
      openNotificationSettings,
    ],
  );

  return <MirrorAppContext.Provider value={value}>{children}</MirrorAppContext.Provider>;
}
