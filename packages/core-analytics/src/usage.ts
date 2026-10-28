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

/** `UsageEvents.Event` type codes. Verified against Android SDK and AOSP.
 * Source: https://developer.android.com/reference/android/app/usage/UsageEvents.Event
 * and https://android.googlesource.com/platform/frameworks/base/+/main/core/java/android/app/usage/UsageEvents.java
 *
 * MOVE_TO_FOREGROUND (1) and MOVE_TO_BACKGROUND (2) are deprecated in API 29,
 * replaced by ACTIVITY_RESUMED (1) and ACTIVITY_PAUSED (2) – same numeric values.
 * ACTIVITY_STOPPED = 23, ACTIVITY_DESTROYED = 24 (hide), FLUSH_TO_DISK = 25 (hide),
 * DEVICE_SHUTDOWN = 26, DEVICE_STARTUP = 27.
 */
import type { OsTotal } from './validate';

export const USAGE_EVENT_TYPE = {
  NONE: 0,
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
  CONTINUING_FOREGROUND_SERVICE: 21,
  ROLLOVER_FOREGROUND_SERVICE: 22,
  ACTIVITY_RESUMED: 1, // same as MOVE_TO_FOREGROUND, verified: constant value 1
  ACTIVITY_PAUSED: 2, // same as MOVE_TO_BACKGROUND, verified: constant value 2
  ACTIVITY_STOPPED: 23, // verified: constant value 23 (0x17)
  ACTIVITY_DESTROYED: 24, // hide, value 24
  FLUSH_TO_DISK: 25, // hide, value 25 – flush UsageStatsDatabase to disk, should close all
  DEVICE_SHUTDOWN: 26, // verified: 26
  DEVICE_STARTUP: 27, // verified: 27
} as const;

const FOREGROUND_TYPES = new Set<number>([USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, USAGE_EVENT_TYPE.ACTIVITY_RESUMED]);
const PAUSE_TYPES = new Set<number>([USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, USAGE_EVENT_TYPE.ACTIVITY_PAUSED]);
const STOP_TYPES = new Set<number>([USAGE_EVENT_TYPE.ACTIVITY_STOPPED]);
const BACKGROUND_TYPES = new Set<number>([...PAUSE_TYPES, ...STOP_TYPES]);
// Destroyed removes a class but does not by itself close the app unless it was last activity
const DESTROY_TYPES = new Set<number>([USAGE_EVENT_TYPE.ACTIVITY_DESTROYED]);
// Screen-off, keyguard and shutdown implicitly end any foreground interval.
// FLUSH_TO_DISK (25) removed from implicit: it appears in logs at arbitrary times, not only true session ends.
// Keep only true user-away signals.
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

/** An interval seen but not yet closed. Carried in the cursor between runs.
 * Now persists per-class open map so splitting a raw stream into two syncs
 * gives same totals as one sync (property test).
 */
export type OpenInterval = {
  app: string;
  startMs: number; // earliest start among activities
  activities?: { className: string; startMs: number }[]; // per-class resumed activities
};

export type UsageDropReason =
  | 'invalid_package'
  | 'ignored_package'
  | 'outside_window'
  | 'unknown_type'
  | 'orphan_background'
  | 'too_long'
  | 'below_minimum';

export type UsageDrop = {
  reason: UsageDropReason;
  app?: string;
  at?: number;
  eventType?: number;
  className?: string;
};

const EVENT_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: 'NONE',
  1: 'ACTIVITY_RESUMED',
  2: 'ACTIVITY_PAUSED',
  3: 'END_OF_DAY',
  4: 'CONTINUE_PREVIOUS_DAY',
  5: 'CONFIGURATION_CHANGE',
  6: 'SYSTEM_INTERACTION',
  7: 'USER_INTERACTION',
  8: 'SHORTCUT_INVOCATION',
  9: 'CHOOSER_ACTION',
  10: 'NOTIFICATION_SEEN',
  11: 'STANDBY_BUCKET_CHANGED',
  12: 'NOTIFICATION_INTERRUPTION',
  13: 'SLICE_PINNED_PRIV',
  14: 'SLICE_PINNED',
  15: 'SCREEN_INTERACTIVE',
  16: 'SCREEN_NON_INTERACTIVE',
  17: 'KEYGUARD_SHOWN',
  18: 'KEYGUARD_HIDDEN',
  19: 'FOREGROUND_SERVICE_START',
  20: 'FOREGROUND_SERVICE_STOP',
  21: 'CONTINUING_FOREGROUND_SERVICE',
  22: 'ROLLOVER_FOREGROUND_SERVICE',
  23: 'ACTIVITY_STOPPED',
  24: 'ACTIVITY_DESTROYED',
  25: 'FLUSH_TO_DISK',
  26: 'DEVICE_SHUTDOWN',
  27: 'DEVICE_STARTUP',
};

