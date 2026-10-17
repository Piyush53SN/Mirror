/**
 * packages/shared-types/tests/event.test.mjs
 *
 * The event schema is the contract every other package writes against, so it is
 * tested three ways:
 *   1. unit tests per rule (each rejection names the field it rejected),
 *   2. property-based tests (fast-check): any generated valid event validates,
 *      any single-field mutation is rejected, and topic vectors are checked as
 *      vectors rather than as arrays of numbers,
 *   3. a cross-check that the JSON Schema description and the executable
 *      validator agree on the field set, the enums and the required fields.
 *
 * Run: node --test packages/shared-types/tests/event.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const SCHEMA = JSON.parse(readFileSync(join(PKG, 'schema/event.schema.json'), 'utf8'));

const t = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'types.mjs') });
const { validateEvent, assertEvent, validateTopicVector, KIND_FIELDS, KIND_REQUIRED, SCHEMA_VERSION, TIERS, TOPIC_VECTOR_DIM } = t;

/* ------------------------------------------------------------------ helpers -- */

const base = (over = {}) => ({
  schema_version: SCHEMA_VERSION,
  id: 'evt_00000001',
  kind: 'app_foreground',
  at: '2026-10-14T19:02:11Z',
  tier: 'D',
  origin: 'os',
  content: 'metadata',
  app: 'com.google.android.youtube',
  ...over,
});

const errorsOf = (event) => {
  const r = validateEvent(event);
  assert.equal(r.ok, false, `expected ${JSON.stringify(event)} to be rejected`);
  return r.errors;
};

const rejects = (event, path) => {
  const errors = errorsOf(event);
  assert.ok(
    errors.some((e) => e.path === path),
    `expected an error on "${path}", got ${JSON.stringify(errors)}`,
  );
};

/** A valid 32-d unit vector: a direction, rounded to 4 decimals. */
function unitVector(seed = 1, dim = TOPIC_VECTOR_DIM) {
  const raw = Array.from({ length: dim }, (_, i) => Math.sin(seed * 12.9898 + i * 78.233));
  const norm = Math.sqrt(raw.reduce((a, b) => a + b * b, 0));
  return raw.map((v) => Math.round((v / norm) * 10_000) / 10_000);
}

const HASH = 'a'.repeat(64);

/* -------------------------------------------------------------------- happy -- */

test('a valid tier-D foreground event validates', () => {
  const r = validateEvent(base());
  assert.equal(r.ok, true);
  assert.equal(r.value.app, 'com.google.android.youtube');
});

test('each kind validates with its required fields', () => {
  const events = [
    base({ id: 'evt_bg_0001', kind: 'app_background', duration_ms: 41_000 }),
    base({ id: 'evt_unlock_1', kind: 'device_unlock', app: undefined }),
    base({
      id: 'evt_web_0001',
      kind: 'web_visit',
      tier: 'C',
      origin: 'extension',
      content: 'content',
      consent: 'grant_web',
      app: undefined,
      host: 'youtube.com',
      duration_ms: 90_000,
      scroll_depth: 0.4,
      completion_ratio: 0.8,
      query: 'metering black and white',
      item_hash: HASH,
      topic_vector: unitVector(),
      session_id: 'ses_000001ab',
    }),
    base({ id: 'evt_api_0001', kind: 'api_item', tier: 'A', origin: 'api', content: 'content', consent: 'grant_reddit', app: undefined, source_id: 'reddit', action: 'saved', subject: 'zone system', item_hash: HASH, topic_vector: unitVector(2) }),
    base({ id: 'evt_imp_0001', kind: 'import_item', tier: 'B', origin: 'export', content: 'content', consent: 'grant_takeout', app: undefined, source_id: 'youtube', export_format: 'takeout', subject: 'darkroom', item_hash: HASH, topic_vector: unitVector(3) }),
    base({ id: 'evt_int_0001', kind: 'intent_label', origin: 'user', content: 'content', app: undefined, session_id: 'ses_000002cd', label: 'intentional' }),
    base({ id: 'evt_foc_0001', kind: 'focus_window', app: undefined, window_id: 'win_000001', phase: 'start', session_id: 'ses_000003ef' }),
  ];
  for (const event of events) {
    const r = validateEvent(event);
    assert.equal(r.ok, true, `${event.kind}: ${JSON.stringify(r.errors)}`);
  }
});

