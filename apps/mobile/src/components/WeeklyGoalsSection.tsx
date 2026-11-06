import * as React from 'react';
import { View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  EmptyState,
  LinkButton,
  Meter,
  Pill,
  SectionHeader,
  Text,
  TextField,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import {
  SHARED_EXCLUDED_PACKAGES,
  evaluateGoals,
  isExcludedApp,
  validateGoalDefinition,
  type GoalDefinition,
  type GoalKind,
  type GoalsEvaluationSummary,
} from '@mirror/core-analytics';
import {
  formatDuration,
  toDayStr,
  useMirrorApp,
} from '../context/MirrorAppContext';
import { useResolvedBudgets } from './AttentionBudgetSection';
import { useResolvedWeeklyReport } from './WeeklyReportSheet';
import { GOAL_KIND_OPTIONS, GoalTypeOptions } from './GoalTypeOptions';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const PACKAGE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

function splitMsToHoursMinutes(ms: number): { hours: string; minutes: string } {
  const totalMinutes = Math.max(0, Math.round(ms / MIN_MS));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return { hours: String(h), minutes: String(m) };
}

/**
 * `part` splits the component so Insights can show the report entry at the top and
 * collapse goals under Advanced. Reminders now live in Settings (ReminderSettings).
 */
export function WeeklyGoalsSection({
  part = 'all',
}: {
  part?: 'all' | 'report' | 'goals';
} = {}): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    labels,
    goals: ctxGoals,
    goalsSummary: ctxGoalsSummary,
    saveGoal,
    deleteGoal,
    setShowWeeklyReport,
    budgetWeekTotals,
    budgetRecordedDays,
    dayScoredSessions,
  } = useMirrorApp();

  const report = useResolvedWeeklyReport();
  const { candidateApps } = useResolvedBudgets();

  // Stateless fallback only for isolated UI renders without a provider store
  const [fallbackGoals, setFallbackGoals] = React.useState<GoalDefinition[] | null>(null);
  const effectiveGoals = fallbackGoals ?? ctxGoals ?? [];

  const effectiveGoalsSummary = React.useMemo<GoalsEvaluationSummary>(() => {
    if (!fallbackGoals && ctxGoalsSummary) return ctxGoalsSummary;
    const isToday = selectedDay === toDayStr(Date.now());
    return evaluateGoals({
      goals: effectiveGoals,
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
    fallbackGoals,
    ctxGoalsSummary,
    effectiveGoals,
    selectedDay,
    budgetWeekTotals,
    dayScoredSessions,
    budgetRecordedDays,
    labels,
  ]);


  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<GoalKind>('daily_app_foreground');
  const [title, setTitle] = React.useState('');
  const [selectedPackages, setSelectedPackages] = React.useState<string[]>([]);
  const [appFilter, setAppFilter] = React.useState('');
  const [hoursText, setHoursText] = React.useState('');
  const [minutesText, setMinutesText] = React.useState('');
  const [countText, setCountText] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);
  const [formErrors, setFormErrors] = React.useState<string[]>([]);
  const [savingGoal, setSavingGoal] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const labelForPkg = React.useCallback(
    (pkg: string): string => {
      const found = candidateApps.find((c) => c.app === pkg);
      return found?.label ?? labels[pkg] ?? pkg;
    },
    [candidateApps, labels],
  );

  const resetGoalForm = React.useCallback(() => {
    setEditingId(null);
    setKind('daily_app_foreground');
    setTitle('');
    setSelectedPackages([]);
    setAppFilter('');
    setHoursText('');
    setMinutesText('');
    setCountText('');
    setEnabled(true);
    setFormErrors([]);
  }, []);

  const openCreateGoal = React.useCallback(() => {
    resetGoalForm();
    setConfirmDeleteId(null);
    setEditorOpen(true);
  }, [resetGoalForm]);

  const openEditGoal = React.useCallback(
    (goalId: string) => {
      const existing = effectiveGoals.find((g) => g.id === goalId);
      if (!existing) return;
      setEditingId(existing.id);
      setKind(existing.kind);
      setTitle(existing.title);
      setSelectedPackages([...(existing.packages ?? [])]);
      setAppFilter('');
      if (existing.kind === 'daily_sitting_count_max') {
        setCountText(existing.targetCount !== undefined ? String(existing.targetCount) : '');
        setHoursText('');
        setMinutesText('');
      } else {
        const hm = splitMsToHoursMinutes(existing.targetMs ?? 0);
        setHoursText(hm.hours);
        setMinutesText(hm.minutes);
        setCountText('');
      }
      setEnabled(existing.enabled);
      setFormErrors([]);
      setConfirmDeleteId(null);
      setEditorOpen(true);
    },
    [effectiveGoals],
  );

  const closeGoalEditor = React.useCallback(() => {
    setEditorOpen(false);
    resetGoalForm();
  }, [resetGoalForm]);

  const handleTogglePkg = React.useCallback((pkg: string) => {
    setFormErrors([]);
    setSelectedPackages((prev) =>
      prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg],
    );
  }, []);

  const trimmedFilter = appFilter.trim();
  const filteredApps = React.useMemo(() => {
    const base = [...candidateApps];
    for (const pkg of selectedPackages) {
      if (!base.some((c) => c.app === pkg)) {
        base.push({ app: pkg, label: labelForPkg(pkg), todayMs: 0 });
      }
    }
    if (!trimmedFilter) return base;
    const q = trimmedFilter.toLowerCase();
    return base.filter(
      (c) => c.label.toLowerCase().includes(q) || c.app.toLowerCase().includes(q),
    );
  }, [candidateApps, selectedPackages, trimmedFilter, labelForPkg]);

  const canAddCustomPkg = React.useMemo(() => {
    if (!PACKAGE_ID_RE.test(trimmedFilter)) return false;
    if (isExcludedApp(trimmedFilter, { ignorePackages: SHARED_EXCLUDED_PACKAGES })) return false;
    return !filteredApps.some((c) => c.app === trimmedFilter);
  }, [trimmedFilter, filteredApps]);

  const handleAddCustomPkg = React.useCallback(() => {
    if (!canAddCustomPkg) return;
    handleTogglePkg(trimmedFilter);
    setAppFilter('');
  }, [canAddCustomPkg, handleTogglePkg, trimmedFilter]);

  const handleSaveGoal = React.useCallback(async () => {
    const errs: string[] = [];
    const wholeIntRe = /^\d+$/;

    if (kind === 'daily_app_foreground' && selectedPackages.length === 0) {
      errs.push('Choose at least one app for an app foreground goal.');
    }

    let targetMs: number | undefined;
    let targetCount: number | undefined;

    if (kind === 'daily_sitting_count_max') {
      const rawCount = countText.trim();
      if (!rawCount || !wholeIntRe.test(rawCount)) {
        errs.push('Enter a whole positive number of sittings per day.');
      } else {
        const parsed = Number(rawCount);
        if (parsed < 1 || parsed > 500) {
          errs.push('Target sittings per day must be between 1 and 500.');
        } else {
          targetCount = parsed;
        }
      }
    } else {
      const rawH = hoursText.trim();
      const rawM = minutesText.trim();
      if ((rawH !== '' && !wholeIntRe.test(rawH)) || (rawM !== '' && !wholeIntRe.test(rawM))) {
        errs.push('Hours and minutes must be whole non-negative numbers.');
      } else if (rawH === '' && rawM === '') {
        errs.push('Enter a target duration.');
      } else {
        const h = rawH === '' ? 0 : Number(rawH);
        const m = rawM === '' ? 0 : Number(rawM);
        if (m >= 60) {
          errs.push('Minutes must be between 0 and 59.');
        } else {
          const ms = h * HOUR_MS + m * MIN_MS;
          if (kind !== 'daily_late_night_max' && ms <= 0) {
            errs.push('Target duration must be at least 1 minute.');
          } else if (ms > DAY_MS) {
            errs.push('Daily target duration cannot exceed 24 hours.');
          } else {
            targetMs = ms;
          }
        }
      }
    }

    if (errs.length > 0) {
      setFormErrors(errs);
      return;
    }

    const trimmedTitle = title.trim();
    const defaultTitle =
      kind === 'daily_app_foreground' && selectedPackages.length > 0
        ? selectedPackages.map((p) => labelForPkg(p)).join(', ')
        : kind === 'daily_total_foreground'
          ? 'Daily foreground total'
          : kind === 'daily_late_night_max'
            ? 'Late-night time (23:00 to 05:00)'
            : 'Daily sittings';
    const resolvedTitle = trimmedTitle || defaultTitle;

    const nowMs = Date.now();
    const existing = editingId ? effectiveGoals.find((g) => g.id === editingId) : undefined;
    const id = existing?.id ?? `goal_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;

    const draft: GoalDefinition = {
      id,
      title: resolvedTitle,
      kind,
      ...(targetMs !== undefined ? { targetMs } : {}),
      ...(targetCount !== undefined ? { targetCount } : {}),
      ...((kind === 'daily_app_foreground' ||
        (kind === 'daily_sitting_count_max' && selectedPackages.length > 0)) &&
      selectedPackages.length > 0
        ? { packages: selectedPackages }
        : {}),
      enabled,
      createdAtMs: existing?.createdAtMs ?? nowMs,
      updatedAtMs: nowMs,
    };

    const validated = validateGoalDefinition(draft);
    if (!validated.ok) {
      setFormErrors(validated.errors);
      return;
    }

    setSavingGoal(true);
    try {
      if (saveGoal) {
        const res = await saveGoal(validated.value);
        if (!res.ok) {
          setFormErrors(res.errors);
          return;
        }
      } else {
        setFallbackGoals((prev) => {
          const base = prev ?? effectiveGoals;
          const idx = base.findIndex((g) => g.id === validated.value.id);
          if (idx >= 0) {
            const copy = [...base];
            copy[idx] = validated.value;
            return copy;
          }
          return [...base, validated.value];
        });
      }
      closeGoalEditor();
    } finally {
      setSavingGoal(false);
    }
  }, [
    kind,
    selectedPackages,
    countText,
    hoursText,
    minutesText,
    title,
    labelForPkg,
    editingId,
    effectiveGoals,
    enabled,
    saveGoal,
    closeGoalEditor,
  ]);

  const handleConfirmDeleteGoal = React.useCallback(
    async (goalId: string) => {
      setSavingGoal(true);
      try {
        if (deleteGoal) {
          await deleteGoal(goalId);
        } else {
          setFallbackGoals((prev) => (prev ?? effectiveGoals).filter((g) => g.id !== goalId));
        }
        setConfirmDeleteId(null);
        if (editingId === goalId) {
          closeGoalEditor();
        }
      } finally {
        setSavingGoal(false);
      }
    },
    [deleteGoal, effectiveGoals, editingId, closeGoalEditor],
  );

  const needsAppPicker = kind === 'daily_app_foreground' || kind === 'daily_sitting_count_max';
  const goalItems = effectiveGoalsSummary.items;

  return (
    <View style={{ gap: theme.space(3) }}>
      {part !== 'goals' ? (
      <>
      {/* 1. Weekly Report Summary & Sheet Trigger */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View testID="insights-weekly-report-card" style={{ gap: theme.space(2) }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: theme.space(2),
            }}
          >
            <View style={{ flex: 1, minWidth: 190, gap: theme.space(0.5) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                <TierBadge tier="D" theme={theme} />
                <Text role="micro" tone="muted" theme={theme}>
                  7 LOCAL DAYS · YOUR LABELS (TIER D FEEDBACK)
                </Text>
              </View>
              <SectionHeader
                theme={theme}
                title="Weekly report"
                caption={`${report.startDay} to ${report.endDay} · ${formatDuration(report.totalForegroundMs)} foreground · ${report.totalSittingCount} ${report.totalSittingCount === 1 ? 'sitting' : 'sittings'}`}
              />
            </View>
            <Pill
              testID="open-weekly-report-btn"
              theme={theme}
              variant="primary"
              onPress={() => setShowWeeklyReport?.(true)}
              accessibilityLabel="Open weekly report sheet"
            >
              Open weekly report
            </Pill>
          </View>

          {report.isPartialWeek ? (
            <Chip
              static
              label={`Partial week · ${report.recordedDays} of 7 days recorded (never extrapolated)`}
              theme={theme}
            />
          ) : null}

          <Text role="micro" tone="muted" theme={theme}>
            {report.hasPriorWeekComparison && report.priorWeekComparison
              ? report.priorWeekComparison.summaryText
              : (report.priorWeekUnavailableReason ??
                'Per-app totals come from day-clipped foreground events. Prior-week comparison unlocks at 14 recorded days.')}
          </Text>
        </View>
      </Card>

      </>
      ) : null}
      {part !== 'report' ? (
      <>
      {/* 2. Calm User-Created Weekly Goals */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View testID="insights-goals-section" style={{ gap: theme.space(2.5) }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: theme.space(2),
            }}
          >
            <View style={{ flex: 1, minWidth: 190, gap: theme.space(0.5) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                <TierBadge tier="D" theme={theme} />
                <Text role="micro" tone="muted" theme={theme}>
                  USER-CREATED ONLY · CALM RATIOS
                </Text>
              </View>
              <SectionHeader
                theme={theme}
                title="Weekly goals"
                caption="personal targets across recorded days · calm weekly ratios"
              />
            </View>
            {!editorOpen ? (
              <Pill
                testID="goal-new-btn"
                theme={theme}
                variant="secondary"
                onPress={openCreateGoal}
                accessibilityLabel="Create a weekly goal"
              >
                New goal
              </Pill>
            ) : null}
          </View>

          {editorOpen ? (
            <View
              testID="goal-editor-panel"
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.card,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                padding: theme.space(3),
                gap: theme.space(2.5),
              }}
            >
              <Text role="title" theme={theme}>
                {editingId ? 'Edit weekly goal' : 'Create weekly goal'}
              </Text>

              <View style={{ gap: theme.space(1) }}>
                <Text role="micro" tone="muted" theme={theme}>
                  GOAL TYPE
                </Text>
                <GoalTypeOptions
                  value={kind}
                  onSelect={(next) => {
                    setKind(next);
                    setFormErrors([]);
                  }}
                />
                <Text role="micro" tone="muted" theme={theme}>
                  {GOAL_KIND_OPTIONS.find((o) => o.id === kind)?.description ?? ''}
                </Text>
              </View>

              <View style={{ gap: theme.space(1) }}>
                <Text role="micro" tone="muted" theme={theme}>
                  GOAL TITLE (OPTIONAL)
                </Text>
                <TextField
                  testID="goal-title-input"
                  value={title}
                  onChangeText={(txt) => {
                    setTitle(txt);
                    setFormErrors([]);
                  }}
                  placeholder="For example: Calm evenings or Reading time"
                  accessibilityLabel="Weekly goal title"
                  theme={theme}
                />
              </View>

              {needsAppPicker ? (
                <View style={{ gap: theme.space(1.5) }}>
                  <Text role="micro" tone="muted" theme={theme}>
                    {kind === 'daily_app_foreground'
                      ? 'SELECT APP(S)'
                      : 'OPTIONAL APP FILTER (LEAVE EMPTY FOR ALL APPS)'}
                  </Text>
                  <TextField
                    testID="goal-app-filter-input"
                    value={appFilter}
                    onChangeText={setAppFilter}
                    placeholder="Filter observed apps or type package id"
                    autoCapitalize="none"
                    accessibilityLabel="Filter apps for weekly goal"
                    theme={theme}
                  />
                  {canAddCustomPkg ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      <Pill
                        testID="goal-add-custom-pkg-btn"
                        theme={theme}
                        variant="secondary"
                        onPress={handleAddCustomPkg}
                        accessibilityLabel={`Select package ${trimmedFilter}`}
                      >
                        {`Use ${trimmedFilter}`}
                      </Pill>
                    </View>
                  ) : null}
                  {filteredApps.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                      {filteredApps.slice(0, 16).map((cand) => {
                        const isSelected = selectedPackages.includes(cand.app);
                        return (
                          <Pill
                            key={cand.app}
                            testID={`goal-app-option-${cand.app}`}
                            theme={theme}
                            variant={isSelected ? 'primary' : 'secondary'}
                            onPress={() => handleTogglePkg(cand.app)}
                            accessibilityLabel={`${cand.label}, ${isSelected ? 'selected' : 'not selected'}`}
                          >
                            {cand.todayMs > 0
                              ? `${cand.label} · ${formatDuration(cand.todayMs)}`
                              : cand.label}
                          </Pill>
                        );
                      })}
                    </View>
                  ) : (
                    <Text role="micro" tone="muted" theme={theme}>
                      No observed apps match yet. Type an Android package id above to select it directly.
                    </Text>
                  )}
                </View>
              ) : null}

              {kind === 'daily_sitting_count_max' ? (
                <View style={{ gap: theme.space(1) }}>
                  <Text role="micro" tone="muted" theme={theme}>
                    DAILY TARGET SITTINGS (MAX)
                  </Text>
                  <TextField
                    testID="goal-count-input"
                    value={countText}
                    onChangeText={(txt) => {
                      setCountText(txt);
                      setFormErrors([]);
                    }}
                    placeholder="12"
                    autoCapitalize="none"
                    accessibilityLabel="Goal maximum daily sittings"
                    theme={theme}
                  />
                </View>
              ) : (
                <View style={{ gap: theme.space(1) }}>
                  <Text role="micro" tone="muted" theme={theme}>
                    DAILY TARGET DURATION
                  </Text>
                  <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 120, gap: theme.space(0.5) }}>
                      <Text role="label" tone="muted" theme={theme}>
                        Hours
                      </Text>
                      <TextField
                        testID="goal-hours-input"
                        value={hoursText}
                        onChangeText={(txt) => {
                          setHoursText(txt);
                          setFormErrors([]);
                        }}
                        placeholder="0"
                        autoCapitalize="none"
                        accessibilityLabel="Goal target hours"
                        theme={theme}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 120, gap: theme.space(0.5) }}>
                      <Text role="label" tone="muted" theme={theme}>
                        Minutes
                      </Text>
                      <TextField
                        testID="goal-minutes-input"
                        value={minutesText}
                        onChangeText={(txt) => {
                          setMinutesText(txt);
                          setFormErrors([]);
                        }}
                        placeholder="0"
                        autoCapitalize="none"
                        accessibilityLabel="Goal target minutes"
                        theme={theme}
                      />
                    </View>
                  </View>
                </View>
              )}

              {editingId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                  <Pill
                    testID="goal-enabled-toggle"
                    theme={theme}
                    variant={enabled ? 'primary' : 'secondary'}
                    onPress={() => setEnabled((prev) => !prev)}
                    accessibilityLabel={
                      enabled ? 'Goal active, tap to pause' : 'Goal paused, tap to resume'
                    }
                  >
                    {enabled ? 'Active' : 'Paused'}
                  </Pill>
                  <Text role="micro" tone="muted" theme={theme}>
                    Paused goals remain saved on this phone without counting as active.
                  </Text>
                </View>
              ) : null}

              {formErrors.length > 0 ? (
                <View testID="goal-editor-errors">
                  <Callout theme={theme} tone="limit">
                    {formErrors.join(' ')}
                  </Callout>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Pill
                  testID="goal-save-btn"
                  theme={theme}
                  variant="primary"
                  disabled={savingGoal}
                  onPress={handleSaveGoal}
                  accessibilityLabel={editingId ? 'Save goal changes' : 'Save new goal'}
                >
                  {savingGoal ? 'Saving…' : editingId ? 'Save changes' : 'Save goal'}
                </Pill>
                <LinkButton
                  testID="goal-cancel-btn"
                  theme={theme}
                  onPress={closeGoalEditor}
                >
                  Cancel
                </LinkButton>
              </View>
            </View>
          ) : null}

          {goalItems.length === 0 && !editorOpen ? (
            <View testID="insights-goals-empty">
              <EmptyState
                title="No weekly goals set"
                body="Create an optional personal target and view calm weekly ratios such as 4 of 7 days within target. Mirror never suggests goals, tracks consecutive-day chains, or blocks apps."
                action={
                  <Pill
                    testID="goal-empty-create-btn"
                    theme={theme}
                    onPress={openCreateGoal}
                    accessibilityLabel="Create a weekly goal"
                  >
                    Create goal
                  </Pill>
                }
                theme={theme}
              />
            </View>
          ) : null}

          {goalItems.length > 0 ? (
            <View testID="insights-goals-list" style={{ gap: theme.space(2.5) }}>
              {goalItems.map((item) => {
                const isConfirmingDelete = confirmDeleteId === item.id;
                return (
                  <View
                    key={item.id}
                    testID={`insights-goal-card-${item.id}`}
                    style={{
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.color.card,
                      borderWidth: 1,
                      borderColor: theme.color.borderCard,
                      padding: theme.space(3),
                      gap: theme.space(2),
                    }}
                  >
                    <View style={{ gap: theme.space(0.5) }}>
                      <Text role="title" theme={theme}>
                        {item.title}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${item.enabled ? 'Active' : 'Paused'} · ${item.targetDescription}`}
                      </Text>
                    </View>

                    <Meter
                      theme={theme}
                      value={item.withinTargetRatio ?? 0}
                      tone={item.enabled ? 'anchor' : 'muted'}
                      label={item.ratioLabel}
                      caption={
                        item.isPartialWeek
                          ? 'Partial week · not extrapolated'
                          : '7 local days'
                      }
                    />

                    <View
                      style={{
                        flexDirection: 'row',
                        gap: theme.space(1.5),
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <Pill
                        testID={`goal-edit-btn-${item.id}`}
                        theme={theme}
                        variant="secondary"
                        onPress={() => openEditGoal(item.id)}
                        accessibilityLabel={`Edit ${item.title} goal`}
                      >
                        Edit
                      </Pill>
                      {!isConfirmingDelete ? (
                        <Pill
                          testID={`goal-delete-btn-${item.id}`}
                          theme={theme}
                          variant="quiet"
                          onPress={() => setConfirmDeleteId(item.id)}
                          accessibilityLabel={`Delete ${item.title} goal`}
                        >
                          Delete
                        </Pill>
                      ) : (
                        <View
                          testID={`goal-delete-confirm-${item.id}`}
                          style={{
                            flexDirection: 'row',
                            gap: theme.space(1.5),
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          <Pill
                            testID={`goal-confirm-delete-btn-${item.id}`}
                            theme={theme}
                            variant="secondary"
                            disabled={savingGoal}
                            onPress={() => handleConfirmDeleteGoal(item.id)}
                            accessibilityLabel={`Confirm delete ${item.title} goal`}
                          >
                            Confirm delete
                          </Pill>
                          <LinkButton
                            testID={`goal-cancel-delete-btn-${item.id}`}
                            theme={theme}
                            onPress={() => setConfirmDeleteId(null)}
                          >
                            Keep
                          </LinkButton>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </Card>

      </>
      ) : null}
    </View>
  );
}
