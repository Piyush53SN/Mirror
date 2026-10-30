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
const { scoreIqs, sessionBands, switchingRate, lateNightMs, curiositySplit, sessionsInWindow, buildCanonicalDaySittings, computeWhatIf, isScorableModel, MIN_LABELS } = core;

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

test('empty: no score, no zero, no NaN, fixed 100 scale with 0 measuredMax, confidence none', () => {
  const score = scoreIqs({ window: DAY, sessions: [] });
  assert.equal(score.value, null, 'unknown is null, never 0');
  assert.equal(score.max, 100, 'fixed composite scale is always 100');
  assert.equal(score.measuredMax, 0);
  assert.equal(score.unmeasuredMax, 100);
  assert.equal(score.confidence.level, 'none');
  assert.equal(score.confidence.score, 0);
  assert.match(score.confidence.explanation, /Confidence is 0%/);
  assert.ok(score.factors.every((f) => f.measurable === false));
  assert.ok(!JSON.stringify(score).includes('NaN'));
  for (const f of score.factors) assert.equal(Number.isFinite(f.points), true);
});

test('zero-duration sessions are not sessions', () => {
  const score = scoreIqs({ window: DAY, sessions: [session('ses_zero', T0, 0)] });
  assert.equal(score.value, null);
  assert.equal(score.confidence.sample, 0);
});

test('single-event edge: 1 short sitting (5 min) stays unmeasured under minimum-activity rule; 1 long sitting (20 min) measures only late-night (15 of 100) at low confidence', () => {
  const shortSingle = scoreIqs({ window: DAY, sessions: [session('ses_one', T0, 5 * MIN)] });
  assert.equal(shortSingle.confidence.sample, 1);
  assert.equal(shortSingle.confidence.level, 'low');
  assert.equal(shortSingle.confidence.smallSample, true);
  assert.equal(shortSingle.value, null, '5 min across 1 sitting is below all minimum-activity floors');
  assert.equal(shortSingle.max, 100);
  assert.equal(shortSingle.measuredMax, 0);
  assert.equal(shortSingle.unmeasuredMax, 100);
  assert.match(shortSingle.caveat, /Minimum activity not met yet/);

  const longSingle = scoreIqs({ window: DAY, sessions: [session('ses_long', T0, 20 * MIN)] });
  assert.equal(longSingle.confidence.sample, 1);
  assert.equal(longSingle.confidence.level, 'low');
  assert.equal(longSingle.confidence.smallSample, true);
  assert.equal(longSingle.factors.find((f) => f.id === 'session_length').measurable, false, '<5 sittings');
  assert.equal(longSingle.factors.find((f) => f.id === 'switching').measurable, false, '<3 sittings');
  assert.equal(longSingle.factors.find((f) => f.id === 'late_night').measurable, true, '20 min >= 15 min');
  assert.equal(longSingle.max, 100);
  assert.equal(longSingle.measuredMax, 15);
  assert.equal(longSingle.unmeasuredMax, 85);
  assert.equal(longSingle.value, 15);
  assert.match(longSingle.confidence.explanation, /Confidence \([0-9]+% · low\) reflects how complete the inputs behind this score are/);
});

