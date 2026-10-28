/**
 * packages/core-analytics/tests/usage.test.mjs
 *
 * The collector's decision layer. Every case here is a way a real Android event
 * stream can be wrong — a missed close, a duplicated resume, a clock jump, a
 * 14-hour "session" — and what Mirror does with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core.mjs') });
const {
  buildUsageEvents,
  collectUsage,
  computeDayForegroundTotals,
  computeDayForegroundTotalsFromStoredEvents,
  filterUsageStatsBucketsForDay,
  resolveDayForegroundTotals,
  summarizeUsageStatsBucketsForDay,
  validateDailyTotals,
  sessionize,
  buildCanonicalDaySittings,
  sumSittingSpanMs,
  summarizeOrphanDrops,
  USAGE_EVENT_TYPE,
  DEFAULT_IGNORED_PACKAGES,
} = core;

const T0 = Date.parse('2026-10-16T09:00:00Z');
const at = (minutes) => T0 + minutes * 60_000;
const fg = (pkg, minutes) => ({ packageName: pkg, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(minutes) });
const bg = (pkg, minutes) => ({ packageName: pkg, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(minutes) });
const base = { sinceMs: T0, untilMs: T0 + 3_600_000 };

/* ----------------------------------------------------------------- basics -- */

test('empty input: no events, no invented duration', () => {
  const result = buildUsageEvents([], base);
  assert.deepEqual(result.events, []);
  assert.equal(result.stats.intervals, 0);
  assert.equal(result.stats.totalMs, 0);
  assert.equal(result.nextCursor, base.untilMs);
});

test('a foreground/background pair becomes two events and one interval', () => {
  const result = buildUsageEvents([fg('com.google.android.youtube', 0), bg('com.google.android.youtube', 12)], base);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].kind, 'app_foreground');
  assert.equal(result.events[1].kind, 'app_background');
  assert.equal(result.events[1].duration_ms, 12 * 60_000);
  assert.equal(result.stats.totalMs, 12 * 60_000);
  assert.equal(result.events[0].tier, 'D');
  assert.equal(result.events[0].origin, 'os');
});

test('both Android event-type families are understood', () => {
  const legacy = buildUsageEvents(
    [
      { packageName: 'com.a.b', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(0) },
      { packageName: 'com.a.b', eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(1) },
    ],
    base,
  );
  assert.equal(legacy.events.length, 2);
});

/* ------------------------------------------------------------------ edges -- */

test('a single event is not a session: it is carried, not written', () => {
  const result = buildUsageEvents([fg('com.a.b', 0)], base);
  assert.equal(result.events.length, 0, 'half a session is never written');
  assert.equal(result.nextOpen.length, 1);
  assert.equal(result.nextOpen[0].app, 'com.a.b');
  assert.equal(result.nextOpen[0].startMs, at(0));
  // per-class map persisted
  assert.ok(Array.isArray(result.nextOpen[0].activities), 'should have activities');
  assert.equal(result.stats.carriedOut, 1);
  assert.equal(result.dropped.length, 0, 'carrying is not dropping');
});

test('a background with no foreground is an orphan, and is counted as a gap', () => {
  const result = buildUsageEvents([bg('com.a.b', 5)], base);
  assert.equal(result.events.length, 0);
  assert.equal(result.dropped[0].reason, 'orphan_background');
  assert.deepEqual(result.gaps, [{ reason: 'orphan_background', count: 1 }]);
});

test('a zero-length interval is dropped with a reason', () => {
  const result = buildUsageEvents([fg('com.a.b', 0), bg('com.a.b', 0)], base);
  assert.equal(result.events.length, 0);
  assert.equal(result.dropped[0].reason, 'below_minimum');
});

test('all sessions under 8 seconds are still recorded: the filter is opt-in', () => {
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    rows.push(fg('com.a.b', i), bg('com.a.b', i + 0.05)); // 3 s each
  }
  const kept = buildUsageEvents(rows, base);
  assert.equal(kept.events.length, 8);
  assert.equal(kept.stats.intervals, 4);
  const filtered = buildUsageEvents(rows, { ...base, minIntervalMs: 8_000 });
  assert.equal(filtered.events.length, 0);
  assert.ok(filtered.dropped.every((drop) => drop.reason === 'below_minimum'));
});

test('an implausible interval is dropped AND counted as a gap with its span', () => {
  const wide = { sinceMs: T0, untilMs: T0 + 20 * 3_600_000 };
  const result = buildUsageEvents([fg('com.a.b', 0), bg('com.a.b', 14 * 60)], wide);
  assert.equal(result.events.length, 0);
  assert.equal(result.dropped[0].reason, 'too_long');
  assert.deepEqual(result.gaps, [{ reason: 'too_long', count: 1, fromMs: at(0), toMs: at(14 * 60) }]);
});

test('a duplicated foreground keeps the earlier start', () => {
  const result = buildUsageEvents([fg('com.a.b', 0), fg('com.a.b', 1), bg('com.a.b', 2)], base);
  assert.equal(result.stats.intervals, 1);
  assert.equal(result.events[1].duration_ms, 2 * 60_000);
});

test('interleaved apps: new foreground closes previous (single foreground, no overlap)', () => {
  // Previously this test allowed overlapping sittings (a 0-2, b 1-3) which caused
  // YouTube/Genshin/Brawl all ending at 3:17:44. Now single foreground is enforced:
  // b fg at 1 closes a at 1, so a is 0-1, b is 1-3.
  const result = buildUsageEvents(
    [fg('com.a.one', 0), fg('com.b.two', 1), bg('com.a.one', 2), bg('com.b.two', 3)],
    base,
  );
  assert.deepEqual(result.events.filter((e) => e.kind === 'app_foreground').map((e) => e.app), ['com.a.one', 'com.b.two']);
  // a 0-1, b 1-3 = 1 + 2 = 3 minutes total, not 4, and no overlap
  assert.equal(result.stats.totalMs, 3 * 60_000);
  // Ensure no overlap: b starts when a ends
  const fgEvents = result.events.filter((e) => e.kind === 'app_foreground').sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const bgEvents = result.events.filter((e) => e.kind === 'app_background').sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // a should have been closed by b fg, so its bg is at 1, not 2
  const aBg = bgEvents.find((e) => e.app === 'com.a.one');
  assert.equal(Date.parse(aBg.at) - Date.parse(fgEvents[0].at), 1 * 60_000);
});

