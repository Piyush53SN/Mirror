import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  ConfidenceChip,
  Divider,
  EmptyState,
  LinkButton,
  Meter,
  Pill,
  SectionHeader,
  Stat,
  Surface,
  Text,
  TierBadge,
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
    dailyTotals,
    hasEventsWithoutSittings,
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

  const dayDecisiveCount = React.useMemo(() => {
    let count = 0;
    for (const s of scaledSessions) {
      if (isLabelingExcludedApp(s.app, s.label)) continue;
      const lbl = intentLabels[s.id];
      if (lbl === 'intentional' || lbl === 'mindless') count += 1;
    }
    return count;
  }, [scaledSessions, intentLabels]);

  const longSessions = scaledSessions.filter((s) => s.duration_ms >= 5 * 60_000);
  const storedCount = Object.keys(intentLabels).length;

  return (
    <AppShell
      title="Sessions"
      subtitle={`${selectedDay} · ${scaledSessions.length} sitting${scaledSessions.length === 1 ? '' : 's'}`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <DayPickerStrip />

      {/* Frosted glass per-app filter strip */}
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

      {/* Frosted Horizon Hero — Chronological log standing & explicit labeling threshold */}
      <Surface
        radius="hero"
        theme={theme}
        style={{
          padding: theme.space(4),
          borderWidth: 1,
          borderColor: theme.color.borderHairline,
          gap: theme.space(3),
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2) }}>
          <View style={{ flex: 1, gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              CHRONOLOGICAL LOG · TIER D
            </Text>
            <Text role="title-lg" theme={theme}>
              {`App opens · ${selectedDay}`}
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              Open times only — tap any sitting below to record optional intent
            </Text>
          </View>
          <TierBadge tier="D" theme={theme} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip static label="Open times only" theme={theme} />
          <Chip static label="Hints never count" theme={theme} />
          <ConfidenceChip tiers={['D']} label="Explicit labels stay on device" theme={theme} />
        </View>

        <View
          style={{
            borderRadius: theme.radius.md,
            backgroundColor: theme.glass.card.fill,
            borderWidth: 1,
            borderColor: theme.color.borderCard,
            padding: theme.space(3),
            gap: theme.space(2),
          }}
        >
          <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Stat
                value={String(visibleSessions.length)}
                label={visibleSessions.length === 1 ? 'Sitting shown' : 'Sittings shown'}
                hint={appFilter === 'all' ? 'Matches Home & Insights' : 'Filtered by app'}
                theme={theme}
              />
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Stat
                value={`${dayDecisiveCount} / 5`}
                label="Decisive labels today"
                hint={dayDecisiveCount >= 5 ? 'Deliberate share active' : 'Needs 5 to measure'}
                theme={theme}
              />
            </View>
          </View>
          <Divider theme={theme} />
          <Meter
            theme={theme}
            value={Math.min(1, dayDecisiveCount / 5)}
            label="Deliberate share threshold"
            caption={`${dayDecisiveCount} of 5 explicit`}
            tone={dayDecisiveCount >= 5 ? 'anchor' : 'muted'}
          />
        </View>

        <Callout theme={theme} tone="neutral">
          {
            'Daily foreground totals on Home sum day-clipped OS usage events (or show Stored / Approximate on older days beyond Android’s UsageEvents buffer). Labeling is optional feedback — only your explicit intentional or mindless labels feed Deliberate share (never guessed). Duration alone does not indicate intent, so hints never count.'
          }
        </Callout>

        {storedCount > 0 ? (
          <View
            style={{
              borderRadius: theme.radius.md,
              backgroundColor: theme.glass.card.fill,
              borderWidth: 1,
              borderColor: theme.color.borderCard,
              padding: theme.space(2.5),
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: theme.space(2),
            }}
          >
            <Text role="micro" tone="muted" theme={theme} style={{ flex: 1, flexShrink: 1, minWidth: 160 }}>
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
              borderRadius: theme.radius.md,
              backgroundColor: theme.glass.card.fill,
              borderWidth: 1,
              borderColor: theme.color.borderCard,
              padding: theme.space(3),
              gap: theme.space(1.5),
            }}
          >
            <Text role="label" theme={theme}>
              Help improve Deliberate share? (optional)
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              {`You had ${longSessions.length} longer sittings today. Labeling 5 or more sittings as intentional or mindless unlocks Deliberate share on Home and Insights. Tap any sitting below to label, or dismiss.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
              <LinkButton theme={theme} onPress={() => setLabelOptIn(true)}>
                Dismiss
              </LinkButton>
            </View>
          </View>
        ) : null}
      </Surface>

      {/* Frosted Glass Card — Chronological sitting list & expandable explicit-intent tray */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <SectionHeader
          theme={theme}
          title={`Recorded sittings (${visibleSessions.length})`}
          caption="system and utility apps skip labeling automatically"
        />

        {visibleSessions.length === 0 ? (
          hasEventsWithoutSittings ? (
            <EmptyState
              title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
              body={`${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'} recorded foreground time on ${selectedDay}, while derived sittings are empty. Tap Refresh to rebuild sittings from stored events.`}
              action={
                <Pill theme={theme} onPress={checkPermissionAndCollect}>
                  Refresh sittings
                </Pill>
              }
              theme={theme}
            />
          ) : (
            <EmptyState
              title={`No opens for ${selectedDay}`}
              body="App open times appear here as soon as Android records foreground usage events on this day. Per-app totals on Home sum day-clipped OS foreground events (or Stored / Approximate fallback on older days)."
              theme={theme}
            />
          )
        ) : (
          <View style={{ gap: theme.space(1) }}>
            {visibleSessions.map((s, idx) => {
              const isExcluded = isLabelingExcludedApp(s.app, s.label);
              const currentLabel = isExcluded ? undefined : intentLabels[s.id];
              const isExpanded = expandedSessionId === s.id;
              const hintInfo = guessIntent(s.duration_ms, s.app);
              const showHint = !isExcluded;
              const statusChipLabel = currentLabel
                ? `You: ${currentLabel}`
                : isExcluded
                  ? 'System skipped'
                  : 'Optional label';
              return (
                <View key={s.id} style={{ paddingVertical: theme.space(2), gap: theme.space(1.5) }}>
                  {idx > 0 ? <Divider theme={theme} /> : null}
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
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          gap: theme.space(2),
                        }}
                      >
                        <Text role="label" theme={theme} style={{ flex: 1, flexShrink: 1, minWidth: 150 }}>
                          {`${s.label} · ${formatTime(s.start_ms)}`}
                        </Text>
                        <Chip static label={statusChipLabel} theme={theme} />
                      </View>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${s.app}${currentLabel ? ` • explicit (${currentLabel})` : ''}${isExcluded ? ' • labeling skipped (system/utility)' : ''}`}
                      </Text>
                      {showHint ? (
                        <Text role="micro" tone="muted" theme={theme}>
                          {`Hint (not counted, duration doesn't indicate intent): ${hintInfo.hint}`}
                        </Text>
                      ) : null}
                      {currentLabel ? (
                        <Text role="micro" tone="muted" theme={theme}>
                          {`You labeled: ${currentLabel} — only explicit labels feed Deliberate share. Tap to change.`}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>

                  {isExpanded && !isExcluded ? (
                    <View
                      style={{
                        gap: theme.space(2),
                        marginTop: theme.space(1),
                        backgroundColor: theme.glass.card.fill,
                        borderWidth: 1,
                        borderColor: theme.color.borderCard,
                        padding: theme.space(3),
                        borderRadius: theme.radius.md,
                      }}
                    >
                      <Text role="micro" tone="muted" theme={theme}>
                        {
                          'Optional feedback — stays on device. Only your explicit labels feed Deliberate share (needs 5). Duration alone does not indicate intent — this hint never counts.'
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
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </AppShell>
  );
}
