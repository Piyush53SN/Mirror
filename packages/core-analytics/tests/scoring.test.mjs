/**
 * packages/core-analytics/tests/scoring.test.mjs
 *
 * The brief names four edges for scoring — empty, zero, single event, all
 * sessions under 8 s — and they are the first four tests. After that: the
 * arithmetic must close (parts add to the total), missing data must never become
 * zero, and the placeholder embedder must never be mistaken for semantics.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), { outfile: join(HERE, '.build', 'core.mjs') });
const { scoreIqs, sessionBands, switchingRate, lateNightMs, curiositySplit, sessionsInWindow, isScorableModel, MIN_LABELS } = core;

const T0 = Date.parse('2026-10-16T08:00:00Z');
// Wide enough for `base()`: 40 sittings at two-hour spacing = 80 h.
const DAY = { fromMs: T0 - 7 * 86_400_000, toMs: T0 + 5 * 86_400_000 };
const session = (id, startMs, durationMs, app = 'com.a') => ({ id, app, startMs, endMs: startMs + durationMs });
const MIN = 60_000;
const H = 3_600_000;

const base = (over = {}) => {
  const sessions = [];
  for (let i = 0; i < 40; i += 1) sessions.push(session(`ses_${i}`, T0 + i * 2 * H, 10 * MIN, i % 2 ? 'com.a' : 'com.b'));
  const labels = sessions.slice(0, 20).map((s, i) => ({ sessionId: s.id, label: i % 2 ? 'mindless' : 'intentional' }));
  return { window: DAY, sessions, labels, utcOffsetMinutes: 0, ...over };
};

/* ------------------------------------------------------------------ edges --- */

test('empty: no score, no zero, no NaN, confidence none', () => {
  const score = scoreIqs({ window: DAY, sessions: [] });
  assert.equal(score.value, null, 'unknown is null, never 0');
  assert.equal(score.max, 0);
  assert.equal(score.confidence.level, 'none');
  assert.equal(score.confidence.score, 0);
  assert.ok(score.factors.every((f) => f.measurable === false));
  assert.ok(!JSON.stringify(score).includes('NaN'));
  for (const f of score.factors) assert.equal(Number.isFinite(f.points), true);
});

test('zero-duration sessions are not sessions', () => {
  const score = scoreIqs({ window: DAY, sessions: [session('ses_zero', T0, 0)] });
  assert.equal(score.value, null);
  assert.equal(score.confidence.sample, 0);
});

test('a single session is measurable but low-confidence', () => {
  const score = scoreIqs({ window: DAY, sessions: [session('ses_one', T0, 5 * MIN)] });
  assert.equal(score.confidence.sample, 1);
  assert.equal(score.confidence.level, 'low');
  assert.equal(score.factors.find((f) => f.id === 'switching').measurable, false, 'one sitting cannot show switching');
  assert.equal(score.max, 40, 'length 25 + late night 15; switching and labels need more sittings, topic has no vectors');
  assert.equal(score.value, 25 + 15);
});

test('all sessions under 8 s: the length part is zero, not undefined', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => session(`ses_s${i}`, T0 + i * MIN, 4_000));
  const score = scoreIqs({ window: DAY, sessions });
  const factor = score.factors.find((f) => f.id === 'session_length');
  assert.equal(factor.measurable, true);
  assert.equal(factor.points, 0);
  assert.match(factor.detail, /12 of 12 opens ended under 8 s/);
  assert.ok(score.value > 0, 'the other parts still count');
});

/* ------------------------------------------------------------- arithmetic --- */

test('the parts add up exactly to the total, and the max is the sum of measured maxima', () => {
  const score = scoreIqs(base());
  const sum = score.factors.filter((f) => f.measurable).reduce((total, f) => total + f.points, 0);
  assert.ok(Math.abs(sum - score.value) < 1e-9, `${sum} !== ${score.value}`);
  const max = score.factors.filter((f) => f.measurable).reduce((total, f) => total + f.max, 0);
  assert.equal(score.max, max);
  for (const factor of score.factors) {
    assert.ok(factor.points >= 0 && factor.points <= factor.max, `${factor.id} is outside its own range`);
  }
});

