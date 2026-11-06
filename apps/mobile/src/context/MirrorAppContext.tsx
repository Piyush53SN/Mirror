import * as React from 'react';
import type {
  DayStoreRowCounts,
  SessionRepairSnapshot,
  SessionRow,
  StoreResetAudit,
  StoreResetReason,
  IntentCheckPrefs,
  WeeklyReportPrefs,
} from '@mirror/store';
import {
  formatDurationShort,
  type BudgetDayForegroundInput,
  type BudgetDefinition,
  type BudgetsEvaluationSummary,
  type CuriositySplit,
  type DayTotalsSource,
  type DepthBand,
  type DiscoveryJourneyResult,
  type FlaggedAppDiscrepancy,
  type FocusWindowsResult,
  type GoalDefinition,
  type GoalsEvaluationSummary,
  type InterestEvolutionResult,
  type OrphanDiagnosticSummary,
  type RabbitHoleResult,
  type Score,
  type ScoreGap,
  type ScoredSession,
  type TracedAppInterval,
  type ValidationResult,
  type WeeklyReportResult,
  type WhatIfResult,
  type WhatIfScenarioId,
  type BudgetSuggestion,
  type AppRuleCoverage,
  type ExplicitLabelCounts,
} from '@mirror/core-analytics';
import type { DataQuality } from '../runtime';
import type { SafeInsets } from '../components/useSafeInsets';

export type {
  BudgetDayForegroundInput,
  BudgetDefinition,
  BudgetsEvaluationSummary,
  DayTotalsSource,
  FlaggedAppDiscrepancy,
  GoalDefinition,
  GoalsEvaluationSummary,
  SafeInsets,
  WeeklyReportPrefs,
  WeeklyReportResult,
  WhatIfScenarioId,
};
export type TabKey = 'home' | 'insights' | 'journey' | 'sessions' | 'you';
export type PermissionState = 'checking' | 'granted' | 'denied' | 'unavailable';

export type CombinableWhatIfScenarioId = Exclude<WhatIfScenarioId, 'combined'>;

export type ExportDataOptions = {
  passphrase?: string;
  mode?: 'share' | 'save';
};

export type ExportDataResult = {
  ok: boolean;
  encrypted: boolean;
  savedVia: 'save_dialog' | 'share_sheet' | 'failed';
};

export type DailyTotal = { app: string; label: string; totalMs: number };

export type BudgetCandidateApp = {
  app: string;
  label: string;
  todayMs: number;
};

export type SaveBudgetResult =
  | { ok: true; value: BudgetDefinition }
  | { ok: false; errors: string[] };

export type SaveGoalResult =
  | { ok: true; value: GoalDefinition }
  | { ok: false; errors: string[] };

/** P4.4c: the one pending Intent Check question for today, plus the one-time pause notice. */
export type IntentCheckCardState = {
  pending: { sessionId: string; app: string; durationMs: number; endMs: number } | null;
  pauseNotice: boolean;
};

export type UpdateReminderPrefsResult =
  | { ok: true; prefs: WeeklyReportPrefs }
  | { ok: false; reason: 'permission_denied' | 'invalid'; prefs: WeeklyReportPrefs };

export type SingleDayRow = {
  app: string;
  label: string;
  displayedMs?: number;
  mirrorMs: number;
  osMs: number;
  rawBucketMs?: number;
  preMidnightBucketMs?: number;
  sameDayBucketMs?: number;
  bucketCount?: number;
  earliestBucketStartMs?: number;
  latestBucketEndMs?: number;
  sittingSpanMs?: number;
  diffPct: number;
  status: string;
  flagged?: boolean;
  flagReason?: string;
};

export type ScaledSessionRow = {
  id: string;
  app: string;
  label: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  scaled_duration_ms: number;
  isScaled: boolean;
};

export type DebugRawEvent = {
  packageName: string;
  typeName: string;
  eventType: number;
  timeStamp: number;
  className?: string;
};

export function formatDuration(ms: number): string {
  return formatDurationShort(ms);
}

export function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export function dayStartMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
}

export function dayEndMs(dateStr: string): number {
  return dayStartMs(dateStr) + 86_400_000;
}

