#!/usr/bin/env node
/**
 * The merged-manifest gate.
 *
 * `app.json` is intent. The **merged AndroidManifest.xml** is what the device
 * installs, after Gradle has folded in every library's manifest. A transitive
 * dependency can add a permission between the two, and nobody reviews a
 * `node_modules` manifest. So the release gate reads the artifact:
 *
 *   apps/mobile/android/app/build/intermediates/merged_manifests/<variant>/AndroidManifest.xml
 *
 * and asserts three things:
 *   1. the permission Mirror needs is present (PACKAGE_USAGE_STATS);
 *   2. nothing on the forbidden list appears — accessibility, overlays, screen
 *      capture, notification listening, advertising ID, contacts, location,
 *      microphone, camera, SMS, call log, phone state, all-packages;
 *   3. every other permission is on a documented allowlist, so a new one is a
 *      review decision rather than an accident.
 *
 * Exit codes: 0 clean, 1 violation, 2 no manifest to read (not built).
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

export const REQUIRED_PERMISSIONS = ['android.permission.PACKAGE_USAGE_STATS'];

/**
 * Permissions a library may legitimately contribute. Each one is here because a
 * specific dependency needs it, not because it is common:
 *   INTERNET, ACCESS_NETWORK_STATE — expo-updates/fetch, OAuth in P5
 *   WAKE_LOCK, RECEIVE_BOOT_COMPLETED, FOREGROUND_SERVICE — WorkManager
 *   VIBRATE, USE_BIOMETRIC, USE_FINGERPRINT — expo-haptics / local auth, P4
 *   POST_NOTIFICATIONS — local notifications, P4
 *   CHECK_LICENSE — Play licensing (Expo default)
 *   DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION — AndroidX (work, core) generates a
 *     per-package permission for RECEIVER_NOT_EXPORTED dynamic receivers, required
 *     on Android 13+ (SDK 33+). Added by AGP when a library declares a receiver
 *     with android:exported="false" and RECEIVER_NOT_EXPORTED flag.
 */
export const ALLOWED_FROM_LIBRARIES = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.WAKE_LOCK',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.VIBRATE',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.POST_NOTIFICATIONS',
  'com.android.vending.CHECK_LICENSE',
  'dev.mirror.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
];

/** Never, under any build variant. Each entry is a product decision. */
export const FORBIDDEN_PERMISSIONS = [
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  'android.permission.MEDIA_PROJECTION',
  'android.permission.CAPTURE_VIDEO_OUTPUT',
  'android.permission.READ_CONTACTS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.ACCESS_LOCAL_NETWORK',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.READ_SMS',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_PHONE_STATE',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'com.google.android.gms.permission.AD_ID',
];

/** Service permissions that would mean a forbidden capability is present. */
export const FORBIDDEN_SERVICE_PERMISSIONS = [
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
];

/**
 * Parse the narrow manifest shape we care about.
 *
 * A full XML parser would be more general; this reads exactly two element types
 * and their attributes, which is all a permission audit needs, and it cannot be
 * fooled by namespace prefixes because it matches on `android:name` anywhere in
 * the tag.
 */
export function parseManifest(xml) {
  const permissions = new Set();
  const services = [];
  const usesPermissions = xml.match(/<uses-permission(?:-sdk-23)?\b[^>]*>/g) ?? [];
  for (const tag of usesPermissions) {
    const name = /android:name\s*=\s*"([^"]+)"/.exec(tag)?.[1];
    if (name) permissions.add(name);
  }

  const serviceMatches = xml.matchAll(/<service\b([^>]*?)(?:\/>|>([\s\S]*?)<\/service>)/g);
  for (const match of serviceMatches) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    services.push({
      name: /android:name\s*=\s*"([^"]+)"/.exec(attrs)?.[1] ?? '<unnamed>',
      permission: /android:permission\s*=\s*"([^"]+)"/.exec(attrs)?.[1] ?? null,
      accessibility: /android\.accessibilityservice\.AccessibilityService/.test(body),
      notificationListener: /android\.service\.notification\.NotificationListenerService/.test(body),
    });
  }

  return { permissions: [...permissions].sort(), services };
}

