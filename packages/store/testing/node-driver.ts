/**
 * A SqlDriver over Node's built-in SQLite.
 *
 * Used by the store's tests only — it is not exported from the package and never
 * reached by the app bundle. It runs the *real* SQL against a *real* SQLite file,
 * so the tests exercise the schema, the indexes and the PRAGMAs that ship.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver } from '../src/types';

export class NodeSqliteDriver implements SqlDriver {
  private depth = 0;
  constructor(readonly db: DatabaseSync) {}

  static memory(): NodeSqliteDriver {
    return new NodeSqliteDriver(new DatabaseSync(':memory:'));
  }

  static file(path: string): NodeSqliteDriver {
    return new NodeSqliteDriver(new DatabaseSync(path));
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }

  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // node:sqlite is synchronous; nesting is a bug in the caller, not something to
    // paper over with savepoints.
    if (this.depth > 0) throw new Error('nested transactions are not supported by the store');
    this.depth += 1;
    this.db.exec('BEGIN');
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  close(): void {
    this.db.close();
  }
}

/** Deterministic keys and nonces for tests. Never used on a device. */
export const TEST_ROOT_KEY = new Uint8Array(32).fill(7);

export function counterRandom(): (length: number) => Uint8Array {
  let counter = 0;
  return (length: number) => {
    counter += 1;
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) out[i] = (counter * 31 + i * 7) & 0xff;
    return out;
  };
}