test('labels are the deliberate share: half intentional is half the part', () => {
  const score = scoreIqs(base());
  const factor = score.factors.find((f) => f.id === 'deliberate_share');
  assert.equal(factor.points, 10);
  assert.match(factor.detail, /10 of 20 labelled sittings/);
});

test('too few labels leaves the part unmeasured and the maximum smaller — not zero', () => {
  const score = scoreIqs(base({ labels: [{ sessionId: 'ses_0', label: 'intentional' }] }));
  const factor = score.factors.find((f) => f.id === 'deliberate_share');
  assert.equal(factor.measurable, false);
  assert.equal(factor.points, 0);
  assert.match(factor.detail, new RegExp(`1 decisive label \\(${MIN_LABELS} needed\\)`));
  assert.equal(score.max, 55);
  assert.match(score.caveat, /Out of 55/);
});

test('switching is smooth, bounded and never divides by zero', () => {
  assert.deepEqual(switchingRate([]), { switches: 0, activeHours: 0, perHour: 0 });
  const sessions = [
    session('a', T0, 10 * MIN, 'com.a'),
    session('b', T0 + 11 * MIN, 10 * MIN, 'com.b'),
    session('c', T0 + 22 * MIN, 10 * MIN, 'com.a'),
    session('d', T0 + 3 * H, 10 * MIN, 'com.b'), // too far apart to be a switch
  ];
  const rate = switchingRate(sessions);
  assert.equal(rate.switches, 2);
  const score = scoreIqs({ window: DAY, sessions });
  const factor = score.factors.find((f) => f.id === 'switching');
  assert.ok(factor.points > 0 && factor.points < factor.max);
});

/* --------------------------------------------------------------- late night -- */

test('late-night is local, wraps midnight, and handles a session spanning it', () => {
  assert.equal(lateNightMs(Date.parse('2026-10-16T23:30:00Z'), Date.parse('2026-10-17T00:30:00Z'), 0), H);
  assert.equal(lateNightMs(Date.parse('2026-10-16T04:30:00Z'), Date.parse('2026-10-16T05:30:00Z'), 0), 30 * MIN);
  assert.equal(lateNightMs(Date.parse('2026-10-16T18:00:00Z'), Date.parse('2026-10-16T18:30:00Z'), 330), 30 * MIN, '18:00Z is 23:30 IST');
  assert.equal(lateNightMs(Date.parse('2026-10-16T12:00:00Z'), Date.parse('2026-10-16T13:00:00Z'), 0), 0);
});

test('late-night share lowers that part proportionally', () => {
  const sessions = [
    session('a', Date.parse('2026-10-16T09:00:00Z'), 30 * MIN),
    session('b', Date.parse('2026-10-16T23:30:00Z'), 30 * MIN),
  ];
  const factor = scoreIqs({ window: DAY, sessions }).factors.find((f) => f.id === 'late_night');
  assert.equal(factor.points, 7.5);
  assert.match(factor.detail, /50% of sitting time/);
});

/* -------------------------------------------------------------- topic depth -- */

test('the placeholder embedder is never scored as topic depth', () => {
  const sessions = Array.from({ length: 6 }, (_, i) => session(`ses_t${i}`, T0 + i * H, 10 * MIN));
  const vectors = new Map(sessions.map((s) => [s.id, { model: 'placeholder-ngram-v1', vector: [1, 0, 0] }]));
  const score = scoreIqs({ window: DAY, sessions, vectors });
  const factor = score.factors.find((f) => f.id === 'topic_depth');
  assert.equal(factor.measurable, false);
  assert.match(factor.detail, /placeholder/);
  assert.equal(isScorableModel('placeholder-ngram-v1'), false);
  assert.equal(isScorableModel('minilm-l6-v2'), true);
});

test('a real model with coherent vectors earns topic points', () => {
  const sessions = Array.from({ length: 6 }, (_, i) => session(`ses_t${i}`, T0 + i * H, 10 * MIN));
  const vectors = new Map(sessions.map((s) => [s.id, { model: 'minilm-l6-v2', vector: [1, 0.1, 0] }]));
  const labels = sessions.map((s) => ({ sessionId: s.id, label: 'intentional' }));
  const score = scoreIqs({ window: DAY, sessions, labels, vectors });
  const factor = score.factors.find((f) => f.id === 'topic_depth');
  assert.equal(factor.measurable, true);
  assert.equal(factor.points, 25);
  assert.equal(score.max, 100);
  assert.equal(score.band, 'full band');
});

