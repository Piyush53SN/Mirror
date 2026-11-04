/**
 * P4.4-UX (5): system/utility apps such as Gallery never get a Label button.
 * Labeling exclusion is the single list used by Sessions (no Label pill) and by focus
 * windows and Rabbit Hole, so the check below is the whole behaviour.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-labeling-exclusions.mjs'),
});

test('Gallery and other system media viewers are excluded from labeling (no Label button)', () => {
  for (const pkg of [
    'com.android.gallery3d',
    'com.sec.android.gallery3d',
    'com.miui.gallery',
    'com.oneplus.gallery',
    'com.coloros.gallery3d',
    'com.vivo.gallery',
  ]) {
    assert.equal(core.isLabelingExcludedApp(pkg), true, `${pkg} must not offer a Label button`);
  }
});

test('intent-bearing apps keep their Label button', () => {
  assert.equal(core.isLabelingExcludedApp('com.google.android.youtube'), false);
  assert.equal(core.isLabelingExcludedApp('org.wikipedia'), false);
  assert.equal(core.isLabelingExcludedApp('com.discord'), false);
});
