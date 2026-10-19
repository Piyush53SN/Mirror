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
 * This plugin also fixes expo-clipboard's ClipboardFileProvider which declares
 * android:exported="true" (should be false for FileProvider) and causes
 * processReleaseManifest to fail on API 34+ / AGP 8+ with strict checks.
 * We override it to exported="false" via tools:replace.
 *
 * This plugin runs after prebuild via withDangerousMod and edits the XML files
 * directly.
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
          const regex = new RegExp(`<uses-permission[^>]*android:name="${perm.replace(/\./g, '\\.')}"[^>]*\\/?>\\s*`, 'g');
          content = content.replace(regex, '');

          const removeTag = `    <uses-permission android:name="${perm}" tools:node="remove" />`;
          if (!content.includes(`android:name="${perm}"`)) {
            content = content.replace('</manifest>', `${removeTag}\n</manifest>`);
          }
        }

        // Fix expo-clipboard provider: exported true -> false
        if (manifestPath.includes('/main/AndroidManifest.xml')) {
          if (!content.includes('ClipboardFileProvider')) {
            if (content.includes('</application>')) {
              const providerBlock = `        <provider
            android:name="expo.modules.clipboard.ClipboardFileProvider"
            android:authorities="\${applicationId}.ClipboardFileProvider"
            android:exported="false"
            tools:replace="android:exported">
            <meta-data
                android:name="expo.modules.clipboard.CLIPBOARD_FILE_PROVIDER_PATHS"
                android:resource="@xml/clipboard_provider_paths" />
        </provider>
`;
              content = content.replace('</application>', `${providerBlock}    </application>`);
            }
          } else {
            content = content.replace(/android:name="expo\.modules\.clipboard\.ClipboardFileProvider"[^>]*android:exported="true"/g, 'android:name="expo.modules.clipboard.ClipboardFileProvider"\n            android:authorities="${applicationId}.ClipboardFileProvider"\n            android:exported="false"\n            tools:replace="android:exported"');
            if (!content.includes('tools:replace="android:exported"') && content.includes('ClipboardFileProvider')) {
              content = content.replace(/android:name="expo\.modules\.clipboard\.ClipboardFileProvider"/g, 'android:name="expo.modules.clipboard.ClipboardFileProvider"\n            tools:replace="android:exported"');
            }
            content = content.replace(/(ClipboardFileProvider"[^>]*android:exported=")true"/g, '$1false"');
          }
        }

        fs.writeFileSync(manifestPath, content);
      }

      return config;
    },
  ]);
}

module.exports = withRemoveForbiddenPermissions;
