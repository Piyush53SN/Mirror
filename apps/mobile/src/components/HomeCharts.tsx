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
import Svg, { Rect } from 'react-native-svg';
import { formatDuration, useMirrorApp, type DailyTotal } from '../context/MirrorAppContext';
import type { WeeklyReportResult } from '@mirror/core-analytics';
import {
  buildDonutSlices,
  buildHourBuckets,
  buildRangePoints,
  buildWeekPoints,
  clockLabel,
  hourBounds,
  hourFromX,
  hourLabel,
  rangeDaysChronological,
  ribbonBlocks,
  ribbonIndexAt,
  type RangeDays,
  type RibbonBlock,
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
function dayOf(p: LinePoint | null | undefined): string {
  return p?.day ?? '';
}

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: 'Month' },
];

/**
 * The line chart with a range selector: 7 days (from the weekly report), 14 days or the last 30
 * ("Month"). Days with no recorded data are gaps, never zero. Today is partial: hollow, labelled,
 * never extrapolated. The longer ranges step with Previous and Next, so no value needs a drag.
 */
export function WeekTrendCard({
  report,
  selectedDay,
  todayDay,
  historyStartDay,
}: {
  report: WeeklyReportResult | null | undefined;
  selectedDay: string;
  todayDay: string;
  historyStartDay: string | null;
}): React.ReactElement {
  const theme = useTheme();
  const { setSelectedDay, loadDayTotalsRange } = useMirrorApp();
  const [range, setRange] = React.useState<RangeDays>(7);
  const [longValues, setLongValues] = React.useState<(number | null)[] | null>(null);
  const longDays = React.useMemo(() => rangeDaysChronological(todayDay, range), [todayDay, range]);

  React.useEffect(() => {
    if (range === 7 || !loadDayTotalsRange) {
      setLongValues(null);
      return undefined;
    }
    let live = true;
    setLongValues(null);
    // A day is recorded only from the history start up to today. Anything earlier is unmeasured.
    const flags = longDays.map((day) => ({ day, recorded: historyStartDay !== null && day >= historyStartDay && day <= todayDay }));
    loadDayTotalsRange(flags)
      .then((values) => {
        if (live) setLongValues(values);
      })
      .catch(() => {
        if (live) setLongValues(flags.map(() => null));
      });
    return () => {
      live = false;
    };
  }, [range, longDays, historyStartDay, todayDay, loadDayTotalsRange]);

  const points: LinePoint[] | null =
    range === 7
      ? buildWeekPoints(report, selectedDay)
      : longValues
        ? buildRangePoints(longDays, longValues, selectedDay, todayDay)
        : null;
  const recorded = points ? points.filter((p) => p.value !== null).length : 0;
  const selectDay = (index: number): void => {
    const day = dayOf(points?.[index]);
    if (day && day !== selectedDay) setSelectedDay(day);
  };
  const selectedIndex = points ? points.findIndex((p) => p.selected) : -1;
  const step = (delta: 1 | -1): void => {
    if (!points || points.length === 0) return;
    // Nothing selected in this range yet: start from today (the newest day).
    const from = selectedIndex < 0 ? points.length - 1 : selectedIndex;
    const next = points[from + delta];
    if (next && dayOf(next) !== selectedDay) setSelectedDay(dayOf(next));
  };
  const selectedPoint = selectedIndex >= 0 && points ? points[selectedIndex] : null;

  return (
    <Card theme={theme} style={{ marginBottom: 0 }} glow="teal">
      <View testID="home-week-trend" style={{ gap: theme.space(2.5) }}>
        <View style={{ gap: theme.space(0.5) }}>
          <Text role="micro" tone="muted" theme={theme}>
            {`${range === 30 ? 'LAST 30 DAYS' : `LAST ${range} DAYS`} · FOREGROUND TIME`}
          </Text>
          <Text role="title" theme={theme}>
            Day by day
          </Text>
        </View>
        <SegmentedControl
          label="Chart range"
          options={RANGE_OPTIONS}
          value={String(range)}
          onChange={(v) => setRange(Number(v) as RangeDays)}
          theme={theme}
        />
        {points ? (
          <>
            <LineChart
              testID="home-week-line"
              points={points}
              theme={theme}
              formatValue={formatDuration}
              title={`Foreground time, last ${range} days`}
              showAverage
              onSelectIndex={selectDay}
            />
            <Text role="micro" tone="muted" theme={theme}>
              {`${recorded} of ${range} days recorded. Drag across the chart to read a day, or tap a day to open it on Home.`}
            </Text>
            {range === 7 ? (
              /* Every value, reachable without dragging: one 48dp button per day. */
              <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
                {points.map((p, i) => {
                  const valueText = p.value === null ? 'no data' : formatDuration(p.value);
                  return (
                    <PressScale
                      key={dayOf(p)}
                      testID={`home-day-${dayOf(p)}`}
                      theme={theme}
                      onPress={() => selectDay(i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: p.selected }}
                      accessibilityLabel={`${weekdayShort(dayOf(p))}, ${valueText}${p.partial ? ', partial day' : ''}${p.selected ? ', selected' : ''}. Open this day.`}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        borderRadius: theme.radius.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: p.selected ? theme.color.anchor : 'transparent',
                        paddingVertical: theme.space(1),
                      }}
                    >
                      <Text role="micro" theme={theme} style={{ color: p.selected ? theme.color.onAnchor : theme.color.ink, fontWeight: '600' }}>
                        {weekdayShort(dayOf(p))}
                      </Text>
                      <Text role="micro" theme={theme} style={{ color: p.selected ? theme.color.onAnchor : theme.color.inkMuted }}>
                        {p.value === null ? '–' : formatDuration(p.value)}
                      </Text>
                    </PressScale>
                  );
                })}
              </View>
            ) : (
              <View style={{ gap: theme.space(2) }}>
                <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
                  <Pill theme={theme} variant="secondary" testID="home-range-prev" onPress={() => step(-1)} accessibilityLabel="Previous day in this range">
                    Previous day
                  </Pill>
                  <Pill theme={theme} variant="secondary" testID="home-range-next" onPress={() => step(1)} accessibilityLabel="Next day in this range">
                    Next day
                  </Pill>
                </View>
                <View testID="home-range-readout">
                <Text role="micro" tone="muted" theme={theme}>
                  {selectedPoint
                    ? `${weekdayShort(dayOf(selectedPoint))} ${selectedPoint.label}: ${selectedPoint.value === null ? 'no data recorded' : formatDuration(selectedPoint.value)}${selectedPoint.partial ? ' (partial, today so far)' : ''}`
                    : 'Choose a day with Previous or Next, or drag across the chart.'}
                </Text>
                </View>
              </View>
            )}
            {report && report.isPartialWeek && range === 7 ? (
              <Text role="micro" tone="muted" theme={theme}>
                {`Partial week: ${recorded} of 7 days recorded. Hollow dots are partial days. Gaps are days with no data, not zero.`}
              </Text>
            ) : null}
          </>
        ) : (
          <Text role="label" tone="muted" theme={theme}>
            {range === 7
              ? `A week view needs at least ${WEEK_MIN_RECORDED_DAYS} recorded days. Coming with more data.`
              : 'Loading this range…'}
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Category colours from the palette, in order. Each is >= 3:1 against the card tile. */
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
                      backgroundColor: isChosen ? theme.glass.chip.fill : 'transparent',
                    }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                    <Text role="micro" theme={theme} style={{ flex: 1, fontWeight: isChosen ? '700' : '400' }}>
                      {s.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${pct}% · ${formatDuration(s.value)}`}
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

/**
 * The day ribbon: one coloured block per sitting across the local day, coloured by app rank. Tap a
 * block (or tap a row in the list, which is the 48dp route for every sitting) to see its app and
 * times. The blocks are sittings, not screen time, and the colour only tells apart categories.
 */
function DayRibbon({
  blocks,
  labels,
  day,
}: {
  blocks: RibbonBlock[];
  labels: Record<string, string>;
  day: string;
}): React.ReactElement {
  const theme = useTheme();
  const [width, setWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [listOpen, setListOpen] = React.useState(false);
  const palette = theme.palette.chart;
  const colourOf = (b: RibbonBlock): string => palette[Math.min(b.colourIndex, palette.length - 1)];
  const labelOf = (app: string): string => labels[app] ?? app;
  const sel = picked !== null ? blocks[picked] : null;

  React.useEffect(() => {
    setPicked(null);
    setListOpen(false);
  }, [day]);

  const pick = (i: number | null): void => setPicked((prev) => (i !== null && prev === i ? null : i));
  const alt =
    blocks.length === 0
      ? 'No sittings recorded for this day.'
      : `${blocks.length} ${blocks.length === 1 ? 'sitting' : 'sittings'} across the day, coloured by app. Use the sittings list to reach each one.`;

  return (
    <View testID="home-day-ribbon" style={{ gap: theme.space(1.5) }}>
      <Pressable
        testID="home-day-ribbon-track"
        accessibilityRole="image"
        accessibilityLabel={alt}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (width <= 0) return;
          pick(ribbonIndexAt(blocks, e.nativeEvent.locationX / width, 0.03));
        }}
        style={{ minHeight: theme.size.touchTarget, justifyContent: 'center' }}
      >
        <Svg width="100%" height={24} viewBox="0 0 1000 24" preserveAspectRatio="none">
          {blocks.map((b, i) => (
            <Rect
              key={b.key}
              x={b.left * 1000}
              y={0}
              width={Math.max(6, b.width * 1000)}
              height={24}
              rx={4}
              fill={colourOf(b)}
              stroke={picked === i ? theme.color.ink : 'none'}
              strokeWidth={picked === i ? 3 : 0}
            />
          ))}
        </Svg>
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} pointerEvents="none">
        <Text role="micro" tone="muted" theme={theme}>00</Text>
        <Text role="micro" tone="muted" theme={theme}>06</Text>
        <Text role="micro" tone="muted" theme={theme}>12</Text>
        <Text role="micro" tone="muted" theme={theme}>18</Text>
        <Text role="micro" tone="muted" theme={theme}>24</Text>
      </View>
      {sel ? (
        <View testID="home-day-ribbon-detail" style={{ gap: theme.space(0.5) }}>
          <Text role="label" theme={theme}>
            {labelOf(sel.app)}
          </Text>
          <Text role="micro" tone="muted" theme={theme}>
            {`${clockLabel(sel.startMs)} to ${clockLabel(sel.endMs)} · ${formatDuration(sel.endMs - sel.startMs)} sitting, clipped to this day`}
          </Text>
        </View>
      ) : (
        <Text role="micro" tone="muted" theme={theme}>
          {blocks.length > 0 ? 'Tap a block to see its app and times.' : 'No sittings recorded for this day yet.'}
        </Text>
      )}
      {blocks.length > 0 ? (
        <View style={{ gap: theme.space(1) }}>
          <Pill
            testID="home-day-ribbon-list-toggle"
            variant="secondary"
            onPress={() => setListOpen((o) => !o)}
            accessibilityLabel={listOpen ? 'Hide the sittings list' : `Show the sittings list, ${blocks.length} sittings`}
          >
            {listOpen ? 'Hide sittings' : `List sittings (${blocks.length})`}
          </Pill>
          {listOpen
            ? blocks.map((b, i) => (
                <PressScale
                  key={`row-${b.key}`}
                  testID={`home-sitting-${i}`}
                  theme={theme}
                  onPress={() => pick(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked === i }}
                  accessibilityLabel={`${labelOf(b.app)}, ${clockLabel(b.startMs)} to ${clockLabel(b.endMs)}, ${formatDuration(b.endMs - b.startMs)}.${picked === i ? ' Selected.' : ''}`}
                  style={{
                    minHeight: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space(2),
                    paddingHorizontal: theme.space(2),
                    borderRadius: theme.radius.md,
                    backgroundColor: picked === i ? theme.palette.chipTint : 'transparent',
                  }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colourOf(b) }} />
                  <Text role="micro" theme={theme} style={{ flex: 1 }}>
                    {labelOf(b.app)}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`${clockLabel(b.startMs)}–${clockLabel(b.endMs)}`}
                  </Text>
                </PressScale>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

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
  const blocks = React.useMemo(() => ribbonBlocks(sessions, day, appOrder), [sessions, day, appOrder]);
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
        <DayRibbon blocks={blocks} labels={labels} day={day} />
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
          <View pointerEvents="none" style={{ height: barAreaHeight, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
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
          <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text role="micro" tone="muted" theme={theme}>00</Text>
            <Text role="micro" tone="muted" theme={theme}>12</Text>
            <Text role="micro" tone="muted" theme={theme}>23</Text>
          </View>
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