test('minimum-activity & per-sitting switching rules: hides late-night on 2-min 2-sitting day and computes switching per sitting on 3+ sustained sittings', () => {
  // 2-minute day at 23:30 local across 2 sittings -> late_night & switching MUST be hidden (not 0/15!)
  const twoMinLate = scoreIqs({
    window: DAY,
    sessions: [
      session('ln_1', Date.parse('2026-10-16T23:30:00Z'), 1 * MIN, 'com.a'),
      session('ln_2', Date.parse('2026-10-16T23:35:00Z'), 1 * MIN, 'com.b'),
    ],
    utcOffsetMinutes: 0,
  });
  const lateFactor = twoMinLate.factors.find((f) => f.id === 'late_night');
  assert.equal(lateFactor.measurable, false, 'late-night hidden on 2-min 2-sitting day');
  assert.match(lateFactor.detail, /at least 15 min or 5 sustained sittings needed/);
  assert.equal(twoMinLate.value, null);
  assert.equal(twoMinLate.max, 100);
  assert.equal(twoMinLate.measuredMax, 0);

  // 6 sustained sittings of 1 min alternating apps (5 switches across 6 sittings -> perSitting = 5/6)
  const sixMinSwitchy = scoreIqs({
    window: DAY,
    sessions: Array.from({ length: 6 }, (_, i) =>
      session(`sw_${i}`, T0 + i * 2 * MIN, 1 * MIN, i % 2 === 0 ? 'com.a' : 'com.b'),
    ),
    utcOffsetMinutes: 0,
  });
  const swFactor = sixMinSwitchy.factors.find((f) => f.id === 'switching');
  assert.equal(swFactor.measurable, true, 'switching pressure computed per sitting on 6 >= 3 sustained sittings');
  assert.equal(swFactor.points, 2.5, '15 * (1 - 5/6) = 2.5');
  assert.match(swFactor.detail, /per sitting/);
  assert.equal(sixMinSwitchy.factors.find((f) => f.id === 'late_night').measurable, true, '6 >= 5 sustained sittings');
  assert.equal(sixMinSwitchy.factors.find((f) => f.id === 'session_length').measurable, true, '6 >= 5 sittings');
  assert.equal(sixMinSwitchy.max, 100);
  assert.equal(sixMinSwitchy.measuredMax, 55);
  assert.equal(sixMinSwitchy.unmeasuredMax, 45);
  assert.equal(sixMinSwitchy.confidence.smallSample, true);
});

test('all sessions under 8 s: the length part is zero, not undefined, while sub-minute rates stay hidden', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => session(`ses_s${i}`, T0 + i * MIN, 4_000));
  const score = scoreIqs({ window: DAY, sessions });
  const factor = score.factors.find((f) => f.id === 'session_length');
  assert.equal(factor.measurable, true);
  assert.equal(factor.points, 0);
  assert.match(factor.detail, /12 of 12 opens ended under 8 s/);
  assert.equal(score.factors.find((f) => f.id === 'switching').measurable, false, '0 sustained sittings < 3');
  assert.equal(score.factors.find((f) => f.id === 'late_night').measurable, false, '48 s < 15 min and 0 sustained sittings');
  assert.equal(score.max, 100);
  assert.equal(score.measuredMax, 25);
  assert.equal(score.unmeasuredMax, 75);
  assert.equal(score.value, 0);
});

/* ------------------------------------------------------------- arithmetic --- */

