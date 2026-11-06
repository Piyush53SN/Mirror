/**
 * packages/core-analytics/tests/intent-check.test.mjs
 *
 * J25 Intent Check policy (P4.4c). Covers:
 *   - off by default, nothing asked when disabled
 *   - eligibility: >5 min (strict), today's local day, settled, unlabeled, not ruled, not repeated
 *   - one prompt per local day; quiet hours respected
 *   - ignored prompts count once their day ends; 3 in a row pauses with one notice
 *   - an answer (any label on the pending sitting) resets the counter
 *   - the decision never writes a label (only the state it returns)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const core = await bundleTs(join(ROOT, 'packages/core-analytics/src/index.ts'), {
  outfile: join(HERE, '.build', 'intent-check-core.mjs'),
});
const {
  decideIntentCheck,
  answerIntentCheckState,
  resetIntentCheckOnEnable,
  DEFAULT_INTENT_CHECK_PREFS,
  DEFAULT_INTENT_CHECK_STATE,
  INTENT_CHECK_IGNORE_LIMIT,
  INTENT_CHECK_MIN_SITTING_MS,
  INTENT_CHECK_NOTIFICATION_ID,
  INTENT_CHECK_PROMPTED_MAX,
} = core;

const IST = 330; // Asia/Calcutta, no DST
/** 2026-11-06 12:00 local (IST). */
const NOON = Date.parse('2026-11-06T06:30:00Z');
/** 2026-11-06 00:00 local. */
const MIDNIGHT_TODAY = Date.parse('2026-11-05T18:30:00Z');
const MIN = 60_000;

const ON = { ...DEFAULT_INTENT_CHECK_PREFS, enabled: true };

function sitting(sessionId, app, endMs, durationMs = 8 * MIN) {
  return { sessionId, app, startMs: endMs - durationMs, endMs, durationMs };
}
/** A sitting that ended at 10:00 local today, settled by noon. */
const TEN_AM = Date.parse('2026-11-06T04:30:00Z');

function run(overrides = {}) {
  return decideIntentCheck({
    nowMs: NOON,
    utcOffsetMinutes: IST,
    prefs: ON,
    state: DEFAULT_INTENT_CHECK_STATE,
    sittings: [sitting('s1', 'com.example.feed', TEN_AM)],
    labeledSessionIds: new Set(),
    ...overrides,
  });
}

test('off by default and never asks when disabled', () => {
  assert.equal(DEFAULT_INTENT_CHECK_PREFS.enabled, false);
  const d = run({ prefs: DEFAULT_INTENT_CHECK_PREFS });
  assert.equal(d.reason, 'disabled');
  assert.equal(d.prompt, null);
  assert.equal(d.nextState.lastPromptDay, null);
});

test('a sitting of exactly 5 minutes is not eligible; just over 5 minutes is', () => {
  assert.equal(INTENT_CHECK_MIN_SITTING_MS, 5 * MIN);
  const exact = run({ sittings: [sitting('s1', 'a', TEN_AM, 5 * MIN)] });
  assert.equal(exact.reason, 'no_eligible_sitting');
  const over = run({ sittings: [sitting('s1', 'a', TEN_AM, 5 * MIN + 1000)] });
  assert.equal(over.reason, 'prompt');
  assert.equal(over.prompt.sessionId, 's1');
});

test('a sitting still inside the 15 min merge window is not asked about yet', () => {
  const justEnded = run({ sittings: [sitting('s1', 'a', NOON - 5 * MIN)] });
  assert.equal(justEnded.reason, 'no_eligible_sitting');
  const settled = run({ sittings: [sitting('s1', 'a', NOON - 16 * MIN)] });
  assert.equal(settled.reason, 'prompt');
});

test('a sitting that ended yesterday is not asked about', () => {
  const yesterday = run({ sittings: [sitting('s1', 'a', MIDNIGHT_TODAY - 2 * MIN)] });
  assert.equal(yesterday.reason, 'no_eligible_sitting');
});

