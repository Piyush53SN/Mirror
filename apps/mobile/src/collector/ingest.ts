/**
 * Persist one local day of ingestion.
 *
 * The pure rules live in `@mirror/core-analytics/ingest`; this file is only the
 * boundary between them and the sealed store: read the day's events, rehydrate the
 * sealed payload into the event shape, ingest, write the sessions and the rollup.
 *
 * **Only complete days produce a rollup.** A partial day would replace a good
 * rollup with a smaller one, and an average built on that is worse than no average.
 * The day boundary is local, and the offset is passed in by the caller (the app
 * reads it once per pass), so a phone that travels does not silently rewrite
 * yesterday.
 */
import {
  ingest,
  dayStartMs,
  DEFAULT_MAX_INTERVAL_MS,
  recoverMissingForegroundEvents,
} from '@mirror/core-analytics';
import type { MirrorEvent } from '@mirror/shared-types';
import type { MirrorStore, SessionRepairSnapshot } from '@mirror/store';

const DAY_MS = 86_400_000;

/**
 * How far outside the day to fetch events.
 *
 * A sitting can last up to `DEFAULT_MAX_INTERVAL_MS` (6 h), so a pair straddling
 * midnight can have its halves on either side. Pairing needs the neighbours; the
 * day's counts still come only from events inside it.
 */
const SESSION_LOOKAROUND_MS = DEFAULT_MAX_INTERVAL_MS + 60_000;

export type IngestDayResult = {
  day: string;
  events: number;
  sessions: number;
  reassigned: number;
  rollupWritten: boolean;
  partial: boolean;
  sessionsWritten: number;
};

