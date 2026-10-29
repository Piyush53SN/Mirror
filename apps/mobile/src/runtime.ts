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
/* eslint-disable no-console */
import * as SQLite from 'expo-sqlite';
import {
  MirrorStore,
  type DayStoreRowCounts,
  type SessionRepairSnapshot,
  type StoreResetAudit,
  type StoreResetReason,
} from '@mirror/store';
import {
  DEFAULT_MAX_INTERVAL_MS,
  SHARED_EXCLUDED_PACKAGES,
  SHARED_HOME_LAUNCHER_PACKAGES,
  buildUsageEvents,
  collectUsage,
  computeDayForegroundTotals,
  computeDayForegroundTotalsFromStoredEvents,
  describeGapSummary,
  resolveDayForegroundTotals,
  summarizeUsageStatsBucketsForDay,
  traceAppForegroundIntervals,
  validateDailyTotals,
} from '@mirror/core-analytics';
import type {
  OsTotal,
  RawUsageBucketDiagnostic,
  ResolvedDayForegroundTotals,
  TracedAppInterval,
} from '@mirror/core-analytics';
import { expoDriver } from './storage/expoDriver';
import { secureStoreKeys, osRandom } from './storage/keys';
import { ingestDay, ingestRecentDays, localDayKey } from './collector/ingest';
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
  /** Day-clipped foreground totals plus explicit source ('os_events' | 'stored_events' | 'os_bucket_approx') */
  osTotalsWithSource(range: { fromMs: number; toMs: number }): Promise<ResolvedDayForegroundTotals>;
  /** OS-reported day-clipped foreground totals (matches Digital Wellbeing on live days) */
  osTotals(range: { fromMs: number; toMs: number }): Promise<OsTotal[]>;
  /** Pure live OS `UsageEvents` foreground totals clipped to `range` (never falls back to SQLite `stored_events`) */
  liveDayForegroundTotals(range: { fromMs: number; toMs: number }): Promise<OsTotal[]>;
  /** Mirror's stored day-clipped foreground totals from `events` */
  storedForegroundTotals(range: { fromMs: number; toMs: number }): Promise<OsTotal[]>;
  /** Raw unclipped `queryUsageStats(INTERVAL_DAILY)` bucket diagnostics for debug comparison */
  rawBucketTotals(range: { fromMs: number; toMs: number }): Promise<RawUsageBucketDiagnostic[]>;
  /** Read-only forensic trace of raw foreground intervals for `targetApp` across `range` */
  traceAppDayIntervals(
    targetApp: string,
    range: { fromMs: number; toMs: number },
  ): Promise<TracedAppInterval[]>;
  /** Per-local-day `events` vs `sessions` counts in SQLite (indexed plaintext scan) */
  storeDayRowCounts(utcOffsetMinutes?: number): Promise<DayStoreRowCounts[]>;
  /** One-time non-destructive `session_repair_v29` before/after row-count snapshot */
  sessionRepairSnapshot(): Promise<SessionRepairSnapshot | null>;
  /** Validate Mirror vs OS totals */
  validate(range: { fromMs: number; toMs: number }): Promise<ReturnType<typeof validateDailyTotals>>;
  /** Cursor state – where collection started, for "collecting since" line */
  cursorState(): Promise<{ at: number | null; openCount: number }>;
  /** Save an intent label for a session (intentional/mindless/unsure) */
  saveIntentLabel(sessionId: string, label: 'intentional' | 'mindless' | 'unsure'): Promise<void>;
  /** Load all intent labels */
  loadIntentLabels(): Promise<Record<string, 'intentional' | 'mindless' | 'unsure'>>;
  /** Delete all stored `intent_label` events while keeping usage history intact */
  clearAllIntentLabels(): Promise<number>;
  /** Wipe all stored data, log when and why, and record a plaintext reset marker */
  resetStore(options: {
    reason: StoreResetReason;
    previousHistoryStartDay?: string | null;
    detail?: string;
    now?: number;
  }): Promise<StoreResetAudit>;
  /** Read the most recent reset audit marker, if any */
  lastReset(): Promise<StoreResetAudit | null>;
};

let singleton: MirrorRuntime | null = null;
let creating: Promise<MirrorRuntime> | null = null;

