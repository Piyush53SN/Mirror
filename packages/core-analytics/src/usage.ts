/**
 * Android usage rows → Mirror events.
 *
 * The native module does one thing: ask `UsageStatsManager` for raw
 * `UsageEvents` and hand back rows. Everything that decides what those rows
 * *mean* lives here, as pure functions with tests — because this is where a
 * collector bug would silently inflate a person's screen time.
 *
 * **The sync boundary.** A sitting can start before one collection and end after
 * it. Dropping the un-closed foreground at the end of a window and then treating
 * its background as an orphan in the next window would lose the sitting twice.
 * So the builder takes the intervals that were still open at the end of the last
 * run, completes them with the rows it now sees, and returns the ones that are
 * still open for the *next* run to carry. The cursor therefore stores a state, not
 * a timestamp.
 *
 * **Gaps are counted.** An interval Mirror cannot measure is never silently
 * discarded: it becomes a `DataGap` with a reason and, where the span is known,
 * a duration. A day with a 6-hour gap must not read as a day with 20 minutes of
 * use — P2's scoring consumes these counts.
 *
 * Other rules:
 *   - an interval needs a close; an open interval older than `maxIntervalMs` is
 *     abandoned and counted, never extended to "now";
 *   - intervals longer than `maxIntervalMs` (6 h) are counted as gaps rather than
 *     trusted: a phone reporting a 14-hour YouTube session has a broken stream;
 *   - ids are deterministic from (package, start), so re-collecting an overlapping
 *     window is idempotent and an interrupted collection is safe to retry.
 */

/** `UsageEvents.Event` type codes. Android has used two sets; accept both. */
export const USAGE_EVENT_TYPE = {
  MOVE_TO_FOREGROUND: 1,
  MOVE_TO_BACKGROUND: 2,
  END_OF_DAY: 3,
  CONTINUE_PREVIOUS_DAY: 4,
  CONFIGURATION_CHANGE: 5,
  SYSTEM_INTERACTION: 6,
  USER_INTERACTION: 7,
  SHORTCUT_INVOCATION: 8,
  CHOOSER_ACTION: 9,
  NOTIFICATION_SEEN: 10,
  STANDBY_BUCKET_CHANGED: 11,
  NOTIFICATION_INTERRUPTION: 12,
  SLICE_PINNED_PRIV: 13,
  SLICE_PINNED: 14,
  SCREEN_INTERACTIVE: 15,
  SCREEN_NON_INTERACTIVE: 16,
  KEYGUARD_SHOWN: 17,
  KEYGUARD_HIDDEN: 18,
  FOREGROUND_SERVICE_START: 19,
  FOREGROUND_SERVICE_STOP: 20,
  CONTINUATION_MASK: 21,
  ROLLOVER_FOREGROUND: 22,
  ACTIVITY_RESUMED: 23,
  ACTIVITY_PAUSED: 24,
  ACTIVITY_STOPPED: 25,
  DEVICE_SHUTDOWN: 26,
  DEVICE_STARTUP: 27,
  USER_UNLOCKED: 28,
} as const;

const FOREGROUND_TYPES = new Set<number>([USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, USAGE_EVENT_TYPE.ACTIVITY_RESUMED]);
const BACKGROUND_TYPES = new Set<number>([
  USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND,
  USAGE_EVENT_TYPE.ACTIVITY_PAUSED,
  USAGE_EVENT_TYPE.ACTIVITY_STOPPED,
]);
// Screen-off, keyguard shown and shutdown implicitly end any foreground interval.
// Without this, a phone that goes to sleep while an app is in front leaves that
// interval open, producing the 8h53m Google app and 3h9m permission-controller
// sittings seen on Xiaomi.
const IMPLICIT_BACKGROUND_TYPES = new Set<number>([
  USAGE_EVENT_TYPE.SCREEN_NON_INTERACTIVE,
  USAGE_EVENT_TYPE.KEYGUARD_SHOWN,
  USAGE_EVENT_TYPE.DEVICE_SHUTDOWN,
]);

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

/** An interval seen but not yet closed. Carried in the cursor between runs. */
export type OpenInterval = { app: string; startMs: number };

