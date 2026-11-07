// Pins the icon wiring: app.json -> assets, notification plugin, native small-icon lookup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const app = JSON.parse(readFileSync(join(root, 'apps/mobile/app.json'), 'utf8')).expo;
const mobile = join(root, 'apps/mobile');

test('app.json icon and adaptive icon point at files that exist', () => {
  assert.ok(existsSync(join(mobile, app.icon)), app.icon);
  assert.ok(existsSync(join(mobile, app.android.adaptiveIcon.foregroundImage)));
  assert.ok(existsSync(join(mobile, app.android.adaptiveIcon.monochromeImage)));
  assert.match(app.android.adaptiveIcon.backgroundColor, /^#[0-9A-Fa-f]{6}$/);
});

test('notification small icon is shipped for every density and wired by a plugin', () => {
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    assert.ok(existsSync(join(mobile, 'assets/notification', `drawable-${d}`, 'ic_stat_mirror.png')), d);
  }
  assert.ok(app.plugins.includes('./plugins/with-notification-icon'));
  assert.ok(existsSync(join(mobile, 'plugins/with-notification-icon.js')));
});

test('native notifications look up ic_stat_mirror and fall back to the launcher icon', () => {
  const kt = readFileSync(
    join(mobile, 'modules/mirror-usage-stats/android/src/main/java/dev/mirror/usagestats/UsageStatsModule.kt'),
    'utf8',
  );
  assert.match(kt, /getIdentifier\("ic_stat_mirror", "drawable"/);
  assert.match(kt, /applicationInfo\.icon/);
});

test('theme follows the system by default (userInterfaceStyle automatic)', () => {
  assert.equal(app.userInterfaceStyle, 'automatic');
});
