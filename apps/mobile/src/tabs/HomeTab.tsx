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
  Meter,
  Pill,
  SectionHeader,
  Stat,
  Surface,
  Text,
  TierBadge,
  announceValue,
  useTheme,
  type MirrorTheme,
} from '@mirror/ui';
import type { Score } from '@mirror/core-analytics';
import { BOUNDARY_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, toDayStr, useMirrorApp } from '../context/MirrorAppContext';

const GAUGE_TICKS = 18;
const GAUGE_START_DEG = -210;
const GAUGE_SWEEP_DEG = 240;

/**
 * Frosted Horizon segmented 240-degree arc gauge for IQS on the fixed 0–100 scale.
 * Unmeasured parts are shown separately alongside the score rather than rescaled.
 */
function IqsHeroGauge({
  iqs,
  theme,
}: {
  iqs: Score | null;
  theme: MirrorTheme;
}): React.ReactElement {
  const scaleMax = iqs && iqs.max > 0 ? iqs.max : 100;
  const hasScore = iqs !== null && iqs.value !== null && scaleMax > 0;
  const ratio = hasScore ? Math.max(0, Math.min(1, (iqs.value ?? 0) / scaleMax)) : 0;
  const activeTicks = hasScore ? Math.round(ratio * GAUGE_TICKS) : 0;

  const size = theme.size.ring + theme.space(3); // 108dp
  const center = size / 2;
  const trackRadius = center - theme.space(2);
  const tickWidth = 4;
  const tickHeight = 12;
  const innerSize = size - theme.space(7); // 68dp center medallion

  const measuredMax =
    iqs && typeof iqs.measuredMax === 'number'
      ? iqs.measuredMax
      : iqs
        ? iqs.factors.filter((f) => f.measurable).reduce((sum, f) => sum + f.max, 0)
        : 0;

  const a11yLabel =
    hasScore && iqs && iqs.value !== null
      ? announceValue(
          'Interaction quality score',
          Math.round(iqs.value),
          `out of ${scaleMax}`,
          `${iqs.band}, ${measuredMax} of ${scaleMax} points measured today`,
        )
      : 'Interaction quality score not measured yet';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={{
        min: 0,
        max: scaleMax,
        now: hasScore && iqs && iqs.value !== null ? Math.round(iqs.value) : 0,
      }}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: GAUGE_TICKS }, (_, idx) => {
        const deg = GAUGE_START_DEG + (idx / (GAUGE_TICKS - 1)) * GAUGE_SWEEP_DEG;
        const rad = (deg * Math.PI) / 180;
        const x = center + Math.cos(rad) * trackRadius - tickWidth / 2;
        const y = center + Math.sin(rad) * trackRadius - tickHeight / 2;
        const filled = idx < activeTicks;
        return (
          <View
            key={idx}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: tickWidth,
              height: tickHeight,
              borderRadius: theme.radius.pill,
              backgroundColor: filled ? theme.color.anchor : theme.color.borderCard,
              opacity: filled ? 1 : 0.45,
              transform: [{ rotate: `${deg + 90}deg` }],
            }}
          />
        );
      })}
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.card,
          borderWidth: 1,
          borderColor: theme.color.borderHairline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text role={hasScore && iqs && iqs.value !== null ? 'title-lg' : 'micro'} theme={theme}>
          {hasScore && iqs && iqs.value !== null ? String(Math.round(iqs.value)) : 'Pending'}
        </Text>
        <Text role="micro" tone="muted" theme={theme}>
          {`/ ${scaleMax}`}
        </Text>
      </View>
    </View>
  );
}

