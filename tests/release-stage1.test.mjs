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
import { createRequire } from 'node:module';
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

  // Matching --tag v0.1.0 passes; suffixed pre-release tags with same base version pass; mismatched or malformed --tag fails loudly
  const tagOk = spawnSync(process.execPath, [bumpScript, '--check', '--tag', 'v0.1.0'], { encoding: 'utf8' });
  assert.equal(tagOk.status, 0, tagOk.stdout + tagOk.stderr);
  assert.match(tagOk.stdout, /\[tag v0\.1\.0 verified\]/);

  const rcTagOk = spawnSync(process.execPath, [bumpScript, '--check', '--tag', 'v0.1.0-rc1'], { encoding: 'utf8' });
  assert.equal(rcTagOk.status, 0, rcTagOk.stdout + rcTagOk.stderr);
  assert.match(rcTagOk.stdout, /\[tag v0\.1\.0-rc1 verified, pre-release suffix "-rc1"\]/);

  const betaTagOk = spawnSync(process.execPath, [bumpScript, '--check', '--tag', 'v0.1.0-beta.2'], { encoding: 'utf8' });
  assert.equal(betaTagOk.status, 0, betaTagOk.stdout + betaTagOk.stderr);
  assert.match(betaTagOk.stdout, /\[tag v0\.1\.0-beta\.2 verified, pre-release suffix "-beta\.2"\]/);

  const rcBaseMismatch = spawnSync(process.execPath, [bumpScript, '--check', '--tag', 'v0.2.0-rc1'], { encoding: 'utf8' });
  assert.equal(rcBaseMismatch.status, 1);
  assert.match(rcBaseMismatch.stderr, /::error::Version\/tag check FAILED/);
  assert.match(
    rcBaseMismatch.stderr,
    /git tag "v0\.2\.0-rc1" base version "v0\.2\.0" does not match apps\/mobile\/app\.json version "v0\.1\.0"/,
  );

  const tagMismatch = spawnSync(process.execPath, [bumpScript, '--check', '--tag', 'v0.2.0'], { encoding: 'utf8' });
  assert.equal(tagMismatch.status, 1);
  assert.match(tagMismatch.stderr, /::error::Version\/tag check FAILED/);
  assert.match(tagMismatch.stderr, /does not match apps\/mobile\/app\.json version "v0\.1\.0"/);

  for (const badTag of ['0.1.0', '0.1.0-rc1', 'v0.1.0-', 'v0.1.0--rc1', 'v0.1.0-.1']) {
    const tagMalformed = spawnSync(process.execPath, [bumpScript, '--check', '--tag', badTag], { encoding: 'utf8' });
    assert.equal(tagMalformed.status, 1, `expected ${badTag} to fail`);
    assert.match(tagMalformed.stderr, /is not a valid v<semver> release tag/);
  }

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
  // Repair is strictly one-time inside repairSessionsFromStoredEvents (only 1 call site to recoverMissingForegroundEvents)
  assert.equal(
    (ingestFile.match(/recoverMissingForegroundEvents\s*\(/g) ?? []).length,
    1,
    'recoverMissingForegroundEvents runs strictly inside one-time repairSessionsFromStoredEvents',
  );
});

