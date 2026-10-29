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

test('bump-version --check passes on the repo and detects version drift or bumps offline', () => {
  const bumpScript = join(ROOT, 'scripts', 'release', 'bump-version.mjs');
  const repoCheck = spawnSync(process.execPath, [bumpScript, '--check'], { encoding: 'utf8' });
  assert.equal(repoCheck.status, 0, repoCheck.stdout + repoCheck.stderr);
  assert.match(repoCheck.stdout, /Version check OK: v0\.1\.0 \(versionCode 1\)/);

  const dir = mkdtempSync(join(tmpdir(), 'mirror-version-'));
  mkdirSync(join(dir, 'apps', 'mobile', 'android', 'app'), { recursive: true });
  mkdirSync(join(dir, 'apps', 'extension'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'ui'), { recursive: true });
  for (const rel of [
    'package.json',
    'apps/mobile/package.json',
    'apps/mobile/app.json',
    'apps/extension/package.json',
    'apps/extension/manifest.json',
    'packages/ui/package.json',
    'apps/mobile/android/app/build.gradle',
  ]) {
    copyFileSync(join(ROOT, rel), join(dir, rel));
  }

  // Drift in root package.json fails --check
  const driftedPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  driftedPkg.version = '0.0.9';
  writeFileSync(join(dir, 'package.json'), JSON.stringify(driftedPkg, null, 2));
  const failRes = spawnSync(process.execPath, [bumpScript, '--check', '--root', dir], { encoding: 'utf8' });
  assert.equal(failRes.status, 1);
  assert.match(failRes.stderr, /package\.json version=0\.0\.9/);

  // Bumping aligns all manifests and build.gradle offline
  const bumpRes = spawnSync(process.execPath, [bumpScript, '0.2.0', '--version-code', '2', '--root', dir], {
    encoding: 'utf8',
  });
  assert.equal(bumpRes.status, 0, bumpRes.stdout + bumpRes.stderr);
  const recheckRes = spawnSync(process.execPath, [bumpScript, '--check', '--root', dir], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(recheckRes.status, 0, recheckRes.stdout + recheckRes.stderr);
  assert.match(recheckRes.stdout, /Version check OK: v0\.2\.0 \(versionCode 2\)/);
});

test('CHANGELOG.md reflects v0.1 day-clipped UsageEvents totals and P3 features without stale OS-aggregate or P3-on-hold copy', () => {
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const narrativeOnly = changelog.replace(/## Commits[\s\S]*?## v0\.1 Checklist/, '## v0.1 Checklist');
  assert.match(narrativeOnly, /^# Changelog v0\.1\.0/m);
  assert.match(narrativeOnly, /Day-clipped OS foreground totals/);
  assert.match(narrativeOnly, /Stored/);
  assert.match(narrativeOnly, /Approximate/);
  assert.doesNotMatch(narrativeOnly, /P3 on hold/i);
  assert.doesNotMatch(narrativeOnly, /from OS aggregate/i);
});

test('DebugView, MirrorAppProvider, runtime, and ingest flag any app differing from OS by > max(10%, 60s) and repair sittings without ever deleting stored events', () => {
  const debugView = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'components', 'DebugView.tsx'), 'utf8');
  const provider = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'MirrorAppProvider.tsx'), 'utf8');
  const runtime = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'runtime.ts'), 'utf8');
  const ingestFile = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'collector', 'ingest.ts'), 'utf8');

  assert.match(provider, /evaluateAppOsDiscrepancies/);
  assert.match(provider, /liveDayForegroundTotals/);
  assert.match(provider, /'com\.openai\.chatgpt'/);

  assert.match(debugView, /flaggedDiscrepancies/);
  assert.match(debugView, /max\(10%, 60s\)/);
  assert.match(debugView, /\[FLAGGED/);
  assert.match(debugView, /4-source trace: Home/);

  assert.doesNotMatch(runtime, /replaceUsageEventsForWindow/);
  assert.doesNotMatch(runtime, /lifecycle_repair_v28/);
  assert.match(ingestFile, /repairSessionsFromStoredEvents/);
  assert.match(ingestFile, /recoverMissingForegroundEvents/);
});

