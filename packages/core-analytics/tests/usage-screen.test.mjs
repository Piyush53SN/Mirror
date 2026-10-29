import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-screen.mjs') });
const {
  buildUsageEvents,
  sessionize,
  sessionId,
  usageEventDedupeKey,
  SHARED_EXCLUDED_PACKAGES,
  DEFAULT_IGNORED_PACKAGES,
  isExcludedApp,
  computeDayForegroundTotals,
  computeDayForegroundTotalsFromStoredEvents,
  filterUsageStatsBucketsForDay,
  summarizeUsageStatsBucketsForDay,
  buildCanonicalDaySittings,
  USAGE_EVENT_TYPE,
} = core;

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

test('MIUI launcher and permission controller are ignored (finding 3) – now dynamic HOME role', () => {
  assert.ok(DEFAULT_IGNORED_PACKAGES.includes('com.google.android.permissioncontroller'), 'permission controller should be ignored');
  const launcherPkgs = ['com.miui.home', 'com.mi.android.globallauncher', 'com.sec.android.app.launcher'];
  const rows = [fg('com.miui.home', 0), bg('com.miui.home', 1), fg('com.google.android.permissioncontroller', 2), bg('com.google.android.permissioncontroller', 3), fg('com.mi.android.globallauncher', 4), bg('com.mi.android.globallauncher', 5)];
  const result = buildUsageEvents(rows, { ...base, ignorePackages: launcherPkgs });
  assert.equal(result.events.length, 0);
  assert.ok(result.dropped.every((d) => d.reason === 'ignored_package'));
  const result2 = buildUsageEvents([fg('com.google.android.permissioncontroller', 0), bg('com.google.android.permissioncontroller', 1)], base);
  assert.equal(result2.events.length, 0);
});

test('interval over 6h is dropped as too_long, not displayed', () => {
  const wide = { sinceMs: T0, untilMs: T0 + 20 * 3_600_000 };
  const rows = [fg('com.a.one', 0), bg('com.a.one', 7 * 60)]; // 7h
  const result = buildUsageEvents(rows, wide);
  assert.equal(result.events.length, 0);
  assert.equal(result.gaps[0].reason, 'too_long');
});