/** Local date for `ms`, as `YYYY-MM-DD`, at an explicit offset east of UTC. */
export function localDayKey(ms: number, utcOffsetMinutes: number): string {
  return new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export async function ingestDay(store: MirrorStore, day: string, utcOffsetMinutes: number): Promise<IngestDayResult> {
  const fromMs = dayStartMs(day, utcOffsetMinutes);
  const toMs = fromMs + DAY_MS;

  const rows = await store.events({ from: fromMs - SESSION_LOOKAROUND_MS, to: toMs + SESSION_LOOKAROUND_MS });
  // The sealed payload *is* the event minus the indexed columns; rehydrate those.
  const events = rows.map(
    (row) => ({ ...row.payload, id: row.id, session_id: row.session_id ?? undefined }) as unknown as MirrorEvent,
  );

  // Gaps are filtered by span inside `ingest`; fetch a wide band by record time so
  // a gap discovered during the next day's sync still lands on the day it describes.
  const gaps = (await store.gaps({ fromMs: fromMs - 2 * DAY_MS, toMs: toMs + DAY_MS })).map((gap) => ({
    reason: gap.reason,
    count: gap.count,
    fromMs: gap.from_ms ?? undefined,
    toMs: gap.to_ms ?? undefined,
  }));

  const result = ingest({ events, gaps, window: { fromMs, toMs } }, { utcOffsetMinutes });

  // Only sessions that overlap the day are written. The look-around events that
  // belong to a session entirely outside it are still assigned by `ingest`, but
  // writing those sessions here would be this pass claiming another day's work.
  const sessions = result.sessions.filter((session) => session.end_ms > fromMs && session.start_ms < toMs);
  const kept = new Set(sessions.map((session) => session.id));
  const assignments = result.assignments.filter((assignment) => assignment.sessionId === null || kept.has(assignment.sessionId));

  const persisted = await store.applySessions({ window: { fromMs, toMs }, sessions, assignments });

  const rollup = result.rollups.find((entry) => entry.day === day);
  const partial = result.partialDays.includes(day);
  // A partial day is *not* written: replacing a full rollup with a smaller one
  // would make an average that is worse than no average.
  const rollupWritten = Boolean(rollup) && !partial;
  if (rollup && rollupWritten) await store.putRollup(day, rollup.payload);

  return {
    day,
    events: result.stats.events,
    sessions: result.stats.sessions,
    reassigned: persisted.reassigned,
    sessionsWritten: persisted.written,
    rollupWritten,
    partial,
  };
}

/**
 * One-time non-destructive session repair (`session_repair_v29`).
 *
 * Reconstructs any missing `app_foreground` partners dropped by `4f27118`'s
 * sub-second millisecond truncation via `store.appendEvents` (pure `INSERT OR IGNORE`,
 * **never deletes events**), rebuilds `sessions` and complete-day `daily_rollups`
 * for every local day that has stored usage events, and records the `before` / `after`
 * per-day row-count snapshot in `meta` for `DebugView`.
 */
export async function repairSessionsFromStoredEvents(
  store: MirrorStore,
  now: number,
  utcOffsetMinutes: number,
): Promise<SessionRepairSnapshot> {
  const existing = await store.lastSessionRepairSnapshot();
  if (existing) return existing;

  const before = await store.dayRowCounts(utcOffsetMinutes);
  let recoveredFgEvents = 0;

  if (before.some((r) => r.bgEvents > 0)) {
    const allStored = await store.events();
    const candidates = allStored.map((row) => ({
      id: row.id,
      kind: row.kind,
      origin: typeof row.payload.origin === 'string' ? row.payload.origin : undefined,
      app: typeof row.payload.app === 'string' ? row.payload.app : undefined,
      at: typeof row.payload.at === 'string' ? row.payload.at : new Date(row.at).toISOString(),
      duration_ms:
        typeof row.payload.duration_ms === 'number' ? row.payload.duration_ms : undefined,
    }));
    const missingFg = recoverMissingForegroundEvents(candidates);
    if (missingFg.length > 0) {
      const appended = await store.appendEvents(missingFg);
      recoveredFgEvents = appended.inserted;
    }
  }

  const afterRecover =
    recoveredFgEvents > 0 ? await store.dayRowCounts(utcOffsetMinutes) : before;
  let rebuiltDays = 0;
  for (const row of afterRecover) {
    if (row.fgEvents > 0 || row.bgEvents > 0 || row.otherEvents > 0) {
      await ingestDay(store, row.day, utcOffsetMinutes);
      rebuiltDays += 1;
    }
  }

  const after = await store.dayRowCounts(utcOffsetMinutes);
  const snapshot: SessionRepairSnapshot = {
    at: now,
    day: localDayKey(now, utcOffsetMinutes),
    recoveredFgEvents,
    rebuiltDays,
    before,
    after,
  };
  await store.recordSessionRepairSnapshot(snapshot);
  return snapshot;
}

/**
 * Ingest today, yesterday and the day before, in the phone's current offset,
 * plus any older local day across the entire SQLite history that has stored
 * usage events (`fgEvents`/`bgEvents`) and `0` derived `sessions`.
 *
 * Never deletes stored `events`. If any day has orphaned `app_background`
 * events without matching `app_foreground` events, missing `app_foreground`
 * rows are appended non-destructively before session derivation.
 */
export async function ingestRecentDays(store: MirrorStore, now: number, utcOffsetMinutes: number): Promise<IngestDayResult[]> {
  const today = localDayKey(now, utcOffsetMinutes);
  const yesterday = localDayKey(now - DAY_MS, utcOffsetMinutes);
  const dayBefore = localDayKey(now - 2 * DAY_MS, utcOffsetMinutes);

  const results: IngestDayResult[] = [];
  try {
    // Strictly one-time, idempotent repair gated by `session_repair_v29` in `meta`.
    await repairSessionsFromStoredEvents(store, now, utcOffsetMinutes);

    const dayCounts = await store.dayRowCounts(utcOffsetMinutes);
    for (const row of dayCounts) {
      if (row.day >= dayBefore) continue;
      const hasUsageEvents = row.fgEvents > 0 || row.bgEvents > 0 || row.otherEvents > 0;
      if (hasUsageEvents && row.sessions === 0) {
        results.push(await ingestDay(store, row.day, utcOffsetMinutes));
      }
    }
  } catch {
    // Non-fatal; standard 3-day window still runs below.
  }

  results.push(await ingestDay(store, dayBefore, utcOffsetMinutes));
  results.push(await ingestDay(store, yesterday, utcOffsetMinutes));
  results.push(await ingestDay(store, today, utcOffsetMinutes));
  return results;
}
