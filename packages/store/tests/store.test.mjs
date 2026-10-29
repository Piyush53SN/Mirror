/**
 * packages/store/tests/store.test.mjs
 *
 * Runs the real store against real SQLite (node:sqlite) in a real file, so the
 * schema, indexes, PRAGMAs and crypto are the ones that ship.
 *
 * The tests are organised around the three promises the store makes: consent,
 * content opt-in, and deletion that means deletion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const store = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'store.mjs'), external: [] });

// The testing driver is plain TS too; bundle it alongside so it shares one copy
// of the crypto module (two copies would derive different keys from the same root
// only if the code differed — this keeps the comparison honest either way).
const { NodeSqliteDriver, TEST_ROOT_KEY, counterRandom } = await bundleTs(join(PKG, 'testing/node-driver.ts'), {
  outfile: join(HERE, '.build', 'driver.mjs'),
});
const core = await bundleTs(join(PKG, '../core-analytics/src/index.ts'), {
  outfile: join(HERE, '.build', 'core.mjs'),
});
const mobileIngest = await bundleTs(join(PKG, '../../apps/mobile/src/collector/ingest.ts'), {
  outfile: join(HERE, '.build', 'mobile-ingest.mjs'),
});

const { MirrorStore, seal, open, deriveKeys, itemHash, DecryptionError } = store;

const keys = { keyId: async () => 'test-key-1', rootKey: async () => new Uint8Array(TEST_ROOT_KEY) };
const T0 = Date.parse('2026-10-16T09:00:00Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString().replace(/\.\d{3}Z$/, 'Z');

const foreground = (over = {}) => ({
  schema_version: 1,
  id: 'evt_fore_0001',
  kind: 'app_foreground',
  at: iso(0),
  tier: 'D',
  origin: 'os',
  content: 'metadata',
  app: 'com.google.android.youtube',
  ...over,
});

const background = (over = {}) =>
  foreground({ id: 'evt_back_0001', kind: 'app_background', at: iso(60_000), duration_ms: 60_000, ...over });

const grant = (over = {}) => ({
  id: 'cns_grant_0001',
  at: iso(-86_400_000),
  action: 'granted',
  subject: 'os_usage',
  tier: 'D',
  scopes: [],
  promise: 'Mirror reads which apps were in front, and for how long.',
  method: 'in_app',
  deletes_imported_events: false,
  ...over,
});

async function makeStore(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-store-'));
  const file = join(dir, 'mirror.db');
  const driver = NodeSqliteDriver.file(file);
  const s = new MirrorStore({ driver, keys, random: counterRandom(), clock: () => T0 + 3_600_000, ...overrides });
  await s.open();
  return { s, driver, dir, file, close: () => { driver.close(); rmSync(dir, { recursive: true, force: true }); } };
}

/* ----------------------------------------------------------------- open ----- */

test('open migrates to the current schema version and is idempotent', async () => {
  const { s, file, close } = await makeStore();
  try {
    assert.equal((await s.open()).schemaVersion, store.SCHEMA_VERSION);
    const again = new MirrorStore({ driver: NodeSqliteDriver.file(file), keys, random: counterRandom() });
    // A second open on the same file must not re-run migrations destructively.
    assert.equal((await again.open()).schemaVersion, store.SCHEMA_VERSION);
    assert.equal((await again.counts()).total, 0);
  } finally {
    close();
  }
});

/* --------------------------------------------------------------- consent ----- */

test('tier-A/B/C events are refused without a live grant, and accepted with one', async () => {
  const { s, close } = await makeStore({ allowContent: true });
  try {
    const visit = {
      schema_version: 1,
      id: 'evt_web_00001',
      kind: 'web_visit',
      at: iso(0),
      tier: 'C',
      origin: 'extension',
      content: 'content',
      consent: 'grant_extension',
      host: 'arxiv.org',
      duration_ms: 1000,
    };
    const refused = await s.appendEvents([visit]);
    assert.equal(refused.inserted, 0);
    assert.match(refused.rejected[0].reason, /no live consent grant/);

    await s.appendConsent(grant({ id: 'cns_ext_00001', subject: 'grant_extension', tier: 'C', scopes: ['hosts:arxiv.org'] }));
    const accepted = await s.appendEvents([visit]);
    assert.equal(accepted.inserted, 1);
    assert.deepEqual(accepted.rejected, []);
  } finally {
    close();
  }
});

test('content events are refused when the person has not opted in', async () => {
  const { s, close } = await makeStore({ allowContent: false });
  try {
    await s.appendConsent(grant({ id: 'cns_ext_00002', subject: 'grant_extension', tier: 'C' }));
    const result = await s.appendEvents([
      { schema_version: 1, id: 'evt_web_00002', kind: 'web_visit', at: iso(0), tier: 'C', origin: 'extension', content: 'content', consent: 'grant_extension', host: 'a.com', duration_ms: 1 },
    ]);
    assert.equal(result.inserted, 0);
    assert.match(result.rejected[0].reason, /content events are off/);
  } finally {
    close();
  }
});

test('metadata events are accepted without any grant (tier D)', async () => {
  const { s, close } = await makeStore();
  try {
    const result = await s.appendEvents([foreground(), background()]);
    assert.equal(result.inserted, 2);
  } finally {
    close();
  }
});

