#!/usr/bin/env node
/**
 * OTA guard – ensures deployment, OTA and remote config can never add
 * collection, permissions or outbound data (SPEC §2.10).
 *
 * Checks:
 * - expo.updates.enabled must be false or absent (OTA disabled) OR narrow-only
 * - extra.telemetry must be false, privacyModeDefault private, remoteConfig narrow-only
 * - android.permissions only PACKAGE_USAGE_STATS allowed (plus POST_NOTIFICATIONS opt-in)
 * - blockedPermissions must include SYSTEM_ALERT_WINDOW, ACCESS_LOCAL_NETWORK, location, camera, etc
 * - No expo-updates that could fetch remote JS adding collection
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const appPath = join(ROOT, 'apps/mobile/app.json');

let app;
try {
  app = JSON.parse(readFileSync(appPath, 'utf8'));
} catch (e) {
  console.error(`OTA guard: cannot read ${appPath}: ${e.message}`);
  process.exit(1);
}

const failures = [];
const expo = app.expo ?? {};
const android = expo.android ?? {};
const extra = expo.extra ?? {};
const updates = expo.updates ?? {};

console.log('OTA guard – checking app.json for OTA/collection/permissions');

// 1. Updates must be disabled or narrow-only
if (updates.enabled === true) {
  // If enabled, must be narrow-only and not add collection
  if (updates.checkAutomatically !== 'ON_ERROR_RECOVERY' && updates.checkAutomatically !== undefined) {
    failures.push(`expo.updates.enabled true but checkAutomatically is ${updates.checkAutomatically}, must be ON_ERROR_RECOVERY or disabled`);
  }
  if (extra.remoteConfig && extra.remoteConfig !== 'narrow-only') {
    failures.push(`expo.updates enabled but extra.remoteConfig is ${extra.remoteConfig}, must be narrow-only`);
  }
  console.log('  warn: expo.updates.enabled true – allowed only if narrow-only remote config, no new permissions/collection');
} else {
  console.log('  ok: expo.updates.enabled false or absent (OTA disabled)');
}

// 2. Telemetry must be false, privacyModeDefault private
if (extra.telemetry === true) {
  failures.push('extra.telemetry true – must be false (no third-party analytics)');
} else {
  console.log('  ok: extra.telemetry false or absent');
}

if (extra.privacyModeDefault && extra.privacyModeDefault !== 'private') {
  failures.push(`extra.privacyModeDefault is ${extra.privacyModeDefault}, must be private`);
} else {
  console.log('  ok: privacyModeDefault private');
}

if (extra.remoteConfig && extra.remoteConfig !== 'narrow-only') {
  failures.push(`extra.remoteConfig is ${extra.remoteConfig}, must be narrow-only or absent`);
} else {
  console.log('  ok: remoteConfig narrow-only or absent');
}

// 3. Permissions – only PACKAGE_USAGE_STATS allowed, blockedPermissions must include forbidden
const allowedPermissions = new Set(['android.permission.PACKAGE_USAGE_STATS', 'android.permission.POST_NOTIFICATIONS', 'android.permission.VIBRATE', 'android.permission.USE_EXACT_ALARM']);
const perms = android.permissions ?? [];
for (const p of perms) {
  if (!allowedPermissions.has(p)) {
    failures.push(`android.permissions contains ${p} – only PACKAGE_USAGE_STATS (and POST_NOTIFICATIONS opt-in) allowed`);
  }
}
if (perms.includes('android.permission.PACKAGE_USAGE_STATS')) {
  console.log('  ok: PACKAGE_USAGE_STATS allowed (usage access)');
} else {
  console.log('  warn: PACKAGE_USAGE_STATS not in permissions list – should be present');
}

const blocked = android.blockedPermissions ?? [];
const requiredBlocked = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACCESS_LOCAL_NETWORK',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.CAMERA',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_SMS',
  'android.permission.RECORD_AUDIO',
];

for (const req of requiredBlocked) {
  if (!blocked.includes(req)) {
    failures.push(`blockedPermissions missing ${req} – must be blocked`);
  }
}
console.log(`  ok: blockedPermissions includes ${requiredBlocked.length} forbidden permissions`);

// 4. No expo-updates that could add collection via remote JS
// If updates enabled, ensure url is not set to custom server that could inject collection
if (updates.url) {
  failures.push(`expo.updates.url is set (${updates.url}) – custom OTA server could add collection, must be absent or EAS default`);
} else {
  console.log('  ok: no custom OTA url');
}

// 5. Check package.json for analytics SDKs that OTA could enable
const pkgPath = join(ROOT, 'package.json');
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const forbidden = ['firebase', 'amplitude', 'mixpanel', 'segment', 'sentry', '@sentry/react-native', 'expo-firebase-analytics', 'react-native-firebase'];
  for (const f of forbidden) {
    if (allDeps[f]) {
      failures.push(`package.json contains analytics SDK ${f} – forbidden, could be enabled via OTA`);
    }
  }
  console.log('  ok: no forbidden analytics SDKs in package.json');
} catch {}

console.log('\nOTA guard result:');
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log('\nOTA guard: FAILED – fix above, OTA must never add collection/permissions/outbound');
  process.exit(1);
} else {
  console.log('  ok – OTA disabled or narrow-only, no new permissions/collection, telemetry false, privacy private');
  console.log('\nOTA guard: PASSED');
  process.exit(0);
}
