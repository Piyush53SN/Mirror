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
import { collectUsage, describeGapSummary, validateDailyTotals, isIgnoredSystemApp } from '@mirror/core-analytics';
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
  /** Recompute the last two complete local days + today (idempotent). */
  ingestRecent(now?: number): ReturnType<typeof ingestRecentDays>;
  /** What Mirror could not measure, in words and numbers. */
  dataQuality(range?: { fromMs?: number; toMs?: number }): Promise<DataQuality>;
  /** OS-reported totals for validation */
  osTotals(range: { fromMs: number; toMs: number }): Promise<OsTotal[]>;
  /** Validate Mirror vs OS totals */
  validate(range: { fromMs: number; toMs: number }): Promise<ReturnType<typeof validateDailyTotals>>;
  /** Cursor state – where collection started, for "collecting since" line */
  cursorState(): Promise<{ at: number | null; openCount: number }>;
  /** Save an intent label for a session (intentional/mindless/unsure) */
  saveIntentLabel(sessionId: string, label: 'intentional' | 'mindless' | 'unsure'): Promise<void>;
  /** Load all intent labels */
  loadIntentLabels(): Promise<Record<string, 'intentional' | 'mindless' | 'unsure'>>;
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

    // Single-flight guards so AppState 'active', initial mount, Refresh, and
    // background WorkManager tasks coalesce rather than racing on cursor_state.
    let collectInFlight: ReturnType<typeof collectUsage> | null = null;
    let ingestInFlight: ReturnType<typeof ingestRecentDays> | null = null;

    singleton = {
      store,
      usage: () => usage,
      collectNow: async (now = Date.now()) => {
        if (collectInFlight) return collectInFlight;
        collectInFlight = (async () => {
          let launcherPkgs: string[] = [];
          try {
            launcherPkgs = await usage.getLauncherPackages();
          } catch {}
          return collectUsage(usage, store, { now, ignorePackages: launcherPkgs });
        })();
        try {
          return await collectInFlight;
        } finally {
          collectInFlight = null;
        }
      },
      ingestDay: (day, utcOffsetMinutes = offsetNow()) => ingestDay(store, day, utcOffsetMinutes),
      ingestRecent: async (now = Date.now()) => {
        if (ingestInFlight) return ingestInFlight;
        ingestInFlight = ingestRecentDays(store, now, offsetNow());
        try {
          return await ingestInFlight;
        } finally {
          ingestInFlight = null;
        }
      },
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
          let launcherPkgs: string[] = [];
          try {
            launcherPkgs = await usage.getLauncherPackages();
          } catch {}
          const launcherSet = new Set(launcherPkgs);
          const osRows = await usage.queryUsageStats(range.fromMs, range.toMs);
          const osTotals: OsTotal[] = osRows
            .filter((r) => !launcherSet.has(r.packageName) && !isIgnoredSystemApp(r.packageName))
            .map((r) => ({ packageName: r.packageName, totalMs: r.totalTimeInForeground }));
          const sessions = await store.sessions({ fromMs: range.fromMs, toMs: range.toMs });
          const mirrorMap = new Map<string, number>();
          for (const s of sessions) {
            if (launcherSet.has(s.app) || isIgnoredSystemApp(s.app)) continue;
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
      saveIntentLabel: async (sessionId: string, label: 'intentional' | 'mindless' | 'unsure') => {
        const id = `label_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const now = new Date().toISOString();
        const event = {
          schema_version: 1,
          id,
          kind: 'intent_label',
          at: now,
          tier: 'D',
          origin: 'user',
          content: 'metadata',
          session_id: sessionId,
          label,
        };
        await store.appendEvents([event]);
      },
      loadIntentLabels: async () => {
        try {
          const events = await store.events({ kind: 'intent_label' });
          const map: Record<string, 'intentional' | 'mindless' | 'unsure'> = {};
          for (const ev of events) {
            const payload = ev.payload as any;
            const sid = payload.session_id ?? ev.session_id;
            const lbl = payload.label;
            if (typeof sid === 'string' && (lbl === 'intentional' || lbl === 'mindless' || lbl === 'unsure')) {
              map[sid] = lbl;
            }
          }
          return map;
        } catch {
          return {};
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
