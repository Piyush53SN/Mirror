/**
 * Home. Order: hero (Attention signal), 7-day chart, time donut, 24-hour sitting strip,
 * budgets, weekly summary, Intent Check. Detail that used to sit on Home (how the numbers are
 * counted, the per-app list, the session boundary status) lives in the Why sheet.
 *
 * Presentation only. Every number comes from the existing context; nothing here computes a metric.
 */
import * as React from 'react';
import { Animated, View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  ConfidenceChip,
  EmptyState,
  LinkButton,
  Pill,
  Surface,
  Text,
  TierBadge,
  announceValue,
  heroTheme,
  useTheme,
  type MirrorTheme,
} from '@mirror/ui';
import type { Score } from '@mirror/core-analytics';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { HomeBudgetStrip } from '../components/HomeBudgetStrip';
import { WeeklySummaryCard } from '../components/WeeklySummaryCard';
import { IntentCheckCard } from '../components/IntentCheckCard';
import { formatDuration, toDayStr, useMirrorApp } from '../context/MirrorAppContext';
import { HourStripCard, TimeSplitCard, WeekTrendCard } from '../components/HomeCharts';

const GAUGE_TICKS = 18;
const GAUGE_START_DEG = -210;
const GAUGE_SWEEP_DEG = 240;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour for tick `idx` of `count` along the single-hue gauge gradient (from -> to). Pure. */
export function gaugeTickColour(idx: number, count: number, from: string, to: string): string {
  const t = count <= 1 ? 1 : idx / (count - 1);
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mixed = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Segmented 240-degree tick gauge for the Attention signal. Filled ticks run teal to indigo
 * (one hue family, never red or green). Filled by measured points (`value / measuredMax`).
 */
function IqsHeroGauge({ iqs, theme, measuredMax }: { iqs: Score | null; theme: MirrorTheme; measuredMax: number }): React.ReactElement {
  const scaleMax = iqs && iqs.max > 0 ? iqs.max : 100;
  const unmeasuredMax = Math.max(0, scaleMax - measuredMax);
  const hasScore = iqs !== null && iqs.value !== null && measuredMax > 0;
  const ratio = hasScore ? Math.max(0, Math.min(1, (iqs.value ?? 0) / measuredMax)) : 0;
  const activeTicks = hasScore ? Math.round(ratio * GAUGE_TICKS) : 0;

  const size = theme.size.ring + theme.space(3); // 108dp
  const center = size / 2;
  const trackRadius = center - theme.space(2);
  const tickWidth = 4;
  const tickHeight = 12;
  const innerSize = size - theme.space(7); // 68dp centre medallion
  const [gaugeFrom, gaugeTo] = theme.palette.gauge;

  const a11yLabel =
    hasScore && iqs && iqs.value !== null
      ? announceValue('Attention signal', Math.round(iqs.value), `of ${measuredMax} measured`, `${iqs.band}, ${unmeasuredMax} points not measured`)
      : 'Attention signal not measured yet';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityValue={{
        min: 0,
        max: Math.max(1, measuredMax),
        now: hasScore && iqs && iqs.value !== null ? Math.round(iqs.value) : 0,
      }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
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
              backgroundColor: filled ? gaugeTickColour(idx, GAUGE_TICKS, gaugeFrom, gaugeTo) : theme.color.borderCard,
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
          {measuredMax > 0 ? `of ${measuredMax}` : 'unmeasured'}
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

/**
 * The hero is a solid tile in both appearances. Kept as an alias of the shared `heroTheme`
 * (palette hero colours), so existing imports keep working.
 */
export const inverseHeroTheme = heroTheme;

// Set once per app session: the hero number settles on first load only, not on every tab switch.
let heroSettled = false;

/** Fades and lifts the hero numeral once. Off under reduce-motion (duration 0). */
function SettleOnce({ theme, children }: { theme: MirrorTheme; children: React.ReactNode }): React.ReactElement {
  const anim = React.useRef(new Animated.Value(heroSettled ? 1 : 0)).current;
  React.useEffect(() => {
    if (heroSettled) return;
    heroSettled = true;
    const duration = theme.motion('base');
    if (duration <= 0) {
      anim.setValue(1);
      return;
    }
    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }).start();
  }, [anim, theme]);
  const style = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };
  return <Animated.View style={style}>{children}</Animated.View>;
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
    checkPermissionAndCollect,
    setActiveTab,
    weeklyReport,
  } = useMirrorApp();
  const hero = React.useMemo(() => heroTheme(theme), [theme]);

  const totalScreenMs = React.useMemo(() => dailyTotals.reduce((sum, item) => sum + item.totalMs, 0), [dailyTotals]);
  const sittingCount = dayScoredSessions.length;
  const measuredMax = React.useMemo(() => {
    if (!iqs) return 0;
    if (typeof iqs.measuredMax === 'number') return iqs.measuredMax;
    return iqs.factors.filter((f) => f.measurable && f.max > 0).reduce((sum, f) => sum + f.max, 0);
  }, [iqs]);
  const unmeasuredMax = Math.max(0, (iqs && iqs.max > 0 ? iqs.max : 100) - measuredMax);

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

  const sourceLabel =
    dailyTotalsSource === 'stored_events'
      ? 'Stored · Mirror events'
      : dailyTotalsSource === 'os_bucket_approx'
        ? 'Approximate · OS daily buckets'
        : 'Day-clipped OS foreground events · matches Digital Wellbeing';

  const openWhy = (): void => setShowWhy(true);

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
      <Text role="micro" tone="muted" theme={theme}>
        {`${lastCollect ?? 'Collector idle'} · On-device · encrypted`}
      </Text>

      {error ? (
        <Callout theme={theme} tone="limit">
          {error}
        </Callout>
      ) : null}

      {keyMismatch ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <Text role="title" theme={theme}>
            Stored data can&apos;t be read
          </Text>
          <Text role="micro" tone="muted" theme={theme}>
            {`Sealed with key "${keyMismatch.oldKey}", current key "${keyMismatch.newKey}"`}
          </Text>
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

      {/* 1. Hero: Attention signal, measured points, unmeasured points listed separately */}
      <Surface
        radius="hero"
        theme={hero}
        style={{ padding: theme.space(4), borderWidth: 1, borderColor: hero.color.borderHairline, gap: theme.space(3) }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2) }}>
          <View style={{ flex: 1, gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={hero}>
              ATTENTION SIGNAL · MEASURED POINTS
            </Text>
            <Text role="label" tone="muted" theme={hero}>
              Unmeasured points are listed separately
            </Text>
          </View>
          <TierBadge tier="D" theme={hero} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
          {isToday || iqs?.provisional ? <Chip static label="Today so far, provisional" theme={hero} /> : null}
          <Chip static label="Based on usage patterns only" theme={hero} />
          {iqs && iqs.confidence.sample > 0 && iqs.confidence.smallSample ? <Chip static label="Small sample" theme={hero} /> : null}
          <ConfidenceChip tiers={['D']} label="OS usage · no app content" theme={hero} />
        </View>

        {hasEventsWithoutSittings ? (
          <EmptyState
            title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
            body={`Per-app screen time is available (${formatDuration(totalScreenMs)} across ${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'}), while derived sittings for ${selectedDay} are empty. Tap Refresh sittings to rebuild them.`}
            action={
              <Pill theme={hero} onPress={checkPermissionAndCollect}>
                Refresh sittings
              </Pill>
            }
            theme={hero}
          />
        ) : iqs ? (
          <View style={{ gap: theme.space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(4) }}>
              <IqsHeroGauge iqs={iqs} theme={hero} measuredMax={measuredMax} />
              <View style={{ flex: 1, gap: theme.space(1) }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                  <SettleOnce theme={hero}>
                    <Text role={iqs.value === null ? 'title-lg' : 'display'} theme={hero}>
                      {iqs.value === null ? 'Not enough activity yet' : String(Math.round(iqs.value))}
                    </Text>
                  </SettleOnce>
                  {iqs.value !== null ? (
                    <Text role="label" tone="muted" theme={hero}>
                      {`of ${measuredMax} measured`}
                    </Text>
                  ) : null}
                </View>
                <Text role="label" theme={hero}>
                  {isToday || iqs.provisional ? 'Today so far, provisional' : iqs.band}
                </Text>
                <Text role="micro" tone="muted" theme={hero}>
                  {`${unmeasuredMax} points not measured (listed separately)`}
                </Text>
                <Text role="micro" tone="muted" theme={hero}>
                  {`${sittingCount} sitting${sittingCount === 1 ? '' : 's'} · ${formatDuration(sittingSpanMs)} merged sitting spans`}
                </Text>
              </View>
            </View>

            <View testID="home-plain-sentence" style={{ gap: theme.space(1) }}>
              <Text role="micro" tone="muted" theme={hero}>
                DAY IN PLAIN WORDS
              </Text>
              <Text role="body" theme={hero}>
                {homeSentence}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), alignItems: 'center' }}>
              <Pill theme={hero} onPress={openWhy}>
                Why this score
              </Pill>
              <LinkButton theme={hero} onPress={() => setActiveTab('insights')}>
                Explore Insights
              </LinkButton>
            </View>
          </View>
        ) : (
          <EmptyState
            title={`No usage data for ${selectedDay}`}
            body="Your score appears once enough activity is recorded. Mirror never fills gaps with guesses."
            theme={hero}
          />
        )}
      </Surface>

      {/* 2. Seven-day chart */}
      <WeekTrendCard report={weeklyReport} selectedDay={selectedDay} />

      {/* 3. Where time went: donut with its source and a link to the numbers */}
      <TimeSplitCard totals={dailyTotals} sourceLabel={sourceLabel} onWhy={openWhy} />

      {/* 4. Sitting time through the 24 hours */}
      <HourStripCard sessions={dayScoredSessions} day={selectedDay} />

      {/* 5. Attention budgets (same day-clipped foreground totals as Home) */}
      <HomeBudgetStrip />

      {/* 6. Weekly summary (same engine as the full report) */}
      <WeeklySummaryCard />

      {/* 7. Optional one-tap Intent Check question (off by default) */}
      <IntentCheckCard />
    </AppShell>
  );
}
