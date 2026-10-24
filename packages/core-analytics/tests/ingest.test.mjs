/**
 * packages/core-analytics/tests/ingest.test.mjs
 *
 * Ingestion is where "what happened" becomes "which sitting, and which day". The
 * cases that matter are the boundaries: midnight, a change of timezone offset, a
 * window that only half covers a day, and an event that belongs to no session.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), { outfile: join(HERE, '.build', 'core.mjs') });
const { ingest, daysInWindow, overlapMs, describeGapSummary, dayStartMs } = core;

const at = (iso) => iso;
let seq = 0;
const fg = (iso, app = 'com.a') => ({ schema_version: 1, id: `evt_fg_${String(++seq).padStart(8, '0')}`, kind: 'app_foreground', at: at(iso), tier: 'D', origin: 'os', content: 'metadata', app });
const bg = (iso, app = 'com.a') => ({ schema_version: 1, id: `evt_bg_${String(++seq).padStart(8, '0')}`, kind: 'app_background', at: at(iso), tier: 'D', origin: 'os', content: 'metadata', app, duration_ms: 1000 });
const unlock = (iso) => ({ schema_version: 1, id: `evt_un_${String(++seq).padStart(8, '0')}`, kind: 'device_unlock', at: at(iso), tier: 'D', origin: 'os', content: 'metadata' });
const imported = (iso, subject) => ({
  schema_version: 1,
  id: `evt_imp_${String(++seq).padStart(8, '0')}`,
  kind: 'import_item',
  at: at(iso),
  tier: 'B',
  origin: 'export',
  content: 'content',
  consent: 'export:reddit-export',
  source_id: 'reddit-export',
  export_format: 'reddit-export',
  subject,
});

const window = (from, to) => ({ fromMs: Date.parse(from), toMs: Date.parse(to) });
const DAY = window('2026-10-16T00:00:00Z', '2026-10-17T00:00:00Z');

/* ------------------------------------------------------------------ edges ---- */

test('empty batch: no sessions, no rollups, no NaN', () => {
  const result = ingest({ events: [], window: DAY });
  assert.deepEqual(result.sessions, []);
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.rollups, []);
  assert.deepEqual(result.partialDays, []);
  assert.equal(result.stats.events, 0);
});

test('a single event is not a session and is still assigned null', () => {
  const event = fg('2026-10-16T09:00:00Z');
  const result = ingest({ events: [event], window: DAY });
  assert.equal(result.sessions.length, 0);
  assert.deepEqual(result.assignments, [{ eventId: event.id, sessionId: null }]);
  assert.equal(result.dropped[0].reason, 'unclosed');
});

test('one interval becomes one session, with an id the validator accepts', () => {
  const start = fg('2026-10-16T09:00:00Z');
  const end = bg('2026-10-16T09:12:00Z');
  const result = ingest({ events: [start, end], window: DAY });
  assert.equal(result.sessions.length, 1);
  const session = result.sessions[0];
  assert.match(session.id, /^ses_[A-Za-z0-9_-]{6,40}$/);
  assert.equal(session.app, 'com.a');
  assert.equal(session.duration_ms, 12 * 60_000);
  assert.equal(session.source, 'ingested');
  assert.deepEqual(result.assignments.map((a) => a.sessionId), [session.id, session.id]);
  assert.equal(result.stats.attributed, 2);
});

test('session ids are deterministic, and a merge changes the id', () => {
  const build = () => {
    seq = 0;
    return [fg('2026-10-16T09:00:00Z'), bg('2026-10-16T09:01:00Z'), fg('2026-10-16T09:01:30Z'), bg('2026-10-16T09:02:00Z')];
  };
  const one = ingest({ events: build(), window: DAY }, { mergeGapMs: 60_000 });
  const two = ingest({ events: build(), window: DAY }, { mergeGapMs: 60_000 });
  assert.equal(one.sessions.length, 1);
  assert.equal(one.sessions[0].id, two.sessions[0].id);
  const split = ingest({ events: build(), window: DAY }, { mergeGapMs: 0 });
  assert.equal(split.sessions.length, 2);
  assert.notEqual(split.sessions[0].id, one.sessions[0].id);
});

test('a non-foreground event is not given a session, and a user label is left alone', () => {
  const event = unlock('2026-10-16T09:05:00Z');
  const label = {
    schema_version: 1,
    id: 'evt_lbl_00000001',
    kind: 'intent_label',
    at: '2026-10-16T09:06:00Z',
    tier: 'D',
    origin: 'user',
    content: 'metadata',
    session_id: 'ses_written_by_user_01',
    label: 'intentional',
  };
  const result = ingest({ events: [event, label], window: DAY });
  assert.deepEqual(result.assignments, [], 'only foreground/background events are attributed');
  assert.equal(result.rollups[0].payload.events, 2);
});

/* ------------------------------------------------------------------- days ---- */