test('a revocation deletes the events its grant produced, and only those', async () => {
  const { s, close } = await makeStore({ allowContent: true });
  try {
    await s.appendConsent(grant({ id: 'cns_ext_00003', subject: 'grant_extension', tier: 'C' }));
    await s.appendConsent(grant({ id: 'cns_api_00004', subject: 'grant_reddit', tier: 'A' }));
    await s.appendEvents([
      { schema_version: 1, id: 'evt_web_00003', kind: 'web_visit', at: iso(1000), tier: 'C', origin: 'extension', content: 'content', consent: 'grant_extension', host: 'a.com', duration_ms: 1 },
      { schema_version: 1, id: 'evt_api_00003', kind: 'api_item', at: iso(2000), tier: 'A', origin: 'api', content: 'content', consent: 'grant_reddit', source_id: 'reddit', action: 'saved' },
      foreground({ id: 'evt_fore_0003', at: iso(3000) }),
    ]);
    const before = await s.counts();
    assert.equal(before.total, 3);

    const result = await s.revoke({ id: 'cns_rev_00003', at: iso(4000), subject: 'grant_extension', tier: 'C', scopes: ['hosts:a.com'], promise: 'Extension captures scroll depth on allow-listed sites.', method: 'in_app' });
    assert.equal(result.deletedEvents, 1);
    const after = await s.counts();
    assert.equal(after.total, 2, 'the Reddit import and the OS event survive');
    assert.equal(after.byTier.A, 1);
    assert.equal(after.byTier.D, 1);
  } finally {
    close();
  }
});

test('revoking the OS grant deletes tier-D events too', async () => {
  const { s, close } = await makeStore();
  try {
    await s.appendConsent(grant({ id: 'cns_os_00001', subject: 'os_usage', tier: 'D' }));
    await s.appendEvents([foreground(), background()]);
    const result = await s.revoke({ id: 'cns_os_rev_1', at: iso(5000), subject: 'os_usage', tier: 'D', scopes: ['usage_access'], promise: 'Mirror reads which apps were in front, and for how long.', method: 'system_settings' });
    assert.equal(result.deletedEvents, 2);
    assert.equal((await s.counts()).total, 0);
  } finally {
    close();
  }
});

test('a revocation with no live grant is refused', async () => {
  const { s, close } = await makeStore();
  try {
    await assert.rejects(() => s.revoke({ id: 'cns_none_0001', at: iso(0), subject: 'nope', tier: 'D', scopes: [], promise: 'nothing was ever granted here.', method: 'in_app' }), /no live grant/);
  } finally {
    close();
  }
});

/* ----------------------------------------------------------- idempotency ----- */

test('re-ingesting the same window inserts nothing', async () => {
  const { s, close } = await makeStore();
  try {
    const batch = [foreground(), background()];
    assert.equal((await s.appendEvents(batch)).inserted, 2);
    const again = await s.appendEvents(batch);
    assert.equal(again.inserted, 0);
    assert.equal(again.duplicate, 2);
    assert.equal((await s.counts()).total, 2);
  } finally {
    close();
  }
});

/* -------------------------------------------------------------- encryption -- */

test('the payload is encrypted at rest: no plaintext of the app or subject is in the file', async () => {
  const { s, file, close } = await makeStore({ allowContent: true });
  try {
    await s.appendConsent(grant({ id: 'cns_ext_00010', subject: 'grant_extension', tier: 'C' }));
    await s.appendEvents([
      {
        schema_version: 1,
        id: 'evt_web_00010',
        kind: 'web_visit',
        at: iso(0),
        tier: 'C',
        origin: 'extension',
        content: 'content',
        consent: 'grant_extension',
        host: 'arxiv.org',
        duration_ms: 1000,
        query: 'MRRCANARY-plaintextcheck',
      },
    ]);
    const bytes = [readFileSync(file), existsSync(`${file}-wal`) ? readFileSync(`${file}-wal`) : Buffer.alloc(0)].map(String).join('\u0000');
    assert.ok(!bytes.includes('MRRCANARY-plaintextcheck'), 'a query must never appear in the database file');
    assert.ok(!bytes.includes('arxiv.org'), 'the host must not appear in the clear either');
    // The decrypted view does have it.
    const [event] = await s.events();
    assert.equal(event.payload.query, 'MRRCANARY-plaintextcheck');
  } finally {
    close();
  }
});

test('a tampered payload fails authentication instead of returning garbage', async () => {
  const { s, driver, close } = await makeStore();
  try {
    await s.appendEvents([foreground()]);
    const row = await driver.all('SELECT payload FROM events');
    const payload = new Uint8Array(row[0].payload);
    payload[payload.length - 1] ^= 0x01;
    await driver.run('UPDATE events SET payload = ? WHERE id = ?', [payload, 'evt_fore_0001']);
    await assert.rejects(() => s.events(), (error) => error instanceof DecryptionError && /altered/.test(error.message));
  } finally {
    close();
  }
});

test('a record sealed under another key is refused by key id', async () => {
  const derived = deriveKeys(new Uint8Array(32).fill(9));
  const envelope = seal({ a: 1 }, derived, 'other-key', counterRandom());
  assert.throws(() => open(envelope, derived, 'test-key-1'), /sealed with key "other-key"/);
});

test('item hashes are stable, opaque and unique per key', () => {
  const a = deriveKeys(new Uint8Array(32).fill(1));
  const b = deriveKeys(new Uint8Array(32).fill(2));
  assert.equal(itemHash('reddit:t3_abc', a), itemHash('reddit:t3_abc', a));
  assert.notEqual(itemHash('reddit:t3_abc', a), itemHash('reddit:t3_def', a));
  assert.notEqual(itemHash('reddit:t3_abc', a), itemHash('reddit:t3_abc', b));
  assert.match(itemHash('x', a), /^[0-9a-f]{64}$/);
  assert.ok(!itemHash('reddit:t3_abc', a).includes('reddit'));
});