test('picks the most recent eligible sitting; skips labeled, ruled and already-prompted ones', () => {
  const earlier = sitting('old', 'a', TEN_AM - 60 * MIN);
  const later = sitting('new', 'b', TEN_AM);
  const picked = run({ sittings: [earlier, later] });
  assert.equal(picked.prompt.sessionId, 'new');

  const labeled = run({ sittings: [earlier, later], labeledSessionIds: new Set(['new']) });
  assert.equal(labeled.prompt.sessionId, 'old');

  const ruled = run({ sittings: [earlier, later], ruledApps: new Set(['b']) });
  assert.equal(ruled.prompt.sessionId, 'old');

  const prompted = run({
    sittings: [later],
    state: { ...DEFAULT_INTENT_CHECK_STATE, promptedSessionIds: ['new'], lastPromptDay: '2026-11-05' },
  });
  assert.equal(prompted.reason, 'no_eligible_sitting');
});

test('at most one prompt per local day; the next local day can ask again', () => {
  const first = run();
  assert.equal(first.reason, 'prompt');
  const again = run({
    state: first.nextState,
    sittings: [sitting('s2', 'b', NOON - 30 * MIN)],
  });
  assert.equal(again.reason, 'already_prompted_today');
  assert.equal(again.prompt, null);

  const tomorrowNoon = NOON + 24 * 60 * MIN;
  const next = decideIntentCheck({
    nowMs: tomorrowNoon,
    utcOffsetMinutes: IST,
    prefs: ON,
    state: first.nextState,
    sittings: [sitting('s2', 'b', tomorrowNoon - 60 * MIN)],
    labeledSessionIds: new Set(),
  });
  assert.equal(next.reason, 'prompt');
  assert.equal(next.prompt.sessionId, 's2');
});

test('quiet hours are respected (23:00-05:00 local), and the daytime edge is allowed', () => {
  const lateNight = Date.parse('2026-11-06T18:00:00Z'); // 23:30 IST
  const quiet = run({
    nowMs: lateNight,
    sittings: [sitting('s1', 'a', lateNight - 30 * MIN)],
  });
  assert.equal(quiet.reason, 'quiet_hours');
  assert.equal(quiet.prompt, null);

  const fivePm = Date.parse('2026-11-06T11:30:00Z'); // 17:00 IST
  const ok = run({ nowMs: fivePm, sittings: [sitting('s1', 'a', fivePm - 30 * MIN)] });
  assert.equal(ok.reason, 'prompt');
});

test('a pending prompt whose day ended unanswered counts as ignored, once', () => {
  const issued = run();
  const nextDayNoon = NOON + 24 * 60 * MIN;
  const d1 = decideIntentCheck({
    nowMs: nextDayNoon,
    utcOffsetMinutes: IST,
    prefs: ON,
    state: issued.nextState,
    sittings: [],
    labeledSessionIds: new Set(),
  });
  assert.equal(d1.nextState.consecutiveIgnored, 1);
  assert.equal(d1.nextState.pending, null);
  // Re-running on the same day must not count it again.
  const d2 = decideIntentCheck({
    nowMs: nextDayNoon + MIN,
    utcOffsetMinutes: IST,
    prefs: ON,
    state: d1.nextState,
    sittings: [],
    labeledSessionIds: new Set(),
  });
  assert.equal(d2.nextState.consecutiveIgnored, 1);
});