export function usageEventTypeName(eventType?: number): string {
  if (eventType === undefined || !Number.isFinite(eventType)) return 'UNKNOWN';
  return EVENT_TYPE_NAMES[eventType] ?? `TYPE_${eventType}`;
}

export type OrphanEventTypeRow = {
  eventType: number;
  typeName: string;
  count: number;
};

export type OrphanAppRow = {
  app: string;
  label: string;
  count: number;
  byType: string;
};

export type OrphanNewestRow = {
  app: string;
  label: string;
  eventType: number;
  typeName: string;
  at: number;
};

export type OrphanDiagnosticSummary = {
  total: number;
  byEventType: OrphanEventTypeRow[];
  byApp: OrphanAppRow[];
  newest: OrphanNewestRow[];
};

/**
 * Summarise `orphan_background` drops by Android `UsageEvents.Event` type code,
 * by app, and newest-first so device diagnostics show exactly where unmatched
 * close events come from.
 */
export function summarizeOrphanDrops(
  dropped: readonly UsageDrop[],
  labels: Readonly<Record<string, string>> = {},
  limit = 6,
): OrphanDiagnosticSummary {
  const orphans = dropped.filter((d) => d.reason === 'orphan_background');
  const typeCounts = new Map<number, number>();
  const appStats = new Map<string, { count: number; types: Map<number, number> }>();

  for (const d of orphans) {
    const et = d.eventType ?? -1;
    typeCounts.set(et, (typeCounts.get(et) ?? 0) + 1);
    const app = d.app ?? '<unknown>';
    let entry = appStats.get(app);
    if (!entry) {
      entry = { count: 0, types: new Map() };
      appStats.set(app, entry);
    }
    entry.count += 1;
    entry.types.set(et, (entry.types.get(et) ?? 0) + 1);
  }

  const byEventType: OrphanEventTypeRow[] = [...typeCounts.entries()]
    .map(([eventType, count]) => ({
      eventType,
      typeName: eventType >= 0 ? `${eventType}:${usageEventTypeName(eventType)}` : 'unknown',
      count,
    }))
    .sort((a, b) => b.count - a.count || a.eventType - b.eventType);

  const byApp: OrphanAppRow[] = [...appStats.entries()]
    .map(([app, st]) => ({
      app,
      label: labels[app] ?? app,
      count: st.count,
      byType: [...st.types.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([et, c]) => `${et >= 0 ? `${et}:${usageEventTypeName(et)}` : 'unknown'}×${c}`)
        .join(', '),
    }))
    .sort((a, b) => b.count - a.count || a.app.localeCompare(b.app))
    .slice(0, Math.max(1, limit));

  const newest: OrphanNewestRow[] = [...orphans]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, Math.max(1, limit))
    .map((d) => {
      const app = d.app ?? '<unknown>';
      const et = d.eventType ?? -1;
      return {
        app,
        label: labels[app] ?? app,
        eventType: et,
        typeName: et >= 0 ? `${et}:${usageEventTypeName(et)}` : 'unknown',
        at: d.at ?? 0,
      };
    });

  return {
    total: orphans.length,
    byEventType,
    byApp,
    newest,
  };
}

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
  /** Only count row/interval gaps strictly at/after this timestamp (prevents re-counting overlap gaps across syncs). */
  gapFloorMs?: number;
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
// when user goes to launcher, previous app ends.
// Previously we hard-coded OEM launchers (MIUI, POCO, Samsung, Huawei, etc) which missed
// com.mi.android.globallauncher (POCO Launcher 10h4m bug). Now launchers are resolved
// dynamically via PackageManager CATEGORY_HOME intent (needs <queries> for HOME) and passed
// as ignorePackages from native module. This list is minimal fallback for system components
// that should always close previous app but never be counted, plus Mirror itself (excluded from totals).
export const DEFAULT_IGNORED_PACKAGES = [
  'dev.mirror.app', // Mirror itself – excluded from totals (task 4)
  'com.android.systemui',
  // System components that appear as foreground during dialogs, install, resolver, Play Store
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
  'com.miui.packageinstaller',
  'com.miui.global.packageinstaller',
  'com.samsung.android.packageinstaller',
  'com.coloros.packageinstaller',
  'com.oplus.packageinstaller',
  'com.oplus.appdetail',
  'com.vivo.packageinstaller',
  'com.android.intentresolver',
  'com.google.android.intentresolver',
  'com.android.settings',
  'com.android.vending', // Play Store – exclude from totals and switching pressure (user request)
  'com.google.android.gms', // Play Services – often appears as fg during permission dialogs
  'com.google.android.gsf', // Play Services Framework
  'android', // generic system package that sometimes appears
] as const;

const DEFAULT_IGNORED_SET = new Set<string>(DEFAULT_IGNORED_PACKAGES);

