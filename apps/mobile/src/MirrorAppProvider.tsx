/* eslint-disable no-console */
import * as React from 'react';
import { AppState, Share } from 'react-native';
import type { SessionRow } from '@mirror/store';
import type {
  CuriositySplit,
  DepthBand,
  DiscoveryJourneyResult,
  FocusWindowsResult,
  InterestEvolutionResult,
  OrphanDiagnosticSummary,
  RabbitHoleResult,
  Score,
  ScoreGap,
  ScoredSession,
  ValidationResult,
  WhatIfResult,
} from '@mirror/core-analytics';
import {
  buildUsageEvents,
  computeDiscoveryJourney,
  computeFocusWindows,
  computeInterestEvolution,
  computeRabbitHoles,
  computeWhatIf,
  curiositySplit,
  getTopInvalidPackages,
  isIgnoredSystemApp,
  scoreIqs,
  sessionBands,
  sessionsInWindow,
  summarizeOrphanDrops,
} from '@mirror/core-analytics';
import { createRuntime, type DataQuality } from './runtime';
import { defineUsageTask, provideRuntime, registerUsageTask } from './collector/background';
import { getCachedLabel, resolveAppLabels } from './collector/appLabels';
import {
  MirrorAppContext,
  dayEndMs,
  dayStartMs,
  lastNDays,
  toDayStr,
  type DailyTotal,
  type DebugRawEvent,
  type MirrorAppContextValue,
  type PermissionState,
  type ScaledSessionRow,
  type SingleDayRow,
  type TabKey,
} from './context/MirrorAppContext';