test('sittings close on screen-off and lock and never merge across screen-off or lock (even within 15m merge gap or 2s rotation gap)', () => {
  const screenOn = (min) => ({ packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.SCREEN_INTERACTIVE, timeStamp: at(min) });
  const keyguardHidden = (min) => ({ packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.KEYGUARD_HIDDEN, timeStamp: at(min) });

  // Case 1: Lock directly while YouTube is open at 5m, unlock at 8m (3m gap < 15m!) and reopen YouTube 8m..12m
  const directLockRows = [
    fg('com.google.android.youtube', 0),
    screenOff(5),
    keyguard(5.01),
    screenOn(8),
    keyguardHidden(8.01),
    fg('com.google.android.youtube', 8.05),
    bg('com.google.android.youtube', 12),
  ];
  const builtDirect = buildUsageEvents(directLockRows, base);
  const sittingsDirect = sessionize(builtDirect.events).sessions;
  assert.equal(sittingsDirect.length, 2, 'screen-off/lock must split same-app sittings even when <15m apart');
  assert.equal(sittingsDirect[0].durationMs, 5 * 60_000, 'first sitting ends cleanly at screen-off without absorbing 3m locked gap');
  assert.equal(sittingsDirect[0].closedBy, 'screen_off');

  // Case 2: Android pauses activity 100ms BEFORE SCREEN_NON_INTERACTIVE / KEYGUARD_SHOWN, then user unlocks 4m later
  const pauseThenLockRows = [
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: T0 },
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: T0 + 180_000 },
    { packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.KEYGUARD_SHOWN, timeStamp: T0 + 180_100 },
    { packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.KEYGUARD_HIDDEN, timeStamp: T0 + 420_000 },
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: T0 + 421_000 },
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: T0 + 540_000 },
  ];
  const builtPauseLock = buildUsageEvents(pauseThenLockRows, base);
  const sittingsPauseLock = sessionize(builtPauseLock.events).sessions;
  assert.equal(sittingsPauseLock.length, 2, 'activity pause right before device lock must still close the sitting');
  assert.equal(sittingsPauseLock[0].closedBy, 'device_lock');

  // Case 3: Switch App A -> App B -> Lock -> Unlock -> App A within 10m: App A must not merge across App B's lock!
  const crossLockRows = [
    fg('org.wikipedia', 0),
    fg('com.android.chrome', 3),
    screenOff(4),
    screenOn(7),
    fg('org.wikipedia', 7.1),
    bg('org.wikipedia', 10),
  ];
  const builtCross = buildUsageEvents(crossLockRows, base);
  const sittingsCross = sessionize(builtCross.events).sessions.filter((s) => s.app === 'org.wikipedia');
  assert.equal(sittingsCross.length, 2, 'same-app sittings separated by another app locking the screen must not merge');

  // Case 4: Quick screen lock & immediate unlock within 1.2s (<= 2s MERGE_GAP_MS) must still split sittings
  const quickLockRows = [
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: T0 },
    { packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.SCREEN_NON_INTERACTIVE, timeStamp: T0 + 30_000 },
    { packageName: 'com.android.systemui', eventType: USAGE_EVENT_TYPE.SCREEN_INTERACTIVE, timeStamp: T0 + 31_000 },
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: T0 + 31_200 },
    { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: T0 + 60_000 },
  ];
  const builtQuick = buildUsageEvents(quickLockRows, base);
  assert.equal(builtQuick.events.filter((e) => e.kind === 'app_background').length, 2, '2s merge must not merge across screen-off');
});

test('one shared exclusion list applies identically to sittings and daily totals across all data paths', () => {
  assert.ok(SHARED_EXCLUDED_PACKAGES.length >= 25);
  assert.deepEqual(SHARED_EXCLUDED_PACKAGES, DEFAULT_IGNORED_PACKAGES);
  const window = { fromMs: T0, toMs: T0 + 24 * 3_600_000 };

  for (const excludedPkg of [
    ...SHARED_EXCLUDED_PACKAGES,
    'com.oem.custom.packageinstaller',
  ]) {
    assert.equal(isExcludedApp(excludedPkg), true, `${excludedPkg} must be excluded by isExcludedApp`);

    const rawRows = [
      { packageName: excludedPkg, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: T0 + 60_000 },
      { packageName: excludedPkg, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: T0 + 180_000 },
      { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: T0 + 240_000 },
      { packageName: 'org.wikipedia', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: T0 + 360_000 },
    ];
    const built = buildUsageEvents(rawRows, { sinceMs: window.fromMs, untilMs: window.toMs });
    assert.ok(!built.events.some((e) => e.app === excludedPkg), `buildUsageEvents leaked ${excludedPkg}`);

    const syntheticEvents = [
      { schema_version: 1, id: 'evt_fg_excl', kind: 'app_foreground', at: new Date(T0 + 10_000).toISOString(), tier: 'D', origin: 'os', content: 'metadata', app: excludedPkg },
      { schema_version: 1, id: 'evt_bg_excl', kind: 'app_background', at: new Date(T0 + 70_000).toISOString(), tier: 'D', origin: 'os', content: 'metadata', app: excludedPkg, duration_ms: 60_000 },
    ];
    assert.equal(sessionize(syntheticEvents).sessions.length, 0, `sessionize leaked ${excludedPkg}`);
    assert.equal(
      buildCanonicalDaySittings([{ id: 'ses_excl', app: excludedPkg, startMs: T0 + 10_000, endMs: T0 + 70_000 }], { window }).length,
      0,
      `buildCanonicalDaySittings leaked ${excludedPkg}`,
    );
    assert.equal(
      computeDayForegroundTotals(rawRows, { window }).some((r) => r.packageName === excludedPkg),
      false,
      `computeDayForegroundTotals leaked ${excludedPkg}`,
    );
    assert.equal(
      computeDayForegroundTotalsFromStoredEvents(syntheticEvents, { window }).length,
      0,
      `computeDayForegroundTotalsFromStoredEvents leaked ${excludedPkg}`,
    );
    const buckets = [{ packageName: excludedPkg, totalTimeInForeground: 120_000, firstTimeStamp: T0 + 1_000, lastTimeStamp: T0 + 121_000 }];
    assert.equal(filterUsageStatsBucketsForDay(buckets, { window }).length, 0, `filterUsageStatsBucketsForDay leaked ${excludedPkg}`);
    assert.equal(summarizeUsageStatsBucketsForDay(buckets, { window }).length, 0, `summarizeUsageStatsBucketsForDay leaked ${excludedPkg}`);
  }
});

