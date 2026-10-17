/**
 * packages/shared-types/tests/preferences.test.mjs
 *
 * Preferences are a permission surface like the connector registry: the tests
 * push on the edges that matter — defaults, closed sets, and the refusal to let a
 * remote override widen collection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const t = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'types.mjs') });
const { DEFAULT_PREFERENCES, DEFAULT_FLAGS, validatePreferences, validateGrant, applyOverrides, isLive } = t;

const clone = (x) => JSON.parse(JSON.stringify(x));
const issues = (mutate) => {
  const p = clone(DEFAULT_PREFERENCES);
  mutate(p);
  const r = validatePreferences(p);
  assert.equal(r.ok, false, 'expected preferences to be rejected');
  return r.issues;
};
const has = (list, path) => list.some((i) => i.path === path);

/* ---------------------------------------------------------------- defaults -- */

test('the shipped defaults validate', () => {
  const r = validatePreferences(DEFAULT_PREFERENCES);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test('private by default, content off, every social flag off', () => {
  assert.equal(DEFAULT_PREFERENCES.visibility, 'private');
  assert.equal(DEFAULT_PREFERENCES.collectContent, false);
  assert.equal(DEFAULT_PREFERENCES.flags.social, false);
  assert.equal(DEFAULT_PREFERENCES.flags.shareCards, false);
  assert.equal(DEFAULT_PREFERENCES.flags.nudges, false);
  assert.equal(DEFAULT_PREFERENCES.flags.widget, false);
  assert.equal(DEFAULT_PREFERENCES.flags.extensionCapture, false);
  assert.deepEqual(DEFAULT_PREFERENCES.tiers, { A: false, B: false, C: false, D: false });
});

test('notifications are local-only and off until opted in', () => {
  assert.equal(DEFAULT_PREFERENCES.notifications.enabled, false);
  assert.equal(DEFAULT_PREFERENCES.notifications.channel, 'local');
  assert.equal(issues((p) => (p.notifications.channel = 'push'))[0].path, 'notifications.channel');
});

/* -------------------------------------------------------------- validation -- */

test('unknown flags are refused: the flag set is closed', () => {
  assert.ok(has(issues((p) => (p.flags.telemetry = true)), 'flags.telemetry'));
});

test('a non-boolean flag is refused', () => {
  assert.ok(has(issues((p) => (p.flags.social = 'yes')), 'flags.social'));
});

test('public visibility without the social flag is refused', () => {
  assert.ok(has(issues((p) => (p.visibility = 'public')), 'visibility'));
  const p = clone(DEFAULT_PREFERENCES);
  p.visibility = 'public';
  p.flags.social = true;
  assert.equal(validatePreferences(p).ok, true, 'public + social is coherent');
});

test('content without metadata is refused', () => {
  assert.ok(has(issues((p) => ((p.collectMetadata = false), (p.collectContent = true))), 'collectContent'));
});

test('retention is a fixed set, not a free number', () => {
  for (const days of [90, 180, 365]) {
    const p = clone(DEFAULT_PREFERENCES);
    p.retentionDays = days;
    assert.equal(validatePreferences(p).ok, true, `${days} must be allowed`);
  }
  assert.ok(has(issues((p) => (p.retentionDays = 100_000)), 'retentionDays'));
});

test('quiet hours must be valid times', () => {
  assert.ok(has(issues((p) => (p.notifications.quietHours.start = '25:00')), 'notifications.quietHours.start'));
  assert.ok(has(issues((p) => (p.notifications.quietHours.end = '7pm')), 'notifications.quietHours.end'));
});

test('font scale is capped at 200%', () => {
  for (const scale of [0.9, 2.5, Number.NaN]) {
    assert.ok(has(issues((p) => (p.accessibility.fontScale = scale)), 'accessibility.fontScale'), `${scale} must be refused`);
  }
  const p = clone(DEFAULT_PREFERENCES);
  p.accessibility.fontScale = 2;
  assert.equal(validatePreferences(p).ok, true);
});

/* ---------------------------------------------------------------- overrides -- */

test('remote overrides may turn a feature off', () => {
  const { preferences, refused } = applyOverrides(DEFAULT_PREFERENCES, { flags: { focusWindows: false } });
  assert.equal(preferences.flags.focusWindows, false);
  assert.deepEqual(refused, []);
});

test('remote overrides may not turn a feature on', () => {
  const { preferences, refused } = applyOverrides(DEFAULT_PREFERENCES, { flags: { social: true, shareCards: true } });
  assert.equal(preferences.flags.social, false, 'social must stay off');
  assert.equal(preferences.flags.shareCards, false);
  assert.deepEqual(refused.map((r) => r.path).sort(), ['flags.shareCards', 'flags.social']);
  for (const r of refused) assert.match(r.message, /never enable one/);
});

test('remote overrides may not grant a data tier', () => {
  const { preferences, refused } = applyOverrides(DEFAULT_PREFERENCES, { tiers: { A: true, D: true } });
  assert.deepEqual(preferences.tiers, { A: false, B: false, C: false, D: false });
  assert.equal(refused.filter((r) => r.path.startsWith('tiers.')).length, 2);
});

test('a remote override may revoke a tier, and only downwards', () => {
  const withTier = clone(DEFAULT_PREFERENCES);
  withTier.tiers.D = true;
  const { preferences, refused } = applyOverrides(withTier, { tiers: { D: false } });
  assert.equal(preferences.tiers.D, false);
  assert.deepEqual(refused, []);
});

test('remote overrides may not enable notifications', () => {
  const { preferences, refused } = applyOverrides(DEFAULT_PREFERENCES, { notificationsEnabled: true });
  assert.equal(preferences.notifications.enabled, false);
  assert.equal(refused[0].path, 'notifications.enabled');
});

test('unknown override flags are refused, not ignored', () => {
  const { refused } = applyOverrides(DEFAULT_PREFERENCES, { flags: { telemetry: true } });
  assert.equal(refused[0].message, 'unknown flag');
});

test('overrides never break invariants: public collapses to private with social off', () => {
  const publicPrefs = clone(DEFAULT_PREFERENCES);
  publicPrefs.visibility = 'public';
  publicPrefs.flags.social = true;
  const { preferences } = applyOverrides(publicPrefs, { flags: { social: false } });
  assert.equal(preferences.visibility, 'private');
  assert.equal(validatePreferences(preferences).ok, true);
});

/* ------------------------------------------------------------------- grants -- */

const grant = (over = {}) => ({
  id: 'grant_0001',
  subject: 'android usage access',
  tier: 'D',
  scopes: ['usage_access'],
  grantedAt: '2026-10-01T10:00:00Z',
  promise: 'Mirror reads which apps were in front, and for how long. Nothing else.',
  ...over,
});

test('a well-formed grant validates, and a revoked one is not live', () => {
  const live = validateGrant(grant());
  assert.equal(live.ok, true, JSON.stringify(live.issues));
  assert.equal(isLive(live.value, '2026-10-02T00:00:00Z'), true);

  const revoked = validateGrant(grant({ revokedAt: '2026-10-03T10:00:00Z' }));
  assert.equal(revoked.ok, true);
  assert.equal(isLive(revoked.value, '2026-10-04T00:00:00Z'), false);

  assert.equal(isLive(live.value, '2026-09-01T00:00:00Z'), false, 'a grant is not live before it was given');
});

test('a grant must record what was promised', () => {
  const r = validateGrant(grant({ promise: 'ok' }));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'promise'));
});

test('a revocation cannot precede the grant', () => {
  const r = validateGrant(grant({ revokedAt: '2026-09-01T10:00:00Z' }));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'revokedAt'));
});

/* ---------------------------------------------------------------- property -- */

test('property: any override that only disables leaves a valid configuration', () => {
  fc.assert(
    fc.property(fc.dictionary(fc.constantFrom(...Object.keys(DEFAULT_FLAGS)), fc.boolean()), (dict) => {
      const overrides = { flags: {} };
      for (const [key, value] of Object.entries(dict)) overrides.flags[key] = value === false ? false : false;
      const { preferences } = applyOverrides(DEFAULT_PREFERENCES, overrides);
      return validatePreferences(preferences).ok;
    }),
    { numRuns: 50 },
  );
});

test('property: applying an enabling override never enables anything', () => {
  fc.assert(
    fc.property(fc.constantFrom(...Object.keys(DEFAULT_FLAGS)), (flag) => {
      const { preferences } = applyOverrides(DEFAULT_PREFERENCES, { flags: { [flag]: true } });
      const wasOn = DEFAULT_FLAGS[flag];
      return preferences.flags[flag] === wasOn;
    }),
    { numRuns: 50 },
  );
});
