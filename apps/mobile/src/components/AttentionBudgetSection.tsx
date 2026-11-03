import * as React from 'react';
import { View } from 'react-native';
import {
  Callout,
  Chip,
  EmptyState,
  LinkButton,
  Meter,
  Pill,
  Surface,
  Text,
  TextField,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import {
  SHARED_EXCLUDED_PACKAGES,
  evaluateBudgets,
  isExcludedApp,
  validateBudgetDefinition,
  type BudgetDefinition,
  type BudgetDayForegroundInput,
  type BudgetPeriod,
  type BudgetTargetKind,
  type BudgetsEvaluationSummary,
} from '@mirror/core-analytics';
import {
  formatDuration,
  toDayStr,
  useMirrorApp,
  type BudgetCandidateApp,
} from '../context/MirrorAppContext';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const PACKAGE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

export function useResolvedBudgets(): {
  budgets: BudgetDefinition[];
  summary: BudgetsEvaluationSummary;
  candidateApps: BudgetCandidateApp[];
  weekTotals: readonly BudgetDayForegroundInput[];
  recordedDaysCount: number;
} {
  const {
    budgets: ctxBudgets,
    budgetsSummary: ctxSummary,
    budgetApps: ctxApps,
    budgetWeekTotals: ctxWeekTotals,
    budgetRecordedDays: ctxRecordedDays,
    selectedDay,
    dailyTotals,
    dailyTotalsSource,
    labels,
    sessions,
    evolution,
    focusWindows,
  } = useMirrorApp();

  const budgets = ctxBudgets ?? [];
  const isToday = selectedDay === toDayStr(Date.now());
  const historyStartDay =
    focusWindows?.historyStartDay ??
    evolution?.historyStartDay ??
    (dailyTotals.length > 0 ? selectedDay : null);

  const fallbackRecordedDays = React.useMemo<string[]>(
    () =>
      dailyTotals.length > 0 || (historyStartDay !== null && selectedDay >= historyStartDay)
        ? [selectedDay]
        : [],
    [dailyTotals.length, historyStartDay, selectedDay],
  );

  const weekTotals = React.useMemo<readonly BudgetDayForegroundInput[]>(() => {
    if (ctxWeekTotals && ctxWeekTotals.length > 0) return ctxWeekTotals;
    return [
      {
        day: selectedDay,
        source: dailyTotalsSource,
        totals: dailyTotals.map((t) => ({ app: t.app, totalMs: t.totalMs })),
      },
    ];
  }, [ctxWeekTotals, selectedDay, dailyTotalsSource, dailyTotals]);

  const effectiveRecordedDays = ctxRecordedDays ?? fallbackRecordedDays;

  const summary = React.useMemo<BudgetsEvaluationSummary>(() => {
    if (ctxSummary) return ctxSummary;
    return evaluateBudgets({
      budgets,
      referenceDay: selectedDay,
      dayTotals: weekTotals,
      recordedDays: effectiveRecordedDays,
      historyStartDay,
      isSelectedToday: isToday,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      nowMs: isToday ? Date.now() : undefined,
      ignorePackages: [...SHARED_EXCLUDED_PACKAGES],
      appLabels: labels,
    });
  }, [
    ctxSummary,
    budgets,
    selectedDay,
    weekTotals,
    effectiveRecordedDays,
    historyStartDay,
    isToday,
    labels,
  ]);

  const candidateApps = React.useMemo<BudgetCandidateApp[]>(() => {
    if (ctxApps) return ctxApps;
    const map = new Map<string, BudgetCandidateApp>();
    for (const row of dailyTotals) {
      if (isExcludedApp(row.app, { ignorePackages: SHARED_EXCLUDED_PACKAGES, label: row.label })) {
        continue;
      }
      map.set(row.app, {
        app: row.app,
        label: row.label || labels[row.app] || row.app,
        todayMs: row.totalMs,
      });
    }
    for (const s of sessions) {
      if (map.has(s.app)) continue;
      const lbl = labels[s.app] || s.app;
      if (isExcludedApp(s.app, { ignorePackages: SHARED_EXCLUDED_PACKAGES, label: lbl })) continue;
      map.set(s.app, { app: s.app, label: lbl, todayMs: 0 });
    }
    for (const b of budgets) {
      for (const pkg of b.packages) {
        if (map.has(pkg)) continue;
        const lbl = labels[pkg] || pkg;
        if (isExcludedApp(pkg, { ignorePackages: SHARED_EXCLUDED_PACKAGES, label: lbl })) continue;
        map.set(pkg, { app: pkg, label: lbl, todayMs: 0 });
      }
    }
    return [...map.values()].sort(
      (a, b) => b.todayMs - a.todayMs || a.label.localeCompare(b.label) || a.app.localeCompare(b.app),
    );
  }, [ctxApps, dailyTotals, sessions, budgets, labels]);

  return {
    budgets,
    summary,
    candidateApps,
    weekTotals,
    recordedDaysCount: effectiveRecordedDays.length,
  };
}

function splitLimitToHoursMinutes(limitMs: number): { hours: string; minutes: string } {
  const totalMinutes = Math.max(1, Math.round(limitMs / MIN_MS));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return {
    hours: h > 0 ? String(h) : '0',
    minutes: String(m),
  };
}

export function AttentionBudgetSection(): React.ReactElement {
  const theme = useTheme();
  const { selectedDay, labels, saveBudget, deleteBudget } = useMirrorApp();
  const { budgets, summary, candidateApps, weekTotals, recordedDaysCount } = useResolvedBudgets();

  // Optional local fallback list only when rendered in isolated stateless UI snapshots
  // without a live `saveBudget` / `deleteBudget` callback.
  const [fallbackBudgets, setFallbackBudgets] = React.useState<BudgetDefinition[] | null>(null);
  const effectiveBudgets = fallbackBudgets ?? budgets;
  const effectiveSummary = React.useMemo(() => {
    if (!fallbackBudgets) return summary;
    return evaluateBudgets({
      budgets: fallbackBudgets,
      referenceDay: selectedDay,
      dayTotals: [
        {
          day: selectedDay,
          source: 'os_events',
          totals: candidateApps
            .filter((c) => c.todayMs > 0)
            .map((c) => ({ app: c.app, totalMs: c.todayMs })),
        },
      ],
      recordedDays: [selectedDay],
      isSelectedToday: selectedDay === toDayStr(Date.now()),
      appLabels: labels,
    });
  }, [fallbackBudgets, summary, selectedDay, candidateApps, labels]);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<BudgetTargetKind>('app');
  const [period, setPeriod] = React.useState<BudgetPeriod>('daily');
  const [name, setName] = React.useState('');
  const [selectedPackages, setSelectedPackages] = React.useState<string[]>([]);
  const [appFilter, setAppFilter] = React.useState('');
  const [hoursText, setHoursText] = React.useState('');
  const [minutesText, setMinutesText] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);
  const [formErrors, setFormErrors] = React.useState<string[]>([]);
  const [prefillNote, setPrefillNote] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const sevenDayByApp = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const dayEntry of weekTotals) {
      for (const row of dayEntry.totals) {
        const pkg = (row.app ?? row.packageName ?? '').trim();
        if (!pkg || row.totalMs <= 0) continue;
        const lbl = labels[pkg] ?? pkg;
        if (isExcludedApp(pkg, { ignorePackages: SHARED_EXCLUDED_PACKAGES, label: lbl })) continue;
        map.set(pkg, (map.get(pkg) ?? 0) + row.totalMs);
      }
    }
    return map;
  }, [weekTotals, labels]);

  const topSevenDayApps = React.useMemo(
    () =>
      [...sevenDayByApp.entries()]
        .filter(([, ms]) => ms > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([app, totalMs]) => ({ app, totalMs })),
    [sevenDayByApp],
  );

  const labelForPkg = React.useCallback(
    (pkg: string): string => {
      const found = candidateApps.find((c) => c.app === pkg);
      return found?.label ?? labels[pkg] ?? pkg;
    },
    [candidateApps, labels],
  );

  const resetForm = React.useCallback(() => {
    setEditingId(null);
    setKind('app');
    setPeriod('daily');
    setName('');
    setSelectedPackages([]);
    setAppFilter('');
    setHoursText('');
    setMinutesText('');
    setEnabled(true);
    setFormErrors([]);
    setPrefillNote(null);
  }, []);

  const openCreate = React.useCallback(() => {
    resetForm();
    setConfirmDeleteId(null);
    setEditorOpen(true);
  }, [resetForm]);

  const openEdit = React.useCallback(
    (budgetId: string) => {
      const existing = effectiveBudgets.find((b) => b.id === budgetId);
      if (!existing) return;
      const hm = splitLimitToHoursMinutes(existing.limitMs);
      setEditingId(existing.id);
      setKind(existing.kind);
      setPeriod(existing.period);
      setName(existing.name);
      setSelectedPackages([...existing.packages]);
      setAppFilter('');
      setHoursText(hm.hours);
      setMinutesText(hm.minutes);
      setEnabled(existing.enabled);
      setFormErrors([]);
      setPrefillNote(null);
      setConfirmDeleteId(null);
      setEditorOpen(true);
    },
    [effectiveBudgets],
  );

  const handleStartFromAverage = React.useCallback(() => {
    setFormErrors([]);
    const daysDenom = Math.max(1, recordedDaysCount);
    if (kind === 'app') {
      const targetPkg =
        selectedPackages[0] ?? topSevenDayApps[0]?.app ?? candidateApps[0]?.app ?? null;
      if (!targetPkg) {
        setPrefillNote(
          'No recorded foreground app usage in the last 7 days yet. Select an app or use a quick amount chip below.',
        );
        return;
      }
      if (selectedPackages.length === 0) {
        setSelectedPackages([targetPkg]);
      }
      const sumMs =
        sevenDayByApp.get(targetPkg) ??
        candidateApps.find((c) => c.app === targetPkg)?.todayMs ??
        0;
      const prefillMs =
        period === 'daily'
          ? Math.max(MIN_MS, Math.round(sumMs / daysDenom / MIN_MS) * MIN_MS)
          : Math.max(MIN_MS, Math.round(sumMs / MIN_MS) * MIN_MS);
      const hm = splitLimitToHoursMinutes(prefillMs);
      setHoursText(hm.hours);
      setMinutesText(hm.minutes);
      const appLabel = labelForPkg(targetPkg);
      setPrefillNote(
        period === 'daily'
          ? `Pre-filled ${appLabel} with ${formatDuration(prefillMs)}/day from ${daysDenom} recorded ${daysDenom === 1 ? 'day' : 'days'} in the last 7 local days (day-clipped foreground). Nothing is saved until you tap Save.`
          : `Pre-filled ${appLabel} with ${formatDuration(prefillMs)} from ${daysDenom} recorded ${daysDenom === 1 ? 'day' : 'days'} in the last 7 local days (${daysDenom < 7 ? 'partial week, not extrapolated' : 'day-clipped foreground'}). Nothing is saved until you tap Save.`,
      );
      return;
    }

    const targetPkgs =
      selectedPackages.length > 0
        ? selectedPackages
        : topSevenDayApps.slice(0, 2).map((x) => x.app);
    if (targetPkgs.length === 0) {
      setPrefillNote(
        'No recorded foreground app usage in the last 7 days yet. Select apps or use a quick amount chip below.',
      );
      return;
    }
    if (selectedPackages.length === 0) {
      setSelectedPackages(targetPkgs);
    }
    const sumMs = targetPkgs.reduce((acc, pkg) => acc + (sevenDayByApp.get(pkg) ?? 0), 0);
    const prefillMs =
      period === 'daily'
        ? Math.max(MIN_MS, Math.round(sumMs / daysDenom / MIN_MS) * MIN_MS)
        : Math.max(MIN_MS, Math.round(sumMs / MIN_MS) * MIN_MS);
    const hm = splitLimitToHoursMinutes(prefillMs);
    setHoursText(hm.hours);
    setMinutesText(hm.minutes);
    setPrefillNote(
      period === 'daily'
        ? `Pre-filled ${formatDuration(prefillMs)}/day across ${targetPkgs.length} ${targetPkgs.length === 1 ? 'app' : 'apps'} from ${daysDenom} recorded ${daysDenom === 1 ? 'day' : 'days'} in the last 7 local days. Nothing is saved until you tap Save.`
        : `Pre-filled ${formatDuration(prefillMs)} across ${targetPkgs.length} ${targetPkgs.length === 1 ? 'app' : 'apps'} from ${daysDenom} recorded ${daysDenom === 1 ? 'day' : 'days'} (${daysDenom < 7 ? 'partial week, not extrapolated' : '7 local days'}). Nothing is saved until you tap Save.`,
    );
  }, [
    recordedDaysCount,
    kind,
    selectedPackages,
    topSevenDayApps,
    candidateApps,
    sevenDayByApp,
    period,
    labelForPkg,
  ]);

  const handleQuickAmount = React.useCallback((totalMinutes: number) => {
    setFormErrors([]);
    const hm = splitLimitToHoursMinutes(totalMinutes * MIN_MS);
    setHoursText(hm.hours);
    setMinutesText(hm.minutes);
  }, []);

  const closeEditor = React.useCallback(() => {
    setEditorOpen(false);
    resetForm();
  }, [resetForm]);

  const handleSelectKind = React.useCallback((nextKind: BudgetTargetKind) => {
    setKind(nextKind);
    setFormErrors([]);
    if (nextKind === 'app') {
      setSelectedPackages((prev) => (prev.length > 1 ? [prev[0]!] : prev));
    }
  }, []);

  const handleToggleApp = React.useCallback(
    (pkg: string) => {
      setFormErrors([]);
      if (kind === 'app') {
        setSelectedPackages((prev) => (prev[0] === pkg ? [] : [pkg]));
      } else {
        setSelectedPackages((prev) =>
          prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg],
        );
      }
    },
    [kind],
  );

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

  const canAddCustomPackage = React.useMemo(() => {
    if (!PACKAGE_ID_RE.test(trimmedFilter)) return false;
    if (isExcludedApp(trimmedFilter, { ignorePackages: SHARED_EXCLUDED_PACKAGES })) return false;
    return !filteredApps.some((c) => c.app === trimmedFilter);
  }, [trimmedFilter, filteredApps]);

  const handleAddCustomPackage = React.useCallback(() => {
    if (!canAddCustomPackage) return;
    handleToggleApp(trimmedFilter);
    setAppFilter('');
  }, [canAddCustomPackage, handleToggleApp, trimmedFilter]);

  const handleSave = React.useCallback(async () => {
    const errs: string[] = [];

    if (kind === 'app' && selectedPackages.length !== 1) {
      errs.push('Choose one app for this budget.');
    }
    if (kind === 'group' && selectedPackages.length === 0) {
      errs.push('Choose at least one app for this group.');
    }

    const trimmedName = name.trim();
    if (kind === 'group' && !trimmedName) {
      errs.push('Enter a name for this app group.');
    }

    const rawH = hoursText.trim();
    const rawM = minutesText.trim();
    const wholeIntRe = /^\d+$/;
    if ((rawH !== '' && !wholeIntRe.test(rawH)) || (rawM !== '' && !wholeIntRe.test(rawM))) {
      errs.push('Hours and minutes must be whole non-negative numbers.');
    } else {
      const h = rawH === '' ? 0 : Number(rawH);
      const m = rawM === '' ? 0 : Number(rawM);
      if (m >= 60) {
        errs.push('Minutes must be between 0 and 59.');
      }
      const totalMs = h * HOUR_MS + m * MIN_MS;
      if (totalMs <= 0) {
        errs.push('Enter a target duration of at least 1 minute.');
      } else if (period === 'daily' && totalMs > DAY_MS) {
        errs.push('A daily budget cannot exceed 24 hours.');
      } else if (period === 'weekly' && totalMs > 7 * DAY_MS) {
        errs.push('A weekly budget cannot exceed 168 hours (7 days).');
      }
    }

    if (errs.length > 0) {
      setFormErrors(errs);
      return;
    }

    const h = rawH === '' ? 0 : Number(rawH);
    const m = rawM === '' ? 0 : Number(rawM);
    const limitMs = h * HOUR_MS + m * MIN_MS;
    const resolvedName =
      trimmedName ||
      (kind === 'app' && selectedPackages[0] ? labelForPkg(selectedPackages[0]) : '');

    const nowMs = Date.now();
    const existing = editingId ? effectiveBudgets.find((b) => b.id === editingId) : undefined;
    const id =
      existing?.id ?? `bgt_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;

    const candidate: BudgetDefinition = {
      id,
      name: resolvedName,
      kind,
      packages: [...selectedPackages],
      period,
      limitMs,
      enabled,
      createdAtMs: existing?.createdAtMs ?? nowMs,
      updatedAtMs: nowMs,
    };

    const validated = validateBudgetDefinition(candidate);
    if (!validated.ok) {
      setFormErrors(validated.errors);
      return;
    }

    setSaving(true);
    try {
      if (saveBudget) {
        const res = await saveBudget(validated.value);
        if (!res.ok) {
          setFormErrors(res.errors);
          return;
        }
      } else {
        setFallbackBudgets((prev) => {
          const base = prev ?? effectiveBudgets;
          const idx = base.findIndex((b) => b.id === validated.value.id);
          if (idx >= 0) {
            const copy = [...base];
            copy[idx] = validated.value;
            return copy;
          }
          return [...base, validated.value];
        });
      }
      closeEditor();
    } finally {
      setSaving(false);
    }
  }, [
    kind,
    selectedPackages,
    name,
    hoursText,
    minutesText,
    period,
    editingId,
    effectiveBudgets,
    labelForPkg,
    enabled,
    saveBudget,
    closeEditor,
  ]);

  const handleConfirmDelete = React.useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        if (deleteBudget) {
          await deleteBudget(id);
        } else {
          setFallbackBudgets((prev) => (prev ?? effectiveBudgets).filter((b) => b.id !== id));
        }
        setConfirmDeleteId(null);
        if (editingId === id) {
          closeEditor();
        }
      } finally {
        setSaving(false);
      }
    },
    [deleteBudget, effectiveBudgets, editingId, closeEditor],
  );

  const items = effectiveSummary.items;
  const hasAnyPartialWeekly = items.some((i) => i.isPartialWindow);

  return (
    <Surface
      radius="hero"
      theme={theme}
      style={{
        padding: theme.space(4),
        borderWidth: 1,
        borderColor: theme.color.borderHairline,
        gap: theme.space(3),
      }}
    >
      <View testID="insights-budget-section" style={{ gap: theme.space(3) }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: theme.space(2),
          }}
        >
          <View style={{ flex: 1, gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              SOFT FOREGROUND TARGETS · TIER D
            </Text>
            <Text role="title-lg" theme={theme}>
              Attention Budget
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              Optional daily or weekly targets from the same day-clipped foreground totals shown on Home — soft reference only, never blocks apps
            </Text>
          </View>
          <TierBadge tier="D" theme={theme} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: theme.space(2),
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip static label="Soft reference only" theme={theme} />
            <Chip static label="User-created only" theme={theme} />
            {hasAnyPartialWeekly ? (
              <Chip static label="Partial week · not extrapolated" theme={theme} />
            ) : null}
          </View>
          {!editorOpen && items.length > 0 ? (
            <Pill
              testID="budget-new-btn"
              theme={theme}
              variant="secondary"
              onPress={openCreate}
              accessibilityLabel="Create a new attention budget"
            >
              New budget
            </Pill>
          ) : null}
        </View>

        {editorOpen ? (
          <View
            testID="budget-editor-panel"
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
              {editingId ? 'Edit attention budget' : 'New attention budget'}
            </Text>

            <View style={{ gap: theme.space(1) }}>
              <Text role="micro" tone="muted" theme={theme}>
                TARGET SCOPE
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                <Pill
                  testID="budget-kind-app"
                  theme={theme}
                  variant={kind === 'app' ? 'primary' : 'secondary'}
                  onPress={() => handleSelectKind('app')}
                  accessibilityLabel={`Single app target, ${kind === 'app' ? 'selected' : 'not selected'}`}
                >
                  Single app
                </Pill>
                <Pill
                  testID="budget-kind-group"
                  theme={theme}
                  variant={kind === 'group' ? 'primary' : 'secondary'}
                  onPress={() => handleSelectKind('group')}
                  accessibilityLabel={`Named group target, ${kind === 'group' ? 'selected' : 'not selected'}`}
                >
                  Named group
                </Pill>
              </View>
            </View>

            <View style={{ gap: theme.space(1) }}>
              <Text role="micro" tone="muted" theme={theme}>
                WINDOW
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                <Pill
                  testID="budget-period-daily"
                  theme={theme}
                  variant={period === 'daily' ? 'primary' : 'secondary'}
                  onPress={() => {
                    setPeriod('daily');
                    setFormErrors([]);
                  }}
                  accessibilityLabel={`Daily budget period, ${period === 'daily' ? 'selected' : 'not selected'}`}
                >
                  Daily
                </Pill>
                <Pill
                  testID="budget-period-weekly"
                  theme={theme}
                  variant={period === 'weekly' ? 'primary' : 'secondary'}
                  onPress={() => {
                    setPeriod('weekly');
                    setFormErrors([]);
                  }}
                  accessibilityLabel={`Weekly budget period, ${period === 'weekly' ? 'selected' : 'not selected'}`}
                >
                  Weekly
                </Pill>
              </View>
            </View>

            <View style={{ gap: theme.space(1) }}>
              <Text role="micro" tone="muted" theme={theme}>
                {kind === 'group' ? 'GROUP NAME' : 'LABEL (OPTIONAL)'}
              </Text>
              <TextField
                testID="budget-name-input"
                value={name}
                onChangeText={(txt) => {
                  setName(txt);
                  setFormErrors([]);
                }}
                placeholder={
                  kind === 'group'
                    ? 'Group name (required)'
                    : 'Custom label (blank uses app name)'
                }
                autoCapitalize="words"
                accessibilityLabel={kind === 'group' ? 'Group budget name' : 'Custom budget label'}
                theme={theme}
              />
            </View>

            <View style={{ gap: theme.space(1.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                {kind === 'group'
                  ? `APPS IN GROUP (${selectedPackages.length} selected)`
                  : 'APP'}
              </Text>
              <TextField
                testID="budget-app-filter-input"
                value={appFilter}
                onChangeText={setAppFilter}
                placeholder="Filter observed apps or enter package id"
                autoCapitalize="none"
                accessibilityLabel="Filter observed apps or enter Android package id"
                theme={theme}
              />
              {canAddCustomPackage ? (
                <View style={{ alignSelf: 'flex-start' }}>
                  <Pill
                    testID="budget-add-custom-pkg-btn"
                    theme={theme}
                    variant="secondary"
                    onPress={handleAddCustomPackage}
                    accessibilityLabel={`Select package ${trimmedFilter}`}
                  >
                    {`Use ${trimmedFilter}`}
                  </Pill>
                </View>
              ) : null}
              {filteredApps.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                  {filteredApps.slice(0, 18).map((cand) => {
                    const isSelected = selectedPackages.includes(cand.app);
                    const chipText =
                      cand.todayMs > 0
                        ? `${cand.label} · ${formatDuration(cand.todayMs)}`
                        : cand.label;
                    const spoken = `${cand.label}${cand.todayMs > 0 ? `, ${formatDuration(cand.todayMs)} foreground` : ''}, ${isSelected ? 'selected' : 'not selected'}`;
                    return (
                      <Pill
                        key={cand.app}
                        testID={`budget-app-option-${cand.app}`}
                        theme={theme}
                        variant={isSelected ? 'primary' : 'secondary'}
                        onPress={() => handleToggleApp(cand.app)}
                        accessibilityLabel={spoken}
                      >
                        {chipText}
                      </Pill>
                    );
                  })}
                </View>
              ) : (
                <Text role="micro" tone="muted" theme={theme}>
                  No observed apps match yet. Type an Android package id above (for example org.wikipedia) to select it directly.
                </Text>
              )}
            </View>

            <View style={{ gap: theme.space(1.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                {period === 'daily' ? 'DAILY TARGET DURATION' : 'WEEKLY TARGET DURATION'}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.space(1.5),
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <Pill
                  testID="budget-start-from-avg-btn"
                  theme={theme}
                  variant="secondary"
                  onPress={handleStartFromAverage}
                  accessibilityLabel="Start from my average over the last 7 days"
                >
                  Start from my average
                </Pill>
                <Pill
                  testID="budget-quick-30m"
                  theme={theme}
                  variant="secondary"
                  onPress={() => handleQuickAmount(30)}
                  accessibilityLabel="Set target duration to 30 minutes"
                >
                  30m
                </Pill>
                <Pill
                  testID="budget-quick-1h"
                  theme={theme}
                  variant="secondary"
                  onPress={() => handleQuickAmount(60)}
                  accessibilityLabel="Set target duration to 1 hour"
                >
                  1h
                </Pill>
                <Pill
                  testID="budget-quick-2h"
                  theme={theme}
                  variant="secondary"
                  onPress={() => handleQuickAmount(120)}
                  accessibilityLabel="Set target duration to 2 hours"
                >
                  2h
                </Pill>
              </View>
              {prefillNote ? (
                <View testID="budget-prefill-note">
                  <Text role="micro" tone="muted" theme={theme}>
                    {prefillNote}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 120, gap: theme.space(0.5) }}>
                  <Text role="label" tone="muted" theme={theme}>
                    Hours
                  </Text>
                  <TextField
                    testID="budget-hours-input"
                    value={hoursText}
                    onChangeText={(txt) => {
                      setHoursText(txt);
                      setFormErrors([]);
                    }}
                    placeholder="0"
                    autoCapitalize="none"
                    accessibilityLabel="Budget target hours"
                    theme={theme}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 120, gap: theme.space(0.5) }}>
                  <Text role="label" tone="muted" theme={theme}>
                    Minutes
                  </Text>
                  <TextField
                    testID="budget-minutes-input"
                    value={minutesText}
                    onChangeText={(txt) => {
                      setMinutesText(txt);
                      setFormErrors([]);
                    }}
                    placeholder="0"
                    autoCapitalize="none"
                    accessibilityLabel="Budget target minutes"
                    theme={theme}
                  />
                </View>
              </View>
            </View>

            {editingId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                <Pill
                  testID="budget-enabled-toggle"
                  theme={theme}
                  variant={enabled ? 'primary' : 'secondary'}
                  onPress={() => setEnabled((prev) => !prev)}
                  accessibilityLabel={
                    enabled ? 'Budget active, tap to pause' : 'Budget paused, tap to resume'
                  }
                >
                  {enabled ? 'Active' : 'Paused'}
                </Pill>
                <Text role="micro" tone="muted" theme={theme}>
                  Paused budgets stay saved locally without counting as active.
                </Text>
              </View>
            ) : null}

            {formErrors.length > 0 ? (
              <View testID="budget-editor-errors">
                <Callout theme={theme} tone="limit">
                  {formErrors.join(' ')}
                </Callout>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
              <Pill
                testID="budget-save-btn"
                theme={theme}
                variant="primary"
                disabled={saving}
                onPress={handleSave}
                accessibilityLabel={editingId ? 'Save budget changes' : 'Save new budget'}
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save budget'}
              </Pill>
              <LinkButton
                testID="budget-cancel-btn"
                theme={theme}
                onPress={closeEditor}
              >
                Cancel
              </LinkButton>
            </View>
          </View>
        ) : null}

        {items.length === 0 && !editorOpen ? (
          <View testID="insights-budget-empty">
            <EmptyState
              title="No attention budgets yet"
              body="Create a daily or weekly foreground-time budget for a single app or a named group. Mirror never pre-fills defaults, blocks apps, or sends nudges."
              action={
                <Pill
                  testID="budget-empty-create-btn"
                  theme={theme}
                  onPress={openCreate}
                  accessibilityLabel="Create an attention budget"
                >
                  Create budget
                </Pill>
              }
              theme={theme}
            />
          </View>
        ) : null}

        {items.length > 0 ? (
          <View testID="insights-budget-list" style={{ gap: theme.space(2.5) }}>
            {items.map((item) => {
              const scopeLabel =
                item.kind === 'group'
                  ? `Group (${item.packages.length} apps)`
                  : (item.perPackageUsedMs[0]?.label ?? item.packages[0] ?? 'Single app');
              const isConfirmingDelete = confirmDeleteId === item.id;
              return (
                <View
                  key={item.id}
                  testID={`insights-budget-card-${item.id}`}
                  style={{
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.color.card,
                    borderWidth: 1,
                    borderColor: theme.color.borderCard,
                    padding: theme.space(3),
                    gap: theme.space(2),
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: theme.space(2),
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 160, gap: theme.space(0.5) }}>
                      <Text role="title" theme={theme}>
                        {item.name}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${item.period === 'daily' ? 'Daily' : 'Weekly'} · ${scopeLabel}`}
                      </Text>
                    </View>
                  </View>

                  <Meter
                    theme={theme}
                    value={item.meterFillRatio}
                    tone={item.enabled ? 'anchor' : 'muted'}
                    label={`${formatDuration(item.usedMs)} foreground`}
                    caption={item.statusLine}
                  />

                  {item.isPartialWindow ? (
                    <Text role="micro" tone="muted" theme={theme}>
                      {`Partial week · ${item.recordedDays} of 7 days recorded in Mirror history (never extrapolated to 7 days).`}
                    </Text>
                  ) : null}

                  {item.kind === 'group' && item.perPackageUsedMs.length > 0 ? (
                    <Text role="micro" tone="muted" theme={theme}>
                      {`Apps: ${item.perPackageUsedMs.map((p) => `${p.label} ${formatDuration(p.usedMs)}`).join(' · ')}`}
                    </Text>
                  ) : null}

                  {item.hasApproximateDays ? (
                    <Text role="micro" tone="muted" theme={theme}>
                      Includes approximate fallback OS-bucket day(s).
                    </Text>
                  ) : item.hasStoredDays ? (
                    <Text role="micro" tone="muted" theme={theme}>
                      Includes stored Mirror foreground event day(s).
                    </Text>
                  ) : null}

                  <View
                    style={{
                      flexDirection: 'row',
                      gap: theme.space(1.5),
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <Pill
                      testID={`budget-edit-btn-${item.id}`}
                      theme={theme}
                      variant="secondary"
                      onPress={() => openEdit(item.id)}
                      accessibilityLabel={`Edit ${item.name} budget`}
                    >
                      Edit
                    </Pill>
                    {!isConfirmingDelete ? (
                      <Pill
                        testID={`budget-delete-btn-${item.id}`}
                        theme={theme}
                        variant="quiet"
                        onPress={() => setConfirmDeleteId(item.id)}
                        accessibilityLabel={`Delete ${item.name} budget`}
                      >
                        Delete
                      </Pill>
                    ) : (
                      <View
                        testID={`budget-delete-confirm-${item.id}`}
                        style={{
                          flexDirection: 'row',
                          gap: theme.space(1.5),
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <Pill
                          testID={`budget-confirm-delete-btn-${item.id}`}
                          theme={theme}
                          variant="secondary"
                          disabled={saving}
                          onPress={() => handleConfirmDelete(item.id)}
                          accessibilityLabel={`Confirm delete ${item.name} budget`}
                        >
                          Confirm delete
                        </Pill>
                        <LinkButton
                          testID={`budget-cancel-delete-btn-${item.id}`}
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
    </Surface>
  );
}
