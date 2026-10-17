#!/usr/bin/env node
/**
 * Release Stage 1 preflight.
 *
 * Stage 1 is "a signed APK/AAB exists". Signing needs a keystore and an EAS (or
 * Gradle) signing identity, and neither is in this repository — by design. So
 * this script checks everything that *can* be checked from a checkout, prints
 * the manual remainder, and exits:
 *
 *   0  automated checks pass; signing is MANUAL and the steps are printed
 *   1  a real configuration error (wrong package id, missing production profile)
 *
 * It never exits 0 pretending a binary was produced: the last line always says
 * what was not done.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
const ROOT = rootArg >= 0 ? resolve(args[rootArg + 1]) : resolve(import.meta.dirname, '..', '..');

const failures = [];
const checked = [];

function readJson(path) {
  const full = join(ROOT, path);
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (error) {
    failures.push(`${path}: cannot be read as JSON (${error.message})`);
    return null;
  }
}

const app = readJson('apps/mobile/app.json');
const eas = readJson('apps/mobile/eas.json');

if (app) {
  const android = app.expo?.android ?? {};
  if (android.package !== 'dev.mirror.app') failures.push(`app.json: android.package is "${android.package}", expected dev.mirror.app`);
  else checked.push('package id dev.mirror.app');

  if (!Number.isInteger(android.versionCode) || android.versionCode < 1) failures.push('app.json: android.versionCode must be a positive integer');
  else checked.push(`versionCode ${android.versionCode}`);

  if (!/^\d+\.\d+\.\d+$/.test(String(app.expo?.version ?? ''))) failures.push('app.json: version must be plain semver');
  else checked.push(`version ${app.expo.version}`);
}

if (eas) {
  const production = eas.build?.production;
  if (!production) failures.push('eas.json: no production build profile');
  else {
    if (production.android?.buildType !== 'app-bundle') failures.push('eas.json: production must build an app-bundle');
    else checked.push('production → AAB');
    if (production.autoIncrement !== true) failures.push('eas.json: production must autoIncrement the versionCode');
    else checked.push('versionCode auto-increments');
  }
  if (!eas.submit?.production?.android) failures.push('eas.json: no production submit profile');
  else checked.push(`submit track ${eas.submit.production.android.track ?? 'default'}`);
}

/* A keystore in the tree is a failure, not a convenience. */
const signing = [];
function walk(dir, depth = 0) {
  if (depth > 3 || signing.length > 0) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
    else if (/\.(jks|keystore)$/i.test(entry.name)) signing.push(join(dir, entry.name));
  }
}
walk(ROOT);
if (signing.length > 0) failures.push(`signing material is committed: ${signing.map((p) => basename(p)).join(', ')}`);
else checked.push('no keystore in the tree');

const buildOutput = ['apps/mobile/android/app/build/outputs/apk', 'apps/mobile/android/app/build/outputs/bundle'].map((p) => join(ROOT, p));
const built = buildOutput.filter((p) => existsSync(p));

console.log('Release Stage 1 preflight');
console.log(`  root: ${ROOT}`);
for (const item of checked) console.log(`  ok   ${item}`);
for (const failure of failures) console.log(`  FAIL ${failure}`);

if (failures.length > 0) {
  console.log('\nResult: FAILED — fix the items above; nothing was built.');
  process.exit(1);
}

console.log('\nAutomated checks passed.');
if (built.length === 0) {
  console.log('Built artifact: NOT FOUND — no APK/AAB exists in this checkout.');
} else {
  console.log(`Built artifact directory: ${built.join(', ')}`);
}
console.log('\nMANUAL (needs a machine with the Android SDK and the signing identity):');
console.log('  1. Create the upload keystore once, outside the repository:');
console.log('       keytool -genkeypair -v -storetype PKCS12 -keystore ~/mirror-upload.keystore \\');
console.log('         -alias mirror -keyalg RSA -keysize 2048 -validity 10000');
console.log('     Store the password in the password manager, never in this repository.');
console.log('  2. `eas credentials` (or `eas secret:create`) to upload it to the EAS project.');
console.log('  3. `make android-build` — the merged-manifest gate must exit 0 before shipping.');
console.log('  4. `make build-production` — produces the signed AAB.');
console.log('  5. `apksigner verify --print-certs <artifact>` and install the internal APK on a device.');
console.log('\nNothing above was executed here. Stage 1 remains MANUAL.');
process.exit(0);
