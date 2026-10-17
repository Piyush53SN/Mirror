/**
 * tests/config.test.mjs
 *
 * Release configuration is code: it decides what the app asks permission for, so
 * it gets the same treatment as the connectors. These tests are written from the
 * app store reviewer's side — what would make this submission refusable, or this
 * install over-permissioned?
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bundleTs } from '../scripts/lib/ts-bundle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const app = read('apps/mobile/app.json').expo;
const eas = read('apps/mobile/eas.json');
const manifest = read('apps/extension/manifest.json');
const permissionsDoc = readFileSync(join(ROOT, 'docs/ANDROID_PERMISSIONS.md'), 'utf8');
const connectors = await bundleTs(join(ROOT, 'packages/connectors/src/index.ts'), { outfile: join(ROOT, 'tests/.build/connectors.mjs') });

/* ------------------------------------------------------------------ app ids -- */

test('the Android package and iOS bundle id agree, and use one scheme', () => {
  assert.equal(app.android.package, app.ios.bundleIdentifier);
  assert.equal(app.scheme, 'mirror');
  assert.match(app.android.package, /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
});

test('every connector redirect lives under the app scheme', () => {
  for (const connector of connectors.CONNECTORS) {
    assert.ok(connector.redirectUri.startsWith(`${app.scheme}://oauth/`), `${connector.id} redirects to ${connector.redirectUri}`);
  }
});

/* ------------------------------------------------------------ permissions -- */

test('the only Android permission requested is usage access', () => {
  assert.deepEqual(app.android.permissions, ['android.permission.PACKAGE_USAGE_STATS']);
});

test('advertising id, contacts, location, mic, camera, SMS and phone state are blocked', () => {
  const blocked = new Set(app.android.blockedPermissions ?? []);
  for (const permission of [
    'com.google.android.gms.permission.AD_ID',
    'android.permission.READ_CONTACTS',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.RECORD_AUDIO',
    'android.permission.CAMERA',
    'android.permission.READ_SMS',
    'android.permission.READ_CALL_LOG',
    'android.permission.READ_PHONE_STATE',
    'android.permission.ACCESS_LOCAL_NETWORK',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ]) {
    assert.ok(blocked.has(permission), `${permission} must be blocked, not merely unused`);
  }
});

test('every declared permission is documented, and nothing is declared before its feature exists', () => {
  for (const permission of app.android.permissions) {
    assert.ok(permissionsDoc.includes(permission), `${permission} must be explained in docs/ANDROID_PERMISSIONS.md`);
  }
  // Notifications are P4, OAuth/INTERNET is P5: neither is in the manifest yet.
  assert.ok(!app.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));
  assert.ok(!app.android.permissions.includes('android.permission.INTERNET'));
  assert.ok(permissionsDoc.includes('POST_NOTIFICATIONS'), 'the planned notification permission must still be documented');
});

test('boot sync is documented as needing no permission of its own', () => {
  assert.ok(!app.android.permissions.includes('android.permission.RECEIVE_BOOT_COMPLETED'));
  assert.ok(permissionsDoc.includes('RECEIVE_BOOT_COMPLETED'));
  assert.match(permissionsDoc, /WorkManager/);
  assert.match(permissionsDoc, /does \*\*not\*\* request it/);
});

test('forbidden capabilities are never requested, only blocked', () => {
  // `blockedPermissions` is the one list where a forbidden name legitimately
  // appears: that is how a library is stopped from merging it in.
  const requested = JSON.stringify([app.android.permissions, app.plugins, app.ios.infoPlist]);
  for (const forbidden of ['BIND_ACCESSIBILITY_SERVICE', 'SYSTEM_ALERT_WINDOW', 'MEDIA_PROJECTION', 'BIND_NOTIFICATION_LISTENER_SERVICE', 'READ_NOTIFICATION']) {
    assert.ok(!requested.includes(forbidden), `${forbidden} must never be requested`);
  }
  for (const forbidden of ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.QUERY_ALL_PACKAGES', 'com.google.android.gms.permission.AD_ID']) {
    assert.ok(app.android.blockedPermissions.includes(forbidden), `${forbidden} should be actively blocked, not merely unused`);
  }
});

/* ------------------------------------------------------------- app config -- */

test('dark is the default, and telemetry is off as configuration, not as a promise', () => {
  assert.equal(app.userInterfaceStyle, 'dark');
  assert.equal(app.ios.infoPlist.UIUserInterfaceStyle, 'Dark');
  assert.equal(app.extra.telemetry, false);
  assert.equal(app.extra.privacyModeDefault, 'private');
  assert.equal(app.extra.remoteConfig, 'narrow-only');
});

test('the bundle id is stable, and the app targets phones only', () => {
  assert.equal(app.ios.supportsTablet, false);
  assert.equal(app.orientation, 'portrait');
  assert.equal(app.version, '0.1.0');
});

/* -------------------------------------------------------------------- EAS -- */

test('production builds an app bundle, and versions auto-increment remotely', () => {
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.cli.appVersionSource, 'remote');
});

test('development and preview build installable APKs, internal only', () => {
  assert.equal(eas.build.development.android.buildType, 'apk');
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build.preview.distribution, 'internal');
});

test('the store submission starts on the internal track, never production', () => {
  assert.equal(eas.submit.production.android.track, 'internal');
});

test('no secret is committed to EAS or app configuration', () => {
  const text = JSON.stringify([eas, app]);
  for (const forbidden of ['EXPO_TOKEN', 'clientSecret', 'apiKey', 'privateKey', 'password']) {
    assert.ok(!text.includes(forbidden), `config must not contain ${forbidden}`);
  }
});

/* ---------------------------------------------------- extension permissions -- */

test('the extension asks for storage only, and no broad host access', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
  const all = [...manifest.host_permissions, ...manifest.content_scripts.flatMap((s) => s.matches)];
  for (const pattern of all) assert.ok(!pattern.includes('<all_urls>'), '<all_urls> is never allowed');
  for (const forbidden of ['history', 'cookies', 'webRequest', 'tabs', 'bookmarks', 'downloads']) {
    assert.ok(!manifest.permissions.includes(forbidden), `${forbidden} must not be requested`);
  }
});

test('the manifest matches exactly the connector allowlist, and nothing else', () => {
  assert.deepEqual([...manifest.host_permissions].sort(), [...connectors.EXTENSION_MATCH_PATTERNS].sort());
  assert.deepEqual(
    [...new Set(manifest.content_scripts.flatMap((s) => s.matches))].sort(),
    [...connectors.EXTENSION_MATCH_PATTERNS].sort(),
  );
  assert.ok(manifest.host_permissions.length === connectors.EXTENSION_HOSTS.length);
});

test('private and social surfaces are on the never-capture list', () => {
  for (const host of ['mail.google.com', 'web.whatsapp.com']) {
    assert.ok(connectors.NEVER_CAPTURE_HOSTS.includes(host), `${host} must be explicitly refused`);
    assert.ok(!connectors.EXTENSION_HOSTS.includes(host), `${host} must never be captured`);
  }
});

test('the extension declares no externally connectable pages and no page-modifying capability', () => {
  assert.ok(!('externally_connectable' in manifest) || manifest.externally_connectable.matches.length === 0);
  assert.ok(!('content_security_policy' in manifest) || !manifest.content_security_policy.extension_pages.includes('unsafe-eval'));
});
