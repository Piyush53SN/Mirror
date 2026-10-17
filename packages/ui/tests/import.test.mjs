/**
 * packages/ui/tests/import.test.mjs
 *
 * The import screen is allowed to show numbers only because they are the real
 * output of the real importer. This test recomputes the demo preview with
 * `preview()` and asserts it equals the frozen `DEMO_PREVIEW` the screen renders.
 * Change the bundle, the parser or the fixture and this fails first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const model = await bundleTs(join(HERE, '..', 'screens', 'demoImport.ts'), { outfile: join(HERE, '.build', 'import.mjs') });
const { DEMO_PREVIEW, demoPreview, demoBundle, demoStore, monthRange, oversizedFileSentence, redditExport } = model;
const { commit } = await bundleTs(join(HERE, '..', '..', 'importers', 'src', 'import.ts'), { outfile: join(HERE, '.build', 'commit.mjs') });

test('the frozen preview equals the live parser output', async () => {
  const live = await demoPreview();
  assert.deepEqual(live, DEMO_PREVIEW, 'DEMO_PREVIEW drifted from preview() — regenerate the fixture, do not edit the numbers by hand');
});

test('the preview counts fresh, duplicate and refused rows honestly', () => {
  assert.equal(DEMO_PREVIEW.total, 22);
  assert.equal(DEMO_PREVIEW.fresh, 21);
  assert.equal(DEMO_PREVIEW.duplicates, 1);
  assert.equal(DEMO_PREVIEW.fresh + DEMO_PREVIEW.duplicates, DEMO_PREVIEW.total);
  assert.deepEqual(DEMO_PREVIEW.warnings.map((w) => w.reason), ['unreadable timestamp']);
});

test('month range is derived from the preview, not typed into the screen', () => {
  assert.equal(monthRange(DEMO_PREVIEW), 'Aug 2025 – Sep 2025');
  assert.equal(monthRange({ byMonth: [] }), null);
  assert.equal(monthRange({ byMonth: [{ month: '2026-01', count: 1 }] }), 'Jan 2026');
});

test('a file over the cap is refused, not truncated', () => {
  assert.match(oversizedFileSentence('watch-history.json', 900, 100), /^Refused: watch-history\.json is larger than/);
  assert.match(oversizedFileSentence('watch-history.json', 900, 100), /Split the export/);
  assert.match(oversizedFileSentence('saved_posts.csv', 12, 100), /^Read whole/);
});

test('importing writes the fresh items once, then refuses as nothing-new', async () => {
  const store = demoStore();
  const now = Date.parse('2026-10-17T09:00:00Z');
  const first = await commit(redditExport, demoBundle(), store, { now });
  assert.equal(first.status, 'imported');
  assert.equal(first.imported, 21);
  assert.equal(store.appended, 21);

  const second = await commit(redditExport, demoBundle(), store, { now });
  assert.deepEqual(second, { status: 'refused', reason: 'nothing-new' });
  assert.equal(store.appended, 21, 'a duplicate import wrote nothing');
});

test('importing without a live grant is refused before anything is read', async () => {
  const store = demoStore();
  store.liveGrants = async () => new Map();
  const result = await commit(redditExport, demoBundle(), store, { now: Date.now() });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'no-consent');
  assert.equal(store.appended, 0);
});
