const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Configures `signingConfigs.release` in `android/app/build.gradle` to read
 * signing credentials strictly from environment variables or external Gradle
 * properties (`~/.gradle/gradle.properties` / `-PMIRROR_UPLOAD_*`), never from
 * files inside the repository.
 *
 * When `MIRROR_UPLOAD_STORE_FILE` is not set (e.g. manifest gate or local dev),
 * `buildTypes.release` falls back cleanly to `signingConfigs.debug`.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes('MIRROR_UPLOAD_STORE_FILE')) {
      return modConfig;
    }

    const debugSigningBlock = [
      '    signingConfigs {',
      '        debug {',
      "            storeFile file('debug.keystore')",
      "            storePassword 'android'",
      "            keyAlias 'androiddebugkey'",
      "            keyPassword 'android'",
      '        }',
      '    }',
    ].join('\n');

    const releaseSigningBlock = [
      '    signingConfigs {',
      '        debug {',
      "            storeFile file('debug.keystore')",
      "            storePassword 'android'",
      "            keyAlias 'androiddebugkey'",
      "            keyPassword 'android'",
      '        }',
      '        release {',
      "            def uploadStoreFile = System.getenv('MIRROR_UPLOAD_STORE_FILE') ?: findProperty('MIRROR_UPLOAD_STORE_FILE')",
      '            if (uploadStoreFile) {',
      '                storeFile file(uploadStoreFile)',
      "                storePassword System.getenv('MIRROR_UPLOAD_STORE_PASSWORD') ?: (findProperty('MIRROR_UPLOAD_STORE_PASSWORD') ?: '')",
      "                keyAlias System.getenv('MIRROR_UPLOAD_KEY_ALIAS') ?: (findProperty('MIRROR_UPLOAD_KEY_ALIAS') ?: 'mirror')",
      "                keyPassword System.getenv('MIRROR_UPLOAD_KEY_PASSWORD') ?: (findProperty('MIRROR_UPLOAD_KEY_PASSWORD') ?: '')",
      '            }',
      '        }',
      '    }',
    ].join('\n');

    if (contents.includes(debugSigningBlock)) {
      contents = contents.replace(debugSigningBlock, releaseSigningBlock);
    }

    contents = contents.replace(
      /(release\s*\{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/,
      "$1def hasReleaseKey = (System.getenv('MIRROR_UPLOAD_STORE_FILE') ?: findProperty('MIRROR_UPLOAD_STORE_FILE')) != null\n            signingConfig hasReleaseKey ? signingConfigs.release : signingConfigs.debug",
    );

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
