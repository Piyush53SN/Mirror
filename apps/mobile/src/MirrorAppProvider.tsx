/* eslint-disable no-console */
import * as React from 'react';
import { AppState, Share } from 'react-native';
import type {
  DayStoreRowCounts,
  SessionRepairSnapshot,
  SessionRow,
  StoreResetAudit,
  StoreResetReason,
} from '@mirror/store';
import type {
  CuriositySplit,
  DayTotalsSource,
  DepthBand,
  DiscoveryJourneyResult,
  FlaggedAppDiscrepancy,
  FocusWindowsResult,
  InterestEvolutionResult,
  OrphanDiagnosticSummary,
  RabbitHoleResult,
  RawUsageBucketDiagnostic,
  Score,
  ScoreGap,
  ScoredSession,
  TracedAppInterval,
  ValidationResult,
  WhatIfResult,
} from '@mirror/core-analytics';
import {
  DEFAULT_MAX_INTERVAL_MS,
  buildCanonicalDaySittings,
  buildUsageEvents,
  computeDiscoveryJourney,
  computeFocusWindows,
  computeInterestEvolution,
  computeRabbitHoles,
  computeWhatIf,
  curiositySplit,
  evaluateAppOsDiscrepancies,
  getTopInvalidPackages,
  isIgnoredSystemApp,
  scoreIqs,
  sessionBands,
  sumSittingSpanMs,
  summarizeOrphanDrops,
} from '@mirror/core-analytics';
import { createRuntime, type DataQuality } from './runtime';
import { defineUsageTask, provideRuntime, registerUsageTask } from './collector/background';
import { getCachedLabel, resolveAppLabels } from './collector/appLabels';
import {
  MirrorAppContext,
  dayEndMs,
  dayStartMs,
  formatDuration,
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
  const [latestSyncOrphans, setLatestSyncOrphans] = React.useState<OrphanDiagnosticSummary | null>(null);
  const [raw24hOrphans, setRaw24hOrphans] = React.useState<OrphanDiagnosticSummary | null>(null);
  const [showWhy, setShowWhy] = React.useState(false);
  const [intentLabels, setIntentLabels] = React.useState<Record<string, 'intentional' | 'mindless' | 'unsure'>>({});
  const [labelSaving, setLabelSaving] = React.useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = React.useState<string | null>(null);
  const [labelOptIn, setLabelOptIn] = React.useState(false);

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
        const resetAudit = await runtime.lastReset();
        if (isCurrent()) setLastReset(resetAudit);
      } catch {}
      provideRuntime({
        store: runtime.store,
        collectNow: runtime.collectNow,
        ingestRecent: runtime.ingestRecent,
      });
      defineUsageTask();

      const usage = runtime.usage();
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
        hasLoadedOnceRef.current = true;
        setLoading(false);
        try {
          const dayFrom = dayStartMs(targetDay);
          const dayTo = dayEndMs(targetDay);
          const q = await runtime.dataQuality({ fromMs: dayFrom, toMs: dayTo });
          const resolvedOs = await runtime
            .osTotalsWithSource({ fromMs: dayFrom, toMs: dayTo })
            .catch(() => ({ totals: [], source: 'os_events' as const }));
          const osRows = resolvedOs.totals;
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
          const byAppDenied = new Map<string, number>();
          for (const r of filteredOs) {
            byAppDenied.set(r.packageName, (byAppDenied.get(r.packageName) ?? 0) + r.totalMs);
          }
          const totals: DailyTotal[] = [...byAppDenied.entries()]
            .map(([app, totalMs]) => ({ app, label: resolved[app] ?? app, totalMs }))
            .sort((a, b) => b.totalMs - a.totalMs || a.app.localeCompare(b.app));
          if (!isCurrent()) return;
          setQuality(q);
          setDailyTotals(totals);
          setDailyTotalsSource(resolvedOs.source);
          setLabels(resolved);
        } catch {}
        return;
      }

      if (!isCurrent()) return;
      setPermission('granted');
      try {
        await registerUsageTask();
      } catch {}

      const collectResult = await runtime.collectNow();
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;

      try {
        const [rowCounts, repairSnap] = await Promise.all([
          runtime.storeDayRowCounts(),
          runtime.sessionRepairSnapshot(),
        ]);
        if (isCurrent()) {
          setStoreDayRowCounts(rowCounts);
          setSessionRepairSnapshot(repairSnap);
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
        const launcherSet = new Set(launcherPkgs);
        const candidateOs = osRows.filter(
          (r) => !launcherSet.has(r.packageName) && !isIgnoredSystemApp(r.packageName) && r.totalMs > 0,
        );
        const resolved = await resolveAppLabels(candidateOs.map((r) => r.packageName));
        const filteredOs = candidateOs.filter((r) => !isIgnoredSystemApp(r.packageName, resolved[r.packageName]));
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
            ignorePackages: launcherPkgs,
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

        const gapsRaw = await runtime.store.gaps({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
        const scoreGaps: ScoreGap[] = gapsRaw.map((g) => ({
          reason: g.reason,
          count: g.count,
          fromMs: g.from_ms ?? undefined,
          toMs: g.to_ms ?? undefined,
        }));

        if (!isCurrent()) return;
        setLauncherPackages(launcherPkgs);
        setLabels((prev) => ({ ...prev, ...allLabelsForDay }));
        setDailyTotals(totals);
        setDailyTotalsSource(resolvedOs.source);
        setSessions(canonicalSessionRows);
        setScaledSessions(openOnly);
        setIntentLabels(loadedLabels);
        setDayWindow({ day: targetDay, fromMs: dayFrom, toMs: dayTo });
        setDayScoredSessions(canonicalSittings);
        setDayScoreGaps(scoreGaps);
        setLastSyncedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        );
        setDayReady(true);

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
          if (isCurrent()) {
            setEvolution(null);
            setDiscovery(null);
            setRabbitHole(null);
            setFocusWindows(null);
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
          const candidateApps = [...allApps].filter((app) => !launcherSet.has(app) && !isIgnoredSystemApp(app));
          const resolvedDay = await resolveAppLabels(candidateApps);
          const filteredApps = candidateApps.filter((app) => !isIgnoredSystemApp(app, resolvedDay[app]));
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
        const debug = debugTo > debugFrom ? await usage.queryEventsDebug(debugFrom, debugTo) : [];
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
            targetDay === toDayStr(now)
              ? debug.filter((e) => e.timeStamp >= since24h)
              : await usage.queryEventsDebug(since24h, now);
          const built24h = buildUsageEvents(debug24h, {
            sinceMs: since24h,
            untilMs: now,
            ignorePackages: launcherPkgs,
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
    [dayWindow, labels, dailyTotals],
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
          setIntentLabels({});
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
      return scoreIqs({
        window: { fromMs: dayWindow.fromMs, toMs: dayWindow.toMs },
        sessions: dayScoredSessions,
        labels: labelArray,
        gaps: dayScoreGaps,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        approximate: true,
      });
    } catch (e) {
      console.log('IQS compute failed', e);
      return null;
    }
  }, [dayReady, dayWindow, dayScoredSessions, intentLabels, dayScoreGaps]);

  const whatIf: WhatIfResult | null = React.useMemo(() => {
    if (!dayReady) return null;
    try {
      const quietHours =
        whatIfQuietPreset === '22-07'
          ? { startHour: 22, endHour: 7 }
          : { startHour: 23, endHour: 5 };
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
        sittingCapMinutes: whatIfCapMin,
        quietHours,
      });
    } catch {
      return null;
    }
  }, [
    dayReady,
    dayWindow,
    dayScoredSessions,
    dailyTotals,
    dailyTotalsSource,
    intentLabels,
    labels,
    launcherPackages,
    dayScoreGaps,
    whatIfCapMin,
    whatIfQuietPreset,
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

  const value = React.useMemo<MirrorAppContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      permission,
      setPermission,
      loading,
      error,
      lastCollect,
      lastSyncedAt,
      collectingSince,
      keyMismatch,
      dismissKeyMismatch,
      resetStoredData,
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
      lastSyncedAt,
      collectingSince,
      keyMismatch,
      dismissKeyMismatch,
      resetStoredData,
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
