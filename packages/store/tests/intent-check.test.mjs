/**
 * packages/store/tests/intent-check.test.mjs
 *
 * P4.4c Intent Check storage:
 *   - off by default; settings persist across reopen
 *   - sealed rows: no plaintext session id, app name, or setting in the raw payload
 *   - bookkeeping never writes intent_label events (nothing is labeled without a tap)
 *   - export carries the settings only (not prompt bookkeeping)
 *   - typed DELETE (deleteAll) wipes settings and bookkeeping
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
const store = await bundleTs(join(PKG, 'src/index.ts'), {
  outfile: join(HERE, '.build', 'store-intent-check.mjs'),
  external: [],
});
const { NodeSqliteDriver, TEST_ROOT_KEY, counterRandom } = await bundleTs(
  join(PKG, 'testing/node-driver.ts'),
  { outfile: join(HERE, '.build', 'driver-intent-check.mjs') },
);
const { MirrorStore } = store;
const keys = { keyId: async () => 'test-key-1', rootKey: async () => new Uint8Array(TEST_ROOT_KEY) };
const T0 = 1_700_000_000_000;

const PENDING = {
  sessionId: 'sess-secret-123',
  app: 'com.example.secretapp',
  durationMs: 9 * 60_000,
  endMs: T0,
  day: '2026-11-06',
  issuedAtMs: T0,
};
const STATE = {
  pending: PENDING,
  lastPromptDay: '2026-11-06',
  consecutiveIgnored: 1,
  promptedSessionIds: ['sess-secret-123'],
  pauseNoticePending: false,
  updatedAtMs: T0,
};

test('intent check: off by default, settings persist across reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44c-prefs-'));
  const file = join(dir, 'mirror.db');
  let driver = NodeSqliteDriver.file(file);
  let reopenDriver = null;
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    assert.deepEqual(
      { enabled: (await s.intentCheckPrefs()).enabled, paused: (await s.intentCheckPrefs()).pausedAfterIgnored },
      { enabled: false, paused: false },
    );
    assert.equal(await s.intentCheckState(), null);

    await s.setIntentCheckPrefs({ enabled: true }, T0);
    await s.setIntentCheckPrefs({ pausedAfterIgnored: true }, T0 + 1);
    driver.close();
    driver = null;

    reopenDriver = NodeSqliteDriver.file(file);
    const reopened = new MirrorStore({ driver: reopenDriver, keys, random: counterRandom() });
    await reopened.open();
    const prefs = await reopened.intentCheckPrefs();
    assert.equal(prefs.enabled, true);
    assert.equal(prefs.pausedAfterIgnored, true);
    assert.equal(prefs.updatedAtMs, T0 + 1);
  } finally {
    if (driver) driver.close();
    if (reopenDriver) reopenDriver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intent check: sealed rows hold no plaintext session, app, or setting names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44c-sealed-'));
  const driver = NodeSqliteDriver.file(join(dir, 'mirror.db'));
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    await s.setIntentCheckPrefs({ enabled: true }, T0);
    await s.setIntentCheckState(STATE);

    for (const key of ['intent_check_v1', 'intent_check_state_v1']) {
      const rows = await driver.all(`SELECT payload FROM sealed_preferences WHERE key = ?`, [key]);
      assert.equal(rows.length, 1, key);
      const raw = Buffer.from(rows[0].payload).toString('latin1');
      assert.equal(raw.includes('sess-secret-123'), false, `${key} leaks session id`);
      assert.equal(raw.includes('com.example.secretapp'), false, `${key} leaks app`);
      assert.equal(raw.includes('enabled'), false, `${key} leaks setting name`);
      assert.equal(raw.includes('pending'), false, `${key} leaks field name`);
    }

    const round = await s.intentCheckState();
    assert.deepEqual(round, STATE);
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intent check: bookkeeping never writes a label; export has settings only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44c-export-'));
  const driver = NodeSqliteDriver.file(join(dir, 'mirror.db'));
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    const labelsBefore = (await s.events({ kind: 'intent_label' })).length;

    await s.setIntentCheckPrefs({ enabled: true }, T0);
    await s.setIntentCheckState(STATE);
    assert.equal((await s.events({ kind: 'intent_label' })).length, labelsBefore);

    const bundle = await s.exportBundle(new Date(T0).toISOString());
    assert.deepEqual(bundle.intentCheck, { enabled: true, pausedAfterIgnored: false, updatedAtMs: T0 });
    const json = JSON.stringify(bundle);
    assert.equal(json.includes('sess-secret-123'), false, 'export must not carry the pending prompt');
    assert.equal(json.includes('com.example.secretapp'), false);
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intent check: typed DELETE (deleteAll) wipes settings and bookkeeping', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-p44c-delete-'));
  const driver = NodeSqliteDriver.file(join(dir, 'mirror.db'));
  try {
    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    await s.open();
    await s.setIntentCheckPrefs({ enabled: true, pausedAfterIgnored: true }, T0);
    await s.setIntentCheckState(STATE);

    await s.deleteAll();
    assert.equal((await s.intentCheckPrefs()).enabled, false);
    assert.equal((await s.intentCheckPrefs()).pausedAfterIgnored, false);
    assert.equal(await s.intentCheckState(), null);
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
