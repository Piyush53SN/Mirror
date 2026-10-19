/**
 * Ingestion: raw events in, sessions + daily rollups out.
 *
 * **Why this is a separate, pure step.** Collection decides what happened;
 * ingestion decides what it *belongs to*. Keeping attribution out of the collector
 * means a bug in session rules is a bug in a pure function with a table of test
 * cases, not a bug in a background task that only appears on a phone at 3 a.m.
 *
 * **Sessions.** A session is one app, one continuous sitting (see `sessionize`).
 * `ingest` adds the two things sessionisation alone cannot: a stable id and the
 * list of events that belong to it, so the store can rebuild the sessions for a
 * window and reassign their events in one transaction.
 *
 * The caller may hand in more events than the window (a look-back and look-ahead
 * of up to the maximum interval), because a sitting that starts at 23:50 and ends
 * at 00:10 only exists as a pair. Those extra events are used for **pairing** and
 * for **assignments**, never for the window's counts or rollups.
 *
 * **Daily rollups.** One sealed object per local day: counts, durations, app
 * package names, unlock counts and the gaps. It carries **no titles, queries or
 * urls** — a rollup is what survives retention when the raw events expire, so it
 * must be safe to keep for eighteen months. Day bucketing uses an explicit
 * `utcOffsetMinutes` (`+330` for IST) rather than the process timezone, because a
 * phone that travels must not silently shift yesterday's totals.
 *
 * **Partial windows are marked, not guessed.** A rollup is only exact if the
 * window covers the whole local day. Rather than inventing totals for a day it
 * only half saw, `ingest` lists that day in `partialDays` and the caller decides
 * whether to re-ingest a wider window. This is the same rule as data gaps: say
 * what is missing.
 */
import type { MirrorEvent } from '@mirror/shared-types';
import { sessionize } from './sessionize';

const DAY_MS = 86_400_000;

export type IngestGap = {
  reason: string;
  count: number;
  fromMs?: number;
  toMs?: number;
};

export type IngestWindow = {
  fromMs: number;
  toMs: number;
};

export type IngestBatch = {
  /** Events to attribute. Covers `window`; extra events outside it are ignored. */
  events: readonly MirrorEvent[];
  /** Counted gaps from the collector, so a rollup can say how much it could not see. */
  gaps?: readonly IngestGap[];
  window: IngestWindow;
};

export type IngestOptions = {
  /** Two intervals of the same app merge when this close. Default 15 min (spec). */
  mergeGapMs?: number;
  /** Minutes east of UTC for day buckets. IST is `330`. */
  utcOffsetMinutes?: number;
  /** Cap on apps kept per rollup, by duration. Default 40. */
  maxAppsPerDay?: number;
  /** Sessions shorter than this are dropped by the sessionizer. Default 0. */
  minDurationMs?: number;
};

export type SessionAssignment = { eventId: string; sessionId: string | null };

export type StoredSession = {
  id: string;
  app: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  source: 'ingested';
};

export type AppTotal = { app: string; ms: number; sessions: number };

/** What the rollup holds. Deliberately closed: no free-form text field exists. */
export type DailyRollupPayload = {
  schema_version: 1;
  day: string;
  utc_offset_minutes: number;
  first_at: string | null;
  last_at: string | null;
  events: number;
  sessions: number;
  session_ms: number;
  apps: AppTotal[];
  /** Package names omitted by `maxAppsPerDay`; the sum still counts their time. */
  apps_omitted: number;
  unlocks: number;
  imports: number;
  gaps: {
    count: number;
    measured_gap_ms: number;
    by_reason: Record<string, number>;
  };
};

export type IngestResult = {
  sessions: StoredSession[];
  /** Every app_foreground/background event in the window, with its session or null. */
  assignments: SessionAssignment[];
  rollups: { day: string; payload: DailyRollupPayload }[];
  /** Days the window only partly covered; their rollups are incomplete by design. */
  partialDays: string[];
  /** Gaps with no date, so they could not be placed in a day. Counted here. */
  unattributedGaps: number;
  dropped: ReturnType<typeof sessionize>['dropped'];
  stats: { events: number; attributed: number; sessions: number };
};

