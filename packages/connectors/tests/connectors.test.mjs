/**
 * packages/connectors/tests/connectors.test.mjs
 *
 * The registry is a permission surface, so these tests are written as an
 * adversarial reviewer would: they try to add an over-broad scope, a write
 * scope, a scraping provider, a password flow and an unused scope, and require
 * the validator to refuse each one with a field-level reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const c = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'connectors.mjs') });
const { CONNECTORS, REFUSED_SOURCES, SCOPE_ALLOWLIST, validateConnector, validateRegistry, describeConsent, REGISTRY_ERRORS } = c;

const clone = (x) => JSON.parse(JSON.stringify(x));
const problemsFor = (mutate) => {
  const connector = clone(CONNECTORS[0]);
  mutate(connector);
  return validateConnector(connector);
};
const has = (problems, field, pattern) => problems.some((p) => p.field === field && (!pattern || pattern.test(p.message)));

/* -------------------------------------------------------------- the registry */

test('the shipped registry is valid', () => {
  assert.deepEqual(REGISTRY_ERRORS, []);
  assert.deepEqual(validateRegistry(), []);
  assert.ok(CONNECTORS.length >= 3, 'a registry with fewer than three connectors is not a registry');
});

test('every connector is tier A, origin api, OAuth 2.0, app-scheme redirect', () => {
  for (const connector of CONNECTORS) {
    assert.equal(connector.tier, 'A');
    assert.equal(connector.origin, 'api');
    assert.equal(connector.auth, 'oauth2');
    assert.match(connector.redirectUri, /^mirror:\/\/oauth\//);
    assert.ok(connector.hosts.length > 0 && !connector.hosts.some((h) => h.includes('*')));
  }
});

test('no connector asks for a write, admin or messaging scope', () => {
  const all = CONNECTORS.flatMap((x) => x.scopes);
  for (const scope of all) {
    assert.doesNotMatch(scope.toLowerCase(), /(write|upload|delete|moderate|admin|manage|follow|message|dm)/, `over-broad scope: ${scope}`);
  }
});

test('every requested scope is used by at least one collector', () => {
  for (const connector of CONNECTORS) {
    const used = new Set(connector.collectors.flatMap((x) => x.scopes));
    for (const scope of connector.scopes) assert.ok(used.has(scope), `${connector.id} requests unused scope ${scope}`);
  }
});

test('the refused list explains itself, and none of it is in the registry', () => {
  assert.ok(REFUSED_SOURCES.length >= 3);
  for (const refused of REFUSED_SOURCES) {
    assert.ok(!CONNECTORS.some((x) => x.id === refused.id), `${refused.id} is both refused and registered`);
    assert.ok(refused.reason.length > 30, `${refused.id} needs a reason a person can read`);
  }
});

/* -------------------------------------------------------------- adversarial */

test('an unknown scope is refused', () => {
  const problems = problemsFor((x) => x.scopes.push('identity'));
  assert.ok(has(problems, 'scopes', /not in the allowlist/));
});

test('a write scope is refused even if a provider would grant it', () => {
  const problems = problemsFor((x) => x.scopes.push('submit'));
  assert.ok(problems.length > 0);
  const comment = problemsFor((x) => x.scopes.push('read:comment'));
  assert.ok(has(comment, 'scopes', /never writes/), 'a comment scope must be refused');
});

test('a scope with no collector using it is refused (minimisation)', () => {
  const problems = problemsFor((x) => {
    x.scopes.push('save');
    // already used by a collector, so add a new unused one instead
    x.scopes.push('read');
  });
  // both are used already; the real case is a fresh unused scope:
  const connector = clone(CONNECTORS[0]);
  connector.collectors = connector.collectors.filter((col) => !col.scopes.includes('save'));
  assert.ok(has(validateConnector(connector), 'scopes', /no collector uses it/));
});

test('a password flow is refused', () => {
  const problems = problemsFor((x) => (x.auth = 'password'));
  assert.ok(has(problems, 'auth', /password flows are forbidden/));
});

test('a web callback redirect is refused', () => {
  const problems = problemsFor((x) => (x.redirectUri = 'https://mirror.example/cb'));
  assert.ok(has(problems, 'redirectUri'));
});

test('a wildcard host is refused', () => {
  const problems = problemsFor((x) => x.hosts.push('*.reddit.com'));
  assert.ok(has(problems, 'hosts', /wildcard/));
});

test('a non-A tier, a non-api origin and a non-api_item collector are refused', () => {
  assert.ok(has(problemsFor((x) => (x.tier = 'C')), 'tier'));
  assert.ok(has(problemsFor((x) => (x.origin = 'os')), 'origin'));
  assert.ok(has(problemsFor((x) => (x.collectors[0].kind = 'web_visit')), 'collectors.saved-posts'));
});

test('a collector may not use an undeclared scope', () => {
  const problems = problemsFor((x) => x.collectors[0].scopes.push('history'));
  assert.ok(has(problems, 'collectors.saved-posts', /without declaring it/));
});

test('a provider with no scope allowlist cannot be registered', () => {
  const connector = clone(CONNECTORS[0]);
  connector.id = 'instagram-saved';
  assert.ok(has(validateConnector(connector), 'id', /no scope allowlist/));
});

test('a connector with no collectors, or a vague description, is refused', () => {
  assert.ok(has(problemsFor((x) => (x.collectors = [])), 'collectors'));
  assert.ok(has(problemsFor((x) => (x.collectors[0].plainLanguage = 'saved')), 'collectors.saved-posts'));
});

test('a non-one-tap revoke is refused', () => {
  assert.ok(has(problemsFor((x) => (x.retention.revoke = 'email-support')), 'retention'));
});

test('duplicate connector ids are refused at the registry level', () => {
  const registry = [clone(CONNECTORS[0]), clone(CONNECTORS[0])];
  assert.ok(validateRegistry(registry).some((p) => p.field === 'id' && /duplicate/.test(p.message)));
});

/* ----------------------------------------------------------- consent copy -- */

test('consent copy says what is shared, and says what Mirror never does', () => {
  for (const connector of CONNECTORS) {
    const summary = describeConsent(connector);
    assert.ok(summary.headline.includes('never posts'), `${connector.id} must say it never posts`);
    assert.equal(summary.items.length, connector.collectors.length);
    assert.ok(summary.revoke.includes('one tap'));
    const text = [summary.headline, ...summary.items, summary.revoke].join(' ');
    assert.doesNotMatch(text, /\bDIP\b|\bPIP\b/, 'consent copy uses plain words, not internal abbreviations');
  }
});

/* ---------------------------------------------------------------- property -- */

test('property: any unknown scope added to any connector is refused', () => {
  const known = new Set(Object.values(SCOPE_ALLOWLIST).flat());
  fc.assert(
    fc.property(fc.integer({ min: 0, max: CONNECTORS.length - 1 }), fc.stringMatching(/^[a-z][a-z0-9:_-]{2,20}$/), (index, scope) => {
      if (known.has(scope)) return true;
      const connector = clone(CONNECTORS[index]);
      connector.scopes.push(scope);
      connector.collectors[0].scopes.push(scope);
      return validateConnector(connector).some((p) => p.field === 'scopes');
    }),
    { numRuns: 100 },
  );
});

test('property: every valid connector round-trips through JSON unchanged', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: CONNECTORS.length - 1 }), (index) => {
      const connector = CONNECTORS[index];
      return JSON.stringify(JSON.parse(JSON.stringify(connector))) === JSON.stringify(connector);
    }),
  );
});
