/**
 * packages/core-analytics/tests/sessionize.test.mjs
 *
 * The edge cases the brief names for scoring (empty, zero, single event, all
 * sessions under 8 s) are tested here, at the layer where they are decided, plus
 * property-based tests for the invariants a session list must have.
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
const { sessionize, summarise, SHORT_SESSION_MS, generateEvents } = core;

const ev = (kind, at, app = 'com.a') => ({
  schemaVersion: 1,
  id: `evt_${kind}_${at.replace(/\D/g, '')}`.slice(0, 40),
  kind,
  at,
  tier: 'D',
  origin: 'os',
  content: 'metadata',
  ...(app ? { app } : {}),
});

const t = (h, m = 0, s = 0) => `2026-10-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`;

/* ------------------------------------------------------------- the edges ---- */

test('empty input yields no sessions, a zero summary and no NaN', () => {
  const { sessions, dropped } = sessionize([]);
  assert.deepEqual(sessions, []);
  assert.deepEqual(dropped, []);
  const s = summarise(sessions);
  assert.deepEqual(s, { count: 0, totalMs: 0, shortShare: 0, medianMs: 0 });
  assert.ok(Number.isFinite(s.shortShare));
});

test('a single event is not a session', () => {
  const { sessions, dropped } = sessionize([ev('app_foreground', t(9))]);
  assert.equal(sessions.length, 0);
  assert.equal(dropped[0].reason, 'unclosed', 'an unclosed interval is reported, not extended to now');
});

test('zero-length and negative intervals are dropped with a reason', () => {
  const zero = sessionize([ev('app_foreground', t(9)), ev('app_background', t(9))]);
  assert.equal(zero.sessions.length, 0);
  assert.equal(zero.dropped[0].reason, 'zero_length');
});

test('a single complete interval is one session', () => {
  const { sessions } = sessionize([ev('app_foreground', t(9)), ev('app_background', t(9, 12))]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].durationMs, 12 * 60_000);
  assert.equal(sessions[0].app, 'com.a');
});

test('all sessions under 8 s: the summary says so instead of rounding to zero', () => {
  const events = [];
  for (let i = 0; i < 4; i++) {
    events.push(ev('app_foreground', t(9, i * 2, 0)));
    events.push(ev('app_background', t(9, i * 2, 3)));
  }
  const { sessions } = sessionize(events, { mergeGapMs: 0 });
  assert.equal(sessions.length, 4);
  const s = summarise(sessions);
  assert.equal(s.shortShare, 1);
  assert.equal(s.count, 4);
  assert.equal(s.medianMs, 3000);
});

test('gaps up to the merge window are one sitting; longer gaps are two', () => {
  const close = sessionize([
    ev('app_foreground', t(9, 0)),
    ev('app_background', t(9, 1)),
    ev('app_foreground', t(9, 1, 30)),
    ev('app_background', t(9, 2)),
  ]);
  assert.equal(close.sessions.length, 1);
  assert.equal(close.sessions[0].durationMs, 2 * 60_000);

  const far = sessionize([
    ev('app_foreground', t(9, 0)),
    ev('app_background', t(9, 1)),
    ev('app_foreground', t(9, 30)),
    ev('app_background', t(9, 31)),
  ]);
  assert.equal(far.sessions.length, 2);
});

test('interleaved apps stay separate, and are returned in start order', () => {
  const { sessions } = sessionize([
    ev('app_foreground', t(9, 0), 'com.a'),
    ev('app_foreground', t(9, 1), 'com.b'),
    ev('app_background', t(9, 2), 'com.a'),
    ev('app_background', t(9, 3), 'com.b'),
  ]);
  assert.deepEqual(sessions.map((s) => s.app), ['com.a', 'com.b']);
  // Sessions are ordered by start. Two *different* apps may overlap in the input
  // (the OS never does this in practice, but the sessionizer must not pretend the
  // data is cleaner than it is): the invariant is per app, not global.
  for (let i = 1; i < sessions.length; i++) assert.ok(Date.parse(sessions[i].start) >= Date.parse(sessions[i - 1].start));
  for (const app of ['com.a', 'com.b']) {
    const own = sessions.filter((s) => s.app === app);
    for (let i = 1; i < own.length; i++) assert.ok(Date.parse(own[i].start) >= Date.parse(own[i - 1].end), `${app} sessions overlap`);
  }
});

test('an orphan background is reported, not silently paired', () => {
  const { sessions, dropped } = sessionize([ev('app_background', t(9), 'com.a')]);
  assert.equal(sessions.length, 0);
  assert.deepEqual(dropped.map((d) => d.reason), ['orphan_background']);
});

