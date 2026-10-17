/**
 * tests/android-build.test.mjs
 *
 * The build itself cannot run in this environment (no JDK, no Android SDK, and
 * Maven/Google are unreachable — see the P2 report). These tests therefore check
 * the *preconditions* of the first Gradle build, so the manual step is a single
 * command with no surprises:
 *
 *   - the generated Gradle project is coherent (wrapper, :app, namespace);
 *   - the local Expo module is configured for autolinking;
 *   - the generated manifest has exactly the expected permissions;
 *   - the build script fails closed with exit 2 when a precondition is missing.
 *
 * A test that claimed the module compiles would be a lie; a test that the build
 * is *ready* is checkable today.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ANDROID = join(ROOT, 'apps/mobile/android');
const SCRIPT = join(ROOT, 'scripts/android/build-and-gate.sh');

const read = (...parts) => readFileSync(join(ANDROID, ...parts), 'utf8');

test('the build script exists, is executable, and names both toolchains', () => {
  const mode = statSync(SCRIPT).mode;
  assert.ok(mode & 0o111, 'build-and-gate.sh must be executable');
  const text = readFileSync(SCRIPT, 'utf8');
  assert.match(text, /JAVA_HOME|exit 2/);
  assert.match(text, /ANDROID_HOME/);
  assert.match(text, /repo\.maven\.apache\.org/);
  assert.match(text, /android:manifest/);
});

test('missing preconditions exit 2 with the manual commands, never a pass', () => {
  const result = spawnSync('/bin/bash', [SCRIPT], {
    cwd: ROOT,
    env: { PATH: '/nonexistent', ANDROID_HOME: '', ANDROID_SDK_ROOT: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 2, 'a missing JDK/SDK is exit 2, not success');
  assert.match(result.stderr, /preconditions missing/);
  assert.match(result.stderr, /gradlew :app:assembleDebug/);
  assert.match(result.stderr, /npm run android:manifest/);
});

test('the generated Gradle project is coherent', () => {
  const settings = read('settings.gradle');
  assert.match(settings, /include ':app'/);
  const appGradle = read('app/build.gradle');
  assert.match(appGradle, /namespace ['"]dev\.mirror\.app['"]/);
  assert.match(appGradle, /applicationId ['"]dev\.mirror\.app['"]/);
  const wrapper = read('gradle/wrapper/gradle-wrapper.properties');
  assert.match(wrapper, /^distributionUrl=https\\?:/m);
  assert.match(wrapper, /gradle-\d+\.\d+/);
});

test('the local UsageStats module is declared for Expo autolinking', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/modules/mirror-usage-stats/expo-module.config.json'), 'utf8'));
  assert.deepEqual(config.platforms, ['android']);
  assert.ok(config.android.modules.includes('dev.mirror.usagestats.UsageStatsModule'));
  const moduleGradle = readFileSync(join(ROOT, 'apps/mobile/modules/mirror-usage-stats/android/build.gradle'), 'utf8');
  assert.match(moduleGradle, /expo-module|ExpoModule|namespace/);
});

test('the generated manifest declares three permissions and fifteen removals', () => {
  const manifest = read('app/src/main/AndroidManifest.xml');
  const tags = manifest.match(/<uses-permission\b[^>]*>/g) ?? [];
  const real = tags.filter((tag) => !tag.includes('tools:node="remove"'));
  const removed = tags.filter((tag) => tag.includes('tools:node="remove"'));
  assert.deepEqual(
    real.map((tag) => /android:name="([^"]+)"/.exec(tag)?.[1]).sort(),
    ['android.permission.INTERNET', 'android.permission.PACKAGE_USAGE_STATS', 'android.permission.VIBRATE'],
  );
  assert.equal(removed.length, 15, 'blockedPermissions must appear as removals, not requests');
  for (const forbidden of ['CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'QUERY_ALL_PACKAGES', 'AD_ID']) {
    assert.ok(removed.some((tag) => tag.includes(forbidden)), `${forbidden} must be explicitly removed`);
  }
});

test('the merged-manifest gate still refuses to pass without a build', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts/android/check-merged-manifest.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2, 'no merged manifest means exit 2, never 0');
  assert.match(`${result.stdout}${result.stderr}`, /not been built|no merged manifest|exit 2/i);
});