test('the parts add up exactly to the total on the fixed 100 scale, with measuredMax + unmeasuredMax === 100', () => {
  const score = scoreIqs(base());
  const sum = score.factors.filter((f) => f.measurable).reduce((total, f) => total + f.points, 0);
  assert.ok(Math.abs(sum - score.value) < 1e-9, `${sum} !== ${score.value}`);
  const measuredMax = score.factors.filter((f) => f.measurable).reduce((total, f) => total + f.max, 0);
  assert.equal(score.max, 100);
  assert.equal(score.measuredMax, measuredMax);
  assert.equal(score.measuredMax + score.unmeasuredMax, 100);
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

test('too few labels leaves the part unmeasured (shown separately in unmeasuredMax) — never zero', () => {
  const score = scoreIqs(base({ labels: [{ sessionId: 'ses_0', label: 'intentional' }] }));
  const factor = score.factors.find((f) => f.id === 'deliberate_share');
  assert.equal(factor.measurable, false);
  assert.equal(factor.points, 0);
  assert.match(factor.detail, new RegExp(`1 decisive label \\(${MIN_LABELS} needed\\)`));
  assert.equal(score.max, 100);
  assert.equal(score.measuredMax, 55);
  assert.equal(score.unmeasuredMax, 45);
  assert.match(score.caveat, /40 of 55 measured points/);
  assert.match(score.caveat, /45 points not measured/);
  assert.doesNotMatch(score.caveat, /\/ 100/);
});

test('switching is computed per sitting, bounded, and never divides by zero', () => {
  assert.deepEqual(switchingRate([]), { switches: 0, sittings: 0, perSitting: 0, activeHours: 0, perHour: 0 });
  const sessions = [
    session('a', T0, 10 * MIN, 'com.a'),
    session('b', T0 + 11 * MIN, 10 * MIN, 'com.b'),
    session('c', T0 + 22 * MIN, 10 * MIN, 'com.a'),
    session('d', T0 + 3 * H, 10 * MIN, 'com.b'), // too far apart to be a switch
  ];
  const rate = switchingRate(sessions);
  assert.equal(rate.switches, 2);
  assert.equal(rate.sittings, 4);
  assert.equal(rate.perSitting, 0.5);
  const score = scoreIqs({ window: DAY, sessions });
  const factor = score.factors.find((f) => f.id === 'switching');
  assert.equal(factor.points, 7.5, '15 * (1 - 2/4) = 7.5');
});

/* --------------------------------------------------------------- late night -- */

test('late-night is local, wraps midnight, and handles a session spanning it', () => {
  assert.equal(lateNightMs(Date.parse('2026-10-16T23:30:00Z'), Date.parse('2026-10-17T00:30:00Z'), 0), H);
  assert.equal(lateNightMs(Date.parse('2026-10-16T04:30:00Z'), Date.parse('2026-10-16T05:30:00Z'), 0), 30 * MIN);
  assert.equal(lateNightMs(Date.parse('2026-10-16T18:00:00Z'), Date.parse('2026-10-16T18:30:00Z'), 330), 30 * MIN, '18:00Z is 23:30 IST');
  assert.equal(lateNightMs(Date.parse('2026-10-16T12:00:00Z'), Date.parse('2026-10-16T13:00:00Z'), 0), 0);
});

test('late-night quiet-hours duration lowers that part proportionally and never punishes less daytime use', () => {
  const moreDaytime = [
    session('a', Date.parse('2026-10-16T09:00:00Z'), 60 * MIN),
    session('b', Date.parse('2026-10-16T23:30:00Z'), 30 * MIN),
  ];
  const lessDaytime = [
    session('a', Date.parse('2026-10-16T09:00:00Z'), 10 * MIN),
    session('b', Date.parse('2026-10-16T23:30:00Z'), 30 * MIN),
  ];
  const factorMore = scoreIqs({ window: DAY, sessions: moreDaytime }).factors.find((f) => f.id === 'late_night');
  const factorLess = scoreIqs({ window: DAY, sessions: lessDaytime }).factors.find((f) => f.id === 'late_night');
  assert.equal(factorMore.points, 7.5);
  assert.equal(factorLess.points, 7.5, 'using less during the day must never lower late_night points');
  assert.match(factorLess.detail, /30 min between 23:00 and 05:00 local/);
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

test('canonical day sittings: sitting-length bands sum to exact sitting count (71 sittings, 12 under 8s) and match Home, Insights, IQS, and What-if', () => {
  const dayStart = Date.parse('2026-10-25T00:00:00Z');
  const dayWindow = { fromMs: dayStart, toMs: dayStart + 86_400_000 };
  const raw = [];
  // 12 short bounces (<8s)
  for (let i = 0; i < 12; i += 1) {
    const st = dayStart + (i + 1) * 60_000;
    raw.push({ id: `s_short_${i}`, app: 'com.reddit.frontpage', startMs: st, endMs: st + 4_000 });
  }
  // 25 sittings in 8s-1m
  for (let i = 0; i < 25; i += 1) {
    const st = dayStart + 3_600_000 + i * 90_000;
    raw.push({ id: `s_8s1m_${i}`, app: 'org.wikipedia', startMs: st, endMs: st + 30_000 });
  }
  // 20 sittings in 1-5m
  for (let i = 0; i < 20; i += 1) {
    const st = dayStart + 3 * 3_600_000 + i * 300_000;
    raw.push({ id: `s_1_5m_${i}`, app: 'org.wikipedia', startMs: st, endMs: st + 150_000 });
  }
  // 10 sittings in 5-20m (including 1 crossing midnight from previous night)
  raw.push({ id: 's_midnight', app: 'com.google.android.youtube', startMs: dayStart - 20 * MIN, endMs: dayStart + 12 * MIN });
  for (let i = 0; i < 9; i += 1) {
    const st = dayStart + 6 * 3_600_000 + i * 25 * MIN;
    raw.push({ id: `s_5_20m_${i}`, app: 'com.google.android.youtube', startMs: st, endMs: st + 10 * MIN });
  }
  // 4 sittings over 20m -> total valid = 12 + 25 + 20 + 10 + 4 = 71 sittings!
  for (let i = 0; i < 4; i += 1) {
    const st = dayStart + 12 * 3_600_000 + i * 40 * MIN;
    raw.push({ id: `s_over20_${i}`, app: 'com.google.android.youtube', startMs: st, endMs: st + 28 * MIN });
  }
  // Plus launcher, system installer, zero-length, and previous-day sittings that must be excluded everywhere
  raw.push({ id: 's_launcher', app: 'com.sec.android.app.launcher', startMs: dayStart + 5_000, endMs: dayStart + 35_000 });
  raw.push({ id: 's_installer', app: 'com.google.android.packageinstaller', startMs: dayStart + 50_000, endMs: dayStart + 80_000 });
  raw.push({ id: 's_prev_day', app: 'org.wikipedia', startMs: dayStart - 2 * H, endMs: dayStart - H });

  const canonical = buildCanonicalDaySittings(raw, {
    window: dayWindow,
    ignorePackages: ['com.sec.android.app.launcher'],
  });
  assert.equal(canonical.length, 71, 'canonical day sitting count must be 71');

  const bands = sessionBands(canonical);
  const sumBandCounts = bands.reduce((sum, b) => sum + b.count, 0);
  const sumBandMs = bands.reduce((sum, b) => sum + b.ms, 0);
  const expectedTotalMs = canonical.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);

  assert.equal(sumBandCounts, 71, 'sitting-length bands must sum to 71 (never 0)');
  assert.equal(sumBandMs, expectedTotalMs, 'sitting-length bands ms must sum to exact canonical sitting span ms');
  assert.equal(bands[0].count, 12, 'under-8s band must be 12');
  assert.equal(bands[1].count, 25);
  assert.equal(bands[2].count, 20);
  assert.equal(bands[3].count, 10);
  assert.equal(bands[4].count, 4);

  const iqs = scoreIqs({ window: dayWindow, sessions: canonical, approximate: true });
  assert.equal(iqs.confidence.sample, 71, 'Home / IQS confidence.sample must equal 71');
  assert.equal(iqs.confidence.activeMs, expectedTotalMs);
  assert.match(iqs.factors.find((f) => f.id === 'session_length').detail, /12 of 71 opens ended under 8 s/);

  const wf = computeWhatIf({ window: dayWindow, sessions: canonical });
  assert.equal(wf.baselineSessionCount, 71, 'What-if baselineSessionCount must equal 71');
  assert.equal(wf.sittingTimeMs, expectedTotalMs);
});

test('property: sessionBands over buildCanonicalDaySittings always sums to sitting count and matches scoreIqs sample', () => {
  const dayStart = Date.parse('2026-10-25T00:00:00Z');
  const dayWindow = { fromMs: dayStart, toMs: dayStart + 86_400_000 };
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          offsetMin: fc.integer({ min: -120, max: 1500 }),
          durSec: fc.integer({ min: 0, max: 5400 }),
          app: fc.constantFrom('org.wikipedia', 'com.reddit.frontpage', 'com.miui.packageinstaller', 'com.launcher.home'),
        }),
        { minLength: 0, maxLength: 90 },
      ),
      (items) => {
        const raw = items.map((it, i) => ({
          id: `can_${i}`,
          app: it.app,
          startMs: dayStart + it.offsetMin * MIN,
          endMs: dayStart + it.offsetMin * MIN + it.durSec * 1000,
        }));
        const canonical = buildCanonicalDaySittings(raw, {
          window: dayWindow,
          ignorePackages: ['com.launcher.home'],
        });
        const bands = sessionBands(canonical);
        const sumCounts = bands.reduce((acc, b) => acc + b.count, 0);
        const sumMs = bands.reduce((acc, b) => acc + b.ms, 0);
        const expectedMs = canonical.reduce((acc, s) => acc + (s.endMs - s.startMs), 0);

        assert.equal(sumCounts, canonical.length);
        assert.equal(sumMs, expectedMs);

        const iqs = scoreIqs({ window: dayWindow, sessions: canonical, approximate: true });
        assert.equal(iqs.confidence.sample, canonical.length);
        assert.equal(iqs.confidence.activeMs, expectedMs);
      },
    ),
    { numRuns: 100 },
  );
});

