/**
 * tests/release-stage1.test.mjs
 *
 * Stage 1 ("a signed APK/AAB exists") cannot be executed without a keystore and
 * the Android SDK. What can be tested is the preflight: it must pass a correct
 * checkout, print the manual remainder, and fail on a configuration that would
 * produce an unsignable or misidentified build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(ROOT, 'scripts', 'android', 'release-preflight.mjs');

function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-release-'));
  mkdirSync(join(dir, 'apps', 'mobile'), { recursive: true });
  copyFileSync(join(ROOT, 'apps', 'mobile', 'app.json'), join(dir, 'apps', 'mobile', 'app.json'));
  copyFileSync(join(ROOT, 'apps', 'mobile', 'eas.json'), join(dir, 'apps', 'mobile', 'eas.json'));
  mutate(dir);
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8' });
}

test('a correct checkout passes and says the artifact is not built', () => {
  const dir = fixture();
  const result = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Automated checks passed/);
  assert.match(result.stdout, /Built artifact: NOT FOUND/);
  assert.match(result.stdout, /Stage 1 remains MANUAL/);
});

test('a wrong package id is a failure', () => {
  const dir = fixture((d) => {
    const app = JSON.parse(readFileSync(join(d, 'apps', 'mobile', 'app.json'), 'utf8'));
    app.expo.android.package = 'com.example.other';
    writeFileSync(join(d, 'apps', 'mobile', 'app.json'), JSON.stringify(app));
  });
  const result = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /android\.package/);
});

test('a committed keystore is a failure', () => {
  const dir = fixture((d) => writeFileSync(join(d, 'apps', 'mobile', 'upload.keystore'), 'not a real key'));
  const result = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /signing material is committed/);
});

test('an APK build profile cannot stand in for the AAB', () => {
  const dir = fixture((d) => {
    const eas = JSON.parse(readFileSync(join(d, 'apps', 'mobile', 'eas.json'), 'utf8'));
    eas.build.production.android.buildType = 'apk';
    writeFileSync(join(d, 'apps', 'mobile', 'eas.json'), JSON.stringify(eas));
  });
  const result = run(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /app-bundle/);
});
