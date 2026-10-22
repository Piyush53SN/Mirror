/* eslint-disable no-console */
import * as React from 'react';
import { AppState, ScrollView, Share, View, Pressable } from 'react-native';
import { createTheme } from '@mirror/ui';
import { Card, SectionHeader, Text, Divider, WhySheet, ConfidenceChip, TierBadge, Chip, Callout } from '@mirror/ui';
import { Pill, LinkButton } from '@mirror/ui';
import { PermissionPrimer } from '@mirror/ui';
import { createRuntime, type DataQuality } from './src/runtime';
import { defineUsageTask, provideRuntime, registerUsageTask } from './src/collector/background';
import { resolveAppLabels, getCachedLabel } from './src/collector/appLabels';
import type { SessionRow } from '@mirror/store';
import type { ValidationResult } from '@mirror/core-analytics';
import { getTopInvalidPackages, DEFAULT_IGNORED_PACKAGES, scoreIqs, type Score, type ScoredSession, type ScoreGap } from '@mirror/core-analytics';

type PermissionState = 'checking' | 'granted' | 'denied' | 'unavailable';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

type DailyTotal = { app: string; label: string; totalMs: number };
type SingleDayRow = { app: string; label: string; mirrorMs: number; osMs: number; diffPct: number; status: string };

function dayStartMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function dayEndMs(dateStr: string): number {
  return dayStartMs(dateStr) + 86_400_000;
}
function toDayStr(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(toDayStr(d.getTime()));
  }
  return out;
}

