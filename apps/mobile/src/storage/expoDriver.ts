/**
 * The expo-sqlite adapter for the store's SqlDriver port.
 *
 * Kept separate from `@mirror/store` so the store has no native dependency and
 * can run (and be tested) in Node against real SQLite.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SqlDriver } from '@mirror/store';

export function expoDriver(db: SQLiteDatabase): SqlDriver {
  // Strictly serialize all top-level transactions via a FIFO promise queue.
  // MirrorStore's contract forbids nested transactions (see NodeSqliteDriver).
  // Previously a shared `depth > 0` counter attempted to allow nesting, which
  // caused staggered concurrent callers (e.g. AppState 'active' firing while an
  // initial sync transaction was in flight) to see `depth === 1`, bypass the
  // queue, and interleave SELECT/INSERT statements inside the same transaction.
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
      let release!: () => void;
      const next = new Promise<void>((res) => {
        release = res;
      });
      const prev = queue;
      queue = next;
      await prev;

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
        release();
      }
    },
  };
}