export function toDayStr(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function lastNDays(n: number, baseDay = toDayStr(Date.now())): string[] {
  const [y, m, d] = baseDay.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const dt = new Date(y!, m! - 1, d! - i, 12, 0, 0, 0);
    out.push(toDayStr(dt.getTime()));
  }
  return out;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatSpokenDay(day: string, isToday = false, isSelected = false): string {
  const [y, m, d] = day.split('-').map(Number);
  const month = MONTH_NAMES[(m ?? 1) - 1] ?? String(m);
  const base = `${month} ${d ?? day}, ${y ?? ''}`.trim();
  const prefix = isToday ? `Today, ${base}` : base;
  return isSelected ? `${prefix}, selected` : prefix;
}

// Rule-based hint – duration does NOT indicate intent; UI only, never used in scoring.
export function guessIntent(durationMs: number, _app: string): { hint: string; neverCounts: true } {
  if (durationMs > 0 && durationMs < 8000) {
    return {
      hint: `Opened for ${Math.round(durationMs / 1000)}s – short open. Duration alone doesn't indicate intent. Only your explicit labels feed Deliberate share (needs 5).`,
      neverCounts: true,
    };
  }
  if (durationMs >= 8000) {
    return {
      hint: `Opened for ${formatDuration(durationMs)}. Duration doesn't indicate intent – a long session isn't scored as better. Only your explicit labels feed Deliberate share.`,
      neverCounts: true,
    };
  }
  return {
    hint: 'Open time only – duration not measured. Duration doesn’t indicate intent. Only your explicit labels feed Deliberate share (needs 5, optional).',
    neverCounts: true,
  };
}

export type MirrorAppContextValue = {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;

  permission: PermissionState;
  setPermission: (p: PermissionState) => void;
  permissionDismissed?: boolean;
  dismissPermissionPrimer?: () => void;
  showPermissionPrimer?: () => void;
  insets?: SafeInsets | null;
  loading: boolean;
  error: string | null;
  lastCollect: string | null;
  lastSyncedAt: string | null;
  collectingSince: string | null;
  keyMismatch: { oldKey: string; newKey: string } | null;
  dismissKeyMismatch: () => void;
  resetStoredData: (reason?: StoreResetReason) => Promise<void>;
  exportAllData?: (opts?: ExportDataOptions) => Promise<boolean | ExportDataResult>;
  lastReset?: StoreResetAudit | null;

  selectedDay: string;
  setSelectedDay: (day: string) => void;
  dayOptions: string[];

  sessions: SessionRow[];
  dailyTotals: DailyTotal[];
  dailyTotalsSource: DayTotalsSource;
  labels: Record<string, string>;
  quality: DataQuality | null;
  validation: ValidationResult | null;
  flaggedDiscrepancies: FlaggedAppDiscrepancy[];
  singleDayRows: SingleDayRow[];
  debugEvents: DebugRawEvent[];
  honkaiDebug: DebugRawEvent[];
  invalidTop: { pkg: string; count: number }[];
  storeDayRowCounts: DayStoreRowCounts[];
  sessionRepairSnapshot: SessionRepairSnapshot | null;
  tracedAppIntervals: TracedAppInterval[];
  hasEventsWithoutSittings: boolean;
  copyStatus: string | null;

  scaledSessions: ScaledSessionRow[];
  iqs: Score | null;
  curiosity: CuriositySplit | null;
  depthBands: DepthBand[];
  dayScoredSessions: ScoredSession[];
  sittingSpanMs: number;
  dayScoreGaps: ScoreGap[];

  evolution: InterestEvolutionResult | null;
  discovery: DiscoveryJourneyResult | null;
  rabbitHole: RabbitHoleResult | null;
  focusWindows: FocusWindowsResult | null;
  whatIf: WhatIfResult | null;
  whatIfCapMin: 10 | 20;
  setWhatIfCapMin: (cap: 10 | 20) => void;
  whatIfQuietPreset: '23-05' | '22-07';
  setWhatIfQuietPreset: (preset: '23-05' | '22-07') => void;
  whatIfActiveScenarios?: readonly CombinableWhatIfScenarioId[];
  toggleWhatIfScenario?: (id: CombinableWhatIfScenarioId) => void;

  latestSyncOrphans: OrphanDiagnosticSummary | null;
  raw24hOrphans: OrphanDiagnosticSummary | null;

  showWhy: boolean;
  setShowWhy: React.Dispatch<React.SetStateAction<boolean>>;
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  buildTapCount: number;
  handleBuildTap: () => void;

  intentLabels: Record<string, 'intentional' | 'mindless' | 'unsure'>;
  labelSaving: string | null;
  expandedSessionId: string | null;
  setExpandedSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  labelOptIn: boolean;
  setLabelOptIn: React.Dispatch<React.SetStateAction<boolean>>;

  orphanCount: number;
  totalGaps: number;
  p3Reliable: boolean;

  checkPermissionAndCollect: () => Promise<void>;
  openSettings: () => void;
  saveSessionLabel: (sessionId: string, label: 'intentional' | 'mindless' | 'unsure') => Promise<void>;
  clearStoredLabels: () => Promise<void>;
  copyRawEvents: () => Promise<void>;

  /** User-created Tier D soft Attention Budgets (encrypted at rest in `budgets`). */
  budgets?: BudgetDefinition[];
  budgetsSummary?: BudgetsEvaluationSummary | null;
  budgetApps?: BudgetCandidateApp[];
  budgetWeekTotals?: readonly BudgetDayForegroundInput[];
  budgetRecordedDays?: readonly string[];
  saveBudget?: (budget: BudgetDefinition) => Promise<SaveBudgetResult>;
  deleteBudget?: (id: string) => Promise<boolean>;
  /** P4.4a weekly-report budget suggestions (never creates a budget by itself). */
  budgetSuggestions?: readonly BudgetSuggestion[];
  acceptBudgetSuggestion?: (suggestion: BudgetSuggestion) => Promise<SaveBudgetResult>;
  dismissBudgetSuggestion?: (app: string) => Promise<void>;

  /** P4.4b user app rules. `intentLabels` already includes them; sources are below. */
  appRules?: Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }>;
  appRuleCoverage?: Record<string, AppRuleCoverage>;
  /** Explicit-label counts for the selected day (rule gate applied). Sessions reads this. */
  dayLabelCounts?: ExplicitLabelCounts;
  /** Explicit-label counts across loaded history (rule gate applied). Insights reads this. */
  allLabelCounts?: ExplicitLabelCounts;
  /** Sitting ids whose effective label comes from a user app rule, not the sitting itself. */
  ruleSourceIds?: ReadonlySet<string>;
  saveAppRule?: (app: string, label: 'intentional' | 'mindless') => Promise<void>;
  removeAppRule?: (app: string) => Promise<void>;

  /** User-created Tier D calm Weekly Goals & 7-day Weekly Report (P4.3). */
  goals?: GoalDefinition[];
  goalsSummary?: GoalsEvaluationSummary | null;
  saveGoal?: (goal: GoalDefinition) => Promise<SaveGoalResult>;
  deleteGoal?: (id: string) => Promise<boolean>;
  weeklyReport?: WeeklyReportResult | null;
  showWeeklyReport?: boolean;
  setShowWeeklyReport?: React.Dispatch<React.SetStateAction<boolean>>;
  showSettings?: boolean;
  setShowSettings?: React.Dispatch<React.SetStateAction<boolean>>;
  weeklyReportPrefs?: WeeklyReportPrefs;
  updateWeeklyReportPrefs?: (
    patch: Partial<Omit<WeeklyReportPrefs, 'updatedAtMs'>>,
  ) => Promise<UpdateReminderPrefsResult>;
  openNotificationSettings?: () => void;
  intentCheckPrefs?: IntentCheckPrefs;
  intentCheckCard?: IntentCheckCardState;
  /** Turns Intent Check on/off. Asks for notification permission only when turning on. */
  updateIntentCheck?: (enabled: boolean) => Promise<{ ok: true; notificationsOn: boolean }>;
  answerIntentCheck?: (
    sessionId: string,
    label: 'intentional' | 'mindless' | 'unsure',
  ) => Promise<void>;
  acknowledgeIntentCheckPauseNotice?: () => Promise<void>;
};

export const MirrorAppContext = React.createContext<MirrorAppContextValue | null>(null);

export function useMirrorApp(): MirrorAppContextValue {
  const ctx = React.useContext(MirrorAppContext);
  if (!ctx) {
    throw new Error('useMirrorApp must be used inside a MirrorAppProvider');
  }
  return ctx;
}