test('verify-signing-env fails loudly on missing/invalid secrets and release.yml never falls back to debug signing', () => {
  const verifyScript = join(ROOT, 'scripts', 'release', 'verify-signing-env.mjs');
  const baseEnv = { PATH: process.env.PATH ?? '' };

  // 1. All 4 secrets missing -> fails loudly naming all 4 secrets
  const allMissing = spawnSync(process.execPath, [verifyScript], { env: baseEnv, encoding: 'utf8' });
  assert.equal(allMissing.status, 1);
  assert.match(allMissing.stderr, /::error::Missing required Android release signing secret\(s\)/);
  assert.match(allMissing.stderr, /ANDROID_KEYSTORE_BASE64/);
  assert.match(allMissing.stderr, /ANDROID_KEYSTORE_PASSWORD/);
  assert.match(allMissing.stderr, /ANDROID_KEY_ALIAS/);
  assert.match(allMissing.stderr, /ANDROID_KEY_PASSWORD/);

  // 2. Fake PKCS#12 header (0x30 ASN.1 SEQUENCE + 48 bytes) with 1 missing secret -> still fails loudly
  const fakePkcs12 = Buffer.alloc(64, 0x05);
  fakePkcs12[0] = 0x30;
  const fakeB64 = fakePkcs12.toString('base64');

  const missingKeyPass = spawnSync(process.execPath, [verifyScript], {
    env: {
      ...baseEnv,
      ANDROID_KEYSTORE_BASE64: fakeB64,
      ANDROID_KEYSTORE_PASSWORD: 'not-a-real-store-pass',
      ANDROID_KEY_ALIAS: 'mirror-upload',
    },
    encoding: 'utf8',
  });
  assert.equal(missingKeyPass.status, 1);
  assert.match(missingKeyPass.stderr, /ANDROID_KEY_PASSWORD/);
  assert.doesNotMatch(missingKeyPass.stderr, /not-a-real-store-pass/);

  // 3. Corrupt/non-keystore base64 -> fails loudly
  const badMagic = Buffer.alloc(64, 0x41).toString('base64');
  const badRes = spawnSync(process.execPath, [verifyScript], {
    env: {
      ...baseEnv,
      ANDROID_KEYSTORE_BASE64: badMagic,
      ANDROID_KEYSTORE_PASSWORD: 'not-a-real-store-pass',
      ANDROID_KEY_ALIAS: 'mirror-upload',
      ANDROID_KEY_PASSWORD: 'not-a-real-key-pass',
    },
    encoding: 'utf8',
  });
  assert.equal(badRes.status, 1);
  assert.match(badRes.stderr, /did not decode to a valid PKCS#12 or JKS keystore/);

  // 4. Materializing inside the repository root is refused
  const inRepoRes = spawnSync(
    process.execPath,
    [verifyScript, '--materialize', join(ROOT, 'apps', 'mobile', 'illegal.keystore')],
    {
      env: {
        ...baseEnv,
        ANDROID_KEYSTORE_BASE64: fakeB64,
        ANDROID_KEYSTORE_PASSWORD: 'not-a-real-store-pass',
        ANDROID_KEY_ALIAS: 'mirror-upload',
        ANDROID_KEY_PASSWORD: 'not-a-real-key-pass',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(inRepoRes.status, 1);
  assert.match(inRepoRes.stderr, /Refusing to materialize release keystore inside repository root/);

  // 5. Valid secrets + external temp destination succeeds without printing secret values
  const outDir = mkdtempSync(join(tmpdir(), 'mirror-signing-'));
  const ksPath = join(outDir, 'signing', 'release.keystore');
  const okRes = spawnSync(process.execPath, [verifyScript, '--materialize', ksPath], {
    env: {
      ...baseEnv,
      ANDROID_KEYSTORE_BASE64: fakeB64,
      ANDROID_KEYSTORE_PASSWORD: 'not-a-real-store-pass',
      ANDROID_KEY_ALIAS: 'mirror-upload',
      ANDROID_KEY_PASSWORD: 'not-a-real-key-pass',
    },
    encoding: 'utf8',
  });
  const writtenBytes = readFileSync(ksPath);
  rmSync(outDir, { recursive: true, force: true });
  assert.equal(okRes.status, 0, okRes.stdout + okRes.stderr);
  assert.equal(writtenBytes.length, 64);
  assert.doesNotMatch(okRes.stdout + okRes.stderr, /not-a-real-/);

  // 6. Tracked release workflow parses as valid YAML, enforces fail-loud tag + signing gates, marks any suffixed tag as pre-release, and never debug-signs release artifacts
  const releaseWf = readFileSync(join(ROOT, 'infra', 'workflows', 'release.yml'), 'utf8');
  const req = createRequire(import.meta.url);
  const yaml = req(req.resolve('js-yaml', { paths: [join(ROOT, 'node_modules', '@eslint', 'eslintrc')] }));
  const parsedWf = yaml.load(releaseWf);
  const releaseSteps = parsedWf?.jobs?.release?.steps ?? [];
  assert.ok(releaseSteps.length >= 15, 'infra/workflows/release.yml parses cleanly as YAML');
  assert.match(releaseWf, /bump-version\.mjs --check --tag/);
  assert.match(releaseWf, /verify-signing-env\.mjs/);
  assert.match(releaseWf, /MIRROR_REQUIRE_RELEASE_SIGNING:\s*'1'/);
  assert.match(releaseWf, /verify --verbose --print-certs/);
  assert.match(releaseWf, /CN=Android Debug/);
  assert.match(releaseWf, /fail_on_unmatched_files:\s*true/);
  assert.doesNotMatch(releaseWf, /android\.injected\.signing\.store\.file/);

  const tagMetaStep = releaseSteps.find((s) => s.id === 'tag_meta');
  assert.ok(tagMetaStep, 'release.yml defines id: tag_meta step');
  assert.match(tagMetaStep.run, /\[\[ "\$TAG" == \*-\* \]\]/);
  assert.match(tagMetaStep.run, /prerelease=true/);
  assert.match(tagMetaStep.run, /make_latest=false/);

  const ghReleaseStep = releaseSteps.find((s) => String(s.uses ?? '').startsWith('softprops/action-gh-release@'));
  assert.ok(ghReleaseStep, 'release.yml defines softprops/action-gh-release step');
  assert.equal(ghReleaseStep.with?.prerelease, "${{ contains(github.ref_name, '-') }}");
  assert.equal(ghReleaseStep.with?.make_latest, '${{ steps.tag_meta.outputs.make_latest }}');

  // 6b. changelog.mjs renders a pre-release banner for suffixed tags and omits it for final tags
  const clDir = mkdtempSync(join(tmpdir(), 'mirror-changelog-'));
  const rcChangelogPath = join(clDir, 'CHANGELOG-rc.md');
  const finalChangelogPath = join(clDir, 'CHANGELOG-final.md');
  const changelogScript = join(ROOT, 'scripts', 'release', 'changelog.mjs');
  const rcClRes = spawnSync(process.execPath, [changelogScript, 'v0.1.0-rc1', '--out', rcChangelogPath], {
    encoding: 'utf8',
  });
  const finalClRes = spawnSync(process.execPath, [changelogScript, 'v0.1.0', '--out', finalChangelogPath], {
    encoding: 'utf8',
  });
  const rcClBody = readFileSync(rcChangelogPath, 'utf8');
  const finalClBody = readFileSync(finalChangelogPath, 'utf8');
  rmSync(clDir, { recursive: true, force: true });
  assert.equal(rcClRes.status, 0, rcClRes.stdout + rcClRes.stderr);
  assert.equal(finalClRes.status, 0, finalClRes.stdout + finalClRes.stderr);
  assert.match(rcClBody, /^# Changelog v0\.1\.0-rc1/m);
  assert.match(rcClBody, /\*\*Pre-release \(v0\.1\.0-rc1\)\*\*/);
  assert.match(finalClBody, /^# Changelog v0\.1\.0/m);
  assert.doesNotMatch(finalClBody, /\*\*Pre-release/);

  // 7. Gradle signing plugin enforces MIRROR_REQUIRE_RELEASE_SIGNING=1
  const signingPlugin = readFileSync(join(ROOT, 'apps', 'mobile', 'plugins', 'with-release-signing.js'), 'utf8');
  assert.match(signingPlugin, /MIRROR_REQUIRE_RELEASE_SIGNING/);
  assert.match(signingPlugin, /throw new GradleException/);

  // 8. docs/INSTALL.md and docs/RELEASE_NOTES_v0.1.0.md document one-time uninstall/reinstall, archive-only Export, XChaCha20-Poly1305, and no internet permission
  const installDoc = readFileSync(join(ROOT, 'docs', 'INSTALL.md'), 'utf8');
  assert.match(installDoc, /One-time uninstall & reinstall/);
  assert.match(installDoc, /adb uninstall dev\.mirror\.app/);
  assert.match(installDoc, /archive only/i);
  assert.match(installDoc, /does not have a JSON import or restore/i);
  assert.match(installDoc, /XChaCha20-Poly1305/);
  assert.match(installDoc, /no internet permission/i);
  assert.doesNotMatch(installDoc, /P3 is on hold/i);
  assert.doesNotMatch(installDoc, /P3 remains on hold/i);
  assert.doesNotMatch(installDoc, /AES-256-GCM/i);
  assert.doesNotMatch(installDoc, /zero network permissions/i);

  const releaseNotes = readFileSync(join(ROOT, 'docs', 'RELEASE_NOTES_v0.1.0.md'), 'utf8');
  assert.match(releaseNotes, /Mirror `v0\.1\.0` — Release Notes/);
  assert.match(releaseNotes, /uninstall Mirror once/i);
  assert.match(releaseNotes, /Export is an archive only/i);
  assert.match(releaseNotes, /XChaCha20-Poly1305/);
  assert.match(releaseNotes, /no internet permission/i);
  assert.doesNotMatch(releaseNotes, /\bJ\d{1,2}\b/);
  assert.doesNotMatch(releaseNotes, /P3 cards/i);
  assert.doesNotMatch(releaseNotes, /First seen/i);
  assert.doesNotMatch(releaseNotes, /AES-256-GCM/i);
  assert.doesNotMatch(releaseNotes, /zero network permissions/i);
  assert.doesNotMatch(releaseNotes, /Explicit labels active/i);
});

