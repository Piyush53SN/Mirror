/**
 * The runtime: the one place the store, the key provider and the collector are
 * wired together.
 *
 * Nothing in the UI may construct a `MirrorStore`; it asks this module. That keeps
 * "one store per process" true and makes the key provider swappable in tests.
 *
 * The runtime is also the only place the gap summary is assembled for the UI. A
 * screen must not query `data_gaps` itself: the sentence and the numbers have to
 * come from the same call, or a zero can disagree with the words beside it.
 */
import * as SQLite from 'expo-sqlite';
import { MirrorStore } from '@mirror/store';
import { collectUsage, describeGapSummary } from '@mirror/core-analytics';
import { expoDriver } from './storage/expoDriver';
import { secureStoreKeys, osRandom } from './storage/keys';
import { ingestDay, ingestRecentDays } from './collector/ingest';
import { nativeUsageSource } from './collector/usageSource';

export type DataQuality = {
  count: number;
  byReason: Record<string, number>;
  measuredGapMs: number;
  /** The sentence to render. Always produced with the numbers, never separately. */
  sentence: string;
};

export type MirrorRuntime = {
  store: MirrorStore;
  collectNow(now?: number): ReturnType<typeof collectUsage>;
  usage(): ReturnType<typeof nativeUsageSource>;
  /** Attribute sessions and write a complete local day's rollup. */
  ingestDay(day: string, utcOffsetMinutes?: number): ReturnType<typeof ingestDay>;
  /** Recompute the last two complete local days (idempotent). */
  ingestRecent(now?: number): ReturnType<typeof ingestRecentDays>;
  /** What Mirror could not measure, in words and numbers. */
  dataQuality(range?: { fromMs?: number; toMs?: number }): Promise<DataQuality>;
};

let singleton: MirrorRuntime | null = null;
let creating: Promise<MirrorRuntime> | null = null;

export async function createRuntime(options: { allowContent?: boolean; retentionDays?: 90 | 180 | 365 } = {}): Promise<MirrorRuntime> {
  if (singleton) return singleton;
  if (creating) return creating;

  creating = (async () => {
    const db = await SQLite.openDatabaseAsync('mirror.db');
  const store = new MirrorStore({
    driver: expoDriver(db),
    keys: secureStoreKeys(),
    random: osRandom,
    allowContent: options.allowContent ?? false,
    retentionDays: options.retentionDays ?? 180,
  });
  await store.open();

  const usage = nativeUsageSource();
  const offsetNow = () => -new Date().getTimezoneOffset();

    singleton = {
      store,
      usage: () => usage,
      collectNow: (now = Date.now()) => collectUsage(usage, store, { now }),
      ingestDay: (day, utcOffsetMinutes = offsetNow()) => ingestDay(store, day, utcOffsetMinutes),
      ingestRecent: (now = Date.now()) => ingestRecentDays(store, now, offsetNow()),
      dataQuality: async (range = {}) => {
        const summary = await store.gapSummary(range);
        return { ...summary, sentence: describeGapSummary(summary) };
      },
    };
    return singleton;
  })();

  try {
    return await creating;
  } finally {
    creating = null;
  }
}

/** Tests and a future "sign out" path need a way to forget the singleton. */
export function resetRuntime(): void {
  singleton = null;
  creating = null;
}