test('three ignored prompts in a row pause prompting with exactly one notice', () => {
  let state = DEFAULT_INTENT_CHECK_STATE;
  let prefs = ON;
  let pausedNowCount = 0;
  // Day 1..3: prompts issued and never answered.
  for (let day = 0; day < INTENT_CHECK_IGNORE_LIMIT; day += 1) {
    const now = NOON + day * 24 * 60 * MIN;
    const d = decideIntentCheck({
      nowMs: now,
      utcOffsetMinutes: IST,
      prefs,
      state,
      sittings: [sitting(`d${day}`, 'a', now - 30 * MIN)],
      labeledSessionIds: new Set(),
    });
    assert.equal(d.reason, 'prompt', `day ${day} should prompt`);
    state = d.nextState;
  }
  // Day 4: the third prompt is now known to be ignored; prompting pauses.
  const day4 = NOON + INTENT_CHECK_IGNORE_LIMIT * 24 * 60 * MIN;
  const paused = decideIntentCheck({
    nowMs: day4,
    utcOffsetMinutes: IST,
    prefs,
    state,
    sittings: [sitting('d4', 'a', day4 - 30 * MIN)],
    labeledSessionIds: new Set(),
  });
  assert.equal(paused.reason, 'paused_after_ignored');
  assert.equal(paused.pausedNow, true);
  assert.equal(paused.prompt, null);
  assert.equal(paused.nextState.pauseNoticePending, true);
  if (paused.pausedNow) pausedNowCount += 1;

  // The runtime persists the pause; later decisions stay silent with no new notice.
  prefs = { ...prefs, pausedAfterIgnored: true };
  state = { ...paused.nextState, pauseNoticePending: false };
  const later = decideIntentCheck({
    nowMs: day4 + 24 * 60 * MIN,
    utcOffsetMinutes: IST,
    prefs,
    state,
    sittings: [sitting('d5', 'a', day4 + 24 * 60 * MIN - 30 * MIN)],
    labeledSessionIds: new Set(),
  });
  assert.equal(later.reason, 'paused');
  assert.equal(later.pausedNow, false);
  assert.equal(later.nextState.pauseNoticePending, false);
  assert.equal(pausedNowCount, 1);
});

test('answering (or labeling the pending sitting) resets the ignored counter', () => {
  const issued = run();
  const labeledElsewhere = decideIntentCheck({
    nowMs: NOON + 60 * MIN,
    utcOffsetMinutes: IST,
    prefs: ON,
    state: { ...issued.nextState, consecutiveIgnored: 2 },
    sittings: [],
    labeledSessionIds: new Set(['s1']),
  });
  assert.equal(labeledElsewhere.nextState.consecutiveIgnored, 0);
  assert.equal(labeledElsewhere.nextState.pending, null);

  const answered = answerIntentCheckState({ ...issued.nextState, consecutiveIgnored: 2 }, NOON);
  assert.equal(answered.consecutiveIgnored, 0);
  assert.equal(answered.pending, null);
});

test('turning the feature off clears the pending prompt; turning it on resumes cleanly', () => {
  const issued = run();
  const off = decideIntentCheck({
    nowMs: NOON + MIN,
    utcOffsetMinutes: IST,
    prefs: DEFAULT_INTENT_CHECK_PREFS,
    state: issued.nextState,
    sittings: [],
    labeledSessionIds: new Set(),
  });
  assert.equal(off.nextState.pending, null);

  const resumed = resetIntentCheckOnEnable(
    { ...issued.nextState, consecutiveIgnored: 3, pauseNoticePending: true },
    NOON,
  );
  assert.equal(resumed.consecutiveIgnored, 0);
  assert.equal(resumed.pauseNoticePending, false);
  assert.equal(resumed.pending, null);
});

test('the decision never mutates its inputs and never writes labels', () => {
  const state = { ...DEFAULT_INTENT_CHECK_STATE, promptedSessionIds: ['x'] };
  const snapshot = JSON.stringify(state);
  const labeled = new Set(['s9']);
  const d = run({ state, labeledSessionIds: labeled });
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(labeled.size, 1);
  assert.equal(d.reason, 'prompt');
  // The result carries a prompt and state only: there is no label field to write.
  assert.deepEqual(Object.keys(d).sort(), ['nextState', 'pausedNow', 'prompt', 'reason']);
});

test('prompted-id memory is bounded', () => {
  let state = DEFAULT_INTENT_CHECK_STATE;
  for (let i = 0; i < INTENT_CHECK_PROMPTED_MAX + 5; i += 1) {
    state = { ...state, promptedSessionIds: [...state.promptedSessionIds, `id${i}`] };
  }
  const d = run({ state: { ...state, lastPromptDay: null }, sittings: [sitting('fresh', 'a', TEN_AM)] });
  assert.equal(d.reason, 'prompt');
  assert.equal(d.nextState.promptedSessionIds.length, INTENT_CHECK_PROMPTED_MAX);
  assert.equal(d.nextState.promptedSessionIds.at(-1), 'fresh');
});

test('notification id is distinct from the weekly reminder id', () => {
  assert.equal(INTENT_CHECK_NOTIFICATION_ID, 4401);
  assert.notEqual(INTENT_CHECK_NOTIFICATION_ID, 4301);
});