test('system UI, launchers and Mirror itself are ignored, and produce no gaps', () => {
  const result = buildUsageEvents([fg(DEFAULT_IGNORED_PACKAGES[0], 0), bg(DEFAULT_IGNORED_PACKAGES[0], 1)], base);
  assert.equal(result.events.length, 0);
  assert.ok(result.dropped.every((drop) => drop.reason === 'ignored_package'));
  assert.deepEqual(result.gaps, [], 'ignoring a launcher is not a data gap');
});

test('rows outside the requested window and malformed packages are refused', () => {
  const result = buildUsageEvents(
    [
      { packageName: 'not a package', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(0) },
      { packageName: 'com.a.b', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(-60) },
      { packageName: 'com.a.b', eventType: 7, timeStamp: at(1) },
    ],
    base,
  );
  assert.deepEqual(result.dropped.map((d) => d.reason).sort(), ['invalid_package', 'outside_window', 'unknown_type']);
});

/* -------------------------------------------------------------- idempotency -- */

test('ids are deterministic for the same interval and independent of input order', () => {
  const forward = buildUsageEvents([fg('com.a.b', 0), bg('com.a.b', 10)], base);
  const reversed = buildUsageEvents([bg('com.a.b', 10), fg('com.a.b', 0)], base);
  assert.deepEqual(forward.events.map((e) => e.id), reversed.events.map((e) => e.id));
  assert.notEqual(forward.events[0].id, forward.events[1].id);
  assert.match(forward.events[0].id, /^evt_fg_/);
});

/* --------------------------------------------------------------- property --- */

const arbRows = fc
  .array(
    fc.record({
      packageName: fc.constantFrom('com.a.one', 'com.b.two', 'com.c.three', 'dev.mirror.app'),
      minute: fc.integer({ min: -5, max: 70 }),
      kind: fc.constantFrom('fg', 'bg'),
    }),
    { maxLength: 40 },
  )
  .map((rows) =>
    rows.map((row) => ({
      packageName: row.packageName,
      eventType: row.kind === 'fg' ? USAGE_EVENT_TYPE.ACTIVITY_RESUMED : USAGE_EVENT_TYPE.ACTIVITY_PAUSED,
      timeStamp: at(row.minute),
    })),
  );

test('property: every emitted duration is positive and bounded', () => {
  fc.assert(
    fc.property(arbRows, (rows) => {
      const { events } = buildUsageEvents(rows, base);
      for (const event of events) {
        if (event.kind === 'app_background') {
          if (!(event.duration_ms > 0 && event.duration_ms <= 6 * 60 * 60 * 1000)) return false;
        }
      }
      return true;
    }),
    { numRuns: 200 },
  );
});

test('property: emitted pairs are correct and total time is finite', () => {
  fc.assert(
    fc.property(arbRows, (rows) => {
      const { events, stats } = buildUsageEvents(rows, base);
      if (events.length % 2 !== 0) return false;
      for (let i = 0; i < events.length; i += 2) {
        if (events[i].kind !== 'app_foreground' || events[i + 1].kind !== 'app_background') return false;
        if (events[i].app !== events[i + 1].app) return false;
        if (Date.parse(events[i].at) > Date.parse(events[i + 1].at)) return false;
      }
      const sum = events.filter((e) => e.kind === 'app_background').reduce((total, e) => total + e.duration_ms, 0);
      return sum === stats.totalMs && Number.isFinite(stats.totalMs);
    }),
    { numRuns: 200 },
  );
});

test('property: adding a duplicate row never changes the result', () => {
  fc.assert(
    fc.property(arbRows, (rows) => {
      if (rows.length === 0) return true;
      const once = buildUsageEvents(rows, base);
      const twice = buildUsageEvents([...rows, ...rows], base);
      return twice.events.length === once.events.length && twice.stats.totalMs === once.stats.totalMs;
    }),
    { numRuns: 100 },
  );
});

/* -------------------------------------------------------------- collector --- */

const fakeSource = (permission, rows, log = []) => ({
  hasPermission: async () => permission,
  queryEvents: async (from, to) => {
    log.push({ from, to });
    return rows.filter((row) => row.timeStamp >= from && row.timeStamp < to);
  },
});

function fakeStore(initial = { at: null, open: [] }) {
  const state = { cursor: { ...initial, open: [...initial.open] }, events: [], gaps: [], calls: 0 };
  return {
    state,
    getCursorState: async () => ({ at: state.cursor.at, open: state.cursor.open.map((entry) => ({ ...entry })) }),
    setCursorState: async (_source, next) => {
      state.cursor = { at: next.at, open: next.open.map((entry) => ({ ...entry })) };
    },
    recordGaps: async (_source, gaps) => {
      state.gaps.push(...gaps);
    },
    appendEvents: async (events) => {
      state.calls += 1;
      const ids = new Set(state.events.map((event) => event.id));
      let inserted = 0;
      let duplicate = 0;
      for (const event of events) {
        if (ids.has(event.id)) duplicate += 1;
        else {
          ids.add(event.id);
          state.events.push(event);
          inserted += 1;
        }
      }
      return { inserted, duplicate, rejected: [] };
    },
  };
}

/* ------------------------------------------------- the sync boundary ---- */

