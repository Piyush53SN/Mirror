/**
 * P4.4-UX (1): Weekly summary card on Home.
 *
 * Reuses the weekly-report engine output (`weeklyReport`), so the numbers match
 * the full report. Tier D only; per-app time is day-clipped foreground.
 *
 * - Change vs last week appears only when the engine says both weeks have enough
 *   recorded days (`hasPriorWeekComparison`). Otherwise the engine's reason is shown.
 * - A one-time first-run offer for the weekly reminder. It is opt-in and off by
 *   default. "Turn on" goes through the same opt-in path as the toggle (permission
 *   requested only on that tap). "Not now" records that the offer was answered.
 * - Neutral copy only: no streaks, no red, no guilt.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Callout, Card, LinkButton, Pill, SectionHeader, Text, useTheme } from '@mirror/ui';
import { formatWindowLabel } from '@mirror/shared-types';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

export function WeeklySummaryCard(): React.ReactElement | null {
  const theme = useTheme();
  const { weeklyReport, setShowWeeklyReport, weeklyReportPrefs, updateWeeklyReportPrefs } = useMirrorApp();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  if (!weeklyReport) return null;

  const top = weeklyReport.topApps[0] ?? null;
  const cmp = weeklyReport.hasPriorWeekComparison ? weeklyReport.priorWeekComparison : null;
  const showOffer = Boolean(
    weeklyReportPrefs && !weeklyReportPrefs.reminderOfferSeen && !weeklyReportPrefs.reminderEnabled,
  );

  let changeLine: string;
  if (cmp) {
    const delta = cmp.deltaForegroundMs;
    const pct = cmp.deltaForegroundPct;
    const pctText = pct === null ? '' : ` (${pct >= 0 ? '+' : '−'}${Math.abs(Math.round(pct * 100))}%)`;
    if (delta === 0) changeLine = 'Same as last week';
    else if (delta > 0) changeLine = `Up ${formatDuration(delta)}${pctText} vs last week`;
    else changeLine = `Down ${formatDuration(-delta)}${pctText} vs last week`;
  } else {
    changeLine =
      weeklyReport.priorWeekUnavailableReason ??
      'Change vs last week appears once both weeks have enough recorded days.';
  }

  const quietLabel = weeklyReportPrefs
    ? formatWindowLabel({ startHour: weeklyReportPrefs.quietHoursStartHour, endHour: weeklyReportPrefs.quietHoursEndHour })
    : '23:00–05:00';

  const answerOffer = async (turnOn: boolean) => {
    if (!updateWeeklyReportPrefs) return;
    setBusy(true);
    setNotice(null);
    try {
      if (turnOn) {
        const res = await updateWeeklyReportPrefs({ reminderEnabled: true, reminderOfferSeen: true });
        if (!res.ok) {
          // Denied: reminder stays off. Still record the one-time offer as answered.
          await updateWeeklyReportPrefs({ reminderOfferSeen: true });
          setNotice('Notifications are off for Mirror in Android settings, so the reminder stays off.');
        }
      } else {
        await updateWeeklyReportPrefs({ reminderOfferSeen: true });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="home-weekly-summary" style={{ gap: theme.space(2) }}>
        <SectionHeader
          theme={theme}
          title="This week"
          caption={`${weeklyReport.startDay} to ${weeklyReport.endDay} · 7 local days · day-clipped foreground`}
        />
        <View style={{ gap: theme.space(1) }}>
          <View testID="home-weekly-total">
            <Text role="display" theme={theme}>
              {formatDuration(weeklyReport.totalForegroundMs)}
            </Text>
          </View>
          <View testID="home-weekly-change">
            <Text role="micro" tone="muted" theme={theme}>
              {changeLine}
            </Text>
          </View>
          {top ? (
            <View testID="home-weekly-top-app">
              <Text role="micro" tone="muted" theme={theme}>
                {`Top app: ${top.label} · ${formatDuration(top.foregroundMs)}`}
              </Text>
            </View>
          ) : null}
          {weeklyReport.isPartialWeek ? (
            <Text role="micro" tone="muted" theme={theme}>
              {`Partial week · ${weeklyReport.recordedDays} of 7 days recorded · not extrapolated`}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <LinkButton theme={theme} onPress={() => setShowWeeklyReport?.(true)}>
            Open full report
          </LinkButton>
        </View>

        {showOffer ? (
          <View testID="home-weekly-reminder-offer" style={{ gap: theme.space(1.5) }}>
            <Callout theme={theme} tone="neutral">
              {`Want one calm local note a week when your report is ready? It is off by default. Nothing is sent unless you turn it on, and quiet hours (${quietLabel}) are respected.`}
            </Callout>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) }}>
              <Pill
                testID="weekly-offer-turn-on"
                theme={theme}
                variant="primary"
                disabled={busy}
                onPress={() => answerOffer(true)}
                accessibilityLabel="Turn on the weekly summary reminder"
              >
                Turn on
              </Pill>
              <Pill
                testID="weekly-offer-not-now"
                theme={theme}
                variant="secondary"
                disabled={busy}
                onPress={() => answerOffer(false)}
                accessibilityLabel="Not now, do not show this offer again"
              >
                Not now
              </Pill>
            </View>
          </View>
        ) : null}

        {notice ? (
          <Callout theme={theme} tone="limit">
            {notice}
          </Callout>
        ) : null}
      </View>
    </Card>
  );
}
