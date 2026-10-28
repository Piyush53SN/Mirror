import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { Card, PermissionPrimer, SectionHeader, Text, useTheme } from '@mirror/ui';
import { DebugView } from './components/DebugView';
import { formatDuration, useMirrorApp } from './context/MirrorAppContext';
import { HomeTab } from './tabs/HomeTab';
import { InsightsTab } from './tabs/InsightsTab';
import { JourneyTab } from './tabs/JourneyTab';
import { SessionsTab } from './tabs/SessionsTab';
import { YouTab } from './tabs/YouTab';

export function MirrorTabShell(): React.ReactElement {
  const theme = useTheme();
  const {
    activeTab,
    permission,
    setPermission,
    loading,
    lastCollect,
    error,
    openSettings,
    quality,
    dailyTotals,
    dailyTotalsSource,
    selectedDay,
    showDebug,
  } = useMirrorApp();

  if (permission === 'checking' || loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.canvas,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.space(4),
        }}
      >
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
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.canvas,
          padding: theme.space(4),
          gap: theme.space(3),
          justifyContent: 'center',
        }}
      >
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
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.color.canvas }}
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(3) }}
      >
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
          </Card>
        ) : null}
        {dailyTotals.length > 0 ? (
          <Card theme={theme}>
            <SectionHeader
              theme={theme}
              title={
                dailyTotalsSource === 'stored_events'
                  ? `Per-app totals - ${selectedDay} (Stored)`
                  : dailyTotalsSource === 'os_bucket_approx'
                    ? `Per-app totals - ${selectedDay} (Approximate)`
                    : `Per-app totals - ${selectedDay} (OS)`
              }
              caption={
                dailyTotalsSource === 'stored_events'
                  ? 'stored day-clipped foreground events in Mirror (OS UsageEvents rolled off)'
                  : dailyTotalsSource === 'os_bucket_approx'
                    ? 'approximate OS daily buckets (UsageEvents unavailable)'
                    : 'day-clipped OS foreground events, matches Digital Wellbeing'
              }
            />
            {dailyTotals.map((t) => (
              <View key={t.app} style={{ paddingVertical: theme.space(1) }}>
                <Text role="label" theme={theme}>{`${t.label} - ${formatDuration(t.totalMs)}`}</Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {t.app}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  if (showDebug) {
    return <DebugView />;
  }

  switch (activeTab) {
    case 'home':
      return <HomeTab />;
    case 'insights':
      return <InsightsTab />;
    case 'journey':
      return <JourneyTab />;
    case 'sessions':
      return <SessionsTab />;
    case 'you':
      return <YouTab />;
    default:
      return <HomeTab />;
  }
}
