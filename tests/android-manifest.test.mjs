/**
 * tests/android-manifest.test.mjs
 *
 * Tests the merged-manifest gate. The fixtures cover:
 *   - clean release baseline (PACKAGE_USAGE_STATS + WorkManager ACCESS_NETWORK_STATE, no INTERNET)
 *   - debug vs release split for android.permission.INTERNET (Metro in debug, forbidden in release)
 *   - library adding AD_ID
 *   - accessibility service appearing through a dependency
 *   - usage-access permission disappearing
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
  DEBUG_ONLY_PERMISSIONS,
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

test('a clean release manifest (no INTERNET, WorkManager ACCESS_NETWORK_STATE present) passes', () => {
  const result = auditManifest(fixture('merged-clean.xml'), { variant: 'release' });
  assert.equal(result.ok, true, result.problems.join('; '));
  assert.ok(result.parsed.permissions.includes('android.permission.PACKAGE_USAGE_STATS'));
  assert.ok(result.parsed.permissions.includes('android.permission.ACCESS_NETWORK_STATE'));
  assert.ok(!result.parsed.permissions.includes('android.permission.INTERNET'));
});

test('release variant rejects android.permission.INTERNET', () => {
  const xml = `
    <manifest>
      <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" />
      <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
      <uses-permission android:name="android.permission.INTERNET" />
    </manifest>`;
  const result = auditManifest(xml, { variant: 'release' });
  assert.equal(result.ok, false);
  assert.ok(result.forbidden.includes('android.permission.INTERNET'));
  assert.ok(result.problems.some((p) => p.includes('android.permission.INTERNET is forbidden in release builds')));
});

test('debug variant allows android.permission.INTERNET for Metro bundler', () => {
  const xml = `
    <manifest>
      <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" />
      <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
      <uses-permission android:name="android.permission.INTERNET" />
    </manifest>`;
  const result = auditManifest(xml, { variant: 'debug' });
  assert.equal(result.ok, true, result.problems.join('; '));
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

test('the library allowlist and debug-only list are disjoint from forbidden permissions', () => {
  for (const permission of ALLOWED_FROM_LIBRARIES) {
    assert.ok(!FORBIDDEN_PERMISSIONS.includes(permission), `${permission} cannot be both allowed and forbidden`);
    assert.ok(!DEBUG_ONLY_PERMISSIONS.includes(permission), `${permission} cannot be both release-allowed and debug-only`);
  }
  for (const permission of DEBUG_ONLY_PERMISSIONS) {
    assert.ok(!FORBIDDEN_PERMISSIONS.includes(permission), `${permission} cannot be both debug-only and globally forbidden`);
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

test('--json writes a report and --variant split enforces release no-INTERNET vs debug Metro', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'mirror-manifest-test-'));
  try {
    const debugManifest = join(dir, 'AndroidManifest-debug.xml');
    const releaseCleanManifest = join(dir, 'AndroidManifest-release-clean.xml');
    const debugJson = join(dir, 'debug-report.json');
    const releaseJson = join(dir, 'release-report.json');

    writeFileSync(
      debugManifest,
      `<manifest><uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" /><uses-permission android:name="android.permission.INTERNET" /></manifest>`,
    );
    writeFileSync(
      releaseCleanManifest,
      `<manifest><uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" /><uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" /></manifest>`,
    );

    // 1. Debug manifest with INTERNET passes under --variant debug
    const debugRes = spawnSync(
      process.execPath,
      [join(ROOT, 'scripts/android/check-merged-manifest.mjs'), '--variant', 'debug', '--manifest', debugManifest, '--json', debugJson],
      { encoding: 'utf8' },
    );
    assert.equal(debugRes.status, 0, `Debug CLI failed: ${debugRes.stderr}\n${debugRes.stdout}`);
    const debugPayload = JSON.parse(readFileSync(debugJson, 'utf8'));
    assert.equal(debugPayload.ok, true);
    assert.equal(debugPayload.variant, 'debug');

    // 2. Same manifest with INTERNET FAILS under --variant release
    const leakRes = spawnSync(
      process.execPath,
      [join(ROOT, 'scripts/android/check-merged-manifest.mjs'), '--variant', 'release', '--manifest', debugManifest],
      { encoding: 'utf8' },
    );
    assert.equal(leakRes.status, 1, 'Release CLI must reject INTERNET');
    assert.match(leakRes.stderr, /android\.permission\.INTERNET is forbidden in release builds/);

    // 3. Release manifest without INTERNET (with WorkManager ACCESS_NETWORK_STATE) passes under --variant release
    const releaseRes = spawnSync(
      process.execPath,
      [join(ROOT, 'scripts/android/check-merged-manifest.mjs'), '--variant', 'release', '--manifest', releaseCleanManifest, '--json', releaseJson],
      { encoding: 'utf8' },
    );
    assert.equal(releaseRes.status, 0, `Release CLI failed: ${releaseRes.stderr}\n${releaseRes.stdout}`);
    const releasePayload = JSON.parse(readFileSync(releaseJson, 'utf8'));
    assert.equal(releasePayload.ok, true);
    assert.equal(releasePayload.variant, 'release');
    assert.ok(releasePayload.parsed.permissions.includes('android.permission.ACCESS_NETWORK_STATE'));
    assert.ok(!releasePayload.parsed.permissions.includes('android.permission.INTERNET'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