test('optional ratios may be absent — "not measured" is not zero', () => {
  const clean = base({ id: 'evt_web_0002', kind: 'web_visit', tier: 'C', origin: 'extension', content: 'content', consent: 'g', app: undefined, host: 'arxiv.org', duration_ms: 1000 });
  assert.equal(validateEvent(clean).ok, true);
  assert.equal('scroll_depth' in clean, false);
  assert.equal('completion_ratio' in clean, false);
});

/* ------------------------------------------------------- the named fields -- */

test('session_id: optional on raw events, required on an intent label, validated when present', () => {
  assert.equal(validateEvent(base({ session_id: 'ses_abcdef1' })).ok, true);
  rejects(base({ session_id: 'session-1' }), 'session_id');
  rejects(base({ session_id: 'ses_' }), 'session_id');

  const label = base({ id: 'evt_int_0002', kind: 'intent_label', origin: 'user', content: 'content', app: undefined, label: 'mindless' });
  rejects(label, 'session_id');
});

test('item_hash: exactly 64 lowercase hex characters, and only on content events', () => {
  const visit = { id: 'evt_web_0003', kind: 'web_visit', tier: 'C', origin: 'extension', content: 'content', consent: 'g', app: undefined, host: 'a.com', duration_ms: 1 };
  assert.equal(validateEvent(base({ ...visit, item_hash: HASH })).ok, true);
  rejects(base({ ...visit, item_hash: 'A'.repeat(64) }), 'item_hash');
  rejects(base({ ...visit, item_hash: 'a'.repeat(63) }), 'item_hash');
  rejects(base({ ...visit, item_hash: 'not-a-hash' }), 'item_hash');
  rejects(base({ ...visit, item_hash: HASH, content: 'metadata' }), 'item_hash');
});

test('topic_vector: 32 dimensions, finite, in range, and a unit vector', () => {
  const visit = { id: 'evt_web_0004', kind: 'web_visit', tier: 'C', origin: 'extension', content: 'content', consent: 'g', app: undefined, host: 'a.com', duration_ms: 1 };
  assert.equal(validateEvent({ ...base(), ...visit, topic_vector: unitVector() }).ok, true);
  assert.equal(validateTopicVector(unitVector()).length, 0);

  assert.ok(validateTopicVector(new Array(31).fill(0.1)).length > 0, 'wrong dimension must fail');
  assert.ok(validateTopicVector([...new Array(31).fill(0), Number.NaN]).length > 0, 'NaN must fail');
  assert.ok(validateTopicVector([...new Array(31).fill(0), 2]).length > 0, 'out of range must fail');
  assert.ok(validateTopicVector(new Array(32).fill(0)).length > 0, 'the zero vector is not a direction');
  assert.ok(validateTopicVector(unitVector().map((v) => v * 3)).length > 0, 'a non-unit vector must fail');
});

test('completion_ratio: 0..1, and it marks the event content', () => {
  const visit = { id: 'evt_web_0005', kind: 'web_visit', tier: 'C', origin: 'extension', consent: 'g', app: undefined, host: 'a.com', duration_ms: 1 };
  assert.equal(validateEvent({ ...base(), ...visit, content: 'content', completion_ratio: 0 }).ok, true);
  assert.equal(validateEvent({ ...base(), ...visit, content: 'content', completion_ratio: 1 }).ok, true);
  rejects(base({ ...visit, content: 'content', completion_ratio: 1.01 }), 'completion_ratio');
  rejects(base({ ...visit, content: 'metadata', completion_ratio: 0.5 }), 'completion_ratio');
});

