/**
 * packages/core-analytics/tests/p44b-fixes.test.mjs
 *
 * Pre-release fixes after P4.4b device testing:
 *   - Caller-ID and dialer apps never form Rabbit Hole clusters (Truecaller reported
 *     as 7 returns / 5m 56s). A control app with the same pattern still does, so the
 *     test proves the pattern is detectable and only the exclusion removes it.
 *   - App rules count toward Deliberate share only under the rule gate: one rule label
 *     per app per local day, and only when rule labels come from >= 3 different apps
 *     in the same window. Own sitting labels are never gated.
 *   - Deliberate share text says when labels are based on the user's rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'p44b-fixes-core.mjs'),
});
const {
  computeRabbitHoles,
  countExplicitLabels,
  scoreIqs,
  ruleBasedNote,
  resolveIntentLabels,
  toIntentLabelList,
  RULE_MIN_APPS,
  CALLER_ID_DIALER_PACKAGES,
  LABELING_EXCLUDED_PACKAGES,
  SHARED_EXCLUDED_PACKAGES,
  isLabelingExcludedApp,
} = core;

const MIN = 60_000;
const DAY = 86_400_000;
const D0 = Date.parse('2026-11-01T10:00:00.000Z');

/* ------------------------------------------------ 4. caller-ID / dialer exclusion */

// Six 6-minute opens with 2-minute gaps on each of four days: a rabbit-hole pattern.
function returnsPattern(app, days = 4) {
  const out = [];
  for (let d = 0; d < days; d += 1) {
    const dayStart = D0 + d * DAY;
    for (let k = 0; k < 6; k += 1) {
      const start = dayStart + k * 8 * MIN;
      out.push({ id: `${app}_${d}_${k}`, app, startMs: start, endMs: start + 6 * MIN });
    }
  }
  return out;
}

test('rabbit hole: the same return pattern is detected for an ordinary app (control)', () => {
  const res = computeRabbitHoles({ sessions: returnsPattern('com.reddit.frontpage'), utcOffsetMinutes: 0 });
  assert.ok(res.clusterCount > 0, 'control pattern must be detectable, or the exclusion test proves nothing');
});

test('rabbit hole: Truecaller is excluded (7 returns, same pattern, no cluster)', () => {
  const res = computeRabbitHoles({ sessions: returnsPattern('com.truecaller'), utcOffsetMinutes: 0 });
  assert.equal(res.clusterCount, 0);
  assert.deepEqual(res.clusters, []);
});

test('rabbit hole: Google Phone, Samsung Phone, and MIUI dialer are excluded', () => {
  for (const app of ['com.google.android.dialer', 'com.samsung.android.dialer', 'com.android.dialer']) {
    const res = computeRabbitHoles({ sessions: returnsPattern(app), utcOffsetMinutes: 0 });
    assert.equal(res.clusterCount, 0, `${app} must not form a rabbit hole`);
  }
});

test('rabbit hole: caller-ID list is in the labeling-excluded list and not in totals exclusions', () => {
  for (const app of ['com.truecaller', 'com.google.android.dialer', 'com.samsung.android.dialer', 'com.android.dialer']) {
    assert.ok(CALLER_ID_DIALER_PACKAGES.includes(app), app);
    assert.ok(LABELING_EXCLUDED_PACKAGES.includes(app), app);
    assert.equal(isLabelingExcludedApp(app), true, app);
    // Phone time still counts in totals and Digital Wellbeing matching.
    assert.equal(SHARED_EXCLUDED_PACKAGES.includes(app), false, `${app} must not be in SHARED_EXCLUDED_PACKAGES`);
  }
});

/* ------------------------------------------------------------ 5. rule gate */

