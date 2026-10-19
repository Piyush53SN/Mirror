import * as React from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { createTheme } from '@mirror/ui';
import { Card, SectionHeader, Text, Divider } from '@mirror/ui';
import { Pill, LinkButton } from '@mirror/ui';
import { PermissionPrimer } from '@mirror/ui';
import { createRuntime, type DataQuality } from './src/runtime';
import { defineUsageTask, provideRuntime, registerUsageTask } from './src/collector/background';
import { resolveAppLabels, getCachedLabel } from './src/collector/appLabels';
import type { SessionRow } from '@mirror/store';
import type { ValidationResult } from '@mirror/core-analytics';

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

export default function App(): React.ReactElement {
  const theme = React.useMemo(() => createTheme('dark'), []);
  const [permission, setPermission] = React.useState<PermissionState>('checking');
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [dailyTotals, setDailyTotals] = React.useState<DailyTotal[]>([]);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [quality, setQuality] = React.useState<DataQuality | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [debugEvents, setDebugEvents] = React.useState<{ packageName: string; typeName: string; timeStamp: number; className?: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastCollect, setLastCollect] = React.useState<string | null>(null);

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
          setSessions(sess.slice(-50).reverse());
          const resolved = await resolveAppLabels(sess.map((s) => s.app));
          setLabels(resolved);
          // daily totals
          const map = new Map<string, number>();
          for (const s of sess) map.set(s.app, (map.get(s.app) ?? 0) + s.duration_ms);
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
        setLastCollect(`collect: collected ${collectResult.events} events, ${collectResult.inserted} inserted, ${collectResult.gaps.length} gaps (${Object.entries(collectResult.gaps.reduce((acc: any, g: any) => { acc[g.reason] = (acc[g.reason] ?? 0) + g.count; return acc; }, {})).map(([k, v]) => `${k}:${v}`).join(', ')})`);
      } else {
        setLastCollect(`collect: ${collectResult.status}`);
      }

      await runtime.ingestRecent();

      const sess = await runtime.store.sessions({ fromMs: Date.now() - 7 * 86_400_000 });
      setSessions(sess.slice(-50).reverse());
      const resolved = await resolveAppLabels(sess.map((s) => s.app));
      setLabels(resolved);

      // per-app daily totals
      const map = new Map<string, number>();
      for (const s of sess) map.set(s.app, (map.get(s.app) ?? 0) + s.duration_ms);
      const totals: DailyTotal[] = [...map.entries()]
        .map(([app, totalMs]) => ({ app, label: resolved[app] ?? app, totalMs }))
        .sort((a, b) => b.totalMs - a.totalMs);
      setDailyTotals(totals);

      // OS validation
      try {
        const now = Date.now();
        const from = now - 7 * 86_400_000;
        const v = await runtime.validate({ fromMs: from, toMs: now });
        setValidation(v);
      } catch {}

      // Debug: raw UsageEvents types for last hour, one real session
      try {
        const now = Date.now();
        const debug = await usage.queryEventsDebug(now - 3_600_000, now);
        // Take last 30 events for display
        setDebugEvents(debug.slice(-30));
        console.log('RAW UsageEvents debug (last hour, up to 30):', JSON.stringify(debug.slice(-30), null, 2));
      } catch {}

      const q = await runtime.dataQuality({ fromMs: Date.now() - 7 * 86_400_000 });
      setQuality(q);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setLoading(false);
    }
  }, []);

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
              {`Invalid package (89 seen) = empty or malformed packageName from OS (e.g. "" or single-char). Orphan background (37 seen) = background without foreground – happens when foreground was in launcher/resolver which now closes previous app but was previously ignored, or when event window missed the start.`}
            </Text>
            {validation ? (
              <View style={{ marginTop: theme.space(2) }}>
                <Text role="label" theme={theme}>{`OS vs Mirror validation: max diff ${validation.maxAbsPct.toFixed(1)}%, ${validation.ok ? 'OK <10%' : `FAIL ${validation.overThreshold.length} apps >10%`}`}</Text>
                {validation.rows.slice(0, 6).map((r) => (
                  <Text key={r.app} role="micro" tone="muted" theme={theme}>
                    {`${labels[r.app] ?? r.app}: OS ${formatDuration(r.osMs)}, Mirror ${formatDuration(r.mirrorMs)}, diff ${r.diffPct.toFixed(1)}% ${r.status}`}
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

      <Card theme={theme}>
        <SectionHeader theme={theme} title={`Per-app daily totals - ${dailyTotals.length} apps`} caption="today + last 7 days, from sessions, above raw timeline" />
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
          Compare with Android Settings > Digital Wellbeing for same period. If Mirror shows 2x, intervals stayed open (now fixed by single-foreground + launcher closer).
        </Text>
      </Card>

      <Card theme={theme}>
        <SectionHeader theme={theme} title={`Sessions - last 7 days, ${sessions.length}`} caption="newest first, from this device, no overlaps" />
        {sessions.length === 0 ? (
          <View style={{ paddingVertical: theme.space(4), alignItems: 'center' }}>
            <Text role="label" theme={theme}>
              No sessions yet - use some apps, then come back and tap Refresh.
            </Text>
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
              Mirror reads UsageStats every time you open it and on a daily background job. An unclosed interval is dropped, not guessed. Single foreground enforced.
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

      {debugEvents.length > 0 ? (
        <Card theme={theme}>
          <SectionHeader theme={theme} title={`Debug - raw UsageEvents last hour (${debugEvents.length})`} caption="foreground, background, stopped, screen, keyguard" />
          {debugEvents.map((e, idx) => (
            <View key={idx} style={{ paddingVertical: theme.space(1) }}>
              <Text role="micro" theme={theme}>{`${new Date(e.timeStamp).toLocaleTimeString()} ${e.typeName} ${e.packageName}${e.className ? ` / ${e.className.split('.').pop()}` : ''}`}</Text>
            </View>
          ))}
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            Log shows which events are missing or rejected. Example real session: MOVE_TO_FOREGROUND / ACTIVITY_RESUMED opens, ACTIVITY_PAUSED / STOPPED / MOVE_TO_BACKGROUND closes, SCREEN_NON_INTERACTIVE / KEYGUARD_SHOWN closes all, launcher fg closes previous.
          </Text>
        </Card>
      ) : null}

      <Card theme={theme}>
        <SectionHeader theme={theme} title="What this build is" caption="Stage 1 - real data, no estimates" />
        <Text role="micro" tone="muted" theme={theme}>
          {[
            'Collector: UsageEvents 1/2/23/24/25, closes on screen-off 16 / keyguard 17 / shutdown 26 / launcher fg, single foreground enforced, 6h max >6h gap, ignores launchers only for counting',
            'Store: expo-sqlite + XChaCha20-Poly1305, fixed tx re-entrancy',
            'Ingestion: sessions merged <=15m per app, 3m cross-app journey, today partial, no overlaps',
            'Validation: compare Mirror totals vs OS queryUsageStats, show diff in data-quality card, fails test >10% on fixture',
            'Labels: PackageManager narrow <queries> MAIN/LAUNCHER, no QUERY_ALL_PACKAGES',
            'Gate: merged-manifest audited',
            'Background: WorkManager daily',
          ].join('\n')}
        </Text>
      </Card>
    </ScrollView>
  );
}