test('content-derived fields may not ride on a metadata event', () => {
  const visit = { id: 'evt_web_0006', kind: 'web_visit', tier: 'C', origin: 'extension', consent: 'g', app: undefined, host: 'a.com', duration_ms: 1 };
  rejects(base({ ...visit, content: 'metadata', topic_vector: unitVector() }), 'topic_vector');
});

/* --------------------------------------------------------------- rejections -- */

test('unknown fields are rejected: the schema is closed', () => {
  rejects(base({ deviceId: 'abc' }), 'deviceId');
  rejects(base({ query: 'leaked' }), 'query'); // query is not an app_foreground field
});

test('A/B/C events require a consent grant; D events must not carry one', () => {
  rejects(base({ kind: 'web_visit', tier: 'C', origin: 'extension', host: 'x.com', duration_ms: 1, app: undefined }), 'consent');
  rejects(base({ consent: 'grant_123' }), 'consent');
});

test('the OS cannot produce content: origin os + content content is rejected', () => {
  const errors = errorsOf(base({ content: 'content' }));
  assert.ok(errors.some((e) => e.path === 'content' && /fabricated/.test(e.message)));
});

test('content can come from the extension, an import or an API', () => {
  for (const [tier, origin] of [['C', 'extension'], ['B', 'export'], ['A', 'api']]) {
    const event = base({ id: 'evt_ok_00001', kind: 'web_visit', tier, origin, content: 'content', consent: 'g', host: 'example.com', duration_ms: 5, app: undefined });
    const r = validateEvent(event);
    assert.equal(r.ok, true, `${origin}: ${JSON.stringify(r.errors)}`);
  }
});

test('timestamps must be ISO-8601 UTC', () => {
  rejects(base({ at: '2026-10-14T19:02:11+05:30' }), 'at');
  rejects(base({ at: '14/10/2026' }), 'at');
});

test('a host is a hostname, never a URL', () => {
  rejects(base({ kind: 'web_visit', tier: 'C', origin: 'extension', consent: 'g', host: 'https://youtube.com/watch?v=abc', duration_ms: 1, app: undefined }), 'host');
});

test('durations are finite and bounded; ratios are 0..1', () => {
  rejects(base({ kind: 'app_background', duration_ms: -1 }), 'duration_ms');
  rejects(base({ kind: 'app_background', duration_ms: Number.POSITIVE_INFINITY }), 'duration_ms');
  rejects(base({ kind: 'app_background', duration_ms: 25 * 3600 * 1000 }), 'duration_ms');
  rejects(base({ kind: 'web_visit', tier: 'C', origin: 'extension', consent: 'g', host: 'a.com', duration_ms: 1, scroll_depth: 1.2, app: undefined }), 'scroll_depth');
});

test('package names and ids are validated, not trusted', () => {
  rejects(base({ app: 'YouTube' }), 'app');
  rejects(base({ id: 'short' }), 'id');
  rejects(base({ id: 'has spaces !' }), 'id');
});

test('every rejection says which field and why', () => {
  for (const bad of [base({ tier: 'E' }), base({ at: 'yesterday' }), base({ kind: 'nope' })]) {
    for (const error of errorsOf(bad)) {
      assert.ok(error.path.length > 0, 'a rejection without a path is unusable');
      assert.ok(error.message.length > 5, 'a rejection without a reason is unusable');
    }
  }
});

test('assertEvent throws with the field list', () => {
  assert.throws(() => assertEvent(base({ tier: 'Z' })), /tier/);
  assert.doesNotThrow(() => assertEvent(base()));
});

/* ------------------------------------------------------------ property-based -- */

