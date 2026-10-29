import * as React from 'react';
import { View } from 'react-native';
import { isLabelingExcludedApp } from '@mirror/core-analytics';
import {
  Card,
  Chip,
  ConfidenceChip,
  Divider,
  EmptyState,
  Meter,
  Pill,
  SectionHeader,
  Stat,
  Surface,
  Text,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

export function SessionsTab(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    lastSyncedAt,
    scaledSessions,
    sittingSpanMs,
    dailyTotals,
    hasEventsWithoutSittings,
    labels,
    intentLabels,
    expandedSessionId,
    setExpandedSessionId,
    saveSessionLabel,
    checkPermissionAndCollect,
  } = useMirrorApp();

  const explicitLabelStats = React.useMemo(() => {
    let intentional = 0;
    let mindless = 0;
    let unsure = 0;
    for (const row of scaledSessions) {
      if (isLabelingExcludedApp(row.app)) continue;
      const lbl = intentLabels[row.id];
      if (lbl === 'intentional') intentional += 1;
      else if (lbl === 'mindless') mindless += 1;
      else if (lbl === 'unsure') unsure += 1;
    }
    const totalExplicit = intentional + mindless;
    return { intentional, mindless, unsure, totalExplicit };
  }, [scaledSessions, intentLabels]);

  const labelTargetRatio = Math.min(1, explicitLabelStats.totalExplicit / 5);
  const isEmptyDay =
    scaledSessions.length === 0 && !hasEventsWithoutSittings && dailyTotals.length === 0;

  return (
    <AppShell
      title="Sessions"
      subtitle={`Open times & explicit intent labels (${selectedDay}${lastSyncedAt ? ` · synced ${lastSyncedAt}` : ''})`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <DayPickerStrip />

      {isEmptyDay ? (
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
          <EmptyState
            title="Coming with more data"
            body={`No app opens are recorded for ${selectedDay} yet. Chronological open times and optional intent labels appear here automatically once app activity is collected for this day.`}
            action={
              <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
                Refresh
              </Pill>
            }
            theme={theme}
          />
        </Surface>
      ) : (
        <>
          {/* Hero summary of sittings & explicit label progress */}
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
                  CHRONOLOGICAL LOG · EXPLICIT LABELS
                </Text>
                <Text role="title-lg" theme={theme}>
                  {`${scaledSessions.length} ${scaledSessions.length === 1 ? 'sitting' : 'sittings'} on ${selectedDay}`}
                </Text>
                <Text role="label" tone="muted" theme={theme}>
                  Tap any non-system sitting to label Intentional, Mindless, or Not sure
                </Text>
              </View>
              <TierBadge tier="D" theme={theme} />
            </View>

            <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip static label="Hints never count" theme={theme} />
              <ConfidenceChip tiers={['D']} label="User labels only" theme={theme} />
            </View>

            <View
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.card,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                padding: theme.space(3),
                gap: theme.space(2),
              }}
            >
              <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <Stat
                    value={`${explicitLabelStats.totalExplicit} / 5`}
                    label="Explicit labels today"
                    hint={`${explicitLabelStats.intentional} intentional · ${explicitLabelStats.mindless} mindless${explicitLabelStats.unsure > 0 ? ` · ${explicitLabelStats.unsure} unsure` : ''}`}
                    theme={theme}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <Stat
                    value={scaledSessions.length > 0 ? formatDuration(sittingSpanMs) : '0s'}
                    label="Sitting spans"
                    hint="Merges ≤15m reopens"
                    theme={theme}
                  />
                </View>
              </View>
              <Divider theme={theme} />
              <Meter
                theme={theme}
                value={labelTargetRatio}
                label="Deliberate share threshold"
                caption={
                  explicitLabelStats.totalExplicit >= 5
                    ? 'Unlocked (≥5 explicit labels)'
                    : `${5 - explicitLabelStats.totalExplicit} more to unlock`
                }
                tone={explicitLabelStats.totalExplicit >= 5 ? 'anchor' : 'muted'}
              />
            </View>
          </Surface>

          {/* Chronological sitting list */}
          <Card theme={theme} style={{ marginBottom: 0 }}>
            <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
              <Text role="micro" tone="muted" theme={theme}>
                {`OPEN TIMES · ${selectedDay}`}
              </Text>
              <SectionHeader
                theme={theme}
                title={`Sittings (${scaledSessions.length})`}
                caption="duration hints never count toward score — only your explicit labels do"
              />
            </View>
            {scaledSessions.length === 0 ? (
              hasEventsWithoutSittings ? (
                <EmptyState
                  title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
                  body={`${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'} recorded foreground time on Home for ${selectedDay}, while derived sittings are empty. Tap Refresh to rebuild sittings from stored events.`}
                  action={
                    <Pill theme={theme} onPress={checkPermissionAndCollect}>
                      Refresh sittings
                    </Pill>
                  }
                  theme={theme}
                />
              ) : (
                <EmptyState
                  title="Coming with more data"
                  body="Open an app or two, then tap Refresh. Mirror builds sittings from your phone's foreground usage events."
                  theme={theme}
                />
              )
            ) : (
              <View style={{ gap: theme.space(2) }}>
                {scaledSessions.map((s) => {
                  const utilityExcluded = isLabelingExcludedApp(s.app);
                  const explicitLabel = intentLabels[s.id];
                  const isExpanded = expandedSessionId === s.id;
                  const displayMs = s.scaled_duration_ms > 0 ? s.scaled_duration_ms : s.duration_ms;
                  const hintLabel = s.duration_ms >= 5 * 60_000 ? 'long sitting (≥5m)' : 'brief sitting (<5m)';
                  const startClock = new Date(s.start_ms).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const endClock = new Date(s.end_ms).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const appName = s.label || labels[s.app] || s.app;
                  return (
                    <View
                      key={s.id}
                      style={{
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.color.card,
                        borderWidth: 1,
                        borderColor: isExpanded ? theme.color.anchor : theme.color.borderCard,
                        padding: theme.space(2.5),
                        gap: theme.space(1.5),
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: theme.space(2),
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text role="label" theme={theme}>
                            {appName}
                          </Text>
                          <Text role="micro" tone="muted" theme={theme}>
                            {`${startClock}–${endClock} · ${
                              utilityExcluded
                                ? 'labeling skipped (system/utility)'
                                : explicitLabel
                                  ? `user label: ${explicitLabel}`
                                  : `unlabeled · hint: ${hintLabel}`
                            }`}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: theme.space(1) }}>
                          <Text role="label" theme={theme}>
                            {formatDuration(displayMs)}
                          </Text>
                          {!utilityExcluded ? (
                            <Pill
                              theme={theme}
                              variant={explicitLabel ? 'primary' : 'secondary'}
                              accessibilityLabel={
                                explicitLabel
                                  ? `${appName} at ${startClock}, labeled ${explicitLabel}. Activate to edit label`
                                  : `Label ${appName} sitting at ${startClock}`
                              }
                              onPress={() => setExpandedSessionId(isExpanded ? null : s.id)}
                            >
                              {explicitLabel ? explicitLabel : 'Label'}
                            </Pill>
                          ) : null}
                        </View>
                      </View>
                      {isExpanded && !utilityExcluded ? (
                        <View style={{ gap: theme.space(1.5), paddingTop: theme.space(1) }}>
                          <Divider theme={theme} />
                          <Text role="micro" tone="muted" theme={theme}>
                            Was this sitting intentional or mindless? (Unsure stays excluded from deliberate share.)
                          </Text>
                          <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                            <Pill
                              theme={theme}
                              variant={explicitLabel === 'intentional' ? 'primary' : 'secondary'}
                              accessibilityLabel={
                                explicitLabel === 'intentional' ? 'Intentional, selected' : 'Intentional'
                              }
                              onPress={() => saveSessionLabel(s.id, 'intentional')}
                            >
                              Intentional
                            </Pill>
                            <Pill
                              theme={theme}
                              variant={explicitLabel === 'mindless' ? 'primary' : 'secondary'}
                              accessibilityLabel={
                                explicitLabel === 'mindless' ? 'Mindless, selected' : 'Mindless'
                              }
                              onPress={() => saveSessionLabel(s.id, 'mindless')}
                            >
                              Mindless
                            </Pill>
                            <Pill
                              theme={theme}
                              variant={explicitLabel === 'unsure' ? 'primary' : 'secondary'}
                              accessibilityLabel={
                                explicitLabel === 'unsure' ? 'Not sure, selected' : 'Not sure'
                              }
                              onPress={() => saveSessionLabel(s.id, 'unsure')}
                            >
                              Not sure
                            </Pill>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
