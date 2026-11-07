/**
 * App detail sheet, opened by long-pressing a donut segment or legend row. Shows today's
 * foreground time for the app, a 7-day mini chart (per-day `loadAppWeek`) and the status of
 * any attention budget that includes the app. Presentation only: no new metric is computed.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Chip, Divider, LineChart, Sheet, Text, useTheme, type MirrorTheme } from '@mirror/ui';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';
import { useResolvedBudgets } from './AttentionBudgetSection';
import { useSafeInsets } from './useSafeInsets';
import { weekdayShort } from '../homeCharts';

export type AppDetailTarget = { app: string; label: string };

export function AppDetailSheet({
  target,
  onClose,
}: {
  target: AppDetailTarget | null;
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { insets: contextInsets, dailyTotals, weeklyReport, loadAppWeek } = useMirrorApp();
  const insets = useSafeInsets(contextInsets);
  const { summary } = useResolvedBudgets();
  const [week, setWeek] = React.useState<(number | null)[] | null>(null);

  const days = React.useMemo(
    () => (weeklyReport ? weeklyReport.perDay.map((d) => ({ day: d.day, recorded: d.recorded })) : []),
    [weeklyReport],
  );

  React.useEffect(() => {
    if (!target || !loadAppWeek || days.length === 0) {
      setWeek(null);
      return undefined;
    }
    let live = true;
    setWeek(null);
    loadAppWeek(target.app, days)
      .then((values) => {
        if (live) setWeek(values);
      })
      .catch(() => {
        if (live) setWeek(days.map(() => null));
      });
    return () => {
      live = false;
    };
  }, [target, days, loadAppWeek]);

  const todayMs = target ? dailyTotals.find((t) => t.app === target.app)?.totalMs ?? 0 : 0;
  const budgetLines = target
    ? summary.items.filter((item) => item.packages?.includes(target.app)).map((item) => ({ id: item.id, name: item.name, line: item.statusLine }))
    : [];
  const points =
    week && days.length > 0
      ? days.map((d, i) => ({
          label: weekdayShort(d.day),
          value: week[i] ?? null,
          partial: false,
          day: d.day,
          selected: false,
        }))
      : null;

  return (
    <Sheet
      open={target !== null}
      title={target ? target.label : 'App'}
      subtitle="Foreground time · day-clipped"
      onClose={onClose}
      bottomInset={insets.bottom}
      theme={theme}
    >
      {target ? (
        <View testID="home-app-detail-sheet" style={{ gap: theme.space(3), paddingBottom: theme.space(2) }}>
          <View style={{ gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              TODAY
            </Text>
            <View testID="home-app-detail-today">
              <Text role="title" theme={theme}>
                {todayMs > 0 ? formatDuration(todayMs) : 'No time recorded'}
              </Text>
            </View>
          </View>
          <Divider theme={theme} />
          <Text role="micro" tone="muted" theme={theme}>
            LAST 7 DAYS
          </Text>
          {points ? (
            <LineChart
              testID="home-app-detail-week"
              points={points}
              theme={theme}
              formatValue={formatDuration}
              title={`${target.label}, foreground time, last 7 days`}
              height={120}
            />
          ) : (
            <Text role="micro" tone="muted" theme={theme}>
              Loading the week…
            </Text>
          )}
          <Divider theme={theme} />
          <BudgetStatus lines={budgetLines} theme={theme} />
        </View>
      ) : null}
    </Sheet>
  );
}

function BudgetStatus({
  lines,
  theme,
}: {
  lines: { id: string; name: string; line: string }[];
  theme: MirrorTheme;
}): React.ReactElement {
  if (lines.length === 0) {
    return (
      <Text role="micro" tone="muted" theme={theme}>
        No attention budget includes this app.
      </Text>
    );
  }
  return (
    <View testID="home-app-detail-budget" style={{ gap: theme.space(2) }}>
      <Text role="micro" tone="muted" theme={theme}>
        BUDGET STATUS
      </Text>
      {lines.map((l) => (
        <View key={l.id} style={{ gap: theme.space(0.5) }}>
          <Text role="label" theme={theme}>
            {l.name}
          </Text>
          <Chip static label={l.line} theme={theme} />
        </View>
      ))}
    </View>
  );
}