export type UsageDropReason =
  | 'invalid_package'
  | 'ignored_package'
  | 'outside_window'
  | 'unknown_type'
  | 'orphan_background'
  | 'too_long'
  | 'below_minimum';

export type UsageDrop = { reason: UsageDropReason; app?: string; at?: number };

/** A counted gap. `count` is how many intervals/rows it represents. */
export type UsageGap = {
  reason: 'too_long' | 'abandoned_open' | 'orphan_background' | 'invalid_package';
  count: number;
  fromMs?: number;
  toMs?: number;
};

export type BuildUsageOptions = {
  /** Window actually queried [sinceMs, untilMs). */
  sinceMs: number;
  untilMs: number;
  /** Intervals carried from the previous run, not yet closed. */
  openIntervals?: readonly OpenInterval[];
  /** Packages that are never meaningful: Mirror itself, launchers, system UI. */
  ignorePackages?: readonly string[];
  /** Intervals longer than this are treated as an OS glitch, not as use. */
  maxIntervalMs?: number;
  /** Intervals shorter than this are not a sitting. Default 0. */
  minIntervalMs?: number;
};

export type BuildUsageResult = {
  events: UsageEvent[];
  /** Row-level reasons, for diagnostics. Aggregated counts live in `gaps`. */
  dropped: UsageDrop[];
  /** Aggregated, countable gaps. Nothing disappears without a number here. */
  gaps: UsageGap[];
  /** Still open at the end of this window; persist and pass to the next run. */
  nextOpen: OpenInterval[];
  stats: { rows: number; intervals: number; totalMs: number; carriedIn: number; carriedOut: number };
  /** Where the next collection should start. Idempotent ids make overlap safe. */
  nextCursor: number;
};

// Package name validation: Android packages are typically dot-separated, but
// some system events report single-segment names like "android". Allow both,
// but still require basic sanity (letters, digits, underscore, dot). Hyphens
// and empty strings are invalid and become counted gaps.
const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/i;
export const DEFAULT_MAX_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Packages that are never counted as usage, but their foreground events *do*
// close the previous app (see buildUsageEvents). This resolves the HOME role:
// when user goes to launcher, previous app ends. Includes resolver, installer,
// permission controller, systemui, and all OEM launchers.
export const DEFAULT_IGNORED_PACKAGES = [
  'dev.mirror.app',
  'com.android.systemui',
  'com.android.launcher',
  'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
  // OEM launchers — MIUI (Xiaomi) was producing 8h+ sessions when left as foreground
  'com.miui.home',
  'com.miui.securitycenter',
  'com.miui.securityadd',
  'com.sec.android.app.launcher',
  'com.huawei.android.launcher',
  'com.oppo.launcher',
  'com.vivo.launcher',
  'com.transsion.XOSLauncher',
  'com.lge.launcher2',
  'com.google.android.apps.nexuslauncher',
  // System components that appear as foreground during dialogs, install, resolver
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
  'com.android.intentresolver',
  'com.google.android.intentresolver',
  'com.android.settings',
  'com.miui.securitycenter',
] as const;

// Resolver / installer / permission controller / systemui that should close
// previous app but never be counted. Includes DEFAULT_IGNORED_PACKAGES plus
// generic resolver names.
export const SYSTEM_CLOSER_PACKAGES = new Set<string>([
  ...DEFAULT_IGNORED_PACKAGES,
  'android',
  'com.android.systemui',
  'com.android.launcher',
  'com.android.launcher3',
  'com.google.android.packageinstaller',
  'com.android.packageinstaller',
  'com.android.intentresolver',
  'com.google.android.intentresolver',
  'com.google.android.permissioncontroller',
]);

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

/** Merge gap rows of the same reason into one countable line. */
function addGap(gaps: UsageGap[], gap: UsageGap): void {
  const existing = gaps.find((entry) => entry.reason === gap.reason && entry.fromMs === gap.fromMs && entry.toMs === gap.toMs);
  if (existing) existing.count += gap.count;
  else gaps.push({ ...gap });
}

