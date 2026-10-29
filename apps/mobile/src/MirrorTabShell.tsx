import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { Card, PermissionPrimer, Text, useTheme } from '@mirror/ui';
import { DebugView } from './components/DebugView';
import { useSafeInsets } from './components/useSafeInsets';
import { useMirrorApp } from './context/MirrorAppContext';
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
    permissionDismissed = false,
    dismissPermissionPrimer,
    insets: contextInsets,
    loading,
    lastCollect,
    error,
    openSettings,
    dailyTotals,
    scaledSessions,
    storeDayRowCounts = [],
    showDebug,
  } = useMirrorApp();
  const [localDismissed, setLocalDismissed] = React.useState(false);
  const insets = useSafeInsets(contextInsets);

  const hasStoredHistory =
    storeDayRowCounts.length > 0 || dailyTotals.length > 0 || scaledSessions.length > 0;
  const primerDismissed = permissionDismissed || localDismissed;

  if (permission === 'checking' || loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.canvas,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: insets.top + theme.space(4),
          paddingBottom: insets.bottom + theme.space(4),
          paddingHorizontal: theme.space(4),
        }}
      >
        <Text role="headline" theme={theme}>
          Mirror — checking usage access…
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
          paddingTop: insets.top + theme.space(4),
          paddingBottom: insets.bottom + theme.space(4),
          paddingHorizontal: theme.space(4),
          gap: theme.space(3),
          justifyContent: 'center',
        }}
      >
        <Card theme={theme}>
          <Text role="headline" theme={theme}>
            Native module unavailable
          </Text>
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>
            MirrorUsageStats is not linked. This happens in Expo Go or a build that predates the module. Build a dev client with make mobile-android.
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

  if (permission === 'denied' && !primerDismissed && !hasStoredHistory) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.color.canvas }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.space(2),
          paddingBottom: insets.bottom + theme.space(6),
          paddingHorizontal: theme.space(4),
          gap: theme.space(3),
          flexGrow: 1,
        }}
      >
        <PermissionPrimer
          theme={theme}
          ask={{
            systemName: 'Usage access · Settings → Apps → Special access → Usage access → Mirror',
            sees: 'How long you use each app and when you open them — foreground time, launches, and timestamps.',
            cannotSee: 'What is inside those apps. No content, no messages, no notifications. Mirror never reads them.',
            settingsPath: 'Android settings → Special access → Usage access',
          }}
          onAllow={openSettings}
          onDeny={() => {
            setLocalDismissed(true);
            dismissPermissionPrimer?.();
          }}
        />
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
