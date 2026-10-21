/* eslint-disable no-console */
import * as React from 'react';
import { AppState, ScrollView, Share, View } from 'react-native';
import { createTheme } from '@mirror/ui';
import { Card, SectionHeader, Text, Divider } from '@mirror/ui';
import { Pill, LinkButton } from '@mirror/ui';
import { PermissionPrimer } from '@mirror/ui';
import { createRuntime, type DataQuality } from './src/runtime';
import { defineUsageTask, provideRuntime, registerUsageTask } from './src/collector/background';
import { resolveAppLabels, getCachedLabel } from './src/collector/appLabels';
import type { SessionRow } from '@mirror/store';
import type { ValidationResult } from '@mirror/core-analytics';
import { getTopInvalidPackages } from '@mirror/core-analytics';

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

type DailyTotal = { app: string; label: string; totalMs: number; osMs?: number };
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
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
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
          const sess = await runtime.store.sessions({ fromMs: Date.now() - 7 * 86_400_000 });
          const filteredSess = sess.filter((s) => s.app !== 'dev.mirror.app');
          setSessions(filteredSess.slice(-50).reverse());
          const resolved = await resolveAppLabels(filteredSess.map((s) => s.app));
          setLabels(resolved);
          const map = new Map<string, number>();
          for (const s of filteredSess) map.set(s.app, (map.get(s.app) ?? 0) + s.duration_ms);
          const totals: DailyTotal[] = [...map.entries()]
            .map(([app, totalMs]) => ({ app, label: resolved[app] ?? app, totalMs }))
            .sort((a, b) => b.totalMs - a.totalMs);
          setDailyTotals(totals);
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

      const sess = await runtime.store.sessions({ fromMs: Date.now() - 7 * 86_400_000 });
      const sessFiltered = sess.filter((s) => s.app !== 'dev.mirror.app');
      let launcherPkgsForTotals: string[] = [];
      try {
        launcherPkgsForTotals = await usage.getLauncherPackages();
      } catch {}
      const launcherSetForTotals = new Set(launcherPkgsForTotals);
      const sessForTotals = sessFiltered.filter((s) => !launcherSetForTotals.has(s.app));
      setSessions(sessFiltered.slice(-50).reverse());
      const resolved = await resolveAppLabels(sessForTotals.map((s) => s.app));
      setLabels(resolved);

      const map = new Map<string, number>();
      for (const s of sessForTotals) map.set(s.app, (map.get(s.app) ?? 0) + s.duration_ms);
      const totals: DailyTotal[] = [...map.entries()]
        .map(([app, totalMs]) => ({ app, label: resolved[app] ?? app, totalMs }))
        .sort((a, b) => b.totalMs - a.totalMs);
      setDailyTotals(totals);

      try {
        const now = Date.now();
        const from = now - 7 * 86_400_000;
        const v = await runtime.validate({ fromMs: from, toMs: now });
        setValidation(v);
      } catch {}

      try {
        const now = Date.now();
        const debug = await usage.queryEventsDebug(now - 24 * 3_600_000, now);
        setDebugEvents(debug.slice(-100));
        console.log('RAW UsageEvents debug (last 24h, count):', debug.length, JSON.stringify(debug.slice(-30), null, 2));
        const honkaiPkgs = ['com.HoYoverse.hkrpgoversea', 'com.miHoYo.hkrpg', 'com.HoYoverse.StarRail'];
        const honkai = debug.filter((e) => honkaiPkgs.some((p) => e.packageName.toLowerCase().includes('hkrpg') || e.packageName.toLowerCase().includes('honkai') || e.packageName === p));
        if (honkai.length > 0) {
          setHonkaiDebug(honkai.slice(-50));
          console.log('Honkai raw events (last 24h):', JSON.stringify(honkai, null, 2));
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

      try {
        const dayFrom = dayStartMs(selectedDay);
        const dayTo = dayEndMs(selectedDay);
        const osRows = await runtime.osTotals({ fromMs: dayFrom, toMs: dayTo });
        const sessDay = await runtime.store.sessions({ fromMs: dayFrom, toMs: dayTo });
        const mirrorMap = new Map<string, number>();
        for (const s of sessDay) {
          if (s.app === 'dev.mirror.app') continue;
          mirrorMap.set(s.app, (mirrorMap.get(s.app) ?? 0) + s.duration_ms);
        }
        const osMap = new Map<string, number>();
        for (const r of osRows) osMap.set(r.packageName, r.totalMs);
        const allApps = new Set<string>([...mirrorMap.keys(), ...osMap.keys()]);
        let launcherPkgs: string[] = [];
        try {
          launcherPkgs = await usage.getLauncherPackages();
        } catch {}
        const launcherSet = new Set(launcherPkgs);
        const filteredApps = [...allApps].filter((app) => app !== 'dev.mirror.app' && !launcherSet.has(app));
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

      const q = await runtime.dataQuality({ fromMs: Date.now() - 7 * 86_400_000 });
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

  if (permission === 'checking' || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.canvas, justifyContent: 'center', alignItems: 'center', padding: theme.space(4) }}>
        <Text role="headline" theme={theme}>
          Mirror - checking usage access...
        </Text>
        <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
          {lastCollect ?? 'starting collector'}
        </Text>
      </View>
    );
  }

  if (permission === 'unavailable') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.canvas, padding: theme.space(4), gap: theme.space(3), justifyContent: 'center' }}>
        <Card theme={theme}>
          <Text role="headline" theme={theme}>
            Native module unavailable
          </Text>
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>
            MirrorUsageStats is not linked. This happens in Expo Go or a build that predates the module. Build a dev client: make mobile-android.
          </Text>
          {error ? (
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
              {error}
            </Text>
          ) : null}
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
            <Text role="label" tone="muted" theme={theme}>
              {quality.sentence}
            </Text>
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
              {`${quality.count} gaps, ${Math.round(quality.measuredGapMs / 1000)}s unmeasured`}
            </Text>
          </Card>
        ) : null}
        {dailyTotals.length > 0 ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={`Per-app totals - last 7 days`} caption="from sessions, not raw events" />
            {dailyTotals.map((t) => (
              <View key={t.app} style={{ paddingVertical: theme.space(1) }}>
                <Text role="label" theme={theme}>{`${t.label} - ${formatDuration(t.totalMs)}`}</Text>
                <Text role="micro" tone="muted" theme={theme}>{t.app}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {sessions.length > 0 ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={`Last ${sessions.length} sessions (cached)`} caption="from previous grant" />
            {sessions.map((s) => (
              <View key={s.id} style={{ paddingVertical: theme.space(2) }}>
                <Text role="label" theme={theme}>
                  {`${labels[s.app] ?? getCachedLabel(s.app)} - ${formatDuration(s.duration_ms)}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {formatTime(s.start_ms)}
                </Text>
                <Divider theme={theme} />
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.color.canvas }} contentContainerStyle={{ padding: theme.space(4), gap: theme.space(3) }}>
      <View style={{ gap: theme.space(2) }}>
        <Text role="display" theme={theme}>
          Mirror - this week on this device
        </Text>
        <Text role="label" tone="muted" theme={theme}>
          {lastCollect ?? 'collector idle'}
        </Text>
        {error ? (
          <Text role="micro" tone="muted" theme={theme}>
            {error}
          </Text>
        ) : null}
      </View>

      {keyMismatch ? (
        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title="Stored data can't be read" caption={`sealed with ${keyMismatch.oldKey}, current ${keyMismatch.newKey}`} />
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`Mirror's encrypted database was sealed with key \"${keyMismatch.oldKey}\" but the current key is \"${keyMismatch.newKey}\". This happens after reinstall, clear data, or when Android restores a backup of the database without its key (SecureStore is not backed up). Your old sessions are still on disk but unreadable with the current key.`}
          </Text>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`We will never delete your data silently. If you want to start fresh, tap Reset. This deletes all local sessions and events and keeps the new key. If you keep the data, the app will show 0 sessions until you reset.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3) }}>
            <Pill
              theme={theme}
              onPress={async () => {
                try {
                  const rt = runtimeRef.current;
                  if (rt) {
                    await rt.store.deleteAll();
                    setKeyMismatch(null);
                    setError(null);
                    setSessions([]);
                    setDailyTotals([]);
                    setLastCollect('store reset – old data deleted, new key kept');
                    await checkPermissionAndCollect();
                  }
                } catch (e: any) {
                  setError(e?.message ?? String(e));
                }
              }}
            >
              Reset stored data
            </Pill>
            <LinkButton theme={theme} onPress={() => setKeyMismatch(null)}>
              Dismiss
            </LinkButton>
          </View>
        </Card>
      ) : null}

      <Card theme={theme} elevated>
        <SectionHeader theme={theme} title="Data quality" caption="what Mirror could not measure, in one line" />
        <Text role="body" theme={theme}>
          {quality?.sentence ?? 'No gaps recorded in this window.'}
        </Text>
        {quality ? (
          <View style={{ marginTop: theme.space(2), gap: theme.space(1) }}>
            <Text role="micro" tone="muted" theme={theme}>
              {`${quality.count} gaps, by reason: ${Object.entries(quality.byReason)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ') || 'none'}, measured gap ${Math.round(quality.measuredGapMs / 1000)}s`}
            </Text>
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
              {`Invalid package = malformed packageName from OS (empty, spaces, special chars). Orphan background = bg without fg.`}
            </Text>
            {invalidTop.length > 0 ? (
              <View style={{ marginTop: theme.space(1) }}>
                <Text role="label" theme={theme}>{`Top invalid_package strings:`}</Text>
                {invalidTop.map((it) => (
                  <Text key={it.pkg} role="micro" tone="muted" theme={theme}>{`${it.pkg} - ${it.count}`}</Text>
                ))}
              </View>
            ) : null}
            {validation ? (
              <View style={{ marginTop: theme.space(2) }}>
                <Text role="label" theme={theme}>{`OS vs Mirror validation (max(10%,60s)): max diff ${validation.maxAbsPct.toFixed(1)}% / ${formatDuration(validation.maxAbsMs)}, ${validation.ok ? 'OK' : `FAIL ${validation.overThreshold.length} apps`}`}</Text>
                <Text role="micro" tone="muted" theme={theme}>{`Note: queryUsageStats may differ from Settings; Settings numbers are ground truth (Digital Wellbeing).`}</Text>
                {validation.rows.slice(0, 6).map((r) => (
                  <Text key={r.app} role="micro" tone="muted" theme={theme}>
                    {`${labels[r.app] ?? r.app}: OS ${formatDuration(r.osMs)}, Mirror ${formatDuration(r.mirrorMs)}, diff ${r.diffPct.toFixed(1)}% (${formatDuration(r.diffMs)}) ${r.status}`}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(2) }}>
              <Pill theme={theme} onPress={checkPermissionAndCollect}>
                Refresh
              </Pill>
              <LinkButton theme={theme} onPress={openSettings}>
                Open usage settings
              </LinkButton>
            </View>
          </View>
        ) : null}
      </Card>

      <Card theme={theme} elevated>
        <SectionHeader theme={theme} title={`Single-day view – ${selectedDay}`} caption={`Mirror vs OS (queryUsageStats) same day, collecting since ${collectingSince ?? 'unknown – first sync reads 1 day back'}`} />
        <Text role="micro" tone="muted" theme={theme} style={{ marginBottom: theme.space(2) }}>
          {`Pick a day to compare. OS total = queryUsageStats for that local day, Mirror total = sessions from that day. Mirror excludes launchers (HOME role via CATEGORY_HOME intent, dynamic getLauncherPackages) and itself (dev.mirror.app). First sync reads 1 day back from now, then cursor advances with overlap 2s. So collecting since shows cursor.at. Initial window = 1d, maxWindow = 2d, overlap = 2s.`}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1), marginBottom: theme.space(2) }}>
          {lastNDays(7).map((day) => (
            <Pill key={day} theme={theme} onPress={() => setSelectedDay(day)}>
              {day === selectedDay ? `● ${day}` : day}
            </Pill>
          ))}
        </View>
        {singleDayRows.length === 0 ? (
          <Text role="micro" tone="muted" theme={theme}>No data for {selectedDay} – use apps that day, then Refresh.</Text>
        ) : (
          singleDayRows.slice(0, 20).map((r) => (
            <View key={r.app} style={{ paddingVertical: theme.space(2) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text role="label" theme={theme}>{`${r.label} – Mirror ${formatDuration(r.mirrorMs)} / OS ${formatDuration(r.osMs)}`}</Text>
                  <Text role="micro" tone="muted" theme={theme}>{`${r.app} diff ${r.diffPct.toFixed(1)}% ${r.status}${r.status === 'low' ? ' (Mirror low)' : ''}`}</Text>
                </View>
              </View>
              <Divider theme={theme} />
            </View>
          ))
        )}
        <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
          {`Honkai: Star Rail under-count 16m vs OS 26m on 19 Oct, 1h31m another day; Flexibility, Brawl Stars, Chrome low – possible causes: rejected events (too_long >6h, below_minimum), orphan_background (bg without fg, e.g. killed by system, no fg close), merging gap ≤2s should increase not decrease, per-class tracking: if activity DESTROYED not seen, interval stays open then abandoned_open gap. Raw events logged below for Honkai. Check log for type 1 RESUMED / 2 PAUSED / 23 STOPPED / 24 DESTROYED – if RESUMED without matching PAUSED/STOPPED, interval stays open until next fg or screen-off, then abandoned_open and lost. Also check if Honkai uses multiple activities and we close only when last activity paused – if one activity remains resumed, interval not closed, but OS counts foreground. Also check FLUSH_TO_DISK not used to close (we removed it). Also check if Honkai fg closed by launcher (HOME) – launcher event closes previous, so Honkai counted correctly. If OS counts time while screen on but Mirror closes on SCREEN_NON_INTERACTIVE, that should match. Time lost most likely orphan_background or abandoned_open due to missing STOPPED/PAUSED.`}
        </Text>
      </Card>

      <Card theme={theme}>
        <SectionHeader theme={theme} title={`Per-app daily totals - ${dailyTotals.length} apps`} caption="today + last 7 days, from sessions, above raw timeline – excludes dev.mirror.app and launchers (HOME role)" />
        {dailyTotals.length === 0 ? (
          <Text role="micro" tone="muted" theme={theme}>No totals yet</Text>
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
        <Divider theme={theme} />
        <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
          Compare with Android Settings &gt; Digital Wellbeing for same period. Should be within max(10%,60s). Settings is ground truth.
        </Text>
      </Card>

      <Card theme={theme}>
        <SectionHeader theme={theme} title={`Sessions - last 7 days, ${sessions.length}`} caption="newest first, from this device, no overlaps, single foreground" />
        {sessions.length === 0 ? (
          <View style={{ paddingVertical: theme.space(4), alignItems: 'center' }}>
            <Text role="label" theme={theme}>
              No sessions yet - use some apps, then come back and tap Refresh.
            </Text>
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
              Mirror reads UsageStats every time you open it and on a daily background job. Single foreground enforced, launcher closes previous, gap ≤2s merged.
            </Text>
          </View>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={{ paddingVertical: theme.space(2) }}>
              <Text role="label" theme={theme}>
                {`${labels[s.app] ?? getCachedLabel(s.app)} - ${formatDuration(s.duration_ms)}`}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {`${formatTime(s.start_ms)} -> ${formatTime(s.end_ms)}`}
              </Text>
              <Divider theme={theme} />
            </View>
          ))
        )}
      </Card>

      {honkaiDebug.length > 0 ? (
        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title={`Honkai: Star Rail raw events last 24h (${honkaiDebug.length})`} caption="filtered for Honkai packages – check where time lost" />
          {honkaiDebug.map((e, idx) => (
            <View key={idx} style={{ paddingVertical: theme.space(1) }}>
              <Text role="micro" theme={theme}>{`${new Date(e.timeStamp).toLocaleTimeString()} ${e.eventType}:${e.typeName} ${e.packageName}${e.className ? ` / ${e.className.split('.').pop()}` : ''}`}</Text>
            </View>
          ))}
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`If you see RESUMED without PAUSED/STOPPED, interval stays open and may become abandoned_open (lost). If you see PAUSED/STOPPED but next fg is launcher com.mi.android.globallauncher, Honkai closed correctly. If you see gaps >2s between Honkai fg events, they merge (should increase time). If you see orphan_background, bg without fg – e.g. Honkai killed, not counted. Compare count of RESUMED vs STOPPED for Honkai: if RESUMED > STOPPED, some intervals abandoned.`}
          </Text>
        </Card>
      ) : null}

      {debugEvents.length > 0 ? (
        <Card theme={theme}>
          <SectionHeader theme={theme} title={`Debug - raw UsageEvents last 24h (${debugEvents.length})`} caption="foreground, background, stopped, destroyed, screen, keyguard" />
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginBottom: theme.space(2) }}>
            <Pill theme={theme} onPress={copyRawEvents}>
              Share raw events JSON
            </Pill>
            {copyStatus ? (
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                {copyStatus}
              </Text>
            ) : null}
          </View>
          {debugEvents.map((e, idx) => (
            <View key={idx} style={{ paddingVertical: theme.space(1) }}>
              <Text role="micro" theme={theme}>{`${new Date(e.timeStamp).toLocaleTimeString()} ${e.eventType}:${e.typeName} ${e.packageName}${e.className ? ` / ${e.className.split('.').pop()}` : ''}`}</Text>
            </View>
          ))}
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`Log shows which events are missing or rejected. Verified constants: ACTIVITY_RESUMED=1, PAUSED=2, STOPPED=23, DESTROYED=24, FLUSH_TO_DISK=25 (not implicit), SCREEN_NON_INTERACTIVE=16, KEYGUARD_SHOWN=17, DEVICE_SHUTDOWN=26, DEVICE_STARTUP=27. STOPPED must not close app whose other activity is resumed (tracked per className). DESTROYED removes a class. FLUSH_TO_DISK removed from IMPLICIT_BACKGROUND_TYPES unless real log shows only at true ends. Gap <=2s merged. device-day-raw.json is synthetic and will be replaced with real capture.`}
          </Text>
        </Card>
      ) : null}

      <Card theme={theme}>
        <SectionHeader theme={theme} title="What this build is" caption="Stage 1 - real data, no estimates" />
        <Text role="micro" tone="muted" theme={theme}>
          {[
            'Collector: UsageEvents 1/2/23/24/16/17/26, per-activity tracking via className, DESTROYED removes class, single foreground, launcher fg (HOME role via CATEGORY_HOME intent, dynamic getLauncherPackages with <queries> HOME) closes previous but excluded from totals, gap <=2s merged, 6h max, ignores only for counting, dev.mirror.app excluded',
            'Store: expo-sqlite + XChaCha20-Poly1305, tx queue+depth, open intervals with per-class map persisted in checkpoint capped at last event not sync time, split-sync property test, cursorState for collecting since',
            'Ingestion: sessions <=15m per app, 3m journey, no overlaps, per-app daily totals above timeline, single-day view with day picker, OS vs Mirror same day, collecting since line (first sync reads 1d back)',
            'Validation: Mirror vs OS queryUsageStats with max(10%,60s) tolerance, Settings is ground truth, single-day OS vs Mirror shown',
            'Debug: queryEventsDebug 24h with type number+name, package, className, timestamp, Share raw events JSON, top 10 invalid_package, Honkai raw events filtered',
            'Labels: PackageManager narrow <queries> MAIN/LAUNCHER + HOME, no QUERY_ALL_PACKAGES, readable fallback for unlabeled like com.flow.mobile -> Mobile',
            'Note: device-day-raw.json is synthetic and will be replaced with real capture, POCO launcher com.mi.android.globallauncher now dynamically excluded',
          ].join('\n')}
        </Text>
      </Card>
    </ScrollView>
  );
}
