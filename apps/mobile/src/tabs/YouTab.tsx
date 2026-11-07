import * as React from 'react';
import { Pressable, View } from 'react-native';
import {
  Callout,
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
  TIERS,
  Text,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import { BOUNDARY_GUARD_SHORT, BUILD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

const ALL_TIERS = [TIERS.A, TIERS.B, TIERS.C, TIERS.D] as const;

export function YouTab(): React.ReactElement {
  const theme = useTheme();
  const {
    focusWindows,
    quality,
    p3Reliable,
    orphanCount,
    totalGaps,
    latestSyncOrphans,
    handleBuildTap,
    checkPermissionAndCollect,
    setShowSettings,
  } = useMirrorApp();


  return (
    <AppShell
      title="You"
      subtitle={`Focus Windows · Privacy · Data Tiers${focusWindows?.historyStartDay ? ` (history starts ${focusWindows.historyStartDay})` : ''}`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      {/* Focus Windows — observed timing blocks (requires 21 days AND 5 sittings/cell) */}
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
              OBSERVED TIMING BLOCKS · 21 DAYS & 5 SITTINGS/CELL
            </Text>
            <Text role="title-lg" theme={theme}>
              Focus Windows
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              {focusWindows?.ready
                ? `Observed across ${focusWindows.distinctDays} days (${focusWindows.cellsMeetingSampleFloor} qualifying cells)`
                : focusWindows?.progressLabel ?? 'Needs 3 weeks of data and ≥5 sittings per cell'}
            </Text>
          </View>
          <TierBadge tier="D" theme={theme} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip static label="Descriptive · non-clinical" theme={theme} />
          <ConfidenceChip tiers={['D']} label="21d & ≥5 sittings/cell" theme={theme} />
        </View>

        {!p3Reliable ? (
          <Callout theme={theme} tone="limit">
            {BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
          </Callout>
        ) : !focusWindows || !focusWindows.ready ? (
          <View style={{ gap: theme.space(2.5) }}>
            <EmptyState
              title={`Coming with more data — ${focusWindows?.emptyStateTitle ?? 'Needs 3 weeks of data and 5 sittings per cell'}`}
              body={
                focusWindows?.emptyStateBody ??
                'Focus Windows stay hidden until Mirror has at least 21 local days of history and 5 or more sittings in a weekday × 4-hour block.'
              }
              theme={theme}
            />
            {focusWindows ? (
              <View
                style={{
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.glass.panel.fill,
                  borderWidth: 1,
                  borderColor: theme.color.borderCard,
                  padding: theme.space(3),
                  gap: theme.space(2),
                }}
              >
                <Meter
                  theme={theme}
                  value={Math.min(1, focusWindows.distinctDays / focusWindows.minDays)}
                  label="History progress (21-day requirement)"
                  caption={`${focusWindows.distinctDays} / ${focusWindows.minDays} days`}
                  tone="anchor"
                />
                <Text role="micro" tone="muted" theme={theme}>
                  {`${focusWindows.progressLabel}${focusWindows.historyStartDay ? ` · history starts ${focusWindows.historyStartDay}` : ''}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: theme.space(2.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              {focusWindows.progressLabel}
            </Text>
            <View
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.glass.panel.fill,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                padding: theme.space(3),
                gap: theme.space(2.5),
              }}
            >
              {(() => {
                const windows = focusWindows.suggestedWindows;
                const maxHoldMs = Math.max(1, ...windows.map((w) => w.totalSittingMs || 1));
                return windows.map((w, idx) => (
                  <View key={w.cellId} style={{ gap: theme.space(1.5) }}>
                    {idx > 0 ? <Divider theme={theme} /> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.space(2) }}>
                      <Text role="label" theme={theme}>
                        {`${idx + 1}. ${w.label}`}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${w.sessionCount} sittings across ${w.distinctDays}d`}
                      </Text>
                    </View>
                    <Meter
                      theme={theme}
                      value={(w.totalSittingMs || 0) / maxHoldMs}
                      label="Block sitting span"
                      caption={`${formatDuration(w.totalSittingMs || 0)}${w.switchesPerHour !== null ? ` · ${w.switchesPerHour.toFixed(1)} switches/hr` : ''}`}
                      tone={idx === 0 ? 'anchor' : 'muted'}
                    />
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${Math.round(w.sustainedShare * 100)}% sustained (≥8 s)${w.explicitLabels && w.explicitLabels.decisive > 0 ? ` · ${w.explicitLabels.intentional}/${w.explicitLabels.decisive} user-labelled intentional` : ''}`}
                    </Text>
                  </View>
                ));
              })()}
            </View>
            <Callout theme={theme} tone="neutral">
              {focusWindows.capabilities.nonDiagnosticRule}
            </Callout>
          </View>
        )}
      </Surface>

      {/* Settings: reminders, quiet hours, export and delete now share one screen */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View testID="you-settings-entry" style={{ gap: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            SETTINGS
          </Text>
          <Text role="body" theme={theme}>
            Reminders, quiet hours, export and delete live in one Settings screen. Everything stays on this device.
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <Pill
              testID="you-open-settings"
              theme={theme}
              variant="secondary"
              onPress={() => setShowSettings?.(true)}
              accessibilityLabel="Open Settings"
            >
              Open Settings
            </Pill>
          </View>
        </View>
      </Card>

      {/* Tier Matrix & Connector Availability */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            FOUR DATA TIERS · V0.1 AVAILABILITY
          </Text>
          <SectionHeader
            theme={theme}
            title="Data sources & privacy tiers"
            caption="each tier makes an explicit trade-off between richness and access"
          />
        </View>

        <View style={{ gap: theme.space(2.5) }}>
          {ALL_TIERS.map((meta, idx) => (
            <View key={meta.letter} style={{ gap: theme.space(1.5) }}>
              {idx > 0 ? <Divider theme={theme} /> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), flexShrink: 1 }}>
                  <TierBadge tier={meta.letter} theme={theme} />
                  <Text role="label" theme={theme}>
                    {`Tier ${meta.letter} · ${meta.name}`}
                  </Text>
                </View>
                <Chip
                  static
                  label={meta.letter === 'D' ? 'Active on this phone' : 'Not in v0.1'}
                  theme={theme}
                />
              </View>
              <Text role="micro" tone="muted" theme={theme}>
                {meta.how}
              </Text>
              {!meta.connectorAvailable ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {meta.letter === 'B'
                    ? 'Manual file import is not enabled in v0.1 yet.'
                    : 'No OAuth or cloud connectors exist in v0.1 — Mirror makes zero network calls.'}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </Card>

      {/* Data Quality & Session Boundary Health */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            COLLECTION INTEGRITY · HONEST GAPS
          </Text>
          <SectionHeader
            theme={theme}
            title="Data quality & session boundaries"
            caption={p3Reliable ? 'boundaries clean (unmatched ≤50, total ≤100)' : 'boundary guard active'}
          />
        </View>

        <View style={{ gap: theme.space(2) }}>
          <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
            <Stat
              value={String(orphanCount)}
              label="Unmatched events"
              hint="Threshold ≤50"
              theme={theme}
            />
            <Stat
              value={String(totalGaps)}
              label="Total boundary events"
              hint="Threshold ≤100"
              theme={theme}
            />
            {quality && quality.measuredGapMs > 0 ? (
              <Stat
                value={formatDuration(quality.measuredGapMs)}
                label="Unmeasured span"
                hint="Recorded collection gaps"
                theme={theme}
              />
            ) : null}
          </View>

          <Text role="micro" tone="muted" theme={theme}>
            {quality?.sentence ?? 'Zero collection gaps or unmatched boundary events on the selected day.'}
          </Text>

          {latestSyncOrphans && latestSyncOrphans.total > 0 ? (
            <Text role="micro" tone="muted" theme={theme}>
              {`Latest sync unmatched closes (${latestSyncOrphans.total}): ${latestSyncOrphans.byApp
                .map((item) => `${item.label} (${item.count})`)
                .join(', ')}`}
            </Text>
          ) : null}
        </View>
      </Card>

      {/* What this build is — silent 7-tap unlocks hidden DebugView without a visible hint */}
      <Pressable
        onPress={handleBuildTap}
        accessibilityRole="button"
        accessibilityLabel="What this build is"
        style={{ minHeight: theme.size.touchTarget, minWidth: theme.size.touchTarget }}
      >
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <SectionHeader
            theme={theme}
            title="What this build is"
            caption="On-device architecture & privacy posture"
          />
          <Text role="body" theme={theme}>
            {BUILD_SHORT}
          </Text>
        </Card>
      </Pressable>
    </AppShell>
  );
}
