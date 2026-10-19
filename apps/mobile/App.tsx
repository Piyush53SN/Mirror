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

export default function App(): React.ReactElement {
  const theme = React.useMemo(() => createTheme('dark'), []);
  const [permission, setPermission] = React.useState<PermissionState>('checking');
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [quality, setQuality] = React.useState<DataQuality | null>(null);
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
        } catch {}
        return;
      }

      setPermission('granted');
      try {
        await registerUsageTask();
      } catch {
        // background task may be restricted on some OEMs — non-fatal
      }

      const collectResult = await runtime.collectNow();
      if (collectResult.status === 'collected') {
        setLastCollect(`collect: collected ${collectResult.events} events, ${collectResult.inserted} inserted, ${collectResult.gaps.length} gaps`);
      } else {
        setLastCollect(`collect: ${collectResult.status}`);
      }

      await runtime.ingestRecent();

      const sess = await runtime.store.sessions({ fromMs: Date.now() - 7 * 86_400_000 });
      setSessions(sess.slice(-50).reverse());
      try {
        const resolved = await resolveAppLabels(sess.map((s) => s.app));
        setLabels(resolved);
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
        <SectionHeader theme={theme} title={`Sessions - last 7 days, ${sessions.length}`} caption="newest first, from this device" />
        {sessions.length === 0 ? (
          <View style={{ paddingVertical: theme.space(4), alignItems: 'center' }}>
            <Text role="label" theme={theme}>
              No sessions yet - use some apps, then come back and tap Refresh.
            </Text>
            <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
              Mirror reads UsageStats every time you open it and on a daily background job. An unclosed interval is dropped, not guessed.
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

      <Card theme={theme}>
        <SectionHeader theme={theme} title="What this build is" caption="Stage 1 - real data, no estimates" />
        <Text role="micro" tone="muted" theme={theme}>
          {[
            'Collector: UsageEvents -> app_foreground / app_background, closes on screen-off (16) / keyguard (17) / shutdown (26), 6h max interval >6h counted as gap, ignores launchers including MIUI + permissioncontroller',
            'Store: expo-sqlite + per-record XChaCha20-Poly1305, key in SecureStore, fixed transaction re-entrancy (queue + depth)',
            'Ingestion: sessions merged <=15m gap per app (spec), 3m cross-app link for journeys, today ingested as partial (sessions shown, rollup not), daily rollups for complete local days only',
            'Labels: PackageManager with narrow <queries> MAIN/LAUNCHER intent, no QUERY_ALL_PACKAGES, gate still passes',
            'Gate: merged-manifest audited (PACKAGE_USAGE_STATS present, nothing forbidden, DYNAMIC_RECEIVER allowlisted)',
            'Background: WorkManager daily job (24h min interval), survives reboot without RECEIVE_BOOT_COMPLETED',
          ].join('\\n')}
        </Text>
      </Card>
    </ScrollView>
  );
}