/**
 * True when a package is Mirror itself, Android/OEM system UI, Play Store/Services,
 * Settings, or any Android/OEM Package Installer (by package pattern or resolved label).
 */
export function isIgnoredSystemApp(packageName: string, label?: string): boolean {
  if (!packageName) return true;
  if (DEFAULT_IGNORED_SET.has(packageName)) return true;
  if (/(^|\.)packageinstaller(\.|$)/i.test(packageName)) return true;
  if (typeof label === 'string' && /^package\s*installer$/i.test(label.trim())) return true;
  return false;
}

/**
 * Utility & launcher packages skipped from manual intent labeling and from
 * J11 same-app short-return cluster detection (dialer, camera, clock, calculator,
 * contacts, SMS, documents/downloads, launchers), in addition to `DEFAULT_IGNORED_PACKAGES`.
 */
export const LABELING_EXCLUDED_PACKAGES = [
  ...DEFAULT_IGNORED_PACKAGES,
  'com.android.dialer',
  'com.google.android.dialer',
  'com.android.camera',
  'com.google.android.camera',
  'com.android.camera2',
  'com.android.contacts',
  'com.google.android.contacts',
  'com.android.mms',
  'com.google.android.apps.messaging',
  'com.android.calendar',
  'com.google.android.calendar',
  'com.android.deskclock',
  'com.google.android.deskclock',
  'com.android.calculator2',
  'com.google.android.calculator',
  'com.android.documentsui',
  'com.google.android.documentsui',
  'com.android.providers.downloads',
  'com.android.providers.downloads.ui',
  'com.android.keyguard',
  'com.android.launcher',
  'com.android.launcher3',
  'com.mi.android.globallauncher',
  'com.sec.android.app.launcher',
] as const;

const LABELING_EXCLUDED_SET = new Set<string>(LABELING_EXCLUDED_PACKAGES);

export function isLabelingExcludedApp(packageName: string, label?: string): boolean {
  if (isIgnoredSystemApp(packageName, label)) return true;
  return LABELING_EXCLUDED_SET.has(packageName);
}

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

/**
 * Top 10 distinct invalid_package strings for debugging.
 * The device report had 89 invalid_package gaps – we need to know which strings.
 */
