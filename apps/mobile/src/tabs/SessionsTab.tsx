import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  Card,
  Divider,
  EmptyState,
  LinkButton,
  Pill,
  SectionHeader,
  Text,
  useTheme,
} from '@mirror/ui';
import { isLabelingExcludedApp } from '@mirror/core-analytics';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatTime, guessIntent, useMirrorApp } from '../context/MirrorAppContext';

export function SessionsTab(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    scaledSessions,
    intentLabels,
    labelSaving,
    expandedSessionId,
    setExpandedSessionId,
    labelOptIn,
    setLabelOptIn,
    saveSessionLabel,
    clearStoredLabels,
    checkPermissionAndCollect,
  } = useMirrorApp();
  const [appFilter, setAppFilter] = React.useState<string>('all');

  React.useEffect(() => {
    setAppFilter('all');
  }, [selectedDay]);

  const uniqueApps = React.useMemo(() => {
    const map = new Map<string, { app: string; label: string; count: number }>();
    for (const s of scaledSessions) {
      const existing = map.get(s.app);
      if (existing) existing.count += 1;
      else map.set(s.app, { app: s.app, label: s.label, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [scaledSessions]);

  const visibleSessions = React.useMemo(
    () => (appFilter === 'all' ? scaledSessions : scaledSessions.filter((s) => s.app === appFilter)),
    [scaledSessions, appFilter],
  );

  const longSessions = scaledSessions.filter((s) => s.duration_ms >= 5 * 60_000);
  const storedCount = Object.keys(intentLabels).length;

  return (
    <AppShell
      title="Sessions"
      subtitle={`${selectedDay} · ${scaledSessions.length} app open${scaledSessions.length === 1 ? '' : 's'}`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <DayPickerStrip />

      {uniqueApps.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: theme.space(1.5), paddingVertical: theme.space(0.5) }}>
            <Pill
              theme={theme}
              variant={appFilter === 'all' ? 'primary' : 'secondary'}
              onPress={() => setAppFilter('all')}
            >
              {`All (${scaledSessions.length})`}
            </Pill>
            {uniqueApps.map((item) => (
              <Pill
                key={item.app}
                theme={theme}
                variant={appFilter === item.app ? 'primary' : 'secondary'}
                onPress={() => setAppFilter(item.app)}
              >
                {`${item.label} (${item.count})`}
              </Pill>
            ))}
          </View>
        </ScrollView>
      ) : null}

      <Card theme={theme}>
        <SectionHeader
          theme={theme}
          title={`App opens – ${selectedDay}, ${visibleSessions.length}`}
          caption="open times only, tap a session to label (optional)"
        />
        <View
          style={{
            backgroundColor: theme.color.card,
            padding: theme.space(2),
            borderRadius: theme.radius.sm,
            marginBottom: theme.space(2),
          }}
        >
          <Text role="label" theme={theme}>
            Open times only – durations not shown. Daily totals on Home are authoritative from OS.
          </Text>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
            {
              'Labeling is optional feedback – only your explicit labels feed Deliberate share (needs 5, never guessed). Duration alone does not indicate intent, so hints never count. System and utility apps are skipped. Tap an open to label.'
            }
          </Text>
        </View>

        {storedCount > 0 ? (
          <View
            style={{
              backgroundColor: theme.color.card,
              padding: theme.space(2),
              borderRadius: theme.radius.sm,
              marginBottom: theme.space(2),
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: theme.space(2),
            }}
          >
            <Text role="micro" tone="muted" theme={theme} style={{ flex: 1 }}>
              {`Stored manual labels across all days: ${storedCount}. Clearing removes only manual labels, never usage history.`}
            </Text>
            <LinkButton theme={theme} onPress={clearStoredLabels}>
              Clear stored labels
            </LinkButton>
          </View>
        ) : null}

        {longSessions.length >= 2 && storedCount === 0 && !labelOptIn ? (
          <View
            style={{
              backgroundColor: theme.color.card,
              padding: theme.space(3),
              borderRadius: theme.radius.sm,
              marginBottom: theme.space(3),
              gap: theme.space(2),
            }}
          >
            <Text role="label" theme={theme}>
              Help improve Deliberate share? (optional)
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              {`You had ${longSessions.length} longer sessions today. Labeling a few as intentional or mindless helps measure Deliberate share (needs 5). Stays on device, optional – tap an open below to label, or dismiss.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
              <LinkButton theme={theme} onPress={() => setLabelOptIn(true)}>
                Dismiss
              </LinkButton>
            </View>
          </View>
        ) : null}

        {visibleSessions.length === 0 ? (
          <EmptyState
            title={`No opens for ${selectedDay}`}
            body="App open times appear here as soon as Android records foreground usage events on this day. Per-app totals on Home come from the OS aggregate."
            theme={theme}
          />
        ) : (
          visibleSessions.map((s) => {
            const isExcluded = isLabelingExcludedApp(s.app, s.label);
            const currentLabel = isExcluded ? undefined : intentLabels[s.id];
            const isExpanded = expandedSessionId === s.id;
            const hintInfo = guessIntent(s.duration_ms, s.app);
            const showHint = !isExcluded;
            return (
              <View key={s.id} style={{ paddingVertical: theme.space(2), gap: theme.space(1) }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${s.label} opened at ${formatTime(s.start_ms)}${currentLabel ? `, labeled ${currentLabel}` : ''}`}
                  style={{ minHeight: theme.size.touchTarget, justifyContent: 'center' }}
                  onPress={() => {
                    if (isExcluded) return;
                    setExpandedSessionId(isExpanded ? null : s.id);
                    if (!isExpanded && !labelOptIn) setLabelOptIn(true);
                  }}
                >
                  <View style={{ gap: theme.space(1) }}>
                    <Text role="label" theme={theme}>{`${s.label} opened at ${formatTime(s.start_ms)}`}</Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${s.app}${currentLabel ? ` • you: ${currentLabel} (explicit, counts)` : ''}${isExcluded ? ' • labeling skipped (system/utility)' : ''}`}
                    </Text>
                    {showHint ? (
                      <Text role="micro" tone="muted" theme={theme}>
                        {`Hint (not counted, duration doesn't indicate intent): ${hintInfo.hint}`}
                      </Text>
                    ) : null}
                    {currentLabel ? (
                      <Text role="micro" tone="muted" theme={theme}>
                        {`You labeled: ${currentLabel} – only explicit labels feed Deliberate share. Tap to change.`}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
                {isExpanded && !isExcluded ? (
                  <View
                    style={{
                      gap: theme.space(2),
                      marginTop: theme.space(2),
                      backgroundColor: theme.color.card,
                      padding: theme.space(2),
                      borderRadius: theme.radius.sm,
                    }}
                  >
                    <Text role="micro" tone="muted" theme={theme}>
                      {
                        'Optional feedback – stays on device. Only your explicit labels feed Deliberate share (needs 5). Duration alone does not indicate intent – this hint never counts.'
                      }
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`Hint (not counted): ${hintInfo.hint}`}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
                      {(['intentional', 'mindless', 'unsure'] as const).map((lbl) => (
                        <Pill
                          key={lbl}
                          theme={theme}
                          variant={lbl === currentLabel ? 'primary' : 'secondary'}
                          onPress={() => saveSessionLabel(s.id, lbl)}
                        >
                          {`${lbl === currentLabel ? `✓ ${lbl}` : lbl}${labelSaving === s.id ? '…' : ''}`}
                        </Pill>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
                      <LinkButton theme={theme} onPress={() => setExpandedSessionId(null)}>
                        Collapse
                      </LinkButton>
                      {currentLabel ? (
                        <LinkButton theme={theme} onPress={() => saveSessionLabel(s.id, 'unsure')}>
                          Clear to unsure
                        </LinkButton>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                <Divider theme={theme} />
              </View>
            );
          })
        )}
      </Card>
    </AppShell>
  );
}
