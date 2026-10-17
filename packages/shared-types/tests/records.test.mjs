/**
 * packages/shared-types/tests/records.test.mjs
 *
 * The three record schemas that sit beside the event stream: consent_log,
 * retention and connections. Each is a promise the app makes, so each test is
 * written as "how could this record make the promise false?"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const read = (name) => JSON.parse(readFileSync(join(PKG, 'schema', name), 'utf8'));
const t = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'types.mjs') });
const {
  validateConsentLog,
  liveConsent,
  eventsCoveredBy,
  validateRetention,
  defaultRetention,
  expiresAt,
  RETENTION_CLASSES,
  validateConnection,
} = t;

const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (issues, path) => issues.some((i) => i.path === path);

/* ----------------------------------------------------------------- consent -- */

const entry = (over = {}) => ({
  schema_version: 1,
  id: 'cns_00000001',
  at: '2026-10-01T10:00:00Z',
  action: 'granted',
  subject: 'reddit',
  tier: 'A',
  scopes: ['read', 'save'],
  promise: 'Reddit will share what you saved. Mirror never posts.',
  method: 'oauth',
  deletes_imported_events: false,
  ...over,
});

const log = (entries) => ({ schema_version: 1, entries });

test('a consent log with a grant, an update and a revocation is valid', () => {
  const value = log([
    entry(),
    entry({ id: 'cns_00000002', at: '2026-10-02T10:00:00Z', action: 'updated', scopes: ['read'] }),
    entry({ id: 'cns_00000003', at: '2026-10-03T10:00:00Z', action: 'revoked', deletes_imported_events: true }),
  ]);
  const r = validateConsentLog(value);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(liveConsent(value).size, 0, 'a revoked grant is not live');
});

test('a revocation must delete what its grant covered', () => {
  const r = validateConsentLog(log([entry(), entry({ id: 'cns_00000002', at: '2026-10-02T10:00:00Z', action: 'revoked' })]));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'entries[1].deletes_imported_events'));
});

test('a revocation with no preceding grant is refused', () => {
  const r = validateConsentLog(log([entry({ action: 'revoked', deletes_imported_events: true })]));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'entries[0].subject'));
});

test('the log is append-only: entries must be in time order', () => {
  const r = validateConsentLog(log([entry({ at: '2026-10-03T10:00:00Z' }), entry({ id: 'cns_00000002', at: '2026-10-01T10:00:00Z' })]));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'entries[1].at'));
});

test('duplicate entry ids, short promises and unknown methods are refused', () => {
  assert.ok(has(validateConsentLog(log([entry(), entry()])).issues, 'entries[1].id'));
  assert.ok(has(validateConsentLog(log([entry({ promise: 'ok' })])).issues, 'entries[0].promise'));
  assert.ok(has(validateConsentLog(log([entry({ method: 'email' })])).issues, 'entries[0].method'));
});

test('re-consenting after a revocation makes the subject live again', () => {
  const value = log([
    entry(),
    entry({ id: 'cns_00000002', at: '2026-10-02T10:00:00Z', action: 'revoked', deletes_imported_events: true }),
    entry({ id: 'cns_00000003', at: '2026-10-03T10:00:00Z', action: 'granted' }),
  ]);
  assert.equal(validateConsentLog(value).ok, true);
  assert.equal(liveConsent(value).get('reddit').id, 'cns_00000003');
});

test('eventsCoveredBy names the entries a revocation deletes, and only those', () => {
  const value = log([
    entry(),
    entry({ id: 'cns_00000002', at: '2026-10-02T10:00:00Z', action: 'updated' }),
    entry({ id: 'cns_00000003', at: '2026-10-03T10:00:00Z', subject: 'spotify', tier: 'A' }),
    entry({ id: 'cns_00000004', at: '2026-10-04T10:00:00Z', action: 'revoked', deletes_imported_events: true }),
  ]);
  const revoke = value.entries[3];
  assert.deepEqual(eventsCoveredBy(revoke, value), ['cns_00000001', 'cns_00000002']);
  assert.deepEqual(eventsCoveredBy(value.entries[0], value), [], 'a grant covers nothing itself');
});

test('consent_log schema requires the same fields the validator enforces', () => {
  const schema = read('consent_log.schema.json');
  const item = schema.properties.entries.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual([...item.required].sort(), [
    'action',
    'at',
    'deletes_imported_events',
    'id',
    'method',
    'promise',
    'schema_version',
    'scopes',
    'subject',
    'tier',
  ]);
  const value = log([entry()]);
  for (const field of item.required) {
    const copy = clone(value);
    delete copy.entries[0][field];
    assert.equal(validateConsentLog(copy).ok, false, `missing ${field} must fail`);
  }
});

/* --------------------------------------------------------------- retention -- */

test('the default retention policy validates for all three windows', () => {
  for (const days of [90, 180, 365]) {
    const r = validateRetention(defaultRetention(days));
    assert.equal(r.ok, true, `${days}: ${JSON.stringify(r.issues)}`);
    assert.equal(r.value.default_days, days);
  }
});

test('retention refuses to keep diagnostics — there are none', () => {
  const policy = defaultRetention();
  policy.classes.diagnostics = 30;
  const r = validateRetention(policy);
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'classes.diagnostics'));
});

