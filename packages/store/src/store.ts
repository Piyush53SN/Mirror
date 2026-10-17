/**
 * MirrorStore.
 *
 * The single write path for behaviour data. It exists so that three promises are
 * enforced by code rather than by convention:
 *
 *   1. **Consent first.** A tier A/B/C event must cite a live grant. If the grant
 *      is missing or revoked, the write is refused — no "collect now, ask later".
 *   2. **Content is opt-in.** When `allowContent` is false, a content-class event
 *      is refused rather than stripped: a caller that ignores the preference
 *      should find out loudly, not quietly lose fields.
 *   3. **Deletion means deletion.** `deleteAll()` drops every row and vacuums;
 *      `sweepExpired()` applies the retention window; revoking a connector deletes
 *      exactly the imports that grant produced.
 *
 * All SQL is parameterised. The only string interpolation is a table name from a
 * closed set, and it is checked before use.
 */
import { validateEvent, type MirrorEvent } from '@mirror/shared-types';
import { deriveKeys, itemHash, seal, open, DecryptionError, type DerivedKeys } from './crypto';
import { migrate, readMeta, writeMeta, SCHEMA_VERSION } from './schema';
import type {
  AppendResult,
  Clock,
  ConnectionRow,
  ConsentEntry,
  ImportRecord,
  RandomBytes,
  SqlDriver,
  StoredEvent,
  StoreOptions,
} from './types';

const DEFAULT_RETENTION_DAYS = 180;
const DAY_MS = 86_400_000;

type EventRow = {
  id: string;
  at: number;
  kind: string;
  tier: string;
  origin: string;
  content: string;
  session_id: string | null;
  item_hash: string | null;
  payload: Uint8Array;
};

export class MirrorStore {
  private readonly driver: SqlDriver;
  private readonly clock: Clock;
  private readonly random: RandomBytes;
  private readonly allowContent: boolean;
  private readonly retentionDays: number;
  private readonly diagnostic: (message: string, detail?: unknown) => void;
  private keys: DerivedKeys | null = null;
  private keyId = '';

  constructor(private readonly options: StoreOptions) {
    this.driver = options.driver;
    this.clock = options.clock ?? (() => Date.now());
    this.random =
      options.random ??
      (() => {
        throw new Error('MirrorStore needs a RandomBytes source; never fall back to Math.random for nonces');
      });
    this.allowContent = options.allowContent ?? false;
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.diagnostic = options.onDiagnostic ?? (() => {});
  }

  /** Open (and migrate) the store. Call once per process. */
  async open(): Promise<{ schemaVersion: number }> {
    if (!this.options.keys) throw new Error('MirrorStore needs a KeyProvider');
    const root = await this.options.keys.rootKey();
    this.keyId = await this.options.keys.keyId();
    this.keys = deriveKeys(root);
    await migrate(this.driver);
    return { schemaVersion: SCHEMA_VERSION };
  }

  private derived(): DerivedKeys {
    if (!this.keys) throw new Error('store is not open; call open() first');
    return this.keys;
  }

  /* ------------------------------------------------------------------ events */

