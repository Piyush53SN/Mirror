/**
 * packages/core-analytics/tests/app-rules.test.mjs
 *
 * P4.4b app rules (Tier D honesty):
 *   - A sitting's own label always wins over an app rule, including `unsure`.
 *   - A rule fills in only unlabeled sittings of its own app, including earlier days.
 *   - Duration, timing and app category never decide a label. Two sittings of the
 *     same app with very different lengths get the same rule label.
 *   - Rules for labeling-excluded apps are ignored even if stored.
 *   - Input objects are never mutated (past labels are never changed).
 *   - Rule-labeled sittings count as the user's explicit labels in the shared counter.
 *   - Coverage copy states what the rule counts, and never guesses or guilt-trips.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const core = await bundleTs(join(ROOT, 'packages/core-analytics/src/index.ts'), {
  outfile: join(HERE, '.build', 'app-rules-core.mjs'),
});
const { resolveIntentLabels, describeRuleCoverage, isAppRuleLabel, countExplicitLabels, LABELING_EXCLUDED_PACKAGES } = core;

const YT = 'com.google.android.youtube';
const WIKI = 'org.wikipedia';
const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.parse('2026-11-01T09:00:00Z');

// Sittings carry only id, app, and times. Durations are set deliberately different
// to prove they never decide a label.
const sittings = [
  { id: 's1', app: YT, startMs: T0, endMs: T0 + 1 * MIN },
  { id: 's2', app: YT, startMs: T0 + 2 * MIN, endMs: T0 + 90 * MIN },
  { id: 's3', app: YT, startMs: T0 - 3 * DAY, endMs: T0 - 3 * DAY + 4 * MIN },
  { id: 's4', app: WIKI, startMs: T0 + 3 * MIN, endMs: T0 + 6 * MIN },
  { id: 's5', app: YT, startMs: T0 + 4 * MIN, endMs: T0 + 5 * MIN },
];

test('app rules: the sitting label wins over the rule, including unsure', () => {
  const rules = { [YT]: { label: 'mindless', setAtMs: T0 } };
  const sittingLabels = { s1: 'intentional', s5: 'unsure' };
  const r = resolveIntentLabels({ sessions: sittings, sittingLabels, rules });
  assert.equal(r.labels.s1, 'intentional', 'own intentional label is kept');
  assert.equal(r.labels.s5, 'unsure', 'own unsure label is kept and is not replaced by the rule');
  assert.equal(r.labels.s2, 'mindless', 'unlabeled sitting of the app takes the rule');
  assert.equal(r.ruleSourceIds.has('s1'), false);
  assert.equal(r.ruleSourceIds.has('s2'), true);
  assert.equal(r.coverage[YT].keptOwnLabels, 2);
  assert.equal(r.coverage[YT].ruleSittings, 2);
});

test('app rules: rule covers only its own app, including earlier days, and never unset apps', () => {
  const rules = { [YT]: { label: 'intentional', setAtMs: T0 } };
  const r = resolveIntentLabels({ sessions: sittings, sittingLabels: {}, rules });
  assert.equal(r.labels.s3, 'intentional', 'earlier-day unlabeled sitting of the same app is covered');
  assert.equal(r.labels.s4, undefined, 'app with no rule stays unlabeled');
  assert.equal(r.ruleSourceIds.has('s4'), false);
  assert.deepEqual(Object.keys(r.labels).sort(), ['s1', 's2', 's3', 's5']);
});

test('app rules: duration never decides the label', () => {
  const rules = { [YT]: { label: 'mindless', setAtMs: T0 } };
  const r = resolveIntentLabels({ sessions: sittings, sittingLabels: {}, rules });
  // s1 is 1 minute and s2 is 88 minutes; both get the same rule label, nothing else.
  assert.equal(r.labels.s1, 'mindless');
  assert.equal(r.labels.s2, 'mindless');
  assert.equal(r.labels.s5, 'mindless');
  // Changing durations changes nothing.
  const longer = sittings.map((s) => ({ ...s, endMs: s.endMs + 500 * MIN }));
  const r2 = resolveIntentLabels({ sessions: longer, sittingLabels: {}, rules });
  assert.deepEqual(r2.labels, r.labels);
});

test('app rules: labeling-excluded apps are ignored even if a rule is stored', () => {
  const excluded = LABELING_EXCLUDED_PACKAGES[0];
  const rules = { [excluded]: { label: 'intentional', setAtMs: T0 } };
  const sessions = [{ id: 'x1', app: excluded, startMs: T0, endMs: T0 + MIN }];
  const r = resolveIntentLabels({ sessions, sittingLabels: {}, rules });
  assert.equal(r.labels.x1, undefined);
  assert.equal(r.coverage[excluded], undefined);
});

test('app rules: inputs are never mutated, so past per-sitting labels are unchanged', () => {
  const rules = { [YT]: { label: 'mindless', setAtMs: T0 } };
  const sittingLabels = Object.freeze({ s1: 'intentional' });
  const sessions = Object.freeze(sittings.map((s) => Object.freeze({ ...s })));
  const before = JSON.stringify({ rules, sittingLabels, sessions });
  const r = resolveIntentLabels({ sessions, sittingLabels, rules });
  assert.equal(JSON.stringify({ rules, sittingLabels, sessions }), before);
  assert.equal(sittingLabels.s1, 'intentional');
  assert.equal(r.labels.s1, 'intentional');
});

test('app rules: rule-labeled sittings count as explicit labels in the shared counter', () => {
  const rules = { [YT]: { label: 'intentional', setAtMs: T0 } };
  const r = resolveIntentLabels({ sessions: sittings, sittingLabels: { s4: 'mindless' }, rules });
  const scored = sittings.map(({ id, app, startMs, endMs }) => ({ id, app, startMs, endMs }));
  const counts = countExplicitLabels(scored, r.labels, { window: { fromMs: T0 - 4 * DAY, toMs: T0 + DAY } });
  // s1, s2, s3, s5 come from the rule (intentional); s4 is the user's own mindless label.
  assert.equal(counts.intentional, 4);
  assert.equal(counts.mindless, 1);
});

test('app rules: rule label validation and copy stay honest and neutral', () => {
  assert.equal(isAppRuleLabel('intentional'), true);
  assert.equal(isAppRuleLabel('mindless'), true);
  assert.equal(isAppRuleLabel('unsure'), false, 'unsure is a sitting label, not a rule');
  assert.equal(isAppRuleLabel(undefined), false);

  const none = describeRuleCoverage(YT, undefined);
  assert.equal(none, `No rule for ${YT}.`);
  const zero = describeRuleCoverage(YT, { label: 'mindless', ruleSittings: 0, keptOwnLabels: 0 });
  assert.match(zero, /No unlabeled sittings of this app yet\./);
  const some = describeRuleCoverage(YT, { label: 'mindless', ruleSittings: 1, keptOwnLabels: 2 });
  assert.match(some, /Counts 1 unlabeled sitting \(including earlier days\) as mindless\./);
  assert.match(some, /2 sittings keep your own label\./);

  const guilt = /\b(streak|shame|guilt|fail|failed|failing|warning|danger|exceeded|over budget|addicted)\b/i;
  for (const text of [none, zero, some]) assert.equal(guilt.test(text), false, text);
  // Never states a guess about intent.
  assert.equal(/\b(probably|likely|seems|guess)\b/i.test(some), false);
});
