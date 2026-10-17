/**
 * Android usage rows → Mirror events.
 *
 * The native module does one thing: ask `UsageStatsManager` for raw
 * `UsageEvents` and hand back rows. Everything that decides what those rows
 * *mean* lives here, as pure functions with tests — because this is where a
 * collector bug would silently inflate a person's screen time.
 *
 * Rules:
 *   - only foreground/background events for real packages are considered;
 *   - an interval needs an open and a close inside the window; an unclosed one is
 *     dropped, never extended to "now";
 *   - intervals longer than `maxIntervalMs` (6 h) are dropped as implausible
 *     rather than trusted: a phone that reports a 14-hour YouTube session has a
 *     broken event stream, and Mirror would rather lose the day than invent it;
 *   - ids are deterministic from (package, start), so re-collecting an overlapping
 *     window is idempotent and an interrupted collection is safe to retry.
 */

/** `UsageEvents.Event` type codes. Android has used two sets; accept both. */
export const USAGE_EVENT_TYPE = {
  MOVE_TO_FOREGROUND: 1,
  MOVE_TO_BACKGROUND: 2,
  ACTIVITY_RESUMED: 23,
  ACTIVITY_PAUSED: 24,
} as const;

const FOREGROUND_TYPES = new Set<number>([USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, USAGE_EVENT_TYPE.ACTIVITY_RESUMED]);
const BACKGROUND_TYPES = new Set<number>([USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, USAGE_EVENT_TYPE.ACTIVITY_PAUSED]);

export type UsageRow = {
  /** Android package name, e.g. `com.google.android.youtube`. */
  packageName: string;
  /** Activity class when the OS reports it; not stored, only used to skip dialogs. */
  className?: string;
  /** One of USAGE_EVENT_TYPE. */
  eventType: number;
  /** Milliseconds since epoch, from the OS. */
  timeStamp: number;
};

export type UsageEvent = {
  schema_version: 1;
  id: string;
  kind: 'app_foreground' | 'app_background';
  at: string;
  tier: 'D';
  origin: 'os';
  content: 'metadata';
  app: string;
  duration_ms?: number;
  session_id?: string;
};

export type UsageDropReason =
  | 'invalid_package'
  | 'ignored_package'
  | 'outside_window'
  | 'unknown_type'
  | 'orphan_background'
  | 'unclosed'
  | 'too_long'
  | 'below_minimum';

export type UsageDrop = { reason: UsageDropReason; app?: string; at?: number };

export type BuildUsageOptions = {
  /** Window actually queried [sinceMs, untilMs). */
  sinceMs: number;
  untilMs: number;
  /** Packages that are never meaningful: Mirror itself, launchers, system UI. */
  ignorePackages?: readonly string[];
  /** Intervals longer than this are treated as an OS glitch, not as use. */
  maxIntervalMs?: number;
  /** Intervals shorter than this are not a sitting. Default 0. */
  minIntervalMs?: number;
};

export type BuildUsageResult = {
  events: UsageEvent[];
  dropped: UsageDrop[];
  stats: { rows: number; intervals: number; totalMs: number; unclosed: number };
  /** Where the next collection should start. Idempotent ids make overlap safe. */
  nextCursor: number;
};