function buildPlainHomeSentence(params: {
  selectedDay: string;
  isToday: boolean;
  totalScreenMs: number;
  sittingCount: number;
  sittingSpanMs: number;
  topApp: { label: string; totalMs: number } | undefined;
  appCount: number;
  hasEventsWithoutSittings: boolean;
}): string {
  const dayWord = params.isToday ? 'Today so far' : `On ${params.selectedDay}`;
  if (params.hasEventsWithoutSittings) {
    return `${dayWord}, Android recorded ${formatDuration(params.totalScreenMs)} across ${params.appCount} ${params.appCount === 1 ? 'app' : 'apps'}. Tap Refresh to rebuild sittings for this day.`;
  }
  if (params.totalScreenMs > 0 && params.sittingCount > 0 && params.topApp) {
    return `${dayWord}, you used your phone for ${formatDuration(params.totalScreenMs)} across ${params.sittingCount} ${params.sittingCount === 1 ? 'sitting' : 'sittings'}, mostly in ${params.topApp.label} (${formatDuration(params.topApp.totalMs)}).`;
  }
  if (params.totalScreenMs > 0 && params.topApp) {
    return `${dayWord}, you used your phone for ${formatDuration(params.totalScreenMs)} across ${params.appCount} ${params.appCount === 1 ? 'app' : 'apps'}, led by ${params.topApp.label} (${formatDuration(params.topApp.totalMs)}).`;
  }
  if (params.sittingCount > 0) {
    return `${dayWord}, you had ${params.sittingCount} ${params.sittingCount === 1 ? 'sitting' : 'sittings'} (${formatDuration(params.sittingSpanMs)} in sitting spans).`;
  }
  return `No app activity is recorded yet for ${params.isToday ? 'today' : params.selectedDay}. Your plain-language summary fills in automatically as you use your phone.`;
}

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
    dayScoredSessions,
    sittingSpanMs,
    evolution,
    focusWindows,
    setShowWhy,
    dailyTotals,
    dailyTotalsSource,
    hasEventsWithoutSittings,
    orphanCount,
    totalGaps,
    p3Reliable,
    checkPermissionAndCollect,
    setActiveTab,
  } = useMirrorApp();
  const [showAllApps, setShowAllApps] = React.useState(false);

  const visibleApps = showAllApps ? dailyTotals : dailyTotals.slice(0, 6);
  const totalScreenMs = React.useMemo(
    () => dailyTotals.reduce((sum, item) => sum + item.totalMs, 0),
    [dailyTotals],
  );
  const sittingCount = dayScoredSessions.length;
  const maxAppMs = dailyTotals[0]?.totalMs ?? 1;
  const measuredFactors = React.useMemo(
    () => (iqs ? iqs.factors.filter((f) => f.measurable && f.max > 0) : []),
    [iqs],
  );
  const unmeasuredFactors = React.useMemo(
    () => (iqs ? iqs.factors.filter((f) => !f.measurable && f.max > 0) : []),
    [iqs],
  );
  const scaleMax = iqs && iqs.max > 0 ? iqs.max : 100;
  const measuredMax = React.useMemo(
    () =>
      iqs && typeof iqs.measuredMax === 'number'
        ? iqs.measuredMax
        : measuredFactors.reduce((sum, f) => sum + f.max, 0),
    [iqs, measuredFactors],
  );
  const unmeasuredMax = Math.max(0, scaleMax - measuredMax);
  const confidenceExplanation = React.useMemo(() => {
    if (!iqs) return '';
    if (iqs.confidence.explanation) return iqs.confidence.explanation;
    return `Confidence is ${Math.round(iqs.confidence.score * 100)}% (${iqs.confidence.level}) from ${iqs.confidence.sample} recorded sitting${iqs.confidence.sample === 1 ? '' : 's'} and ${iqs.confidence.labels} explicit label${iqs.confidence.labels === 1 ? '' : 's'}.`;
  }, [iqs]);

  const isToday = selectedDay === toDayStr(Date.now());
  const homeSentence = React.useMemo(
    () =>
      buildPlainHomeSentence({
        selectedDay,
        isToday,
        totalScreenMs,
        sittingCount,
        sittingSpanMs,
        topApp: dailyTotals[0],
        appCount: dailyTotals.length,
        hasEventsWithoutSittings,
      }),
    [selectedDay, isToday, totalScreenMs, sittingCount, sittingSpanMs, dailyTotals, hasEventsWithoutSittings],
  );

  const historyStartDay = focusWindows?.historyStartDay ?? evolution?.historyStartDay ?? null;
  const headerSubtitle = historyStartDay
    ? `History starts ${historyStartDay}${collectingSince ? ` · synced ${collectingSince}` : ''}`
    : collectingSince
      ? `Last sync ${collectingSince}`
      : 'Syncing...';

  return (
    <AppShell
      title={`Mirror · ${selectedDay}`}
      subtitle={headerSubtitle}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space(2) }}>
        <Text role="micro" tone="muted" theme={theme}>
          {lastCollect ?? 'collector idle'}
        </Text>
        <Text role="micro" tone="muted" theme={theme}>
          On-device · encrypted
        </Text>
      </View>

      {error ? (
        <Callout theme={theme} tone="limit">
          {error}
        </Callout>
      ) : null}

      {keyMismatch ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <SectionHeader
            theme={theme}
            title="Stored data can't be read"
            caption={`sealed with ${keyMismatch.oldKey}, current ${keyMismatch.newKey}`}
          />
          <Text role="body" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`Mirror's encrypted database was sealed with key "${keyMismatch.oldKey}" but the current key is "${keyMismatch.newKey}". Resetting starts a fresh encrypted store on this phone.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3), flexWrap: 'wrap' }}>
            <Pill theme={theme} onPress={() => resetStoredData('key_mismatch_reset')}>
              Reset stored data
            </Pill>
            <LinkButton theme={theme} onPress={dismissKeyMismatch}>
              Dismiss
            </LinkButton>
          </View>
        </Card>
      ) : null}

      <DayPickerStrip />

      {/* Plain-language daily summary sentence */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View testID="home-plain-sentence" style={{ gap: theme.space(1) }}>
          <Text role="micro" tone="muted" theme={theme}>
            DAY IN PLAIN WORDS
          </Text>
          <Text role="body" theme={theme}>
            {homeSentence}
          </Text>
        </View>
      </Card>

      {/* Frosted Horizon Hero — fixed 0–100 IQS scale with unmeasured parts shown separately */}
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
              INTERACTION QUALITY · FIXED 0–100 SCALE
            </Text>
            <Text role="title-lg" theme={theme}>
              Attention signal
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              Fixed 100-point scale — unmeasured parts are shown separately, never counted as zero
            </Text>
          </View>
          <TierBadge tier="D" theme={theme} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: theme.space(2),
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Chip static label="Based on usage patterns only" theme={theme} />
          {iqs && iqs.confidence.sample > 0 && iqs.confidence.smallSample ? (
            <Chip static label="Small sample" theme={theme} />
          ) : null}
          <ConfidenceChip tiers={['D']} label="OS usage · no app content" theme={theme} />
        </View>

        {hasEventsWithoutSittings ? (
          <EmptyState
            title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
            body={`Per-app screen time is available below (${formatDuration(totalScreenMs)} across ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}), while derived sittings for ${selectedDay} are empty. Tap Refresh to rebuild sittings from stored events.`}
            action={
              <Pill theme={theme} onPress={checkPermissionAndCollect}>
                Refresh sittings
              </Pill>
            }
            theme={theme}
          />
        ) : iqs ? (
          <View style={{ gap: theme.space(3) }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space(4),
              }}
            >
              <IqsHeroGauge iqs={iqs} theme={theme} />
              <View style={{ flex: 1, gap: theme.space(1) }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                  <Text role={iqs.value === null ? 'title-lg' : 'display'} theme={theme}>
                    {iqs.value === null ? 'Not enough activity yet' : String(Math.round(iqs.value))}
                  </Text>
                  {iqs.value !== null ? (
                    <Text role="label" tone="muted" theme={theme}>
                      {`/ ${scaleMax}`}
                    </Text>
                  ) : null}
                </View>
                <Text role="label" theme={theme}>
                  {iqs.band}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {`Measured today: up to ${measuredMax} of ${scaleMax} pts · Not measured: ${unmeasuredMax} pts`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {`${sittingCount} sitting${sittingCount === 1 ? '' : 's'} · ${formatDuration(sittingSpanMs)} merged sitting spans`}
                </Text>
              </View>
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
              <Meter
                theme={theme}
                value={iqs.confidence.score}
                label={`Confidence · ${iqs.confidence.level}`}
                caption={`${Math.round(iqs.confidence.score * 100)}%`}
                tone="muted"
              />
              <Text role="micro" tone="muted" theme={theme}>
                {confidenceExplanation}
              </Text>
              {measuredFactors.length > 0 ? (
                <>
                  <Divider theme={theme} />
                  {measuredFactors.map((factor) => (
                    <Meter
                      key={factor.id}
                      theme={theme}
                      value={factor.points / factor.max}
                      label={factor.label}
                      caption={`${factor.points} / ${factor.max}`}
                      tone={factor.points > 0 ? 'anchor' : 'muted'}
                    />
                  ))}
                </>
              ) : null}
              {unmeasuredFactors.length > 0 ? (
                <>
                  <Divider theme={theme} />
                  <View style={{ gap: theme.space(1) }}>
                    <Text role="label" theme={theme}>
                      {`Not measured today (${unmeasuredMax} of ${scaleMax} pts excluded)`}
                    </Text>
                    {unmeasuredFactors.map((factor) => (
                      <Text key={factor.id} role="micro" tone="muted" theme={theme}>
                        {`· ${factor.label} (up to ${factor.max} pts): ${factor.detail}`}
                      </Text>
                    ))}
                  </View>
                </>
              ) : null}
            </View>

            <Callout theme={theme} tone="neutral">
              {iqs.caveat}
            </Callout>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), alignItems: 'center' }}>
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
            body="Your score appears once enough activity is recorded. Mirror never fills gaps with guesses."
            theme={theme}
          />
        )}
      </Surface>

      {/* Summary metrics: foreground screen time vs merged sitting spans */}
      <View style={{ flexDirection: 'row', gap: theme.space(3) }}>
        <Card theme={theme} style={{ flex: 1, marginBottom: 0 }}>
          <Stat
            value={dailyTotals.length > 0 ? formatDuration(totalScreenMs) : '0s'}
            label={
              dailyTotalsSource === 'stored_events'
                ? 'Stored screen time'
                : dailyTotalsSource === 'os_bucket_approx'
                  ? 'Approx. screen time'
                  : 'OS screen time'
            }
            hint={
              dailyTotalsSource === 'stored_events'
                ? `Stored · Mirror events · ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}`
                : dailyTotalsSource === 'os_bucket_approx'
                  ? `Approximate · OS buckets · ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}`
                  : `Day-clipped OS events · ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}`
            }
            theme={theme}
          />
        </Card>
        <Card theme={theme} style={{ flex: 1, marginBottom: 0 }}>
          <Stat
            value={`${sittingCount} ${sittingCount === 1 ? 'sitting' : 'sittings'}`}
            label={`Sitting spans · ${sittingCount > 0 ? formatDuration(sittingSpanMs) : '0s'}`}
            hint={p3Reliable ? 'Merges ≤15m same-app reopens' : 'Boundary gate active'}
            theme={theme}
          />
        </Card>
      </View>

      {dailyTotalsSource === 'stored_events' ? (
        <Callout theme={theme} tone="neutral">
          {`Stored (${selectedDay}): Android’s raw UsageEvents buffer no longer covers this older day. Totals come from Mirror’s stored day-clipped foreground events recorded on this device.`}
        </Callout>
      ) : dailyTotalsSource === 'os_bucket_approx' ? (
        <Callout theme={theme} tone="limit">
          {`Approximate (${selectedDay}): Android’s raw UsageEvents buffer no longer covers this day and Mirror has no stored events for it. Totals come from fallback OS daily buckets, which do not clip cleanly at local midnight.`}
        </Callout>
      ) : null}

      {totalScreenMs > 0 || sittingSpanMs > 0 ? (
        <Callout theme={theme} tone="neutral">
          {`${
            dailyTotalsSource === 'stored_events'
              ? 'Stored screen time'
              : dailyTotalsSource === 'os_bucket_approx'
                ? 'Approximate screen time'
                : 'OS screen time'
          } (${dailyTotals.length > 0 ? formatDuration(totalScreenMs) : '0s'}) ${
            dailyTotalsSource === 'os_bucket_approx'
              ? 'comes from fallback OS daily buckets because raw UsageEvents are unavailable for this older day.'
              : dailyTotalsSource === 'stored_events'
                ? 'sums Mirror’s stored day-clipped foreground intervals for this older day.'
                : 'sums day-clipped OS foreground events only, matching Digital Wellbeing.'
          } Sitting spans (${sittingCount > 0 ? formatDuration(sittingSpanMs) : '0s'} across ${sittingCount} sitting${sittingCount === 1 ? '' : 's'}) merge reopens of the same app within 15 min into one sitting, so spans include brief pauses and switches between opens.`}
        </Callout>
      ) : null}

      {/* Per-app foreground totals with explicit source badge */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: theme.space(1.5), marginBottom: dailyTotalsSource === 'os_events' ? 0 : theme.space(1) }}>
          {dailyTotalsSource === 'stored_events' ? (
            <Chip static theme={theme} label="Stored · Mirror events" />
          ) : dailyTotalsSource === 'os_bucket_approx' ? (
            <Chip static theme={theme} label="Approximate · OS daily buckets" />
          ) : null}
        </View>
        <SectionHeader
          theme={theme}
          title={
            dailyTotalsSource === 'stored_events'
              ? `Per-app totals · ${selectedDay} · Stored`
              : dailyTotalsSource === 'os_bucket_approx'
                ? `Per-app totals · ${selectedDay} · Approximate`
                : `Per-app totals · ${selectedDay}`
          }
          caption={
            dailyTotalsSource === 'stored_events'
              ? 'Stored day-clipped foreground events in Mirror, using the shared system/launcher exclusion list'
              : dailyTotalsSource === 'os_bucket_approx'
                ? 'Approximate OS daily buckets (may include adjacent-midnight bleed), using the shared exclusion list'
                : 'Day-clipped OS foreground events (matches Digital Wellbeing), using the shared exclusion list'
          }
        />
        {dailyTotals.length === 0 ? (
          <EmptyState
            title={`No totals for ${selectedDay}`}
            body={
              dailyTotalsSource === 'stored_events'
                ? 'No stored foreground intervals were recorded in Mirror for this older day.'
                : dailyTotalsSource === 'os_bucket_approx'
                  ? 'Android’s UsageEvents buffer no longer covers this older day, Mirror has no stored events for it, and no approximate OS daily buckets were returned.'
                  : 'Use apps that day, then tap Refresh. Totals sum OS foreground intervals clipped strictly to the local day, matching Digital Wellbeing.'
            }
            theme={theme}
          />
        ) : (
          <View style={{ gap: theme.space(2) }}>
            {visibleApps.map((t, idx) => {
              const sharePct = totalScreenMs > 0 ? Math.round((t.totalMs / totalScreenMs) * 100) : 0;
              return (
                <View key={t.app} style={{ gap: theme.space(1.5) }}>
                  {idx > 0 ? <Divider theme={theme} /> : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <View style={{ flex: 1, paddingRight: theme.space(2) }}>
                      <Text role="label" theme={theme}>
                        {t.label}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {t.app}
                      </Text>
                    </View>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${sharePct}%`}
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
            {dailyTotals.length > 6 ? (
              <LinkButton theme={theme} onPress={() => setShowAllApps((prev) => !prev)}>
                {showAllApps ? 'Show top 6 apps' : `Show all ${dailyTotals.length} apps`}
              </LinkButton>
            ) : null}
          </View>
        )}
      </Card>

      {/* Session boundary & quick navigation */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <SectionHeader
          theme={theme}
          title="Session boundary status"
          caption={p3Reliable ? 'Boundaries clean (unmatched ≤50, total ≤100)' : 'Boundary guard active'}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(2) }}>
          <Chip static label={p3Reliable ? 'Boundaries clean' : 'Guard active'} theme={theme} />
          <Chip static label={`${orphanCount} unmatched`} theme={theme} />
          <Chip static label={`${totalGaps} total boundary events`} theme={theme} />
        </View>
        <Text role="micro" tone="muted" theme={theme}>
          {p3Reliable
            ? 'Multi-day patterns live in Journey, What-if estimates in Insights, open times in Sessions, and Focus Windows plus privacy controls in You.'
            : BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginTop: theme.space(2) }}>
          <LinkButton theme={theme} onPress={() => setActiveTab('sessions')}>
            Label opens in Sessions
          </LinkButton>
          <LinkButton theme={theme} onPress={() => setActiveTab('you')}>
            Privacy & data quality in You
          </LinkButton>
        </View>
      </Card>
    </AppShell>
  );
}
