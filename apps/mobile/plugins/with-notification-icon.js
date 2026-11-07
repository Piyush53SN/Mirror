const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * Copies the monochrome notification small icon (ic_stat_mirror.png, per density) into
 * android/app/src/main/res during prebuild. Android tints small icons, so only the alpha
 * channel matters. The native module looks it up by name and falls back to the launcher icon.
 */
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const density of DENSITIES) {
        const src = path.join(projectRoot, 'assets', 'notification', `drawable-${density}`, 'ic_stat_mirror.png');
        const dest = path.join(resDir, `drawable-${density}`, 'ic_stat_mirror.png');
        if (!fs.existsSync(src)) throw new Error(`with-notification-icon: missing ${src}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      return config;
    },
  ]);
};
