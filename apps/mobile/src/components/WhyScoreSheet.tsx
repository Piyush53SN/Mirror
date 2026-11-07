import * as React from 'react';
import { View } from 'react-native';
import { Callout, Chip, Divider, EmptyState, LinkButton, Meter, SectionHeader, Sheet, Text, WhySheet, useTheme, type MirrorTheme } from '@mirror/ui';
import type { Score } from '@mirror/core-analytics';
import { BOUNDARY_GUARD_SHORT } from '../buildDetails';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';
import { useSafeInsets } from './useSafeInsets';

export function WhyScoreSheet({
  open,
  iqs,
  onClose,
}: {
  open: boolean;
  iqs: Score;
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { insets: contextInsets } = useMirrorApp();
  const insets = useSafeInsets(contextInsets);

  const measuredFactors = iqs.factors.filter((f) => f.measurable && f.max > 0);
  const unmeasuredFactors = iqs.factors.filter((f) => !f.measurable && f.max > 0);
  const measuredMax =
    typeof iqs.measuredMax === 'number'
      ? iqs.measuredMax
      : measuredFactors.reduce((sum, f) => sum + f.max, 0);
  const scaleMax = iqs.max > 0 ? iqs.max : 100;
  const confidenceExplanation =
    iqs.confidence.explanation ??
    `Confidence is ${Math.round(iqs.confidence.score * 100)}% (${iqs.confidence.level}) based on ${iqs.confidence.sample} recorded sitting${iqs.confidence.sample === 1 ? '' : 's'} and ${iqs.confidence.labels} explicit label${iqs.confidence.labels === 1 ? '' : 's'}.`;

  return (
    <Sheet
      open={open}
      title="Why this score"
      subtitle={
        iqs.value !== null
          ? `Interaction quality · ${Math.round(iqs.value)} of ${measuredMax} measured (${Math.max(0, scaleMax - measuredMax)} pts not measured)`
          : 'Interaction quality · minimum activity not met yet'
      }
      onClose={onClose}
      bottomInset={insets.bottom}
      theme={theme}
    >
      <View style={{ gap: theme.space(3), paddingBottom: theme.space(2) }}>
        <WhySheet
          score={iqs.value ?? 0}
          maxScore={scaleMax}
          measuredMax={measuredMax}
          components={measuredFactors.map((f) => ({
            label: f.label,
            points: f.points,
            maxPoints: f.max,
            note: f.detail,
            tier: f.tier,
          }))}
          unmeasuredComponents={unmeasuredFactors.map((f) => ({
            label: f.label,
            maxPoints: f.max,
            reason: f.detail,
            tier: f.tier,
          }))}
          confidence={{
            scorePct: Math.round(iqs.confidence.score * 100),
            level: iqs.confidence.level,
            explanation: confidenceExplanation,
            reasons: iqs.confidence.reasons,
          }}
          caveat={iqs.caveat}
          theme={theme}
        />
        <Callout theme={theme} tone="neutral">
          {`The composite scale is fixed at ${scaleMax} points. Today ${measuredMax} points are measured and ${Math.max(0, scaleMax - measuredMax)} points are shown separately as not measured — unmeasured parts are never counted as zero and never rescaled to hide what is missing.`}
        </Callout>
        <WhyNumbersSection theme={theme} />
      </View>
    </Sheet>
  );
}

/**
 * The detail that used to sit on Home: how screen time and sittings are counted, the per-app
 * list, the source notes and the session boundary status. Presentation only; every value is
 * read from the same context fields Home used.
 */
function WhyNumbersSection({ theme }: { theme: MirrorTheme }): React.ReactElement {
  const ctx = useMirrorApp();
  const {
    selectedDay,
    dailyTotals,
    dailyTotalsSource,
    dayScoredSessions,
    sittingSpanMs,
    p3Reliable,
    orphanCount,
    totalGaps,
    hasEventsWithoutSittings,
    setActiveTab,
    setShowWhy,
  } = ctx;
  const totalScreenMs = dailyTotals.reduce((sum, t) => sum + t.totalMs, 0);
  const sittingCount = dayScoredSessions.length;
  const maxAppMs = dailyTotals[0]?.totalMs ?? 1;
  const sourceName =
    dailyTotalsSource === 'stored_events'
      ? 'Stored screen time'
      : dailyTotalsSource === 'os_bucket_approx'
        ? 'Approx. screen time'
        : 'OS screen time';
  const goTo = (tab: 'sessions' | 'you'): void => {
    setShowWhy(false);
    setActiveTab(tab);
  };

  return (
    <View testID="why-numbers" style={{ gap: theme.space(3) }}>
      <SectionHeader
        theme={theme}
        title="How these numbers are counted"
        caption={`${selectedDay} · ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}`}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
        <Chip static theme={theme} label={`${sourceName} ${formatDuration(totalScreenMs)}`} />
        <Chip
          static
          theme={theme}
          label={`${sittingCount} ${sittingCount === 1 ? 'sitting' : 'sittings'} · ${formatDuration(sittingSpanMs)} sitting spans`}
        />
      </View>
      <Text role="micro" tone="muted" theme={theme}>
        {`${sourceName} (${formatDuration(totalScreenMs)}) ${
          dailyTotalsSource === 'os_bucket_approx'
            ? 'comes from fallback OS daily buckets because raw UsageEvents are unavailable for this older day.'
            : dailyTotalsSource === 'stored_events'
              ? 'sums Mirror’s stored day-clipped foreground intervals for this older day.'
              : 'sums day-clipped OS foreground events only, matching Digital Wellbeing.'
        } Sitting spans (${sittingCount > 0 ? formatDuration(sittingSpanMs) : '0s'} across ${sittingCount} sitting${sittingCount === 1 ? '' : 's'}) merge reopens of the same app within 15 min into one sitting, so spans are not double counted.`}
      </Text>

      {dailyTotalsSource === 'stored_events' ? (
        <Callout theme={theme} tone="neutral">
          {`Stored (${selectedDay}): Android’s raw UsageEvents buffer no longer covers this older day. Totals come from Mirror’s stored day-clipped foreground events recorded on this device.`}
        </Callout>
      ) : dailyTotalsSource === 'os_bucket_approx' ? (
        <Callout theme={theme} tone="limit">
          {`Approximate (${selectedDay}): Android’s raw UsageEvents buffer no longer covers this day and Mirror has no stored events for it. Totals come from fallback OS daily buckets, which do not clip cleanly at local midnight.`}
        </Callout>
      ) : null}

      <Divider theme={theme} />
      <SectionHeader
        theme={theme}
        title={
          dailyTotalsSource === 'stored_events'
            ? `Per-app totals · ${selectedDay} · Stored`
            : dailyTotalsSource === 'os_bucket_approx'
              ? `Per-app totals · ${selectedDay} · Approximate`
              : `Per-app totals · ${selectedDay}`
        }
        caption="Foreground time per app, using the shared system and launcher exclusion list"
      />
      {dailyTotals.length === 0 ? (
        <EmptyState
          title={`No totals for ${selectedDay}`}
          body="Use apps that day, then tap Refresh. Mirror never fills gaps with guesses."
          theme={theme}
        />
      ) : (
        <View style={{ gap: theme.space(2.5) }}>
          {dailyTotals.map((t, idx) => {
            const sharePct = totalScreenMs > 0 ? Math.round((t.totalMs / totalScreenMs) * 100) : 0;
            return (
              <View key={t.app} style={{ gap: theme.space(1) }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.space(2) }}>
                  <View style={{ flex: 1 }}>
                    <Text role="label" theme={theme}>
                      {t.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {t.app}
                    </Text>
                  </View>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`${sharePct}% · ${formatDuration(t.totalMs)}`}
                  </Text>
                </View>
                <Meter
                  theme={theme}
                  value={maxAppMs > 0 ? t.totalMs / maxAppMs : 0}
                  label={`${t.label} foreground share`}
                  caption={formatDuration(t.totalMs)}
                  tone={idx === 0 ? 'anchor' : 'muted'}
                />
              </View>
            );
          })}
        </View>
      )}

      <Divider theme={theme} />
      <SectionHeader
        theme={theme}
        title="Session boundary status"
        caption={p3Reliable ? 'Boundaries clean (unmatched ≤50, total ≤100)' : 'Boundary guard active'}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
        <Chip static label={p3Reliable ? 'Boundaries clean' : 'Guard active'} theme={theme} />
        <Chip static label={`${orphanCount} unmatched`} theme={theme} />
        <Chip static label={`${totalGaps} total boundary events`} theme={theme} />
      </View>
      <Text role="micro" tone="muted" theme={theme}>
        {p3Reliable
          ? 'Multi-day patterns live in Journey, What-if estimates in Insights, open times in Sessions, and Focus Windows plus privacy controls in You.'
          : BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
        <LinkButton theme={theme} onPress={() => goTo('sessions')}>
          Label opens in Sessions
        </LinkButton>
        <LinkButton theme={theme} onPress={() => goTo('you')}>
          Privacy & data quality in You
        </LinkButton>
      </View>
      {hasEventsWithoutSittings ? (
        <Callout theme={theme} tone="neutral">
          Usage events are recorded for this day but sittings are not built yet. Tap Refresh on Home to rebuild them.
        </Callout>
      ) : null}
    </View>
  );
}