export function MirrorAppProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<TabKey>('home');
  const [permission, setPermission] = React.useState<PermissionState>('checking');
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [dailyTotals, setDailyTotals] = React.useState<DailyTotal[]>([]);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [quality, setQuality] = React.useState<DataQuality | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [debugEvents, setDebugEvents] = React.useState<DebugRawEvent[]>([]);
  const [invalidTop, setInvalidTop] = React.useState<{ pkg: string; count: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastCollect, setLastCollect] = React.useState<string | null>(null);
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  const [keyMismatch, setKeyMismatch] = React.useState<{ oldKey: string; newKey: string } | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<string>(() => toDayStr(Date.now()));
  const [singleDayRows, setSingleDayRows] = React.useState<SingleDayRow[]>([]);
  const [collectingSince, setCollectingSince] = React.useState<string | null>(null);
  const [honkaiDebug, setHonkaiDebug] = React.useState<DebugRawEvent[]>([]);
  const [showDebug, setShowDebug] = React.useState(false);
  const [buildTapCount, setBuildTapCount] = React.useState(0);
  const [scaledSessions, setScaledSessions] = React.useState<ScaledSessionRow[]>([]);
  const [iqs, setIqs] = React.useState<Score | null>(null);
  const [evolution, setEvolution] = React.useState<InterestEvolutionResult | null>(null);
  const [discovery, setDiscovery] = React.useState<DiscoveryJourneyResult | null>(null);
  const [rabbitHole, setRabbitHole] = React.useState<RabbitHoleResult | null>(null);
  const [focusWindows, setFocusWindows] = React.useState<FocusWindowsResult | null>(null);
  const [dayScoredSessions, setDayScoredSessions] = React.useState<ScoredSession[]>([]);
  const [dayScoreGaps, setDayScoreGaps] = React.useState<ScoreGap[]>([]);
  const [launcherPackages, setLauncherPackages] = React.useState<string[]>([]);
  const [whatIfCapMin, setWhatIfCapMin] = React.useState<10 | 20>(10);
  const [whatIfQuietPreset, setWhatIfQuietPreset] = React.useState<'23-05' | '22-07'>('23-05');
  const [latestSyncOrphans, setLatestSyncOrphans] = React.useState<OrphanDiagnosticSummary | null>(null);
  const [raw24hOrphans, setRaw24hOrphans] = React.useState<OrphanDiagnosticSummary | null>(null);
  const [showWhy, setShowWhy] = React.useState(false);
  const [intentLabels, setIntentLabels] = React.useState<Record<string, 'intentional' | 'mindless' | 'unsure'>>({});
  const [labelSaving, setLabelSaving] = React.useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = React.useState<string | null>(null);
  const [labelOptIn, setLabelOptIn] = React.useState(false);

  const runtimeRef = React.useRef<Awaited<ReturnType<typeof createRuntime>> | null>(null);
  const hasLoadedOnceRef = React.useRef(false);

  const checkPermissionAndCollect = React.useCallback(async () => {
    try {
      if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      const runtime = await createRuntime();
      runtimeRef.current = runtime;
      provideRuntime({
        store: runtime.store,
        collectNow: runtime.collectNow,
        ingestRecent: runtime.ingestRecent,
      });
      defineUsageTask();

      const usage = runtime.usage();
      if (!usage.available) {
        setPermission('unavailable');
        hasLoadedOnceRef.current = true;
        setLoading(false);
        return;
      }

      const has = await usage.hasPermission();
      if (!has) {
        setPermission('denied');
        hasLoadedOnceRef.current = true;
        setLoading(false);
        try {
          const q = await runtime.dataQuality();
          setQuality(q);
          const dayFrom = dayStartMs(selectedDay);
          const dayTo = dayEndMs(selectedDay);
          const osRows = await runtime.osTotals({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
          let launcherPkgs: string[] = [];
          try {
            launcherPkgs = await usage.getLauncherPackages();
          } catch {}
          const launcherSet = new Set(launcherPkgs);
          const candidateOs = osRows.filter(
            (r) => !launcherSet.has(r.packageName) && !isIgnoredSystemApp(r.packageName) && r.totalMs > 0,
          );
          const resolved = await resolveAppLabels(candidateOs.map((r) => r.packageName));
          const filteredOs = candidateOs.filter((r) => !isIgnoredSystemApp(r.packageName, resolved[r.packageName]));
          const totals: DailyTotal[] = filteredOs
            .map((r) => ({ app: r.packageName, label: resolved[r.packageName] ?? r.packageName, totalMs: r.totalMs }))
            .sort((a, b) => b.totalMs - a.totalMs);
          setDailyTotals(totals);
          setLabels(resolved);
        } catch {}
        return;
      }

      setPermission('granted');
      try {
        await registerUsageTask();
      } catch {}

      const collectResult = await runtime.collectNow();
      if (collectResult.status === 'collected') {
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
          setLatestSyncOrphans(summarizeOrphanDrops(collectResult.dropped, orphanLabels, 6));
        } catch {}
        try {
          const top = getTopInvalidPackages(collectResult.dropped as Parameters<typeof getTopInvalidPackages>[0]);
          setInvalidTop(top);
          console.log('Top invalid_package:', top);
        } catch {}
      } else {
        setLastCollect(`collect: ${collectResult.status}`);
      }

      await runtime.ingestRecent();

      try {
        const dayFrom = dayStartMs(selectedDay);
        const dayTo = dayEndMs(selectedDay);
        const osRows = await runtime.osTotals({ fromMs: dayFrom, toMs: dayTo });
        let launcherPkgs: string[] = [];
        try {
          launcherPkgs = await usage.getLauncherPackages();
        } catch {}
        setLauncherPackages(launcherPkgs);
        const launcherSet = new Set(launcherPkgs);
        const candidateOs = osRows.filter(
          (r) => !launcherSet.has(r.packageName) && !isIgnoredSystemApp(r.packageName) && r.totalMs > 0,
        );
        const resolved = await resolveAppLabels(candidateOs.map((r) => r.packageName));
        const filteredOs = candidateOs.filter((r) => !isIgnoredSystemApp(r.packageName, resolved[r.packageName]));
        setLabels((prev) => ({ ...prev, ...resolved }));
        const totals: DailyTotal[] = filteredOs
          .map((r) => ({ app: r.packageName, label: resolved[r.packageName] ?? r.packageName, totalMs: r.totalMs }))
          .sort((a, b) => b.totalMs - a.totalMs);
        setDailyTotals(totals);

        const sessDay = await runtime.store.sessions({ fromMs: dayFrom, toMs: dayTo });
        const sessResolved = await resolveAppLabels(sessDay.map((s) => s.app));
        const allLabelsForDay = { ...resolved, ...sessResolved };
        setLabels((prev) => ({ ...prev, ...allLabelsForDay }));
        const sessFiltered = sessDay.filter(
          (s) => !launcherSet.has(s.app) && !isIgnoredSystemApp(s.app, allLabelsForDay[s.app]),
        );
        setSessions(sessFiltered.slice(-50).reverse());

        let loadedLabels: Record<string, 'intentional' | 'mindless' | 'unsure'> = {};
        try {
          loadedLabels = await runtime.loadIntentLabels();
          setIntentLabels(loadedLabels);
        } catch {}

        try {
          const histFrom = dayTo - 30 * 86_400_000;
          const focusHistFrom = dayTo - 84 * 86_400_000;
          const allHistSessions = await runtime.store.sessions({ fromMs: focusHistFrom, toMs: dayTo });
          const histSessions = allHistSessions.filter((s) => s.end_ms > histFrom && s.start_ms < dayTo);
          const histApps = [...new Set(allHistSessions.map((s) => s.app))].filter(
            (app) => !launcherSet.has(app) && !isIgnoredSystemApp(app),
          );
          const histResolved = await resolveAppLabels(histApps);
          const mergedLabels = { ...allLabelsForDay, ...histResolved };
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
          const utcOffsetMinutes = -new Date().getTimezoneOffset();
          setEvolution(
            computeInterestEvolution({
              sessions: histScored,
              utcOffsetMinutes,
              labels: mergedLabels,
              ignorePackages: launcherPkgs,
            }),
          );
          setDiscovery(
            computeDiscoveryJourney({
              sessions: histScored,
              osTotals: totals,
              intentLabels: loadedLabels,
              labelWindow: { fromMs: dayFrom, toMs: dayTo },
              labels: mergedLabels,
              ignorePackages: launcherPkgs,
              utcOffsetMinutes,
            }),
          );
          setRabbitHole(
            computeRabbitHoles({
              sessions: histScored,
              intentLabels: loadedLabels,
              labels: mergedLabels,
              ignorePackages: launcherPkgs,
              utcOffsetMinutes,
            }),
          );
          setFocusWindows(
            computeFocusWindows({
              sessions: focusScored,
              intentLabels: loadedLabels,
              labels: mergedLabels,
              ignorePackages: launcherPkgs,
              utcOffsetMinutes,
            }),
          );
        } catch {
          setEvolution(null);
          setDiscovery(null);
          setRabbitHole(null);
          setFocusWindows(null);
        }

        const osMap = new Map<string, number>();
        for (const r of filteredOs) osMap.set(r.packageName, r.totalMs);

        const openOnly: ScaledSessionRow[] = [];
        for (const s of sessFiltered) {
          openOnly.push({
            id: s.id,
            app: s.app,
            label: resolved[s.app] ?? getCachedLabel(s.app),
            start_ms: s.start_ms,
            end_ms: s.start_ms,
            duration_ms: s.duration_ms,
            scaled_duration_ms: 0,
            isScaled: false,
          });
        }
        openOnly.sort((a, b) => b.start_ms - a.start_ms);
        setScaledSessions(openOnly);

        try {
          const scored: ScoredSession[] = sessFiltered.map((s) => ({
            id: s.id,
            app: s.app,
            startMs: s.start_ms,
            endMs: s.end_ms,
          }));
          const gapsRaw = await runtime.store.gaps({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
          const scoreGaps: ScoreGap[] = gapsRaw.map((g) => ({
            reason: g.reason,
            count: g.count,
            fromMs: g.from_ms ?? undefined,
            toMs: g.to_ms ?? undefined,
          }));
          setDayScoredSessions(scored);
          setDayScoreGaps(scoreGaps);
          const labelArray = Object.entries(loadedLabels).map(([sessionId, label]) => ({ sessionId, label }));
          const iqsResult = scoreIqs({
            window: { fromMs: dayFrom, toMs: dayTo },
            sessions: scored,
            labels: labelArray,
            gaps: scoreGaps,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
            approximate: true,
          });
          setIqs(iqsResult);
        } catch (e) {
          console.log('IQS compute failed', e);
          setDayScoredSessions([]);
          setDayScoreGaps([]);
          setIqs(null);
        }

        try {
          const v = await runtime.validate({ fromMs: dayFrom, toMs: dayTo });
          setValidation(v);
        } catch {}

        try {
          const mirrorMap = new Map<string, number>();
          for (const s of sessFiltered) mirrorMap.set(s.app, (mirrorMap.get(s.app) ?? 0) + s.duration_ms);
          const allApps = new Set<string>([...mirrorMap.keys(), ...osMap.keys()]);
          const candidateApps = [...allApps].filter((app) => !launcherSet.has(app) && !isIgnoredSystemApp(app));
          const resolvedDay = await resolveAppLabels(candidateApps);
          const filteredApps = candidateApps.filter((app) => !isIgnoredSystemApp(app, resolvedDay[app]));
          const rows: SingleDayRow[] = filteredApps
            .map((app) => {
              const mirrorMs = mirrorMap.get(app) ?? 0;
              const osMs = osMap.get(app) ?? 0;
              const diff = osMs > 0 ? ((mirrorMs - osMs) / osMs) * 100 : 0;
              const status =
                Math.abs(mirrorMs - osMs) <= Math.max(osMs * 0.1, 60_000)
                  ? 'ok'
                  : mirrorMs < osMs
                    ? 'low'
                    : 'high';
              return { app, label: resolvedDay[app] ?? app, mirrorMs, osMs, diffPct: diff, status };
            })
            .sort((a, b) => b.osMs - a.osMs);
          setSingleDayRows(rows);
        } catch {}
      } catch (e) {
        console.log('OS totals failed', e);
      }

      try {
        const now = Date.now();
        const since24h = now - 24 * 3_600_000;
        const debug = await usage.queryEventsDebug(since24h, now);
        setDebugEvents(debug.slice(-100));
        console.log('RAW UsageEvents debug (last 24h, count):', debug.length, JSON.stringify(debug.slice(-30), null, 2));
        try {
          let launcherPkgs: string[] = [];
          try {
            launcherPkgs = await usage.getLauncherPackages();
          } catch {}
          const built24h = buildUsageEvents(debug, {
            sinceMs: since24h,
            untilMs: now,
            ignorePackages: launcherPkgs,
          });
          const orphanPkgs = [
            ...new Set(built24h.dropped.filter((d) => d.reason === 'orphan_background' && d.app).map((d) => d.app!)),
          ];
          const orphanLabels = orphanPkgs.length > 0 ? await resolveAppLabels(orphanPkgs) : {};
          setLabels((prev) => ({ ...prev, ...orphanLabels }));
          setRaw24hOrphans(summarizeOrphanDrops(built24h.dropped, orphanLabels, 8));
        } catch {}
        const honkaiPkgs = [
          'com.HoYoverse.hkrpgoversea',
          'com.miHoYo.hkrpg',
          'com.HoYoverse.StarRail',
          'com.miHoYo.GenshinImpact',
        ];
        const honkai = debug.filter((e) =>
          honkaiPkgs.some(
            (p) =>
              e.packageName.toLowerCase().includes('hkrpg') ||
              e.packageName.toLowerCase().includes('honkai') ||
              e.packageName.toLowerCase().includes('genshin') ||
              e.packageName === p,
          ),
        );
        if (honkai.length > 0) {
          setHonkaiDebug(honkai.slice(-100));
          console.log('Honkai/Genshin raw events (last 24h):', JSON.stringify(honkai, null, 2));
        }
      } catch {}

      try {
        const cursor = await runtime.cursorState();
        if (cursor.at) {
          setCollectingSince(
            new Date(cursor.at).toLocaleDateString() + ' ' + new Date(cursor.at).toLocaleTimeString(),
          );
        } else {
          setCollectingSince(new Date(Date.now() - 86_400_000).toLocaleDateString() + ' (first sync reads 1 day back)');
        }
      } catch {}

      const q = await runtime.dataQuality({ fromMs: dayStartMs(selectedDay), toMs: dayEndMs(selectedDay) });
      setQuality(q);
      hasLoadedOnceRef.current = true;
      setLoading(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = /record was sealed with key "([^"]+)", current key is "([^"]+)"/.exec(msg);
      if (m) {
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
        const dayFrom = dayStartMs(selectedDay);
        const dayTo = dayEndMs(selectedDay);
        let launcherPkgs: string[] = [];
        try {
          launcherPkgs = await rt.usage().getLauncherPackages();
        } catch {}
        const launcherSet = new Set(launcherPkgs);
        const sessDay = await rt.store.sessions({ fromMs: dayFrom, toMs: dayTo });
        const gapsRaw = await rt.store.gaps({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
        const scoreGaps: ScoreGap[] = gapsRaw.map((g) => ({
          reason: g.reason,
          count: g.count,
          fromMs: g.from_ms ?? undefined,
          toMs: g.to_ms ?? undefined,
        }));
        const labelArray = Object.entries(updatedLabels).map(([sessionId, label]) => ({ sessionId, label }));
        const scored: ScoredSession[] = sessDay
          .filter((x) => !launcherSet.has(x.app) && !isIgnoredSystemApp(x.app, labels[x.app]))
          .map((x) => ({ id: x.id, app: x.app, startMs: x.start_ms, endMs: x.end_ms }));
        setDayScoredSessions(scored);
        setDayScoreGaps(scoreGaps);
        const utcOffsetMinutes = -new Date().getTimezoneOffset();
        setIqs(
          scoreIqs({
            window: { fromMs: dayFrom, toMs: dayTo },
            sessions: scored,
            labels: labelArray,
            gaps: scoreGaps,
            utcOffsetMinutes,
            approximate: true,
          }),
        );
        const histFrom = dayTo - 30 * 86_400_000;
        const allHistSessions = await rt.store.sessions({ fromMs: dayTo - 84 * 86_400_000, toMs: dayTo });
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
        setDiscovery(
          computeDiscoveryJourney({
            sessions: histScored,
            osTotals: dailyTotals,
            intentLabels: updatedLabels,
            labelWindow: { fromMs: dayFrom, toMs: dayTo },
            labels,
            ignorePackages: launcherPkgs,
            utcOffsetMinutes,
          }),
        );
        setRabbitHole(
          computeRabbitHoles({
            sessions: histScored,
            intentLabels: updatedLabels,
            labels,
            ignorePackages: launcherPkgs,
            utcOffsetMinutes,
          }),
        );
        setFocusWindows(
          computeFocusWindows({
            sessions: focusScored,
            intentLabels: updatedLabels,
            labels,
            ignorePackages: launcherPkgs,
            utcOffsetMinutes,
          }),
        );
      } catch {}
    },
    [selectedDay, labels, dailyTotals],
  );

  const saveSessionLabel = React.useCallback(
    async (sessionId: string, lbl: 'intentional' | 'mindless' | 'unsure') => {
      try {
        setLabelSaving(sessionId);
        const runtime = runtimeRef.current;
        if (runtime) {
          await runtime.saveIntentLabel(sessionId, lbl);
          const updatedLabels = { ...intentLabels, [sessionId]: lbl };
          setIntentLabels(updatedLabels);
          await recomputeFromLabels(updatedLabels);
        }
      } finally {
        setLabelSaving(null);
      }
    },
    [intentLabels, recomputeFromLabels],
  );

  const clearStoredLabels = React.useCallback(async () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    await rt.clearAllIntentLabels();
    setIntentLabels({});
    await recomputeFromLabels({});
  }, [recomputeFromLabels]);

  const resetStoredData = React.useCallback(async () => {
    try {
      const rt = runtimeRef.current;
      if (rt) {
        await rt.store.deleteAll();
        setKeyMismatch(null);
        setError(null);
        setSessions([]);
        setDailyTotals([]);
        setScaledSessions([]);
        setEvolution(null);
        setDiscovery(null);
        setRabbitHole(null);
        setFocusWindows(null);
        setLastCollect('store reset');
        await checkPermissionAndCollect();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [checkPermissionAndCollect]);

  const dismissKeyMismatch = React.useCallback(() => {
    setKeyMismatch(null);
  }, []);

  const whatIf: WhatIfResult | null = React.useMemo(() => {
    try {
      const dayFrom = dayStartMs(selectedDay);
      const dayTo = dayEndMs(selectedDay);
      const quietHours =
        whatIfQuietPreset === '22-07'
          ? { startHour: 22, endHour: 7 }
          : { startHour: 23, endHour: 5 };
      return computeWhatIf({
        window: { fromMs: dayFrom, toMs: dayTo },
        sessions: dayScoredSessions,
        osTotals: dailyTotals,
        labels: intentLabels,
        appLabels: labels,
        ignorePackages: launcherPackages,
        gaps: dayScoreGaps,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        approximate: true,
        sittingCapMinutes: whatIfCapMin,
        quietHours,
      });
    } catch {
      return null;
    }
  }, [
    selectedDay,
    dayScoredSessions,
    dailyTotals,
    intentLabels,
    labels,
    launcherPackages,
    dayScoreGaps,
    whatIfCapMin,
    whatIfQuietPreset,
  ]);

  const curiosity: CuriositySplit | null = React.useMemo(() => {
    try {
      const dayFrom = dayStartMs(selectedDay);
      const dayTo = dayEndMs(selectedDay);
      const labelArray = Object.entries(intentLabels).map(([sessionId, label]) => ({ sessionId, label }));
      return curiositySplit({
        window: { fromMs: dayFrom, toMs: dayTo },
        sessions: dayScoredSessions,
        labels: labelArray,
        gaps: dayScoreGaps,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        approximate: true,
      });
    } catch {
      return null;
    }
  }, [selectedDay, dayScoredSessions, intentLabels, dayScoreGaps]);

  const depthBands: DepthBand[] = React.useMemo(() => {
    const dayFrom = dayStartMs(selectedDay);
    const dayTo = dayEndMs(selectedDay);
    return sessionBands(sessionsInWindow(dayScoredSessions, { fromMs: dayFrom, toMs: dayTo }));
  }, [selectedDay, dayScoredSessions]);

  const copyRawEvents = React.useCallback(async () => {
    try {
      const json = JSON.stringify(
        debugEvents.map((e) => ({
          eventType: e.eventType,
          typeName: e.typeName,
          packageName: e.packageName,
          className: e.className ?? '',
          timeStamp: e.timeStamp,
          iso: new Date(e.timeStamp).toISOString(),
        })),
        null,
        2,
      );
      await Share.share({ message: json });
      setCopyStatus(`Shared ${debugEvents.length} events`);
      setTimeout(() => setCopyStatus(null), 3000);
    } catch (e: unknown) {
      setCopyStatus(`Share failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [debugEvents]);

  const handleBuildTap = React.useCallback(() => {
    const next = buildTapCount + 1;
    setBuildTapCount(next);
    if (next >= 7) {
      setShowDebug(true);
      setBuildTapCount(0);
    }
    setTimeout(() => setBuildTapCount(0), 3000);
  }, [buildTapCount]);

  const dayOptions = React.useMemo(() => lastNDays(7), [selectedDay]);
  const orphanCount = quality?.byReason?.orphan_background ?? 0;
  const totalGaps = quality?.count ?? 0;
  const p3Reliable = orphanCount <= 50 && totalGaps <= 100;

  const value = React.useMemo<MirrorAppContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      permission,
      setPermission,
      loading,
      error,
      lastCollect,
      collectingSince,
      keyMismatch,
      dismissKeyMismatch,
      resetStoredData,
      selectedDay,
      setSelectedDay,
      dayOptions,
      sessions,
      dailyTotals,
      labels,
      quality,
      validation,
      singleDayRows,
      debugEvents,
      honkaiDebug,
      invalidTop,
      copyStatus,
      scaledSessions,
      iqs,
      curiosity,
      depthBands,
      dayScoredSessions,
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
    }),
    [
      activeTab,
      permission,
      loading,
      error,
      lastCollect,
      collectingSince,
      keyMismatch,
      dismissKeyMismatch,
      resetStoredData,
      selectedDay,
      dayOptions,
      sessions,
      dailyTotals,
      labels,
      quality,
      validation,
      singleDayRows,
      debugEvents,
      honkaiDebug,
      invalidTop,
      copyStatus,
      scaledSessions,
      iqs,
      curiosity,
      depthBands,
      dayScoredSessions,
      dayScoreGaps,
      evolution,
      discovery,
      rabbitHole,
      focusWindows,
      whatIf,
      whatIfCapMin,
      whatIfQuietPreset,
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
    ],
  );

  return <MirrorAppContext.Provider value={value}>{children}</MirrorAppContext.Provider>;
}