test('a session straddling two syncs is written once, whole', async () => {
  const store = fakeStore();
  // Sync 1 at 23:59: sees a foreground but no close.
  const first = [
    { packageName: 'com.a.one', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(0) }, // 09:00
  ];
  const run1 = await collectUsage(fakeSource(true, first), store, { now: at(60) });
  assert.equal(run1.status, 'collected');
  assert.equal(run1.inserted, 0, 'a half session is not written');
  assert.equal(run1.carriedOut, 1);
  assert.equal(store.state.cursor.open.length, 1);
  assert.equal(store.state.cursor.open[0].app, 'com.a.one');
  assert.equal(store.state.cursor.open[0].startMs, at(0));

  // Sync 2 at 11:00: sees only the close, because the foreground is behind the cursor.
  const second = [{ packageName: 'com.a.one', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(120) }];
  const run2 = await collectUsage(fakeSource(true, second), store, { now: at(130) });
  assert.equal(run2.status, 'collected');
  assert.equal(run2.carriedIn, 1);
  assert.equal(run2.inserted, 2, 'the pair is written together in the second run');
  assert.equal(store.state.cursor.open.length, 0, 'nothing is left open');
  assert.deepEqual(store.state.events.map((e) => e.kind), ['app_foreground', 'app_background']);
  assert.equal(store.state.events[1].duration_ms, 120 * 60_000, 'the duration spans both windows');
  assert.equal(run2.dropped.length, 0, 'the close is not treated as an orphan');
});

test('a session straddling three syncs is still one session', async () => {
  const store = fakeStore();
  const fgRow = { packageName: 'com.a.one', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(0) };
  await collectUsage(fakeSource(true, [fgRow]), store, { now: at(30) });
  await collectUsage(fakeSource(true, []), store, { now: at(60) });
  assert.equal(store.state.cursor.open.length, 1);
  const run = await collectUsage(fakeSource(true, [{ packageName: 'com.a.one', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(90) }]), store, { now: at(100) });
  assert.equal(run.inserted, 2);
  assert.equal(store.state.events[1].duration_ms, 90 * 60_000);
});

test('an open interval older than the maximum is abandoned and counted, not carried forever', async () => {
  const store = fakeStore({ at: at(0), open: [{ app: 'com.a.one', startMs: at(-600) }] }); // 10 hours open
  const run = await collectUsage(fakeSource(true, []), store, { now: at(30) });
  assert.equal(run.status, 'collected');
  assert.equal(store.state.cursor.open.length, 0);
  assert.ok(run.gaps.some((gap) => gap.reason === 'abandoned_open'), JSON.stringify(run.gaps));
});

test('collector: no permission means no query at all', async () => {
  const log = [];
  const store = fakeStore();
  const result = await collectUsage(fakeSource(false, [], log), store, { now: at(60) });
  assert.deepEqual(result, { status: 'permission-required' });
  assert.equal(log.length, 0);
  assert.equal(store.state.cursor.at, null);
});

test('collector: first run reads one day, writes events and advances the cursor', async () => {
  const store = fakeStore();
  const rows = [fg('com.a.one', 0), bg('com.a.one', 5)];
  const result = await collectUsage(fakeSource(true, rows), store, { now: at(10) });
  assert.equal(result.status, 'collected');
  assert.equal(result.inserted, 2);
  assert.equal(store.state.cursor.at, at(10));
});

test('collector: a second run re-reads a small overlap and inserts nothing new', async () => {
  const store = fakeStore();
  const rows = [fg('com.a.one', 0), bg('com.a.one', 5)];
  await collectUsage(fakeSource(true, rows), store, { now: at(10) });
  const result = await collectUsage(fakeSource(true, rows), store, { now: at(20) });
  assert.equal(result.status, 'collected');
  assert.equal(result.inserted, 0);
  assert.equal(store.state.events.length, 2);
});

test('collector: gaps are recorded through the store port', async () => {
  const store = fakeStore();
  const rows = [fg('com.a.one', 0), bg('com.a.one', 14 * 60)];
  const result = await collectUsage(fakeSource(true, rows), store, { now: at(900), maxWindowMs: 24 * 3_600_000 });
  assert.equal(result.status, 'collected');
  assert.ok(store.state.gaps.length > 0);
  assert.equal(store.state.gaps[0].reason, 'too_long');
});

test('collector: the window is capped, and a stale cursor does not produce an empty window', async () => {
  const store = fakeStore({ at: 0, open: [] });
  const log = [];
  const result = await collectUsage(fakeSource(true, [], log), store, { now: at(60), maxWindowMs: 3_600_000 });
  assert.equal(result.status, 'collected');
  assert.equal(log[0].to - log[0].from, 3_600_000);
});

test('collector: a cursor in the future yields no-window rather than a negative query', async () => {
  const store = fakeStore({ at: at(600), open: [] });
  const result = await collectUsage(fakeSource(true, []), store, { now: at(60) });
  assert.equal(result.status, 'no-window');
  assert.equal(store.state.events.length, 0);
});