const sitting = (id, app, dayOffset, minuteOffset = 0) => ({
  id,
  app,
  startMs: D0 + dayOffset * DAY + minuteOffset * MIN,
  endMs: D0 + dayOffset * DAY + minuteOffset * MIN + 3 * MIN,
});
const ruleLabel = (id, label) => ({ sessionId: id, label, source: 'rule' });
const sittingLabel = (id, label) => ({ sessionId: id, label, source: 'sitting' });
const window = { fromMs: D0 - DAY, toMs: D0 + 10 * DAY };

test('rule gate: rule labels from one app never count, however many sittings', () => {
  const sessions = [];
  const labels = [];
  for (let d = 0; d < 3; d += 1) {
    for (let k = 0; k < 4; k += 1) {
      const s = sitting(`yt_${d}_${k}`, 'com.google.android.youtube', d, k * 10);
      sessions.push(s);
      labels.push(ruleLabel(s.id, 'mindless'));
    }
  }
  const c = countExplicitLabels(sessions, labels, { window, utcOffsetMinutes: 0 });
  assert.equal(c.decisive, 0, 'one app must not unlock Deliberate share');
  assert.equal(c.mindless, 0);
  assert.equal(c.ruleBased.counted, false);
  assert.equal(c.ruleBased.apps, 1);
  assert.equal(c.ruleBased.groups, 3, 'one group per app per day');
});

test('rule gate: rule labels count once they come from at least 3 different apps', () => {
  assert.equal(RULE_MIN_APPS, 3);
  const apps = ['app.one', 'app.two', 'app.three'];
  const sessions = apps.map((app, i) => sitting(`s_${i}`, app, 0, i * 10));
  const labels = sessions.map((s) => ruleLabel(s.id, 'intentional'));
  const c = countExplicitLabels(sessions, labels, { window, utcOffsetMinutes: 0 });
  assert.equal(c.ruleBased.counted, true);
  assert.equal(c.intentional, 3);
  assert.equal(c.decisive, 3);
});

test('rule gate: one rule label per app per local day, however many sittings that day', () => {
  // Three apps, but app.one has 5 sittings on day 0: that is one rule label, not five.
  const sessions = [
    ...[0, 1, 2, 3, 4].map((k) => sitting(`one_${k}`, 'app.one', 0, k * 10)),
    sitting('two_0', 'app.two', 0, 0),
    sitting('three_0', 'app.three', 0, 0),
  ];
  const labels = sessions.map((s) => ruleLabel(s.id, 'mindless'));
  const c = countExplicitLabels(sessions, labels, { window, utcOffsetMinutes: 0 });
  assert.equal(c.ruleBased.groups, 3);
  assert.equal(c.mindless, 3, 'three groups counted, not seven sittings');
});

test('rule gate: the user\u2019s own sitting labels are never gated', () => {
  const sessions = [sitting('own_1', 'app.own', 0), sitting('own_2', 'app.own', 0, 20)];
  const labels = [sittingLabel('own_1', 'intentional'), sittingLabel('own_2', 'mindless')];
  const c = countExplicitLabels(sessions, labels, { window, utcOffsetMinutes: 0 });
  assert.equal(c.decisive, 2);
  assert.equal(c.ruleBased, undefined, 'ruleBased is absent when no rule labels exist');
  assert.equal(ruleBasedNote(c), null, 'no rule note when no rule labels exist');
});

test('rule gate: own labels and gated rule labels combine in one shared count', () => {
  const rules = [sitting('r_a', 'app.a', 0), sitting('r_b', 'app.b', 0), sitting('r_c', 'app.c', 0)];
  const own = [sitting('own_x', 'app.x', 0, 30)];
  const sessions = [...rules, ...own];
  const labels = [
    ruleLabel('r_a', 'intentional'),
    ruleLabel('r_b', 'intentional'),
    ruleLabel('r_c', 'mindless'),
    sittingLabel('own_x', 'intentional'),
  ];
  const c = countExplicitLabels(sessions, labels, { window, utcOffsetMinutes: 0 });
  assert.equal(c.intentional, 3);
  assert.equal(c.mindless, 1);
  assert.equal(c.decisive, 4);
});