test('a class may not outlive the hard-delete bound', () => {
  const policy = defaultRetention();
  policy.classes.raw_events = 400;
  policy.hard_delete_after_days = 365;
  const r = validateRetention(policy);
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'classes.raw_events'));
});

test('revocation and uninstall behaviour is fixed, not configurable', () => {
  const policy = defaultRetention();
  policy.on_revoke = 'keep';
  policy.on_uninstall = 'keep_cloud_copy';
  const r = validateRetention(policy);
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'on_revoke'));
  assert.ok(has(r.issues, 'on_uninstall'));
});

test('an unknown class is refused', () => {
  const policy = defaultRetention();
  policy.classes.telemetry = 30;
  assert.ok(has(validateRetention(policy).issues, 'classes.telemetry'));
});

test('expiresAt computes the documented window, and nothing for diagnostics', () => {
  const policy = defaultRetention(90);
  assert.equal(expiresAt(policy, 'raw_events', '2026-10-01T00:00:00Z'), '2026-12-30T00:00:00Z');
  assert.equal(expiresAt(policy, 'exports', '2026-10-01T00:00:00Z'), '2026-10-08T00:00:00Z');
  assert.equal(expiresAt(policy, 'diagnostics', '2026-10-01T00:00:00Z'), null);
  assert.throws(() => expiresAt(policy, 'raw_events', 'not-a-date'));
});

test('retention schema lists exactly the classes the validator knows', () => {
  const schema = read('retention.schema.json');
  assert.deepEqual([...schema.properties.classes.required].sort(), [...RETENTION_CLASSES].sort());
  assert.equal(schema.properties.classes.additionalProperties, false);
  assert.equal(schema.properties.classes.properties.diagnostics.const, 0);
});

/* ------------------------------------------------------------- connections -- */

const connection = (over = {}) => ({
  schema_version: 1,
  connector_id: 'reddit',
  status: 'connected',
  scopes: ['read', 'save'],
  token_ref: 'keystore:mirror.reddit',
  connected_at: '2026-10-01T10:00:00Z',
  items_imported: 42,
  ...over,
});

const CONTEXT = { connectorIds: ['reddit', 'youtube', 'spotify', 'github'], allowedScopes: { reddit: ['read', 'save'] } };

test('a connected record validates, and holds no credential', () => {
  const r = validateConnection(connection(), CONTEXT);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.ok(!JSON.stringify(r.value).includes('access_token'));
});

test('a token-shaped field is refused by name, even when it looks harmless', () => {
  for (const key of ['access_token', 'refreshToken', 'client_secret', 'password', 'authorization']) {
    const r = validateConnection({ ...connection(), [key]: 'x' }, CONTEXT);
    assert.equal(r.ok, false, `${key} must be refused`);
    assert.ok(r.issues.some((i) => i.path === key), `${key} must be named in the issue`);
  }
  // token_ref is the one allowed reference, and it must be a keystore alias.
  assert.equal(validateConnection(connection({ token_ref: 'abc123' }), CONTEXT).ok, false);
});

test('an unregistered connector, or a scope it never granted, is refused', () => {
  assert.ok(has(validateConnection(connection({ connector_id: 'instagram' }), CONTEXT).issues, 'connector_id'));
  assert.ok(has(validateConnection(connection({ scopes: ['read', 'write'] }), CONTEXT).issues, 'scopes'));
});

test('status and timestamps have to agree', () => {
  assert.ok(has(validateConnection(connection({ status: 'connected', revoked_at: '2026-10-02T10:00:00Z' }), CONTEXT).issues, 'revoked_at'));
  assert.ok(has(validateConnection(connection({ status: 'disconnected' }), CONTEXT).issues, 'revoked_at'));
  assert.equal(
    validateConnection(connection({ status: 'disconnected', revoked_at: '2026-10-02T10:00:00Z' }), CONTEXT).ok,
    true,
  );
  assert.ok(has(validateConnection(connection({ status: 'disconnected', revoked_at: '2026-09-01T10:00:00Z' }), CONTEXT).issues, 'revoked_at'));
});

test('an error record carries a code, never a provider message', () => {
  const error = connection({ status: 'error' });
  assert.ok(has(validateConnection(error, CONTEXT).issues, 'last_error'));
  const coded = connection({ status: 'error', last_error: { at: '2026-10-02T10:00:00Z', code: 'TOKEN_EXPIRED' } });
  assert.equal(validateConnection(coded, CONTEXT).ok, true);
  const verbose = connection({ status: 'error', last_error: { at: '2026-10-02T10:00:00Z', code: 'TOKEN_EXPIRED', message: 'GET https://api.reddit.com failed' } });
  assert.equal(validateConnection(verbose, CONTEXT).ok, false);
  assert.ok(has(validateConnection(verbose, CONTEXT).issues, 'last_error.message'));
  assert.ok(has(validateConnection(connection({ status: 'connected', last_error: { at: '2026-10-02T10:00:00Z', code: 'X' } }), CONTEXT).issues, 'last_error'));
});

test('connections schema is closed and requires the same fields', () => {
  const schema = read('connections.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), ['connector_id', 'items_imported', 'schema_version', 'scopes', 'status', 'token_ref']);
  assert.ok(!Object.keys(schema.properties).some((k) => /token|secret|password/.test(k) && k !== 'token_ref'));
});
