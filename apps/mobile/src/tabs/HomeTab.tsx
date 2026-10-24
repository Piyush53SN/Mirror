import * as React from 'react';
import { View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  ConfidenceChip,
  Divider,
  EmptyState,
  LinkButton,
  Pill,
  SectionHeader,
  Text,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import { P3_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

export function HomeTab(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    collectingSince,
    lastCollect,
    error,
    keyMismatch,
    resetStoredData,
    dismissKeyMismatch,
    iqs,
    setShowWhy,
    dailyTotals,
    orphanCount,
    totalGaps,
    p3Reliable,
    checkPermissionAndCollect,
    setActiveTab,
  } = useMirrorApp();
  const [showAllApps, setShowAllApps] = React.useState(false);

  const visibleApps = showAllApps ? dailyTotals : dailyTotals.slice(0, 6);

  return (
    <AppShell
      title={`Mirror · ${selectedDay}`}
      subtitle={collectingSince ? `Collecting since ${collectingSince}` : 'Collecting...'}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <Text role="micro" tone="muted" theme={theme}>
        {lastCollect ?? 'collector idle'}
      </Text>
      {error ? (
        <Callout theme={theme} tone="limit">
          {error}
        </Callout>
      ) : null}

      {keyMismatch ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Stored data can't be read"
            caption={`sealed with ${keyMismatch.oldKey}, current ${keyMismatch.newKey}`}
          />
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`Mirror's encrypted database was sealed with key "${keyMismatch.oldKey}" but the current key is "${keyMismatch.newKey}". This happens after reinstall, clear data, or when Android restores a backup of the database without its key (SecureStore is not backed up).`}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3), flexWrap: 'wrap' }}>
            <Pill theme={theme} onPress={resetStoredData}>
              Reset stored data
            </Pill>
            <LinkButton theme={theme} onPress={dismissKeyMismatch}>
              Dismiss
            </LinkButton>
          </View>
        </Card>
      ) : null}

      <DayPickerStrip />

      {/* J3 Dashboard – Frosted Horizon, wired to real data */}
      <Card theme={theme} elevated>
        <SectionHeader theme={theme} title="Interaction quality" caption="out of what Mirror can actually measure" />
        <View
          style={{
            flexDirection: 'row',
            gap: theme.space(2),
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: theme.space(2),
          }}
        >
          <Chip static label="Based on usage patterns only" theme={theme} />
          {iqs && iqs.confidence.sample > 0 && iqs.confidence.smallSample ? (
            <Chip static label="Small sample" theme={theme} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1) }}>
            <TierBadge tier="D" theme={theme} />
            <Text role="micro" tone="muted" theme={theme}>
              Tier D only – OS usage, no content
            </Text>
          </View>
          <ConfidenceChip tiers={['D']} theme={theme} />
        </View>
        {iqs ? (
          <View style={{ gap: theme.space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space(2) }}>
              <Text role="display" theme={theme}>
                {iqs.value === null ? '—' : String(Math.round(iqs.value))}
              </Text>
              {iqs.value !== null ? (
                <Text role="label" tone="muted" theme={theme}>{`/ ${iqs.max}`}</Text>
              ) : null}
              <Text role="micro" tone="muted" theme={theme}>
                {iqs.band}
              </Text>
            </View>
            <Text role="micro" tone="muted" theme={theme}>
              {`Confidence: ${iqs.confidence.level} (${Math.round(iqs.confidence.score * 100)}%) – ${iqs.confidence.sample} sitting${iqs.confidence.sample === 1 ? '' : 's'} (${formatDuration(iqs.confidence.activeMs)} sitting time)`}
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              {iqs.caveat}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(1) }}>
              <Pill theme={theme} onPress={() => setShowWhy(true)}>
                Why this score
              </Pill>
              <LinkButton theme={theme} onPress={() => setActiveTab('insights')}>
                Explore Insights
              </LinkButton>
            </View>
          </View>
        ) : (
          <EmptyState
            title={`No usage data for ${selectedDay}`}
            body="IQS is not measured yet. Use apps and tap Refresh; Mirror will not fill the gap with estimates."
            theme={theme}
          />
        )}
      </Card>

      {/* Per-app totals from OS aggregate */}
      <Card theme={theme} elevated>
        <SectionHeader
          theme={theme}
          title={`Per-app totals – ${selectedDay}`}
          caption="from OS aggregate (Digital Wellbeing source), excludes launchers, Mirror, and system installers"
        />
        {dailyTotals.length === 0 ? (
          <EmptyState
            title={`No totals for ${selectedDay}`}
            body="Use apps that day, then tap Refresh. Totals come from OS queryUsageStats, not event rebuild, so they match Settings."
            theme={theme}
          />
        ) : (
          <View style={{ gap: theme.space(1) }}>
            {visibleApps.map((t, idx) => (
              <View key={t.app}>
                {idx > 0 ? <Divider theme={theme} /> : null}
                <View style={{ paddingVertical: theme.space(2), flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: theme.space(2) }}>
                    <Text role="label" theme={theme}>
                      {t.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {t.app}
                    </Text>
                  </View>
                  <Text role="label" theme={theme}>
                    {formatDuration(t.totalMs)}
                  </Text>
                </View>
              </View>
            ))}
            {dailyTotals.length > 6 ? (
              <LinkButton theme={theme} onPress={() => setShowAllApps((prev) => !prev)}>
                {showAllApps ? 'Show top 6 apps' : `Show all ${dailyTotals.length} apps`}
              </LinkButton>
            ) : null}
          </View>
        )}
      </Card>

      {/* Compact session boundary & navigation summary */}
      <Card theme={theme}>
        <SectionHeader
          theme={theme}
          title="Session boundary status"
          caption={p3Reliable ? 'Gate open (orphans ≤50, total ≤100)' : 'Hard gate active'}
        />
        <Text role="micro" tone="muted" theme={theme}>
          {p3Reliable
            ? `Unmatched closes ${orphanCount} · total boundary events ${totalGaps}. Multi-day views live in Journey, What-if Estimates in Insights, App opens in Sessions, and Focus Windows + Diagnostics & 7-tap debug in You.`
            : P3_GUARD_SHORT(orphanCount, totalGaps)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(2) }}>
          <LinkButton theme={theme} onPress={() => setActiveTab('sessions')}>
            Label opens in Sessions
          </LinkButton>
          <LinkButton theme={theme} onPress={() => setActiveTab('you')}>
            Diagnostics & debug in You
          </LinkButton>
        </View>
      </Card>
    </AppShell>
  );
}
