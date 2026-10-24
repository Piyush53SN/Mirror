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
import { deriveKeys, itemHash, seal, sealBytes, open, openBytes, DecryptionError, type DerivedKeys } from './crypto';
import { encodeVector, decodeVector } from './vector';
import { migrate, readMeta, writeMeta, SCHEMA_VERSION } from './schema';
import type {
  AppendResult,
  Clock,
  ConnectionRow,
  ConsentEntry,
  CursorState,
  DataGap,
  GapReason,
  ImportRecord,
  RandomBytes,
  RollupRecord,
  SessionRow,
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

      const seenInBatch = new Set<string>();
      for (const event of permitted) {
        if (seenInBatch.has(event.id)) {
          result.duplicate += 1;
          continue;
        }
        seenInBatch.add(event.id);
        const existing = await this.driver.all<{ id: string }>(`SELECT id FROM events WHERE id = ?`, [event.id]);
        if (existing.length > 0) {
          result.duplicate += 1;
          continue;
        }
        const envelope = seal(event, this.derived(), this.keyId, this.random);
        await this.driver.run(
          `INSERT OR IGNORE INTO events (id, at, kind, tier, origin, content, session_id, item_hash, consent_id, payload)
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
        const changed = await this.driver.all<{ n: number }>(`SELECT changes() AS n`);
        if (changed.length === 0 || Number(changed[0]?.n ?? 0) > 0) {
          result.inserted += 1;
        } else {
          result.duplicate += 1;
        }
      }
    });

    return result;
  }

  /** Events in [fromMs, toMs), oldest first, newest first, or both. Decrypted. */
  async events(options: { from?: number; to?: number; limit?: number; newestFirst?: boolean; kind?: string; vectors?: boolean } = {}): Promise<StoredEvent[]> {
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
    const events = rows.map((row) => this.decodeRow(row));
    if (!options.vectors) return events;
    // Vectors are stored separately (and sealed); rehydrating is opt-in because
    // 384 floats per event is a lot to hand to a caller that only needs counts.
    const vectors = await this.vectorsFor(events.map((event) => event.id));
    for (const event of events) {
      const found = vectors.get(event.id);
      if (found) event.payload.topic_vector = found.vector;
    }
    return events;
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

  /**
   * Which of these item hashes the store already holds.
   *
   * Chunked because SQLite's default parameter limit is 999, and an import preview
   * can easily carry tens of thousands of rows. Only the hashes cross the boundary
   * — the canonical ids never reach the database, and are not stored anywhere.
   */
  async itemHashes(hashes: readonly string[]): Promise<string[]> {
    const found: string[] = [];
    const unique = [...new Set(hashes)].filter((hash) => /^[0-9a-f]{64}$/.test(hash));
    for (let offset = 0; offset < unique.length; offset += 500) {
      const chunk = unique.slice(offset, offset + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await this.driver.all<{ item_hash: string }>(`SELECT item_hash FROM events WHERE item_hash IN (${placeholders})`, chunk);
      for (const row of rows) found.push(row.item_hash);
    }
    return found;
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
    const cutoffDay = new Date(cutoff).toISOString().slice(0, 10);
    await this.driver.transaction(async () => {
      await this.driver.run(`DELETE FROM event_vectors WHERE event_id IN (SELECT id FROM events WHERE at < ?)`, [cutoff]);
      await this.driver.run(`DELETE FROM events WHERE at < ?`, [cutoff]);
      await this.driver.run(`DELETE FROM sessions WHERE end_ms < ?`, [cutoff]);
      await this.driver.run(`DELETE FROM daily_rollups WHERE day < ?`, [cutoffDay]);
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
  /** Delete all user `intent_label` events while keeping usage history, sessions, and rollups intact. */
  async clearIntentLabels(): Promise<number> {
    let deleted = 0;
    await this.driver.transaction(async () => {
      const existing = await this.driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE kind = ?`, ['intent_label']);
      deleted = Number(existing[0]?.n ?? 0);
      if (deleted > 0) {
        await this.driver.run(`DELETE FROM events WHERE kind = ?`, ['intent_label']);
      }
    });
    return deleted;
  }

  async deleteAll(): Promise<void> {
    await this.driver.transaction(async () => {
      const tables = ['events', 'event_vectors', 'sessions', 'data_gaps', 'daily_rollups', 'imports', 'connections', 'consent_log', 'meta'];
      for (const table of tables) {
        if (!tables.includes(table)) throw new Error(`refusing table ${table}`);
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

  /* ----------------------------------------------------------- cursor state */

  /**
   * The cursor is a *state*, not a timestamp.
   *
   * A usage interval can start before one collection and end after it. If the
   * cursor were only a timestamp, the foreground row would fall outside the next
   * window and the background row would arrive without a partner — the sitting
   * would be lost twice over. So the state carries the intervals that are still
   * open, and the next run closes them with the rows it now sees.
   */
  async getCursorState(source: string): Promise<CursorState> {
    const raw = await readMeta(this.driver, `cursor_state:${source}`);
    if (raw) {
      const parsed = JSON.parse(raw) as CursorState;
      return {
        at: parsed.at === null || parsed.at === undefined ? null : Number(parsed.at),
        open: Array.isArray(parsed.open)
          ? parsed.open
              .filter((entry) => typeof entry?.app === 'string' && Number.isFinite(entry?.startMs))
              .map((entry) => ({
                app: entry.app,
                startMs: Number(entry.startMs),
                activities: Array.isArray((entry as any).activities)
                  ? (entry as any).activities
                      .filter((a: any) => typeof a?.className === 'string' && Number.isFinite(a?.startMs))
                      .map((a: any) => ({ className: a.className, startMs: Number(a.startMs) }))
                  : undefined,
              }))
          : [],
      };
    }
    // A store written before P1b-2 has only a timestamp; read it rather than
    // starting over, and carry no open intervals.
    const legacy = await this.getCursor(source);
    return { at: legacy, open: [] };
  }

  async setCursorState(source: string, state: CursorState): Promise<void> {
    if (state.at !== null && (!Number.isFinite(state.at) || state.at < 0)) throw new Error(`invalid cursor ${state.at}`);
    for (const entry of state.open) {
      if (typeof entry.app !== 'string' || !Number.isFinite(entry.startMs) || entry.startMs < 0) {
        throw new Error('invalid open interval in cursor state');
      }
      if (entry.activities) {
        for (const a of entry.activities) {
          if (typeof a.className !== 'string' || !Number.isFinite(a.startMs) || a.startMs < 0) {
            throw new Error('invalid activity in cursor state');
          }
        }
      }
    }
    await writeMeta(this.driver, `cursor_state:${source}`, JSON.stringify({ at: state.at, open: state.open }));
  }

  /* -------------------------------------------------------------- data gaps */

  /**
   * Record counted gaps: time Mirror could not measure, and why.
   *
   * A gap is not an error log. It is the difference between "you used your phone
   * for 20 minutes" and "we could measure 20 minutes; there was a 6-hour gap we
   * could not read". Scoring must be able to see that difference, so the gap is
   * stored with its reason and its span.
   */
  async recordGaps(source: string, gaps: { reason: GapReason; count: number; fromMs?: number; toMs?: number }[], atMs = this.clock()): Promise<void> {
    for (const gap of gaps) {
      if (!Number.isInteger(gap.count) || gap.count <= 0) continue;
      await this.driver.run(
        `INSERT INTO data_gaps (source, reason, from_ms, to_ms, count, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [source, gap.reason, gap.fromMs ?? null, gap.toMs ?? null, gap.count, atMs],
      );
    }
  }

  /**
   * Atomically replace recorded gaps for `source` in `[fromMs, toMs)` when
   * recomputing the current day's raw `UsageEvents` stream after a collector
   * lifecycle bug fix.
   */
  async replaceGapsForWindow(
    source: string,
    window: { fromMs: number; toMs: number },
    gaps: { reason: GapReason; count: number; fromMs?: number; toMs?: number }[],
    recordedAtMs = this.clock(),
  ): Promise<void> {
    await this.driver.transaction(async () => {
      await this.driver.run(
        `DELETE FROM data_gaps WHERE source = ? AND recorded_at >= ? AND recorded_at < ?`,
        [source, window.fromMs, window.toMs],
      );
      for (const gap of gaps) {
        if (!Number.isInteger(gap.count) || gap.count <= 0) continue;
        await this.driver.run(
          `INSERT INTO data_gaps (source, reason, from_ms, to_ms, count, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [source, gap.reason, gap.fromMs ?? null, gap.toMs ?? null, gap.count, recordedAtMs],
        );
      }
    });
  }

  async gaps(options: { fromMs?: number; toMs?: number; source?: string } = {}): Promise<DataGap[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options.fromMs !== undefined) {
      clauses.push('recorded_at >= ?');
      params.push(options.fromMs);
    }
    if (options.toMs !== undefined) {
      clauses.push('recorded_at < ?');
      params.push(options.toMs);
    }
    if (options.source) {
      clauses.push('source = ?');
      params.push(options.source);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.driver.all<{
      id: number;
      source: string;
      reason: GapReason;
      from_ms: number | null;
      to_ms: number | null;
      count: number;
      recorded_at: number;
    }>(`SELECT * FROM data_gaps ${where} ORDER BY recorded_at ASC, id ASC`, params);
    return rows.map((row) => ({
      source: row.source,
      reason: row.reason,
      from_ms: row.from_ms === null ? null : Number(row.from_ms),
      to_ms: row.to_ms === null ? null : Number(row.to_ms),
      count: Number(row.count),
      recorded_at: Number(row.recorded_at),
    }));
  }

  /** Totals for the UI: how many gaps, of what kind, and how much time they hide. */
  async gapSummary(options: { fromMs?: number; toMs?: number } = {}): Promise<{ count: number; byReason: Record<string, number>; measuredGapMs: number }> {
    const gaps = await this.gaps(options);
    const byReason: Record<string, number> = {};
    let measuredGapMs = 0;
    for (const gap of gaps) {
      byReason[gap.reason] = (byReason[gap.reason] ?? 0) + gap.count;
      if (gap.from_ms !== null && gap.to_ms !== null) measuredGapMs += Math.max(0, gap.to_ms - gap.from_ms) * gap.count;
    }
    return { count: gaps.reduce((total, gap) => total + gap.count, 0), byReason, measuredGapMs };
  }

  /* --------------------------------------------------------------- sessions */

  /**
   * Replace the derived sessions for a window.
   *
   * Sessions are *derived*, so they are rebuilt rather than patched: a rebuild is
   * deterministic, and a merged interval that appears in a later sync produces the
   * same ids as a full recomputation would. Any event whose session changed is
   * updated in the same transaction.
   */
  async applySessions(input: {
    window: { fromMs: number; toMs: number };
    sessions: { id: string; app: string; start_ms: number; end_ms: number; duration_ms: number; source?: string }[];
    assignments: { eventId: string; sessionId: string | null }[];
  }): Promise<{ written: number; reassigned: number }> {
    let written = 0;
    let reassigned = 0;
    await this.driver.transaction(async () => {
      await this.driver.run(`DELETE FROM sessions WHERE end_ms > ? AND start_ms < ?`, [input.window.fromMs, input.window.toMs]);
      for (const session of input.sessions) {
        await this.driver.run(
          `INSERT OR REPLACE INTO sessions (id, start_ms, end_ms, duration_ms, source, payload) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            session.id,
            session.start_ms,
            session.end_ms,
            session.duration_ms,
            session.source ?? 'usage_stats',
            seal({ app: session.app }, this.derived(), this.keyId, this.random),
          ],
        );
        written += 1;
      }
      for (const assignment of input.assignments) {
        const current = await this.driver.all<{ session_id: string | null }>(`SELECT session_id FROM events WHERE id = ?`, [assignment.eventId]);
        if (current.length === 0) continue;
        if ((current[0]!.session_id ?? null) === assignment.sessionId) continue;
        await this.driver.run(`UPDATE events SET session_id = ? WHERE id = ?`, [assignment.sessionId, assignment.eventId]);
        reassigned += 1;
      }
    });
    return { written, reassigned };
  }

  async sessions(options: { fromMs?: number; toMs?: number } = {}): Promise<SessionRow[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options.fromMs !== undefined) {
      clauses.push('end_ms > ?');
      params.push(options.fromMs);
    }
    if (options.toMs !== undefined) {
      clauses.push('start_ms < ?');
      params.push(options.toMs);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.driver.all<{
      id: string;
      start_ms: number;
      end_ms: number;
      duration_ms: number;
      source: string;
      payload: Uint8Array;
    }>(`SELECT * FROM sessions ${where} ORDER BY start_ms ASC`, params);
    return rows.map((row) => {
      const payload = open<{ app: string }>(row.payload, this.derived(), this.keyId);
      return {
        id: row.id,
        app: payload.app,
        start_ms: Number(row.start_ms),
        end_ms: Number(row.end_ms),
        duration_ms: Number(row.duration_ms),
        source: row.source,
      };
    });
  }

  /* ---------------------------------------------------------------- vectors */

  /** Store topic vectors sealed, as float32 (1,536 bytes for 384 dimensions). */
  async writeVectors(items: { eventId: string; model: string; vector: readonly number[] }[]): Promise<number> {
    let written = 0;
    await this.driver.transaction(async () => {
      for (const item of items) {
        const bytes = encodeVector(item.vector);
        await this.driver.run(
          `INSERT OR REPLACE INTO event_vectors (event_id, model, dim, vec) VALUES (?, ?, ?, ?)`,
          [item.eventId, item.model, item.vector.length, sealBytes(bytes, this.derived(), this.keyId, this.random)],
        );
        written += 1;
      }
    });
    return written;
  }

  async vectorsFor(eventIds: readonly string[]): Promise<Map<string, { model: string; vector: number[] }>> {
    const out = new Map<string, { model: string; vector: number[] }>();
    for (const eventId of eventIds) {
      const rows = await this.driver.all<{ model: string; dim: number; vec: Uint8Array }>(`SELECT model, dim, vec FROM event_vectors WHERE event_id = ?`, [eventId]);
      if (rows.length === 0) continue;
      const row = rows[0]!;
      out.set(eventId, { model: row.model, vector: decodeVector(openBytes(row.vec, this.derived(), this.keyId), Number(row.dim)) });
    }
    return out;
  }

  /**
   * Events whose vector is missing or was produced by another model.
   *
   * This is the re-embedding path: when the placeholder is replaced by a real
   * encoder, this query finds everything that needs recomputing, and the source
   * text is already in the event's sealed payload.
   */
  async reembedCandidates(model: string, limit = 500): Promise<{ id: string; text: string }[]> {
    const rows = await this.driver.all<{ id: string; payload: Uint8Array; model: string | null }>(
      `SELECT e.id AS id, e.payload AS payload, v.model AS model
       FROM events e LEFT JOIN event_vectors v ON v.event_id = e.id
       WHERE e.content = 'content' AND (v.model IS NULL OR v.model <> ?)
       ORDER BY e.at ASC
       LIMIT ?`,
      [model, Math.max(1, Math.floor(limit))],
    );
    const out: { id: string; text: string }[] = [];
    for (const row of rows) {
      const payload = open<{ subject?: string; query?: string }>(row.payload, this.derived(), this.keyId);
      const text = payload.subject ?? payload.query;
      if (typeof text === 'string' && text.trim().length > 0) out.push({ id: row.id, text });
    }
    return out;
  }

  /* ---------------------------------------------------------------- rollups */

  async putRollup(day: string, payload: Record<string, unknown>, computedAt = this.clock()): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`day must be YYYY-MM-DD, got ${day}`);
    await this.driver.run(`INSERT OR REPLACE INTO daily_rollups (day, payload, computed_at) VALUES (?, ?, ?)`, [
      day,
      seal(payload, this.derived(), this.keyId, this.random),
      computedAt,
    ]);
  }

  async rollup(day: string): Promise<RollupRecord | null> {
    const rows = await this.driver.all<{ payload: Uint8Array; computed_at: number }>(`SELECT payload, computed_at FROM daily_rollups WHERE day = ?`, [day]);
    if (rows.length === 0) return null;
    return {
      day,
      payload: open<Record<string, unknown>>(rows[0]!.payload, this.derived(), this.keyId),
      computed_at: Number(rows[0]!.computed_at),
    };
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
