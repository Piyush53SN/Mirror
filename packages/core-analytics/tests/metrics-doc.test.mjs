/**
 * packages/core-analytics/tests/metrics-doc.test.mjs
 *
 * `docs/metrics.md` is the contract between the engine and the copy. This test
 * fails if a factor exists in code but not in the document, if a formula line is
 * removed, or if the version in the document drifts from the engine's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(join(HERE, '..', '..', '..', 'docs', 'metrics.md'), 'utf8');
const core = await bundleTs(join(HERE, '..', 'src', 'index.ts'), { outfile: join(HERE, '.build', 'core-metrics.mjs') });

const FACTORS = [
  { id: 'session_length', max: 25, formula: /25 × \(1 − nShort \/ nSessions\)/ },
  { id: 'deliberate_share', max: 20, formula: /20 × intentional \/ decisive/ },
  { id: 'switching', max: 15, formula: /15 × 20 \/ \(perHour \+ 20\)/ },
  { id: 'late_night', max: 15, formula: /15 × \(1 − lateMs \/ totalMs\)/ },
  { id: 'topic_depth', max: 25, formula: /25 × meanCosine/ },
];

test('every engine factor has a section with formula, inputs, caveats and a worked example', () => {
  for (const factor of FACTORS) {
    const heading = `### \`${factor.id}\` — ${factor.max} points`;
    assert.ok(DOC.includes(heading), `missing heading for ${factor.id}: ${heading}`);
    const start = DOC.indexOf(heading);
    const next = DOC.indexOf('\n### ', start + heading.length);
    const section = DOC.slice(start, next === -1 ? undefined : next);
    for (const part of ['**Formula.**', '**Inputs.**', '**Measurable when.**', '**Caveats.**', '**Worked example.**', '**Tests.**']) {
      assert.ok(section.includes(part), `${factor.id} is missing ${part}`);
    }
    assert.match(section, factor.formula, `${factor.id} formula line drifted`);
  }
});

test('the brief formula and the crosswalk are stated, including the two unmeasured components', () => {
  for (const weight of ['0.35', '0.25', '0.20', '0.10']) assert.ok(DOC.includes(weight), `weight ${weight} missing`);
  assert.ok(DOC.includes('Doomscroll penalty'), 'the penalty term must be named');
  assert.ok(DOC.includes('**Active engagement**') && DOC.includes('not measured'), 'active engagement must be marked unmeasured');
  assert.ok(DOC.includes('**Follow-through**') && DOC.includes('not measured'), 'follow-through must be marked unmeasured');
});

test('the four deviations are recorded as decisions (now approved)', () => {
  for (const id of ['D-P2-01', 'D-P2-02', 'D-P2-03', 'D-P2-04']) {
    assert.ok(DOC.includes(`**${id}`), `${id} missing from the decision record`);
  }
  assert.ok(DOC.includes('Approved 2026-10-17'), 'the decision record must show approval dates');
  assert.ok(DOC.includes('Interaction Quality Score'), 'D-P2-04 must record the approved expansion');
});

test('the documented version matches the engine', () => {
  assert.equal(core.IQS_METRICS_VERSION, 2);
  assert.ok(DOC.includes(`Current version: **${core.IQS_METRICS_VERSION}**`), 'docs/metrics.md §9 is out of date');
  const score = core.scoreIqs({ window: { fromMs: 0, toMs: 86_400_000 }, sessions: [{ id: 'ses_x', app: 'a', startMs: 1000, endMs: 2000 }] });
  assert.equal(score.metricsVersion, core.IQS_METRICS_VERSION);
});
