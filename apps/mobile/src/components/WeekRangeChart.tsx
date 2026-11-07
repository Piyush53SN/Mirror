/**
 * The Home line chart: 7 days, 14 days or Month (the last 30). Presentation only: every value is the
 * existing per-day foreground total (the same source as the donut), read through loadDayTotalsRange.
 *
 * Window rules (alpha.9):
 *  - the window ends today (or the latest day), and is not moved by selecting a day inside it;
 *  - it moves only through Previous/Next at an edge, or when a day outside it is picked;
 *  - loaded days are cached, so a day inside the window fetches nothing; a stale response is dropped;
 *  - the chart stays mounted while a range loads (a skeleton sits over it).
 * Gaps are days with no data, never zero. Days before history are "before history". Today is partial.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Callout, Card, LineChart, PressScale, SegmentedControl, SelectedGradient, Text, useTheme, type LinePoint } from '@mirror/ui';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';
import {
  addDays,
  chartSeries,
  missingDays,
  niceTicks,
  rangeDaysChronological,
  stepSelection,
  tickLabel,
  tooltipDayLabel,
  weekdayShort,
  windowEndFor,
  type RangeDays,
} from '../homeCharts';

/** Below this many recorded days in total, the chart is replaced by an honest empty state. */
export const CHART_MIN_RECORDED_DAYS = 3;

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: 'Month' },
];

function uniq(days: readonly string[]): string[] {
  return [...new Set(days)];
}