export function getTopInvalidPackages(dropped: readonly UsageDrop[]): { pkg: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of dropped) {
    if (d.reason === 'invalid_package') {
      const key = d.app ?? '<empty>';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([pkg, count]) => ({ pkg, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function closeInterval(
  app: string,
  start: number,
  end: number,
  options: { sinceMs: number; maxIntervalMs: number; minIntervalMs: number; gapFloorMs?: number },
  intervals: { app: string; start: number; end: number; carried: boolean }[],
  drops: UsageDrop[],
  gaps: UsageGap[],
): void {
  const duration = end - start;
  if (duration > options.maxIntervalMs) {
    drops.push({ reason: 'too_long', app, at: start });
    if (options.gapFloorMs === undefined || end > options.gapFloorMs) {
      addGap(gaps, { reason: 'too_long', count: 1, fromMs: start, toMs: end });
    }
    return;
  }
  if (duration <= 0 || duration < options.minIntervalMs) {
    drops.push({ reason: 'below_minimum', app, at: start });
    return;
  }
  intervals.push({ app, start, end, carried: start < options.sinceMs });
}

type OpenEntry = {
  earliestStart: number;
  activities: Map<string, number>; // className -> startMs
};

export function buildUsageEvents(rows: readonly UsageRow[], options: BuildUsageOptions): BuildUsageResult {
  // Merge hard-coded ignored (Mirror itself, systemui etc) with dynamic launchers resolved via HOME role.
  // Previously we used only hard-coded list which missed POCO Launcher com.mi.android.globallauncher (10h4m bug).
  // Now launcher detection is dynamic via PackageManager CATEGORY_HOME (needs <queries> for HOME).
  // For totals, we now use OS aggregate (queryUsageStats) which matches Digital Wellbeing by construction.
  // For session timeline (raw events), we keep per-activity tracking but:
  // - Only launchers (HOME role) and Mirror itself close previous app on fg (user went home or opened Mirror)
  // - SystemUI, settings, permissioncontroller etc are ignored WITHOUT closing previous (notification shade should not end game session)
  // This fixes Honkai 31s vs OS 52m48s where systemui fg at 31s prematurely closed Honkai.
  const launcherSet = new Set<string>(options.ignorePackages ?? []);
  const systemIgnore = new Set<string>(DEFAULT_IGNORED_PACKAGES);
  const ignore = new Set<string>([...systemIgnore, ...launcherSet]);
  const maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
  const minIntervalMs = options.minIntervalMs ?? 0;
  const drops: UsageDrop[] = [];
  const gaps: UsageGap[] = [];

  const ordered = [...rows].sort((a, b) => a.timeStamp - b.timeStamp);
  const open = new Map<string, OpenEntry>();
  const carriedIn = options.openIntervals ?? [];
  for (const interval of carriedIn) {
    if (!open.has(interval.app)) {
      if (interval.activities && interval.activities.length > 0) {
        // Persisted per-class map
        const actMap = new Map<string, number>();
        let earliest = interval.startMs;
        for (const a of interval.activities) {
          actMap.set(a.className, a.startMs);
          if (a.startMs < earliest) earliest = a.startMs;
        }
        open.set(interval.app, {
          earliestStart: earliest,
          activities: actMap,
        });
      } else {
        // Legacy carried intervals have no className; use __carried__ placeholder
        open.set(interval.app, {
          earliestStart: interval.startMs,
          activities: new Map([['__carried__', interval.startMs]]),
        });
      }
    }
  }

  const intervals: { app: string; start: number; end: number; carried: boolean }[] = [];
  // Track recently closed apps to suppress duplicate bg within honest 60s window
  // (never loosened beyond 60s), PLUS Android Activity lifecycle state:
  //   1. `closedInStream`: packages whose foreground sitting already opened and
  //      closed in this stream (cleared on next RESUMED). A subsequent
  //      `ACTIVITY_STOPPED (23)` without an intervening `RESUMED` is Android's
  //      normal `PAUSED -> STOPPED` transition (e.g. Recents cache / PiP >60s
  //      after `onPause`), never a missed foreground sitting; whereas an
  //      `ACTIVITY_PAUSED (2)` >60s after close still honestly counts as
  //      `orphan_background`.
  //   2. `orphanPausedAt`: when an unmatched `ACTIVITY_PAUSED (2)` fires for a
  //      never-opened package, Android emits `ACTIVITY_STOPPED (23)` ~300ms
  //      later for that same close; record the pause so one missed sitting
  //      counts as 1 orphan rather than 2.
  const recentlyClosed = new Map<string, number>();
  const closedInStream = new Set<string>();
  const orphanPausedAt = new Map<string, number>();
  const RECENT_CLOSE_SUPPRESS_MS = 60_000;

  for (const row of ordered) {
    // Implicit backgrounds (screen-off, keyguard, shutdown) close *all* open
    // intervals. They must be handled before the ignore-package check because
    // the event itself may come from systemui which is ignored, but its effect
    // is global: the user is no longer looking at any app.
    if (IMPLICIT_BACKGROUND_TYPES.has(row.eventType)) {
      if (row.timeStamp < options.sinceMs || row.timeStamp >= options.untilMs) {
        drops.push({ reason: 'outside_window', app: row.packageName, at: row.timeStamp, eventType: row.eventType });
        continue;
      }
      for (const [app, entry] of open) {
        closeInterval(app, entry.earliestStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs, gapFloorMs: options.gapFloorMs }, intervals, drops, gaps);
        recentlyClosed.set(app, row.timeStamp);
        closedInStream.add(app);
      }
      open.clear();
      continue;
    }

    if (!PACKAGE.test(row.packageName)) {
      drops.push({ reason: 'invalid_package', app: row.packageName, at: row.timeStamp, eventType: row.eventType });
      if (options.gapFloorMs === undefined || row.timeStamp >= options.gapFloorMs) {
        addGap(gaps, { reason: 'invalid_package', count: 1 });
      }
      continue;
    }

    if (row.timeStamp < options.sinceMs || row.timeStamp >= options.untilMs) {
      drops.push({ reason: 'outside_window', app: row.packageName, at: row.timeStamp, eventType: row.eventType });
      continue;
    }

    // Ignored packages handling:
    // - Launchers (HOME role, dynamic) and Mirror itself close previous app on fg (user went home)
    // - SystemUI, settings, permissioncontroller, OEM packageinstaller, etc are ignored WITHOUT closing previous (fixes Honkai 31s vs 52m)
    if (ignore.has(row.packageName) || isIgnoredSystemApp(row.packageName)) {
      const isLauncher = launcherSet.has(row.packageName);
      const isMirror = row.packageName === 'dev.mirror.app';
      if ((isLauncher || isMirror) && FOREGROUND_TYPES.has(row.eventType)) {
        for (const [app, entry] of open) {
          closeInterval(app, entry.earliestStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs, gapFloorMs: options.gapFloorMs }, intervals, drops, gaps);
          recentlyClosed.set(app, row.timeStamp);
          closedInStream.add(app);
        }
        open.clear();
      }
      drops.push({ reason: 'ignored_package', app: row.packageName, at: row.timeStamp, eventType: row.eventType });
      continue;
    }

    // Android UsageStatsService writes END_OF_DAY (3) at bucket rollover and
    // CONTINUE_PREVIOUS_DAY (4) at the start of the next bucket when an app is
    // still in the foreground. If we already saw the real ACTIVITY_RESUMED (1)
    // earlier in this stream, keep that true start timestamp untouched; if the
    // real ACTIVITY_RESUMED predates `sinceMs` (or rolled off the OS buffer),
    // CONTINUE_PREVIOUS_DAY opens the interval at bucket start instead of
    // turning the subsequent ACTIVITY_PAUSED into an orphan_background.
    if (row.eventType === USAGE_EVENT_TYPE.END_OF_DAY) {
      continue;
    }
    if (row.eventType === USAGE_EVENT_TYPE.CONTINUE_PREVIOUS_DAY) {
      if (open.has(row.packageName)) {
        continue;
      }
      const contClass = row.className && row.className.length > 0 ? row.className : '__carried__';
      for (const [otherApp, otherEntry] of [...open.entries()]) {
        if (otherApp !== row.packageName) {
          closeInterval(otherApp, otherEntry.earliestStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs, gapFloorMs: options.gapFloorMs }, intervals, drops, gaps);
          recentlyClosed.set(otherApp, row.timeStamp);
          closedInStream.add(otherApp);
          open.delete(otherApp);
        }
      }
      closedInStream.delete(row.packageName);
      orphanPausedAt.delete(row.packageName);
      open.set(row.packageName, {
        earliestStart: row.timeStamp,
        activities: new Map([[contClass, row.timeStamp]]),
      });
      continue;
    }

    if (!FOREGROUND_TYPES.has(row.eventType) && !BACKGROUND_TYPES.has(row.eventType) && !DESTROY_TYPES.has(row.eventType)) {
      drops.push({ reason: 'unknown_type', app: row.packageName, at: row.timeStamp, eventType: row.eventType });
      continue;
    }

    // ACTIVITY_DESTROYED (24) removes a class when an app is still open, but on
    // Android `onDestroy()` routinely fires minutes or hours after an activity
    // already closed at `onPause`/`onStop` when cached background processes are
    // reclaimed. An `ACTIVITY_DESTROYED` for an already-closed package is normal
    // OS cleanup, never a missed foreground sitting (`orphan_background`).
    if (DESTROY_TYPES.has(row.eventType)) {
      const className = row.className && row.className.length > 0 ? row.className : '__default__';
      const entry = open.get(row.packageName);
      if (!entry) {
        drops.push({ reason: 'below_minimum', app: row.packageName, at: row.timeStamp, eventType: row.eventType, className: row.className });
        continue;
      }
      entry.activities.delete(className);
      if (entry.activities.size === 0) {
        closeInterval(row.packageName, entry.earliestStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs, gapFloorMs: options.gapFloorMs }, intervals, drops, gaps);
        recentlyClosed.set(row.packageName, row.timeStamp);
        closedInStream.add(row.packageName);
        open.delete(row.packageName);
      }
      continue;
    }

    const className = row.className && row.className.length > 0 ? row.className : '__default__';

    if (FOREGROUND_TYPES.has(row.eventType)) {
      // Enforce single foreground app: a new foreground closes any other open
      // interval at this timestamp. This prevents overlapping sessions like
      // YouTube, Genshin and Brawl Stars all ending at 3:17:44-45.
      for (const [otherApp, otherEntry] of [...open.entries()]) {
        if (otherApp !== row.packageName) {
          closeInterval(otherApp, otherEntry.earliestStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs, gapFloorMs: options.gapFloorMs }, intervals, drops, gaps);
          recentlyClosed.set(otherApp, row.timeStamp);
          closedInStream.add(otherApp);
          open.delete(otherApp);
        }
      }

      closedInStream.delete(row.packageName);
      orphanPausedAt.delete(row.packageName);

      let entry = open.get(row.packageName);
      if (!entry) {
        entry = { earliestStart: row.timeStamp, activities: new Map() };
        open.set(row.packageName, entry);
      }
      // Track resumed activities per package (className)
      if (!entry.activities.has(className)) {
        entry.activities.set(className, row.timeStamp);
        if (row.timeStamp < entry.earliestStart) entry.earliestStart = row.timeStamp;
      }
      continue;
    }

    // Background: PAUSED (2) and STOPPED (23)
    // Close an app only when its last resumed activity pauses/stops.
    // STOPPED (23) for an already-paused activity must NEVER close a different
    // currently-resumed activity of the same app (e.g. Splash -> Main or Home -> Chat).
    const entry = open.get(row.packageName);
    if (!entry) {
      const recentClose = recentlyClosed.get(row.packageName);
      if (recentClose !== undefined && row.timeStamp - recentClose <= RECENT_CLOSE_SUPPRESS_MS) {
        drops.push({ reason: 'below_minimum', app: row.packageName, at: row.timeStamp, eventType: row.eventType, className: row.className });
        continue;
      }
      if (STOP_TYPES.has(row.eventType)) {
        // Delayed `onStop (23)` for an already-closed sitting (`RESUMED -> PAUSED -> ... -> STOPPED`)
        // or companion `STOPPED (23)` within 60s of an already-counted orphan `PAUSED (2)`
        const priorOrphanPause = orphanPausedAt.get(row.packageName);
        if (
          closedInStream.has(row.packageName) ||
          (priorOrphanPause !== undefined && row.timeStamp - priorOrphanPause <= RECENT_CLOSE_SUPPRESS_MS)
        ) {
          drops.push({ reason: 'below_minimum', app: row.packageName, at: row.timeStamp, eventType: row.eventType, className: row.className });
          continue;
        }
      }
      if (PAUSE_TYPES.has(row.eventType)) {
        orphanPausedAt.set(row.packageName, row.timeStamp);
      }
      drops.push({ reason: 'orphan_background', app: row.packageName, at: row.timeStamp, eventType: row.eventType, className: row.className });
      if (options.gapFloorMs === undefined || row.timeStamp >= options.gapFloorMs) {
        addGap(gaps, { reason: 'orphan_background', count: 1 });
      }
      continue;
    }

    // Remove this activity. Carried intervals have __carried__ placeholder
    // which should be closed by any background for that app.
    let deleted = entry.activities.delete(className);
    if (!deleted) {
      deleted = entry.activities.delete('__default__');
    }
    if (!deleted) {
      deleted = entry.activities.delete('__carried__');
    }
    if (!deleted && entry.activities.size > 0) {
      // Only apply the `firstKey` class-mismatch fallback on `ACTIVITY_PAUSED (2)`
      // (or when `ACTIVITY_STOPPED (23)` carries no className). When `ACTIVITY_STOPPED (23)`
      // names a specific Activity `A` while Activity `B` is currently resumed in `entry.activities`,
      // `A` is simply finishing its `PAUSED -> STOPPED` transition after in-app navigation `A -> B`;
      // deleting `B` here prematurely killed multi-activity sessions and caused +2 false orphans later.
      if (PAUSE_TYPES.has(row.eventType) || className === '__default__') {
        const firstKey = entry.activities.keys().next().value;
        if (firstKey) {
          entry.activities.delete(firstKey);
          deleted = true;
        }
      }
    }

    if (entry.activities.size === 0) {
      // Last activity closed, close interval
      closeInterval(row.packageName, entry.earliestStart, row.timeStamp, { sinceMs: options.sinceMs, maxIntervalMs, minIntervalMs, gapFloorMs: options.gapFloorMs }, intervals, drops, gaps);
      recentlyClosed.set(row.packageName, row.timeStamp);
      closedInStream.add(row.packageName);
      open.delete(row.packageName);
    } else {
      // Still has other resumed activities, keep earliestStart unchanged
    }
  }

  // Anything still open becomes the next run's responsibility, unless it is so
  // old that it cannot be a sitting any more: then it is an abandoned gap.
  // Persist open intervals in checkpoint; cap still-open at last event, not sync time.
  // The last event timestamp is the max timeStamp in ordered rows, or sinceMs if no rows.
  // Persist per-class open map so split syncs give same totals.
  const lastEventMs = ordered.length > 0 ? ordered[ordered.length - 1]!.timeStamp : options.sinceMs;
  const nextOpen: OpenInterval[] = [];
  for (const [app, entry] of open) {
    const start = entry.earliestStart;
    // Cap check uses lastEventMs, not untilMs, so an interval open at sync time
    // is not artificially extended to sync time; it's capped at last event.
    if (lastEventMs - start > maxIntervalMs) {
      addGap(gaps, { reason: 'abandoned_open', count: 1, fromMs: start });
      drops.push({ reason: 'too_long', app, at: start });
      continue;
    }
    // Also check untilMs for abandonment as fallback (if no events for long time)
    if (options.untilMs - start > maxIntervalMs) {
      addGap(gaps, { reason: 'abandoned_open', count: 1, fromMs: start });
      drops.push({ reason: 'too_long', app, at: start });
      continue;
    }
    nextOpen.push({
      app,
      startMs: start,
      activities: [...entry.activities.entries()].map(([className, s]) => ({ className, startMs: s })),
    });
  }
  nextOpen.sort((a, b) => a.startMs - b.startMs || a.app.localeCompare(b.app));

  // Merge consecutive intervals of the same app when gap <= 2s
  // This handles OS emitting fg/bg/fg quickly for same app (e.g. activity rotation)
  intervals.sort((a, b) => a.start - b.start || a.app.localeCompare(b.app));
  const MERGE_GAP_MS = 2000;
  const merged: typeof intervals = [];
  for (const cur of intervals) {
    const last = merged[merged.length - 1];
    if (last && last.app === cur.app && cur.start - last.end <= MERGE_GAP_MS) {
      // Merge: extend last.end to cur.end, keep earliest start and carried flag if either carried
      last.end = Math.max(last.end, cur.end);
      last.carried = last.carried || cur.carried;
    } else {
      merged.push({ ...cur });
    }
  }
  // Replace intervals with merged
  intervals.length = 0;
  intervals.push(...merged);
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
  getCursorState(source: string): Promise<{
    at: number | null;
    open: { app: string; startMs: number; activities?: { className: string; startMs: number }[] }[];
  }>;
  setCursorState(
    source: string,
    state: { at: number | null; open: { app: string; startMs: number; activities?: { className: string; startMs: number }[] }[] },
  ): Promise<void>;
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
  // P2 fix: increase overlap from 2s to 60s to reduce orphans 319 where fg outside window bg inside
  // Round 13: increase to 5min (300s) after real device still showed 319 orphans – fg can be outside window by minutes on first sync or after gap
  // Round 16: increase to 1h (3600s) after real device still shows 64 orphans – device offline 8h, second run from = cursor - overlap, so fg 30min before cursor missed with 5min overlap, recovered with 1h
  // Why 1h does NOT pair unrelated: idempotent ids (evt_fg_ hash) make re-read duplicate not new interval, single-foreground closes previous at new fg (so A 0-10, B 20-30, A 70-80 stays 3 intervals not 1 long A 0-80), max 6h cap drops implausible, merge gap only 2s not 1h
  // Cost is reading 1h more rows per sync (negligible vs 1-day window). Gate honest: keep RECENT_CLOSE 60s not 120s, use real raw capture to drive 64-><50, not loosening matching just to pass gate
  const overlapMs = options.overlapMs ?? 3_600_000;
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
    gapFloorMs: state.at ?? undefined,
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

