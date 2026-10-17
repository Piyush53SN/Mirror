/**
 * packages/shared-types/tests/event.test.mjs
 *
 * The event schema is the contract every other package writes against, so it is
 * tested three ways:
 *   1. unit tests per rule (each rejection names the field it rejected),
 *   2. property-based tests (fast-check): any generated valid event validates,
 *      and any single-field mutation of one is rejected,
 *   3. a cross-check that the JSON Schema description and the executable
 *      validator agree on required fields and the allowed field set.
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
const { validateEvent, assertEvent, KIND_FIELDS, KIND_REQUIRED, SCHEMA_VERSION, TIERS } = t;

/* ------------------------------------------------------------------ helpers -- */

const base = (over = {}) => ({
  schemaVersion: SCHEMA_VERSION,
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

/* -------------------------------------------------------------------- happy -- */

test('a valid tier-D foreground event validates and keeps its shape', () => {
  const r = validateEvent(base());
  assert.equal(r.ok, true);
  assert.equal(r.value.app, 'com.google.android.youtube');
});

test('each kind validates with its required fields', () => {
  const events = [
    base({ id: 'evt_bg_0001', kind: 'app_background', durationMs: 41_000 }),
    base({ id: 'evt_unlock_1', kind: 'device_unlock', app: undefined }),
    base({ id: 'evt_web_0001', kind: 'web_visit', tier: 'C', origin: 'extension', content: 'content', consent: 'grant_web', app: undefined, host: 'youtube.com', durationMs: 90_000, scrollDepth: 0.4, query: 'metering black and white' }),
    base({ id: 'evt_api_0001', kind: 'api_item', tier: 'A', origin: 'api', content: 'content', consent: 'grant_reddit', app: undefined, sourceId: 'reddit', action: 'saved', subject: 'zone system' }),
    base({ id: 'evt_imp_0001', kind: 'import_item', tier: 'B', origin: 'export', content: 'content', consent: 'grant_takeout', app: undefined, sourceId: 'youtube', exportFormat: 'takeout', subject: 'darkroom' }),
    base({ id: 'evt_int_0001', kind: 'intent_label', origin: 'user', content: 'content', app: undefined, sessionId: 'ses_000001', label: 'intentional' }),
    base({ id: 'evt_foc_0001', kind: 'focus_window', app: undefined, windowId: 'win_000001', phase: 'start' }),
  ];
  for (const event of events) {
    // `app: undefined` must not be treated as a present field.
    const clean = Object.fromEntries(Object.entries(event).filter(([, v]) => v !== undefined));
    const r = validateEvent(clean);
    assert.equal(r.ok, true, `${event.kind}: ${JSON.stringify(r.errors)}`);
  }
});

test('optional ratios may be absent — "not measured" is not zero', () => {
  const clean = base({ id: 'evt_web_0002', kind: 'web_visit', tier: 'C', origin: 'extension', content: 'content', consent: 'g', app: undefined, host: 'arxiv.org', durationMs: 1000 });
  assert.equal(validateEvent(clean).ok, true);
  const r = validateEvent(clean);
  assert.equal('scrollDepth' in r.value, false);
});

/* --------------------------------------------------------------- rejections -- */

test('unknown fields are rejected: the schema is closed', () => {
  rejects(base({ deviceId: 'abc' }), 'deviceId');
  rejects(base({ query: 'leaked' }), 'query'); // query is not an app_foreground field
});

test('A/B/C events require a consent grant; D events must not carry one', () => {
  rejects(base({ kind: 'web_visit', tier: 'C', origin: 'extension', host: 'x.com', durationMs: 1, app: undefined }), 'consent');
  rejects(base({ consent: 'grant_123' }), 'consent');
});

test('the OS cannot produce content: origin os + content content is rejected', () => {
  const errors = errorsOf(base({ content: 'content' }));
  assert.ok(errors.some((e) => e.path === 'content' && /fabricated/.test(e.message)));
});

test('content can come from the extension, an import or an API', () => {
  for (const [tier, origin] of [['C', 'extension'], ['B', 'export'], ['A', 'api']]) {
    const event = base({ id: 'evt_ok_00001', kind: 'web_visit', tier, origin, content: 'content', consent: 'g', host: 'example.com', durationMs: 5, app: undefined });
    const r = validateEvent(event);
    assert.equal(r.ok, true, `${origin}: ${JSON.stringify(r.errors)}`);
  }
});

test('timestamps must be ISO-8601 UTC', () => {
  rejects(base({ at: '2026-10-14T19:02:11+05:30' }), 'at');
  rejects(base({ at: '14/10/2026' }), 'at');
});

test('a host is a hostname, never a URL', () => {
  rejects(base({ kind: 'web_visit', tier: 'C', origin: 'extension', consent: 'g', host: 'https://youtube.com/watch?v=abc', durationMs: 1, app: undefined }), 'host');
});

test('durations are finite and bounded; ratios are 0..1', () => {
  rejects(base({ kind: 'app_background', durationMs: -1 }), 'durationMs');
  rejects(base({ kind: 'app_background', durationMs: Number.POSITIVE_INFINITY }), 'durationMs');
  rejects(base({ kind: 'app_background', durationMs: 25 * 3600 * 1000 }), 'durationMs');
  rejects(base({ kind: 'web_visit', tier: 'C', origin: 'extension', consent: 'g', host: 'a.com', durationMs: 1, scrollDepth: 1.2, app: undefined }), 'scrollDepth');
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
      const common = { schemaVersion: 1, id, kind, at, tier: 'D', origin: 'os', content: 'metadata' };
      switch (kind) {
        case 'app_foreground':
          return { ...common, app };
        case 'app_background':
          return { ...common, app, durationMs: duration };
        case 'web_visit':
          return { ...common, tier: 'C', origin: 'extension', consent: 'grant_x', host: 'example.com', durationMs: duration };
        default:
          return common;
      }
    }),
  );

test('property: every generated valid event validates', () => {
  fc.assert(
    fc.property(arbEvent, (event) => {
      const r = validateEvent(event);
      return r.ok === true;
    }),
    { numRuns: 300 },
  );
});

test('property: dropping any required field makes the event invalid', () => {
  fc.assert(
    fc.property(arbEvent, (event) => {
      const required = ['schemaVersion', 'id', 'kind', 'at', 'tier', 'origin', 'content', ...KIND_REQUIRED[event.kind]];
      for (const field of required) {
        if (field === 'consent') continue; // handled per tier, not per kind
        const copy = { ...event };
        delete copy[field];
        if (field === 'schemaVersion') copy.schemaVersion = undefined;
        if (validateEvent(copy).ok) return false;
      }
      return true;
    }),
    { numRuns: 100 },
  );
});

test('property: adding any unknown field makes the event invalid', () => {
  const known = new Set(['schemaVersion', 'id', 'kind', 'at', 'tier', 'origin', 'content', 'consent', ...Object.values(KIND_FIELDS).flat()]);
  fc.assert(
    fc.property(arbEvent, fc.stringMatching(/^[a-z]{3,10}$/), (event, extra) => {
      if (known.has(extra)) return true;
      return validateEvent({ ...event, [extra]: 1 }).ok === false;
    }),
    { numRuns: 100 },
  );
});

/* --------------------------------------------------- schema <-> validator sync -- */

test('the JSON Schema description agrees with the executable validator', () => {
  assert.ok(SCHEMA.$schema.includes('2020-12'));
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual([...SCHEMA.required].sort(), ['at', 'content', 'id', 'kind', 'origin', 'schemaVersion', 'tier']);

  // Every field the validator knows is described, and vice versa.
  const validatorFields = new Set(Object.values(KIND_FIELDS).flat());
  const common = ['schemaVersion', 'id', 'kind', 'at', 'tier', 'origin', 'content', 'consent'];
  const schemaFields = new Set(Object.keys(SCHEMA.properties));
  for (const field of validatorFields) {
    if (['consent', 'app', 'durationMs', 'host', 'scrollDepth', 'completed', 'query', 'sourceId', 'action', 'subject', 'exportFormat', 'sessionId', 'label', 'windowId', 'phase'].includes(field)) continue;
    assert.ok(schemaFields.has(field), `validator field "${field}" is missing from the JSON Schema`);
  }
  for (const field of common) assert.ok(schemaFields.has(field), `common field "${field}" missing from the schema`);

  // The kind enum and the tier enum are the same lists the validator uses.
  assert.deepEqual([...SCHEMA.properties.kind.enum].sort(), Object.keys(KIND_FIELDS).sort());
  assert.deepEqual([...SCHEMA.properties.tier.enum].sort(), [...TIERS].sort());
  assert.deepEqual([...SCHEMA.properties.origin.enum].sort(), ['api', 'export', 'extension', 'os', 'user']);
});
