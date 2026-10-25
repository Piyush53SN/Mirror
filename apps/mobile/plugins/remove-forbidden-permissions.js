const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Permissions forbidden in every variant (including debug overlays added by
 * React Native's own debug AndroidManifest.xml).
 */
const ALWAYS_REMOVE = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACCESS_LOCAL_NETWORK',
];

/**
 * Permissions stripped from `release` builds in v0.1 Private mode (until P5
 * connectors ship), while preserved in `debug` so the dev client can load JS
 * from the Metro bundler.
 *
 * Note on Expo's mod execution order:
 * `withAndroidManifest` serializes `src/main/AndroidManifest.xml` AFTER
 * `withDangerousMod` runs, so `main` must be edited via `withAndroidManifest`,
 * whereas `src/debug/AndroidManifest.xml` and `src/release/AndroidManifest.xml`
 * are written via `withDangerousMod`.
 */
const RELEASE_REMOVE = ['android.permission.INTERNET'];

function ensureToolsNamespace(xml) {
  if (xml.includes('xmlns:tools=')) return xml;
  return xml.replace(
    /<manifest\b/,
    '<manifest xmlns:tools="http://schemas.android.com/tools"',
  );
}

function stripPermissionDeclarations(xml, permission) {
  const escaped = permission.replace(/\./g, '\\.');
  const re = new RegExp(
    `\\s*<uses-permission[^>]*android:name="${escaped}"[^>]*/>`,
    'g',
  );
  return xml.replace(re, '');
}

function addRemoveNodes(xml, permissions) {
  let out = ensureToolsNamespace(xml);
  for (const perm of permissions) {
    out = stripPermissionDeclarations(out, perm);
  }
  const lines = permissions
    .map((p) => `    <uses-permission android:name="${p}" tools:node="remove" />`)
    .join('\n');
  return out.replace(/(<manifest[^>]*>)/, `$1\n${lines}`);
}

function ensurePlainPermission(xml, permission) {
  const escaped = permission.replace(/\./g, '\\.');
  const plainRe = new RegExp(
    `<uses-permission(?=[^>]*android:name="${escaped}")(?![^>]*tools:node="remove")[^>]*/>`,
  );
  if (plainRe.test(xml)) return xml;
  const cleaned = stripPermissionDeclarations(xml, permission);
  return cleaned.replace(
    /(<manifest[^>]*>)/,
    `$1\n    <uses-permission android:name="${permission}" />`,
  );
}

module.exports = function withRemoveForbiddenPermissions(config) {
  // 1. Strip Expo template's plain `INTERNET` entry from src/main/AndroidManifest.xml
  //    via `withAndroidManifest` (which writes main/AndroidManifest.xml last).
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    if (Array.isArray(manifest['uses-permission'])) {
      const releaseRemoveSet = new Set(RELEASE_REMOVE);
      manifest['uses-permission'] = manifest['uses-permission'].filter((item) => {
        const name = item?.$?.['android:name'];
        return !releaseRemoveSet.has(name);
      });
    }
    return modConfig;
  });

  // 2. Patch `src/debug`, `src/debugOptimized`, and `src/release` build-type manifests.
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const srcRoot = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
      );

      // debug & debugOptimized: remove forbidden overlay/local-network permissions,
      // and explicitly declare INTERNET so Metro dev server works in debug builds.
      for (const debugVariant of ['debug', 'debugOptimized']) {
        const variantPath = path.join(srcRoot, debugVariant, 'AndroidManifest.xml');
        if (!fs.existsSync(variantPath)) continue;
        let xml = fs.readFileSync(variantPath, 'utf8');
        xml = addRemoveNodes(xml, ALWAYS_REMOVE);
        for (const perm of RELEASE_REMOVE) {
          xml = ensurePlainPermission(xml, perm);
        }
        fs.writeFileSync(variantPath, xml, 'utf8');
      }

      // release/AndroidManifest.xml: highest-priority build-type overlay on release
      // builds — strips INTERNET contributed by react-android and expo-file-system
      // AARs, plus ALWAYS_REMOVE. Omit `package="..."` for AGP 8+ compatibility.
      const releaseDir = path.join(srcRoot, 'release');
      const releasePath = path.join(releaseDir, 'AndroidManifest.xml');
      fs.mkdirSync(releaseDir, { recursive: true });
      const baseReleaseXml = fs.existsSync(releasePath)
        ? fs.readFileSync(releasePath, 'utf8')
        : [
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
            '    xmlns:tools="http://schemas.android.com/tools">',
            '</manifest>',
            '',
          ].join('\n');
      const releaseXml = addRemoveNodes(baseReleaseXml, [
        ...RELEASE_REMOVE,
        ...ALWAYS_REMOVE,
      ]);
      fs.writeFileSync(releasePath, releaseXml, 'utf8');

      return modConfig;
    },
  ]);

  return config;
};
