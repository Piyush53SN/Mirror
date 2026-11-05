import * as React from 'react';
import { View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  Divider,
  Meter,
  Pill,
  SectionHeader,
  Sheet,
  Stat,
  Text,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import {
  SHARED_EXCLUDED_PACKAGES,
  computeWeeklyReport,
  evaluateGoals,
  type WeeklyDayEntry,
  type WeeklyReportResult,
} from '@mirror/core-analytics';
import {
  formatDuration,
  toDayStr,
  useMirrorApp,
} from '../context/MirrorAppContext';
import type { BudgetSuggestion } from '@mirror/core-analytics';
import { useSafeInsets } from './useSafeInsets';

function formatDayProvenanceBadge(row: WeeklyDayEntry): string {
  if (!row.recorded) return 'Unrecorded';
  if (row.isProvisionalToday) return 'Today · provisional';
  if (row.source === 'os_bucket_approx') return 'Approximate';
  if (row.source === 'stored_events') return 'Stored';
  if (row.source === 'os_events') return 'Live';
  return 'Recorded';
}

export function useResolvedWeeklyReport(): WeeklyReportResult {
  const {
    weeklyReport: ctxReport,
    selectedDay,
    dailyTotals,
    dailyTotalsSource,
    budgetWeekTotals,
    budgetRecordedDays,
    dayScoredSessions,
    intentLabels,
    labels,
    storeDayRowCounts,
    evolution,
    focusWindows,
  } = useMirrorApp();

  return React.useMemo<WeeklyReportResult>(() => {
    if (ctxReport) return ctxReport;
    const isToday = selectedDay === toDayStr(Date.now());
    const historyStartDay =
      focusWindows?.historyStartDay ??
      evolution?.historyStartDay ??
      (dailyTotals.length > 0 ? selectedDay : null);
    const dayTotals =
      budgetWeekTotals && budgetWeekTotals.length > 0
        ? budgetWeekTotals
        : [
            {
              day: selectedDay,
              source: dailyTotalsSource,
              totals: dailyTotals.map((t) => ({ app: t.app, totalMs: t.totalMs })),
            },
          ];
    const recordedSet = new Set<string>(storeDayRowCounts.map((r) => r.day));
    for (const d of budgetRecordedDays ?? []) recordedSet.add(d);
    if (dailyTotals.length > 0) recordedSet.add(selectedDay);

    return computeWeeklyReport({
      endDay: selectedDay,
      dayTotals,
      sessions: dayScoredSessions,
      intentLabels,
      recordedDays: [...recordedSet],
      historyStartDay,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      nowMs: isToday ? Date.now() : undefined,
      ignorePackages: [...SHARED_EXCLUDED_PACKAGES],
      appLabels: labels,
    });
  }, [
    ctxReport,
    selectedDay,
    dailyTotals,
    dailyTotalsSource,
    budgetWeekTotals,
    budgetRecordedDays,
    dayScoredSessions,
    intentLabels,
    labels,
    storeDayRowCounts,
    evolution?.historyStartDay,
    focusWindows?.historyStartDay,
  ]);
}

/**
 * P4.4a: "Set a 1h budget?" with Accept / Dismiss. Nothing is created unless the
 * person taps Accept, and a dismissed suggestion stays hidden for 7 days.
 */
function WeeklyBudgetSuggestions({
  suggestions,
  onAccept,
  onDismiss,
}: {
  suggestions: readonly BudgetSuggestion[];
  onAccept: (s: BudgetSuggestion) => Promise<{ ok: boolean; errors?: string[] }>;
  onDismiss: (app: string) => Promise<void>;
}): React.ReactElement | null {
  const theme = useTheme();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  if (suggestions.length === 0) return null;

  // Accept is the only write. Each tap creates one soft budget; nothing runs on render.
  const acceptMany = async (list: readonly BudgetSuggestion[]) => {
    setBusy(true);
    setNotice(null);
    let added = 0;
    let failed = 0;
    try {
      for (const s of list) {
        const res = await onAccept(s);
        if (res.ok) added += 1;
        else failed += 1;
      }
    } finally {
      setBusy(false);
    }
    if (failed === 0) {
      setNotice(
        added === 1
          ? 'Soft budget added. You can change or remove it on Insights.'
          : `${added} soft budgets added. You can change or remove them on Insights.`,
      );
    } else {
      setNotice(`${added} added. ${failed} could not be saved. Please try again.`);
    }
  };

  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="weekly-budget-suggestions" style={{ gap: theme.space(2) }}>
        <Text role="micro" tone="muted" theme={theme}>
          BUDGET SUGGESTIONS · LAST 7 DAYS · YOU DECIDE
        </Text>
        {suggestions.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Pill
              testID="budget-suggestions-accept-all"
              theme={theme}
              variant="primary"
              disabled={busy}
              onPress={() => acceptMany(suggestions)}
              accessibilityLabel={`Accept all ${suggestions.length} budget suggestions`}
            >
              {`Accept all (${suggestions.length})`}
            </Pill>
          </View>
        ) : null}
        {suggestions.map((s) => (
          <View key={s.app} testID={`budget-suggestion-${s.app}`} style={{ gap: theme.space(1) }}>
            <Text role="label" theme={theme}>
              {s.title}
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              {s.body}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space(1), flexWrap: 'wrap' }}>
              <Pill
                testID={`budget-suggestion-accept-${s.app}`}
                theme={theme}
                variant="primary"
                disabled={busy}
                onPress={() => acceptMany([s])}
                accessibilityLabel={`Accept budget suggestion for ${s.label}`}
              >
                Accept
              </Pill>
              <Pill
                testID={`budget-suggestion-dismiss-${s.app}`}
                theme={theme}
                variant="secondary"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await onDismiss(s.app);
                  } finally {
                    setBusy(false);
                  }
                }}
                accessibilityLabel={`Dismiss budget suggestion for ${s.label} for 7 days`}
              >
                Dismiss
              </Pill>
            </View>
          </View>
        ))}
        {notice ? (
          <Callout theme={theme} tone="neutral">
            {notice}
          </Callout>
        ) : null}
      </View>
    </Card>
  );
}

