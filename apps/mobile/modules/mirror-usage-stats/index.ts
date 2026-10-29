/**
 * The native module handle.
 *
 * Kept deliberately thin: `queryEvents` returns raw `UsageEvents` rows and does
 * nothing else. Deciding what those rows mean happens in
 * `@mirror/core-analytics/usage`, where it is pure and tested. A thin native layer
 * is a native layer that can be reviewed.
 *
 * `requireNativeModule` throws when the module is not linked — in a JS-only test,
 * on iOS before P5, or in a build that predates the module. It is therefore called
 * lazily and exactly once: importing this file must never throw.
 */
import { requireNativeModule } from 'expo-modules-core';

export type NativeUsageRow = {
  packageName: string;
  className?: string;
  eventType: number;
  timeStamp: number;
};

export type AppLabelRow = { packageName: string; label: string };

export type UsageStatsRow = {
  packageName: string;
  totalTimeInForeground: number;
  lastTimeUsed: number;
  firstTimeStamp: number;
  lastTimeStamp: number;
};

export type DebugUsageRow = NativeUsageRow & { typeName: string };

export type NativeWindowInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type MirrorUsageStatsModule = {
  /** Whether the person has granted Usage Access in system Settings. */
  hasPermission(): boolean;
  /** Opens Settings → Special app access → Usage access for this app. */
  openSettings(): void;
  /** Raw events in [sinceMs, untilMs). Throws on a missing permission. */
  queryEvents(sinceMs: number, untilMs: number): NativeUsageRow[];
  /** Resolve user-visible labels for packages via PackageManager (narrow <queries>). */
  getAppLabels(packages: string[]): AppLabelRow[];
  /** OS-reported totals via UsageStatsManager.queryUsageStats (for validation). */
  queryUsageStats(sinceMs: number, untilMs: number): UsageStatsRow[];
  /** Raw events with typeName for debugging one real session. */
  queryEventsDebug(sinceMs: number, untilMs: number): DebugUsageRow[];
  /** Packages that resolve HOME role (launchers) via CATEGORY_HOME intent. */
  getLauncherPackages(): string[];
  /** System bar + display cutout insets in dp from Android WindowInsets. */
  getWindowInsets?(): NativeWindowInsets;
};

let cached: MirrorUsageStatsModule | null | undefined;

export function getUsageStatsModule(): MirrorUsageStatsModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<MirrorUsageStatsModule>('MirrorUsageStats');
  } catch {
    cached = null;
  }
  return cached;
}