export async function createRuntime(options: { allowContent?: boolean; retentionDays?: 90 | 180 | 365 } = {}): Promise<MirrorRuntime> {
  if (singleton) return singleton;
  if (creating) return creating;

  creating = (async () => {
    const db = await SQLite.openDatabaseAsync('mirror.db');
    const keyProvider = secureStoreKeys();
    const store = new MirrorStore({
      driver: expoDriver(db),
      keys: keyProvider,
      random: osRandom,
      allowContent: options.allowContent ?? false,
      retentionDays: options.retentionDays ?? 180,
      onDiagnostic: (message, detail) => {
        console.info('[MirrorStore]', message, detail ?? '');
      },
    });
    await store.open();

    const usage = nativeUsageSource();
    const offsetNow = () => -new Date().getTimezoneOffset();

    // Verify encrypted store key integrity BEFORE any collection or read pass so
    // an Android Keystore invalidation or key rotation recovers cleanly without
    // crashing or mixing new-key ciphertext into an unreadable table.
    const ensureKeyIntegrity = async (now = Date.now()): Promise<StoreResetAudit | null> => {
      const ksNotice = keyProvider.consumeKeystoreInvalidation();
      const check = await store.verifyKeyIntegrity();
      if (!ksNotice && check.ok) return null;

      // Only reset if existing rows actually failed decryption (or existed under old key)
      if (!check.ok) {
        const day = localDayKey(now, offsetNow());
        const reason: 'keystore_invalidated' | 'key_mismatch_reset' = ksNotice
          ? 'keystore_invalidated'
          : 'key_mismatch_reset';
        const detail = ksNotice ?? check.message;
        console.info(
          '[MirrorStore:reset]',
          JSON.stringify({
            when: new Date(now).toISOString(),
            day,
            why: reason,
            detail,
          }),
        );
        return store.recoverFromKeyInvalidation({
          day,
          at: now,
          reason,
          detail,
          utcOffsetMinutes: offsetNow(),
        });
      }
      return null;
    };
    await ensureKeyIntegrity();

    let cachedLauncherPkgs: string[] = [];
    const resolveIgnoredPackages = async (): Promise<string[]> => {
      try {
        const pkgs = await usage.getLauncherPackages();
        if (Array.isArray(pkgs) && pkgs.length > 0) {
          cachedLauncherPkgs = pkgs;
        }
      } catch {}
      const launchers =
        cachedLauncherPkgs.length > 0 ? cachedLauncherPkgs : [...SHARED_HOME_LAUNCHER_PACKAGES];
      return [...new Set([...SHARED_EXCLUDED_PACKAGES, ...launchers])];
    };

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
          await ensureKeyIntegrity(now);
          const ignorePackages = await resolveIgnoredPackages();
          const res = await collectUsage(usage, store, { now, ignorePackages });
          if (res.status === 'permission-required') {
            return res;
          }
          // Refresh today's `data_gaps` summary from a clean single-day pass so stale
          // pre-fix gap rows from earlier today cannot block Insights cards (`data_gaps` only;
          // NEVER deletes rows from `events`).
          try {
            if (await usage.hasPermission()) {
              const todayStart = new Date(now);
              todayStart.setHours(0, 0, 0, 0);
              const fromDayMs = todayStart.getTime();
              const nextDay = new Date(todayStart);
              nextDay.setDate(nextDay.getDate() + 1);
              const toDayMs = nextDay.getTime();

              const rawToday = await usage.queryEvents(fromDayMs - DEFAULT_MAX_INTERVAL_MS, now);
              if (rawToday.length > 0) {
                const rebuiltToday = buildUsageEvents(rawToday, {
                  sinceMs: fromDayMs - DEFAULT_MAX_INTERVAL_MS,
                  untilMs: now,
                  ignorePackages,
                  gapFloorMs: fromDayMs,
                });
                await store.replaceGapsForWindow(
                  'usage_stats',
                  { fromMs: fromDayMs, toMs: toDayMs },
                  rebuiltToday.gaps,
                  now,
                );
              }
            }
          } catch {}
          return res;
        })();
        try {
          return await collectInFlight;
        } finally {
          collectInFlight = null;
        }
      },
      ingestDay: async (day, utcOffsetMinutes = offsetNow()) => {
        const ignorePackages = await resolveIgnoredPackages();
        return ingestDay(store, day, utcOffsetMinutes, ignorePackages);
      },
      ingestRecent: async (now = Date.now()) => {
        if (ingestInFlight) return ingestInFlight;
        ingestInFlight = (async () => {
          const ignorePackages = await resolveIgnoredPackages();
          return ingestRecentDays(store, now, offsetNow(), ignorePackages);
        })();
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
      liveDayForegroundTotals: async (range) => {
        try {
          const now = Date.now();
          const effectiveToMs = Math.min(range.toMs, now);
          if (effectiveToMs <= range.fromMs) return [];
          const hasPerm = await usage.hasPermission().catch(() => false);
          if (!hasPerm) return [];
          const ignorePackages = await resolveIgnoredPackages();
          const queryUntilMs = Math.min(range.toMs + DEFAULT_MAX_INTERVAL_MS, now);
          const rawRows = await usage
            .queryEvents(range.fromMs - DEFAULT_MAX_INTERVAL_MS, queryUntilMs)
            .catch(() => []);
          const hasLiveInDay = rawRows.some(
            (r) => r && typeof r.timeStamp === 'number' && r.timeStamp < effectiveToMs,
          );
          if (!hasLiveInDay) return [];
          return computeDayForegroundTotals(rawRows, {
            window: range,
            nowMs: now,
            lookbackMs: DEFAULT_MAX_INTERVAL_MS,
            ignorePackages,
          });
        } catch {
          return [];
        }
      },
      storedForegroundTotals: async (range) => {
        try {
          const now = Date.now();
          const effectiveToMs = Math.min(range.toMs, now);
          if (effectiveToMs <= range.fromMs) return [];
          const ignorePackages = await resolveIgnoredPackages();
          const storedRows = await store.events({
            from: range.fromMs - DEFAULT_MAX_INTERVAL_MS,
            to: effectiveToMs + DEFAULT_MAX_INTERVAL_MS,
          });
          if (storedRows.length === 0) return [];
          const storedEvents = storedRows
            .map(
              (r) =>
                r.payload as unknown as {
                  kind: 'app_foreground' | 'app_background';
                  app: string;
                  at: string;
                  duration_ms?: number;
                },
            )
            .filter((e) => e.kind === 'app_background' && typeof e.duration_ms === 'number');
          return computeDayForegroundTotalsFromStoredEvents(storedEvents, {
            window: range,
            nowMs: now,
            ignorePackages,
          });
        } catch {
          return [];
        }
      },
      rawBucketTotals: async (range) => {
        try {
          const ignorePackages = await resolveIgnoredPackages();
          const rows = await usage.queryUsageStats(range.fromMs, range.toMs);
          return summarizeUsageStatsBucketsForDay(rows, {
            window: range,
            ignorePackages,
          });
        } catch {
          return [];
        }
      },
      traceAppDayIntervals: async (targetApp, range) => {
        try {
          const now = Date.now();
          const effectiveToMs = Math.min(range.toMs, now);
          if (!targetApp || effectiveToMs <= range.fromMs) return [];
          const hasPerm = await usage.hasPermission().catch(() => false);
          if (!hasPerm) return [];
          const ignorePackages = await resolveIgnoredPackages();
          const queryUntilMs = Math.min(range.toMs + DEFAULT_MAX_INTERVAL_MS, now);
          const rawRows = await usage
            .queryEvents(range.fromMs - DEFAULT_MAX_INTERVAL_MS, queryUntilMs)
            .catch(() => []);
          if (rawRows.length === 0) return [];
          return traceAppForegroundIntervals(rawRows, targetApp, {
            window: range,
            nowMs: now,
            lookbackMs: DEFAULT_MAX_INTERVAL_MS,
            ignorePackages,
          });
        } catch {
          return [];
        }
      },
      storeDayRowCounts: async (utcOffsetMinutes = offsetNow()) => {
        try {
          return await store.dayRowCounts(utcOffsetMinutes);
        } catch {
          return [];
        }
      },
      sessionRepairSnapshot: async () => {
        try {
          return await store.lastSessionRepairSnapshot();
        } catch {
          return null;
        }
      },
      osTotalsWithSource: async (range) => {
        try {
          const now = Date.now();
          const effectiveToMs = Math.min(range.toMs, now);
          if (effectiveToMs <= range.fromMs) {
            return { totals: [], source: 'os_events' };
          }
          const ignorePackages = await resolveIgnoredPackages();
          const hasPerm = await usage.hasPermission().catch(() => false);
          const queryUntilMs = Math.min(range.toMs + DEFAULT_MAX_INTERVAL_MS, now);
          const [rawRows, storedRows, earliestStoredEventMs] = await Promise.all([
            hasPerm
              ? usage.queryEvents(range.fromMs - DEFAULT_MAX_INTERVAL_MS, queryUntilMs).catch(() => [])
              : Promise.resolve([]),
            store
              .events({
                from: range.fromMs - DEFAULT_MAX_INTERVAL_MS,
                to: effectiveToMs + DEFAULT_MAX_INTERVAL_MS,
              })
              .catch(() => []),
            store.earliestEventAt().catch(() => null),
          ]);
          const storedEvents = storedRows
            .map(
              (r) =>
                r.payload as unknown as {
                  kind: 'app_foreground' | 'app_background';
                  app: string;
                  at: string;
                  duration_ms?: number;
                },
            )
            .filter((e) => e.kind === 'app_background' && typeof e.duration_ms === 'number');

          const hasLiveRawInDay = rawRows.some(
            (r) => r && typeof r.timeStamp === 'number' && r.timeStamp < effectiveToMs,
          );
          const bucketRows =
            !hasLiveRawInDay && hasPerm
              ? await usage.queryUsageStats(range.fromMs, effectiveToMs).catch(() => [])
              : [];

          return resolveDayForegroundTotals({
            rawEvents: rawRows,
            storedEvents,
            bucketRows,
            earliestStoredEventMs,
            hasPermission: hasPerm,
            options: {
              window: range,
              nowMs: now,
              lookbackMs: DEFAULT_MAX_INTERVAL_MS,
              ignorePackages,
            },
          });
        } catch {
          return { totals: [], source: 'os_events' };
        }
      },
      osTotals: async (range) => {
        const resolved = await singleton!.osTotalsWithSource(range);
        return resolved.totals;
      },
      validate: async (range) => {
        try {
          const [osTotals, storedTotals] = await Promise.all([
            singleton!.osTotals(range),
            singleton!.storedForegroundTotals(range),
          ]);
          const mirrorTotals = storedTotals.map((r) => ({ app: r.packageName, totalMs: r.totalMs }));
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
      clearAllIntentLabels: async () => {
        try {
          return await store.clearIntentLabels();
        } catch {
          return 0;
        }
      },
      resetStore: async ({ reason, previousHistoryStartDay, detail, now = Date.now() }) => {
        const day = localDayKey(now, offsetNow());
        const audit: StoreResetAudit = {
          at: now,
          day,
          reason,
          ...(previousHistoryStartDay ? { previousHistoryStartDay } : {}),
          ...(detail ? { detail } : {}),
        };
        console.info(
          '[MirrorStore:reset]',
          JSON.stringify({
            when: new Date(now).toISOString(),
            day,
            why: reason,
            previousHistoryStartDay: previousHistoryStartDay ?? null,
            detail: detail ?? null,
          }),
        );
        await store.deleteAll();
        if (reason === 'user_delete_all') {
          // Advance the collector watermark and one-time repair markers to `now`
          // so an explicit "Delete all local data" does not silently re-import
          // the previous 1–6 days from Android's UsageEvents buffer.
          await store.setCursorState('usage_stats', { at: now, open: [] });
          await store.setCursor('lifecycle_repair_v27', now);
          await store.recordSessionRepairSnapshot({
            at: now,
            day,
            recoveredFgEvents: 0,
            rebuiltDays: 0,
            before: [],
            after: [],
          });
        }
        await store.recordResetAudit(audit);
        return audit;
      },
      lastReset: async () => {
        try {
          return await store.lastResetAudit();
        } catch {
          return null;
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