/* ------------------------------------------------------------------- bands -- */

test('duration bands cover every session exactly once', () => {
  const sessions = [
    session('a', T0, 4_000),
    session('b', T0, 8_000),
    session('c', T0, MIN),
    session('d', T0, 5 * MIN),
    session('e', T0, 20 * MIN),
  ];
  const bands = sessionBands(sessions);
  assert.deepEqual(bands.map((b) => b.count), [1, 1, 1, 1, 1]);
  assert.equal(bands.reduce((sum, b) => sum + b.count, 0), sessions.length);
  assert.equal(sessionBands([]).every((b) => b.share === 0), true);
});

/* -------------------------------------------------------------- confidence -- */

test('confidence names what lowered it: gaps, sample and labels', () => {
  const sessions = [session('ses_a', T0, 9 * MIN), session('ses_b', T0 + H, 9 * MIN), session('ses_c', T0 + 2 * H, 9 * MIN)];
  const score = scoreIqs({
    window: DAY,
    sessions,
    gaps: [{ reason: 'too_long', count: 1, fromMs: DAY.fromMs, toMs: DAY.fromMs + 8 * 86_400_000 }],
  });
  assert.ok(score.confidence.coverage < 0.5);
  assert.ok(score.confidence.reasons.some((r) => /could not be measured/.test(r)));
  assert.ok(score.confidence.reasons.some((r) => /small sample/.test(r)));
  assert.equal(score.confidence.level, 'low');
});

test('curiosity split is null below the label floor and exact above it', () => {
  const sessions = [session('a', T0, 10 * MIN), session('b', T0 + H, 20 * MIN)];
  assert.equal(curiositySplit({ window: DAY, sessions, labels: [{ sessionId: 'a', label: 'intentional' }] }), null);
  const six = Array.from({ length: 6 }, (_, i) => session(`c${i}`, T0 + i * H, 10 * MIN));
  const split = curiositySplit({
    window: DAY,
    sessions: six,
    labels: six.map((s, i) => ({ sessionId: s.id, label: i < 3 ? 'intentional' : 'mindless' })),
  });
  assert.equal(split.deepMs, 30 * MIN);
  assert.equal(split.habitMs, 30 * MIN);
  assert.equal(split.labelShare, 1);
});

/* ---------------------------------------------------------------- property -- */

test('property: a score is bounded, finite and closed under its own parts', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ offset: fc.integer({ min: 0, max: 200 }), duration: fc.integer({ min: 0, max: 120 }) }),
        { maxLength: 40 },
      ),
      fc.array(fc.constantFrom('intentional', 'mindless', 'unsure'), { maxLength: 40 }),
      (rows, labels) => {
        const sessions = rows.map((row, i) => session(`ses_p${i}`, T0 + row.offset * MIN, row.duration * MIN));
        const score = scoreIqs({
          window: DAY,
          sessions,
          labels: sessions.map((s, i) => ({ sessionId: s.id, label: labels[i] ?? 'unsure' })),
        });
        if (score.value !== null) {
          assert.ok(score.value >= 0 && score.value <= score.max, `${score.value} outside 0..${score.max}`);
          const sum = score.factors.filter((f) => f.measurable).reduce((t, f) => t + f.points, 0);
          assert.ok(Math.abs(sum - score.value) < 1e-9);
        }
        assert.ok(score.confidence.score >= 0 && score.confidence.score <= 1);
        assert.ok(!JSON.stringify(score).includes('NaN'));
      },
    ),
    { numRuns: 60 },
  );
});

test('property: more abandoned opens never raise the session-length part', () => {
  const build = (shortCount) => {
    const sessions = [];
    for (let i = 0; i < 20; i += 1) sessions.push(session(`ses_${i}`, T0 + i * H, i < shortCount ? 3_000 : 6 * MIN));
    return sessions;
  };
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }), (a, b) => {
      const low = scoreIqs({ window: DAY, sessions: build(Math.min(a, b)) }).factors.find((f) => f.id === 'session_length').points;
      const high = scoreIqs({ window: DAY, sessions: build(Math.max(a, b)) }).factors.find((f) => f.id === 'session_length').points;
      assert.ok(low >= high);
    }),
    { numRuns: 30 },
  );
});