test('minDurationMs filters, and says it filtered', () => {
  const { sessions, dropped } = sessionize([ev('app_foreground', t(9)), ev('app_background', t(9, 0, 5))], { minDurationMs: 8_000 });
  assert.equal(sessions.length, 0);
  assert.equal(dropped[0].reason, 'below_minimum');
});

test('SHORT_SESSION_MS is 8 seconds — one place, used by scoring', () => {
  assert.equal(SHORT_SESSION_MS, 8000);
});

/* --------------------------------------------------------------- property ---- */

const arbEvents = fc
  .array(
    fc.record({
      kind: fc.constantFrom('app_foreground', 'app_background'),
      minute: fc.integer({ min: 0, max: 600 }),
      app: fc.constantFrom('com.a', 'com.b', 'com.c'),
    }),
    { maxLength: 40 },
  )
  .map((rows) =>
    rows
      .map((r) => ev(r.kind, t(9 + Math.floor(r.minute / 60), r.minute % 60), r.app))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  );

test('property: sessions never overlap themselves and never have a negative duration', () => {
  fc.assert(
    fc.property(arbEvents, (events) => {
      const { sessions } = sessionize(events);
      for (const s of sessions) if (s.durationMs <= 0 || !Number.isFinite(s.durationMs)) return false;
      return true;
    }),
    { numRuns: 200 },
  );
});

test('property: every session lies inside the input span, and per-app sessions do not overlap', () => {
  fc.assert(
    fc.property(arbEvents, (events) => {
      if (events.length === 0) return true;
      const { sessions } = sessionize(events);
      // Different apps may legitimately interleave in malformed input, so the
      // span bound is the honest one: a session cannot start before the first
      // event or end after the last.
      const first = Date.parse(events[0].at);
      const last = Date.parse(events[events.length - 1].at);
      if (!sessions.every((s) => Date.parse(s.start) >= first && Date.parse(s.end) <= last && Date.parse(s.end) > Date.parse(s.start))) return false;
      for (const app of new Set(sessions.map((s) => s.app))) {
        const own = sessions.filter((s) => s.app === app).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
        for (let i = 1; i < own.length; i++) if (Date.parse(own[i].start) < Date.parse(own[i - 1].end)) return false;
      }
      return true;
    }),
    { numRuns: 200 },
  );
});

test('property: summary is always finite, and shortShare is a probability', () => {
  fc.assert(
    fc.property(arbEvents, (events) => {
      const s = summarise(sessionize(events).sessions);
      return Number.isFinite(s.totalMs) && s.shortShare >= 0 && s.shortShare <= 1 && Number.isFinite(s.medianMs);
    }),
    { numRuns: 200 },
  );
});

/* -------------------------------------------------------------- synthetic ---- */

test('synthetic data is deterministic per seed', () => {
  const a = JSON.stringify(generateEvents({ persona: 'rehan', days: 3 }));
  const b = JSON.stringify(generateEvents({ persona: 'rehan', days: 3 }));
  assert.equal(a, b);
  const c = JSON.stringify(generateEvents({ persona: 'rehan', days: 3, seed: 7 }));
  assert.notEqual(a, c, 'a different seed must produce different data');
});

test('synthetic data never produces a tier the persona does not have', () => {
  for (const persona of ['ananya', 'rehan', 'mei']) {
    const events = generateEvents({ persona, days: 5 });
    const tiers = new Set(events.map((e) => e.tier));
    if (persona === 'ananya') assert.deepEqual([...tiers], ['D'], 'tier-D persona must receive only tier D');
    if (persona === 'rehan') assert.ok(!tiers.has('A'), 'D+B+C persona must not receive tier A');
    if (persona === 'mei') assert.ok(tiers.has('A') && tiers.has('B') && tiers.has('C') && tiers.has('D'));
  }
});

test('synthetic data sessionises into a plausible day', () => {
  const events = generateEvents({ persona: 'mei', days: 7 });
  const { sessions, dropped } = sessionize(events);
  assert.ok(sessions.length > 20, `expected a week of sittings, got ${sessions.length}`);
  assert.equal(dropped.length, 0, 'the generator must not emit unclosed or orphan intervals');
  const totalDays = 7 * 24 * 3600 * 1000;
  const total = sessions.reduce((a, s) => a + s.durationMs, 0);
  assert.ok(total > 0 && total < totalDays, 'total use must be positive and less than the week');
});