test('property: splitting raw stream into two syncs at any point gives same totals as one sync (per-class persisted)', () => {
  const arb = fc.array(
    fc.record({
      pkg: fc.constantFrom('com.a', 'com.b', 'com.whatsapp'),
      cls: fc.constantFrom('Main', 'Conversation', 'A', 'B', ''),
      type: fc.constantFrom(1, 2, 23, 24, 16, 17),
      minute: fc.integer({ min: 0, max: 120 }),
    }),
    { minLength: 5, maxLength: 40 },
  );

  fc.assert(
    fc.property(arb, fc.integer({ min: 1, max: 30 }), (raw, splitAt) => {
      const rows = raw
        .map((r) => ({
          packageName: r.pkg,
          className: r.cls ? `${r.pkg}.${r.cls}` : '',
          eventType: r.type,
          timeStamp: at(r.minute),
        }))
        .sort((a, b) => a.timeStamp - b.timeStamp);

      if (rows.length === 0) return true;
      const since = at(0) - 1000;
      const until = at(130);
      const baseOpts = { sinceMs: since, untilMs: until };

      const one = buildUsageEvents(rows, baseOpts);
      const totalsOne = new Map();
      for (const ev of one.events) {
        if (ev.kind === 'app_background' && ev.duration_ms) {
          totalsOne.set(ev.app, (totalsOne.get(ev.app) ?? 0) + ev.duration_ms);
        }
      }

      const idx = Math.min(Math.max(1, splitAt), rows.length - 1);
      const firstPart = rows.slice(0, idx);
      const secondPart = rows.slice(idx);
      const splitTime = rows[idx] ? rows[idx].timeStamp : at(65);

      // Use inclusive split: first window until = splitTime + 1 so row at splitTime is included in first if it belongs there
      // Second window since = splitTime, with overlap, so no loss. This matches collector's 2s overlap.
      const first = buildUsageEvents(firstPart, { sinceMs: since, untilMs: splitTime + 1 });
      const second = buildUsageEvents(secondPart, {
        sinceMs: splitTime,
        untilMs: until,
        openIntervals: first.nextOpen,
      });

      const totalsTwo = new Map();
      for (const ev of [...first.events, ...second.events]) {
        if (ev.kind === 'app_background' && ev.duration_ms) {
          totalsTwo.set(ev.app, (totalsTwo.get(ev.app) ?? 0) + ev.duration_ms);
        }
      }

      const apps = new Set([...totalsOne.keys(), ...totalsTwo.keys()]);
      for (const app of apps) {
        const t1 = totalsOne.get(app) ?? 0;
        const t2 = totalsTwo.get(app) ?? 0;
        // Allow 2s merging tolerance per interval (gap <=2s merged in one sync but not across split)
        // The property should hold within 2s per app if per-class map is persisted
        if (Math.abs(t1 - t2) > 2000) {
          return false;
        }
      }
      return true;
    }),
    { numRuns: 200 },
  );
});

test('merge consecutive intervals of same app when gap <=2s', () => {
  const rows = [
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(0) },
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(1) },
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(1) + 1500 }, // gap 1.5s
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(3) },
  ];
  const result = buildUsageEvents(rows, { sinceMs: at(0) - 1000, untilMs: at(10) });
  assert.equal(result.stats.intervals, 1, 'should merge gap <=2s into one interval');
  assert.equal(result.events.filter((e) => e.kind === 'app_background')[0].duration_ms, 3 * 60_000);
});

test('do not merge when gap >2s', () => {
  const rows = [
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(0) },
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(1) },
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(1) + 3000 }, // gap 3s
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(3) },
  ];
  const result = buildUsageEvents(rows, { sinceMs: at(0) - 1000, untilMs: at(10) });
  assert.equal(result.stats.intervals, 2, 'should not merge gap >2s');
});

test('ACTIVITY_DESTROYED (24) on an already-closed app >60s later does not inflate orphan_background, while unmatched STOPPED still counts honestly', () => {
  const rows = [
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(0) },
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(1) },
    // 5 minutes (> 60s) later, Android reclaims cached process and fires ACTIVITY_DESTROYED (24)
    { packageName: 'com.a', eventType: USAGE_EVENT_TYPE.ACTIVITY_DESTROYED, timeStamp: at(6) },
    // Unmatched ACTIVITY_STOPPED (23) for an app never seen in foreground STILL honestly counts as orphan_background
    { packageName: 'com.b', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: at(7) },
  ];
  const result = buildUsageEvents(rows, { sinceMs: at(0) - 1000, untilMs: at(10) });
  const orphans = result.gaps.find((g) => g.reason === 'orphan_background')?.count ?? 0;
  assert.equal(orphans, 1, 'only unmatched ACTIVITY_STOPPED counts as orphan_background; ACTIVITY_DESTROYED cleanup does not');
});