test('dedupe keys (usageEventDedupeKey & sessionId) are deterministic, schema-valid, and idempotent across overlapping syncs', () => {
  const fg1 = usageEventDedupeKey('app_foreground', 'org.wikipedia', T0 + 1234);
  const fg2 = usageEventDedupeKey('app_foreground', 'org.wikipedia', T0 + 1234);
  const bg1 = usageEventDedupeKey('app_background', 'org.wikipedia', T0 + 1234);
  const otherApp = usageEventDedupeKey('app_foreground', 'com.reddit.frontpage', T0 + 1234);
  const otherTs = usageEventDedupeKey('app_foreground', 'org.wikipedia', T0 + 1235);

  assert.equal(fg1, fg2, 'identical (kind, app, startMs) must produce identical dedupe key');
  assert.notEqual(fg1, bg1, 'foreground and background dedupe keys must never collide');
  assert.notEqual(fg1, otherApp, 'different apps at same timestamp must not collide');
  assert.notEqual(fg1, otherTs, '1ms timestamp difference must produce distinct dedupe key');

  fc.assert(
    fc.property(
      fc.constantFrom('org.wikipedia', 'com.reddit.frontpage', 'com.google.android.youtube', 'com.whatsapp'),
      fc.integer({ min: T0, max: T0 + 7 * 86_400_000 }),
      fc.integer({ min: 1_000, max: 3_600_000 }),
      (app, startMs, durMs) => {
        const fgKey = usageEventDedupeKey('app_foreground', app, startMs);
        const bgKey = usageEventDedupeKey('app_background', app, startMs);
        const sesKey = sessionId(app, startMs, startMs + durMs);

        assert.match(fgKey, /^evt_fg_[0-9a-f]{8}[0-9a-z]{1,8}$/);
        assert.match(bgKey, /^evt_bg_[0-9a-f]{8}[0-9a-z]{1,8}$/);
        assert.match(sesKey, /^ses_[A-Za-z0-9_-]{6,40}$/);
        assert.equal(usageEventDedupeKey('app_foreground', app, startMs), fgKey);
        assert.equal(sessionId(app, startMs, startMs + durMs), sesKey);

        const rows = [
          { packageName: app, eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: startMs },
          { packageName: app, eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: startMs + durMs },
        ];
        const pass1 = buildUsageEvents(rows, { sinceMs: startMs - 60_000, untilMs: startMs + durMs + 60_000 });
        const pass2 = buildUsageEvents(rows, { sinceMs: startMs - 3_600_000, untilMs: startMs + durMs + 120_000 });
        assert.deepEqual(pass1.events.map((e) => e.id), [fgKey, bgKey]);
        assert.deepEqual(
          pass2.events.map((e) => e.id),
          pass1.events.map((e) => e.id),
          '1h overlapping sync must emit identical dedupe keys',
        );
      },
    ),
    { numRuns: 150 },
  );
});
