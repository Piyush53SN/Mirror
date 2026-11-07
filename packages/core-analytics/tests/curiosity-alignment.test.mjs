// alpha.9 D1: curiositySplit uses the same gate and counts as the Sessions meter and the Insights
// unlock (countExplicitLabels). Sitting labels and gated rule labels count together, one rule label
// per app per local day, and the rule gate applies. This is the one authorised analytics change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'curiosity-alignment-core.mjs'),
});
const { curiositySplit, countExplicitLabels, MIN_LABELS, RULE_MIN_APPS, SHARED_EXCLUDED_PACKAGES } = core;

const MIN = 60_000;
const DAY = 86_400_000;
const D0 = Date.parse('2026-11-01T10:00:00.000Z');
const window = { fromMs: D0 - DAY, toMs: D0 + 10 * DAY };
const sitting = (id, app, dayOffset = 0, minuteOffset = 0, lengthMin = 3) => ({
  id,
  app,
  startMs: D0 + dayOffset * DAY + minuteOffset * MIN,
  endMs: D0 + dayOffset * DAY + minuteOffset * MIN + lengthMin * MIN,
});
const own = (id, label) => ({ sessionId: id, label, source: 'sitting' });
const rule = (id, label) => ({ sessionId: id, label, source: 'rule' });
const opts = { utcOffsetMinutes: 0 };

test('sitting labels only: the split appears at exactly MIN_LABELS labelled sittings', () => {
  assert.equal(MIN_LABELS, 5);
  const sessions = [0, 1, 2, 3].map((i) => sitting(`s${i}`, `app.${i}`, 0, i * 10));
  const four = sessions.map((s) => own(s.id, 'intentional'));
  assert.equal(curiositySplit({ window, sessions, labels: four, utcOffsetMinutes: 0 }), null, 'four labels: no split');
  const more = [...sessions, sitting('s4', 'app.4', 0, 50)];
  const five = [...four, own('s4', 'mindless')];
  const split = curiositySplit({ window, sessions: more, labels: five, utcOffsetMinutes: 0 });
  assert.ok(split, 'five labels: the split shows');
  assert.equal(split.deepMs, 4 * 3 * MIN);
  assert.equal(split.habitMs, 3 * MIN);
});

test('mixed labels, rule gate closed: 3 sitting labels plus rule labels from 2 apps do not unlock the split', () => {
  const sessions = [
    sitting('a1', 'app.a', 0, 0),
    sitting('a2', 'app.a', 0, 10),
    sitting('a3', 'app.a', 0, 20),
    sitting('b1', 'app.b', 0, 30),
    sitting('c1', 'app.c', 0, 40),
  ];
  // Own labels on a1, a2, a3; rule labels on b1 and c1 (only 2 apps, below RULE_MIN_APPS).
  const labels = [own('a1', 'intentional'), own('a2', 'mindless'), own('a3', 'intentional'), rule('b1', 'mindless'), rule('c1', 'intentional')];
  assert.equal(RULE_MIN_APPS, 3);
  const c = countExplicitLabels(sessions, labels, opts);
  assert.equal(c.decisive, 3, 'the meter shows 3 of 5');
  assert.equal(curiositySplit({ window, sessions, labels, utcOffsetMinutes: 0 }), null, 'the split must agree with the meter: not shown');
});

test('mixed labels, rule gate open: 2 sitting labels plus rule labels from 3 apps unlock the split, and the rule time counts', () => {
  const sessions = [
    sitting('a1', 'app.a', 0, 0, 2),
    sitting('a2', 'app.a', 0, 10, 2),
    sitting('b1', 'app.b', 0, 20, 4),
    sitting('c1', 'app.c', 0, 30, 6),
    sitting('d1', 'app.d', 0, 40, 8),
  ];
  const labels = [own('a1', 'intentional'), own('a2', 'mindless'), rule('b1', 'intentional'), rule('c1', 'mindless'), rule('d1', 'intentional')];
  const c = countExplicitLabels(sessions, labels, opts);
  assert.equal(c.ruleBased.counted, true);
  assert.equal(c.decisive, 5, 'two sitting labels and three rule groups');
  const split = curiositySplit({ window, sessions, labels, utcOffsetMinutes: 0 });
  assert.ok(split, 'the split shows when the meter reaches 5');
  // Intentional: a1 (2m) + b1 (4m) + d1 (8m). Mindless: a2 (2m) + c1 (6m).
  assert.equal(split.deepMs, 14 * MIN, 'rule-labelled intentional time counts');
  assert.equal(split.habitMs, 8 * MIN, 'rule-labelled mindless time counts');
  assert.equal(split.unlabeledMs, 0);
  assert.equal(split.labelShare, c.decisive / sessions.length, 'the share uses the meter count');
});

test('one rule label per app per day: a single app\u2019s sittings never unlock on their own', () => {
  const many = [0, 1, 2, 3, 4, 5, 6].map((k) => sitting(`x${k}`, 'app.one', 0, k * 10));
  const labels = many.map((s) => rule(s.id, 'mindless'));
  const c = countExplicitLabels(many, labels, opts);
  assert.equal(c.decisive, 0, 'one app: the rule gate is closed');
  assert.equal(curiositySplit({ window, sessions: many, labels, utcOffsetMinutes: 0 }), null);
});

test('the split and the meter agree on a grid of mixed fixtures', () => {
  for (let own_ = 0; own_ <= 6; own_ += 1) {
    for (let apps = 0; apps <= 4; apps += 1) {
      const sessions = [];
      const labels = [];
      for (let i = 0; i < own_; i += 1) {
        const s = sitting(`o${i}`, `own.${i}`, 0, i * 5);
        sessions.push(s);
        labels.push(own(s.id, i % 2 ? 'mindless' : 'intentional'));
      }
      for (let a = 0; a < apps; a += 1) {
        const s = sitting(`r${a}`, `rule.${a}`, 0, 200 + a * 5);
        sessions.push(s);
        labels.push(rule(s.id, 'intentional'));
      }
      const meter = countExplicitLabels(sessions, labels, opts).decisive;
      const shown = curiositySplit({ window, sessions, labels, utcOffsetMinutes: 0 }) !== null;
      assert.equal(shown, meter >= MIN_LABELS, `own=${own_} apps=${apps}: meter ${meter}`);
    }
  }
});

test('ignored packages are never labelled in the split (the same list as the meter)', () => {
  const launcher = SHARED_EXCLUDED_PACKAGES[0];
  assert.ok(launcher, 'the shared list is not empty');
  const sessions = [0, 1, 2, 3, 4].map((i) => sitting(`s${i}`, `app.${i}`, 0, i * 10));
  const ignored = sitting('L1', launcher, 0, 90);
  const labels = [0, 1, 2, 3, 4].map((i) => own(`s${i}`, 'intentional')).concat([own('L1', 'mindless')]);
  const withIgnored = curiositySplit({ window, sessions: [...sessions, ignored], labels, utcOffsetMinutes: 0, labelIgnorePackages: SHARED_EXCLUDED_PACKAGES });
  assert.ok(withIgnored, 'five labels from real apps');
  assert.equal(withIgnored.habitMs, 0, 'a label on an ignored package does not count as habit time');
  assert.equal(withIgnored.deepMs, 5 * 3 * MIN);
});
