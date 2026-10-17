/**
 * The expo-sqlite adapter for the store's SqlDriver port.
 *
 * Kept separate from `@mirror/store` so the store has no native dependency and
 * can run (and be tested) in Node against real SQLite.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SqlDriver } from '@mirror/store';

export function expoDriver(db: SQLiteDatabase): SqlDriver {
  return {
    async exec(sql) {
      await db.execAsync(sql);
    },
    async run(sql, params = []) {
      await db.runAsync(sql, params as never[]);
    },
    async all(sql, params = []) {
      return (await db.getAllAsync(sql, params as never[])) as never;
    },
    async transaction(fn) {
      // expo-sqlite's transaction scope returns void, so the result is carried
      // out through a closure rather than relying on its return value.
      let result: unknown;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result as never;
    },
  };
}
