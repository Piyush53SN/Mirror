/**
 * The expo-sqlite adapter for the store's SqlDriver port.
 *
 * Kept separate from `@mirror/store` so the store has no native dependency and
 * can run (and be tested) in Node against real SQLite.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SqlDriver } from '@mirror/store';

export function expoDriver(db: SQLiteDatabase): SqlDriver {
  // Serialize transactions and allow nesting via depth counter.
  // The original implementation called `withTransactionAsync` directly, which
  // fails with "cannot commit - no transaction is active" when two transactions
  // run concurrently or when a transaction is started inside another (e.g. a
  // migration calling exec inside a transaction wrapper, or two runtime calls
  // racing on first launch). SQLite itself does not support nested BEGINs, so
  // we track depth: if we are already inside a transaction, just run the fn.
  // Concurrent top-level transactions are queued.
  let depth = 0;
  let queue: Promise<void> = Promise.resolve();

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
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) {
        depth += 1;
        try {
          return (await fn()) as unknown as T;
        } finally {
          depth -= 1;
        }
      }

      let release!: () => void;
      const next = new Promise<void>((res) => {
        release = res;
      });
      const prev = queue;
      queue = next;
      await prev;

      depth += 1;
      try {
        let result: T | undefined;
        let error: unknown;
        try {
          await db.withTransactionAsync(async () => {
            result = await fn();
          });
        } catch (e) {
          error = e;
        }
        if (error) throw error;
        return result as T;
      } finally {
        depth -= 1;
        release();
      }
    },
  };
}