test('in-app Activity A -> Activity B transition: STOPPED(A) does not kill resumed B or create +2 false orphans when B closes >60s later', () => {
  // Reproduces real Android navigation: HomeActivity -> ConversationActivity
  // 1) HomeActivity RESUMED at 0s, PAUSED at 2s
  // 2) ConversationActivity RESUMED at 2.02s
  // 3) HomeActivity STOPPED (23) at 2.4s (finishing off-screen transition)
  // 4) User reads chat for 5 minutes (> 60s), then leaves ConversationActivity (PAUSED + STOPPED at 5m02s)
  const t0 = at(0);
  const rows = [
    { packageName: 'com.whatsapp', className: 'HomeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: t0 },
    { packageName: 'com.whatsapp', className: 'HomeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: t0 + 2_000 },
    { packageName: 'com.whatsapp', className: 'ConversationActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: t0 + 2_020 },
    { packageName: 'com.whatsapp', className: 'HomeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: t0 + 2_400 },
    { packageName: 'com.whatsapp', className: 'ConversationActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: t0 + 302_000 },
    { packageName: 'com.whatsapp', className: 'ConversationActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: t0 + 302_350 },
  ];
  const result = buildUsageEvents(rows, { sinceMs: t0 - 1_000, untilMs: t0 + 400_000 });
  const orphans = result.gaps.find((g) => g.reason === 'orphan_background')?.count ?? 0;
  assert.equal(orphans, 0, 'in-app navigation + normal close >60s later must produce 0 orphans');
  // Because the gap between 2.00s and 2.02s is <= 2s, both intervals merge into a single 302s sitting!
  assert.equal(result.stats.intervals, 1);
  assert.equal(result.stats.totalMs, 302_000);
});

test('delayed ACTIVITY_STOPPED (23) >60s after an already-closed sitting does not count as orphan, while unmatched PAUSED >60s still counts once and summarizeOrphanDrops breaks down by eventType & app', () => {
  const t0 = at(0);
  const rows = [
    // App 1 closes cleanly at t=1m, then Android moves cached task from PAUSED to STOPPED at t=4m (>60s)
    { packageName: 'com.instagram.android', className: 'MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: t0 },
    { packageName: 'com.instagram.android', className: 'MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: t0 + 60_000 },
    { packageName: 'com.instagram.android', className: 'MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: t0 + 240_000 },
    // App 2 was never seen opening in foreground; when it closes at t=5m, Android emits PAUSED (2) + STOPPED (23) 300ms apart
    { packageName: 'com.reddit.frontpage', className: 'MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: t0 + 300_000 },
    { packageName: 'com.reddit.frontpage', className: 'MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: t0 + 300_300 },
  ];
  const result = buildUsageEvents(rows, { sinceMs: t0 - 1_000, untilMs: t0 + 400_000 });
  const orphans = result.gaps.find((g) => g.reason === 'orphan_background')?.count ?? 0;
  assert.equal(orphans, 1, 'delayed STOPPED on closed Instagram = 0; unmatched PAUSED+STOPPED pair on Reddit = 1');

  const diag = summarizeOrphanDrops(result.dropped, { 'com.reddit.frontpage': 'Reddit' });
  assert.equal(diag.total, 1);
  assert.deepEqual(diag.byEventType, [{ eventType: 2, typeName: '2:ACTIVITY_PAUSED', count: 1 }]);
  assert.equal(diag.byApp[0].label, 'Reddit');
  assert.equal(diag.newest[0].typeName, '2:ACTIVITY_PAUSED');
});

/* ----------- Digital Wellbeing parity & long ChatGPT-style intervals ------- */

test('2026-10-28 IST (11:32) ChatGPT 47m vs INTERVAL_DAILY 1h 18m: eliminates +31m pre-midnight bucket bleed while Mi Doc Viewer, WhatsApp, X, and Discord match Digital Wellbeing within max(10%, 60s)', () => {
  // Local day 2026-10-28 in Asia/Calcutta (UTC+05:30):
  //   00:00 IST = 2026-10-27T18:30:00.000Z
  //   05:30 IST = 2026-10-28T00:00:00.000Z (Android UTC INTERVAL_DAILY rollover!)
  //   11:32 IST = 2026-10-28T06:02:00.000Z
  const dayStart = Date.parse('2026-10-27T18:30:00.000Z');
  const dayEnd = dayStart + 86_400_000;
  const rollover0530 = Date.parse('2026-10-28T00:00:00.000Z');
  const now1132 = Date.parse('2026-10-28T06:02:00.000Z');
  const MIN = 60_000;

  const CHATGPT = 'com.openai.chatgpt';
  const MI_DOC = 'cn.wps.moffice_eng.xiaomi.lite';
  const WHATSAPP = 'com.whatsapp';
  const X_APP = 'com.twitter.android';
  const DISCORD = 'com.discord';
  const LAUNCHER = 'com.mi.android.globallauncher';

  // Raw UsageEvents across [2026-10-27 evening .. 2026-10-28 11:32 IST]:
  // 1) Yesterday (2026-10-27 22:15–22:46 IST = 31m): ChatGPT used for 31m inside the
  //    [Oct 27 05:30 IST, Oct 28 05:30 IST) INTERVAL_DAILY bucket.
  // 2) Today (2026-10-28):
  //    - 00:20–01:07 IST (47m): long ChatGPT interval across MainActivity -> VoiceActivity -> MainActivity,
  //      with a transient SystemUI notification shade check + PermissionController mic dialog + delayed STOPPED (23).
  //    - Morning before 11:32 IST: Mi Doc Viewer (18m), WhatsApp (14m), X (11m), Discord (8m).
  const prevEveningStart = dayStart - 105 * MIN; // 22:15 IST on 2026-10-27
  const todayLateStart = dayStart + 20 * MIN; // 00:20 IST on 2026-10-28
  const morningBase = rollover0530 + 180 * MIN; // 08:30 IST on 2026-10-28

  const rawRows = [
    // Yesterday 31m ChatGPT session (must NOT bleed into 2026-10-28!)
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: prevEveningStart },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: prevEveningStart + 31 * MIN },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: prevEveningStart + 31 * MIN + 350 },

    // Today 47m long ChatGPT session (00:20 -> 01:07 IST) with multi-activity voice handoff & SystemUI shade
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: todayLateStart },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: todayLateStart + 15 * MIN },
    { packageName: CHATGPT, className: '.VoiceModeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: todayLateStart + 15 * MIN + 40 },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: todayLateStart + 15 * MIN + 420 },
    // Transient SystemUI notification shade at +25m (must NOT close ChatGPT)
    { packageName: 'com.android.systemui', className: '.ShadeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: todayLateStart + 25 * MIN },
    { packageName: 'com.android.systemui', className: '.ShadeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: todayLateStart + 25 * MIN + 5_000 },
    // Return from VoiceModeActivity -> MainActivity at +33m
    { packageName: CHATGPT, className: '.VoiceModeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: todayLateStart + 33 * MIN },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: todayLateStart + 33 * MIN + 30 },
    { packageName: CHATGPT, className: '.VoiceModeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: todayLateStart + 33 * MIN + 400 },
    { packageName: CHATGPT, className: '.VoiceModeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_DESTROYED, timeStamp: todayLateStart + 33 * MIN + 500 },
    // Exit to launcher at +47m
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: todayLateStart + 47 * MIN },
    { packageName: LAUNCHER, className: '.Launcher', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: todayLateStart + 47 * MIN + 20 },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: todayLateStart + 47 * MIN + 350 },

    // Morning apps (08:30–11:32 IST): Mi Doc Viewer 18m, WhatsApp 14m, X 11m, Discord 8m
    { packageName: MI_DOC, className: '.DocActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: morningBase },
    { packageName: MI_DOC, className: '.DocActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: morningBase + 18 * MIN },
    { packageName: WHATSAPP, className: '.HomeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: morningBase + 30 * MIN },
    { packageName: WHATSAPP, className: '.HomeActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: morningBase + 44 * MIN },
    { packageName: X_APP, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: morningBase + 60 * MIN },
    { packageName: X_APP, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: morningBase + 71 * MIN },
    { packageName: DISCORD, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: morningBase + 90 * MIN },
    { packageName: DISCORD, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: morningBase + 98 * MIN },
  ];

  // What Android's raw queryUsageStats(INTERVAL_DAILY, dayStart, dayEnd) returned:
  // Bucket 1 [Oct 27 05:30 IST, Oct 28 05:30 IST) overlaps dayStart (00:00 IST) and sums
  // yesterday's 31m + today's 47m = 78m (1h 18m) for ChatGPT; Bucket 2 [05:30, 11:32] has the 4 morning apps.
  const rawIntervalDailyBuckets = [
    {
      packageName: CHATGPT,
      totalTimeInForeground: (31 + 47) * MIN, // 1h 18m inflated!
      firstTimeStamp: rollover0530 - 86_400_000,
      lastTimeStamp: rollover0530,
    },
    { packageName: MI_DOC, totalTimeInForeground: 18 * MIN, firstTimeStamp: rollover0530, lastTimeStamp: now1132 },
    { packageName: WHATSAPP, totalTimeInForeground: 14 * MIN, firstTimeStamp: rollover0530, lastTimeStamp: now1132 },
    { packageName: X_APP, totalTimeInForeground: 11 * MIN, firstTimeStamp: rollover0530, lastTimeStamp: now1132 },
    { packageName: DISCORD, totalTimeInForeground: 8 * MIN, firstTimeStamp: rollover0530, lastTimeStamp: now1132 },
  ];

  // Digital Wellbeing ground truth for 2026-10-28 at 11:32 IST:
  const digitalWellbeingTotals = [
    { packageName: CHATGPT, totalMs: 47 * MIN },
    { packageName: MI_DOC, totalMs: 18 * MIN },
    { packageName: WHATSAPP, totalMs: 14 * MIN },
    { packageName: X_APP, totalMs: 11 * MIN },
    { packageName: DISCORD, totalMs: 8 * MIN },
  ];

  // Confirm the old raw INTERVAL_DAILY bucket failed max(10%, 60s) on ChatGPT (+66%, +31m)
  const brokenValidation = validateDailyTotals(
    rawIntervalDailyBuckets.map((b) => ({ app: b.packageName, totalMs: b.totalTimeInForeground })),
    digitalWellbeingTotals,
  );
  assert.equal(brokenValidation.ok, false);
  assert.equal(brokenValidation.overThreshold.length, 1);
  assert.equal(brokenValidation.overThreshold[0].app, CHATGPT);
  assert.equal(brokenValidation.overThreshold[0].diffMs, 31 * MIN);

  // Confirm Mirror's fixed day-clipped foreground totals match Digital Wellbeing within max(10%, 60s)
  const mirrorDayTotals = computeDayForegroundTotals(rawRows, {
    window: { fromMs: dayStart, toMs: dayEnd },
    nowMs: now1132,
    ignorePackages: [LAUNCHER],
  });
  const fixedValidation = validateDailyTotals(
    mirrorDayTotals.map((r) => ({ app: r.packageName, totalMs: r.totalMs })),
    digitalWellbeingTotals,
  );
  assert.equal(fixedValidation.ok, true, 'must match Digital Wellbeing within max(10%, 60s)');
  assert.equal(fixedValidation.overThreshold.length, 0);
  assert.equal(
    mirrorDayTotals.find((r) => r.packageName === CHATGPT)?.totalMs,
    47 * MIN,
    'ChatGPT must be 47m (never 1h 18m)',
  );
  assert.ok(fixedValidation.maxAbsMs < 1_000, `expected <1s diff, got ${fixedValidation.maxAbsMs}ms`);
});

test('overnight long ChatGPT interval straddling local midnight (23:29 -> 00:47 = 1h 18m, and 22:15 -> 00:47 = 2h 32m) clips strictly to 47m on today and 31m on yesterday', () => {
  const dayStart = Date.parse('2026-10-27T18:30:00.000Z'); // 2026-10-28 00:00 IST
  const prevDayStart = dayStart - 86_400_000;
  const dayEnd = dayStart + 86_400_000;
  const MIN = 60_000;
  const CHATGPT = 'com.openai.chatgpt';

  // Case A: 23:29 Oct 27 -> 00:47 Oct 28 (78m = 1h 18m continuous interval across midnight,
  // including Android's END_OF_DAY=3 and CONTINUE_PREVIOUS_DAY=4 markers)
  const rows78m = [
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: dayStart - 31 * MIN },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.END_OF_DAY, timeStamp: dayStart - 1 },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.CONTINUE_PREVIOUS_DAY, timeStamp: dayStart },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: dayStart + 47 * MIN },
  ];

  const todayTotals = computeDayForegroundTotals(rows78m, {
    window: { fromMs: dayStart, toMs: dayEnd },
  });
  const yesterdayTotals = computeDayForegroundTotals(rows78m, {
    window: { fromMs: prevDayStart, toMs: dayStart },
  });
  assert.equal(todayTotals.find((r) => r.packageName === CHATGPT)?.totalMs, 47 * MIN, 'today gets strictly post-midnight 47m');
  assert.equal(yesterdayTotals.find((r) => r.packageName === CHATGPT)?.totalMs, 31 * MIN, 'yesterday gets pre-midnight 31m');

  // Case B: >1h pre-midnight start (22:15 Oct 27 -> 00:47 Oct 28 = 2h 32m, inside 6h lookback)
  const rows152m = [
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: dayStart - 105 * MIN },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: dayStart + 47 * MIN },
  ];
  const todayFrom152m = computeDayForegroundTotals(rows152m, {
    window: { fromMs: dayStart, toMs: dayEnd },
  });
  assert.equal(todayFrom152m.find((r) => r.packageName === CHATGPT)?.totalMs, 47 * MIN);

  // Case C: ACTIVITY_RESUMED rolled off the OS buffer, leaving CONTINUE_PREVIOUS_DAY (4) at 00:00 -> PAUSED (2) at 00:47
  const rowsContOnly = [
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.CONTINUE_PREVIOUS_DAY, timeStamp: dayStart },
    { packageName: CHATGPT, className: '.MainActivity', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: dayStart + 47 * MIN },
  ];
  const builtCont = buildUsageEvents(rowsContOnly, { sinceMs: dayStart - 3_600_000, untilMs: dayEnd });
  assert.equal(builtCont.gaps.length, 0, 'CONTINUE_PREVIOUS_DAY prevents false orphan_background');
  const todayCont = computeDayForegroundTotalsFromStoredEvents(builtCont.events, {
    window: { fromMs: dayStart, toMs: dayEnd },
  });
  assert.equal(todayCont.find((r) => r.packageName === CHATGPT)?.totalMs, 47 * MIN);
});

test('compares active foreground total (47m) vs 15-min-merged sitting span (1h 9m) when switching between ChatGPT and Mi Doc Viewer/WhatsApp, and verifies filterUsageStatsBucketsForDay', () => {
  const dayStart = Date.parse('2026-10-27T18:30:00.000Z');
  const dayEnd = dayStart + 86_400_000;
  const rollover0530 = Date.parse('2026-10-28T00:00:00.000Z');
  const MIN = 60_000;
  const CHATGPT = 'com.openai.chatgpt';
  const MI_DOC = 'cn.wps.moffice_eng.xiaomi.lite';
  const WHATSAPP = 'com.whatsapp';

  const tBase = dayStart + 9 * 3_600_000; // 09:00 IST
  // ChatGPT 20m -> Mi Doc Viewer 12m (<=15m!) -> ChatGPT 17m -> WhatsApp 10m (<=15m!) -> ChatGPT 10m
  const rows = [
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: tBase },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: tBase + 20 * MIN },
    { packageName: MI_DOC, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: tBase + 20 * MIN },
    { packageName: MI_DOC, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: tBase + 32 * MIN },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: tBase + 32 * MIN },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: tBase + 49 * MIN },
    { packageName: WHATSAPP, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: tBase + 49 * MIN },
    { packageName: WHATSAPP, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: tBase + 59 * MIN },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: tBase + 59 * MIN },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: tBase + 69 * MIN },
  ];

  // 1) Per-app active foreground totals match Digital Wellbeing (ChatGPT = 47m, Mi Doc = 12m, WhatsApp = 10m)
  const fgTotals = computeDayForegroundTotals(rows, { window: { fromMs: dayStart, toMs: dayEnd } });
  assert.equal(fgTotals.find((r) => r.packageName === CHATGPT)?.totalMs, 47 * MIN);
  assert.equal(fgTotals.find((r) => r.packageName === MI_DOC)?.totalMs, 12 * MIN);
  assert.equal(fgTotals.find((r) => r.packageName === WHATSAPP)?.totalMs, 10 * MIN);

  // 2) Sessionized sitting spans merge same-app reopens <=15m, so ChatGPT spans [09:00, 10:09] = 69m (1h 9m)
  const built = buildUsageEvents(rows, { sinceMs: dayStart, untilMs: dayEnd });
  const { sessions } = sessionize(built.events);
  const canonical = buildCanonicalDaySittings(
    sessions.map((s) => ({ id: s.id, app: s.app, startMs: s.startMs, endMs: s.endMs })),
    { window: { fromMs: dayStart, toMs: dayEnd } },
  );
  const chatGptSittingSpanMs = sumSittingSpanMs(canonical.filter((s) => s.app === CHATGPT));
  assert.equal(chatGptSittingSpanMs, 69 * MIN);

  // 3) Pre-install bucket fallback rejects yesterday's [Oct 27 05:30, Oct 28 05:30) bucket (midpoint Oct 27 17:30 < Oct 28 00:00)
  //    and merges multiple intra-day buckets per packageName
  const sanitizedBuckets = filterUsageStatsBucketsForDay(
    [
      { packageName: CHATGPT, totalTimeInForeground: 31 * MIN, firstTimeStamp: rollover0530 - 86_400_000, lastTimeStamp: rollover0530 },
      { packageName: CHATGPT, totalTimeInForeground: 27 * MIN, firstTimeStamp: rollover0530, lastTimeStamp: rollover0530 + 3 * 3_600_000 },
      { packageName: CHATGPT, totalTimeInForeground: 20 * MIN, firstTimeStamp: rollover0530 + 3 * 3_600_000, lastTimeStamp: rollover0530 + 6 * 3_600_000 },
    ],
    { window: { fromMs: dayStart, toMs: dayEnd } },
  );
  assert.deepEqual(sanitizedBuckets, [{ packageName: CHATGPT, totalMs: 47 * MIN }]);
});

test('summarizeUsageStatsBucketsForDay isolates pre-midnight INTERVAL_DAILY bucket bleed (+31m -> 1h 18m vs 47m Day fg) in DebugView', () => {
  // 2026-10-28 in Asia/Calcutta (UTC+05:30): local midnight = Oct 27 18:30Z, UTC bucket rollover = Oct 28 00:00Z (05:30 IST)
  const dayStart = Date.parse('2026-10-27T18:30:00.000Z');
  const dayEnd = dayStart + 86_400_000;
  const rollover0530 = Date.parse('2026-10-28T00:00:00.000Z');
  const MIN = 60_000;
  const CHATGPT = 'com.openai.chatgpt';
  const MI_DOC = 'cn.wps.moffice_eng.xiaomi.lite';
  const WHATSAPP = 'com.whatsapp';

  const bucketDiags = summarizeUsageStatsBucketsForDay(
    [
      // Pre-midnight bucket [Oct 27 05:30 IST, Oct 28 05:30 IST) overlapping 2026-10-28 00:00 IST:
      // ChatGPT had 31m on Oct 27 evening; Mi Doc Viewer and WhatsApp had 0m in that bucket.
      {
        packageName: CHATGPT,
        totalTimeInForeground: 31 * MIN,
        firstTimeStamp: rollover0530 - 86_400_000,
        lastTimeStamp: rollover0530,
      },
      // Today's bucket [Oct 28 05:30 IST, Oct 29 05:30 IST):
      {
        packageName: CHATGPT,
        totalTimeInForeground: 47 * MIN,
        firstTimeStamp: rollover0530,
        lastTimeStamp: rollover0530 + 8 * 3_600_000,
      },
      {
        packageName: MI_DOC,
        totalTimeInForeground: 25 * MIN,
        firstTimeStamp: rollover0530,
        lastTimeStamp: rollover0530 + 8 * 3_600_000,
      },
      {
        packageName: WHATSAPP,
        totalTimeInForeground: 22 * MIN,
        firstTimeStamp: rollover0530,
        lastTimeStamp: rollover0530 + 8 * 3_600_000,
      },
    ],
    { window: { fromMs: dayStart, toMs: dayEnd } },
  );

  const chatGptDiag = bucketDiags.find((d) => d.packageName === CHATGPT);
  assert.ok(chatGptDiag);
  assert.equal(chatGptDiag.totalMs, 78 * MIN, 'Raw INTERVAL_DAILY sums to 1h 18m (78m)');
  assert.equal(chatGptDiag.preMidnightBucketMs, 31 * MIN, '31m comes from bucket starting before local midnight');
  assert.equal(chatGptDiag.bucketCount, 2);
  assert.equal(chatGptDiag.earliestBucketStartMs, rollover0530 - 86_400_000);

  const miDocDiag = bucketDiags.find((d) => d.packageName === MI_DOC);
  assert.equal(miDocDiag?.totalMs, 25 * MIN);
  assert.equal(miDocDiag?.preMidnightBucketMs, 0);
  assert.equal(miDocDiag?.bucketCount, 1);

  const whatsappDiag = bucketDiags.find((d) => d.packageName === WHATSAPP);
  assert.equal(whatsappDiag?.totalMs, 22 * MIN);
  assert.equal(whatsappDiag?.preMidnightBucketMs, 0);
});

test('resolveDayForegroundTotals explicitly labels os_events, stored_events (including +6h next-day lookahead & mid-day rolloff), and os_bucket_approx', () => {
  const MIN = 60_000;
  const CHATGPT = 'com.openai.chatgpt';
  const dayStart = Date.parse('2026-10-18T18:30:00.000Z'); // older day ~10 days ago
  const dayEnd = dayStart + 86_400_000;
  const nowMs = dayStart + 10 * 86_400_000;

  // 1) Live day within Android's UsageEvents buffer -> source === 'os_events'
  const liveRaw = [
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: dayStart + 2 * 3_600_000 },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: dayStart + 2 * 3_600_000 + 25 * MIN },
  ];
  const liveRes = resolveDayForegroundTotals({
    rawEvents: liveRaw,
    storedEvents: [],
    bucketRows: [],
    hasPermission: true,
    options: { window: { fromMs: dayStart, toMs: dayEnd }, nowMs },
  });
  assert.equal(liveRes.source, 'os_events');
  assert.deepEqual(liveRes.totals, [{ packageName: CHATGPT, totalMs: 25 * MIN }]);

  // 2) Older day where OS UsageEvents rolled off (even when +6h next-day lookahead returns Day+1 rows!),
  //    but Mirror SQLite stored events exist -> source === 'stored_events'
  const storedBuilt = buildUsageEvents(liveRaw, { sinceMs: dayStart, untilMs: dayEnd });
  const nextDayLookaheadOnly = [
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: dayEnd + 2 * 3_600_000 },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: dayEnd + 2 * 3_600_000 + 10 * MIN },
  ];
  const storedRes = resolveDayForegroundTotals({
    rawEvents: nextDayLookaheadOnly,
    storedEvents: storedBuilt.events,
    bucketRows: [],
    earliestStoredEventMs: dayStart - 86_400_000,
    hasPermission: true,
    options: { window: { fromMs: dayStart, toMs: dayEnd }, nowMs },
  });
  assert.equal(storedRes.source, 'stored_events');
  assert.deepEqual(storedRes.totals, [{ packageName: CHATGPT, totalMs: 25 * MIN }]);

  // 3) Boundary day (~day 7) where Android pruned morning UsageEvents (09:00) and only afternoon (16:00) remains,
  //    while Mirror's SQLite store retains both morning (25m) and afternoon (15m) -> prefers complete 'stored_events' (40m)
  const boundaryMorningAndAfternoon = [
    ...liveRaw,
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: dayStart + 16 * 3_600_000 },
    { packageName: CHATGPT, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: dayStart + 16 * 3_600_000 + 15 * MIN },
  ];
  const fullDayStored = buildUsageEvents(boundaryMorningAndAfternoon, { sinceMs: dayStart, untilMs: dayEnd });
  const truncatedAfternoonRawOnly = boundaryMorningAndAfternoon.slice(2);
  const partialRolloffRes = resolveDayForegroundTotals({
    rawEvents: truncatedAfternoonRawOnly,
    storedEvents: fullDayStored.events,
    bucketRows: [],
    earliestStoredEventMs: dayStart - 86_400_000,
    hasPermission: true,
    options: { window: { fromMs: dayStart, toMs: dayEnd }, nowMs },
  });
  assert.equal(partialRolloffRes.source, 'stored_events');
  assert.deepEqual(partialRolloffRes.totals, [{ packageName: CHATGPT, totalMs: 40 * MIN }]);

  // 4) Pre-Mirror older day: neither OS UsageEvents nor Mirror stored events exist -> falls back to
  //    INTERVAL_DAILY buckets and explicitly labels source === 'os_bucket_approx'
  const approxRes = resolveDayForegroundTotals({
    rawEvents: [],
    storedEvents: [],
    bucketRows: [
      {
        packageName: CHATGPT,
        totalTimeInForeground: 34 * MIN,
        firstTimeStamp: dayStart + 5.5 * 3_600_000,
        lastTimeStamp: dayStart + 20 * 3_600_000,
      },
    ],
    earliestStoredEventMs: dayStart + 3 * 86_400_000, // Mirror installed 3 days later
    hasPermission: true,
    options: { window: { fromMs: dayStart, toMs: dayEnd }, nowMs },
  });
  assert.equal(approxRes.source, 'os_bucket_approx');
  assert.deepEqual(approxRes.totals, [{ packageName: CHATGPT, totalMs: 34 * MIN }]);
});



