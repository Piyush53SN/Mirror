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
import { P3_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

const GAUGE_TICKS = 18;
const GAUGE_START_DEG = -210;
const GAUGE_SWEEP_DEG = 240;

/**
 * Frosted Horizon segmented 240-degree arc gauge for IQS.
 * Uses only View primitives and @mirror/ui tokens (zero SVG dependency, zero extra live-blur slot),
 * and reports the score against its honest dynamic max (/55 or /75 — never rescaled to 100).
 */
function IqsHeroGauge({
  iqs,
  theme,
}: {
  iqs: Score | null;
  theme: MirrorTheme;
}): React.ReactElement {
  const hasScore = iqs !== null && iqs.value !== null && iqs.max > 0;
  const ratio = hasScore ? Math.max(0, Math.min(1, (iqs.value ?? 0) / iqs.max)) : 0;
  const activeTicks = hasScore ? Math.round(ratio * GAUGE_TICKS) : 0;

  const size = theme.size.ring + theme.space(3); // 108dp
  const center = size / 2;
  const trackRadius = center - theme.space(2);
  const tickWidth = 4;
  const tickHeight = 12;
  const innerSize = size - theme.space(7); // 68dp frosted center medallion

  const a11yLabel =
    hasScore && iqs.value !== null
      ? announceValue(
          'Interaction quality score',
          Math.round(iqs.value),
          `out of ${iqs.max}`,
          `${iqs.band}, never rescaled to 100`,
        )
      : 'Interaction quality score not measured yet';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={{
        min: 0,
        max: hasScore ? iqs.max : 55,
        now: hasScore && iqs.value !== null ? Math.round(iqs.value) : 0,
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
          backgroundColor: theme.glass.card.fill,
          borderWidth: 1,
          borderColor: theme.color.borderHairline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text role="title-lg" theme={theme}>
          {hasScore && iqs.value !== null ? String(Math.round(iqs.value)) : '—'}
        </Text>
        <Text role="micro" tone="muted" theme={theme}>
          {iqs && iqs.max > 0 ? `/ ${iqs.max}` : 'Tier D'}
        </Text>
      </View>
    </View>
  );
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
            {`Mirror's encrypted database was sealed with key "${keyMismatch.oldKey}" but the current key is "${keyMismatch.newKey}". This happens after reinstall, clear data, or when Android restores a backup of the database without its key (SecureStore is not backed up).`}
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

      {/* J3 Frosted Horizon Hero — IQS card with 240-deg arc gauge, measured factor meters & glass shell */}
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
              INTERACTION QUALITY · TIER D
            </Text>
            <Text role="title-lg" theme={theme}>
              Attention signal
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              Out of what Mirror can actually measure — never rescaled to 100
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
          <ConfidenceChip tiers={['D']} label="Tier D · OS usage, no content" theme={theme} />
        </View>

        {iqs ? (
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
                  <Text role="display" theme={theme}>
                    {iqs.value === null ? '—' : String(Math.round(iqs.value))}
                  </Text>
                  {iqs.value !== null ? (
                    <Text role="label" tone="muted" theme={theme}>
                      {`/ ${iqs.max}`}
                    </Text>
                  ) : null}
                </View>
                <Text role="label" theme={theme}>
                  {iqs.band}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {`${sittingCount} sitting${sittingCount === 1 ? '' : 's'} · ${formatDuration(sittingSpanMs)} merged sitting spans`}
                </Text>
              </View>
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
              <Meter
                theme={theme}
                value={iqs.confidence.score}
                label={`Confidence · ${iqs.confidence.level}`}
                caption={`${Math.round(iqs.confidence.score * 100)}%`}
                tone="muted"
              />
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
            body="IQS is not measured yet. Use apps and tap Refresh; Mirror will not fill the gap with estimates."
            theme={theme}
          />
        )}
      </Surface>

      {/* Frosted glass summary metrics: OS foreground screen time vs merged sitting spans */}
      <View style={{ flexDirection: 'row', gap: theme.space(3) }}>
        <Card theme={theme} style={{ flex: 1, marginBottom: 0 }}>
          <Stat
            value={dailyTotals.length > 0 ? formatDuration(totalScreenMs) : '0s'}
            label="OS screen time"
            hint={`Active foreground only · ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}`}
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

      {totalScreenMs > 0 || sittingSpanMs > 0 ? (
        <Callout theme={theme} tone="neutral">
          {`OS screen time (${dailyTotals.length > 0 ? formatDuration(totalScreenMs) : '0s'}) sums active foreground use only, matching Digital Wellbeing. Sitting spans (${sittingCount > 0 ? formatDuration(sittingSpanMs) : '0s'} across ${sittingCount} sitting${sittingCount === 1 ? '' : 's'}) merge reopens of the same app within 15 min into one sitting, so spans include brief pauses and switches between opens.`}
        </Callout>
      ) : null}

      {/* Frosted glass card — Per-app totals from day-clipped OS foreground events */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <SectionHeader
          theme={theme}
          title={`Per-app totals · ${selectedDay}`}
          caption="Day-clipped OS foreground events (matches Digital Wellbeing), excludes launchers, Mirror, and system installers"
        />
        {dailyTotals.length === 0 ? (
          <EmptyState
            title={`No totals for ${selectedDay}`}
            body="Use apps that day, then tap Refresh. Totals sum OS foreground intervals clipped strictly to the local day, matching Digital Wellbeing."
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

      {/* Frosted glass card — Session boundary & quick navigation */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <SectionHeader
          theme={theme}
          title="Session boundary status"
          caption={p3Reliable ? 'Gate open (orphans ≤50, total ≤100)' : 'Hard gate active'}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), marginBottom: theme.space(2) }}>
          <Chip static label={p3Reliable ? 'Boundaries reliable' : 'Gate active'} theme={theme} />
          <Chip static label={`${orphanCount} unmatched`} theme={theme} />
          <Chip static label={`${totalGaps} total boundary events`} theme={theme} />
        </View>
        <Text role="micro" tone="muted" theme={theme}>
          {p3Reliable
            ? 'Multi-day views live in Journey, What-if Estimates in Insights, App opens in Sessions, and Focus Windows + Diagnostics & 7-tap debug in You.'
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
