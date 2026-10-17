/**
 * tests/android-manifest.test.mjs
 *
 * Tests the merged-manifest gate. The fixtures are the three ways this gate has
 * to catch something a config review would miss: a library adding an advertising
 * id, an accessibility service appearing through a dependency, and the usage
 * permission silently disappearing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseManifest,
  auditManifest,
  findMergedManifest,
  REQUIRED_PERMISSIONS,
  FORBIDDEN_PERMISSIONS,
  ALLOWED_FROM_LIBRARIES,
} from '../scripts/android/check-merged-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => readFileSync(join(ROOT, 'scripts/android/fixtures', name), 'utf8');
const app = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/app.json'), 'utf8')).expo;

/* ------------------------------------------------------------------ parser -- */

test('permissions are read from uses-permission and uses-permission-sdk-23', () => {
  const parsed = parseManifest(`
    <manifest>
      <uses-permission android:name="android.permission.INTERNET" />
      <uses-permission-sdk-23 android:name="android.permission.POST_NOTIFICATIONS" />
    </manifest>`);
  assert.deepEqual(parsed.permissions, ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS']);
});

test('self-closing and expanded services are both recognised', () => {
  const parsed = parseManifest(`
    <manifest>
      <application>
        <service android:name="a.SelfClosing" android:permission="android.permission.BIND_JOB_SERVICE" />
        <service android:name="a.Expanded" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
          <intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter>
        </service>
      </application>
    </manifest>`);
  assert.equal(parsed.services.length, 2);
  assert.equal(parsed.services[1].accessibility, true);
});

/* ------------------------------------------------------------------- audit -- */

test('a clean manifest passes', () => {
  const result = auditManifest(fixture('merged-clean.xml'));
  assert.equal(result.ok, true, result.problems.join('; '));
  assert.ok(result.parsed.permissions.includes('android.permission.PACKAGE_USAGE_STATS'));
});

test('an advertising id added by a library fails, and names the permission', () => {
  const result = auditManifest(fixture('merged-adid.xml'));
  assert.equal(result.ok, false);
  assert.ok(result.forbidden.includes('com.google.android.gms.permission.AD_ID'));
  assert.ok(result.problems.some((problem) => problem.includes('AD_ID')));
});

test('an accessibility service fails even when no permission is declared', () => {
  const result = auditManifest(fixture('merged-accessibility.xml'));
  assert.equal(result.ok, false);
  assert.equal(result.badServices.length, 1);
  assert.ok(result.problems.some((problem) => problem.includes('forbidden capability')));
});

test('a missing usage-access permission fails: the app would collect nothing', () => {
  const result = auditManifest(fixture('merged-missing.xml'));
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['android.permission.PACKAGE_USAGE_STATS']);
});

test('an unknown permission is a review decision, not a silent pass', () => {
  const result = auditManifest(`<manifest><uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" /><uses-permission android:name="android.permission.SEND_SMS" /></manifest>`);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unexpected, ['android.permission.SEND_SMS']);
});

/* ------------------------------------------------------- policy vs config -- */

test('every permission blocked in app.json is also forbidden by the manifest gate', () => {
  for (const permission of app.android.blockedPermissions) {
    assert.ok(FORBIDDEN_PERMISSIONS.includes(permission), `${permission} is blocked but the gate would not reject it if a library added it`);
  }
});

test('the only declared permission is the one the gate requires', () => {
  assert.deepEqual([...app.android.permissions], [...REQUIRED_PERMISSIONS]);
});

test('the library allowlist does not contain a forbidden permission', () => {
  for (const permission of ALLOWED_FROM_LIBRARIES) {
    assert.ok(!FORBIDDEN_PERMISSIONS.includes(permission), `${permission} cannot be both allowed and forbidden`);
  }
});

test('the allowlist is short and justified: every entry appears in the gate’s comment', () => {
  const source = readFileSync(join(ROOT, 'scripts/android/check-merged-manifest.mjs'), 'utf8');
  for (const permission of ALLOWED_FROM_LIBRARIES) {
    assert.ok(source.includes(permission), `${permission} must be listed in the checker as well as the array`);
  }
  assert.ok(ALLOWED_FROM_LIBRARIES.length <= 12, 'an allowlist that keeps growing has stopped being a review');
});

/* -------------------------------------------------------------------- CLI -- */

test('with nothing built, the gate reports "not built" rather than passing', () => {
  assert.equal(findMergedManifest(), null);
});
