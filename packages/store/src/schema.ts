/**
 * Schema and migrations.
 *
 * Migrations are ordered and versioned, and the version lives in `meta`. A store
 * whose version is *newer* than this build is refused rather than guessed at: a
 * downgraded app must not read ciphertext written with a layout it does not know.
 *
 * `PRAGMA secure_delete = ON` matters: SQLite otherwise leaves deleted row bytes
 * in free pages, which would make "delete everything" a promise about indexes
 * rather than about the file.
 */
import type { SqlDriver } from './types';

export const SCHEMA_VERSION = 1;

export type Migration = { version: number; name: string; statements: string[] };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      // Metadata columns are queryable and carry no content. Everything a person
      // would recognise is inside `payload`, which is AEAD-sealed.
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        tier TEXT NOT NULL,
        origin TEXT NOT NULL,
        content TEXT NOT NULL,
        session_id TEXT,
        item_hash TEXT,
        consent_id TEXT,
        payload BLOB NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS events_at ON events (at)`,
      `CREATE INDEX IF NOT EXISTS events_kind_at ON events (kind, at)`,
      `CREATE INDEX IF NOT EXISTS events_session ON events (session_id)`,
      `CREATE INDEX IF NOT EXISTS events_item_hash ON events (item_hash)`,
      `CREATE INDEX IF NOT EXISTS events_consent ON events (consent_id)`,
      `CREATE TABLE IF NOT EXISTS consent_log (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        action TEXT NOT NULL,
        subject TEXT NOT NULL,
        tier TEXT NOT NULL,
        scopes TEXT NOT NULL,
        promise TEXT NOT NULL,
        method TEXT NOT NULL,
        deletes_imported_events INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS consent_subject_at ON consent_log (subject, at)`,
      `CREATE TABLE IF NOT EXISTS connections (
        connector_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        scopes TEXT NOT NULL,
        token_ref TEXT NOT NULL,
        connected_at INTEGER,
        last_sync_at INTEGER,
        items_imported INTEGER NOT NULL DEFAULT 0,
        revoked_at INTEGER
      )`,
      // Provenance for imports: revoking a grant must delete exactly the events it
      // produced, and "exactly" needs a record of which ones.
      `CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        export_format TEXT NOT NULL,
        imported_at INTEGER NOT NULL,
        item_count INTEGER NOT NULL,
        consent_id TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS imports_consent ON imports (consent_id)`,
    ],
  },
];

export type MigrationResult = { from: number; to: number; applied: string[] };

/**
 * Apply pending migrations. Idempotent: running it twice applies nothing the
 * second time. Refuses a store from the future.
 */
export async function migrate(driver: SqlDriver): Promise<MigrationResult> {
  await driver.exec('PRAGMA journal_mode = WAL');
  await driver.exec('PRAGMA secure_delete = ON');
  await driver.exec('PRAGMA foreign_keys = ON');

  const hasMeta = await driver.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`,
  );
  let current = 0;
  if (hasMeta.length > 0) {
    const row = await driver.all<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`);
    current = row.length > 0 ? Number(row[0]!.value) : 0;
  }

  if (current > SCHEMA_VERSION) {
    throw new Error(
      `store schema version ${current} is newer than this build (${SCHEMA_VERSION}); upgrade the app rather than downgrading the data`,
    );
  }

  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await driver.transaction(async () => {
      for (const statement of migration.statements) await driver.exec(statement);
      await driver.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`, [String(migration.version)]);
      applied.push(`${migration.version}:${migration.name}`);
    });
    current = migration.version;
  }

  return { from: current - applied.length, to: current, applied };
}

export async function readMeta(driver: SqlDriver, key: string): Promise<string | null> {
  const rows = await driver.all<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, [key]);
  return rows.length > 0 ? rows[0]!.value : null;
}

export async function writeMeta(driver: SqlDriver, key: string, value: string): Promise<void> {
  await driver.run(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`, [key, value]);
}
