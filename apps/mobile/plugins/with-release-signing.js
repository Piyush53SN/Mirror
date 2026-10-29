const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Configures `signingConfigs.release` in `android/app/build.gradle` to read
 * signing credentials strictly from environment variables (`MIRROR_UPLOAD_*` or
 * `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*`) or external Gradle properties
 * (`~/.gradle/gradle.properties` / `-PMIRROR_UPLOAD_*`), never from files inside
 * the repository.
 *
 * When `MIRROR_REQUIRE_RELEASE_SIGNING=1` is set (as in `release.yml`), Gradle
 * throws a `GradleException` if any credential or keystore file is missing,
 * guaranteeing a release tag build can never silently fall back to `debug.keystore`.
 * When `MIRROR_REQUIRE_RELEASE_SIGNING` is unset (e.g. manifest gate or local dev),
 * `buildTypes.release` falls back cleanly to `signingConfigs.debug`.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes('MIRROR_REQUIRE_RELEASE_SIGNING')) {
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
      "            def uploadStorePass = System.getenv('MIRROR_UPLOAD_STORE_PASSWORD') ?: (System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: findProperty('MIRROR_UPLOAD_STORE_PASSWORD'))",
      "            def uploadKeyAlias = System.getenv('MIRROR_UPLOAD_KEY_ALIAS') ?: (System.getenv('ANDROID_KEY_ALIAS') ?: findProperty('MIRROR_UPLOAD_KEY_ALIAS'))",
      "            def uploadKeyPass = System.getenv('MIRROR_UPLOAD_KEY_PASSWORD') ?: (System.getenv('ANDROID_KEY_PASSWORD') ?: findProperty('MIRROR_UPLOAD_KEY_PASSWORD'))",
      '            if (uploadStoreFile && file(uploadStoreFile).exists() && uploadStorePass && uploadKeyAlias && uploadKeyPass) {',
      '                storeFile file(uploadStoreFile)',
      '                storePassword uploadStorePass',
      '                keyAlias uploadKeyAlias',
      '                keyPassword uploadKeyPass',
      '            }',
      '        }',
      '    }',
    ].join('\n');

    if (contents.includes(debugSigningBlock)) {
      contents = contents.replace(debugSigningBlock, releaseSigningBlock);
    }

    const releaseGuardBlock = [
      "def requireReleaseSigning = (System.getenv('MIRROR_REQUIRE_RELEASE_SIGNING') ?: findProperty('MIRROR_REQUIRE_RELEASE_SIGNING')) == '1'",
      "            def releaseStorePath = System.getenv('MIRROR_UPLOAD_STORE_FILE') ?: findProperty('MIRROR_UPLOAD_STORE_FILE')",
      "            def releaseStorePass = System.getenv('MIRROR_UPLOAD_STORE_PASSWORD') ?: (System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: findProperty('MIRROR_UPLOAD_STORE_PASSWORD'))",
      "            def releaseKeyAlias = System.getenv('MIRROR_UPLOAD_KEY_ALIAS') ?: (System.getenv('ANDROID_KEY_ALIAS') ?: findProperty('MIRROR_UPLOAD_KEY_ALIAS'))",
      "            def releaseKeyPass = System.getenv('MIRROR_UPLOAD_KEY_PASSWORD') ?: (System.getenv('ANDROID_KEY_PASSWORD') ?: findProperty('MIRROR_UPLOAD_KEY_PASSWORD'))",
      '            def hasReleaseKey = releaseStorePath && file(releaseStorePath).exists() && releaseStorePass && releaseKeyAlias && releaseKeyPass',
      '            if (requireReleaseSigning && !hasReleaseKey) {',
      "                throw new GradleException('MIRROR_REQUIRE_RELEASE_SIGNING=1 is set, but release signing credentials or keystore file are missing. Refusing to fall back to debug.keystore.')",
      '            }',
      '            signingConfig hasReleaseKey ? signingConfigs.release : signingConfigs.debug',
    ].join('\n');

    contents = contents.replace(
      /(release\s*\{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/,
      `$1${releaseGuardBlock}`,
    );

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