test('rule gate: the day boundary uses the local offset, so one day is one group', () => {
  // 23:30 and 00:30 local (UTC+05:30) fall on different local days, so they are two groups.
  const offset = 330;
  const localMidnightUtc = Date.parse('2026-11-01T18:30:00.000Z'); // 00:00 IST on 2 Nov
  const sessions = [
    { id: 'late', app: 'app.one', startMs: localMidnightUtc - 30 * MIN, endMs: localMidnightUtc - 27 * MIN },
    { id: 'early', app: 'app.one', startMs: localMidnightUtc + 30 * MIN, endMs: localMidnightUtc + 33 * MIN },
  ];
  const labels = sessions.map((s) => ruleLabel(s.id, 'mindless'));
  const c = countExplicitLabels(sessions, labels, { window, utcOffsetMinutes: offset });
  assert.equal(c.ruleBased.groups, 2);
});

test('rule gate: resolveIntentLabels output keeps rule and sitting sources apart', () => {
  const sessions = [
    { id: 'a1', app: 'app.a' },
    { id: 'a2', app: 'app.a' },
    { id: 'b1', app: 'app.b' },
  ];
  const r = resolveIntentLabels({
    sessions,
    sittingLabels: { a2: 'unsure' },
    rules: { 'app.a': { label: 'intentional', setAtMs: 1 } },
  });
  const list = toIntentLabelList(r);
  const bySession = Object.fromEntries(list.map((e) => [e.sessionId, e]));
  assert.equal(bySession.a1.source, 'rule');
  assert.equal(bySession.a2.source, 'sitting', 'own unsure label is a sitting label, never a rule');
  assert.equal(bySession.a2.label, 'unsure');
  assert.equal(bySession.b1, undefined, 'unset app gets no label');
});

test('rule gate: Deliberate share detail says when labels are based on the user\u2019s rules', () => {
  // Five own intentional labels reach the unlock; a rule from one app is shown but not counted.
  const own = [0, 1, 2, 3, 4].map((k) => sitting(`own_${k}`, `app.own${k}`, 0, k * 10));
  const ruleSess = [sitting('rule_1', 'app.rule', 1), sitting('rule_2', 'app.rule', 1, 10)];
  const sessions = [...own, ...ruleSess];
  const labels = [
    ...own.map((s) => sittingLabel(s.id, 'intentional')),
    ...ruleSess.map((s) => ruleLabel(s.id, 'mindless')),
  ];
  const score = scoreIqs({
    window: { fromMs: D0 - DAY, toMs: D0 + 2 * DAY },
    sessions,
    labels,
    utcOffsetMinutes: 0,
    approximate: true,
  });
  const factor = score.factors.find((f) => f.id === 'deliberate_share');
  assert.ok(factor, 'deliberate share factor exists');
  assert.match(factor.detail, /Based on your rules: 1 app so far/);
  assert.match(factor.detail, /count once 3 different apps/);
  // The rule label did not change the Deliberate share numbers.
  assert.match(factor.detail, /5 of 5 labelled sittings were marked intentional/);
});

test('rule gate: notes stay neutral and never guess intent', () => {
  const none = ruleBasedNote(undefined);
  assert.equal(none, null);
  const notCounted = ruleBasedNote({
    intentional: 0, mindless: 0, unsure: 0, decisive: 0, total: 0,
    ruleBased: { groups: 2, apps: 1, intentional: 0, mindless: 2, counted: false },
  });
  const counted = ruleBasedNote({
    intentional: 3, mindless: 0, unsure: 0, decisive: 3, total: 3,
    ruleBased: { groups: 3, apps: 3, intentional: 3, mindless: 0, counted: true },
  });
  const guilt = /\b(streak|shame|guilt|fail|failed|warning|danger|exceeded|over budget|addicted|probably|likely|guess)\b/i;
  assert.equal(guilt.test(notCounted), false, notCounted);
  assert.equal(guilt.test(counted), false, counted);
  assert.match(counted, /based on your rules/);
});
