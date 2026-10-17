/**
 * The native usage module, adapted to the collector's port.
 *
 * This is the only place that knows the native module exists. If the module is
 * missing (an older build, iOS before P5, a JS-only test), `available` is false
 * and the collector reports "permission required" rather than pretending there is
 * no usage to show.
 */
import type { UsageSourcePort } from '@mirror/core-analytics';
import { getUsageStatsModule, type NativeUsageRow } from '../../modules/mirror-usage-stats';

export type UsageSource = UsageSourcePort & { available: boolean; openSettings(): void };

export function nativeUsageSource(): UsageSource {
  const native = getUsageStatsModule();
  return {
    available: native !== null,
    async hasPermission() {
      return native ? native.hasPermission() : false;
    },
    async queryEvents(sinceMs: number, untilMs: number): Promise<NativeUsageRow[]> {
      return native ? native.queryEvents(sinceMs, untilMs) : [];
    },
    openSettings() {
      native?.openSettings();
    },
  };
}