test('day bucketing honours an explicit UTC offset: 20:00Z is tomorrow in IST', () => {
  const start = fg('2026-10-16T20:00:00Z');
  const end = bg('2026-10-16T20:30:00Z');
  const result = ingest({ events: [start, end], window: DAY }, { utcOffsetMinutes: 330 });
  assert.equal(result.rollups.length, 1);
  assert.equal(result.rollups[0].day, '2026-10-17');
  assert.equal(result.rollups[0].payload.utc_offset_minutes, 330);
  assert.equal(result.rollups[0].payload.session_ms, 30 * 60_000);
});

test('a sitting across midnight is split by duration but counted once', () => {
  const start = fg('2026-10-16T23:30:00Z');
  const end = bg('2026-10-17T00:30:00Z');
  const result = ingest({ events: [start, end], window: window('2026-10-16T00:00:00Z', '2026-10-18T00:00:00Z') });
  const first = result.rollups.find((entry) => entry.day === '2026-10-16');
  const second = result.rollups.find((entry) => entry.day === '2026-10-17');
  assert.equal(first.payload.session_ms, 30 * 60_000);
  assert.equal(second.payload.session_ms, 30 * 60_000);
  assert.equal(first.payload.sessions, 1);
  assert.equal(second.payload.sessions, 0, 'one sitting is one open, even across midnight');
});

test('a window that half covers a day says so instead of inventing totals', () => {
  const result = ingest({ events: [fg('2026-10-16T09:00:00Z')], window: window('2026-10-16T08:00:00Z', '2026-10-16T18:00:00Z') });
  assert.deepEqual(result.partialDays, ['2026-10-16']);
  const whole = ingest({ events: [fg('2026-10-16T09:00:00Z')], window: DAY });
  assert.deepEqual(whole.partialDays, []);
});

