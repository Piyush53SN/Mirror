/**
 * Home chart cards: the 7-day foreground line, the "Where time went" donut and the 24-hour
 * sitting strip. Each chart has a text alternative and a non-gesture way to reach every value.
 * Presentation only. Numbers come from homeCharts.ts and the existing context.
 * Colour separates categories only; it never says good or bad.
 */
import * as React from 'react';
import { Pressable, View } from 'react-native';
import {
  Card,
  Divider,
  Donut,
  LineChart,
  Pill,
  PressScale,
  SegmentedControl,
  Text,
  useTheme,
  type LinePoint,
  type MirrorTheme,
} from '@mirror/ui';
import { DayTimeline, TIMELINE_GUTTER } from './DayTimeline';
import { formatDuration, useMirrorApp, type DailyTotal } from '../context/MirrorAppContext';
import type { WeeklyReportResult } from '@mirror/core-analytics';
import {
  buildDonutSlices,
  buildHourBuckets,
  buildWeekPoints,
  clockLabel,
  hourBounds,
  hourFromX,
  hourLabel,
  weekdayShort,
  WEEK_MIN_RECORDED_DAYS,
} from '../homeCharts';

/* ----------------------------------------------------------- shared bits --- */

/** Info button for "Why these numbers": a 48dp target with an "i" glyph. */
export function InfoButton({ onPress, theme }: { onPress: () => void; theme: MirrorTheme }): React.ReactElement {
  return (
    <Pressable
      testID="home-why-info"
      accessibilityRole="button"
      accessibilityLabel="Why these numbers. How screen time and sittings are counted."
      onPress={onPress}
      hitSlop={6}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 1.5,
          borderColor: theme.color.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text role="micro" theme={theme} style={{ fontWeight: '700', lineHeight: 16 }}>
          i
        </Text>
      </View>
    </Pressable>
  );
}

/** Small "step" control, 48dp, used for previous and next hour. */
function StepButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }): React.ReactElement {
  const theme = useTheme();
  return (
    <Pill theme={theme} variant="secondary" onPress={onPress} testID={testID} accessibilityLabel={label}>
      {label}
    </Pill>
  );
}

/* ------------------------------------------------------ 7-day line chart --- */

/** The day a line point stands for. Range points always carry one; the type leaves it optional. */
export { WeekTrendCard } from './WeekRangeChart';

export function categoryColours(theme: MirrorTheme, count: number): string[] {
  const chart = theme.palette.chart;
  return Array.from({ length: count }, (_, i) => chart[Math.min(i, chart.length - 1)]);
}