/* ------------------------------------------- local-day foreground totals -- */

export type UsageStatsBucketRow = {
  packageName: string;
  totalTimeInForeground: number;
  firstTimeStamp?: number;
  lastTimeStamp?: number;
  lastTimeUsed?: number;
};

export type DayForegroundTotalsOptions = {
  /** Local-day window `[fromMs, toMs)`, typically `[00:00:00 local, 24:00:00 local)`. */
  window: { fromMs: number; toMs: number };
  /** Current clock ms so partial today windows clip cleanly at `min(toMs, nowMs)`. */
  nowMs?: number;
  /** Lookback before `window.fromMs` so overnight intervals starting yesterday pair cleanly (default 6 h). */
  lookbackMs?: number;
  /** Dynamic launcher packages (HOME role) and any extra ignored packages. */
  ignorePackages?: readonly string[];
  /** Optional resolved labels so OEM `"Package installer"` labels are excluded too. */
  appLabels?: Readonly<Record<string, string>>;
  /** Maximum plausible single foreground interval (default 6 h). */
  maxIntervalMs?: number;
};

/**
 * Sum exact local-day active foreground durations from stored/built `app_background`
 * events by clipping every `[endMs - duration_ms, endMs]` strictly to
 * `[window.fromMs, min(window.toMs, nowMs)]`.
 */
