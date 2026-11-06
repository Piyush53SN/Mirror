/**
 * J25 Intent Check (P4.4c): a single, optional, one-tap question about
 * one recent sitting. Pure policy only; no I/O. The runtime loads inputs, calls
 * `decideIntentCheck`, persists `nextState`, and posts the notification.
 *
 * Rules (all Tier D, no guilt copy, no overlays):
 *   - Off by default (the caller passes `enabled`).
 *   - Quiet hours: J25 names no window of its own, so this uses the shared reminder
 *     quiet hours (default 23:00-05:00, configurable in Settings).
 *   - Eligible sitting: ended on today's local day, longer than 5 minutes, already
 *     settled (the 15 min merge window has passed, so the sitting id will not change
 *     after the prompt), not labeled yet, not covered by a user app rule, not an
 *     excluded app, and not prompted before.
 *   - At most one prompt per local day. Never inside quiet hours.
 *   - A prompt whose local day ended with no answer counts as ignored. After
 *     `INTENT_CHECK_IGNORE_LIMIT` ignored prompts in a row, prompting pauses and a
 *     single in-app notice is queued. Turning the feature off and on resumes it.
 *   - Answering (or any label on the pending sitting) resets the ignored counter.
 *   - Nothing here writes a label. The decision only says which sitting to ask about.
 */
import { isInQuietHoursLocal, localClockAt, type QuietHoursRange } from './reminders';
import { NIGHT_WINDOW } from '@mirror/shared-types';

/** Notification id for the Intent Check prompt (distinct from the weekly reminder 4301). */
export const INTENT_CHECK_NOTIFICATION_ID = 4401;
/** Neutral notification copy: no app name on the lock screen, no guilt, no sound. */
export const INTENT_CHECK_NOTIFICATION_TITLE = 'Mirror';
export const INTENT_CHECK_NOTIFICATION_BODY =
  'One quick check on a recent sitting. Open Mirror to answer. Nothing is saved until you tap.';
/** A sitting must be longer than this to be asked about (strictly greater). */
export const INTENT_CHECK_MIN_SITTING_MS = 5 * 60_000;
/** Wait for the sitting merge window to pass so the sitting id is final. */
export const INTENT_CHECK_SETTLE_MS = 15 * 60_000;
/** Consecutive ignored prompts before prompting pauses. */
export const INTENT_CHECK_IGNORE_LIMIT = 3;
/** Bound on remembered prompted sitting ids (oldest dropped first). */
export const INTENT_CHECK_PROMPTED_MAX = 50;

export type IntentCheckPrefs = {
  /** Off by default. Turning it on requests nothing by itself; the UI handles permission. */
  enabled: boolean;
  /** True after `INTENT_CHECK_IGNORE_LIMIT` ignored prompts in a row. Cleared on re-enable. */
  pausedAfterIgnored: boolean;
  updatedAtMs: number;
};

export type IntentCheckPending = {
  sessionId: string;
  app: string;
  durationMs: number;
  endMs: number;
  /** Local day key (`YYYY-MM-DD`) on which the prompt was issued. */
  day: string;
  issuedAtMs: number;
};

export type IntentCheckState = {
  pending: IntentCheckPending | null;
  lastPromptDay: string | null;
  consecutiveIgnored: number;
  promptedSessionIds: string[];
  /** One-time in-app notice shown after a pause. Cleared when acknowledged. */
  pauseNoticePending: boolean;
  updatedAtMs: number;
};

export const DEFAULT_INTENT_CHECK_PREFS: IntentCheckPrefs = {
  enabled: false,
  pausedAfterIgnored: false,
  updatedAtMs: 0,
};

export const DEFAULT_INTENT_CHECK_STATE: IntentCheckState = {
  pending: null,
  lastPromptDay: null,
  consecutiveIgnored: 0,
  promptedSessionIds: [],
  pauseNoticePending: false,
  updatedAtMs: 0,
};

