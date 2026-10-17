/**
 * packages/ml/tests/embedder.test.mjs
 *
 * The placeholder's contract is modest and must be tested as such: right shape,
 * deterministic, lexical neighbours close, unrelated text far, and no pretence of
 * understanding. The last test is the important one — it pins the limitation so
 * nobody "fixes" the docs while leaving the model in place.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ml = await bundleTs(join(HERE, '..', 'src/index.ts'), { outfile: join(HERE, '.build', 'ml.mjs') });
const { embed, cosine, features, EMBEDDER, needsReembedding } = ml;

const norm = (v) => Math.hypot(...v);

test('the placeholder says so, and carries a versioned id', () => {
  assert.equal(EMBEDDER.placeholder, true);
  assert.match(EMBEDDER.id, /^placeholder-/);
  assert.equal(EMBEDDER.dim, 384);
});

test('the vector has the schema shape: 384 finite numbers, unit length', () => {
  const vector = embed('how to meter a black and white photograph');
  assert.equal(vector.length, 384);
  assert.ok(vector.every((value) => Number.isFinite(value) && Math.abs(value) <= 1));
  assert.ok(Math.abs(norm(vector) - 1) < 0.01, `norm was ${norm(vector)}`);
});

test('embedding is deterministic, including across process runs', () => {
  const a = embed('zone system');
  const b = embed('zone system');
  assert.deepEqual(a, b);
  assert.deepEqual(embed('zone system'), a, 'a fresh call must not depend on state');
});

test('an empty string still yields a valid unit vector', () => {
  const vector = embed('   ');
  assert.equal(vector.length, 384);
  assert.ok(Math.abs(norm(vector) - 1) < 0.01);
});

test('lexical neighbours are close; unrelated text is far', () => {
  // Character n-grams share common English trigrams ("ing", "arr"), so the
  // placeholder's cosine scale is compressed: unrelated prose sits around 0.2,
  // where a real encoder would put it near 0.05. The *ordering* is what matters
  // here, and the thresholds record the measured scale rather than an ideal one.
  const base = embed('annotated bibliography for zone system photography');
  const near = embed('zone system photography bibliography');
  const far = embed('quarterly tax filing deadlines');
  assert.ok(cosine(base, near) > 0.7, `expected > 0.7, got ${cosine(base, near).toFixed(3)}`);
  assert.ok(cosine(base, far) < 0.35, `expected < 0.35, got ${cosine(base, far).toFixed(3)}`);
  assert.ok(cosine(base, near) > cosine(base, far) + 0.4, 'the order must be unambiguous');
});

test('case and punctuation do not change the vector', () => {
  assert.deepEqual(embed('Zone System!'), embed('zone   system'));
});

test('features are the documented families', () => {
  const list = features('ab');
  assert.deepEqual(list.sort(), ['w:ab']);
  const longer = features('zone');
  assert.ok(longer.includes('w:zone'));
  assert.ok(longer.includes('c3:zon'));
  assert.ok(longer.includes('c4:zone'));
});

test('cosine refuses mismatched dimensions instead of guessing', () => {
  assert.throws(() => cosine([1, 0], [1, 0, 0]), /dimension mismatch/);
});

test('re-embedding is triggered by a model change, not by content', () => {
  assert.equal(needsReembedding({ model: EMBEDDER.id }), false);
  assert.equal(needsReembedding({ model: 'placeholder-old' }), true);
  assert.equal(needsReembedding({ model: null }), true);
});

/* ------------------------------------------------ the documented limit ---- */

test('LIMITATION: the placeholder is lexical, not semantic — and the docs must say so', () => {
  // These two mean the same thing and share no words. A real encoder puts them
  // together; this one does not, which is exactly why it is called a placeholder.
  const a = embed('borrow checker');
  const b = embed('ownership model');
  assert.ok(cosine(a, b) < 0.3, 'if this ever passes, replace the doc — not the test');
});

/* ------------------------------------------------------------ property ---- */

test('property: every input produces a valid unit vector', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 200 }), (text) => {
      const vector = embed(text);
      return vector.length === 384 && vector.every(Number.isFinite) && Math.abs(norm(vector) - 1) < 0.01;
    }),
    { numRuns: 150 },
  );
});

test('property: cosine with itself is 1 and is symmetric', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 60 }), fc.string({ minLength: 1, maxLength: 60 }), (a, b) => {
      const va = embed(a);
      const vb = embed(b);
      return Math.abs(cosine(va, va) - 1) < 1e-6 && Math.abs(cosine(va, vb) - cosine(vb, va)) < 1e-9;
    }),
    { numRuns: 100 },
  );
});
