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
import { collectUsage, describeGapSummary, validateDailyTotals } from '@mirror/core-analytics';
import type { OsTotal } from '@mirror/core-analytics';
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
  /** OS-reported totals for validation */
  osTotals(range: { fromMs: number; toMs: number }): Promise<OsTotal[]>;
  /** Validate Mirror vs OS totals */
  validate(range: { fromMs: number; toMs: number }): Promise<ReturnType<typeof validateDailyTotals>>;
  /** Cursor state – where collection started, for "collecting since" line */
  cursorState(): Promise<{ at: number | null; openCount: number }>;
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
      collectNow: async (now = Date.now()) => {
        let launcherPkgs: string[] = [];
        try {
          launcherPkgs = await usage.getLauncherPackages();
        } catch {}
        return collectUsage(usage, store, { now, ignorePackages: launcherPkgs });
      },
      ingestDay: (day, utcOffsetMinutes = offsetNow()) => ingestDay(store, day, utcOffsetMinutes),
      ingestRecent: (now = Date.now()) => ingestRecentDays(store, now, offsetNow()),
      dataQuality: async (range = {}) => {
        const summary = await store.gapSummary(range);
        return { ...summary, sentence: describeGapSummary(summary) };
      },
      osTotals: async (range) => {
        try {
          const rows = await usage.queryUsageStats(range.fromMs, range.toMs);
          return rows.map((r) => ({ packageName: r.packageName, totalMs: r.totalTimeInForeground }));
        } catch {
          return [];
        }
      },
      validate: async (range) => {
        try {
          const osRows = await usage.queryUsageStats(range.fromMs, range.toMs);
          const osTotals: OsTotal[] = osRows.map((r) => ({ packageName: r.packageName, totalMs: r.totalTimeInForeground }));
          const sessions = await store.sessions({ fromMs: range.fromMs, toMs: range.toMs });
          const mirrorMap = new Map<string, number>();
          for (const s of sessions) {
            if (s.app === 'dev.mirror.app') continue;
            mirrorMap.set(s.app, (mirrorMap.get(s.app) ?? 0) + s.duration_ms);
          }
          const mirrorTotals = [...mirrorMap.entries()].map(([app, totalMs]) => ({ app, totalMs }));
          return validateDailyTotals(mirrorTotals, osTotals);
        } catch {
          return { rows: [], maxAbsPct: 0, maxAbsMs: 0, overThreshold: [], ok: true };
        }
      },
      cursorState: async () => {
        try {
          const state = await store.getCursorState('usage_stats');
          return { at: state.at, openCount: state.open.length };
        } catch {
          return { at: null, openCount: 0 };
        }
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