export function WeekTrendCard({
  selectedDay,
  todayDay,
  historyStartDay,
}: {
  /** Kept for callers that still pass the weekly report; the chart reads per-day totals instead. */
  report?: unknown;
  selectedDay: string;
  todayDay: string;
  historyStartDay: string | null;
}): React.ReactElement {
  const theme = useTheme();
  const { setSelectedDay, loadDayTotalsRange, recordedDayCount = 0 } = useMirrorApp();
  const [range, setRange] = React.useState<RangeDays>(7);
  const [endDay, setEndDay] = React.useState(todayDay);
  const [, setTick] = React.useState(0);
  const [inFlight, setInFlight] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const cacheRef = React.useRef(new Map<string, number | null>());
  const latestRef = React.useRef(0);
  const enough = recordedDayCount >= CHART_MIN_RECORDED_DAYS;

  // The window moves only when the selection lands outside it (for example from the day strip).
  React.useEffect(() => {
    setEndDay((current) => windowEndFor(selectedDay, current, range, todayDay));
  }, [selectedDay, range, todayDay]);

  const days = React.useMemo(() => rangeDaysChronological(endDay, range), [endDay, range]);
  // The 7-day comparison needs the seven days before the selected day, so they are fetched too.
  const refDays = React.useMemo(() => rangeDaysChronological(addDays(selectedDay, -1), 7), [selectedDay]);
  const fetchKey = uniq([...days, ...refDays]).join('|');

  React.useEffect(() => {
    if (!loadDayTotalsRange || !enough) return undefined;
    const wanted = fetchKey.split('|');
    const missing = missingDays(wanted, cacheRef.current, historyStartDay, todayDay);
    if (missing.length === 0) {
      setInFlight(false);
      return undefined;
    }
    const token = latestRef.current + 1;
    latestRef.current = token;
    setInFlight(true);
    setFailed(false);
    loadDayTotalsRange(missing.map((day) => ({ day, recorded: true })))
      .then((values) => {
        // A response for an older request is stale: drop it, the latest request covers its days.
        if (token !== latestRef.current) return;
        missing.forEach((day, i) => cacheRef.current.set(day, values[i] ?? null));
        setInFlight(false);
        setTick((t) => t + 1);
      })
      .catch(() => {
        if (token !== latestRef.current) return;
        setInFlight(false);
        setFailed(true);
      });
    return undefined;
  }, [fetchKey, historyStartDay, todayDay, loadDayTotalsRange, enough]);

  const totals = cacheRef.current;
  const formatValue = formatDuration;
  const seriesAll = chartSeries({ days, totals, historyStartDay, todayDay, selectedDay, formatValue });
  const points: LinePoint[] = seriesAll.map((p) => ({
    label: p.label,
    value: p.value,
    partial: p.partial,
    selected: p.selected,
    day: p.day,
    tooltip: p.tooltip,
    note: p.gap,
  }));
  const recorded = seriesAll.filter((p) => p.value !== null && !p.partial).length;
  const pendingCount = missingDays(days, totals, historyStartDay, todayDay).length;
  // Y ticks: 0, 2h, 4h, 6h (a 2-hour step, widened only when the range is very long).
  const topValue = points.reduce((m, p) => (p.value !== null && p.value > m ? p.value : m), 0);
  const yTicks = React.useMemo(() => niceTicks(topValue), [topValue]);

  // Neutral comparison: the selected day against the mean of the 7 days before it (recorded, not partial).
  const ref = refDays.map((day) => ({ day, value: totals.get(day) ?? null, before: historyStartDay !== null && day < historyStartDay }));
  const refValues = ref.filter((r) => !r.before && r.value !== null && r.day !== todayDay).map((r) => r.value as number);
  const selectedValue = totals.has(selectedDay) ? totals.get(selectedDay) ?? null : null;
  const selectedIsPartial = selectedDay === todayDay;
  const comparison =
    enough && refValues.length >= CHART_MIN_RECORDED_DAYS && selectedValue !== null && !selectedIsPartial
      ? (() => {
          const avg = refValues.reduce((a, b) => a + b, 0) / refValues.length;
          const diff = selectedValue - avg;
          if (Math.round(diff / 60000) === 0) return `${weekdayShort(selectedDay)}: same as your 7-day average`;
          return `${weekdayShort(selectedDay)}: ${formatDuration(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} your 7-day average`;
        })()
      : null;

  const select = (day: string): void => {
    if (day !== selectedDay) setSelectedDay(day);
  };
  const selectIndex = (index: number): void => {
    const p = seriesAll[index];
    if (p) select(p.day);
  };
  const selectedIndex = seriesAll.findIndex((p) => p.selected);
  const step = (direction: 1 | -1): void => {
    const next = stepSelection(selectedDay, direction, endDay, range, todayDay);
    if (next.endDay !== endDay) setEndDay(next.endDay);
    select(next.selectedDay);
  };
  const selectedPoint = selectedIndex >= 0 ? seriesAll[selectedIndex] : null;

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
        {enough ? (
          <SegmentedControl label="Chart range" options={RANGE_OPTIONS} value={String(range)} onChange={(v) => setRange(Number(v) as RangeDays)} theme={theme} />
        ) : null}
        {!enough ? (
          <Callout theme={theme}>
            {`A multi-day view needs at least ${CHART_MIN_RECORDED_DAYS} recorded days. Coming with more data.`}
          </Callout>
        ) : (
          <>
            <LineChart
              testID="home-week-line"
              points={points}
              theme={theme}
              formatValue={formatValue}
              formatTick={tickLabel}
              yTicks={yTicks}
              title={`Foreground time, ${range === 30 ? 'last 30 days' : `last ${range} days`}`}
              showAverage
              loading={inFlight && pendingCount > 0}
              onSelectIndex={selectIndex}
            />
            {failed ? (
              <Callout theme={theme}>
                Could not load these days. Pick the range again to retry.
              </Callout>
            ) : null}
            <Text role="micro" tone="muted" theme={theme}>
              {`${recorded} of ${range} days recorded. Gaps are days with no data, never zero. Today is partial: a dashed hollow end, today so far, left out of the average.`}
            </Text>
            {comparison ? (
              <View
                testID="home-compare-chip"
                accessibilityLabel={`Compared with your 7-day average: ${comparison}`}
                style={{ alignSelf: 'flex-start', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderCard, backgroundColor: theme.palette.chipTint, paddingHorizontal: theme.space(3), paddingVertical: theme.space(1.5), maxWidth: '100%' }}
              >
                <Text role="micro" theme={theme}>
                  {comparison}
                </Text>
              </View>
            ) : null}
            {range === 7 ? (
              // Every value reachable without dragging: one 48dp control per day in the window.
              <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
                {seriesAll.map((p) => {
                  const valueText = p.value === null ? (p.gap ?? 'no data') : formatDuration(p.value);
                  return (
                    <PressScale
                      key={p.day}
                      testID={`home-day-${p.day}`}
                      theme={theme}
                      onPress={() => select(p.day)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: p.selected }}
                      accessibilityLabel={`${tooltipDayLabel(p.day)}, ${valueText}${p.partial ? ', today so far' : ''}${p.selected ? ', selected' : ''}. Open this day.`}
                      style={{ flex: 1, minHeight: 48, borderRadius: theme.radius.pill }}
                    >
                      <View
                        // The gradient is the owner of the white text on a selected chip (audited for contrast).
                        data-gradient={p.selected ? [theme.palette.primaryGradient[0], theme.palette.primaryGradient[1]] : undefined}
                        style={{
                          flex: 1,
                          minHeight: 48,
                          borderRadius: theme.radius.pill,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          borderWidth: p.selected ? 0 : 1,
                          borderColor: theme.color.borderCard,
                          paddingVertical: theme.space(1),
                        }}
                      >
                        {p.selected ? <SelectedGradient t={theme} /> : null}
                      <Text role="micro" theme={theme} style={{ color: p.selected ? theme.palette.primaryInk : theme.color.ink, fontWeight: '600' }}>
                        {weekdayShort(p.day)}
                      </Text>
                      <Text role="micro" theme={theme} style={{ color: p.selected ? theme.palette.primaryInk : theme.color.inkMuted }}>
                        {p.value === null ? '–' : formatDuration(p.value)}
                      </Text>
                      </View>
                    </PressScale>
                  );
                })}
              </View>
            ) : (
              <View style={{ gap: theme.space(2) }}>
                <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
                  <PressScale testID="home-range-prev" theme={theme} onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous day in this range" style={{ minHeight: 48, paddingHorizontal: theme.space(3), justifyContent: 'center', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderCard }}>
                    <Text role="label" theme={theme}>Previous day</Text>
                  </PressScale>
                  <PressScale testID="home-range-next" theme={theme} onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next day in this range" style={{ minHeight: 48, paddingHorizontal: theme.space(3), justifyContent: 'center', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderCard }}>
                    <Text role="label" theme={theme}>Next day</Text>
                  </PressScale>
                </View>
                <View testID="home-range-readout">
                <Text role="micro" tone="muted" theme={theme}>
                  {selectedPoint
                    ? `${tooltipDayLabel(selectedPoint.day)}: ${selectedPoint.value === null ? selectedPoint.gap ?? 'no data' : formatDuration(selectedPoint.value)}${selectedPoint.partial ? ' (today so far)' : ''}`
                    : 'Choose a day with Previous or Next, or tap the chart.'}
                </Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </Card>
  );
}

