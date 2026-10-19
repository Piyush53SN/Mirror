/**
 * apps/mobile/plugins/remove-forbidden-permissions.js
 *
 * Expo config plugin that ensures forbidden permissions are removed from
 * ALL Android manifests (main, debug, debugOptimized), not just main.
 *
 * Expo's built-in blockedPermissions only touches main/AndroidManifest.xml.
 * React Native's own debug/AndroidManifest.xml adds SYSTEM_ALERT_WINDOW and
 * ACCESS_LOCAL_NETWORK for the dev overlay and local-network debugger. Those
 * are forbidden by product decision (overlays forbidden) and must be removed
 * even in debug, otherwise the merged-manifest gate fails.
 *
 * This plugin runs after prebuild via withDangerousMod and edits the XML files
 * directly, adding tools:node="remove" for each blocked permission.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- Expo plugins are CommonJS */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BLOCKED = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACCESS_LOCAL_NETWORK',
];

function withRemoveForbiddenPermissions(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const manifests = [
        path.join(projectRoot, 'app/src/main/AndroidManifest.xml'),
        path.join(projectRoot, 'app/src/debug/AndroidManifest.xml'),
        path.join(projectRoot, 'app/src/debugOptimized/AndroidManifest.xml'),
      ];

      for (const manifestPath of manifests) {
        if (!fs.existsSync(manifestPath)) continue;
        let content = fs.readFileSync(manifestPath, 'utf8');

        // Ensure tools namespace exists on <manifest> tag
        if (!content.includes('xmlns:tools=')) {
          content = content.replace('<manifest', '<manifest xmlns:tools="http://schemas.android.com/tools"');
        }

        for (const perm of BLOCKED) {
          // Remove any existing <uses-permission> for this permission (with or without tools:node)
          const regex = new RegExp(`<uses-permission[^>]*android:name="${perm.replace(/\./g, '\\.')}"[^>]*\\/?>\\s*`, 'g');
          content = content.replace(regex, '');

          // Add a remove tag if not already present
          const removeTag = `    <uses-permission android:name="${perm}" tools:node="remove" />`;
          if (!content.includes(`android:name="${perm}"`)) {
            // Insert before </manifest>
            content = content.replace('</manifest>', `${removeTag}\n</manifest>`);
          }
        }

        fs.writeFileSync(manifestPath, content);
      }

      return config;
    },
  ]);
}

module.exports = withRemoveForbiddenPermissions;
