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
const { buildUsageEvents, collectUsage, USAGE_EVENT_TYPE, DEFAULT_IGNORED_PACKAGES } = core;

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

