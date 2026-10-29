import * as React from 'react';
import type {
  DayStoreRowCounts,
  SessionRepairSnapshot,
  SessionRow,
  StoreResetAudit,
  StoreResetReason,
} from '@mirror/store';
import {
  formatDurationShort,
  type CuriositySplit,
  type DayTotalsSource,
  type DepthBand,
  type DiscoveryJourneyResult,
  type FlaggedAppDiscrepancy,
  type FocusWindowsResult,
  type InterestEvolutionResult,
  type OrphanDiagnosticSummary,
  type RabbitHoleResult,
  type Score,
  type ScoreGap,
  type ScoredSession,
  type TracedAppInterval,
  type ValidationResult,
  type WhatIfResult,
} from '@mirror/core-analytics';
import type { DataQuality } from '../runtime';

export type { DayTotalsSource, FlaggedAppDiscrepancy };
export type TabKey = 'home' | 'insights' | 'journey' | 'sessions' | 'you';
export type PermissionState = 'checking' | 'granted' | 'denied' | 'unavailable';

export type DailyTotal = { app: string; label: string; totalMs: number };

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
  loading: boolean;
  error: string | null;
  lastCollect: string | null;
  lastSyncedAt: string | null;
  collectingSince: string | null;
  keyMismatch: { oldKey: string; newKey: string } | null;
  dismissKeyMismatch: () => void;
  resetStoredData: (reason?: StoreResetReason) => Promise<void>;
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
};

export const MirrorAppContext = React.createContext<MirrorAppContextValue | null>(null);

export function useMirrorApp(): MirrorAppContextValue {
  const ctx = React.useContext(MirrorAppContext);
  if (!ctx) {
    throw new Error('useMirrorApp must be used inside a MirrorAppProvider');
  }
  return ctx;
}