function closeInterval(
  app: string,
  start: number,
  end: number,
  options: { sinceMs: number; maxIntervalMs: number; minIntervalMs: number },
  intervals: { app: string; start: number; end: number; carried: boolean }[],
  drops: UsageDrop[],
  gaps: UsageGap[],
): void {
  const duration = end - start;
  if (duration > options.maxIntervalMs) {
    drops.push({ reason: 'too_long', app, at: start });
    addGap(gaps, { reason: 'too_long', count: 1, fromMs: start, toMs: end });
    return;
  }
  if (duration <= 0 || duration < options.minIntervalMs) {
    drops.push({ reason: 'below_minimum', app, at: start });
    return;
  }
  intervals.push({ app, start, end, carried: start < options.sinceMs });
}

export function buildUsageEvents(rows: readonly UsageRow[], options: BuildUsageOptions): BuildUsageResult {
  const ignore = new Set([...(options.ignorePackages ?? DEFAULT_IGNORED_PACKAGES)]);
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
  const minIntervalMs = options.minIntervalMs ?? 0;
  const drops: UsageDrop[] = [];
  const gaps: UsageGap[] = [];

  const ordered = [...rows].sort((a, b) => a.timeStamp - b.timeStamp);
  const open = new Map<string, number>();
  const carriedIn = options.openIntervals ?? [];
  for (const interval of carriedIn) {
    if (!open.has(interval.app)) open.set(interval.app, interval.startMs);
  }

  const intervals: { app: string; start: number; end: number; carried: boolean }[] = [];

  for (const row of ordered) {
    // Implicit backgrounds (screen-off, keyguard, shutdown) close *all* open
    // intervals. They must be handled before the ignore-package check because
    // the event itself may come from systemui which is ignored, but its effect
    // is global: the user is no longer looking at any app.
    if (IMPLICIT_BACKGROUND_TYPES.has(row.eventType)) {
      if (row.timeStamp < options.sinceMs || row.timeStamp >= options.untilMs) {
        drops.push({ reason: 'outside_window', app: row.packageName, at: row.timeStamp });
        continue;
      }
      for (const [app, start] of open) {
        closeInterval(app, start, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs }, intervals, drops, gaps);
      }
      open.clear();
      continue;
    }

    if (!PACKAGE.test(row.packageName)) {
      // Invalid package names are often empty or single-char artifacts from
      // UsageEvents (e.g. empty string, or "android" before we allowed it).
      // Count them as gaps but don't let them pollute intervals.
      drops.push({ reason: 'invalid_package', app: row.packageName, at: row.timeStamp });
      addGap(gaps, { reason: 'invalid_package', count: 1 });
      continue;
    }

    if (row.timeStamp < options.sinceMs || row.timeStamp >= options.untilMs) {
      drops.push({ reason: 'outside_window', app: row.packageName, at: row.timeStamp });
      continue;
    }

    // Ignored packages (launchers, systemui, resolver, installer, permission
    // controller) are never counted, but their foreground events DO close the
    // previous app. This fixes the 39m vs 12m WhatsApp bug: previously going
    // home left WhatsApp open.
    if (ignore.has(row.packageName)) {
      if (FOREGROUND_TYPES.has(row.eventType)) {
        // Treat as implicit background for all open apps
        for (const [app, start] of open) {
          closeInterval(app, start, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs }, intervals, drops, gaps);
        }
        open.clear();
      }
      drops.push({ reason: 'ignored_package', app: row.packageName, at: row.timeStamp });
      continue;
    }

    if (!FOREGROUND_TYPES.has(row.eventType) && !BACKGROUND_TYPES.has(row.eventType)) {
      drops.push({ reason: 'unknown_type', app: row.packageName, at: row.timeStamp });
      continue;
    }

    if (FOREGROUND_TYPES.has(row.eventType)) {
      // Enforce single foreground app: a new foreground closes any other open
      // interval at this timestamp. This prevents overlapping sessions like
      // YouTube, Genshin and Brawl Stars all ending at 3:17:44-45.
      // Keep earlier start for same app (missed close), but close others.
      for (const [otherApp, otherStart] of [...open.entries()]) {
        if (otherApp !== row.packageName) {
          closeInterval(otherApp, otherStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs }, intervals, drops, gaps);
          open.delete(otherApp);
        }
      }
      if (!open.has(row.packageName)) open.set(row.packageName, row.timeStamp);
      continue;
    }

    // Background
    const start = open.get(row.packageName);
    if (start === undefined) {
      drops.push({ reason: 'orphan_background', app: row.packageName, at: row.timeStamp });
      addGap(gaps, { reason: 'orphan_background', count: 1 });
      continue;
    }
    open.delete(row.packageName);
    closeInterval(row.packageName, start, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs }, intervals, drops, gaps);
  }

  // Anything still open becomes the next run's responsibility, unless it is so
  // old that it cannot be a sitting any more: then it is an abandoned gap.
  const nextOpen: OpenInterval[] = [];
  for (const [app, start] of open) {
    if (options.untilMs - start > maxIntervalMs) {
      addGap(gaps, { reason: 'abandoned_open', count: 1, fromMs: start });
      drops.push({ reason: 'too_long', app, at: start });
      continue;
    }
    nextOpen.push({ app, startMs: start });
  }
  nextOpen.sort((a, b) => a.startMs - b.startMs || a.app.localeCompare(b.app));

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
    dropped: drops,
    gaps,
    nextOpen,
    stats: {
      rows: rows.length,
      intervals: intervals.length,
      totalMs,
      carriedIn: carriedIn.length,
      carriedOut: nextOpen.length,
    },
    nextCursor: options.untilMs,
  };
}