export function WeeklyReportSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const {
    insets: contextInsets,
    goals: ctxGoals,
    goalsSummary: ctxGoalsSummary,
    selectedDay,
    budgetWeekTotals,
    budgetRecordedDays,
    dayScoredSessions,
    labels,
    budgetSuggestions,
    acceptBudgetSuggestion,
    dismissBudgetSuggestion,
  } = useMirrorApp();
  const insets = useSafeInsets(contextInsets);
  const report = useResolvedWeeklyReport();

  const resolvedGoals = React.useMemo(() => {
    if (ctxGoalsSummary) return ctxGoalsSummary;
    const list = ctxGoals ?? [];
    const isToday = selectedDay === toDayStr(Date.now());
    return evaluateGoals({
      goals: list,
      endDay: selectedDay,
      dayTotals: budgetWeekTotals,
      sessions: dayScoredSessions,
      recordedDays: budgetRecordedDays,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      nowMs: isToday ? Date.now() : undefined,
      ignorePackages: [...SHARED_EXCLUDED_PACKAGES],
      appLabels: labels,
    });
  }, [
    ctxGoalsSummary,
    ctxGoals,
    selectedDay,
    budgetWeekTotals,
    dayScoredSessions,
    budgetRecordedDays,
    labels,
  ]);

  const subtitle = report.isPartialWeek
    ? `${report.startDay} to ${report.endDay} · Partial week (${report.recordedDays} of 7 days recorded)`
    : `${report.startDay} to ${report.endDay} · 7 local days`;

  return (
    <Sheet
      open={open}
      title="Weekly report"
      subtitle={subtitle}
      onClose={onClose}
      bottomInset={insets.bottom}
      theme={theme}
    >
      <View testID="weekly-report-sheet" style={{ gap: theme.space(3), paddingBottom: theme.space(2) }}>
        {/* Provenance & Tier Badges */}
        <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap', alignItems: 'center' }}>
          <TierBadge tier="D" theme={theme} />
          <Chip static label="7 local days · day-clipped foreground" theme={theme} />
          <Chip static label="your labels (Tier D feedback)" theme={theme} />
          {report.isPartialWeek ? (
            <Chip
              static
              label={`Partial week · ${report.recordedDays} of 7 days · not extrapolated`}
              theme={theme}
            />
          ) : null}
          {report.includesProvisionalToday ? (
            <Chip static label="Includes provisional today" theme={theme} />
          ) : null}
          {report.hasStoredDays ? (
            <Chip static label="Includes Stored days" theme={theme} />
          ) : null}
          {report.hasApproximateDays ? (
            <Chip static label="Includes Approximate days" theme={theme} />
          ) : null}
        </View>

        {report.isPartialWeek && report.partialWeekNote ? (
          <View testID="weekly-report-partial-note">
            <Callout theme={theme} tone="neutral">
              {report.partialWeekNote}
            </Callout>
          </View>
        ) : null}

        {budgetSuggestions && budgetSuggestions.length > 0 && acceptBudgetSuggestion && dismissBudgetSuggestion ? (
          <WeeklyBudgetSuggestions
            suggestions={budgetSuggestions}
            onAccept={acceptBudgetSuggestion}
            onDismiss={dismissBudgetSuggestion}
          />
        ) : null}

        {/* Top-line 7-day day-clipped metrics */}
        <View
          testID="weekly-report-metrics"
          style={{
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.card,
            borderWidth: 1,
            borderColor: theme.color.borderCard,
            padding: theme.space(3),
            gap: theme.space(2),
          }}
        >
          <SectionHeader
            theme={theme}
            title="7-day summary"
            caption="per-app time from day-clipped foreground events · never extrapolated"
          />
          <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
            <Stat
              value={formatDuration(report.totalForegroundMs)}
              label="Foreground time"
              hint={
                report.recordedDays > 0
                  ? `${formatDuration(report.avgDailyForegroundMs)} per recorded day`
                  : 'No recorded days yet'
              }
              theme={theme}
            />
            <Stat
              value={String(report.totalSittingCount)}
              label="Sittings"
              hint="Merged spans count only"
              theme={theme}
            />
            <Stat
              value={formatDuration(report.lateNightForegroundMs)}
              label="Late-night time"
              hint="23:00 to 05:00 local"
              theme={theme}
            />
            <Stat
              value={String(report.rabbitHoleCount)}
              label="Rabbit hole loops"
              hint="4+ returns over 30m"
              theme={theme}
            />
          </View>
        </View>

        {/* Prior-week comparison (>= 14 days gate) */}
        <View
          testID="weekly-report-prior-week"
          style={{
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.card,
            borderWidth: 1,
            borderColor: theme.color.borderCard,
            padding: theme.space(3),
            gap: theme.space(1.5),
          }}
        >
          <SectionHeader
            theme={theme}
            title="Prior-week comparison"
            caption={
              report.hasPriorWeekComparison && report.priorWeekComparison
                ? `${report.priorWeekComparison.priorStartDay} to ${report.priorWeekComparison.priorEndDay}`
                : 'unlocks at 14 recorded days'
            }
          />
          {report.hasPriorWeekComparison && report.priorWeekComparison ? (
            <View testID="weekly-report-prior-ready" style={{ gap: theme.space(1) }}>
              <Text role="body" theme={theme}>
                {report.priorWeekComparison.summaryText}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {`Prior 7 days: ${formatDuration(report.priorWeekComparison.priorTotalForegroundMs)} foreground across ${report.priorWeekComparison.priorSittingCount} ${report.priorWeekComparison.priorSittingCount === 1 ? 'sitting' : 'sittings'}.`}
              </Text>
            </View>
          ) : (
            <Text role="label" tone="muted" theme={theme}>
              {report.priorWeekUnavailableReason ??
                'Prior-week comparison unlocks once 14 local days are recorded on this phone.'}
            </Text>
          )}
        </View>

        {/* Your labels (Tier D feedback) */}
        <View
          testID="weekly-report-your-labels"
          style={{
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.card,
            borderWidth: 1,
            borderColor: theme.color.borderCard,
            padding: theme.space(3),
            gap: theme.space(1.5),
          }}
        >
          <SectionHeader
            theme={theme}
            title="Your labels (Tier D feedback)"
            caption={report.yourLabels.attribution}
          />
          {report.yourLabels.ruleNote ? (
            <Text role="micro" tone="muted" theme={theme}>
              {report.yourLabels.ruleNote}
            </Text>
          ) : null}
          {report.yourLabels.measurable && report.yourLabels.intentionalShare !== null ? (
            <View style={{ gap: theme.space(1.5) }}>
              <Meter
                theme={theme}
                value={report.yourLabels.intentionalShare}
                tone="anchor"
                label="Intentional share"
                caption={`${Math.round(report.yourLabels.intentionalShare * 100)}% (${report.yourLabels.intentional} intentional · ${report.yourLabels.mindless} mindless)`}
              />
              {report.yourLabels.unsure > 0 ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {`${report.yourLabels.unsure} Not sure ${report.yourLabels.unsure === 1 ? 'label is' : 'labels are'} excluded and never counted as intentional or mindless.`}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text role="label" tone="muted" theme={theme}>
              {`Not measured in this window (${report.yourLabels.decisive} of ${report.yourLabels.minRequired} explicit Intentional or Mindless labels recorded; duration hints and Not sure never count).`}
            </Text>
          )}
        </View>

        {/* Top apps by day-clipped foreground time */}
        <View
          testID="weekly-report-top-apps"
          style={{
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.card,
            borderWidth: 1,
            borderColor: theme.color.borderCard,
            padding: theme.space(3),
            gap: theme.space(2),
          }}
        >
          <SectionHeader
            theme={theme}
            title="Top apps"
            caption="ranked by day-clipped foreground time"
          />
          {report.topApps.length > 0 ? (
            <View style={{ gap: theme.space(2) }}>
              {report.topApps.slice(0, 8).map((app) => (
                <Meter
                  key={app.app}
                  theme={theme}
                  value={app.foregroundShare}
                  tone="anchor"
                  label={app.label}
                  caption={`${formatDuration(app.foregroundMs)} (${Math.round(app.foregroundShare * 100)}%) · ${app.sittingCount} ${app.sittingCount === 1 ? 'sitting' : 'sittings'}`}
                />
              ))}
            </View>
          ) : (
            <Text role="label" tone="muted" theme={theme}>
              No foreground app usage recorded in this 7-day window yet.
            </Text>
          )}
        </View>

        {/* Active user-created goals snapshot, if any */}
        {resolvedGoals.items.length > 0 ? (
          <View
            testID="weekly-report-goals-snapshot"
            style={{
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.card,
              borderWidth: 1,
              borderColor: theme.color.borderCard,
              padding: theme.space(3),
              gap: theme.space(2),
            }}
          >
            <SectionHeader
              theme={theme}
              title="Weekly goals"
              caption="user-created targets · calm ratios"
            />
            {resolvedGoals.items.map((g) => (
              <Meter
                key={g.id}
                theme={theme}
                value={g.withinTargetRatio ?? 0}
                tone={g.enabled ? 'anchor' : 'muted'}
                label={g.title}
                caption={g.ratioLabel}
              />
            ))}
          </View>
        ) : null}

        {/* 7-local-day breakdown with Stored / Approximate / Live / Provisional badges */}
        <View
          testID="weekly-report-per-day"
          style={{
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.card,
            borderWidth: 1,
            borderColor: theme.color.borderCard,
            padding: theme.space(3),
            gap: theme.space(1.5),
          }}
        >
          <SectionHeader
            theme={theme}
            title="Each of the 7 local days"
            caption="Stored and Approximate badges preserved per day"
          />
          {report.perDay.map((row, idx) => (
            <View key={row.day} style={{ gap: theme.space(1) }}>
              {idx > 0 ? <Divider theme={theme} /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: theme.space(1.5),
                }}
              >
                <View style={{ gap: theme.space(0.25) }}>
                  <Text role="label" theme={theme}>
                    {row.day}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {row.recorded
                      ? `${formatDuration(row.foregroundMs)} foreground · ${row.sittingCount} ${row.sittingCount === 1 ? 'sitting' : 'sittings'}`
                      : 'Before Mirror history started on this phone'}
                  </Text>
                </View>
                <Chip static label={formatDayProvenanceBadge(row)} theme={theme} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