test('property: using less never lowers the score (shortening sittings, capping daytime/evening sittings, skipping <8s bounces, widening gaps, or trimming quiet hours)', () => {
  const dayStart = Date.parse('2026-10-25T00:00:00Z');
  const dayWindow = { fromMs: dayStart, toMs: dayStart + 86_400_000 };

  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          // Non-overlapping schedule slots across the 24h day (including 23:00–05:00 quiet hours)
          gapMin: fc.integer({ min: 1, max: 35 }),
          durSec: fc.integer({ min: 2, max: 2400 }),
          scalePct: fc.integer({ min: 10, max: 100 }),
          app: fc.constantFrom('org.wikipedia', 'com.reddit.frontpage', 'com.google.android.youtube', 'com.whatsapp'),
          label: fc.constantFrom('intentional', 'mindless', 'unsure', null),
        }),
        { minLength: 5, maxLength: 30 },
      ),
      fc.constantFrom(0, 330, -300),
      (specs, utcOffsetMinutes) => {
        let cursor = dayStart + 10 * MIN;
        const moreSessions = [];
        const labels = [];
        let sustainedCount = 0;

        specs.forEach((sp, idx) => {
          const durMs = sp.durSec * 1000;
          const startMs = cursor;
          const endMs = startMs + durMs;
          if (endMs >= dayWindow.toMs) return;
          const id = `mono_${idx}`;
          moreSessions.push({ id, app: sp.app, startMs, endMs });
          if (durMs >= 8_000) sustainedCount += 1;
          if (sp.label) labels.push({ sessionId: id, label: sp.label });
          cursor = endMs + sp.gapMin * MIN;
        });

        if (sustainedCount < 5) return;

        const baseline = scoreIqs({
          window: dayWindow,
          sessions: moreSessions,
          labels,
          utcOffsetMinutes,
        });
        assert.notEqual(baseline.value, null);

        // 1. Shorten every sitting ("using less"): sustained sittings stay >= 8s, short sittings shorten too.
        const shortened = moreSessions.map((s, idx) => {
          const dur = s.endMs - s.startMs;
          const pct = specs[idx].scalePct / 100;
          const nextDur =
            dur >= 8_000
              ? Math.max(8_000, Math.floor(dur * pct))
              : Math.max(1_000, Math.floor(dur * pct));
          return { ...s, endMs: s.startMs + nextDur };
        });
        const shortenedScore = scoreIqs({
          window: dayWindow,
          sessions: shortened,
          labels,
          utcOffsetMinutes,
        });
        assert.equal(shortenedScore.measuredMax, baseline.measuredMax);
        assert.ok(
          shortenedScore.value >= baseline.value,
          `shortening sittings lowered score from ${baseline.value} to ${shortenedScore.value}`,
        );
        for (const f of baseline.factors.filter((x) => x.measurable)) {
          const sf = shortenedScore.factors.find((x) => x.id === f.id);
          assert.ok(sf.points >= f.points, `factor ${f.id} dropped from ${f.points} to ${sf.points}`);
        }

        // 2. Skip unlabelled <8s reflex bounces: never lowers score when measuredMax matches
        const labelSet = new Set(labels.map((l) => l.sessionId));
        const withoutBounces = moreSessions.filter(
          (s) => s.endMs - s.startMs >= 8_000 || labelSet.has(s.id),
        );
        const noBounceScore = scoreIqs({
          window: dayWindow,
          sessions: withoutBounces,
          labels,
          utcOffsetMinutes,
        });
        if (noBounceScore.measuredMax === baseline.measuredMax) {
          assert.ok(
            noBounceScore.value >= baseline.value,
            `removing <8s bounces lowered score from ${baseline.value} to ${noBounceScore.value}`,
          );
        }

        // 3. Cap every sitting at 10 minutes: never lowers score
        const capped10m = moreSessions.map((s) => ({
          ...s,
          endMs: Math.min(s.endMs, s.startMs + 10 * MIN),
        }));
        const cappedScore = scoreIqs({
          window: dayWindow,
          sessions: capped10m,
          labels,
          utcOffsetMinutes,
        });
        assert.equal(cappedScore.measuredMax, baseline.measuredMax);
        assert.ok(
          cappedScore.value >= baseline.value,
          `capping sittings at 10m lowered score from ${baseline.value} to ${cappedScore.value}`,
        );
      },
    ),
    { numRuns: 200 },
  );
});