  /**
   * Validate, filter and seal a batch.
   *
   * Idempotent by id: re-ingesting the same window inserts nothing. That is what
   * makes an interrupted collection safe to retry.
   */
  async appendEvents(events: readonly unknown[]): Promise<AppendResult> {
    const result: AppendResult = { inserted: 0, duplicate: 0, rejected: [] };
    const accepted: MirrorEvent[] = [];

    for (const candidate of events) {
      const validation = validateEvent(candidate);
      if (!validation.ok) {
        const id = (candidate as { id?: string } | null)?.id ?? '<no-id>';
        result.rejected.push({ id, reason: validation.errors.map((error) => `${error.path}: ${error.message}`).join('; ') });
        continue;
      }
      const event = validation.value;
      if (event.content === 'content' && !this.allowContent) {
        result.rejected.push({ id: event.id, reason: 'content events are off; the person has not opted in' });
        continue;
      }
      accepted.push(event);
    }

    if (accepted.length === 0) return result;

    // Consent is checked once per distinct grant, inside the same transaction as
    // the writes, so a concurrent revocation cannot interleave.
    await this.driver.transaction(async () => {
      const live = await this.liveGrants();
      const permitted: MirrorEvent[] = [];
      for (const event of accepted) {
        if (event.tier === 'A' || event.tier === 'B' || event.tier === 'C') {
          if (!event.consent || !live.has(event.consent)) {
            result.rejected.push({ id: event.id, reason: `no live consent grant "${event.consent ?? '<none>'}" for tier ${event.tier}` });
            continue;
          }
        }
        permitted.push(event);
      }

      for (const event of permitted) {
        const existing = await this.driver.all<{ id: string }>(`SELECT id FROM events WHERE id = ?`, [event.id]);
        if (existing.length > 0) {
          result.duplicate += 1;
          continue;
        }
        const envelope = seal(event, this.derived(), this.keyId, this.random);
        await this.driver.run(
          `INSERT INTO events (id, at, kind, tier, origin, content, session_id, item_hash, consent_id, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            event.id,
            Date.parse(event.at),
            event.kind,
            event.tier,
            event.origin,
            event.content,
            event.session_id ?? null,
            (event as { item_hash?: string }).item_hash ?? null,
            event.consent ?? null,
            envelope,
          ],
        );
        result.inserted += 1;
      }
    });

    return result;
  }

  /** Events in [fromMs, toMs), oldest first, newest first, or both. Decrypted. */
  async events(options: { from?: number; to?: number; limit?: number; newestFirst?: boolean; kind?: string } = {}): Promise<StoredEvent[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options.from !== undefined) {
      clauses.push('at >= ?');
      params.push(options.from);
    }
    if (options.to !== undefined) {
      clauses.push('at < ?');
      params.push(options.to);
    }
    if (options.kind) {
      clauses.push('kind = ?');
      params.push(options.kind);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = options.newestFirst ? 'DESC' : 'ASC';
    const limit = options.limit ? `LIMIT ${Math.max(1, Math.floor(options.limit))}` : '';
    const rows = await this.driver.all<EventRow>(`SELECT * FROM events ${where} ORDER BY at ${order}, id ${order} ${limit}`, params);
    return rows.map((row) => this.decodeRow(row));
  }

  /** Total events, and the per-tier breakdown the privacy receipt reports. */
  async counts(): Promise<{ total: number; byTier: Record<string, number>; byContent: Record<string, number> }> {
    const total = await this.driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM events`);
    const tiers = await this.driver.all<{ tier: string; n: number }>(`SELECT tier, COUNT(*) AS n FROM events GROUP BY tier`);
    const contents = await this.driver.all<{ content: string; n: number }>(`SELECT content, COUNT(*) AS n FROM events GROUP BY content`);
    return {
      total: Number(total[0]?.n ?? 0),
      byTier: Object.fromEntries(tiers.map((row) => [row.tier, Number(row.n)])),
      byContent: Object.fromEntries(contents.map((row) => [row.content, Number(row.n)])),
    };
  }

  /** The item hash for a canonical identity, under this install's key. */
  hashItems(canonicalIdentities: readonly string[]): string[] {
    return canonicalIdentities.map((identity) => itemHash(identity, this.derived()));
  }

  /* ------------------------------------------------------------------ cursor */

  /** Ingest cursor: where the collector last stopped (ms since epoch). */
  async getCursor(source: string): Promise<number | null> {
    const value = await readMeta(this.driver, `cursor:${source}`);
    return value === null ? null : Number(value);
  }

  async setCursor(source: string, atMs: number): Promise<void> {
    if (!Number.isFinite(atMs) || atMs < 0) throw new Error(`invalid cursor ${atMs}`);
    await writeMeta(this.driver, `cursor:${source}`, String(Math.floor(atMs)));
  }

  /* ----------------------------------------------------------------- consent */

  async appendConsent(entry: ConsentEntry): Promise<void> {
    if (entry.action === 'revoked') {
      const live = await this.liveGrants();
      if (!live.has(entry.subject)) throw new Error(`cannot revoke "${entry.subject}": no live grant`);
      if (!entry.deletes_imported_events) throw new Error('a revocation must delete what its grant produced');
    }
    await this.driver.run(
      `INSERT INTO consent_log (id, at, action, subject, tier, scopes, promise, method, deletes_imported_events)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        Date.parse(entry.at),
        entry.action,
        entry.subject,
        entry.tier,
        JSON.stringify(entry.scopes),
        entry.promise,
        entry.method,
        entry.deletes_imported_events ? 1 : 0,
      ],
    );
  }

  /** Subject → the last non-revoked entry. Derived, never stored twice. */
  async liveGrants(): Promise<Map<string, ConsentEntry>> {
    const rows = await this.driver.all<{
      id: string;
      at: number;
      action: string;
      subject: string;
      tier: string;
      scopes: string;
      promise: string;
      method: string;
      deletes_imported_events: number;
    }>(`SELECT * FROM consent_log ORDER BY at ASC, rowid ASC`);
    const live = new Map<string, ConsentEntry>();
    for (const row of rows) {
      const entry: ConsentEntry = {
        id: row.id,
        at: new Date(Number(row.at)).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        action: row.action as ConsentEntry['action'],
        subject: row.subject,
        tier: row.tier,
        scopes: JSON.parse(row.scopes) as string[],
        promise: row.promise,
        method: row.method,
        deletes_imported_events: Boolean(row.deletes_imported_events),
      };
      if (entry.action === 'revoked') live.delete(entry.subject);
      else live.set(entry.subject, entry);
    }
    return live;
  }

  async consentLog(): Promise<ConsentEntry[]> {
    const rows = await this.driver.all<{
      id: string;
      at: number;
      action: string;
      subject: string;
      tier: string;
      scopes: string;
      promise: string;
      method: string;
      deletes_imported_events: number;
    }>(`SELECT * FROM consent_log ORDER BY at ASC, rowid ASC`);
    return rows.map((row) => ({
      id: row.id,
      at: new Date(Number(row.at)).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      action: row.action as ConsentEntry['action'],
      subject: row.subject,
      tier: row.tier,
      scopes: JSON.parse(row.scopes) as string[],
      promise: row.promise,
      method: row.method,
      deletes_imported_events: Boolean(row.deletes_imported_events),
    }));
  }

  /**
   * Revoke a subject: record the revocation and delete what it produced.
   *
   * Deletion is by consent id for imported events, and by tier for OS data only
   * when the subject is the OS grant itself — the OS grant is the only thing that
   * makes tier-D data lawful to keep.
   */
  async revoke(entry: Omit<ConsentEntry, 'action' | 'deletes_imported_events'>): Promise<{ deletedEvents: number }> {
    const live = await this.liveGrants();
    if (!live.has(entry.subject)) throw new Error(`cannot revoke "${entry.subject}": no live grant`);

    let deleted = 0;
    await this.driver.transaction(async () => {
      await this.driver.run(
        `INSERT INTO consent_log (id, at, action, subject, tier, scopes, promise, method, deletes_imported_events)
         VALUES (?, ?, 'revoked', ?, ?, ?, ?, ?, 1)`,
        [entry.id, Date.parse(entry.at), entry.subject, entry.tier, JSON.stringify(entry.scopes), entry.promise, entry.method],
      );

      // Imported events carry the grant that produced them, so revocation is an
      // exact delete rather than a scan-and-decrypt.
      const doomed = await this.driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE consent_id = ?`, [entry.subject]);
      await this.driver.run(`DELETE FROM events WHERE consent_id = ?`, [entry.subject]);
      deleted += Number(doomed[0]?.n ?? 0);

      // The OS usage grant is the only thing that makes tier-D data lawful, so
      // revoking it removes tier-D events too.
      if (entry.tier === 'D') {
        const osRows = await this.driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE tier = 'D'`);
        await this.driver.run(`DELETE FROM events WHERE tier = 'D'`);
        deleted += Number(osRows[0]?.n ?? 0);
      }

      await this.driver.run(`DELETE FROM imports WHERE consent_id = ?`, [entry.subject]);
      // A disconnected connector keeps its row for the record, with no token use.
      await this.driver.run(`UPDATE connections SET status = 'disconnected', revoked_at = ?, scopes = '[]' WHERE connector_id = ?`, [
        Date.parse(entry.at),
        entry.subject,
      ]);
    });
    return { deletedEvents: deleted };
  }

  /* ------------------------------------------------------------- connections */

  async upsertConnection(row: ConnectionRow): Promise<void> {
    for (const key of Object.keys(row)) {
      if (/(access_?token|refresh_?token|secret|password|authorization)/i.test(key)) {
        throw new Error(`credential-shaped field "${key}" cannot be stored; tokens live in the keystore`);
      }
    }
    if (!/^keystore:[A-Za-z0-9._-]{3,64}$/.test(row.token_ref)) throw new Error('token_ref must be a keystore reference');
    await this.driver.run(
      `INSERT INTO connections (connector_id, status, scopes, token_ref, connected_at, last_sync_at, items_imported, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connector_id) DO UPDATE SET
         status = excluded.status, scopes = excluded.scopes, token_ref = excluded.token_ref,
         connected_at = excluded.connected_at, last_sync_at = excluded.last_sync_at,
         items_imported = excluded.items_imported, revoked_at = excluded.revoked_at`,
      [
        row.connector_id,
        row.status,
        JSON.stringify(row.scopes),
        row.token_ref,
        row.connected_at ? Date.parse(row.connected_at) : null,
        row.last_sync_at ? Date.parse(row.last_sync_at) : null,
        row.items_imported,
        row.revoked_at ? Date.parse(row.revoked_at) : null,
      ],
    );
  }

  async connections(): Promise<ConnectionRow[]> {
    const rows = await this.driver.all<{
      connector_id: string;
      status: string;
      scopes: string;
      token_ref: string;
      connected_at: number | null;
      last_sync_at: number | null;
      items_imported: number;
      revoked_at: number | null;
    }>(`SELECT * FROM connections ORDER BY connector_id`);
    return rows.map((row) => ({
      connector_id: row.connector_id,
      status: row.status,
      scopes: JSON.parse(row.scopes) as string[],
      token_ref: row.token_ref,
      connected_at: row.connected_at === null ? null : new Date(Number(row.connected_at)).toISOString(),
      last_sync_at: row.last_sync_at === null ? null : new Date(Number(row.last_sync_at)).toISOString(),
      items_imported: Number(row.items_imported),
      revoked_at: row.revoked_at === null ? null : new Date(Number(row.revoked_at)).toISOString(),
    }));
  }

  /* ----------------------------------------------------------------- imports */

  async recordImport(record: ImportRecord): Promise<void> {
    await this.driver.run(
      `INSERT INTO imports (id, source_id, export_format, imported_at, item_count, consent_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [record.id, record.source_id, record.export_format, Date.parse(record.imported_at), record.item_count, record.consent_id],
    );
  }

  async imports(): Promise<ImportRecord[]> {
    const rows = await this.driver.all<{
      id: string;
      source_id: string;
      export_format: string;
      imported_at: number;
      item_count: number;
      consent_id: string;
    }>(`SELECT * FROM imports ORDER BY imported_at ASC`);
    return rows.map((row) => ({
      ...row,
      imported_at: new Date(Number(row.imported_at)).toISOString(),
      item_count: Number(row.item_count),
    }));
  }

  /* --------------------------------------------------------------- retention */

  /**
   * Delete events older than the retention window.
   *
   * Returns how many went, and never touches rows inside the window. `secure_delete`
   * is on, so the bytes are zeroed, not merely unlinked.
   */
  async sweepExpired(now = this.clock()): Promise<{ deleted: number; olderThan: string }> {
    const cutoff = now - this.retentionDays * DAY_MS;
    const before = await this.driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE at < ?`, [cutoff]);
    await this.driver.transaction(async () => {
      await this.driver.run(`DELETE FROM events WHERE at < ?`, [cutoff]);
    });
    return { deleted: Number(before[0]?.n ?? 0), olderThan: new Date(cutoff).toISOString() };
  }

  /* ------------------------------------------------------------------ delete */

  /**
   * Delete everything. Row data, then free pages.
   *
   * `VACUUM` is what makes this a promise about the file rather than about the
   * index: without it, deleted pages stay on disk until reused.
   */
  async deleteAll(): Promise<void> {
    await this.driver.transaction(async () => {
      for (const table of ['events', 'imports', 'connections', 'consent_log', 'meta']) {
        if (!['events', 'imports', 'connections', 'consent_log', 'meta'].includes(table)) throw new Error(`refusing table ${table}`);
        await this.driver.run(`DELETE FROM ${table}`);
      }
    });
    try {
      // Fold the write-ahead log back into the main file first, or the pages we
      // just deleted survive in the -wal file.
      await this.driver.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      await this.driver.exec('VACUUM');
    } catch (error) {
      // Some drivers run VACUUM outside a transaction only; failing it is not a
      // reason to claim success, but it is a reason to say so.
      this.diagnostic('VACUUM failed after deleteAll; pages may remain until reused', error);
    }
  }

  /* ----------------------------------------------------------------- internals */

  private decodeRow(row: EventRow): StoredEvent {
    let payload: Record<string, unknown>;
    try {
      payload = open<Record<string, unknown>>(row.payload, this.derived(), this.keyId);
    } catch (error) {
      if (error instanceof DecryptionError) {
        this.diagnostic(`event ${row.id} could not be decrypted`, error.message);
        throw error;
      }
      throw error;
    }
    return {
      id: row.id,
      at: Number(row.at),
      kind: row.kind,
      tier: row.tier,
      content: row.content,
      session_id: row.session_id,
      payload,
    };
  }
}

export { SCHEMA_VERSION };