export function TimeSplitCard({
  totals,
  sourceLabel,
  onWhy,
  onOpenApp,
}: {
  totals: readonly DailyTotal[];
  sourceLabel: string | null;
  onWhy: () => void;
  onOpenApp: (app: { app: string; label: string }) => void;
}): React.ReactElement {
  const theme = useTheme();
  const slices = buildDonutSlices(totals);
  const total = totals.reduce((sum, t) => sum + t.totalMs, 0);
  const colours = categoryColours(theme, slices.length);
  const segments = slices.map((s, i) => ({ label: s.label, value: s.value, color: colours[i] }));
  const [selected, setSelected] = React.useState<number | null>(null);
  const chosen = selected !== null && selected < slices.length ? selected : null;
  const chosenSlice = chosen !== null ? slices[chosen] : null;
  const chosenPct = chosenSlice && total > 0 ? Math.round((chosenSlice.value / total) * 100) : 0;
  const openSlice = (index: number): void => {
    const s = slices[index];
    if (s?.app) onOpenApp({ app: s.app, label: s.label });
  };
  return (
    <Card theme={theme} style={{ marginBottom: 0 }} glow="violet">
      <View testID="home-time-split" style={{ gap: theme.space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.space(2) }}>
          <View style={{ flex: 1, gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              SHARE OF FOREGROUND TIME
            </Text>
            <Text role="title" theme={theme}>
              Where time went
            </Text>
            {sourceLabel ? (
              <Text role="micro" tone="muted" theme={theme}>
                {sourceLabel}
              </Text>
            ) : null}
          </View>
          <InfoButton onPress={onWhy} theme={theme} />
        </View>
        {segments.length === 0 ? (
          <Text role="label" tone="muted" theme={theme}>
            No app time recorded for this day yet.
          </Text>
        ) : (
          <>
            <View style={{ alignItems: 'center' }}>
              <Donut
                testID="home-time-donut"
                segments={segments}
                theme={theme}
                size={150}
                thickness={14}
                selectedIndex={chosen}
                onSelectSegment={(i) => setSelected((prev) => (prev === i ? null : i))}
                onLongPressSegment={openSlice}
                accessibilityLabel={
                  chosenSlice
                    ? `${chosenSlice.label}, ${formatDuration(chosenSlice.value)}, ${chosenPct}% of foreground time`
                    : `Total foreground time ${formatDuration(total)}. Tap a segment to see one app.`
                }
              >
                <View style={{ alignItems: 'center', width: 96, gap: theme.space(0.5) }}>
                  {chosenSlice ? (
                    <>
                      <Text role="micro" tone="muted" theme={theme} style={{ textAlign: 'center' }}>
                        {chosenSlice.label}
                      </Text>
                      <Text role="label" theme={theme}>
                        {formatDuration(chosenSlice.value)}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${chosenPct}% of day`}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text role="label" theme={theme}>
                        {formatDuration(total)}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        total
                      </Text>
                    </>
                  )}
                </View>
              </Donut>
            </View>
            <View style={{ gap: theme.space(1) }}>
              {segments.map((s, i) => {
                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                const isChosen = chosen === i;
                const canOpen = Boolean(slices[i]?.app);
                return (
                  <PressScale
                    key={s.label}
                    testID={`home-app-row-${i}`}
                    theme={theme}
                    onPress={() => setSelected((prev) => (prev === i ? null : i))}
                    onLongPress={() => openSlice(i)}
                    delayLongPress={450}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isChosen }}
                    accessibilityLabel={`${s.label}, ${formatDuration(s.value)}, ${pct}% of foreground time.${isChosen ? ' Showing in the centre.' : ''}${canOpen ? ' Long press for app details.' : ''}`}
                    style={{
                      minHeight: 48,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.space(2),
                      paddingHorizontal: theme.space(2),
                      borderRadius: theme.radius.md,
                      // Selected: the soft tint with an accent border (one selected style, never a flat grey fill).
                      backgroundColor: isChosen ? theme.palette.chipTint : 'transparent',
                      borderWidth: isChosen ? 1 : 0,
                      borderColor: theme.palette.primaryGradient[0],
                    }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                    <Text role="micro" theme={theme} style={{ flex: 1, fontWeight: isChosen ? '700' : '400' }}>
                      {s.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme} style={{ fontVariant: ['tabular-nums'] }}>
                      {`${pct}%`}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme} style={{ minWidth: 56, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                      {formatDuration(s.value)}
                    </Text>
                  </PressScale>
                );
              })}
            </View>
            {chosenSlice?.app ? (
              <Pill theme={theme} variant="secondary" testID="home-app-details" onPress={() => openSlice(chosen as number)} accessibilityLabel={`App details for ${chosenSlice.label}`}>
                App details
              </Pill>
            ) : null}
          </>
        )}
        <Divider theme={theme} />
        <Text role="micro" tone="muted" theme={theme}>
          Day-clipped foreground time. Each app is counted for the part of the day it was open. Tap a row to show it in the centre; long press for app details.
        </Text>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------- 24-hour strip --- */

export function HourStripCard({
  sessions,
  day,
  labels,
  appOrder,
}: {
  sessions: readonly { id?: string; app: string; startMs: number; endMs: number }[];
  day: string;
  /** App package to label, from the day's totals. */
  labels: Record<string, string>;
  /** Packages in rank order (most used first); sets each sitting's colour. */
  appOrder: readonly string[];
}): React.ReactElement {
  const theme = useTheme();
  const { loadForegroundRange } = useMirrorApp();
  const buckets = React.useMemo(() => buildHourBuckets(sessions, day), [sessions, day]);
  const maxMs = buckets.reduce((m, b) => (b.ms > m ? b.ms : m), 0);
  const busiest = buckets.reduce((best, b) => (b.ms > best.ms ? b : best), buckets[0]);
  const activeHours = buckets.filter((b) => b.ms > 0).length;
  const [hour, setHour] = React.useState<number | null>(null);
  const [width, setWidth] = React.useState(0);
  const [apps, setApps] = React.useState<{ app: string; label: string; totalMs: number }[] | null>(null);
  const barAreaHeight = 64;

  // Changing day clears the chosen hour.
  React.useEffect(() => {
    setHour(null);
    setApps(null);
  }, [day]);

  // Foreground apps for the chosen hour: the same events as the day totals, clipped to the hour.
  React.useEffect(() => {
    if (hour === null || !loadForegroundRange) {
      setApps(null);
      return undefined;
    }
    const bounds = hourBounds(day, hour);
    if (!bounds) return undefined;
    let live = true;
    setApps(null);
    loadForegroundRange(bounds)
      .then((rows) => {
        if (live) setApps(rows);
      })
      .catch(() => {
        if (live) setApps([]);
      });
    return () => {
      live = false;
    };
  }, [hour, day, loadForegroundRange]);

  const move = (delta: number): void => {
    setHour((h) => {
      const base = h ?? (delta > 0 ? -1 : 24);
      const next = base + delta;
      return next < 0 || next > 23 ? h : next;
    });
  };

  const alt =
    maxMs > 0
      ? `Sitting time by hour. Busiest hour ${hourLabel(busiest.hour)} for ${formatDuration(busiest.ms)}. ${activeHours} ${activeHours === 1 ? 'hour' : 'hours'} with sittings. Swipe up or down to move between hours.`
      : 'Sitting time by hour. No sittings recorded for this day.';
  const chosenBucket = hour !== null ? buckets[hour] : null;

  return (
    <Card theme={theme} style={{ marginBottom: 0 }} glow="indigo">
      <View testID="home-hour-strip" style={{ gap: theme.space(2.5) }}>
        <View style={{ gap: theme.space(0.5) }}>
          <Text role="micro" tone="muted" theme={theme}>
            24 HOURS · SITTING TIME
          </Text>
          <Text role="title" theme={theme}>
            Through the day
          </Text>
        </View>
        <DayTimeline sessions={sessions} day={day} labels={labels} appOrder={appOrder} />
        <Pressable
          testID="home-hour-bars"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={alt}
          accessibilityValue={{ text: hour !== null ? `${hourLabel(hour)} selected` : 'No hour selected' }}
          accessibilityActions={[
            { name: 'increment', label: 'Next hour' },
            { name: 'decrement', label: 'Previous hour' },
          ]}
          onAccessibilityAction={(e: { nativeEvent: { actionName: string } }) => move(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            const h = hourFromX(e.nativeEvent.locationX, width);
            setHour((prev) => (prev === h ? null : h));
          }}
          style={{ gap: theme.space(1.5) }}
        >
          <View pointerEvents="none" style={{ height: barAreaHeight, marginLeft: TIMELINE_GUTTER, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            {buckets.map((b) => {
              const h = maxMs > 0 && b.ms > 0 ? Math.max(3, (b.ms / maxMs) * barAreaHeight) : 2;
              const isChosen = hour === b.hour;
              return (
                <View
                  key={b.hour}
                  style={{
                    flex: 1,
                    height: h,
                    borderRadius: 2,
                    backgroundColor: isChosen ? theme.color.ink : b.ms > 0 ? theme.palette.chart[0] : theme.color.borderHairline,
                  }}
                />
              );
            })}
          </View>
          {/* The 00-24 axis is the timeline's, above; the bars sit on the same track, so no second axis. */}
        </Pressable>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
          <StepButton label="Previous hour" testID="home-hour-prev" onPress={() => move(-1)} />
          <StepButton label="Next hour" testID="home-hour-next" onPress={() => move(1)} />
        </View>
        {chosenBucket && hour !== null ? (
          <View testID="home-hour-detail" style={{ gap: theme.space(1.5) }}>
            <Text role="label" theme={theme}>
              {`${hourLabel(hour)}–${hourLabel((hour + 1) % 24)} · ${formatDuration(chosenBucket.ms)} sitting`}
            </Text>
            {apps === null ? (
              <Text role="micro" tone="muted" theme={theme}>
                Loading apps for this hour…
              </Text>
            ) : apps.length === 0 ? (
              <Text role="micro" tone="muted" theme={theme}>
                No foreground time recorded in this hour.
              </Text>
            ) : (
              apps.map((a) => (
                <View key={a.app} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(2), minHeight: 28 }}>
                  <Text role="micro" theme={theme} style={{ flex: 1 }}>
                    {a.label}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {formatDuration(a.totalMs)}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : (
          <Text role="micro" tone="muted" theme={theme}>
            Tap an hour, or use Previous and Next, to see which apps were in use then.
          </Text>
        )}
        <Text role="micro" tone="muted" theme={theme}>
          {maxMs > 0
            ? `Busiest ${hourLabel(busiest.hour)}–${hourLabel((busiest.hour + 1) % 24)}, ${formatDuration(busiest.ms)} sitting.`
            : 'No sittings recorded for this day yet.'}
        </Text>
      </View>
    </Card>
  );
}