/* --------------------------------------------------------------- collector -- */

/** What the collector needs from storage. `MirrorStore` satisfies this structurally. */
export type UsageStorePort = {
  getCursorState(source: string): Promise<{ at: number | null; open: { app: string; startMs: number }[] }>;
  setCursorState(source: string, state: { at: number | null; open: { app: string; startMs: number }[] }): Promise<void>;
  appendEvents(events: readonly unknown[]): Promise<{ inserted: number; duplicate: number; rejected: { id: string; reason: string }[] }>;
  recordGaps?(source: string, gaps: { reason: string; count: number; fromMs?: number; toMs?: number }[], atMs?: number): Promise<void>;
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
  maxIntervalMs?: number;
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
      /** Row-level reasons, for diagnostics. Aggregated counts live in `gaps`. */
  dropped: UsageDrop[];
      gaps: UsageGap[];
      carriedIn: number;
      carriedOut: number;
      from: number;
      to: number;
      cursor: number;
    };

const DAY_MS = 86_400_000;

/**
 * One collection pass: read the cursor state, ask the OS for the window, turn rows
 * into events, write them, record gaps, persist the new state.
 *
 * `openIntervals` are intervals from the previous run that had no close yet. They
 * are completed by this run's rows; whatever is still open is carried forward, so
 * a session that straddles two syncs is written once, whole.
 *
 * The state is written only after a successful append, so a crash re-reads the
 * same window — and the deterministic ids make that a no-op rather than a
 * duplicate.
 */
export async function collectUsage(source: UsageSourcePort, store: UsageStorePort, options: CollectOptions): Promise<CollectResult> {
  if (!(await source.hasPermission())) return { status: 'permission-required' };

  const initialWindowMs = options.initialWindowMs ?? DAY_MS;
  const maxWindowMs = options.maxWindowMs ?? 2 * DAY_MS;
  const overlapMs = options.overlapMs ?? 2_000;
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;

  const state = await store.getCursorState('usage_stats');
  const from = state.at === null ? options.now - initialWindowMs : Math.max(0, state.at - overlapMs);
  const to = Math.min(options.now, from + maxWindowMs);
  if (to <= from) return { status: 'no-window', cursor: from };

  const rows = await source.queryEvents(from, to);
  const built = buildUsageEvents(rows, {
    sinceMs: from,
    untilMs: to,
    openIntervals: state.open,
    ignorePackages: options.ignorePackages,
    maxIntervalMs,
  });

  const appended = await store.appendEvents(built.events);
  await store.recordGaps?.('usage_stats', built.gaps, options.now);
  await store.setCursorState('usage_stats', { at: built.nextCursor, open: built.nextOpen });

  return {
    status: 'collected',
    events: built.events.length,
    inserted: appended.inserted,
    duplicate: appended.duplicate,
    rejected: appended.rejected,
    dropped: built.dropped,
    gaps: built.gaps,
    carriedIn: built.stats.carriedIn,
    carriedOut: built.stats.carriedOut,
    from,
    to,
    cursor: built.nextCursor,
  };
}