/** The audit itself. Pure: manifest text in, findings out. */
export function auditManifest(xml, { allowed = ALLOWED_FROM_LIBRARIES, required = REQUIRED_PERMISSIONS } = {}) {
  const parsed = parseManifest(xml);
  const present = new Set(parsed.permissions);
  const allowedSet = new Set([...allowed, ...required]);

  const missing = required.filter((permission) => !present.has(permission));
  const forbidden = parsed.permissions.filter((permission) => FORBIDDEN_PERMISSIONS.includes(permission));
  const unexpected = parsed.permissions.filter((permission) => !allowedSet.has(permission) && !FORBIDDEN_PERMISSIONS.includes(permission));
  const badServices = parsed.services.filter(
    (service) => (service.permission && FORBIDDEN_SERVICE_PERMISSIONS.includes(service.permission)) || service.accessibility || service.notificationListener,
  );

  const problems = [
    ...missing.map((permission) => `${permission} is missing: the usage collector cannot work without it`),
    ...forbidden.map((permission) => `${permission} is forbidden and must be blocked in app.json`),
    ...unexpected.map((permission) => `${permission} is not on the review allowlist; decide on it and document it`),
    ...badServices.map((service) => `service ${service.name} exposes a forbidden capability (accessibility or notification listening)`),
  ];

  return { parsed, missing, forbidden, unexpected, badServices, problems, ok: problems.length === 0 };
}

/** Locate a Gradle-produced merged manifest. Returns null when nothing is built. */
export function findMergedManifest({ root = ROOT, variant = null } = {}) {
  const candidates = [
    join(root, 'apps/mobile/android/app/build/intermediates/merged_manifests'),
    join(root, 'apps/mobile/android/app/build/intermediates/merged_manifest'),
    join(root, 'apps/mobile/android/app/build/intermediates'),
  ];
  function searchDir(dir, depth = 0) {
    if (depth > 4) return null;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isFile() && e.name === 'AndroidManifest.xml') {
        if (variant) {
          if (full.includes(`/${variant}/`) || dir.endsWith(variant) || dir.includes(`/${variant}`) || full.includes(variant)) {
            return full;
          }
        } else {
          return full;
        }
      }
      if (e.isDirectory()) {
        if (variant && depth === 0 && e.name !== variant && !e.name.startsWith(variant) && !e.name.includes(variant) && e.name !== 'merged_manifests' && e.name !== 'merged_manifest') {
          if (dir.endsWith('merged_manifests') || dir.endsWith('merged_manifest')) {
            if (e.name !== variant && !e.name.startsWith(variant)) continue;
          }
        }
        const found = searchDir(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    if (variant) {
      const direct = join(base, variant, 'AndroidManifest.xml');
      if (existsSync(direct)) return direct;
      try {
        for (const entry of readdirSync(base)) {
          if (entry !== variant && !entry.startsWith(`${variant}/`)) continue;
          const file = join(base, entry, 'AndroidManifest.xml');
          if (existsSync(file)) return file;
          const nested = join(base, entry);
          if (existsSync(nested)) {
            try {
              for (const inner of readdirSync(nested)) {
                const deeper = join(nested, inner, 'AndroidManifest.xml');
                if (existsSync(deeper)) return deeper;
              }
            } catch {}
          }
        }
      } catch {}
    }
    const recursive = searchDir(base);
    if (recursive) return recursive;
  }
  return null;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
  const explicit = arg('manifest');
  const variant = arg('variant');
  const jsonOut = arg('json');

  const manifestPath = explicit ? resolve(explicit) : findMergedManifest({ variant });
  if (!manifestPath || !existsSync(manifestPath)) {
    console.error('merged-manifest: no merged manifest to read.');
    console.error('  build one first: cd apps/mobile && npx expo prebuild -p android && ./android/gradlew -p android :app:processDebugMainManifest');
    console.error('  or point at a file: --manifest path/to/AndroidManifest.xml');
    process.exit(2);
  }

  const result = auditManifest(readFileSync(manifestPath, 'utf8'));
  const payload = { manifest: manifestPath, variant: variant ?? null, ...result, parsed: result.parsed };
  const defaultReport = join(ROOT, '.reports/merged-manifest.json');
  // Always write default for backward compat and local `make android-build`
  mkdirSync(join(ROOT, '.reports'), { recursive: true });
  writeFileSync(defaultReport, JSON.stringify(payload, null, 2));
  // If --json is provided, also write to that explicit path (used by CI to avoid overwriting debug/release)
  if (jsonOut) {
    const outPath = resolve(jsonOut);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`merged-manifest: wrote JSON report to ${outPath}`);
  }

  console.log(`merged-manifest: ${manifestPath}`);
  console.log(`  ${result.parsed.permissions.length} permissions, ${result.parsed.services.length} services`);
  if (!result.ok) {
    for (const problem of result.problems) console.error(`  ✗ ${problem}`);
    process.exit(1);
  }
  console.log(`  clean: ${REQUIRED_PERMISSIONS.join(', ')} present, nothing forbidden, every other permission allowlisted`);
  process.exit(0);
}