test('property: sealing and opening any JSON value round-trips', () => {
  const derived = deriveKeys(new Uint8Array(32).fill(3));
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      const envelope = seal(value, derived, 'k1', counterRandom());
      return JSON.stringify(open(envelope, derived, 'k1')) === JSON.stringify(value);
    }),
    { numRuns: 100 },
  );
});

test('property: flipping any ciphertext byte makes it unreadable', () => {
  const derived = deriveKeys(new Uint8Array(32).fill(4));
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 40 }), (index) => {
      const envelope = seal({ hello: 'world' }, derived, 'k1', counterRandom());
      const at = 2 + 'k1'.length + 24 + index;
      if (at >= envelope.length) return true;
      const copy = new Uint8Array(envelope);
      copy[at] ^= 0xff;
      try {
        open(copy, derived, 'k1');
        return false;
      } catch (error) {
        return error instanceof DecryptionError;
      }
    }),
    { numRuns: 100 },
  );
});

/* -------------------------------------------------------------- retention --- */

test('sweepExpired deletes only rows older than the window', async () => {
  const { s, close } = await makeStore({ retentionDays: 90 });
  try {
    const old = foreground({ id: 'evt_old_00001', at: new Date(T0 - 100 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z') });
    const recent = foreground({ id: 'evt_new_00001', at: iso(-86_400_000) });
    await s.appendEvents([old, recent]);
    const result = await s.sweepExpired(T0);
    assert.equal(result.deleted, 1);
    assert.equal((await s.counts()).total, 1);
  } finally {
    close();
  }
});

test('sweepExpired on an empty store deletes nothing and does not throw', async () => {
  const { s, close } = await makeStore();
  try {
    assert.deepEqual((await s.sweepExpired(T0)).deleted, 0);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------- delete all --- */

test('deleteAll leaves nothing readable, and nothing recognisable in the file', async () => {
  const { s, file, close } = await makeStore({ allowContent: true });
  try {
    await s.appendConsent(grant({ id: 'cns_ext_00020', subject: 'grant_extension', tier: 'C' }));
    await s.appendEvents([
      { schema_version: 1, id: 'evt_web_00020', kind: 'web_visit', at: iso(0), tier: 'C', origin: 'extension', content: 'content', consent: 'grant_extension', host: 'youtube.com', duration_ms: 5, query: 'MRRCANARY-deleteall' },
    ]);
    await s.recordImport({ id: 'imp_00000001', source_id: 'youtube', export_format: 'takeout', imported_at: iso(0), item_count: 1, consent_id: 'grant_extension' });
    await s.deleteAll();

    assert.equal((await s.counts()).total, 0);
    assert.deepEqual(await s.consentLog(), []);
    assert.deepEqual(await s.connections(), []);
    assert.deepEqual(await s.imports(), []);

    const bytes = [readFileSync(file), existsSync(`${file}-wal`) ? readFileSync(`${file}-wal`) : Buffer.alloc(0)].map(String).join('\u0000');
    assert.ok(!bytes.includes('MRRCANARY-deleteall'), 'deleted content must not survive in the file');
    assert.ok(!bytes.includes('youtube.com'), 'deleted host must not survive in the file');
  } finally {
    close();
  }
});

test('clearIntentLabels deletes only intent_label events and preserves usage events and sessions', async () => {
  const { s, close } = await makeStore();
  try {
    const appendRes = await s.appendEvents([
      foreground({ id: 'evt_fore_0099', app: 'org.wikipedia', at: iso(0) }),
      background({ id: 'evt_back_0099', app: 'org.wikipedia', at: iso(60_000), duration_ms: 60_000 }),
      { schema_version: 1, id: 'label_0000001', kind: 'intent_label', at: iso(65_000), tier: 'D', origin: 'user', content: 'metadata', session_id: 'ses_00000001', label: 'intentional' },
      { schema_version: 1, id: 'label_0000002', kind: 'intent_label', at: iso(70_000), tier: 'D', origin: 'user', content: 'metadata', session_id: 'ses_00000002', label: 'mindless' },
    ]);
    assert.deepEqual(appendRes.rejected, []);
    assert.equal(appendRes.inserted, 4);

    await s.applySessions({
      window: { fromMs: 0, toMs: Date.parse(iso(120_000)) },
      sessions: [
        { id: 'ses_00000001', app: 'org.wikipedia', start_ms: Date.parse(iso(0)), end_ms: Date.parse(iso(60_000)), duration_ms: 60_000 },
      ],
      assignments: [
        { eventId: 'evt_fore_0099', sessionId: 'ses_00000001' },
        { eventId: 'evt_back_0099', sessionId: 'ses_00000001' },
      ],
    });

    const removed = await s.clearIntentLabels();
    assert.equal(removed, 2);
    assert.deepEqual(await s.events({ kind: 'intent_label' }), []);
    assert.equal((await s.events()).length, 2, 'app_foreground and app_background events remain intact');
    assert.equal((await s.sessions()).length, 1, 'sessions remain intact');

    // replaceGapsForWindow replaces only gaps in [fromMs, toMs) and preserves earlier days
    await s.recordGaps('usage_stats', [{ reason: 'orphan_background', count: 12 }], 1_000);
    await s.recordGaps('usage_stats', [{ reason: 'orphan_background', count: 49 }], 100_000);
    await s.replaceGapsForWindow('usage_stats', { fromMs: 50_000, toMs: 150_000 }, [{ reason: 'orphan_background', count: 3 }], 110_000);
    assert.equal((await s.gapSummary({ fromMs: 0, toMs: 50_000 })).count, 12);
    assert.equal((await s.gapSummary({ fromMs: 50_000, toMs: 150_000 })).count, 3);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------ connections --- */

test('a connection stores a keystore reference, and refuses a credential field', async () => {
  const { s, close } = await makeStore();
  try {
    await s.upsertConnection({
      connector_id: 'reddit',
      status: 'connected',
      scopes: ['read', 'save'],
      token_ref: 'keystore:mirror.reddit',
      connected_at: iso(0),
      last_sync_at: null,
      items_imported: 3,
      revoked_at: null,
    });
    const [row] = await s.connections();
    assert.equal(row.token_ref, 'keystore:mirror.reddit');
    assert.deepEqual(row.scopes, ['read', 'save']);

    await assert.rejects(
      () => s.upsertConnection({ connector_id: 'reddit', status: 'connected', scopes: [], token_ref: 'keystore:x.y', connected_at: iso(0), last_sync_at: null, items_imported: 0, revoked_at: null, access_token: 'abc' }),
      /credential-shaped field/,
    );
    await assert.rejects(
      () => s.upsertConnection({ connector_id: 'reddit', status: 'connected', scopes: [], token_ref: 'plain-token', connected_at: iso(0), last_sync_at: null, items_imported: 0, revoked_at: null }),
      /keystore reference/,
    );
  } finally {
    close();
  }
});

/* ----------------------------------------------------------------- cursor --- */

test('the ingest cursor survives a reopen and rejects nonsense', async () => {
  const { s, dir, close } = await makeStore();
  const file = join(dir, 'mirror.db');
  try {
    await s.setCursor('usage_stats', 1_700_000_000_000);
    const reopened = new MirrorStore({ driver: NodeSqliteDriver.file(file), keys, random: counterRandom() });
    await reopened.open();
    assert.equal(await reopened.getCursor('usage_stats'), 1_700_000_000_000);
    await assert.rejects(() => s.setCursor('usage_stats', Number.NaN), /invalid cursor/);
    assert.equal(await s.getCursor('never_set'), null);
  } finally {
    close();
  }
});

/* -------------------------------------------------------------- migration --- */

test('a v1 store migrates to v2 in place, keeping every event readable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-migrate-'));
  const file = join(dir, 'mirror.db');
  const driver = NodeSqliteDriver.file(file);
  const rootKey = new Uint8Array(TEST_ROOT_KEY);
  try {
    // Build a real v1 file: run migration 1 only, stamp the version, and write a
    // v1 event through the same seal() the v1 build used. Nothing about this
    // fixture is a mock of the old schema.
    await driver.exec('PRAGMA journal_mode = WAL');
    for (const statement of store.MIGRATIONS[0].statements) await driver.exec(statement);
    await driver.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')`);
    const v1Event = foreground();
    const sealed = store.seal(v1Event, store.deriveKeys(rootKey), 'test-key-1', counterRandom());
    await driver.run(
      `INSERT INTO events (id, at, kind, tier, origin, content, session_id, item_hash, consent_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      [v1Event.id, Date.parse(v1Event.at), v1Event.kind, v1Event.tier, v1Event.origin, v1Event.content, sealed],
    );
    await driver.run(`INSERT INTO consent_log (id, at, action, subject, tier, scopes, promise, method, deletes_imported_events)
                      VALUES ('cns_os_000001', ?, 'granted', 'os_usage', 'D', '[]', 'p', 'in_app', 0)`, [Date.parse(iso(-86_400_000))]);
    assert.equal(Number((await driver.all(`SELECT value FROM meta WHERE key = 'schema_version'`))[0].value), 1);

    const s = new MirrorStore({ driver, keys, random: counterRandom() });
    const opened = await s.open();
    assert.equal(opened.schemaVersion, store.SCHEMA_VERSION);

    // The old row is still there, in clear, and the new tables are usable.
    const rows = await s.events();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, v1Event.id);
    assert.equal(rows[0].payload.app, 'com.google.android.youtube');

    await s.applySessions({
      window: { fromMs: Date.parse(iso(-1000)), toMs: Date.parse(iso(3_600_000)) },
      sessions: [{ id: 'ses_migrated_0001', app: 'com.google.android.youtube', start_ms: Date.parse(iso(0)), end_ms: Date.parse(iso(60_000)), duration_ms: 60_000 }],
      assignments: [{ eventId: v1Event.id, sessionId: 'ses_migrated_0001' }],
    });
    assert.equal((await s.sessions()).length, 1);
    await s.putRollup('2026-10-16', { sessions: 1 });
    assert.equal((await s.rollup('2026-10-16')).payload.sessions, 1);
    assert.equal((await s.events())[0].session_id, 'ses_migrated_0001');
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a store from a newer build is refused, not guessed at', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-future-'));
  const file = join(dir, 'mirror.db');
  const driver = NodeSqliteDriver.file(file);
  try {
    await driver.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    await driver.run(`INSERT INTO meta (key, value) VALUES ('schema_version', '99')`);
    const future = new MirrorStore({ driver, keys, random: counterRandom() });
    await assert.rejects(() => future.open(), /newer than this build/);
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------- item hashes -- */

test('item hashes answer "have I seen this?" without storing the identity', async () => {
  const { s, close } = await makeStore({ allowContent: true });
  try {
    await s.appendConsent(grant({ id: 'cns_export_0001', subject: 'export:reddit-export', tier: 'B', scopes: ['reddit-export'] }));
    const hashes = s.hashItems(['reddit:post:abc123', 'reddit:post:def456']);
    assert.equal(hashes.length, 2);
    assert.match(hashes[0], /^[0-9a-f]{64}$/);
    assert.equal(await s.itemHashes(hashes).then((rows) => rows.length), 0);

    const event = {
      schema_version: 1,
      id: 'evt_import_0001',
      kind: 'import_item',
      at: iso(0),
      tier: 'B',
      origin: 'export',
      content: 'content',
      consent: 'export:reddit-export',
      source_id: 'reddit-export',
      export_format: 'reddit-export',
      subject: 'Zone system, part one',
      item_hash: hashes[0],
    };
    const appended = await s.appendEvents([event]);
    assert.equal(appended.inserted, 1);
    assert.deepEqual(await s.itemHashes(hashes), [hashes[0]]);
    assert.deepEqual(await s.itemHashes([]), []);
    assert.deepEqual(await s.itemHashes(['not-a-hash']), [], 'a malformed hash is ignored, not interpolated');
  } finally {
    close();
  }
});

test('key change: app update keeps same key readable, reinstall with new key fails with sealed-with-key error and can be reset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-keychange-'));
  const file = join(dir, 'mirror.db');
  const key1Bytes = new Uint8Array(32).fill(1);
  const key2Bytes = new Uint8Array(32).fill(2);
  const keys1 = { keyId: async () => 'kmvezvsza', rootKey: async () => key1Bytes };
  const keys2 = { keyId: async () => 'kmvgashwo', rootKey: async () => key2Bytes };

  try {
    const driver1 = NodeSqliteDriver.file(file);
    const s1 = new MirrorStore({ driver: driver1, keys: keys1, random: counterRandom(), clock: () => T0 });
    await s1.open();
    await s1.appendEvents([foreground({ id: 'evt_key_0001', at: iso(0) })]);
    assert.equal((await s1.counts()).total, 1);
    const sess1 = await s1.events();
    assert.equal(sess1.length, 1);
    driver1.close();

    const driverUpdate = NodeSqliteDriver.file(file);
    const sUpdate = new MirrorStore({ driver: driverUpdate, keys: keys1, random: counterRandom(), clock: () => T0 });
    await sUpdate.open();
    const afterUpdate = await sUpdate.events();
    assert.equal(afterUpdate.length, 1, 'app update with same key must keep data readable');
    driverUpdate.close();

    const driver2 = NodeSqliteDriver.file(file);
    const s2 = new MirrorStore({ driver: driver2, keys: keys2, random: counterRandom(), clock: () => T0 });
    await s2.open();
    await assert.rejects(() => s2.events(), (err) => err instanceof DecryptionError && /sealed with key "kmvezvsza", current key is "kmvgashwo"/.test(err.message), 'key mismatch must throw sealed-with-key error, not silent empty list');

    await s2.deleteAll();
    assert.equal((await s2.counts()).total, 0, 'after explicit reset, store is empty and new key is kept');
    await s2.appendEvents([foreground({ id: 'evt_key_0002', at: iso(1000) })]);
    assert.equal((await s2.counts()).total, 1);
    driver2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('appendEvents: duplicates inside the same batch and across syncs are skipped without error or data loss', async () => {
  const { s, close } = await makeStore();
  try {
    const first = await s.appendEvents([
      foreground({ id: 'evt_dup_0001', at: iso(0) }),
      foreground({ id: 'evt_dup_0001', at: iso(0) }), // in-batch duplicate
      background({ id: 'evt_dup_0002', at: iso(60_000) }),
    ]);
    assert.equal(first.inserted, 2);
    assert.equal(first.duplicate, 1);
    assert.deepEqual(first.rejected, []);

    const second = await s.appendEvents([
      foreground({ id: 'evt_dup_0001', at: iso(0) }),
      background({ id: 'evt_dup_0002', at: iso(60_000) }),
      foreground({ id: 'evt_dup_0003', at: iso(120_000) }),
    ]);
    assert.equal(second.inserted, 1, 'new events in mixed batch are never lost');
    assert.equal(second.duplicate, 2, 'existing duplicates are skipped cleanly');
    assert.equal((await s.counts()).total, 3);
  } finally {
    close();
  }
});

test('recordResetAudit and lastResetAudit persist when/why across reopen and log via onDiagnostic', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-reset-audit-'));
  const file = join(dir, 'mirror.db');
  const diagnostics = [];
  try {
    const d1 = NodeSqliteDriver.file(file);
    const s1 = new MirrorStore({
      driver: d1,
      keys,
      random: counterRandom(),
      clock: () => T0,
      onDiagnostic: (msg, detail) => diagnostics.push({ msg, detail }),
    });
    await s1.open();
    assert.equal(await s1.lastResetAudit(), null);
    await s1.appendEvents([foreground({ id: 'evt_pre_reset', at: iso(0) })]);
    await s1.deleteAll();
    await s1.recordResetAudit({
      at: T0 + 5_000,
      day: '2026-10-25',
      reason: 'user_delete_all',
      previousHistoryStartDay: '2026-10-21',
    });
    assert.ok(diagnostics.some((d) => d.msg === 'store reset recorded' && d.detail?.day === '2026-10-25'));
    d1.close();

    const d2 = NodeSqliteDriver.file(file);
    const s2 = new MirrorStore({ driver: d2, keys, random: counterRandom(), clock: () => T0 });
    await s2.open();
    const audit = await s2.lastResetAudit();
    assert.deepEqual(audit, {
      at: T0 + 5_000,
      day: '2026-10-25',
      reason: 'user_delete_all',
      previousHistoryStartDay: '2026-10-21',
    });
    d2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('earliestEventAt ignores intent_label rows and earliestSessionStart returns earliest session', async () => {
  const { s, close } = await makeStore();
  try {
    assert.equal(await s.earliestEventAt(), null);
    assert.equal(await s.earliestSessionStart(), null);

    const appended = await s.appendEvents([
      {
        schema_version: 1,
        id: 'lbl_early_0001',
        kind: 'intent_label',
        at: iso(1_000),
        tier: 'D',
        origin: 'user',
        content: 'metadata',
        session_id: 'ses_00000001',
        label: 'intentional',
      },
      foreground({ id: 'evt_usage_0001', at: iso(10_000) }),
      background({ id: 'evt_usage_0002', at: iso(40_000) }),
    ]);
    assert.deepEqual(appended.rejected, []);
    assert.equal(appended.inserted, 3);
    assert.equal(await s.earliestEventAt(), T0 + 10_000);

    await s.applySessions({
      window: { fromMs: T0, toMs: T0 + 100_000 },
      sessions: [{ id: 'ses_00000001', app: 'org.wikipedia', start_ms: T0 + 10_000, end_ms: T0 + 40_000, duration_ms: 30_000 }],
      assignments: [],
    });
    assert.equal(await s.earliestSessionStart(), T0 + 10_000);
  } finally {
    close();
  }
});

test('replaceUsageEventsForWindow purges leftover/duplicate OS intervals (e.g. frozen ChatGPT 78m / 31m+47m) while preserving intent_label and earlier-day sittings', async () => {
  const { s, close } = await makeStore();
  const MIN = 60_000;
  const CHATGPT = 'com.openai.chatgpt';
  const dayFrom = T0;
  const dayTo = T0 + 86_400_000;
  try {
    // 1) Yesterday sitting (ends before dayFrom -> must NOT be touched)
    // 2) User intent_label inside today -> must NOT be touched
    // 3) Stale pre-fix ChatGPT 78m sitting + duplicate incremental 31m sitting inside today -> MUST be purged
    await s.appendEvents([
      foreground({ id: 'evt_fg_yest01', app: 'com.whatsapp', at: iso(-50 * MIN) }),
      background({ id: 'evt_bg_yest01', app: 'com.whatsapp', at: iso(-30 * MIN), duration_ms: 20 * MIN }),
      {
        schema_version: 1,
        id: 'lbl_keep_0001',
        kind: 'intent_label',
        at: iso(120 * MIN),
        tier: 'D',
        origin: 'user',
        content: 'metadata',
        session_id: 'ses_00000001',
        label: 'intentional',
      },
      foreground({ id: 'evt_fg_stale78', app: CHATGPT, at: iso(20 * MIN) }),
      background({ id: 'evt_bg_stale78', app: CHATGPT, at: iso(98 * MIN), duration_ms: 78 * MIN }),
      foreground({ id: 'evt_fg_dup31', app: CHATGPT, at: iso(36 * MIN) }),
      background({ id: 'evt_bg_dup31', app: CHATGPT, at: iso(67 * MIN), duration_ms: 31 * MIN }),
    ]);

    // Authoritative rebuilt today events: ChatGPT 47m ([20m, 67m]) + YouTube 36m ([200m, 236m])
    const rebuiltToday = [
      foreground({ id: 'evt_fg_clean47', app: CHATGPT, at: iso(20 * MIN) }),
      background({ id: 'evt_bg_clean47', app: CHATGPT, at: iso(67 * MIN), duration_ms: 47 * MIN }),
      foreground({ id: 'evt_fg_yt36', app: 'com.google.android.youtube', at: iso(200 * MIN) }),
      background({ id: 'evt_bg_yt36', app: 'com.google.android.youtube', at: iso(236 * MIN), duration_ms: 36 * MIN }),
    ];

    const res = await s.replaceUsageEventsForWindow({ fromMs: dayFrom, toMs: dayTo }, rebuiltToday);
    assert.equal(res.deleted, 4, 'purges both stale 78m pair and duplicate 31m pair');
    assert.equal(res.inserted, 4, 'inserts clean 47m ChatGPT pair + 36m YouTube pair');

    // Re-running with identical authoritative events is a zero-churn no-op
    const secondPass = await s.replaceUsageEventsForWindow({ fromMs: dayFrom, toMs: dayTo }, rebuiltToday);
    assert.equal(secondPass.deleted, 0);
    assert.equal(secondPass.inserted, 0);
    assert.equal(secondPass.unchanged, 4);

    const allEvents = await s.events();
    const ids = allEvents.map((e) => e.id).sort();
    assert.deepEqual(ids, [
      'evt_bg_clean47',
      'evt_bg_yest01',
      'evt_bg_yt36',
      'evt_fg_clean47',
      'evt_fg_yest01',
      'evt_fg_yt36',
      'lbl_keep_0001',
    ]);
  } finally {
    close();
  }
});

test('(d) 14 days of stored events -> ingest builds sittings for all 14 days, and reopening the app across days never reduces them', async () => {
  const { s, close } = await makeStore();
  const IST_OFFSET = 330; // Asia/Calcutta (+05:30)
  const DAY = 86_400_000;
  const MIN = 60_000;
  try {
    // Populate 14 consecutive local days (2026-10-16 .. 2026-10-29 IST) with realistic sub-second UsageEvents
    const allDays = [];
    for (let i = 0; i < 14; i += 1) {
      const day = mobileIngest.localDayKey(Date.parse('2026-10-16T06:00:00.000Z') + i * DAY, IST_OFFSET);
      allDays.push(day);
      const dStart = core.dayStartMs(day, IST_OFFSET);
      const rawRows = [
        { packageName: 'com.google.android.youtube', className: '.WatchActivity', eventType: 1, timeStamp: dStart + 9 * 3_600_000 + 123 },
        { packageName: 'com.google.android.youtube', className: '.WatchActivity', eventType: 2, timeStamp: dStart + 9 * 3_600_000 + 25 * MIN + 789 },
        { packageName: 'com.openai.chatgpt', className: '.MainActivity', eventType: 1, timeStamp: dStart + 13 * 3_600_000 + 850 },
        { packageName: 'com.openai.chatgpt', className: '.MainActivity', eventType: 2, timeStamp: dStart + 13 * 3_600_000 + 22 * MIN + 120 },
        { packageName: 'com.discord', className: '.MainActivity', eventType: 1, timeStamp: dStart + 19 * 3_600_000 + 444 },
        { packageName: 'com.discord', className: '.MainActivity', eventType: 2, timeStamp: dStart + 19 * 3_600_000 + 15 * MIN + 912 },
      ];
      const built = core.buildUsageEvents(rawRows, { sinceMs: dStart, untilMs: dStart + DAY });
      await s.appendEvents(built.events);
    }

    const initialEventCount = (await s.counts()).total;
    assert.equal(initialEventCount, 14 * 6, 'all 14 days have 3 fg + 3 bg = 6 stored events each');

    // Run ingest on 2026-10-29 12:21 IST
    const nowOct29 = Date.parse('2026-10-29T06:51:00.000Z');
    await mobileIngest.ingestRecentDays(s, nowOct29, IST_OFFSET);

    const afterInitial = await s.dayRowCounts(IST_OFFSET);
    assert.equal(afterInitial.length, 14);
    for (const row of afterInitial) {
      assert.equal(row.events, 6, `${row.day} keeps all 6 events`);
      assert.equal(row.sessions, 3, `${row.day} has all 3 sittings built`);
    }

    const focusInitial = core.computeFocusWindows({
      sessions: (await s.sessions()).map((r) => ({ id: r.id, app: r.app, startMs: r.start_ms, endMs: r.end_ms })),
      utcOffsetMinutes: IST_OFFSET,
    });
    assert.equal(focusInitial.distinctDays, 14, 'Focus Windows sees all 14 days');

    // Simulate reopening the app later on Oct 29, then Oct 30 (when Android's 7-day UsageEvents buffer
    // only retains Oct 24..30 and older days Oct 16..23 have rolled off OS buffer), then Nov 3:
    await mobileIngest.ingestRecentDays(s, Date.parse('2026-10-29T15:30:00.000Z'), IST_OFFSET);

    const nowOct30 = Date.parse('2026-10-30T06:51:00.000Z');
    const oct30Start = core.dayStartMs('2026-10-30', IST_OFFSET);
    const mockUsageSource = {
      available: true,
      hasPermission: async () => true,
      openSettings: () => {},
      getLauncherPackages: async () => ['com.mi.android.globallauncher'],
      queryUsageStats: async () => [],
      queryEventsDebug: async () => [],
      queryEvents: async () => [
        { packageName: 'com.whatsapp', className: '.HomeActivity', eventType: 1, timeStamp: oct30Start + 10 * 3_600_000 + 333 },
        { packageName: 'com.whatsapp', className: '.HomeActivity', eventType: 2, timeStamp: oct30Start + 10 * 3_600_000 + 12 * MIN + 777 },
      ],
    };
    await core.collectUsage(mockUsageSource, s, { now: nowOct30, ignorePackages: ['com.mi.android.globallauncher'] });
    await mobileIngest.ingestRecentDays(s, nowOct30, IST_OFFSET);
    await mobileIngest.ingestRecentDays(s, Date.parse('2026-11-03T04:00:00.000Z'), IST_OFFSET);

    const afterReopens = await s.dayRowCounts(IST_OFFSET);
    const byDay = new Map(afterReopens.map((r) => [r.day, r]));
    for (const day of allDays) {
      const row = byDay.get(day);
      assert.ok(row, `day ${day} still present after app reopens`);
      assert.equal(row.events, 6, `${day} never lost any stored events`);
      assert.equal(row.sessions, 3, `${day} never lost any derived sittings`);
    }
    assert.equal(byDay.get('2026-10-30')?.sessions, 1, 'new day sitting also added cleanly');
  } finally {
    close();
  }
});

test('(c) one-time non-destructive session repair restores 4f27118 sub-second truncated sittings (0 -> 43 on 2026-10-28, 3 -> 10 days) without deleting events', async () => {
  const { s, close } = await makeStore();
  const IST_OFFSET = 330;
  const DAY = 86_400_000;
  const MIN = 60_000;
  try {
    // 1. Build 9 complete days (2026-10-20 .. 2026-10-28) + 2026-10-29 with sub-second timestamps,
    //    matching 2026-10-28's 55 raw opens -> 43 merged sittings and YouTube 80m, ChatGPT 78m, Discord 27m:
    const originalOct28SessionIds = [];
    for (let d = 9; d >= 0; d -= 1) {
      const day = mobileIngest.localDayKey(Date.parse('2026-10-29T06:51:00.000Z') - d * DAY, IST_OFFSET);
      const dStart = core.dayStartMs(day, IST_OFFSET);
      const rawRows = [];
      if (day === '2026-10-28') {
        let cursor = dStart + 8 * 3_600_000 + 347;
        for (let i = 0; i < 20; i += 1) {
          const dur = 4 * MIN + (i % 2 === 0 ? 112 : -112);
          rawRows.push({ packageName: 'com.google.android.youtube', className: '.Watch', eventType: 1, timeStamp: cursor });
          rawRows.push({ packageName: 'com.google.android.youtube', className: '.Watch', eventType: 2, timeStamp: cursor + dur });
          cursor += dur + (i < 6 ? 5 * MIN + 231 : 18 * MIN + 231);
        }
        for (let i = 0; i < 20; i += 1) {
          const dur = Math.round(3.9 * MIN) + (i % 2 === 0 ? 419 : -419);
          rawRows.push({ packageName: 'com.openai.chatgpt', className: '.MainActivity', eventType: 1, timeStamp: cursor });
          rawRows.push({ packageName: 'com.openai.chatgpt', className: '.MainActivity', eventType: 2, timeStamp: cursor + dur });
          cursor += dur + (i < 6 ? 4 * MIN + 613 : 16 * MIN + 613);
        }
        for (let i = 0; i < 15; i += 1) {
          const dur = Math.round(1.8 * MIN) + (i % 3 === 0 ? 508 : -254);
          rawRows.push({ packageName: 'com.discord', className: '.Main', eventType: 1, timeStamp: cursor });
          rawRows.push({ packageName: 'com.discord', className: '.Main', eventType: 2, timeStamp: cursor + dur });
          cursor += dur + 16 * MIN + 119;
        }
      } else if (day === '2026-10-29') {
        rawRows.push({ packageName: 'com.whatsapp', className: '.Home', eventType: 1, timeStamp: dStart + 3 * 3_600_000 + 412 });
        rawRows.push({ packageName: 'com.whatsapp', className: '.Home', eventType: 2, timeStamp: dStart + 3 * 3_600_000 + 6 * MIN + 881 });
      } else {
        let cursor = dStart + 9 * 3_600_000 + 219;
        for (let i = 0; i < 13; i += 1) {
          const app = i % 2 === 0 ? 'com.google.android.youtube' : 'com.discord';
          const dur = 5 * MIN + 333;
          rawRows.push({ packageName: app, className: '.Main', eventType: 1, timeStamp: cursor });
          rawRows.push({ packageName: app, className: '.Main', eventType: 2, timeStamp: cursor + dur });
          cursor += dur + (i === 0 ? 4 * MIN : 20 * MIN) + 147;
        }
      }

      const built = core.buildUsageEvents(rawRows, { sinceMs: dStart, untilMs: dStart + DAY });
      if (day === '2026-10-28') {
        for (const ses of core.sessionize(built.events).sessions) {
          originalOct28SessionIds.push(ses.id);
        }
        assert.equal(originalOct28SessionIds.length, 43);
      }

      if (day <= '2026-10-22') {
        // Untouched older days outside 4f27118's 6-day loop: both fg and bg + sessions intact
        await s.appendEvents(built.events);
        await mobileIngest.ingestDay(s, day, IST_OFFSET);
      } else {
        // Damaged days (2026-10-23 .. 2026-10-29): 4f27118 dropped app_foreground rows and wiped sessions to 0
        await s.appendEvents(built.events.filter((e) => e.kind === 'app_background'));
      }
    }

    const damagedCounts = await s.dayRowCounts(IST_OFFSET);
    const oct28Before = damagedCounts.find((r) => r.day === '2026-10-28');
    assert.equal(oct28Before.fgEvents, 0);
    assert.equal(oct28Before.bgEvents, 55);
    assert.equal(oct28Before.sessions, 0);
    const damagedEventsTotal = (await s.counts()).total;
    assert.equal(damagedEventsTotal, 199);

    // 2. Run ingestRecentDays -> triggers one-time non-destructive repairSessionsFromStoredEvents
    const nowOct29 = Date.parse('2026-10-29T06:51:00.000Z');
    await mobileIngest.ingestRecentDays(s, nowOct29, IST_OFFSET);

    const postRepairTotal = (await s.counts()).total;
    assert.equal(postRepairTotal, 320, '0 events deleted; +121 missing app_foreground events appended');

    const repairedCounts = await s.dayRowCounts(IST_OFFSET);
    const oct28After = repairedCounts.find((r) => r.day === '2026-10-28');
    assert.equal(oct28After.fgEvents, 55);
    assert.equal(oct28After.bgEvents, 55);
    assert.equal(oct28After.sessions, 43, 'all 43 sittings on 2026-10-28 restored');
    for (const row of repairedCounts) {
      assert.ok(row.sessions > 0, `${row.day} has derived sittings restored`);
    }

    const oct28From = core.dayStartMs('2026-10-28', IST_OFFSET);
    const restoredOct28Sessions = await s.sessions({ fromMs: oct28From, toMs: oct28From + DAY });
    assert.deepEqual(
      restoredOct28Sessions.map((r) => r.id),
      originalOct28SessionIds,
      'restored session IDs on 2026-10-28 match original sittings byte-for-byte',
    );

    const snap = await s.lastSessionRepairSnapshot();
    assert.ok(snap);
    assert.equal(snap.recoveredFgEvents, 121);
    assert.equal(snap.rebuiltDays, 10);
  } finally {
    close();
  }
});


