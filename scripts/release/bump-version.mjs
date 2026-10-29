#!/usr/bin/env node
/**
 * Check or bump Mirror's release version across every distributable manifest,
 * package-lock.json workspace entry, and Android Gradle build config in lockstep
 * (100% offline — never requires registry network access).
 *
 * Usage:
 *   node scripts/release/bump-version.mjs --check [--tag <vX.Y.Z>] [--root <dir>]
 *   node scripts/release/bump-version.mjs <semver|vSemver> [--version-code <int>] [--root <dir>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const TAG_RE = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

const RELEASE_JSON_MANIFESTS = [
  'package.json',
  'apps/mobile/package.json',
  'apps/extension/package.json',
  'apps/extension/manifest.json',
  'packages/ui/package.json',
];

const LOCKFILE_WORKSPACE_KEYS = ['', 'apps/mobile', 'apps/extension', 'packages/ui'];

function parseArgs(argv) {
  let root = resolve(import.meta.dirname, '..', '..');
  let check = false;
  let tag = null;
  let version = null;
  let versionCode = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') {
      check = true;
    } else if (a === '--tag') {
      tag = argv[++i] ?? '';
    } else if (a === '--root') {
      root = resolve(argv[++i]);
    } else if (a === '--version-code') {
      versionCode = Number(argv[++i]);
    } else if (!a.startsWith('-') && version === null) {
      version = a.startsWith('v') ? a.slice(1) : a;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { root, check, tag, version, versionCode };
}

function main() {
  const { root, check, tag, version, versionCode } = parseArgs(process.argv.slice(2));
  const appJsonPath = join(root, 'apps/mobile/app.json');
  if (!existsSync(appJsonPath)) {
    console.error(`Missing ${appJsonPath}`);
    process.exit(1);
  }
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const currentVersion = appJson?.expo?.version;
  const currentCode = appJson?.expo?.android?.versionCode;
  const gradlePath = join(root, 'apps/mobile/android/app/build.gradle');
  const lockPath = join(root, 'package-lock.json');
  const jsonFiles = RELEASE_JSON_MANIFESTS.filter((rel) => existsSync(join(root, rel)));

  if (check || !version) {
    const failures = [];
    if (!SEMVER_RE.test(String(currentVersion ?? ''))) {
      failures.push(`apps/mobile/app.json expo.version invalid: ${currentVersion}`);
    }
    if (!Number.isInteger(currentCode) || currentCode < 1) {
      failures.push(`apps/mobile/app.json expo.android.versionCode invalid: ${currentCode}`);
    }
    for (const rel of jsonFiles) {
      const parsed = JSON.parse(readFileSync(join(root, rel), 'utf8'));
      if (parsed.version !== currentVersion) {
        failures.push(`${rel} version=${parsed.version} != ${currentVersion}`);
      }
      if (rel === 'apps/mobile/package.json' && parsed.dependencies?.['@mirror/ui'] && parsed.dependencies['@mirror/ui'] !== currentVersion) {
        failures.push(`${rel} dependencies.@mirror/ui=${parsed.dependencies['@mirror/ui']} != ${currentVersion}`);
      }
    }
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (lock.version !== currentVersion) {
        failures.push(`package-lock.json version=${lock.version} != ${currentVersion}`);
      }
      for (const k of LOCKFILE_WORKSPACE_KEYS) {
        const pkgEntry = lock.packages?.[k];
        if (pkgEntry && pkgEntry.version !== currentVersion) {
          failures.push(`package-lock.json packages[${JSON.stringify(k)}].version=${pkgEntry.version} != ${currentVersion}`);
        }
      }
    }
    if (existsSync(gradlePath)) {
      const gradle = readFileSync(gradlePath, 'utf8');
      const mCode = gradle.match(/\bversionCode\s+(\d+)/);
      const mName = gradle.match(/\bversionName\s+"([^"]+)"/);
      if (!mCode || Number(mCode[1]) !== currentCode) {
        failures.push(`apps/mobile/android/app/build.gradle versionCode=${mCode?.[1]} != ${currentCode}`);
      }
      if (!mName || mName[1] !== currentVersion) {
        failures.push(`apps/mobile/android/app/build.gradle versionName=${mName?.[1]} != ${currentVersion}`);
      }
    }
    if (tag !== null) {
      const tagMatch = TAG_RE.exec(tag);
      if (!tagMatch) {
        failures.push(`git tag "${tag}" is not a valid v<semver> release tag (expected vX.Y.Z)`);
      } else if (tagMatch[1] !== currentVersion) {
        failures.push(`git tag "${tag}" does not match apps/mobile/app.json version "v${currentVersion}"`);
      }
    }
    if (failures.length > 0) {
      console.error('::error::Version/tag check FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(
      `Version check OK: v${currentVersion} (versionCode ${currentCode})${tag ? ` [tag ${tag} verified]` : ''} aligned across ${jsonFiles.length + 1} manifests${existsSync(gradlePath) ? ' + build.gradle' : ''}${existsSync(lockPath) ? ' + package-lock.json' : ''}.`,
    );
    return;
  }

  if (!SEMVER_RE.test(version)) {
    console.error(`Invalid semver: ${version}`);
    process.exit(1);
  }
  const nextCode = versionCode !== null ? versionCode : currentCode + (version === currentVersion ? 0 : 1);
  if (!Number.isInteger(nextCode) || nextCode < 1) {
    console.error(`Invalid versionCode: ${nextCode}`);
    process.exit(1);
  }

  appJson.expo.version = version;
  appJson.expo.android.versionCode = nextCode;
  if (appJson.expo.ios) {
    appJson.expo.ios.buildNumber = String(nextCode);
  }
  writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

  for (const rel of jsonFiles) {
    const full = join(root, rel);
    const parsed = JSON.parse(readFileSync(full, 'utf8'));
    parsed.version = version;
    if (rel === 'apps/mobile/package.json' && parsed.dependencies?.['@mirror/ui']) {
      parsed.dependencies['@mirror/ui'] = version;
    }
    writeFileSync(full, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  }

  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = version;
    for (const k of LOCKFILE_WORKSPACE_KEYS) {
      if (lock.packages?.[k]) {
        lock.packages[k].version = version;
      }
      if (k === 'apps/mobile' && lock.packages?.[k]?.dependencies?.['@mirror/ui']) {
        lock.packages[k].dependencies['@mirror/ui'] = version;
      }
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  }

  if (existsSync(gradlePath)) {
    const gradle = readFileSync(gradlePath, 'utf8')
      .replace(/(\bversionCode\s+)\d+/, `$1${nextCode}`)
      .replace(/(\bversionName\s+)"[^"]+"/, `$1"${version}"`);
    writeFileSync(gradlePath, gradle, 'utf8');
  }

  console.log(`Updated version -> ${version} (versionCode ${nextCode}) across manifests, build.gradle, and package-lock.json.`);
}

main();
