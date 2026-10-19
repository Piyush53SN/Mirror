import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-screen.mjs') });
const { buildUsageEvents, USAGE_EVENT_TYPE, DEFAULT_IGNORED_PACKAGES } = core;

const T0 = Date.parse('2026-10-16T09:00:00Z');
const at = (m) => T0 + m * 60_000;
const fg = (pkg, min) => ({ packageName: pkg, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(min) });
const bg = (pkg, min) => ({ packageName: pkg, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(min) });
const screenOff = (min) => ({ packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.SCREEN_NON_INTERACTIVE, timeStamp: at(min) });
const keyguard = (min) => ({ packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.KEYGUARD_SHOWN, timeStamp: at(min) });
const base = { sinceMs: T0, untilMs: T0 + 3_600_000 };

test('screen-off closes open intervals (fixes 8h53m Google app)', () => {
  const rows = [fg('com.google.android.googlequicksearchbox', 0), screenOff(10)];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.events.length, 2, 'foreground + background from screen-off');
  assert.equal(result.events[1].duration_ms, 10 * 60_000);
  assert.equal(result.nextOpen.length, 0, 'nothing carried');
});

test('keyguard shown closes all open intervals', () => {
  const rows = [fg('com.a.one', 0), fg('com.b.two', 1), keyguard(5)];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.stats.intervals, 2);
  assert.equal(result.nextOpen.length, 0);
});

test('screen-off after ignored package still closes', () => {
  // screen-off event itself is from systemui which is ignored, but its effect is global
  const rows = [fg('com.a.one', 0), screenOff(2)];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.events.length, 2);
});

test('MIUI launcher and permission controller are ignored (finding 3)', () => {
  assert.ok(DEFAULT_IGNORED_PACKAGES.includes('com.miui.home'), 'MIUI home should be ignored');
  assert.ok(DEFAULT_IGNORED_PACKAGES.includes('com.google.android.permissioncontroller'), 'permission controller should be ignored');
  const rows = [fg('com.miui.home', 0), bg('com.miui.home', 1), fg('com.google.android.permissioncontroller', 2), bg('com.google.android.permissioncontroller', 3)];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.events.length, 0);
  assert.ok(result.dropped.every((d) => d.reason === 'ignored_package'));
});

test('interval over 6h is dropped as too_long, not displayed', () => {
  const wide = { sinceMs: T0, untilMs: T0 + 20 * 3_600_000 };
  const rows = [fg('com.a.one', 0), bg('com.a.one', 7 * 60)]; // 7h
  const result = buildUsageEvents(rows, wide);
  assert.equal(result.events.length, 0);
  assert.equal(result.gaps[0].reason, 'too_long');
});
