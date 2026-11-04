/**
 * packages/store/tests/app-rules.test.mjs
 *
 * P4.4b app rules: the user's own "always intentional" / "always mindless" per app.
 *   - Persist across reopen; set replaces; clear removes one app only.
 *   - Stored sealed (no plaintext package name in the raw row).
 *   - Never write `intent_label` events (past per-sitting labels are untouched).
 *   - Included in the JSON export; wiped by typed DELETE (deleteAll).
 *   - Validation: only intentional/mindless; empty app rejected; cap enforced.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const store = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'store-app-rules.mjs'), external: [] });
const { NodeSqliteDriver, TEST_ROOT_KEY, counterRandom } = await bundleTs(join(PKG, 'testing/node-driver.ts'), {
  outfile: join(HERE, '.build', 'driver-app-rules.mjs'),
});
const core = await bundleTs(join(PKG, '../core-analytics/src/index.ts'), {
  outfile: join(HERE, '.build', 'core-app-rules.mjs'),
});

const { MirrorStore } = store;
const keys = { keyId: async () => 'test-key-1', rootKey: async () => new Uint8Array(TEST_ROOT_KEY) };
const T0 = 1_700_000_000_000;

test('app rules: store cap and day constants match core-analytics', () => {
  assert.equal(store.APP_RULES_STORE_MAX, core.APP_RULES_MAX);
  assert.equal(core.APP_RULES_MAX, 200);
});

test('app rules: set, replace, clear one app, persist across reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44b-rules-'));
  const file = join(dir, 'mirror.db');
  let driver = NodeSqliteDriver.file(file);
  let reopenDriver = null;
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    assert.deepEqual(await s.appRules(), {});

    await s.setAppRule('com.google.android.youtube', 'mindless', T0);
    await s.setAppRule('org.wikipedia', 'intentional', T0 + 1);
    // Replacing a rule keeps one entry per app.
    await s.setAppRule('com.google.android.youtube', 'intentional', T0 + 2);
    driver.close();
    driver = null;

    reopenDriver = NodeSqliteDriver.file(file);
    const reopened = new MirrorStore({ driver: reopenDriver, keys, random: counterRandom() });
    await reopened.open();
    assert.deepEqual(await reopened.appRules(), {
      'com.google.android.youtube': { label: 'intentional', setAtMs: T0 + 2 },
      'org.wikipedia': { label: 'intentional', setAtMs: T0 + 1 },
    });

    // One tap removes one app's rule and leaves the rest.
    const after = await reopened.clearAppRule('org.wikipedia');
    assert.deepEqual(Object.keys(after), ['com.google.android.youtube']);
    assert.deepEqual(Object.keys(await reopened.appRules()), ['com.google.android.youtube']);
  } finally {
    if (driver) driver.close();
    if (reopenDriver) reopenDriver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('app rules: validation rejects non-rule labels, blank apps, and rules past the cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44b-valid-'));
  const file = join(dir, 'mirror.db');
  const driver = NodeSqliteDriver.file(file);
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    // Only the two rule labels are accepted; `unsure` is a sitting label, not an app rule.
    await assert.rejects(() => s.setAppRule('org.wikipedia', 'unsure'), /label must be intentional or mindless/);
    await assert.rejects(() => s.setAppRule('   ', 'mindless'), /app is required/);
    await assert.rejects(() => s.clearAppRule(''), /app is required/);

    for (let i = 0; i < store.APP_RULES_STORE_MAX; i += 1) {
      await s.setAppRule(`app.rule.${i}`, 'mindless', T0 + i);
    }
    await assert.rejects(() => s.setAppRule('app.one.too.many', 'mindless'), /rule limit reached/);
    // Replacing an existing rule at the cap is still allowed.
    await s.setAppRule('app.rule.0', 'intentional', T0 + 999);
    assert.equal((await s.appRules())['app.rule.0'].label, 'intentional');
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('app rules: sealed at rest, never write intent_label events, exported, wiped by typed DELETE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44b-sealed-'));
  const file = join(dir, 'mirror.db');
  const driver = NodeSqliteDriver.file(file);
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    const labelEventsBefore = (await s.events({ kind: 'intent_label' })).length;

    await s.setAppRule('com.google.android.youtube', 'mindless', T0);

    // Raw row: the package name is not readable without the store keys.
    const rows = await driver.all(`SELECT payload FROM sealed_preferences WHERE key = ?`, ['app_rules_v1']);
    assert.equal(rows.length, 1);
    const raw = Buffer.from(rows[0].payload).toString('latin1');
    assert.equal(raw.includes('com.google.android.youtube'), false);
    assert.equal(raw.includes('mindless'), false);

    // Rules never add or change intent_label events (past labels are never rewritten).
    assert.equal((await s.events({ kind: 'intent_label' })).length, labelEventsBefore);

    // Exported in the JSON archive, alongside budget suggestion dismissals.
    const bundle = await s.exportBundle(new Date(T0).toISOString());
    assert.deepEqual(bundle.appRules, { 'com.google.android.youtube': { label: 'mindless', setAtMs: T0 } });

    // Typed DELETE wipes rules with the other sealed preferences.
    await s.deleteAll();
    assert.deepEqual(await s.appRules(), {});
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