export default function App(): React.ReactElement {
  const theme = React.useMemo(() => createTheme('dark'), []);
  const [permission, setPermission] = React.useState<PermissionState>('checking');
  const [_sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [dailyTotals, setDailyTotals] = React.useState<DailyTotal[]>([]);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [quality, setQuality] = React.useState<DataQuality | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [debugEvents, setDebugEvents] = React.useState<{ packageName: string; typeName: string; eventType: number; timeStamp: number; className?: string }[]>([]);
  const [invalidTop, setInvalidTop] = React.useState<{ pkg: string; count: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastCollect, setLastCollect] = React.useState<string | null>(null);
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  const [keyMismatch, setKeyMismatch] = React.useState<{ oldKey: string; newKey: string } | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<string>(() => toDayStr(Date.now()));
  const [singleDayRows, setSingleDayRows] = React.useState<SingleDayRow[]>([]);
  const [collectingSince, setCollectingSince] = React.useState<string | null>(null);
  const [honkaiDebug, setHonkaiDebug] = React.useState<{ packageName: string; typeName: string; eventType: number; timeStamp: number; className?: string }[]>([]);
  const [showDebug, setShowDebug] = React.useState(false);
  const [buildTapCount, setBuildTapCount] = React.useState(0);
  const [scaledSessions, setScaledSessions] = React.useState<{ id: string; app: string; label: string; start_ms: number; end_ms: number; duration_ms: number; scaled_duration_ms: number; isScaled: boolean }[]>([]);
  const [iqs, setIqs] = React.useState<Score | null>(null);
  const [showWhy, setShowWhy] = React.useState(false);

  const runtimeRef = React.useRef<Awaited<ReturnType<typeof createRuntime>> | null>(null);

  const checkPermissionAndCollect = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const runtime = await createRuntime();
      runtimeRef.current = runtime;
      provideRuntime({ store: runtime.store });
      defineUsageTask();

      const usage = runtime.usage();
      if (!usage.available) {
        setPermission('unavailable');
        setLoading(false);
        return;
      }

      const has = await usage.hasPermission();
      if (!has) {
        setPermission('denied');
        setLoading(false);
        try {
          const q = await runtime.dataQuality();
          setQuality(q);
          const dayFrom = dayStartMs(selectedDay);
          const dayTo = dayEndMs(selectedDay);
          const osRows = await runtime.osTotals({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
          let launcherPkgs: string[] = [];
          try { launcherPkgs = await usage.getLauncherPackages(); } catch {}
          const launcherSet = new Set(launcherPkgs);
          const systemIgnoreSet = new Set(DEFAULT_IGNORED_PACKAGES);
          const filteredOs = osRows.filter((r) => r.packageName !== 'dev.mirror.app' && !launcherSet.has(r.packageName) && !systemIgnoreSet.has(r.packageName));
          const resolved = await resolveAppLabels(filteredOs.map((r) => r.packageName));
          const totals: DailyTotal[] = filteredOs.map((r) => ({ app: r.packageName, label: resolved[r.packageName] ?? r.packageName, totalMs: r.totalMs })).sort((a, b) => b.totalMs - a.totalMs);
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
        const byReason = collectResult.gaps.reduce((acc: any, g: any) => {
          acc[g.reason] = (acc[g.reason] ?? 0) + g.count;
          return acc;
        }, {});
        setLastCollect(`collect: collected ${collectResult.events} events, ${collectResult.inserted} inserted, ${collectResult.gaps.length} gaps (${Object.entries(byReason).map(([k, v]) => `${k}:${v}`).join(', ')})`);
        try {
          const top = getTopInvalidPackages(collectResult.dropped as any);
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
        try { launcherPkgs = await usage.getLauncherPackages(); } catch {}
        const launcherSet = new Set(launcherPkgs);
        const systemIgnoreSet = new Set(DEFAULT_IGNORED_PACKAGES);
        // Settings rule: exclude Settings and other system UI everywhere (same rule for totals and timeline)
        // This matches DEFAULT_IGNORED – Settings does not close previous and is not counted, unlike launchers which close previous but are also excluded from totals
        const filteredOs = osRows.filter((r) => r.packageName !== 'dev.mirror.app' && !launcherSet.has(r.packageName) && !systemIgnoreSet.has(r.packageName) && r.totalMs > 0);
        const resolved = await resolveAppLabels(filteredOs.map((r) => r.packageName));
        setLabels((prev) => ({ ...prev, ...resolved }));
        const totals: DailyTotal[] = filteredOs.map((r) => ({ app: r.packageName, label: resolved[r.packageName] ?? r.packageName, totalMs: r.totalMs })).sort((a, b) => b.totalMs - a.totalMs);
        setDailyTotals(totals);

        const sessDay = await runtime.store.sessions({ fromMs: dayFrom, toMs: dayTo });
        const sessFiltered = sessDay.filter((s) => s.app !== 'dev.mirror.app' && !launcherSet.has(s.app) && !systemIgnoreSet.has(s.app));
        setSessions(sessFiltered.slice(-50).reverse());

        const osMap = new Map<string, number>();
        for (const r of filteredOs) osMap.set(r.packageName, r.totalMs);

        // P2 fix: stop showing invented durations (Genshin 22s → 8m54s, Security 7m20s → 16s) and orphans 319.
        // Raw UsageEvents lose time (systemui fg, className mismatch, 2s overlap, unknown types 5/19-22) so
        // scaling invents durations. Show only open times (when app came to foreground), no durations, no scaling.
        // Daily totals from OS aggregate are authoritative.
        const openOnly: typeof scaledSessions = [];
        for (const s of sessFiltered) {
          openOnly.push({
            id: s.id,
            app: s.app,
            label: resolved[s.app] ?? getCachedLabel(s.app),
            start_ms: s.start_ms,
            end_ms: s.start_ms, // no duration shown
            duration_ms: s.duration_ms, // keep original for debug but not displayed
            scaled_duration_ms: 0, // not used
            isScaled: false,
          });
        }
        openOnly.sort((a, b) => b.start_ms - a.start_ms);
        setScaledSessions(openOnly);

        // J3 dashboard: compute IQS from real sessions (tier-D only, usage patterns)
        try {
          const scored: ScoredSession[] = sessFiltered.map((s) => ({ id: s.id, app: s.app, startMs: s.start_ms, endMs: s.end_ms }));
          const gapsRaw = await runtime.store.gaps({ fromMs: dayFrom, toMs: dayTo }).catch(() => []);
          const scoreGaps: ScoreGap[] = gapsRaw.map((g) => ({ reason: g.reason, count: g.count, fromMs: g.from_ms ?? undefined, toMs: g.to_ms ?? undefined }));
          const iqsResult = scoreIqs({
            window: { fromMs: dayFrom, toMs: dayTo },
            sessions: scored,
            gaps: scoreGaps,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
            approximate: true, // raw events approximate, confidence capped 0.49 low
          });
          setIqs(iqsResult);
        } catch (e) {
          console.log('IQS compute failed', e);
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
          const filteredApps = [...allApps].filter((app) => app !== 'dev.mirror.app' && !launcherSet.has(app) && !systemIgnoreSet.has(app));
          const resolvedDay = await resolveAppLabels(filteredApps);
          const rows: SingleDayRow[] = filteredApps.map((app) => {
            const mirrorMs = mirrorMap.get(app) ?? 0;
            const osMs = osMap.get(app) ?? 0;
            const diff = osMs > 0 ? ((mirrorMs - osMs) / osMs) * 100 : 0;
            const status = Math.abs(mirrorMs - osMs) <= Math.max(osMs * 0.1, 60_000) ? 'ok' : mirrorMs < osMs ? 'low' : 'high';
            return { app, label: resolvedDay[app] ?? app, mirrorMs, osMs, diffPct: diff, status };
          }).sort((a, b) => b.osMs - a.osMs);
          setSingleDayRows(rows);
        } catch {}

      } catch (e) {
        console.log('OS totals failed', e);
      }

      try {
        const now = Date.now();
        const debug = await usage.queryEventsDebug(now - 24 * 3_600_000, now);
        setDebugEvents(debug.slice(-100));
        console.log('RAW UsageEvents debug (last 24h, count):', debug.length, JSON.stringify(debug.slice(-30), null, 2));
        const honkaiPkgs = ['com.HoYoverse.hkrpgoversea', 'com.miHoYo.hkrpg', 'com.HoYoverse.StarRail', 'com.miHoYo.GenshinImpact'];
        const honkai = debug.filter((e) => honkaiPkgs.some((p) => e.packageName.toLowerCase().includes('hkrpg') || e.packageName.toLowerCase().includes('honkai') || e.packageName.toLowerCase().includes('genshin') || e.packageName === p));
        if (honkai.length > 0) {
          setHonkaiDebug(honkai.slice(-100));
          console.log('Honkai/Genshin raw events (last 24h):', JSON.stringify(honkai, null, 2));
        }
      } catch {}

      try {
        const cursor = await runtime.cursorState();
        if (cursor.at) {
          setCollectingSince(new Date(cursor.at).toLocaleDateString() + ' ' + new Date(cursor.at).toLocaleTimeString());
        } else {
          setCollectingSince(new Date(Date.now() - 86_400_000).toLocaleDateString() + ' (first sync reads 1 day back)');
        }
      } catch {}

      const q = await runtime.dataQuality({ fromMs: dayStartMs(selectedDay), toMs: dayEndMs(selectedDay) });
      setQuality(q);
      setLoading(false);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const m = /record was sealed with key \"([^\"]+)\", current key is \"([^\"]+)\"/.exec(msg);
      if (m) {
        setKeyMismatch({ oldKey: m[1], newKey: m[2] });
        setError(`Stored data can't be read – it was sealed with key \"${m[1]}\", current key is \"${m[2]}\". This can happen after reinstall or backup restore.`);
      } else {
        setError(msg);
      }
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
    } catch (e: any) {
      setCopyStatus(`Share failed: ${e?.message ?? String(e)}`);
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

  if (permission === 'checking' || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.canvas, justifyContent: 'center', alignItems: 'center', padding: theme.space(4) }}>
        <Text role="headline" theme={theme}>Mirror - checking usage access...</Text>
        <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>{lastCollect ?? 'starting collector'}</Text>
      </View>
    );
  }

  if (permission === 'unavailable') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.canvas, padding: theme.space(4), gap: theme.space(3), justifyContent: 'center' }}>
        <Card theme={theme}>
          <Text role="headline" theme={theme}>Native module unavailable</Text>
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>MirrorUsageStats is not linked. This happens in Expo Go or a build that predates the module. Build a dev client: make mobile-android.</Text>
          {error ? <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>{error}</Text> : null}
        </Card>
      </View>
    );
  }

  if (permission === 'denied') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.color.canvas }} contentContainerStyle={{ padding: theme.space(4), gap: theme.space(3) }}>
        <PermissionPrimer
          theme={theme}
          ask={{
            systemName: 'Usage access - Settings -> Apps -> Special access -> Usage access -> Mirror',
            sees: 'How long you use each app and when you open them - foreground time, launches, timestamps.',
            cannotSee: 'What is inside those apps. No content, no messages, no notifications. Mirror never reads them.',
            settingsPath: 'Android settings -> Special access -> Usage access',
          }}
          onAllow={openSettings}
          onDeny={() => setPermission('denied')}
        />
        {quality ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title="Data quality" caption="what Mirror could not measure" />
            <Text role="label" tone="muted" theme={theme}>{quality.sentence}</Text>
          </Card>
        ) : null}
        {dailyTotals.length > 0 ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={`Per-app totals - ${selectedDay} (OS)`} caption="from OS aggregate, matches Digital Wellbeing" />
            {dailyTotals.map((t) => (
              <View key={t.app} style={{ paddingVertical: theme.space(1) }}>
                <Text role="label" theme={theme}>{`${t.label} - ${formatDuration(t.totalMs)}`}</Text>
                <Text role="micro" tone="muted" theme={theme}>{t.app}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  if (showDebug) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.color.canvas }} contentContainerStyle={{ padding: theme.space(4), gap: theme.space(3) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text role="display" theme={theme}>Debug – hidden</Text>
          <Pill theme={theme} onPress={() => setShowDebug(false)}>Close debug</Pill>
        </View>

        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title="Sessions – why open times only, no durations" caption="P2 fix: no invented durations" />
          <Text role="micro" tone="muted" theme={theme}>
            {[
              'Per-app daily totals come from OS aggregate queryUsageStats (INTERVAL_DAILY, same as Digital Wellbeing), so they match by construction. Excludes launchers (HOME role via getLauncherPackages) and Mirror itself and system UI (Settings rule: exclude Settings, systemui, permissioncontroller etc everywhere – only launchers+Mirror close previous).',
              'Session timeline comes from raw UsageEvents (RESUMED=1, PAUSED=2, STOPPED=23, DESTROYED=24, SCREEN_NON_INTERACTIVE=16, KEYGUARD_SHOWN=17, DEVICE_SHUTDOWN=26). Raw events lose time: systemui fg (notification shade) at 31s closed Honkai prematurely (old code), className mismatch fg MainActivity vs bg empty, cursor overlap 2s fg outside window bg inside → orphan, unknown types CONFIGURATION_CHANGE=5 and FOREGROUND_SERVICE 19-22 dropped. On device orphans 319, so durations unreliable.',
              'P2 fix: Genshin orig 22s shown as 8m54s, Security orig 7m20s shown as 16s because scaling factor = osMs/sessionSum invents durations. Fix: show only open times (when app came to foreground), no durations, no scaling. Daily totals authoritative, open times informative.',
              'Scores: approximate session data does NOT feed scores as exact. ScoreInput has approximate flag, confidenceFor caps score to 0.49 and level low when approximate true, with reason explaining 99% loss. Sessions count, focus windows, rabbit hole, curiosity vs habit must not use scaled durations or start/end as exact – they use OS totals or original sessions with low confidence.',
              '0.49 cap: When approximate true, confidence score = min(score, 0.49), level = low, so IQS never shows high/medium confidence from approximate timeline. Documented in docs/metrics.md.',
              'Fixture: honkai-day-raw.json is synthetic invented to reproduce 31s vs 52m48s, will be replaced with real raw events from phone via debug Share button. Until real day captured, show only open times.',
            ].join('\n\n')}
          </Text>
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title={`Validation – same period ${selectedDay}`} caption="fixed to compare same period on both sides" />
          {validation ? (
            <View style={{ gap: theme.space(1) }}>
              <Text role="label" theme={theme}>{`OS vs Mirror validation (max(10%,60s)): max diff ${validation.maxAbsPct.toFixed(1)}% / ${formatDuration(validation.maxAbsMs)}, ${validation.ok ? 'OK' : `FAIL ${validation.overThreshold.length} apps`}`}</Text>
              <Text role="micro" tone="muted" theme={theme}>{`Period: ${selectedDay} local day, OS from queryUsageStats, Mirror from sessions (raw events). Should be same period.`}</Text>
              {validation.rows.slice(0, 20).map((r) => (
                <Text key={r.app} role="micro" tone="muted" theme={theme}>
                  {`${labels[r.app] ?? r.app}: OS ${formatDuration(r.osMs)}, Mirror ${formatDuration(r.mirrorMs)}, diff ${r.diffPct.toFixed(1)}% (${formatDuration(r.diffMs)}) ${r.status}`}
                </Text>
              ))}
            </View>
          ) : (
            <Text role="micro" tone="muted" theme={theme}>No validation yet</Text>
          )}
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title={`Single-day OS vs Mirror – ${selectedDay}`} caption={`Mirror vs OS same day, collecting since ${collectingSince ?? 'unknown'}`} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1), marginBottom: theme.space(2) }}>
            {lastNDays(7).map((day) => (
              <Pill key={day} theme={theme} onPress={() => setSelectedDay(day)}>{day === selectedDay ? `● ${day}` : day}</Pill>
            ))}
          </View>
          {singleDayRows.length === 0 ? (
            <Text role="micro" tone="muted" theme={theme}>No data for {selectedDay}</Text>
          ) : (
            singleDayRows.slice(0, 30).map((r) => (
              <View key={r.app} style={{ paddingVertical: theme.space(1) }}>
                <Text role="micro" theme={theme}>{`${r.label} – Mirror ${formatDuration(r.mirrorMs)} / OS ${formatDuration(r.osMs)} diff ${r.diffPct.toFixed(1)}% ${r.status}`}</Text>
                <Text role="micro" tone="muted" theme={theme}>{r.app}</Text>
              </View>
            ))
          )}
        </Card>

        {honkaiDebug.length > 0 ? (
          <Card theme={theme} elevated>
            <SectionHeader theme={theme} title={`Honkai/Genshin raw events last 24h (${honkaiDebug.length})`} caption="RESUMED/PAUSED/STOPPED and class names" />
            {honkaiDebug.map((e, idx) => (
              <View key={idx} style={{ paddingVertical: theme.space(1) }}>
                <Text role="micro" theme={theme}>{`${new Date(e.timeStamp).toLocaleTimeString()} ${e.eventType}:${e.typeName} ${e.packageName}${e.className ? ` / ${e.className}` : ''}`}</Text>
              </View>
            ))}
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
              {`Why rebuild loses 99%: Honkai 31s vs OS 52m48s, Genshin 27s vs 9m36s, 336 orphan events. Root causes: (1) Single-foreground enforcement closes Honkai when systemui fg (notification shade) appears 31s after start – OS still counts Honkai as fg, Mirror closes. (2) Per-class mismatch: fg reports MainActivity, bg reports empty or different class – fallback deletes first activity, but if multiple activities resumed, interval stays open then closed by next app fg, bg becomes orphan. (3) Cursor overlap 2s: fg outside window, bg inside → orphan. (4) Games emit many CONFIGURATION_CHANGE (5) and FOREGROUND_SERVICE events (19-22) which we drop as unknown_type. (5) Screen-off closes all, but OS may still count time before screen-off differently. Fix: use OS aggregate for totals (matches by construction), sessions approximate scaled.`}
            </Text>
          </Card>
        ) : null}

        {debugEvents.length > 0 ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={`Debug - raw UsageEvents last 24h (${debugEvents.length})`} caption="foreground, background, stopped, destroyed, screen, keyguard" />
            <View style={{ flexDirection: 'row', gap: theme.space(2), marginBottom: theme.space(2) }}>
              <Pill theme={theme} onPress={copyRawEvents}>Share raw events JSON</Pill>
              {copyStatus ? <Text role="micro" tone="muted" theme={theme}>{copyStatus}</Text> : null}
            </View>
            {debugEvents.map((e, idx) => (
              <View key={idx} style={{ paddingVertical: theme.space(1) }}>
                <Text role="micro" theme={theme}>{`${new Date(e.timeStamp).toLocaleTimeString()} ${e.eventType}:${e.typeName} ${e.packageName}${e.className ? ` / ${e.className.split('.').pop()}` : ''}`}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card theme={theme}>
          <SectionHeader theme={theme} title="Data quality details" caption="full gaps" />
          <Text role="micro" tone="muted" theme={theme}>{quality?.sentence ?? 'No gaps'}</Text>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>{`${quality?.count ?? 0} gaps, by reason: ${Object.entries(quality?.byReason ?? {}).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}`}</Text>
          {invalidTop.length > 0 ? (
            <View style={{ marginTop: theme.space(1) }}>
              <Text role="label" theme={theme}>Top invalid_package:</Text>
              {invalidTop.map((it) => (
                <Text key={it.pkg} role="micro" tone="muted" theme={theme}>{`${it.pkg} - ${it.count}`}</Text>
              ))}
            </View>
          ) : null}
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`336 orphan events explanation: many bg without fg due to (1) fg outside 2s overlap window, bg inside; (2) single-foreground closes previous at next fg, later bg becomes orphan; (3) className mismatch fg vs bg; (4) systemui fg closes previous (notification shade) – should not close for games. With OS totals for per-app daily, orphan count no longer affects totals, only timeline.`}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader theme={theme} title="What this build is" caption="Stage 1 - OS totals for per-app, raw events for open times only" />
          <Text role="micro" tone="muted" theme={theme}>
            {[
              'Per-app daily totals: from OS aggregate queryUsageStats (same as Digital Wellbeing, one local day per bucket), matches by construction, excludes launchers (HOME role) and Mirror itself',
              'App opens: from raw UsageEvents (RESUMED/PAUSED/STOPPED/DESTROYED/SCREEN_NON_INTERACTIVE etc), per-activity tracking, single foreground, gap ≤2s merged, 6h max, shown as open times only, no durations, no scaling (P2 fix: orphans 319, Genshin 22s→8m54s)',
              'IQS: tier-D only, usage-pattern scores, Based on usage patterns only chip, data-tier chip, Why sheet',
              'Data quality: one-line note on main, full details in debug',
              'Debug hidden: tap build number 7 times to show validation (same period), OS vs Mirror comparison, Honkai raw events, raw events log',
              'Fix: validation now compares same period (selected day) on both sides, not last 7 days vs different window',
              'Honkai fixture: honkai-day-raw.json captures RESUMED/PAUSED/STOPPED with class names, explains 99% loss due to systemui fg closing, className mismatch, 2s overlap, unknown types',
            ].join('\n')}
          </Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.color.canvas }} contentContainerStyle={{ padding: theme.space(4), gap: theme.space(3) }}>
      <View style={{ gap: theme.space(2) }}>
        <Text role="display" theme={theme}>Mirror - {selectedDay}</Text>
        <Text role="label" tone="muted" theme={theme}>{collectingSince ? `Collecting since ${collectingSince}` : 'Collecting...'}</Text>
        <Text role="micro" tone="muted" theme={theme}>{lastCollect ?? 'collector idle'}</Text>
        {error ? <Text role="micro" tone="muted" theme={theme}>{error}</Text> : null}
      </View>

      {keyMismatch ? (
        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title="Stored data can't be read" caption={`sealed with ${keyMismatch.oldKey}, current ${keyMismatch.newKey}`} />
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`Mirror's encrypted database was sealed with key \"${keyMismatch.oldKey}\" but the current key is \"${keyMismatch.newKey}\". This happens after reinstall, clear data, or when Android restores a backup of the database without its key (SecureStore is not backed up).`}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3) }}>
            <Pill theme={theme} onPress={async () => { try { const rt = runtimeRef.current; if (rt) { await rt.store.deleteAll(); setKeyMismatch(null); setError(null); setSessions([]); setDailyTotals([]); setScaledSessions([]); setLastCollect('store reset'); await checkPermissionAndCollect(); } } catch (e: any) { setError(e?.message ?? String(e)); } }}>Reset stored data</Pill>
            <LinkButton theme={theme} onPress={() => setKeyMismatch(null)}>Dismiss</LinkButton>
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) }}>
        {lastNDays(7).map((day) => (
          <Pill key={day} theme={theme} onPress={() => setSelectedDay(day)}>{day === selectedDay ? `● ${day}` : day}</Pill>
        ))}
      </View>

      {/* J3 Dashboard – Frosted Horizon, wired to real data */}
      <Card theme={theme} elevated>
        <SectionHeader theme={theme} title="Interaction quality" caption="out of what Mirror can actually measure" />
        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', marginBottom: theme.space(2) }}>
          <Chip label="Based on usage patterns only" theme={theme} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1) }}>
            <TierBadge tier="D" theme={theme} />
            <Text role="micro" tone="muted" theme={theme}>Tier D only – OS usage, no content</Text>
          </View>
          <ConfidenceChip tiers={['D']} theme={theme} />
        </View>
        {iqs ? (
          <View style={{ gap: theme.space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space(2) }}>
              <Text role="display" theme={theme}>{iqs.value === null ? '—' : String(Math.round(iqs.value))}</Text>
              <Text role="label" tone="muted" theme={theme}>{`/ ${iqs.max}`}</Text>
              <Text role="micro" tone="muted" theme={theme}>{iqs.band}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.space(2), alignItems: 'center' }}>
              <Text role="micro" tone="muted" theme={theme}>{`Confidence: ${iqs.confidence.level} (${Math.round(iqs.confidence.score * 100)}%) – ${iqs.confidence.sample} sittings`}</Text>
            </View>
            <Text role="micro" tone="muted" theme={theme}>{iqs.caveat}</Text>
            <View style={{ marginTop: theme.space(2) }}>
              <Pill theme={theme} onPress={() => setShowWhy((v) => !v)}>{showWhy ? 'Hide why' : 'Why this score'}</Pill>
            </View>
            {showWhy ? (
              <View style={{ marginTop: theme.space(3) }}>
                <WhySheet
                  score={iqs.value ?? 0}
                  maxScore={iqs.max}
                  components={iqs.factors.map((f) => ({ label: f.label, points: f.points, note: f.detail, tier: f.tier }))}
                  caveat={iqs.caveat}
                  theme={theme}
                />
                <View style={{ marginTop: theme.space(2), gap: theme.space(1) }}>
                  <Text role="label" theme={theme}>Confidence reasons:</Text>
                  {iqs.confidence.reasons.map((r, idx) => (
                    <Text key={idx} role="micro" tone="muted" theme={theme}>{`• ${r}`}</Text>
                  ))}
                </View>
                <Callout theme={theme} tone="neutral" style={{ marginTop: theme.space(2) }}>
                  Tier-D only: session_length (25), deliberate_share (20, needs 5 labels), switching (15), late_night (15). Topic_depth (25, tier A) not measured without vectors – so max is 75 when only usage patterns available. This matches “Based on usage patterns only” chip.
                </Callout>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: theme.space(2) }}>
            <Text role="label" tone="muted" theme={theme}>No usage data for {selectedDay} – IQS not measured. Grant usage access and use apps, then Refresh.</Text>
            <Text role="micro" tone="muted" theme={theme}>Mirror will not fill the gap with estimates.</Text>
          </View>
        )}
      </Card>

      <Card theme={theme} elevated>
        <SectionHeader theme={theme} title={`Per-app totals – ${selectedDay}`} caption="from OS aggregate (Digital Wellbeing source), matches by construction, excludes launchers and Mirror" />
        {dailyTotals.length === 0 ? (
          <Text role="micro" tone="muted" theme={theme}>No totals for {selectedDay} – use apps that day, then Refresh. Totals come from OS queryUsageStats, not event rebuild, so they match Settings.</Text>
        ) : (
          dailyTotals.map((t) => (
            <View key={t.app} style={{ paddingVertical: theme.space(2), flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text role="label" theme={theme}>{t.label}</Text>
                <Text role="micro" tone="muted" theme={theme}>{t.app}</Text>
              </View>
              <Text role="label" theme={theme}>{formatDuration(t.totalMs)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card theme={theme}>
        <SectionHeader theme={theme} title={`App opens – ${selectedDay}, ${scaledSessions.length}`} caption="open times only, no durations" />
        <View style={{ backgroundColor: theme.color.surface, padding: theme.space(2), borderRadius: theme.radius.sm, marginBottom: theme.space(2) }}>
          <Text role="label" theme={theme}>Open times only – durations not shown. Daily totals above are authoritative from OS.</Text>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>Raw UsageEvents lose time (orphans 319, systemui fg, className mismatch, 2s overlap). Showing only when apps came to foreground avoids inventing durations (e.g. Genshin 22s shown as 8m54s, Security 7m20s shown as 16s). No scaling.</Text>
        </View>
        {scaledSessions.length === 0 ? (
          <View style={{ paddingVertical: theme.space(4), alignItems: 'center' }}>
            <Text role="label" theme={theme}>No opens for {selectedDay} – totals above are authoritative (OS).</Text>
          </View>
        ) : (
          scaledSessions.map((s) => (
            <View key={s.id} style={{ paddingVertical: theme.space(2) }}>
              <Text role="label" theme={theme}>{`${s.label} opened at ${formatTime(s.start_ms)}`}</Text>
              <Text role="micro" tone="muted" theme={theme}>{s.app}</Text>
              <Divider theme={theme} />
            </View>
          ))
        )}
      </Card>

      <Card theme={theme}>
        <SectionHeader theme={theme} title="Data quality" caption="one-line note" />
        <Text role="body" theme={theme}>{quality?.sentence ?? 'No gaps recorded in this window.'}</Text>
        <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(2) }}>
          <Pill theme={theme} onPress={checkPermissionAndCollect}>Refresh</Pill>
          <LinkButton theme={theme} onPress={openSettings}>Open usage settings</LinkButton>
        </View>
      </Card>

      <Pressable onPress={handleBuildTap}>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="What this build is" caption={`Tap 7 times for debug – build ${buildTapCount}/7`} />
          <Text role="micro" tone="muted" theme={theme}>
            {[
              `Per-app totals from OS aggregate (queryUsageStats, local day bucket), matches Digital Wellbeing by construction, excludes launchers (HOME role) and Mirror`,
              `App opens from raw events, open times only, no durations, no scaling (P2 fix: orphans 319, Genshin 22s→8m54s invented)`,
              `IQS: tier-D only usage-pattern scores, Based on usage patterns only chip, Why sheet`,
              `Build: tap 7 times for hidden debug (validation same period, OS vs Mirror, Honkai raw)`,
            ].join('\n')}
          </Text>
        </Card>
      </Pressable>
    </ScrollView>
  );
}
