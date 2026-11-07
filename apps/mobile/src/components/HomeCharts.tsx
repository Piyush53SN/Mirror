/**
 * Home chart cards: the 7-day foreground line, the "Where time went" donut and the 24-hour
 * sitting strip. Presentation only. Numbers come from homeCharts.ts, which reads existing
 * analytics output. Colour separates categories only; it never says good or bad.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Card, Divider, Donut, LineChart, Pill, Text, useTheme, type MirrorTheme } from '@mirror/ui';
import { formatDuration, type DailyTotal } from '../context/MirrorAppContext';
import type { WeeklyReportResult } from '@mirror/core-analytics';
import {
  buildDonutSlices,
  buildHourBuckets,
  buildWeekPoints,
  hourLabel,
  WEEK_MIN_RECORDED_DAYS,
} from '../homeCharts';

export function WeekTrendCard({
  report,
  selectedDay,
}: {
  report: WeeklyReportResult | null | undefined;
  selectedDay: string;
}): React.ReactElement {
  const theme = useTheme();
  const points = buildWeekPoints(report, selectedDay);
  const recorded = report ? report.perDay.filter((d) => d.recorded).length : 0;
  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="home-week-trend" style={{ gap: theme.space(2.5) }}>
        <View style={{ gap: theme.space(0.5) }}>
          <Text role="micro" tone="muted" theme={theme}>
            LAST 7 DAYS · FOREGROUND TIME
          </Text>
          <Text role="title" theme={theme}>
            Day by day
          </Text>
        </View>
        {points ? (
          <>
            <LineChart
              testID="home-week-line"
              points={points}
              theme={theme}
              formatValue={formatDuration}
              title="Foreground time, last 7 days"
            />
            {report && report.isPartialWeek ? (
              <Text role="micro" tone="muted" theme={theme}>
                {`Partial week: ${recorded} of 7 days recorded. Hollow dots are partial days. Gaps are days with no data, not zero.`}
              </Text>
            ) : null}
          </>
        ) : (
          <Text role="label" tone="muted" theme={theme}>
            {`A week view needs at least ${WEEK_MIN_RECORDED_DAYS} recorded days. Coming with more data.`}
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
}: {
  totals: readonly DailyTotal[];
  sourceLabel: string | null;
  onWhy: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const slices = buildDonutSlices(totals);
  const total = totals.reduce((sum, t) => sum + t.totalMs, 0);
  const colours = categoryColours(theme, slices.length);
  const segments = slices.map((s, i) => ({ label: s.label, value: s.value, color: colours[i] }));
  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="home-time-split" style={{ gap: theme.space(3) }}>
        <View style={{ gap: theme.space(0.5) }}>
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
        {segments.length === 0 ? (
          <Text role="label" tone="muted" theme={theme}>
            No app time recorded for this day yet.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3), flexWrap: 'wrap' }}>
            <Donut testID="home-time-donut" segments={segments} theme={theme} size={128} thickness={14}>
              <Text role="label" theme={theme}>
                {formatDuration(total)}
              </Text>
            </Donut>
            <View style={{ flex: 1, minWidth: 160, gap: theme.space(2) }}>
              {segments.map((s) => (
                <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2) }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                  <Text role="micro" theme={theme} style={{ flex: 1 }}>
                    {s.label}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {total > 0 ? `${Math.round((s.value / total) * 100)}% · ${formatDuration(s.value)}` : '0%'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <Divider theme={theme} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme} style={{ flex: 1, minWidth: 180 }}>
            Day-clipped foreground time. Each app is counted for the part of the day it was open.
          </Text>
          <Pill theme={theme} variant="secondary" onPress={onWhy} accessibilityLabel="Why these numbers">
            Why these numbers
          </Pill>
        </View>
      </View>
    </Card>
  );
}

/** Sitting time per clock hour for the day. Bars are decorative; the text alternative carries the values. */
export function HourStripCard({
  sessions,
  day,
}: {
  sessions: readonly { startMs: number; endMs: number }[];
  day: string;
}): React.ReactElement {
  const theme = useTheme();
  const buckets = React.useMemo(() => buildHourBuckets(sessions, day), [sessions, day]);
  const maxMs = buckets.reduce((m, b) => (b.ms > m ? b.ms : m), 0);
  const busiest = buckets.reduce((best, b) => (b.ms > best.ms ? b : best), buckets[0]);
  const activeHours = buckets.filter((b) => b.ms > 0).length;
  const barAreaHeight = 64;
  const alt =
    maxMs > 0
      ? `Sitting time by hour. Busiest hour ${hourLabel(busiest.hour)} for ${formatDuration(busiest.ms)}. ${activeHours} ${activeHours === 1 ? 'hour' : 'hours'} with sittings.`
      : 'Sitting time by hour. No sittings recorded for this day.';
  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="home-hour-strip" style={{ gap: theme.space(2.5) }}>
        <View style={{ gap: theme.space(0.5) }}>
          <Text role="micro" tone="muted" theme={theme}>
            24 HOURS · SITTING TIME
          </Text>
          <Text role="title" theme={theme}>
            Through the day
          </Text>
        </View>
        <View accessible accessibilityRole="image" accessibilityLabel={alt} style={{ gap: theme.space(1.5) }}>
          <View style={{ height: barAreaHeight, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            {buckets.map((b) => {
              const h = maxMs > 0 && b.ms > 0 ? Math.max(3, (b.ms / maxMs) * barAreaHeight) : 2;
              return (
                <View
                  key={b.hour}
                  importantForAccessibility="no"
                  style={{
                    flex: 1,
                    height: h,
                    borderRadius: 2,
                    backgroundColor: b.ms > 0 ? theme.palette.chart[0] : theme.color.borderHairline,
                  }}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} importantForAccessibility="no">
            <Text role="micro" tone="muted" theme={theme}>00</Text>
            <Text role="micro" tone="muted" theme={theme}>12</Text>
            <Text role="micro" tone="muted" theme={theme}>23</Text>
          </View>
        </View>
        <Text role="micro" tone="muted" theme={theme}>
          {maxMs > 0
            ? `Busiest ${hourLabel(busiest.hour)}–${hourLabel((busiest.hour + 1) % 24)}, ${formatDuration(busiest.ms)} sitting.`
            : 'No sittings recorded for this day yet.'}
        </Text>
      </View>
    </Card>
  );
}
