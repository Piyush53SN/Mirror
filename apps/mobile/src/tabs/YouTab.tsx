import * as React from 'react';
import { Pressable, View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  Divider,
  EmptyState,
  LinkButton,
  Pill,
  SectionHeader,
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
    latestSyncOrphans,
    raw24hOrphans,
    evolution,
    orphanCount,
    totalGaps,
    p3Reliable,
    checkPermissionAndCollect,
    openSettings,
    buildTapCount,
    handleBuildTap,
  } = useMirrorApp();

  return (
    <AppShell
      title="You"
      subtitle="Focus windows, data quality & build info"
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      {/* J20 Focus Windows – requires 21+ local days (3 weeks) and 5+ sittings per weekday × 4-hour cell */}
      <Card theme={theme} elevated>
        <SectionHeader
          theme={theme}
          title="Focus Windows"
          caption={
            focusWindows && focusWindows.ready
              ? `${focusWindows.distinctDays} days (${focusWindows.historyStartDay} to ${focusWindows.lastDay}) · ${focusWindows.cellsMeetingSampleFloor} cells at 5+ sittings`
              : 'requires 3 weeks (21+ days) and 5+ sittings per cell'
          }
        />
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
            <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip static label="Based on usage patterns only" theme={theme} />
              <TierBadge tier="D" theme={theme} />
              <Text role="micro" tone="muted" theme={theme}>
                {'Observed phone-timing blocks only; never blocks apps or nudges.'}
              </Text>
            </View>

            {!focusWindows.ready ? (
              <EmptyState
                title={focusWindows.emptyStateTitle ?? 'Needs 3 weeks of data and 5 sittings per cell'}
                body={`${focusWindows.emptyStateBody ?? ''} Progress: ${focusWindows.progressLabel}`}
                theme={theme}
              />
            ) : (
              <View style={{ gap: theme.space(2) }}>
                <Text role="micro" tone="muted" theme={theme}>
                  {focusWindows.progressLabel}
                </Text>
                {focusWindows.suggestedWindows.length === 0 ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`0 weekday × 4-hour blocks matched the low-switching pattern across ${focusWindows.cellsMeetingSampleFloor} qualified cell${focusWindows.cellsMeetingSampleFloor === 1 ? '' : 's'} (requires 15+ min active, 80%+ sittings of 8 s or longer, and at most 12 switches/h).`}
                  </Text>
                ) : (
                  focusWindows.suggestedWindows.map((w) => (
                    <View
                      key={w.cellId}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: theme.space(2),
                        paddingVertical: theme.space(1),
                      }}
                    >
                      <Text role="label" theme={theme} style={{ flex: 1 }}>
                        {`${w.label} · ${w.sessionCount} sittings across ${w.distinctDays} days`}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${Math.round(w.sustainedShare * 100)}% 8s+ · ${w.switchesPerHour !== null ? `${w.switchesPerHour}/h` : 'rate hidden'}`}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            <Divider theme={theme} />

            <View style={{ gap: theme.space(1) }}>
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
      </Card>

      {/* Data quality & orphan diagnostics */}
      <Card theme={theme}>
        <SectionHeader
          theme={theme}
          title="Data quality"
          caption="boundary diagnostics — daily totals come from OS stats"
        />
        <Text role="body" theme={theme}>
          {quality?.sentence ?? 'No collection gaps recorded.'}
        </Text>
        {latestSyncOrphans || raw24hOrphans ? (
          <View style={{ marginTop: theme.space(2), gap: theme.space(1) }}>
            {latestSyncOrphans ? (
              <Text role="micro" tone="muted" theme={theme}>
                {latestSyncOrphans.total === 0
                  ? 'Latest sync: 0 new unmatched close events.'
                  : `Latest sync: ${latestSyncOrphans.total} unmatched close${latestSyncOrphans.total === 1 ? '' : 's'} — ${latestSyncOrphans.newest.map((n) => `${n.label} (${n.typeName} at ${new Date(n.at).toLocaleTimeString()})`).join(', ')}`}
              </Text>
            ) : null}
            {raw24hOrphans ? (
              <Text role="micro" tone="muted" theme={theme}>
                {raw24hOrphans.total === 0
                  ? 'Last 24h raw OS stream (after lifecycle fix): 0 unmatched close events.'
                  : `Last 24h raw OS stream (${raw24hOrphans.total}): by type [${raw24hOrphans.byEventType.map((t) => `${t.typeName}×${t.count}`).join(', ')}] · by app [${raw24hOrphans.byApp.slice(0, 4).map((a) => `${a.label}×${a.count}`).join(', ')}] · newest [${raw24hOrphans.newest.slice(0, 3).map((n) => `${new Date(n.at).toLocaleTimeString()} ${n.label} ${n.typeName}`).join(', ')}]`}
              </Text>
            ) : null}
            {raw24hOrphans && (quality?.byReason?.orphan_background ?? 0) > raw24hOrphans.total ? (
              <Text role="micro" tone="muted" theme={theme}>
                {`Stored today count (${quality?.byReason?.orphan_background ?? 0}) includes syncs recorded earlier today before the PAUSED→STOPPED lifecycle fix and resets at midnight.`}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(2), flexWrap: 'wrap' }}>
          <Pill theme={theme} onPress={checkPermissionAndCollect}>
            Refresh
          </Pill>
          <LinkButton theme={theme} onPress={openSettings}>
            Open usage settings
          </LinkButton>
        </View>
      </Card>

      {/* P3 guard: features that need session boundaries – hard gate orphans ≤50 */}
      <Card theme={theme}>
        <SectionHeader
          theme={theme}
          title="P3 features – session boundaries"
          caption="hard gate orphans ≤50, total ≤100"
        />
        {!p3Reliable ? (
          <View style={{ gap: theme.space(2) }}>
            <Text role="label" theme={theme}>
              {`Hard gate: needs more reliable sessions – orphans ${orphanCount} (must be ≤50), total unmatched/gap events ${totalGaps} (must be ≤100)`}
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              {P3_GUARD_SHORT(orphanCount, totalGaps)}
            </Text>
            <Callout theme={theme} tone="limit">
              {
                'Hard gate enforced: P3 blocked until orphans ≤50. Per-app totals from OS aggregate are authoritative. Labeling optional, only explicit labels count, hint never counts.'
              }
            </Callout>
          </View>
        ) : (
          <View style={{ gap: theme.space(2) }}>
            <Text role="label" theme={theme}>
              {`Gate open – orphans ${orphanCount}, unmatched/gap events ${totalGaps}`}
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              {evolution && evolution.hasHistory && evolution.rows.length > 0
                ? `Interest Evolution (J4), Discovery Journey (J9), Rabbit Hole (J11), What-if Simulator (J18, Estimates), and Focus Windows (J20, ${focusWindows?.ready ? 'active' : `${focusWindows?.distinctDays ?? evolution.distinctDays}/21 days`}) are active across Insights, Journey, and You (${evolution.distinctDays} days since ${evolution.historyStartDay}).`
                : `What-if Simulator (J18, Estimates) is in Insights, Focus Windows (J20 empty state: ${focusWindows?.distinctDays ?? evolution?.distinctDays ?? 0}/21 days) is above, and 3-day cards (J4, J9, J11) show progress empty states in Journey until ${evolution?.minDays ?? 3}+ days of session history are collected (${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} day${(evolution?.distinctDays ?? 0) === 1 ? '' : 's'} so far).`}
            </Text>
          </View>
        )}
      </Card>

      {/* What this build is — 7-tap debug entry preserved */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What this build is. Tap 7 times for debug, currently ${buildTapCount} of 7`}
        style={{ minHeight: theme.size.touchTarget }}
        onPress={handleBuildTap}
      >
        <Card theme={theme}>
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
