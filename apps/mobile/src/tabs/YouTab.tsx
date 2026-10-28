import * as React from 'react';
import { Pressable, View } from 'react-native';
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
import { BUILD_SHORT, P3_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { useMirrorApp } from '../context/MirrorAppContext';

export function YouTab(): React.ReactElement {
  const theme = useTheme();
  const {
    focusWindows,
    quality,
    evolution,
    orphanCount,
    totalGaps,
    p3Reliable,
    intentLabels,
    lastReset,
    resetStoredData,
    clearStoredLabels,
    checkPermissionAndCollect,
    openSettings,
    buildTapCount,
    handleBuildTap,
  } = useMirrorApp();

  const [confirmMode, setConfirmMode] = React.useState<'none' | 'delete-all' | 'clear-labels'>('none');
  const [busyAction, setBusyAction] = React.useState<'none' | 'delete-all' | 'clear-labels'>('none');
  const [privacyNotice, setPrivacyNotice] = React.useState<string | null>(null);

  const storedLabelCount = Object.keys(intentLabels).length;
  const decisiveLabelCount = React.useMemo(
    () =>
      Object.values(intentLabels).filter(
        (lbl) => lbl === 'intentional' || lbl === 'mindless',
      ).length,
    [intentLabels],
  );
  const recordedDays = focusWindows?.distinctDays ?? evolution?.distinctDays ?? 0;
  const historyStartDay = focusWindows?.historyStartDay ?? evolution?.historyStartDay ?? null;

  const handleConfirmDeleteAll = React.useCallback(async () => {
    setBusyAction('delete-all');
    try {
      await resetStoredData('user_delete_all');
      setConfirmMode('none');
      setPrivacyNotice('Deleted all local Mirror data on this device.');
    } finally {
      setBusyAction('none');
    }
  }, [resetStoredData]);

  const handleConfirmClearLabels = React.useCallback(async () => {
    setBusyAction('clear-labels');
    try {
      await clearStoredLabels();
      setConfirmMode('none');
      setPrivacyNotice('Cleared all manual intent labels. Recorded usage history was kept.');
    } finally {
      setBusyAction('none');
    }
  }, [clearStoredLabels]);

  return (
    <AppShell
      title="You"
      subtitle="Focus windows, local privacy & data quality"
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      {/* J20 Frosted Horizon Hero — Focus Windows (requires 21+ local days & 5+ sittings per cell) */}
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
              OBSERVED TIMING BLOCKS · TIER D
            </Text>
            <Text role="title-lg" theme={theme}>
              Focus Windows
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              {focusWindows && focusWindows.ready
                ? `${focusWindows.distinctDays} days (${focusWindows.historyStartDay} to ${focusWindows.lastDay}) · ${focusWindows.cellsMeetingSampleFloor} cells at 5+ sittings`
                : 'requires 3 weeks (21+ days) and 5+ sittings per cell'}
            </Text>
          </View>
          <TierBadge tier="D" theme={theme} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip static label="Based on usage patterns only" theme={theme} />
          <Chip static label="Never blocks or nudges" theme={theme} />
          <ConfidenceChip tiers={['D']} label="Tier D · Descriptive timing only" theme={theme} />
        </View>

        {!p3Reliable ? (
          <EmptyState
            title="Needs reliable session boundaries"
            body={P3_GUARD_SHORT(orphanCount, totalGaps)}
            theme={theme}
          />
        ) : !focusWindows ? (
          <EmptyState
            title="Needs 3 weeks (21+ days) of history"
            body="Focus Windows computes observed phone-timing blocks once multi-week local sitting history is recorded."
            theme={theme}
          />
        ) : (
          <View style={{ gap: theme.space(3) }}>
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
              <Meter
                theme={theme}
                value={Math.min(1, Math.max(0, focusWindows.distinctDays / 21))}
                label="Multi-week history threshold"
                caption={`${focusWindows.distinctDays} / 21 days`}
                tone={focusWindows.ready ? 'anchor' : 'muted'}
              />
            </View>

            {!focusWindows.ready ? (
              <EmptyState
                title={focusWindows.emptyStateTitle ?? 'Needs 3 weeks of data and 5 sittings per cell'}
                body={`${focusWindows.emptyStateBody ?? ''} Progress: ${focusWindows.progressLabel}`}
                theme={theme}
              />
            ) : (
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
                <Text role="micro" tone="muted" theme={theme}>
                  {focusWindows.progressLabel}
                </Text>
                {focusWindows.suggestedWindows.length === 0 ? (
                  <Text role="body" theme={theme}>
                    {`0 weekday × 4-hour blocks matched the low-switching pattern across ${focusWindows.cellsMeetingSampleFloor} qualified cell${focusWindows.cellsMeetingSampleFloor === 1 ? '' : 's'} (requires 15+ min active, 80%+ sittings of 8 s or longer, and at most 12 switches/h).`}
                  </Text>
                ) : (
                  focusWindows.suggestedWindows.map((w) => (
                    <Meter
                      key={w.cellId}
                      theme={theme}
                      value={w.sustainedShare}
                      label={`${w.label} · ${w.sessionCount} sittings (${w.distinctDays}d)`}
                      caption={`${Math.round(w.sustainedShare * 100)}% 8s+ · ${w.switchesPerHour !== null ? `${w.switchesPerHour}/h` : 'rate hidden'}`}
                      tone="anchor"
                    />
                  ))
                )}
              </View>
            )}

            <View
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.glass.card.fill,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                padding: theme.space(3),
                gap: theme.space(1),
              }}
            >
              <Text role="label" theme={theme}>
                What Tier D can show
              </Text>
              {focusWindows.capabilities.tierDCanShow.map((line, idx) => (
                <Text key={`fw-can-${idx}`} role="micro" tone="muted" theme={theme}>
                  {`• ${line}`}
                </Text>
              ))}
              <Text role="label" theme={theme} style={{ marginTop: theme.space(1) }}>
                What Tier D cannot show
              </Text>
              {focusWindows.capabilities.tierDCannotShow.map((line, idx) => (
                <Text key={`fw-cannot-${idx}`} role="micro" tone="muted" theme={theme}>
                  {`• ${line}`}
                </Text>
              ))}
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                {focusWindows.capabilities.nonDiagnosticRule}
              </Text>
            </View>
          </View>
        )}
      </Surface>

      {/* Frosted Glass Card — Local Data & Privacy (two-step delete all data + clear manual labels) */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            ON-DEVICE STORAGE · ENCRYPTED SQLITE
          </Text>
          <SectionHeader
            theme={theme}
            title="Local Data & Privacy"
            caption="all data stays on this phone — clear manual labels or wipe the store anytime"
          />
        </View>

        <View style={{ gap: theme.space(2.5) }}>
          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip static label="Tier D active · OS usage" theme={theme} />
            <Chip static label="Tiers A/B/C unavailable in v0.1" theme={theme} />
            <Chip static label="Backup & OTA disabled" theme={theme} />
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
                  value={recordedDays > 0 ? `${recordedDays} ${recordedDays === 1 ? 'day' : 'days'}` : 'Today'}
                  label="Local history"
                  hint={
                    lastReset
                      ? `History reset on ${lastReset.day}`
                      : historyStartDay
                        ? `History starts ${historyStartDay}`
                        : 'Encrypted SQLite'
                  }
                  theme={theme}
                />
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                <Stat
                  value={String(storedLabelCount)}
                  label={storedLabelCount === 1 ? 'Manual label' : 'Manual labels'}
                  hint={storedLabelCount > 0 ? `${decisiveLabelCount} decisive` : 'None stored'}
                  theme={theme}
                />
              </View>
            </View>
            {lastReset ? (
              <Text role="micro" tone="muted" theme={theme}>
                {`History reset on ${lastReset.day} (${
                  lastReset.reason === 'key_mismatch_reset'
                    ? 'key mismatch after reinstall'
                    : lastReset.reason === 'reinstall_or_storage_cleared'
                      ? 'reinstall or cleared storage'
                      : 'manual delete-all'
                }${
                  lastReset.previousHistoryStartDay
                    ? `, previous history began ${lastReset.previousHistoryStartDay}`
                    : ''
                }).`}
              </Text>
            ) : null}
            <Divider theme={theme} />
            <Text role="micro" tone="muted" theme={theme}>
              {
                'Records are sealed locally with a device-bound SecureStore key (allowBackup: false, telemetry: false, INTERNET stripped in release). Export file import (Tier B), browser extension (Tier C), and API connectors (Tier A) are disabled in v0.1.'
              }
            </Text>
          </View>

          {privacyNotice ? (
            <Callout theme={theme} tone="neutral">
              {privacyNotice}
            </Callout>
          ) : null}

          {confirmMode === 'none' ? (
            <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
              <Pill
                testID="clear-labels-trigger"
                theme={theme}
                variant="secondary"
                disabled={storedLabelCount === 0 || busyAction !== 'none'}
                onPress={() => {
                  setPrivacyNotice(null);
                  setConfirmMode('clear-labels');
                }}
              >
                {`Clear manual labels (${storedLabelCount})`}
              </Pill>
              <Pill
                testID="delete-all-data-trigger"
                theme={theme}
                variant="secondary"
                disabled={busyAction !== 'none'}
                onPress={() => {
                  setPrivacyNotice(null);
                  setConfirmMode('delete-all');
                }}
              >
                Delete all local data
              </Pill>
            </View>
          ) : null}

          {confirmMode === 'clear-labels' ? (
            <View
              testID="clear-labels-confirm-panel"
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.glass.card.fill,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                padding: theme.space(3),
                gap: theme.space(2),
              }}
            >
              <Text role="label" theme={theme}>
                {`Clear ${storedLabelCount} manual intent label${storedLabelCount === 1 ? '' : 's'}?`}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {
                  'Removes all manual intentional, mindless, and unsure labels across every day. Recorded sessions and OS foreground totals are kept.'
                }
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
                <Pill
                  testID="clear-labels-confirm-btn"
                  theme={theme}
                  variant="primary"
                  disabled={busyAction !== 'none'}
                  onPress={handleConfirmClearLabels}
                >
                  {busyAction === 'clear-labels' ? 'Clearing labels…' : 'Confirm clear labels'}
                </Pill>
                <Pill
                  testID="clear-labels-cancel-btn"
                  theme={theme}
                  variant="secondary"
                  disabled={busyAction !== 'none'}
                  onPress={() => setConfirmMode('none')}
                >
                  Cancel
                </Pill>
              </View>
            </View>
          ) : null}

          {confirmMode === 'delete-all' ? (
            <View
              testID="delete-all-data-confirm-panel"
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.glass.card.fill,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                padding: theme.space(3),
                gap: theme.space(2),
              }}
            >
              <Callout theme={theme} tone="limit">
                {`Confirm permanent deletion? This wipes Mirror's encrypted SQLite database on this phone — all multi-day history, sessions, collection cursors, gap diagnostics, and ${storedLabelCount} manual label${storedLabelCount === 1 ? '' : 's'}.`}
              </Callout>
              <Text role="micro" tone="muted" theme={theme}>
                {
                  'Note: if Android Usage Access remains granted, the next sync reads only Android’s rolling 24-hour OS window like a fresh install. Revoke Usage Access in Settings first if you want collection stopped completely.'
                }
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Pill
                  testID="delete-all-data-confirm-btn"
                  theme={theme}
                  variant="primary"
                  disabled={busyAction !== 'none'}
                  onPress={handleConfirmDeleteAll}
                >
                  {busyAction === 'delete-all' ? 'Deleting…' : 'Confirm delete everything'}
                </Pill>
                <Pill
                  testID="delete-all-data-cancel-btn"
                  theme={theme}
                  variant="secondary"
                  disabled={busyAction !== 'none'}
                  onPress={() => setConfirmMode('none')}
                >
                  Cancel
                </Pill>
                <LinkButton theme={theme} onPress={openSettings}>
                  Open usage settings
                </LinkButton>
              </View>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Frosted Glass Card — Data quality & P3 session boundary diagnostics */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            COLLECTOR DIAGNOSTICS · HARD GATE ORPHANS ≤50
          </Text>
          <SectionHeader
            theme={theme}
            title="Data quality & session boundaries"
            caption="daily totals come from OS stats; P3 cards require clean boundaries"
          />
        </View>

        <View style={{ gap: theme.space(2.5) }}>
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
            <Text role="body" theme={theme}>
              {quality?.sentence ?? 'No collection gaps recorded.'}
            </Text>
          </View>

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
            {!p3Reliable ? (
              <>
                <Text role="label" theme={theme}>
                  {`Hard gate: needs more reliable sessions — orphans ${orphanCount} (must be ≤50), total unmatched/gap events ${totalGaps} (must be ≤100)`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {P3_GUARD_SHORT(orphanCount, totalGaps)}
                </Text>
                <Callout theme={theme} tone="limit">
                  {
                    'Hard gate enforced: P3 blocked until orphans ≤50. Per-app totals from day-clipped OS foreground events remain available on Home. Labeling optional, only explicit labels count, hint never counts.'
                  }
                </Callout>
              </>
            ) : (
              <>
                <Text role="label" theme={theme}>
                  {`Gate open — orphans ${orphanCount}, unmatched/gap events ${totalGaps}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {evolution && evolution.hasHistory && evolution.rows.length > 0
                    ? `Interest Evolution (J4), Discovery Journey (J9), Rabbit Hole (J11), What-if Simulator (J18, Estimates), and Focus Windows (J20, ${focusWindows?.ready ? 'active' : `${focusWindows?.distinctDays ?? evolution.distinctDays}/21 days`}) are active across Insights, Journey, and You (${evolution.distinctDays} days since ${evolution.historyStartDay}).`
                    : `What-if Simulator (J18, Estimates) is in Insights, Focus Windows (J20 empty state: ${focusWindows?.distinctDays ?? evolution?.distinctDays ?? 0}/21 days) is above, and 3-day cards (J4, J9, J11) show progress empty states in Journey until ${evolution?.minDays ?? 3}+ days of session history are collected (${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} day${(evolution?.distinctDays ?? 0) === 1 ? '' : 's'} so far).`}
                </Text>
              </>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
              Refresh
            </Pill>
            <LinkButton theme={theme} onPress={openSettings}>
              Open usage settings
            </LinkButton>
          </View>
        </View>
      </Card>

      {/* What this build is — 7-tap debug entry preserved */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What this build is. Tap 7 times for debug, currently ${buildTapCount} of 7`}
        style={{ minHeight: theme.size.touchTarget }}
        onPress={handleBuildTap}
      >
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <SectionHeader
            theme={theme}
            title="What this build is"
            caption={`Tap 7 times for debug – build ${buildTapCount}/7`}
          />
          <Text role="micro" tone="muted" theme={theme}>
            {BUILD_SHORT}
          </Text>
        </Card>
      </Pressable>
    </AppShell>
  );
}