test('daysInWindow covers a multi-day window in order, and an inverted window is empty', () => {
  assert.deepEqual(daysInWindow(window('2026-10-16T12:00:00Z', '2026-10-18T01:00:00Z'), 0), ['2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(daysInWindow(window('2026-10-18T01:00:00Z', '2026-10-16T12:00:00Z'), 0), []);
  assert.equal(dayStartMs('2026-10-17', 330), Date.parse('2026-10-16T18:30:00Z'));
  assert.equal(overlapMs(0, 100, 50, 200), 50);
  assert.equal(overlapMs(0, 100, 100, 200), 0, 'half-open intervals do not double-count the boundary');
});

/* ------------------------------------------------------------------- gaps ---- */

test('gaps are attributed to a day, summarised by reason, and undated ones are counted', () => {
  const result = ingest(
    {
      events: [fg('2026-10-16T09:00:00Z')],
      gaps: [
        { reason: 'too_long', count: 1, fromMs: Date.parse('2026-10-16T10:00:00Z'), toMs: Date.parse('2026-10-16T16:00:00Z') },
        { reason: 'orphan_background', count: 3, fromMs: Date.parse('2026-10-16T11:00:00Z') },
        { reason: 'abandoned_open', count: 1 },
      ],
      window: DAY,
    },
    { utcOffsetMinutes: 0 },
  );
  const payload = result.rollups[0].payload;
  assert.equal(payload.gaps.count, 4);
  assert.equal(payload.gaps.measured_gap_ms, 6 * 3_600_000);
  assert.deepEqual(payload.gaps.by_reason, { too_long: 1, orphan_background: 3 });
  assert.equal(result.unattributedGaps, 1);
  assert.equal(result.rollups[0].day, '2026-10-16');
});

test('a day with only a gap still gets a rollup: silence is data', () => {
  const result = ingest({ events: [], gaps: [{ reason: 'too_long', count: 1, fromMs: Date.parse('2026-10-16T10:00:00Z'), toMs: Date.parse('2026-10-16T16:00:00Z') }], window: DAY });
  assert.equal(result.rollups.length, 1);
  assert.equal(result.rollups[0].payload.events, 0);
  assert.equal(result.rollups[0].payload.gaps.count, 1);
});

test('describeGapSummary: no gaps is a sentence, spanned gaps report unmeasured time, and zero-length unmatched events are not presented as lost data', () => {
  assert.equal(describeGapSummary({ count: 0, byReason: {}, measuredGapMs: 0 }), 'No collection gaps recorded.');
  assert.equal(describeGapSummary({ count: 1, byReason: { too_long: 1 }, measuredGapMs: 3_600_000 }), '1 collection gap (1 h unmeasured; 1 too long).');
  assert.equal(
    describeGapSummary({ count: 5, byReason: { orphan_background: 4, too_long: 1 }, measuredGapMs: 2 * 3_600_000 + 30 * 60_000 }),
    '5 collection gaps (2 h 30 min unmeasured; 4 orphan background, 1 too long).',
  );
  const zeroSpan = describeGapSummary({ count: 49, byReason: { orphan_background: 49 }, measuredGapMs: 0 });
  assert.equal(
    zeroSpan,
    '49 unmatched OS events (49 orphan background) — point-in-time boundary events, not lost usage time.',
  );
  assert.ok(!zeroSpan.includes('collection gap'), 'zero-length unmatched events must not say collection gaps');
  assert.ok(!zeroSpan.includes('0 min unmeasured'), 'zero-length unmatched events must not say 0 min unmeasured');
});

/* ----------------------------------------------------------------- rollups --- */

test('a rollup carries counts and package names, never a title or a query', () => {
  const result = ingest({ events: [imported('2026-10-16T09:00:00Z', 'SECRET TITLE ABOUT SOMETHING')], window: DAY });
  const serialised = JSON.stringify(result.rollups[0].payload);
  assert.ok(!serialised.includes('SECRET TITLE'));
  assert.equal(result.rollups[0].payload.imports, 1);
});

test('unlocks, imports and app time are counted per day', () => {
  const events = [
    fg('2026-10-16T09:00:00Z', 'com.a'),
    bg('2026-10-16T09:10:00Z', 'com.a'),
    fg('2026-10-16T10:00:00Z', 'com.b'),
    bg('2026-10-16T10:20:00Z', 'com.b'),
    unlock('2026-10-16T11:00:00Z'),
    unlock('2026-10-16T12:00:00Z'),
  ];
  const result = ingest({ events, window: DAY });
  const payload = result.rollups[0].payload;
  assert.equal(payload.unlocks, 2);
  assert.equal(payload.sessions, 2);
  assert.equal(payload.session_ms, 30 * 60_000);
  assert.deepEqual(payload.apps, [
    { app: 'com.b', ms: 20 * 60_000, sessions: 1 },
    { app: 'com.a', ms: 10 * 60_000, sessions: 1 },
  ]);
  assert.equal(payload.apps_omitted, 0);
});

test('maxAppsPerDay keeps the longest and reports how many it hid', () => {
  const events = [];
  for (let i = 0; i < 5; i += 1) {
    events.push(fg(`2026-10-16T0${i}:00:00Z`, `com.app${i}`));
    events.push(bg(`2026-10-16T0${i}:${String((i + 1) * 10).padStart(2, '0')}:00Z`, `com.app${i}`));
  }
  const result = ingest({ events, window: DAY }, { maxAppsPerDay: 2 });
  assert.equal(result.rollups[0].payload.apps.length, 2);
  assert.equal(result.rollups[0].payload.apps_omitted, 3);
  assert.equal(result.rollups[0].payload.apps[0].app, 'com.app4');
});

test('property: rollups are finite, durations never exceed the day, app time never exceeds session time', () => {
  const eventParts = fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 1, max: 180 }),
  );
  fc.assert(
    fc.property(fc.array(eventParts, { maxLength: 12 }), (parts) => {
      const events = [];
      for (const [h, m, s, minutes] of parts) {
        const startMs = Date.parse(`2026-10-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`);
        const endMs = startMs + minutes * 60_000;
        events.push(fg(new Date(startMs).toISOString().replace(/\.\d{3}Z$/, 'Z')));
        events.push(bg(new Date(Math.min(endMs, Date.parse('2026-10-17T00:00:00Z'))).toISOString().replace(/\.\d{3}Z$/, 'Z')));
      }
      const result = ingest({ events, window: DAY });
      for (const { payload } of result.rollups) {
        assert.ok(Number.isFinite(payload.session_ms));
        assert.ok(payload.session_ms <= 86_400_000);
        const appSum = payload.apps.reduce((sum, app) => sum + app.ms, 0);
        assert.ok(appSum <= payload.session_ms, 'per-app time cannot exceed total session time');
        assert.ok(payload.apps.every((app) => Number.isFinite(app.ms) && app.ms >= 0));
      }
    }),
    { numRuns: 50 },
  );
});

test('a pair straddling midnight is formed from look-around events, but only the day is counted', () => {
  const start = fg('2026-10-16T23:50:00Z');
  const end = bg('2026-10-17T00:10:00Z');
  const result = ingest({ events: [start, end], window: DAY }, { utcOffsetMinutes: 0 });
  assert.equal(result.sessions.length, 1, 'the session exists as a pair even though one half is tomorrow');
  assert.equal(result.rollups.length, 1);
  assert.equal(result.rollups[0].day, '2026-10-16');
  assert.equal(result.rollups[0].payload.session_ms, 10 * 60_000, 'only the part inside the day is counted');
  assert.equal(result.stats.events, 1, 'the background belongs to tomorrow');
  assert.deepEqual(
    result.assignments.sort((a, b) => a.eventId.localeCompare(b.eventId)).map((a) => a.sessionId),
    [result.sessions[0].id, result.sessions[0].id],
    'both halves point at the session, so attribution does not depend on which day was ingested',
  );
});

test('an event outside the window and outside any session is not assigned at all', () => {
  const outside = bg('2026-10-17T09:00:00Z');
  const result = ingest({ events: [outside], window: DAY });
  assert.deepEqual(result.assignments, []);
  assert.equal(result.stats.events, 0);
});