export function computeDayForegroundTotalsFromStoredEvents(
  events: readonly Pick<UsageEvent, 'kind' | 'app' | 'at' | 'duration_ms'>[],
  options: Omit<DayForegroundTotalsOptions, 'lookbackMs' | 'maxIntervalMs'>,
): OsTotal[] {
  const { window } = options;
  const effectiveEndMs =
    options.nowMs !== undefined ? Math.min(window.toMs, options.nowMs) : window.toMs;
  if (
    !Number.isFinite(window.fromMs) ||
    !Number.isFinite(effectiveEndMs) ||
    effectiveEndMs <= window.fromMs
  ) {
    return [];
  }
  const launcherSet = new Set<string>(options.ignorePackages ?? []);
  const appLabels = options.appLabels ?? {};
  const byPkg = new Map<string, number>();

  for (const ev of events) {
    if (!ev || ev.kind !== 'app_background') continue;
    const dur = ev.duration_ms ?? 0;
    if (!Number.isFinite(dur) || dur <= 0) continue;
    if (launcherSet.has(ev.app) || isIgnoredSystemApp(ev.app, appLabels[ev.app])) continue;
    const endMs = Date.parse(ev.at);
    if (!Number.isFinite(endMs)) continue;
    const startMs = endMs - dur;
    const clippedStart = Math.max(startMs, window.fromMs);
    const clippedEnd = Math.min(endMs, effectiveEndMs);
    if (clippedEnd > clippedStart) {
      byPkg.set(ev.app, (byPkg.get(ev.app) ?? 0) + (clippedEnd - clippedStart));
    }
  }

  return [...byPkg.entries()]
    .filter(([, totalMs]) => totalMs > 0)
    .map(([packageName, totalMs]) => ({ packageName, totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs || a.packageName.localeCompare(b.packageName));
}

/**
 * Compute Digital-Wellbeing-equivalent per-app foreground screen time for a local
 * calendar day `[window.fromMs, min(window.toMs, nowMs)]` directly from raw
 * `UsageEvents`.
 *
 * Why `UsageStatsManager.queryUsageStats(INTERVAL_DAILY, dayFrom, dayTo)` inflates
 * totals on Android (e.g. ChatGPT 1h 18m in `INTERVAL_DAILY` vs 47m in Digital
 * Wellbeing on `2026-10-28` in `Asia/Calcutta` UTC+05:30):
 *   1. Android's `INTERVAL_DAILY` `IntervalStats` buckets roll on ~24h boundaries
 *      (`00:00 UTC` = `05:30 IST` or prior rollover epoch), NOT `00:00:00` local,
 *      and `queryUsageStats` expands the range to every overlapping daily bucket
 *      (`lastTimeStamp > dayFrom`) without clipping `totalTimeInForeground` at
 *      local midnight — leaking yesterday's evening/pre-midnight usage into today.
 *   2. Pairing raw `UsageEvents` with a 6h pre-midnight lookback and clipping each
 *      closed foreground interval strictly to `[dayFrom, min(dayTo, nowMs)]`
 *      eliminates pre-midnight bucket bleed and splits overnight intervals cleanly
 *      at `00:00:00` local, matching Digital Wellbeing.
 */
export function computeDayForegroundTotals(
  rows: readonly UsageRow[],
  options: DayForegroundTotalsOptions,
): OsTotal[] {
  const { window } = options;
  const effectiveEndMs =
    options.nowMs !== undefined ? Math.min(window.toMs, options.nowMs) : window.toMs;
  if (
    !Number.isFinite(window.fromMs) ||
    !Number.isFinite(effectiveEndMs) ||
    effectiveEndMs <= window.fromMs
  ) {
    return [];
  }
  const lookaroundMs = Math.max(0, options.lookbackMs ?? DEFAULT_MAX_INTERVAL_MS);
  const queryUntilMs =
    options.nowMs !== undefined
      ? Math.min(window.toMs + lookaroundMs, options.nowMs)
      : window.toMs + lookaroundMs;
  const built = buildUsageEvents(rows, {
    sinceMs: window.fromMs - lookaroundMs,
    untilMs: queryUntilMs,
    ignorePackages: options.ignorePackages,
    maxIntervalMs: options.maxIntervalMs,
  });
  return computeDayForegroundTotalsFromStoredEvents(built.events, {
    window,
    nowMs: options.nowMs,
    ignorePackages: options.ignorePackages,
    appLabels: options.appLabels,
  });
}

/**
 * Sanitize `UsageStatsManager.queryUsageStats(INTERVAL_DAILY, ...)` rows when used
 * as a pre-install fallback (>7 days ago after Android prunes raw `UsageEvents`):
 * rejects buckets whose midpoint belongs to an adjacent local day (such as
 * yesterday's `[Oct 27 05:30 IST, Oct 28 05:30 IST)` bucket) and merges multiple
 * intra-day buckets per `packageName`.
 */
export function filterUsageStatsBucketsForDay(
  buckets: readonly UsageStatsBucketRow[],
  options: {
    window: { fromMs: number; toMs: number };
    ignorePackages?: readonly string[];
    appLabels?: Readonly<Record<string, string>>;
  },
): OsTotal[] {
  const { window } = options;
  if (!Number.isFinite(window.fromMs) || !Number.isFinite(window.toMs) || window.toMs <= window.fromMs) {
    return [];
  }
  const launcherSet = new Set<string>(options.ignorePackages ?? []);
  const appLabels = options.appLabels ?? {};
  const byPkg = new Map<string, number>();

  for (const b of buckets) {
    if (!b || !b.packageName) continue;
    const fgMs = b.totalTimeInForeground;
    if (!Number.isFinite(fgMs) || fgMs <= 0) continue;
    if (launcherSet.has(b.packageName) || isIgnoredSystemApp(b.packageName, appLabels[b.packageName])) {
      continue;
    }
    const first = b.firstTimeStamp;
    const last = b.lastTimeStamp;
    if (
      typeof first === 'number' &&
      typeof last === 'number' &&
      Number.isFinite(first) &&
      Number.isFinite(last) &&
      last > first
    ) {
      if (last <= window.fromMs || first >= window.toMs) continue;
      const midpoint = (first + last) / 2;
      if (midpoint < window.fromMs || midpoint >= window.toMs) continue;
    }
    byPkg.set(b.packageName, (byPkg.get(b.packageName) ?? 0) + fgMs);
  }

  return [...byPkg.entries()]
    .filter(([, totalMs]) => totalMs > 0)
    .map(([packageName, totalMs]) => ({ packageName, totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs || a.packageName.localeCompare(b.packageName));
}

