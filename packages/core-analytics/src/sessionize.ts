/**
 * Sessionisation.
 *
 * The OS gives us app foreground intervals; a *session* is what a person would
 * call one sitting. The rules are deliberately few and testable:
 *
 *   - an interval opens on `app_foreground` and closes on `app_background`;
 *   - two intervals of the same app merge when the gap between them is at most
 *     `mergeGapMs` (default 15 min: switching to a notification and back is still
 *     the same sitting; spec says 15 min idle per app, 3 min cross-app link);
 *   - an unclosed interval is dropped, not extended to \"now\" — an inferred end
 *     would be a fabricated duration;
 *   - a background with no matching foreground is ignored;
 *   - zero-length intervals are dropped.
 *
 * Everything is pure: same input, same output, no clock, no storage.
 */
import type { CloseReason, MirrorEvent } from '@mirror/shared-types';
import { isExcludedApp } from './usage';

/** FNV-1a, 32-bit. Only used to keep two apps with identical bounds apart. */
function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).slice(-4);
}

/** `ses_` + start/end in base36 + app fingerprint. Always inside `ses_[A-Za-z0-9_-]{6,40}`. */
export function sessionId(app: string, startMs: number, endMs: number): string {
  return `ses_${Math.max(0, Math.floor(startMs)).toString(36)}${Math.floor(endMs).toString(36)}_${fingerprint(app)}`;
}

export type Session = {
  /**
   * Deterministic id, `ses_` + base36 bounds + an app fingerprint.
   *
   * Sessions are derived, so the id must be derivable: a re-ingest of the same
   * interval produces the same id, and a merge produces a different one, which is
   * what lets the store replace rather than accumulate. The shape matches the
   * `SESSION_ID` the event validator accepts, because an `intent_label` points at
   * a session by this id.
   */
  id: string;
  app: string;
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Present when this sitting ended on screen-off, device lock, or shutdown. */
  closedBy?: CloseReason;
  /** The foreground/background events that produced this session. */
  eventIds: string[];
};

export type SessionizeOptions = {
  /** Gaps at or below this merge two intervals of the same app. */
  mergeGapMs?: number;
  /** Intervals shorter than this are dropped. Default 0: recorded is recorded. */
  minDurationMs?: number;
  /** Dynamic home-launcher or extra excluded packages merged with `SHARED_EXCLUDED_PACKAGES`. */
  ignorePackages?: readonly string[];
};

export type SessionizeResult = {
  sessions: Session[];
  /** Why intervals were dropped, so a collector bug is visible instead of silent. */
  dropped: {
    reason: 'unclosed' | 'orphan_background' | 'zero_length' | 'below_minimum' | 'ignored_package';
    app?: string;
    at?: string;
  }[];
};

const ms = (iso: string) => Date.parse(iso);

export const DEFAULT_MERGE_GAP_MS = 15 * 60 * 1000; // 15 min idle per app (spec)
export const DEFAULT_CROSS_APP_LINK_GAP_MS = 3 * 60 * 1000; // 3 min to link cross-app switches (journey)

export function sessionize(events: readonly MirrorEvent[], options: SessionizeOptions = {}): SessionizeResult {
  const mergeGapMs = options.mergeGapMs ?? DEFAULT_MERGE_GAP_MS;
  const minDurationMs = options.minDurationMs ?? 0;
  const extraIgnore = options.ignorePackages ? new Set<string>(options.ignorePackages) : undefined;

  const ordered = [...events]
    .filter((e) => e.kind === 'app_foreground' || e.kind === 'app_background')
    .sort((a, b) => ms(a.at) - ms(b.at) || (a.kind === 'app_foreground' ? -1 : 1));

  const open = new Map<string, { start: number; at: string; eventId: string }>();
  const intervals: { app: string; start: number; end: number; closeReason?: CloseReason; eventIds: string[] }[] = [];
  const closeBoundaries: number[] = [];
  const dropped: SessionizeResult['dropped'] = [];

  for (const event of ordered) {
    if (event.kind === 'app_background' && event.close_reason) {
      const boundaryAt = ms(event.at);
      if (Number.isFinite(boundaryAt)) closeBoundaries.push(boundaryAt);
    }
    if (isExcludedApp(event.app, undefined, extraIgnore)) {
      dropped.push({ reason: 'ignored_package', app: event.app, at: event.at });
      continue;
    }
    if (event.kind === 'app_foreground') {
      // A second foreground without a background means the collector missed an
      // event; keep the earlier start (the sitting did not end) and note nothing,
      // because there is no honest reason to invent one.
      if (!open.has(event.app)) open.set(event.app, { start: ms(event.at), at: event.at, eventId: event.id });
      continue;
    }
    const started = open.get(event.app);
    if (!started) {
      dropped.push({ reason: 'orphan_background', app: event.app, at: event.at });
      continue;
    }
    open.delete(event.app);
    const end = ms(event.at);
    const duration = end - started.start;
    if (duration < 0) {
      dropped.push({ reason: 'zero_length', app: event.app, at: event.at });
      continue;
    }
    if (duration === 0) {
      dropped.push({ reason: 'zero_length', app: event.app, at: event.at });
      continue;
    }
    if (duration < minDurationMs) {
      dropped.push({ reason: 'below_minimum', app: event.app, at: event.at });
      continue;
    }
    intervals.push({
      app: event.app,
      start: started.start,
      end,
      ...(event.close_reason ? { closeReason: event.close_reason } : {}),
      eventIds: [started.eventId, event.id].filter(Boolean),
    });
  }

  for (const [app, started] of open) dropped.push({ reason: 'unclosed', app, at: started.at });

  closeBoundaries.sort((a, b) => a - b);
  const crossedScreenOrLock = (fromEnd: number, toStart: number): boolean => {
    for (const boundary of closeBoundaries) {
      if (boundary < fromEnd) continue;
      if (boundary <= toStart) return true;
      break;
    }
    return false;
  };

  // Merge per app, then order by start — NEVER merging across screen-off, lock, or shutdown.
  const byApp = new Map<string, { app: string; start: number; end: number; closeReason?: CloseReason; eventIds: string[] }[]>();
  for (const interval of intervals) {
    const list = byApp.get(interval.app) ?? [];
    list.push(interval);
    byApp.set(interval.app, list);
  }

  const sessions: Session[] = [];
  for (const list of byApp.values()) {
    list.sort((a, b) => a.start - b.start);
    let current = { ...list[0]! };
    for (const next of list.slice(1)) {
      if (
        !current.closeReason &&
        !crossedScreenOrLock(current.end, next.start) &&
        next.start - current.end <= mergeGapMs
      ) {
        current.end = Math.max(current.end, next.end);
        current.closeReason = next.closeReason;
        current.eventIds = [...current.eventIds, ...next.eventIds];
      } else {
        sessions.push(toSession(current));
        current = { ...next };
      }
    }
    sessions.push(toSession(current));
  }

  sessions.sort((a, b) => ms(a.start) - ms(b.start));
  return { sessions, dropped };
}