/** Local-day key and the ms at which that local day starts. */
export function localDay(ms: number, utcOffsetMinutes: number): string {
  return new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function dayStartMs(day: string, utcOffsetMinutes: number): number {
  return Date.parse(`${day}T00:00:00Z`) - utcOffsetMinutes * 60_000;
}

/** Day keys touched by a window, in order. */
export function daysInWindow(window: IngestWindow, utcOffsetMinutes: number): string[] {
  const days: string[] = [];
  let cursor = dayStartMs(localDay(window.fromMs, utcOffsetMinutes), utcOffsetMinutes);
  const last = window.toMs - 1;
  // A malformed (inverted) window yields no days rather than an infinite loop.
  if (!(last >= cursor)) return days;
  while (cursor <= last) {
    days.push(localDay(cursor, utcOffsetMinutes));
    cursor += DAY_MS;
    if (days.length > 4000) break; // ~11 years; a guard, not a feature
  }
  return days;
}

/**
 * Milliseconds of `[start, end)` that fall inside `[from, to)`.
 * Used to split a session across midnight instead of attributing all of it to the
 * day it started — a 90-minute sitting at 23:30 should not vanish from the 1st.
 */
export function overlapMs(start: number, end: number, from: number, to: number): number {
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

export function ingest(batch: IngestBatch, options: IngestOptions = {}): IngestResult {
  const utcOffsetMinutes = options.utcOffsetMinutes ?? 0;
  const maxAppsPerDay = options.maxAppsPerDay ?? 40;
  const { window } = batch;

  const timed = batch.events.filter((event) => Number.isFinite(Date.parse(event.at)));
  const inWindow = timed.filter((event) => {
    const at = Date.parse(event.at);
    return at >= window.fromMs && at < window.toMs;
  });

  const { sessions, dropped } = sessionize(timed, {
    mergeGapMs: options.mergeGapMs,
    minDurationMs: options.minDurationMs,
  });

  const stored: StoredSession[] = sessions.map((session) => ({
    id: session.id,
    app: session.app,
    start_ms: session.startMs,
    end_ms: session.endMs,
    duration_ms: session.durationMs,
    source: 'ingested',
  }));

  // Attribution: every foreground/background event gets a session id, or an
  // explicit null. Nulls matter — an event that used to belong to a session that
  // no longer exists must be cleared, not left pointing at a deleted row.
  const ownerOf = new Map<string, string>();
  for (const session of sessions) for (const eventId of session.eventIds) ownerOf.set(eventId, session.id);
  const assignments: SessionAssignment[] = [];
  for (const event of timed) {
    if (event.kind !== 'app_foreground' && event.kind !== 'app_background') continue;
    const owner = ownerOf.get(event.id);
    if (owner !== undefined) {
      // A member of a session is assigned even when it falls just outside the
      // window: its pair is what made the session real.
      assignments.push({ eventId: event.id, sessionId: owner });
      continue;
    }
    const atMs = Date.parse(event.at);
    if (atMs >= window.fromMs && atMs < window.toMs) assignments.push({ eventId: event.id, sessionId: null });
  }

  const days = daysInWindow(window, utcOffsetMinutes);
  const partialDays: string[] = [];
  for (const day of days) {
    const start = dayStartMs(day, utcOffsetMinutes);
    const end = start + DAY_MS;
    if (window.fromMs > start || window.toMs < end) partialDays.push(day);
  }

  const unattributedGaps = (batch.gaps ?? []).filter((gap) => gap.fromMs === undefined && gap.toMs === undefined).length;

  const rollups = days.map((day) => {
    const start = dayStartMs(day, utcOffsetMinutes);
    const end = start + DAY_MS;
    const events = inWindow.filter((event) => {
      const at = Date.parse(event.at);
      return at >= start && at < end;
    });

    const appMs = new Map<string, { ms: number; sessions: number }>();
    let sessionMs = 0;
    let sessionCount = 0;
    for (const session of sessions) {
      const ms = overlapMs(session.startMs, session.endMs, start, end);
      if (ms <= 0) continue;
      sessionMs += ms;
      const row = appMs.get(session.app) ?? { ms: 0, sessions: 0 };
      row.ms += ms;
      appMs.set(session.app, row);
      // Count the session on the day it began; a sitting that crosses midnight is
      // one sitting, and splitting the count would overstate the number of opens.
      if (session.startMs >= start && session.startMs < end) {
        sessionCount += 1;
        row.sessions += 1;
      }
    }

    const apps = [...appMs.entries()]
      .map(([app, row]) => ({ app, ms: row.ms, sessions: row.sessions }))
      .sort((a, b) => b.ms - a.ms || a.app.localeCompare(b.app));
    const kept = apps.slice(0, maxAppsPerDay);

    const byReason: Record<string, number> = {};
    let gapCount = 0;
    let measuredGapMs = 0;
    for (const gap of batch.gaps ?? []) {
      const anchor = gap.fromMs ?? gap.toMs;
      if (anchor === undefined) continue;
      if (anchor < start || anchor >= end) continue;
      gapCount += gap.count;
      byReason[gap.reason] = (byReason[gap.reason] ?? 0) + gap.count;
      if (gap.fromMs !== undefined && gap.toMs !== undefined) measuredGapMs += Math.max(0, gap.toMs - gap.fromMs);
    }

    const times = events.map((event) => Date.parse(event.at)).sort((a, b) => a - b);
    const payload: DailyRollupPayload = {
      schema_version: 1,
      day,
      utc_offset_minutes: utcOffsetMinutes,
      first_at: times.length > 0 ? new Date(times[0]!).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
      last_at: times.length > 0 ? new Date(times[times.length - 1]!).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
      events: events.length,
      sessions: sessionCount,
      session_ms: sessionMs,
      apps: kept,
      apps_omitted: apps.length - kept.length,
      unlocks: events.filter((event) => event.kind === 'device_unlock').length,
      imports: events.filter((event) => event.kind === 'import_item').length,
      gaps: { count: gapCount, measured_gap_ms: measuredGapMs, by_reason: byReason },
    };
    return { day, payload };
  }).filter((entry) => entry.payload.events > 0 || entry.payload.gaps.count > 0);

  return {
    sessions: stored,
    assignments,
    rollups,
    partialDays: [...new Set(partialDays)].sort(),
    unattributedGaps,
    dropped,
    stats: { events: inWindow.length, attributed: assignments.filter((a) => a.sessionId !== null).length, sessions: stored.length },
  };
}

/**
 * One sentence for the Privacy Centre, from `store.gapSummary()`.
 *
 * Empty means empty: with no gaps it says so rather than showing a friendly zero
 * that could hide a collector that never ran.
 */
export function describeGapSummary(summary: { count: number; byReason: Record<string, number>; measuredGapMs: number }): string {
  if (!Number.isFinite(summary.count) || summary.count <= 0) return 'No collection gaps recorded.';
  const minutes = Math.round(summary.measuredGapMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const minutesText = hours === 0 ? `${minutes} min` : minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const reasons = Object.entries(summary.byReason)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `${count} ${reason.replace(/_/g, ' ')}`)
    .join(', ');
  return `${summary.count} collection gap${summary.count === 1 ? '' : 's'} (${minutesText} unmeasured; ${reasons}).`;
}