export type IntentCheckSitting = {
  sessionId: string;
  app: string;
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type IntentCheckDecisionInput = {
  nowMs: number;
  utcOffsetMinutes: number;
  prefs: IntentCheckPrefs;
  state: IntentCheckState;
  /** Sittings already filtered for excluded apps by the caller. */
  sittings: readonly IntentCheckSitting[];
  /** Session ids that already have a per-sitting label. */
  labeledSessionIds: ReadonlySet<string>;
  /** Packages covered by a user app rule (never asked about). */
  ruledApps?: ReadonlySet<string>;
  quietHours?: QuietHoursRange;
};

export type IntentCheckReason =
  | 'disabled'
  | 'paused'
  | 'paused_after_ignored'
  | 'quiet_hours'
  | 'already_prompted_today'
  | 'no_eligible_sitting'
  | 'prompt';

export type IntentCheckDecision = {
  /** Non-null only when the caller should post the prompt now. */
  prompt: IntentCheckPending | null;
  reason: IntentCheckReason;
  /** True only on the decision that pauses prompting. */
  pausedNow: boolean;
  /** Always the state the caller should persist (may equal the input state). */
  nextState: IntentCheckState;
};

/** Pure copy of the state with the cap applied. */
function withPromptedId(ids: readonly string[], id: string): string[] {
  const next = ids.filter((x) => x !== id);
  next.push(id);
  return next.slice(-INTENT_CHECK_PROMPTED_MAX);
}

export function decideIntentCheck(input: IntentCheckDecisionInput): IntentCheckDecision {
  const { nowMs, utcOffsetMinutes, prefs, labeledSessionIds } = input;
  const quietHours = input.quietHours ?? NIGHT_WINDOW;
  const today = localClockAt(nowMs, utcOffsetMinutes).dayKey;

  let state: IntentCheckState = { ...input.state, promptedSessionIds: [...input.state.promptedSessionIds] };
  let changed = false;

  // 1. Resolve the pending prompt: answered (any label on it) or ignored (its day ended).
  if (state.pending) {
    if (labeledSessionIds.has(state.pending.sessionId)) {
      state = { ...state, pending: null, consecutiveIgnored: 0, updatedAtMs: nowMs };
      changed = true;
    } else if (state.pending.day < today) {
      state = {
        ...state,
        pending: null,
        consecutiveIgnored: state.consecutiveIgnored + 1,
        updatedAtMs: nowMs,
      };
      changed = true;
    }
  }

  const finish = (
    reason: IntentCheckReason,
    prompt: IntentCheckPending | null = null,
    pausedNow = false,
  ): IntentCheckDecision => ({
    prompt,
    reason,
    pausedNow,
    nextState: changed ? state : input.state,
  });

  if (!prefs.enabled) {
    // Turning off clears any pending prompt so nothing lingers on Home.
    if (state.pending) {
      state = { ...state, pending: null, updatedAtMs: nowMs };
      changed = true;
    }
    return finish('disabled');
  }

  // 2. Pause after too many ignored prompts in a row (one notice, then silence).
  if (state.consecutiveIgnored >= INTENT_CHECK_IGNORE_LIMIT) {
    if (!prefs.pausedAfterIgnored) {
      state = { ...state, pending: null, pauseNoticePending: true, updatedAtMs: nowMs };
      changed = true;
      return finish('paused_after_ignored', null, true);
    }
    return finish('paused');
  }
  if (prefs.pausedAfterIgnored) return finish('paused');

  // 3. Quiet hours and the daily cap.
  if (isInQuietHoursLocal(nowMs, utcOffsetMinutes, quietHours)) return finish('quiet_hours');
  if (state.lastPromptDay === today) return finish('already_prompted_today');

  // 4. Choose the most recent eligible sitting.
  const prompted = new Set(state.promptedSessionIds);
  const ruled = input.ruledApps ?? new Set<string>();
  let best: IntentCheckSitting | null = null;
  for (const s of input.sittings) {
    if (s.durationMs <= INTENT_CHECK_MIN_SITTING_MS) continue;
    if (s.endMs > nowMs - INTENT_CHECK_SETTLE_MS) continue;
    if (localClockAt(s.endMs, utcOffsetMinutes).dayKey !== today) continue;
    if (labeledSessionIds.has(s.sessionId)) continue;
    if (prompted.has(s.sessionId)) continue;
    if (ruled.has(s.app)) continue;
    if (!best || s.endMs > best.endMs) best = s;
  }
  if (!best) return finish('no_eligible_sitting');

  // 5. Issue the prompt. This only records the question; no label is written.
  const prompt: IntentCheckPending = {
    sessionId: best.sessionId,
    app: best.app,
    durationMs: best.durationMs,
    endMs: best.endMs,
    day: today,
    issuedAtMs: nowMs,
  };
  state = {
    ...state,
    pending: prompt,
    lastPromptDay: today,
    promptedSessionIds: withPromptedId(state.promptedSessionIds, best.sessionId),
    updatedAtMs: nowMs,
  };
  changed = true;
  return finish('prompt', prompt);
}

/** Apply a user answer (or the runtime's pause-notice acknowledgement) to the state. */
export function answerIntentCheckState(state: IntentCheckState, nowMs: number): IntentCheckState {
  return { ...state, pending: null, consecutiveIgnored: 0, updatedAtMs: nowMs };
}

/** Turning Intent Check on again resumes prompting with a clean counter. */
export function resetIntentCheckOnEnable(state: IntentCheckState, nowMs: number): IntentCheckState {
  return { ...state, pending: null, consecutiveIgnored: 0, pauseNoticePending: false, updatedAtMs: nowMs };
}