const toSession = (i: { app: string; start: number; end: number; closeReason?: CloseReason; eventIds: string[] }): Session => ({
  id: sessionId(i.app, i.start, i.end),
  app: i.app,
  start: new Date(i.start).toISOString().replace(/\.\\d{3}Z$/, 'Z'),
  end: new Date(i.end).toISOString().replace(/\.\\d{3}Z$/, 'Z'),
  startMs: i.start,
  endMs: i.end,
  durationMs: i.end - i.start,
  ...(i.closeReason ? { closedBy: i.closeReason } : {}),
  // A merge can meet the same event twice only if the OS repeated a row; the
  // store's assignment path is idempotent either way, but a set keeps it honest.
  eventIds: [...new Set(i.eventIds)],
});

export type Journey = {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  sessions: Session[];
  apps: string[];
};

export type JourneyOptions = {
  /** Gap between sessions of different apps to still be same journey. Default 3 min. */
  crossAppGapMs?: number;
};

/**
 * Group sessions into journeys: a journey is a sequence of sessions where the
 * gap between one session's end and the next session's start is <= crossAppGapMs.
 * This implements the spec's "3 minutes to link cross-app switches".
 * Sessions are assumed already merged per-app with 15 min gap.
 */
export function buildJourneys(sessions: readonly Session[], options: JourneyOptions = {}): Journey[] {
  const crossAppGapMs = options.crossAppGapMs ?? DEFAULT_CROSS_APP_LINK_GAP_MS;
  if (sessions.length === 0) return [];
  const ordered = [...sessions].sort((a, b) => a.startMs - b.startMs);
  const journeys: Journey[] = [];
  let current: Session[] = [ordered[0]!];
  for (let i = 1; i < ordered.length; i++) {
    const prev = current[current.length - 1]!;
    const next = ordered[i]!;
    if (!prev.closedBy && next.startMs - prev.endMs <= crossAppGapMs) {
      current.push(next);
    } else {
      journeys.push(toJourney(current));
      current = [next];
    }
  }
  journeys.push(toJourney(current));
  return journeys;
}

function toJourney(sessions: Session[]): Journey {
  const startMs = sessions[0]!.startMs;
  const endMs = Math.max(...sessions.map((s) => s.endMs));
  const apps = [...new Set(sessions.map((s) => s.app))];
  const id = `jny_${startMs.toString(36)}${endMs.toString(36)}_${apps.length}`;
  return {
    id,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    sessions,
    apps,
  };
}

/** Sessions shorter than this are the "under 8 seconds" edge the brief names. */
export const SHORT_SESSION_MS = 8_000;

export type SessionSummary = {
  count: number;
  totalMs: number;
  /** Share of sessions shorter than 8 s, 0..1. Empty is 0, never NaN. */
  shortShare: number;
  medianMs: number;
};

/** Summary over sessions — the only shape scoring needs, and the one it is tested on. */
export function summarise(sessions: readonly Session[]): SessionSummary {
  if (sessions.length === 0) return { count: 0, totalMs: 0, shortShare: 0, medianMs: 0 };
  const durations = sessions.map((s) => s.durationMs).sort((a, b) => a - b);
  const totalMs = durations.reduce((a, b) => a + b, 0);
  const short = durations.filter((d) => d < SHORT_SESSION_MS).length;
  const mid = Math.floor(durations.length / 2);
  const medianMs = durations.length % 2 === 0 ? Math.round((durations[mid - 1]! + durations[mid]!) / 2) : durations[mid]!;
  return { count: sessions.length, totalMs, shortShare: short / durations.length, medianMs };
}