const arbEvent = fc
  .record({
    id: fc.stringMatching(/^[A-Za-z0-9_-]{8,24}$/),
    at: fc
      .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) })
      .map((ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')),
    duration: fc.integer({ min: 0, max: 86_400_000 }),
    app: fc.constantFrom('com.google.android.youtube', 'com.instagram.android', 'com.whatsapp'),
  })
  .chain(({ id, at, duration, app }) =>
    fc.constantFrom('app_foreground', 'app_background', 'device_unlock', 'web_visit').map((kind) => {
      const common = { schema_version: 1, id, kind, at, tier: 'D', origin: 'os', content: 'metadata' };
      switch (kind) {
        case 'app_foreground':
          return { ...common, app };
        case 'app_background':
          return { ...common, app, duration_ms: duration };
        case 'web_visit':
          return { ...common, tier: 'C', origin: 'extension', consent: 'grant_x', host: 'example.com', duration_ms: duration };
        default:
          return common;
      }
    }),
  );

test('property: every generated valid event validates', () => {
  fc.assert(
    fc.property(arbEvent, (event) => validateEvent(event).ok === true),
    { numRuns: 300 },
  );
});

test('property: dropping any required field makes the event invalid', () => {
  fc.assert(
    fc.property(arbEvent, (event) => {
      const required = ['schema_version', 'id', 'kind', 'at', 'tier', 'origin', 'content', ...KIND_REQUIRED[event.kind]];
      for (const field of required) {
        const copy = { ...event };
        delete copy[field];
        if (field === 'schema_version') copy.schema_version = undefined;
        if (validateEvent(copy).ok) return false;
      }
      return true;
    }),
    { numRuns: 100 },
  );
});

test('property: adding any unknown field makes the event invalid', () => {
  const known = new Set(['schema_version', 'id', 'kind', 'at', 'tier', 'origin', 'content', 'consent', ...Object.values(KIND_FIELDS).flat()]);
  fc.assert(
    fc.property(arbEvent, fc.stringMatching(/^[a-z]{3,10}$/), (event, extra) => {
      if (known.has(extra)) return true;
      return validateEvent({ ...event, [extra]: 1 }).ok === false;
    }),
    { numRuns: 100 },
  );
});

test('property: a random direction normalised to unit length always passes', () => {
  fc.assert(
    fc.property(fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 32, maxLength: 32 }), (raw) => {
      const norm = Math.hypot(...raw);
      if (norm === 0) return true;
      const unit = raw.map((v) => Math.round((v / norm) * 10_000) / 10_000);
      return validateTopicVector(unit).length === 0;
    }),
    { numRuns: 100 },
  );
});

/* --------------------------------------------------- schema <-> validator sync -- */

test('the JSON Schema description agrees with the executable validator', () => {
  assert.ok(SCHEMA.$schema.includes('2020-12'));
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual([...SCHEMA.required].sort(), ['at', 'content', 'id', 'kind', 'origin', 'schema_version', 'tier']);

  const schemaFields = new Set(Object.keys(SCHEMA.properties));
  for (const field of ['schema_version', 'id', 'kind', 'at', 'tier', 'origin', 'content', 'consent', 'session_id', 'item_hash', 'topic_vector', 'completion_ratio']) {
    assert.ok(schemaFields.has(field), `field "${field}" missing from the JSON Schema`);
  }

  // Every kind-specific required field is both in the schema and enforced.
  for (const [kind, required] of Object.entries(KIND_REQUIRED)) {
    for (const field of required) {
      const event = base({ id: 'evt_missing01', kind, app: undefined });
      assert.ok(
        errorsOf(event).some((e) => e.path === field),
        `${kind} must require ${field}`,
      );
    }
  }

  assert.deepEqual([...SCHEMA.properties.kind.enum].sort(), Object.keys(KIND_FIELDS).sort());
  assert.deepEqual([...SCHEMA.properties.tier.enum].sort(), [...TIERS].sort());
  assert.deepEqual([...SCHEMA.properties.origin.enum].sort(), ['api', 'export', 'extension', 'os', 'user']);
  assert.equal(SCHEMA.properties.topic_vector.minItems, TOPIC_VECTOR_DIM);
  assert.equal(SCHEMA.properties.topic_vector.maxItems, TOPIC_VECTOR_DIM);
});