const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
const DEFAULT_MAX_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const DEFAULT_IGNORED_PACKAGES = [
  'dev.mirror.app',
  'com.android.systemui',
  'com.android.launcher',
  'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
] as const;

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** FNV-1a, 32 bits, hex. Deterministic ids without pulling a hash library in. */
function stableId(prefix: string, app: string, startMs: number): string {
  let hash = 2166136261;
  const input = `${app}\u0000${startMs}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `${prefix}_${hash.toString(16).padStart(8, '0')}${startMs.toString(36).slice(-8)}`;
}

export function buildUsageEvents(rows: readonly UsageRow[], options: BuildUsageOptions): BuildUsageResult {
  const ignore = new Set([...(options.ignorePackages ?? DEFAULT_IGNORED_PACKAGES)]);
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
  const minIntervalMs = options.minIntervalMs ?? 0;
  const dropped: UsageDrop[] = [];

  const ordered = [...rows].sort((a, b) => a.timeStamp - b.timeStamp);
  const open = new Map<string, number>();
  const intervals: { app: string; start: number; end: number }[] = [];

  for (const row of ordered) {
    if (!PACKAGE.test(row.packageName)) {
      dropped.push({ reason: 'invalid_package', app: row.packageName, at: row.timeStamp });
      continue;
    }
    if (ignore.has(row.packageName)) {
      dropped.push({ reason: 'ignored_package', app: row.packageName, at: row.timeStamp });
      continue;
    }
    if (row.timeStamp < options.sinceMs || row.timeStamp >= options.untilMs) {
      dropped.push({ reason: 'outside_window', app: row.packageName, at: row.timeStamp });
      continue;
    }
    if (!FOREGROUND_TYPES.has(row.eventType) && !BACKGROUND_TYPES.has(row.eventType)) {
      dropped.push({ reason: 'unknown_type', app: row.packageName, at: row.timeStamp });
      continue;
    }

    if (FOREGROUND_TYPES.has(row.eventType)) {
      // A second foreground for one app means we missed its close. Keep the
      // earlier start: the sitting did not restart.
      if (!open.has(row.packageName)) open.set(row.packageName, row.timeStamp);
      continue;
    }

    const start = open.get(row.packageName);
    if (start === undefined) {
      dropped.push({ reason: 'orphan_background', app: row.packageName, at: row.timeStamp });
      continue;
    }
    open.delete(row.packageName);
    const duration = row.timeStamp - start;
    if (duration > maxIntervalMs) {
      dropped.push({ reason: 'too_long', app: row.packageName, at: start });
      continue;
    }
    if (duration <= 0) {
      dropped.push({ reason: 'below_minimum', app: row.packageName, at: start });
      continue;
    }
    if (duration < minIntervalMs) {
      dropped.push({ reason: 'below_minimum', app: row.packageName, at: start });
      continue;
    }
    intervals.push({ app: row.packageName, start, end: row.timeStamp });
  }

  for (const [app, start] of open) dropped.push({ reason: 'unclosed', app, at: start });

  intervals.sort((a, b) => a.start - b.start || a.app.localeCompare(b.app));
  const events: UsageEvent[] = [];
  let totalMs = 0;
  for (const interval of intervals) {
    totalMs += interval.end - interval.start;
    events.push({
      schema_version: 1,
      id: stableId('evt_fg', interval.app, interval.start),
      kind: 'app_foreground',
      at: iso(interval.start),
      tier: 'D',
      origin: 'os',
      content: 'metadata',
      app: interval.app,
    });
    events.push({
      schema_version: 1,
      id: stableId('evt_bg', interval.app, interval.start),
      kind: 'app_background',
      at: iso(interval.end),
      tier: 'D',
      origin: 'os',
      content: 'metadata',
      app: interval.app,
      duration_ms: interval.end - interval.start,
    });
  }

  return {
    events,
    dropped,
    stats: {
      rows: rows.length,
      intervals: intervals.length,
      totalMs,
      unclosed: dropped.filter((drop) => drop.reason === 'unclosed').length,
    },
    nextCursor: options.untilMs,
  };
}

/* --------------------------------------------------------------- collector -- */

/** What the collector needs from storage. `MirrorStore` satisfies this structurally. */
export type UsageStorePort = {
  getCursor(source: string): Promise<number | null>;
  setCursor(source: string, atMs: number): Promise<void>;
  appendEvents(events: readonly unknown[]): Promise<{ inserted: number; duplicate: number; rejected: { id: string; reason: string }[] }>;
};

/** What the collector needs from the native module. */
export type UsageSourcePort = {
  hasPermission(): Promise<boolean>;
  /** Throws with a code if the OS refuses the query. */
  queryEvents(sinceMs: number, untilMs: number): Promise<UsageRow[]>;
};

export type CollectOptions = {
  /** How far back the first collection reaches. */
  initialWindowMs?: number;
  /** Never ask the OS for more than this in one go. */
  maxWindowMs?: number;
  /** Re-read a little before the cursor; ids make the overlap harmless. */
  overlapMs?: number;
  now: number;
  ignorePackages?: readonly string[];
};

export type CollectResult =
  | { status: 'permission-required' }
  | { status: 'no-window'; cursor: number }
  | {
      status: 'collected';
      events: number;
      inserted: number;
      duplicate: number;
      rejected: { id: string; reason: string }[];
      dropped: UsageDrop[];
      from: number;
      to: number;
      cursor: number;
    };

const DAY_MS = 86_400_000;

/**
 * One collection pass: read the cursor, ask the OS for the window, turn rows into
 * events, write them, advance the cursor.
 *
 * The cursor advances only after a successful write, so a crash mid-write means
 * the same window is read again — and the deterministic ids make that a no-op
 * rather than a duplicate.
 */
export async function collectUsage(source: UsageSourcePort, store: UsageStorePort, options: CollectOptions): Promise<CollectResult> {
  if (!(await source.hasPermission())) return { status: 'permission-required' };

  const initialWindowMs = options.initialWindowMs ?? DAY_MS;
  const maxWindowMs = options.maxWindowMs ?? 2 * DAY_MS;
  const overlapMs = options.overlapMs ?? 2_000;

  const stored = await store.getCursor('usage_stats');
  const from = stored === null ? options.now - initialWindowMs : Math.max(0, stored - overlapMs);
  const to = Math.min(options.now, from + maxWindowMs);
  if (to <= from) return { status: 'no-window', cursor: from };

  const rows = await source.queryEvents(from, to);
  const built = buildUsageEvents(rows, { sinceMs: from, untilMs: to, ignorePackages: options.ignorePackages });
  const appended = await store.appendEvents(built.events);
  await store.setCursor('usage_stats', built.nextCursor);

  return {
    status: 'collected',
    events: built.events.length,
    inserted: appended.inserted,
    duplicate: appended.duplicate,
    rejected: appended.rejected,
    dropped: built.dropped,
    from,
    to,
    cursor: built.nextCursor,
  };
}
