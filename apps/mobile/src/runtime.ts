/**
 * The runtime: the one place the store, the key provider and the collector are
 * wired together.
 *
 * Nothing in the UI may construct a `MirrorStore`; it asks this module. That keeps
 * "one store per process" true and makes the key provider swappable in tests.
 *
 * P1b-1 stops here: the runtime opens the encrypted store and exposes a collection
 * pass. Nothing renders it yet — ingestion into screens, importers and embeddings
 * arrive in P1b-2.
 */
import * as SQLite from 'expo-sqlite';
import { MirrorStore } from '@mirror/store';
import { collectUsage } from '@mirror/core-analytics';
import { expoDriver } from './storage/expoDriver';
import { secureStoreKeys, osRandom } from './storage/keys';
import { nativeUsageSource } from './collector/usageSource';

export type MirrorRuntime = {
  store: MirrorStore;
  collectNow(now?: number): ReturnType<typeof collectUsage>;
  usage(): ReturnType<typeof nativeUsageSource>;
};

let singleton: MirrorRuntime | null = null;

export async function createRuntime(options: { allowContent?: boolean; retentionDays?: 90 | 180 | 365 } = {}): Promise<MirrorRuntime> {
  if (singleton) return singleton;

  const db = await SQLite.openDatabaseAsync('mirror.db');
  const store = new MirrorStore({
    driver: expoDriver(db),
    keys: secureStoreKeys(),
    random: osRandom,
    allowContent: options.allowContent ?? false,
    retentionDays: options.retentionDays ?? 180,
  });
  await store.open();

  const usage = nativeUsageSource();
  singleton = {
    store,
    usage: () => usage,
    collectNow: (now = Date.now()) => collectUsage(usage, store, { now }),
  };
  return singleton;
}

/** Tests and a future "sign out" path need a way to forget the singleton. */
export function resetRuntime(): void {
  singleton = null;
}
