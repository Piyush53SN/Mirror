/**
 * tests/v01-polish.test.mjs
 *
 * End-to-end integration tests for the 8-part v0.1 polish step against real
 * `node:sqlite`:
 *  - Unified shared exclusion list across collector ingest, sittings, and totals
 *  - Screen-off (eventType=16) & lock (eventType=17) sitting closure through store + ingestDay
 *  - Dedupe key idempotency across 1-hour overlap syncs
 *  - Revoked Usage Access graceful handling (both pre-check and mid-query NO_PERMISSION)
 *  - Android Keystore invalidation detection & recovery with reset audit trail
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'packages/ui/tests/.build');

const storeMod = await bundleTs(join(ROOT, 'packages/store/src/index.ts'), {
  outfile: join(OUT, 'polish-store.mjs'),
  external: [],
});
const { NodeSqliteDriver, counterRandom } = await bundleTs(
  join(ROOT, 'packages/store/testing/node-driver.ts'),
  { outfile: join(OUT, 'polish-driver.mjs') },
);
const core = await bundleTs(join(ROOT, 'packages/core-analytics/src/index.ts'), {
  outfile: join(OUT, 'polish-core.mjs'),
});
const ingestMod = await bundleTs(join(ROOT, 'apps/mobile/src/collector/ingest.ts'), {
  outfile: join(OUT, 'polish-ingest.mjs'),
});

const { MirrorStore } = storeMod;
const {
  SHARED_EXCLUDED_PACKAGES,
  buildCanonicalDaySittings,
  collectUsage,
  computeDayForegroundTotals,
  isExcludedApp,
} = core;

const makeKeys = (id, fillByte) => ({
  keyId: async () => id,
  rootKey: async () => new Uint8Array(32).fill(fillByte),
});
const KEYS_A = makeKeys('keystore-key-a', 0x21);
const KEYS_B = makeKeys('keystore-key-b', 0x5a);

async function makeTempStore(keys = KEYS_A) {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-polish-'));
  const driver = NodeSqliteDriver.file(join(dir, 'mirror.db'));
  const store = new MirrorStore({ driver, keys, random: counterRandom() });
  await store.open();
  return {
    store,
    driver,
    dir,
    cleanup: () => {
      driver.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('shared exclusion list filters launchers, package installers, Mirror, and system UI identically across ingest, sittings, and totals', async () => {
  const { store, cleanup } = await makeTempStore();
  try {
    const base = Date.parse('2026-10-28T09:00:00.000Z');
    const MIN = 60_000;
    const launcherPkg = 'com.sec.android.app.launcher';

    const rawEvents = [
      // Excluded launcher
      { packageName: launcherPkg, eventType: 1, timeStamp: base },
      { packageName: launcherPkg, eventType: 2, timeStamp: base + 2 * MIN },
      // Excluded OEM package installer
      { packageName: 'com.miui.packageinstaller', eventType: 1, timeStamp: base + 3 * MIN },
      { packageName: 'com.miui.packageinstaller', eventType: 2, timeStamp: base + 4 * MIN },
      // Excluded Mirror itself
      { packageName: 'dev.mirror.app', eventType: 1, timeStamp: base + 5 * MIN },
      { packageName: 'dev.mirror.app', eventType: 2, timeStamp: base + 6 * MIN },
      // Real user app: Wikipedia (12 min)
      { packageName: 'org.wikipedia', eventType: 1, timeStamp: base + 10 * MIN },
      { packageName: 'org.wikipedia', eventType: 2, timeStamp: base + 22 * MIN },
    ];

    const source = {
      available: true,
      hasPermission: async () => true,
      openSettings: () => {},
      getWindowInsets: () => null,
      getLauncherPackages: async () => [launcherPkg],
      queryUsageStats: async () => [],
      queryEventsDebug: async () => [],
      queryEvents: async () => rawEvents,
    };

    const sharedIgnore = [...SHARED_EXCLUDED_PACKAGES, launcherPkg];
    const res = await collectUsage(source, store, {
      now: base + 30 * MIN,
      ignorePackages: sharedIgnore,
    });
    assert.equal(res.status, 'collected');

    const dayFrom = Date.parse('2026-10-28T00:00:00.000Z');
    const dayTo = Date.parse('2026-10-29T00:00:00.000Z');
    await ingestMod.ingestDay(store, '2026-10-28', 0, sharedIgnore);

    const storedSessions = await store.sessions({ fromMs: dayFrom, toMs: dayTo });
    assert.equal(storedSessions.length, 1);
    assert.equal(storedSessions[0].app, 'org.wikipedia');

    const canonicalSittings = buildCanonicalDaySittings(
      storedSessions.map((s) => ({ id: s.id, app: s.app, startMs: s.start_ms, endMs: s.end_ms })),
      { window: { fromMs: dayFrom, toMs: dayTo }, ignorePackages: sharedIgnore },
    );
    assert.equal(canonicalSittings.length, 1);
    assert.equal(canonicalSittings[0].app, 'org.wikipedia');

    const rawTotals = computeDayForegroundTotals(rawEvents, {
      window: { fromMs: dayFrom, toMs: dayTo },
      nowMs: dayTo,
      ignorePackages: sharedIgnore,
    }).filter((r) => !isExcludedApp(r.packageName, { ignorePackages: sharedIgnore }));
    assert.equal(rawTotals.length, 1);
    assert.equal(rawTotals[0].packageName, 'org.wikipedia');
    assert.equal(rawTotals[0].totalMs, 12 * MIN);
  } finally {
    cleanup();
  }
});

test('screen-off (16) and keyguard-shown (17) persist close_reason and prevent across-lock sitting merges in ingestDay; 1h overlap sync is idempotent', async () => {
  const { store, cleanup } = await makeTempStore();
  try {
    const base = Date.parse('2026-10-28T10:00:00.000Z');
    const MIN = 60_000;

    const rawEvents = [
      // Open 1: 10:00 -> screen turns off at 10:05
      { packageName: 'org.wikipedia', eventType: 1, timeStamp: base },
      { packageName: 'android', eventType: 16, timeStamp: base + 5 * MIN },
      // Open 2: 10:07 (only 2m later, <15m merge gap!) -> device locks at 10:12
      { packageName: 'org.wikipedia', eventType: 1, timeStamp: base + 7 * MIN },
      { packageName: 'com.android.systemui', eventType: 17, timeStamp: base + 12 * MIN },
      // Open 3: 10:14 (only 2m later!) -> normal pause at 10:20
      { packageName: 'org.wikipedia', eventType: 1, timeStamp: base + 14 * MIN },
      { packageName: 'org.wikipedia', eventType: 2, timeStamp: base + 20 * MIN },
    ];

    const source = {
      available: true,
      hasPermission: async () => true,
      openSettings: () => {},
      getWindowInsets: () => null,
      getLauncherPackages: async () => [],
      queryUsageStats: async () => [],
      queryEventsDebug: async () => [],
      queryEvents: async () => rawEvents,
    };

    const first = await collectUsage(source, store, {
      now: base + 25 * MIN,
      ignorePackages: SHARED_EXCLUDED_PACKAGES,
    });
    assert.equal(first.status, 'collected');
    assert.equal(first.inserted, 6);
    assert.equal(first.duplicate, 0);

    // Second sync within 1h overlap window must skip all 6 existing events cleanly via dedupe key
    const second = await collectUsage(source, store, {
      now: base + 30 * MIN,
      ignorePackages: SHARED_EXCLUDED_PACKAGES,
    });
    assert.equal(second.status, 'collected');
    assert.equal(second.inserted, 0);
    assert.equal(second.duplicate, 6);

    const dayResult = await ingestMod.ingestDay(store, '2026-10-28', 0, SHARED_EXCLUDED_PACKAGES);
    assert.equal(dayResult.sessions, 3, 'Screen-off and device-lock must split opens into 3 separate sittings');
    const dayFrom = Date.parse('2026-10-28T00:00:00.000Z');
    const dayTo = Date.parse('2026-10-29T00:00:00.000Z');
    const derived = await store.sessions({ fromMs: dayFrom, toMs: dayTo });
    assert.equal(derived.length, 3, 'Stored sessions must also contain 3 distinct sittings');
  } finally {
    cleanup();
  }
});

test('revoked Usage Access returns permission-required cleanly without corrupting stored history (both pre-check and mid-query NO_PERMISSION)', async () => {
  const { store, cleanup } = await makeTempStore();
  try {
    const base = Date.parse('2026-10-28T11:00:00.000Z');
    const MIN = 60_000;

    let granted = true;
    let throwMidQuery = false;
    const source = {
      available: true,
      hasPermission: async () => granted,
      openSettings: () => {},
      getWindowInsets: () => null,
      getLauncherPackages: async () => [],
      queryUsageStats: async () => [],
      queryEventsDebug: async () => [],
      queryEvents: async () => {
        if (throwMidQuery) {
          const err = new Error('Usage access permission is not granted.');
          err.code = 'NO_PERMISSION';
          throw err;
        }
        return [
          { packageName: 'org.wikipedia', eventType: 1, timeStamp: base },
          { packageName: 'org.wikipedia', eventType: 2, timeStamp: base + 10 * MIN },
        ];
      },
    };

    // Initial sync succeeds
    const ok = await collectUsage(source, store, { now: base + 15 * MIN });
    assert.equal(ok.status, 'collected');
    await ingestMod.ingestDay(store, '2026-10-28', 0);

    // User revokes Usage Access in Android Settings (pre-check false)
    granted = false;
    const deniedPre = await collectUsage(source, store, { now: base + 20 * MIN });
    assert.equal(deniedPre.status, 'permission-required');

    // Race: permission revoked right between hasPermission() and queryEvents()
    granted = true;
    throwMidQuery = true;
    const deniedMid = await collectUsage(source, store, { now: base + 25 * MIN });
    assert.equal(deniedMid.status, 'permission-required');

    // Stored history remains 100% intact and readable
    const storedEvents = await store.events();
    const storedSessions = await store.sessions();
    assert.equal(storedEvents.length, 2);
    assert.equal(storedSessions.length, 1);
  } finally {
    cleanup();
  }
});

test('Keystore invalidation recovery wipes undecryptable rows, records keystore_invalidated audit, and resumes clean collection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-polish-ks-'));
  const dbPath = join(dir, 'mirror.db');
  const driverA = NodeSqliteDriver.file(dbPath);
  const oldStore = new MirrorStore({ driver: driverA, keys: KEYS_A, random: counterRandom() });
  await oldStore.open();

  const base = Date.parse('2026-10-27T14:00:00.000Z');
  const MIN = 60_000;
  const source = {
    available: true,
    hasPermission: async () => true,
    openSettings: () => {},
    getWindowInsets: () => null,
    getLauncherPackages: async () => [],
    queryUsageStats: async () => [],
    queryEventsDebug: async () => [],
    queryEvents: async () => [
      { packageName: 'org.wikipedia', eventType: 1, timeStamp: base },
      { packageName: 'org.wikipedia', eventType: 2, timeStamp: base + 8 * MIN },
    ],
  };

  try {
    await collectUsage(source, oldStore, { now: base + 10 * MIN });
    driverA.db.close();

    // Simulate Android Keystore invalidating KEYS_A and provisioning KEYS_B on next launch
    const driverB = NodeSqliteDriver.file(dbPath);
    try {
      const rotatedStore = new MirrorStore({ driver: driverB, keys: KEYS_B, random: counterRandom() });
      await rotatedStore.open();
      const integrity = await rotatedStore.verifyKeyIntegrity();
      assert.equal(integrity.ok, false);

      const audit = await rotatedStore.recoverFromKeyInvalidation({
        day: '2026-10-27',
        reason: 'keystore_invalidated',
      });
      assert.equal(audit.reason, 'keystore_invalidated');

      const postIntegrity = await rotatedStore.verifyKeyIntegrity();
      assert.equal(postIntegrity.ok, true);
      assert.deepEqual(await rotatedStore.lastResetAudit(), audit);

      // Subsequent sync writes and decrypts cleanly under KEYS_B
      const afterRecovery = await collectUsage(source, rotatedStore, { now: base + 20 * MIN });
      assert.equal(afterRecovery.status, 'collected');
      assert.equal((await rotatedStore.events()).length, 2);
    } finally {
      driverB.db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
