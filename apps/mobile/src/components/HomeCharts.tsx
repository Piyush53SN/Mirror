/**
 * Home chart cards: the 7-day foreground line and the "Where time went" donut.
 * Presentation only. Numbers come from homeCharts.ts, which reads existing analytics output.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Card, Divider, Donut, LineChart, Text, rgba, useTheme, type MirrorTheme } from '@mirror/ui';
import { formatDuration, type DailyTotal } from '../context/MirrorAppContext';
import type { WeeklyReportResult } from '@mirror/core-analytics';
import { buildDonutSlices, buildWeekPoints, WEEK_MIN_RECORDED_DAYS } from '../homeCharts';

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

function slicePalette(theme: MirrorTheme): string[] {
  return [
    theme.color.anchor,
    rgba(theme.color.ink, 0.72),
    rgba(theme.color.ink, 0.5),
    rgba(theme.color.ink, 0.34),
    rgba(theme.color.ink, 0.2),
    theme.color.borderCard,
  ];
}

export function TimeSplitCard({ totals }: { totals: readonly DailyTotal[] }): React.ReactElement {
  const theme = useTheme();
  const slices = buildDonutSlices(totals);
  const total = totals.reduce((sum, t) => sum + t.totalMs, 0);
  const palette = slicePalette(theme);
  const segments = slices.map((s, i) => ({ label: s.label, value: s.value, color: palette[Math.min(i, palette.length - 1)] }));
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
        </View>
        {segments.length === 0 ? (
          <Text role="label" tone="muted" theme={theme}>
            No app time recorded for this day yet.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3), flexWrap: 'wrap' }}>
            <Donut
              testID="home-time-donut"
              segments={segments}
              theme={theme}
              size={120}
              thickness={12}
            >
              <Text role="label" theme={theme}>
                {formatDuration(total)}
              </Text>
            </Donut>
            <View style={{ flex: 1, minWidth: 160, gap: theme.space(2) }}>
              {segments.map((s) => (
                <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2) }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                  <Text role="micro" theme={theme} style={{ flex: 1 }}>
                    {s.label}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '0%'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <Divider theme={theme} />
        <Text role="micro" tone="muted" theme={theme}>
          Day-clipped foreground time. Each app is counted for the part of the day it was open.
        </Text>
      </View>
    </Card>
  );
}
