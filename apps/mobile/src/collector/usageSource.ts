/**
 * The native usage module, adapted to the collector's port.
 *
 * This is the only place that knows the native module exists. If the module is
 * missing (an older build, iOS before P5, a JS-only test), `available` is false
 * and the collector reports "permission required" rather than pretending there is
 * no usage to show.
 */
import type { UsageSourcePort } from '@mirror/core-analytics';
import {
  getUsageStatsModule,
  type NativeUsageRow,
  type UsageStatsRow,
  type DebugUsageRow,
  type NativeWindowInsets,
} from '../../modules/mirror-usage-stats';

export type UsageSource = UsageSourcePort & {
  available: boolean;
  openSettings(): void;
  queryUsageStats(sinceMs: number, untilMs: number): Promise<UsageStatsRow[]>;
  queryEventsDebug(sinceMs: number, untilMs: number): Promise<DebugUsageRow[]>;
  getLauncherPackages(): Promise<string[]>;
  getWindowInsets(): NativeWindowInsets | null;
  saveExportJson(fileName: string, content: string): Promise<boolean | null>;
};

export function nativeUsageSource(): UsageSource {
  const native = getUsageStatsModule();
  return {
    available: native !== null,
    async hasPermission() {
      try {
        return native ? native.hasPermission() : false;
      } catch {
        return false;
      }
    },
    async queryEvents(sinceMs: number, untilMs: number): Promise<NativeUsageRow[]> {
      return native ? native.queryEvents(sinceMs, untilMs) : [];
    },
    async queryUsageStats(sinceMs: number, untilMs: number): Promise<UsageStatsRow[]> {
      return native && (native as any).queryUsageStats ? (native as any).queryUsageStats(sinceMs, untilMs) : [];
    },
    async queryEventsDebug(sinceMs: number, untilMs: number): Promise<DebugUsageRow[]> {
      return native && (native as any).queryEventsDebug ? (native as any).queryEventsDebug(sinceMs, untilMs) : [];
    },
    async getLauncherPackages(): Promise<string[]> {
      try {
        return native && (native as any).getLauncherPackages ? (native as any).getLauncherPackages() : [];
      } catch {
        return [];
      }
    },
    getWindowInsets(): NativeWindowInsets | null {
      try {
        return native && typeof native.getWindowInsets === 'function' ? native.getWindowInsets() : null;
      } catch {
        return null;
      }
    },
    async saveExportJson(fileName: string, content: string): Promise<boolean | null> {
      try {
        if (!native || typeof native.saveExportJson !== 'function') return null;
        return await native.saveExportJson(fileName, content);
      } catch {
        return null;
      }
    },
    openSettings() {
      try {
        native?.openSettings();
      } catch {
        // Ignore missing activity / settings screen on headless test devices
      }
    },
  };
}