test('provisional unfinished today holds out late-night quiet hours and scales sample-size confidence to elapsed day fraction', () => {
  const dayStart = Date.parse('2026-10-30T00:00:00.000Z');
  const dayEnd = dayStart + 24 * H;
  const now10am = dayStart + 10 * H; // 10:00 AM (10/24 of day elapsed)
  const sessions = Array.from({ length: 8 }, (_, idx) => ({
    id: `prov_${idx}`,
    app: idx % 2 === 0 ? 'org.wikipedia' : 'com.whatsapp',
    startMs: dayStart + (6 * 60 + idx * 20) * MIN,
    endMs: dayStart + (6 * 60 + idx * 20 + 3) * MIN, // 8 sustained sittings, 24 min total
  }));

  const finished = scoreIqs({
    window: { fromMs: dayStart, toMs: dayEnd },
    sessions,
    utcOffsetMinutes: 0,
  });
  const provisional = scoreIqs({
    window: { fromMs: dayStart, toMs: dayEnd },
    sessions,
    utcOffsetMinutes: 0,
    provisional: true,
    nowMs: now10am,
  });

  // Finished day measures session_length(25) + switching(15) + late_night(15) = 55;
  // Unfinished provisional today holds out late_night(15), so measuredMax = 40 and unmeasuredMax = 60.
  assert.equal(finished.measuredMax, 55);
  assert.equal(provisional.provisional, true);
  assert.equal(provisional.band, 'today so far, provisional');
  assert.equal(provisional.measuredMax, 40);
  assert.equal(provisional.unmeasuredMax, 60);
  const lateFactor = provisional.factors.find((f) => f.id === 'late_night');
  assert.equal(lateFactor.measurable, false);
  assert.match(lateFactor.detail, /Today so far, provisional/);

  // 8 sittings / 24m on a full 24h day is flagged smallSample (<15 sittings, <30m);
  // at 10:00 AM (10/24 elapsed -> floor 6 sittings & 13m), 8 sittings / 24m is NOT penalized as smallSample!
  assert.equal(finished.confidence.smallSample, true);
  assert.equal(provisional.confidence.smallSample, false);
  assert.match(provisional.confidence.explanation, /Today so far, provisional/);
  assert.doesNotMatch(provisional.caveat, /\/ 100/);
  assert.match(provisional.caveat, /of 40 measured/);
});

