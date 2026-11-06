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
import { validateEvent, NIGHT_WINDOW, type MirrorEvent } from '@mirror/shared-types';
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
  DayStoreRowCounts,
  GapReason,
  ImportRecord,
  KeyIntegrityResult,
  MirrorExportBundle,
  RandomBytes,
  ReminderDeliveryState,
  RollupRecord,
  SessionRepairSnapshot,
  SessionRow,
  SqlDriver,
  StoredBudgetDefinition,
  StoredBudgetPeriod,
  StoredBudgetTargetKind,
  StoredEvent,
  StoredGoalDefinition,
  StoredGoalKind,
  StoreOptions,
  StoreResetAudit,
  StoreResetReason,
  WeeklyReportPrefs,
  IntentCheckPrefs,
  IntentCheckStateRecord,
} from './types';

const DEFAULT_RETENTION_DAYS = 180;
const DAY_MS = 86_400_000;
const WEEKLY_REPORT_PREFS_KEY = 'weekly_report';
const REMINDER_DELIVERY_KEY = 'reminder_delivery_v1';
const BUDGET_SUGGESTION_KEY = 'budget_suggestions_v1';
/** Sealed user app rules (P4.4b): package -> explicit label. Never written by Mirror itself. */
const APP_RULES_KEY = 'app_rules_v1';
/** Sealed Intent Check settings (P4.4c) and its prompt bookkeeping. */
const INTENT_CHECK_PREFS_KEY = 'intent_check_v1';
const INTENT_CHECK_STATE_KEY = 'intent_check_state_v1';
const DEFAULT_INTENT_CHECK_PREFS_STORE = { enabled: false, pausedAfterIgnored: false, updatedAtMs: 0 } as const;
/** Mirrors `APP_RULES_MAX` in core-analytics. Asserted equal in store tests. */
export const APP_RULES_STORE_MAX = 200;
/** Mirrors `BUDGET_SUGGESTION_DISMISS_MS` in core-analytics (7 days). Asserted equal in store tests. */
export const BUDGET_SUGGESTION_DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BUDGET_SUGGESTION_MAX_DISMISSALS = 200;

export const DEFAULT_WEEKLY_REPORT_PREFS: Readonly<WeeklyReportPrefs> = Object.freeze({
  reminderEnabled: false,
  reminderWeekday: 0,
  reminderHourLocal: 19,
  budgetNoteEnabled: false,
  quietHoursStartHour: NIGHT_WINDOW.startHour,
  quietHoursEndHour: NIGHT_WINDOW.endHour,
  reminderOfferSeen: false,
  updatedAtMs: 0,
});

function isValidHour(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23;
}

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

  /**
   * Atomically reconcile OS `app_foreground` / `app_background` events whose
   * interval ends inside `[window.fromMs, window.toMs)` against an authoritative
   * full-day `buildUsageEvents` pass.
   *
   * Why `appendEvents` alone is insufficient after incremental overlap syncs or
   * collector bug fixes: `stableId` hashes `(app, startMs)`, so when an incremental
   * sync and a full-day pass (or pre-fix vs post-fix APK) assign different `startMs`
   * to the same sitting — or when a pre-fix APK left an unclosed multi-activity
   * interval in SQLite — `INSERT OR IGNORE` keeps *both* rows forever, leaving
   * `Stored` and `Sittings` frozen at an inflated total (e.g. ChatGPT 78m vs 47m).
   *
   * Never touches user `intent_label` events, Tier A/B/C imports, or earlier days
   * (`endMs < window.fromMs`) whose raw `UsageEvents` may have rolled off Android's
   * ~7-day buffer.
   */
  async replaceUsageEventsForWindow(
    window: { fromMs: number; toMs: number },
    events: readonly unknown[],
  ): Promise<{ deleted: number; inserted: number; unchanged: number }> {
    const LOOKAROUND_MS = 6 * 3_600_000 + 60_000;
    const validated: MirrorEvent[] = [];
    for (const candidate of events) {
      const check = validateEvent(candidate);
      if (
        check.ok &&
        check.value.origin === 'os' &&
        (check.value.kind === 'app_foreground' || check.value.kind === 'app_background')
      ) {
        validated.push(check.value);
      }
    }

    // Group incoming `[app_foreground, app_background]` pairs whose closing
    // `app_background` falls inside `[window.fromMs, window.toMs)`.
    // Note: `iso(ms)` truncates sub-second ms on `.at` while `duration_ms` preserves
    // exact `end - start`, so `Date.parse(bg.at) - duration_ms` can sit in
    // `[fgAtMs - 999, fgAtMs + 999]`; check both surrounding whole-second keys.
    const fgCandidateKeys = (app: string, approxStartMs: number): string[] => {
      const lo = Math.floor(approxStartMs / 1000) * 1000;
      const hi = Math.ceil(approxStartMs / 1000) * 1000;
      return lo === hi ? [`${app}\u0000${lo}`] : [`${app}\u0000${lo}`, `${app}\u0000${hi}`];
    };
    const fgByAppAndStart = new Map<string, MirrorEvent>();
    for (const ev of validated) {
      if (ev.kind === 'app_foreground') {
        const app = (ev as { app?: string }).app ?? '';
        fgByAppAndStart.set(`${app}\u0000${Date.parse(ev.at)}`, ev);
      }
    }
    const targetEvents: MirrorEvent[] = [];
    const keepIds = new Set<string>();
    for (const ev of validated) {
      if (ev.kind !== 'app_background') continue;
      const endMs = Date.parse(ev.at);
      if (!Number.isFinite(endMs) || endMs < window.fromMs || endMs >= window.toMs) continue;
      const app = (ev as { app?: string }).app ?? '';
      const dur = Number((ev as { duration_ms?: number }).duration_ms ?? 0);
      const approxStartMs = endMs - dur;
      let fg: MirrorEvent | undefined;
      for (const key of fgCandidateKeys(app, approxStartMs)) {
        fg = fgByAppAndStart.get(key);
        if (fg) break;
      }
      if (fg && !keepIds.has(fg.id)) {
        keepIds.add(fg.id);
        targetEvents.push(fg);
      }
      if (!keepIds.has(ev.id)) {
        keepIds.add(ev.id);
        targetEvents.push(ev);
      }
    }

    let deleted = 0;
    let inserted = 0;
    let unchanged = 0;

    await this.driver.transaction(async () => {
      const existingRows = await this.driver.all<EventRow>(
        `SELECT * FROM events
         WHERE origin = 'os'
           AND kind IN ('app_foreground', 'app_background')
           AND at >= ? AND at < ?
         ORDER BY at ASC, id ASC`,
        [window.fromMs - LOOKAROUND_MS, window.toMs + LOOKAROUND_MS],
      );
      const decoded = existingRows.map((row) => this.decodeRow(row));

      // Identify existing `app_foreground` starts paired with an `app_background`
      // outside `[window.fromMs, window.toMs)` so adjacent-day sittings stay intact.
      const protectedFgKeys = new Set<string>();
      const staleFgKeys = new Set<string>();
      const deleteIds = new Set<string>();

      for (const item of decoded) {
        const payload = item.payload as {
          kind?: string;
          app?: string;
          at?: string;
          duration_ms?: number;
        };
        if (payload.kind !== 'app_background') continue;
        const endMs = item.at;
        const dur = Number(payload.duration_ms ?? 0);
        const approxStartMs = endMs - dur;
        const app = payload.app ?? '';
        const keys = fgCandidateKeys(app, approxStartMs);
        if (endMs >= window.fromMs && endMs < window.toMs) {
          if (!keepIds.has(item.id)) {
            deleteIds.add(item.id);
            for (const k of keys) staleFgKeys.add(k);
          }
        } else {
          for (const k of keys) protectedFgKeys.add(k);
        }
      }

      for (const item of decoded) {
        const payload = item.payload as { kind?: string; app?: string };
        if (payload.kind !== 'app_foreground') continue;
        if (keepIds.has(item.id)) continue;
        const app = payload.app ?? '';
        const fgKey = `${app}\u0000${item.at}`;
        if (protectedFgKeys.has(fgKey)) continue;
        if (staleFgKeys.has(fgKey) || (item.at >= window.fromMs && item.at < window.toMs)) {
          deleteIds.add(item.id);
        }
      }

      for (const id of deleteIds) {
        await this.driver.run(`DELETE FROM event_vectors WHERE event_id = ?`, [id]);
        await this.driver.run(`DELETE FROM events WHERE id = ?`, [id]);
        deleted += 1;
      }

      for (const event of targetEvents) {
        const existing = await this.driver.all<{ id: string }>(
          `SELECT id FROM events WHERE id = ?`,
          [event.id],
        );
        if (existing.length > 0) {
          unchanged += 1;
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
        inserted += 1;
      }
    });

    return { deleted, inserted, unchanged };
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
      const tables = [
        'events',
        'event_vectors',
        'sessions',
        'data_gaps',
        'daily_rollups',
        'budgets',
        'goals',
        'sealed_preferences',
        'imports',
        'connections',
        'consent_log',
        'meta',
      ];
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

  /**
   * Persist a minimal plaintext-only audit record in `meta` after an intentional
   * reset (`user_delete_all` or `key_mismatch_reset`) so the UI can show
   * "History reset on YYYY-MM-DD" and diagnostics can explain why history restarted.
   *
   * Never stores app names, package names, or personal content.
   */
  async recordResetAudit(entry: StoreResetAudit): Promise<void> {
    const validReasons: StoreResetReason[] = [
      'user_delete_all',
      'key_mismatch_reset',
      'keystore_invalidated',
      'reinstall_or_storage_cleared',
    ];
    if (!validReasons.includes(entry.reason)) {
      throw new Error(`invalid store reset reason "${entry.reason}"`);
    }
    if (!Number.isFinite(entry.at) || entry.at < 0) {
      throw new Error(`invalid store reset timestamp ${entry.at}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.day)) {
      throw new Error(`store reset day must be YYYY-MM-DD, got "${entry.day}"`);
    }
    const clean: StoreResetAudit = {
      at: Math.floor(entry.at),
      day: entry.day,
      reason: entry.reason,
      ...(entry.previousHistoryStartDay && /^\d{4}-\d{2}-\d{2}$/.test(entry.previousHistoryStartDay)
        ? { previousHistoryStartDay: entry.previousHistoryStartDay }
        : {}),
      ...(entry.detail ? { detail: String(entry.detail).slice(0, 160) } : {}),
    };
    await writeMeta(this.driver, 'last_reset_audit', JSON.stringify(clean));
    this.diagnostic('store reset recorded', clean);
  }

  async lastResetAudit(): Promise<StoreResetAudit | null> {
    const raw = await readMeta(this.driver, 'last_reset_audit');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoreResetAudit>;
      if (
        typeof parsed.at !== 'number' ||
        typeof parsed.day !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(parsed.day) ||
        (parsed.reason !== 'user_delete_all' &&
          parsed.reason !== 'key_mismatch_reset' &&
          parsed.reason !== 'keystore_invalidated' &&
          parsed.reason !== 'reinstall_or_storage_cleared')
      ) {
        return null;
      }
      return {
        at: parsed.at,
        day: parsed.day,
        reason: parsed.reason,
        ...(typeof parsed.previousHistoryStartDay === 'string'
          ? { previousHistoryStartDay: parsed.previousHistoryStartDay }
          : {}),
        ...(typeof parsed.detail === 'string' ? { detail: parsed.detail } : {}),
      };
    } catch {
      return null;
    }
  }

  /**
   * Verify that existing sealed rows in `events`, `sessions`, and `daily_rollups`
   * can be decrypted with the active device key BEFORE appending new events.
   *
   * Prevents mixed-key corruption and unhandled `DecryptionError` crashes when
   * Android Keystore invalidates a hardware-backed key (e.g. lockscreen credential
   * reset or OS restore).
   */
  async verifyKeyIntegrity(): Promise<KeyIntegrityResult> {
    const derived = this.derived();
    const checks: { table: string; sql: string }[] = [
      { table: 'events', sql: `SELECT payload FROM events ORDER BY at ASC LIMIT 1` },
      { table: 'events', sql: `SELECT payload FROM events ORDER BY at DESC LIMIT 1` },
      { table: 'sessions', sql: `SELECT payload FROM sessions ORDER BY start_ms ASC LIMIT 1` },
      { table: 'sessions', sql: `SELECT payload FROM sessions ORDER BY start_ms DESC LIMIT 1` },
      { table: 'daily_rollups', sql: `SELECT payload FROM daily_rollups ORDER BY day DESC LIMIT 1` },
      { table: 'budgets', sql: `SELECT payload FROM budgets ORDER BY updated_at DESC LIMIT 1` },
      { table: 'goals', sql: `SELECT payload FROM goals ORDER BY updated_at DESC LIMIT 1` },
      { table: 'sealed_preferences', sql: `SELECT payload FROM sealed_preferences ORDER BY updated_at DESC LIMIT 1` },
    ];
    for (const c of checks) {
      const rows = await this.driver.all<{ payload: Uint8Array }>(c.sql);
      if (rows.length === 0) continue;
      try {
        open<Record<string, unknown>>(rows[0]!.payload, derived, this.keyId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const reason = /sealed with key/i.test(message) ? 'key_mismatch' : 'corrupt_ciphertext';
        this.diagnostic(`key integrity check failed on ${c.table}`, message);
        return {
          ok: false,
          reason,
          currentKeyId: this.keyId,
          message,
        };
      }
    }
    return { ok: true, currentKeyId: this.keyId };
  }

  /**
   * Recover cleanly when Android Keystore invalidates or loses the previous root
   * key: captures `previousHistoryStartDay` from plaintext index metadata (zero
   * decryption), wipes unreadable ciphertext via `deleteAll()`, and writes an
   * explicit `StoreResetAudit` record so the UI surfaces when and why history reset.
   */
  async recoverFromKeyInvalidation(options: {
    day: string;
    at?: number;
    reason?: 'keystore_invalidated' | 'key_mismatch_reset';
    detail?: string;
    utcOffsetMinutes?: number;
  }): Promise<StoreResetAudit> {
    const at = options.at ?? this.clock();
    const offsetMs = Number.isFinite(options.utcOffsetMinutes) ? (options.utcOffsetMinutes ?? 0) * 60_000 : 0;
    const earliestEv = await this.earliestEventAt();
    const earliestSess = await this.earliestSessionStart();
    const candidates = [earliestEv, earliestSess].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const previousHistoryStartDay =
      candidates.length > 0
        ? new Date(Math.min(...candidates) + offsetMs).toISOString().slice(0, 10)
        : undefined;

    await this.deleteAll();
    const entry: StoreResetAudit = {
      at: Math.floor(at),
      day: options.day,
      reason: options.reason ?? 'keystore_invalidated',
      ...(previousHistoryStartDay ? { previousHistoryStartDay } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
    };
    await this.recordResetAudit(entry);
    return entry;
  }

  /** Earliest non-label event timestamp (`ms`), via index scan with zero decryption. */
  async earliestEventAt(): Promise<number | null> {
    const rows = await this.driver.all<{ min_at: number | null }>(
      `SELECT MIN(at) AS min_at FROM events WHERE kind != 'intent_label'`,
    );
    const val = rows[0]?.min_at;
    return val === null || val === undefined ? null : Number(val);
  }

  /** Earliest derived session start timestamp (`ms`), via index scan with zero decryption. */
  async earliestSessionStart(): Promise<number | null> {
    const rows = await this.driver.all<{ min_start: number | null }>(
      `SELECT MIN(start_ms) AS min_start FROM sessions`,
    );
    const val = rows[0]?.min_start;
    return val === null || val === undefined ? null : Number(val);
  }

  /**
   * Per-local-day `events` (`fgEvents`, `bgEvents`, `labelEvents`, `otherEvents`)
   * and `sessions` row counts across the entire store via indexed plaintext columns
   * (`at`, `kind`, `start_ms`) — zero payload decryption.
   */
  async dayRowCounts(utcOffsetMinutes = 0): Promise<DayStoreRowCounts[]> {
    const offsetMs = Number.isFinite(utcOffsetMinutes) ? utcOffsetMinutes * 60_000 : 0;
    const toDay = (ms: number): string => new Date(ms + offsetMs).toISOString().slice(0, 10);

    const eventRows = await this.driver.all<{ at: number; kind: string }>(
      `SELECT at, kind FROM events ORDER BY at ASC`,
    );
    const sessionRows = await this.driver.all<{ start_ms: number }>(
      `SELECT start_ms FROM sessions ORDER BY start_ms ASC`,
    );

    const byDay = new Map<string, DayStoreRowCounts>();
    const ensure = (day: string): DayStoreRowCounts => {
      let row = byDay.get(day);
      if (!row) {
        row = {
          day,
          events: 0,
          fgEvents: 0,
          bgEvents: 0,
          labelEvents: 0,
          otherEvents: 0,
          sessions: 0,
        };
        byDay.set(day, row);
      }
      return row;
    };

    for (const r of eventRows) {
      const ms = Number(r.at);
      if (!Number.isFinite(ms)) continue;
      const entry = ensure(toDay(ms));
      entry.events += 1;
      if (r.kind === 'app_foreground') entry.fgEvents += 1;
      else if (r.kind === 'app_background') entry.bgEvents += 1;
      else if (r.kind === 'intent_label') entry.labelEvents += 1;
      else entry.otherEvents += 1;
    }

    for (const r of sessionRows) {
      const ms = Number(r.start_ms);
      if (!Number.isFinite(ms)) continue;
      const entry = ensure(toDay(ms));
      entry.sessions += 1;
    }

    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  /**
   * Persist the one-time non-destructive session repair row-count snapshot
   * (`before` vs `after` per local day — counts and `YYYY-MM-DD` strings only,
   * never package names or personal content) so `DebugView` and `Share diagnostic JSON`
   * can report exact pre-repair and post-repair row counts.
   */
  async recordSessionRepairSnapshot(snapshot: SessionRepairSnapshot): Promise<void> {
    if (!Number.isFinite(snapshot.at) || snapshot.at < 0) {
      throw new Error(`invalid repair snapshot timestamp ${snapshot.at}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.day)) {
      throw new Error(`invalid repair snapshot day ${snapshot.day}`);
    }
    await writeMeta(this.driver, 'session_repair_v29', JSON.stringify(snapshot));
  }

  async lastSessionRepairSnapshot(): Promise<SessionRepairSnapshot | null> {
    const raw = await readMeta(this.driver, 'session_repair_v29');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SessionRepairSnapshot>;
      if (
        typeof parsed.at !== 'number' ||
        typeof parsed.day !== 'string' ||
        !Array.isArray(parsed.before) ||
        !Array.isArray(parsed.after)
      ) {
        return null;
      }
      return {
        at: parsed.at,
        day: parsed.day,
        recoveredFgEvents: Number(parsed.recoveredFgEvents ?? 0),
        rebuiltDays: Number(parsed.rebuiltDays ?? 0),
        before: parsed.before as DayStoreRowCounts[],
        after: parsed.after as DayStoreRowCounts[],
      };
    } catch {
      return null;
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

  /* --------------------------------------------------- budgets, goals, prefs */

  async putBudget(def: StoredBudgetDefinition): Promise<StoredBudgetDefinition> {
    if (!def || typeof def !== 'object') throw new Error('budget definition must be an object');
    const id = typeof def.id === 'string' ? def.id.trim() : '';
    if (!id || id.length > 128) throw new Error('budget.id must be a non-empty string (<= 128 chars)');
    const name = typeof def.name === 'string' ? def.name.trim() : '';
    if (!name || name.length > 120) throw new Error('budget.name must be a non-empty string (<= 120 chars)');
    if (def.kind !== 'app' && def.kind !== 'group') throw new Error('budget.kind must be "app" or "group"');
    if (def.period !== 'daily' && def.period !== 'weekly') throw new Error('budget.period must be "daily" or "weekly"');

    const seen = new Set<string>();
    const packages: string[] = [];
    for (const item of Array.isArray(def.packages) ? def.packages : []) {
      if (typeof item !== 'string') throw new Error('budget.packages entries must be strings');
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        packages.push(trimmed);
      }
    }
    if (packages.length === 0) throw new Error('budget.packages must contain at least one package');
    if (def.kind === 'app' && packages.length > 1) {
      throw new Error('budget with kind "app" must target a single package');
    }

    const maxPeriodMs = def.period === 'weekly' ? 7 * DAY_MS : DAY_MS;
    const limitMs = Number.isFinite(def.limitMs) ? Math.round(def.limitMs) : NaN;
    if (!Number.isFinite(limitMs) || limitMs <= 0 || limitMs > maxPeriodMs) {
      throw new Error(`budget.limitMs must be in (0, ${maxPeriodMs}]`);
    }
    if (typeof def.enabled !== 'boolean') throw new Error('budget.enabled must be a boolean');

    const now = this.clock();
    const createdAtMs =
      Number.isFinite(def.createdAtMs) && def.createdAtMs >= 0 ? Math.round(def.createdAtMs) : now;
    const updatedAtMs =
      Number.isFinite(def.updatedAtMs) && def.updatedAtMs >= 0 ? Math.round(def.updatedAtMs) : now;

    const normalized: StoredBudgetDefinition = {
      id,
      name,
      kind: def.kind as StoredBudgetTargetKind,
      packages,
      period: def.period as StoredBudgetPeriod,
      limitMs,
      enabled: def.enabled,
      createdAtMs,
      updatedAtMs,
    };

    const sealed = seal(
      {
        name: normalized.name,
        kind: normalized.kind,
        packages: normalized.packages,
        limitMs: normalized.limitMs,
      },
      this.derived(),
      this.keyId,
      this.random,
    );

    await this.driver.run(
      `INSERT OR REPLACE INTO budgets (id, period, enabled, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.period,
        normalized.enabled ? 1 : 0,
        normalized.createdAtMs,
        normalized.updatedAtMs,
        sealed,
      ],
    );
    return normalized;
  }

  async budgets(): Promise<StoredBudgetDefinition[]> {
    const rows = await this.driver.all<{
      id: string;
      period: string;
      enabled: number;
      created_at: number;
      updated_at: number;
      payload: Uint8Array;
    }>(`SELECT * FROM budgets ORDER BY created_at ASC, id ASC`);
    return rows.map((row) => {
      const payload = open<{
        name: string;
        kind: StoredBudgetTargetKind;
        packages: string[];
        limitMs: number;
      }>(row.payload, this.derived(), this.keyId);
      return {
        id: row.id,
        name: payload.name,
        kind: payload.kind,
        packages: payload.packages,
        period: row.period as StoredBudgetPeriod,
        limitMs: Number(payload.limitMs),
        enabled: Number(row.enabled) !== 0,
        createdAtMs: Number(row.created_at),
        updatedAtMs: Number(row.updated_at),
      };
    });
  }

  async deleteBudget(id: string): Promise<boolean> {
    const existing = await this.driver.all<{ id: string }>(`SELECT id FROM budgets WHERE id = ?`, [id]);
    if (existing.length === 0) return false;
    await this.driver.run(`DELETE FROM budgets WHERE id = ?`, [id]);
    return true;
  }

  async putGoal(def: StoredGoalDefinition): Promise<StoredGoalDefinition> {
    if (!def || typeof def !== 'object') throw new Error('goal definition must be an object');
    const id = typeof def.id === 'string' ? def.id.trim() : '';
    if (!id || id.length > 128) throw new Error('goal.id must be a non-empty string (<= 128 chars)');
    const title = typeof def.title === 'string' ? def.title.trim() : '';
    if (!title || title.length > 140) throw new Error('goal.title must be a non-empty string (<= 140 chars)');

    const validKinds: StoredGoalKind[] = [
      'daily_total_foreground',
      'daily_app_foreground',
      'daily_late_night_max',
      'daily_sitting_count_max',
    ];
    if (!validKinds.includes(def.kind)) throw new Error('goal.kind is unsupported');
    if (typeof def.enabled !== 'boolean') throw new Error('goal.enabled must be a boolean');

    let packages: string[] | undefined;
    if (def.packages !== undefined) {
      if (!Array.isArray(def.packages)) throw new Error('goal.packages must be an array');
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const item of def.packages) {
        if (typeof item !== 'string') throw new Error('goal.packages entries must be strings');
        const trimmed = item.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          deduped.push(trimmed);
        }
      }
      if (deduped.length > 0) packages = deduped;
    }
    if (def.kind === 'daily_app_foreground' && (!packages || packages.length === 0)) {
      throw new Error('daily_app_foreground requires at least one package');
    }

    let targetMs: number | undefined;
    let targetCount: number | undefined;
    if (def.kind === 'daily_total_foreground' || def.kind === 'daily_app_foreground') {
      const raw = typeof def.targetMs === 'number' && Number.isFinite(def.targetMs) ? Math.round(def.targetMs) : NaN;
      if (!Number.isFinite(raw) || raw <= 0 || raw > DAY_MS) {
        throw new Error(`goal.targetMs must be in (0, ${DAY_MS}]`);
      }
      targetMs = raw;
    } else if (def.kind === 'daily_late_night_max') {
      const raw = typeof def.targetMs === 'number' && Number.isFinite(def.targetMs) ? Math.round(def.targetMs) : NaN;
      if (!Number.isFinite(raw) || raw < 0 || raw > 6 * 3_600_000) {
        throw new Error('goal.targetMs for daily_late_night_max must be between 0 and 6 hours');
      }
      targetMs = raw;
    } else {
      const raw =
        typeof def.targetCount === 'number' && Number.isFinite(def.targetCount)
          ? Math.round(def.targetCount)
          : NaN;
      if (!Number.isFinite(raw) || raw < 0 || raw > 1000) {
        throw new Error('goal.targetCount must be between 0 and 1000');
      }
      targetCount = raw;
    }

    const now = this.clock();
    const createdAtMs =
      Number.isFinite(def.createdAtMs) && def.createdAtMs >= 0 ? Math.round(def.createdAtMs) : now;
    const updatedAtMs =
      Number.isFinite(def.updatedAtMs) && def.updatedAtMs >= 0 ? Math.round(def.updatedAtMs) : now;

    const normalized: StoredGoalDefinition = {
      id,
      title,
      kind: def.kind,
      ...(targetMs !== undefined ? { targetMs } : {}),
      ...(targetCount !== undefined ? { targetCount } : {}),
      ...(packages !== undefined ? { packages } : {}),
      enabled: def.enabled,
      createdAtMs,
      updatedAtMs,
    };

    const sealed = seal(
      {
        title: normalized.title,
        ...(targetMs !== undefined ? { targetMs } : {}),
        ...(targetCount !== undefined ? { targetCount } : {}),
        ...(packages !== undefined ? { packages } : {}),
      },
      this.derived(),
      this.keyId,
      this.random,
    );

    await this.driver.run(
      `INSERT OR REPLACE INTO goals (id, kind, enabled, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.kind,
        normalized.enabled ? 1 : 0,
        normalized.createdAtMs,
        normalized.updatedAtMs,
        sealed,
      ],
    );
    return normalized;
  }

  async goals(): Promise<StoredGoalDefinition[]> {
    const rows = await this.driver.all<{
      id: string;
      kind: string;
      enabled: number;
      created_at: number;
      updated_at: number;
      payload: Uint8Array;
    }>(`SELECT * FROM goals ORDER BY created_at ASC, id ASC`);
    return rows.map((row) => {
      const payload = open<{
        title: string;
        targetMs?: number;
        targetCount?: number;
        packages?: string[];
      }>(row.payload, this.derived(), this.keyId);
      return {
        id: row.id,
        title: payload.title,
        kind: row.kind as StoredGoalKind,
        ...(typeof payload.targetMs === 'number' ? { targetMs: payload.targetMs } : {}),
        ...(typeof payload.targetCount === 'number' ? { targetCount: payload.targetCount } : {}),
        ...(Array.isArray(payload.packages) ? { packages: payload.packages } : {}),
        enabled: Number(row.enabled) !== 0,
        createdAtMs: Number(row.created_at),
        updatedAtMs: Number(row.updated_at),
      };
    });
  }

  async deleteGoal(id: string): Promise<boolean> {
    const existing = await this.driver.all<{ id: string }>(`SELECT id FROM goals WHERE id = ?`, [id]);
    if (existing.length === 0) return false;
    await this.driver.run(`DELETE FROM goals WHERE id = ?`, [id]);
    return true;
  }

  async weeklyReportPrefs(): Promise<WeeklyReportPrefs> {
    const rows = await this.driver.all<{ updated_at: number; payload: Uint8Array }>(
      `SELECT updated_at, payload FROM sealed_preferences WHERE key = ?`,
      [WEEKLY_REPORT_PREFS_KEY],
    );
    if (rows.length === 0) {
      return { ...DEFAULT_WEEKLY_REPORT_PREFS };
    }
    const payload = open<Partial<WeeklyReportPrefs>>(rows[0]!.payload, this.derived(), this.keyId);
    const weekday =
      typeof payload.reminderWeekday === 'number' &&
      Number.isInteger(payload.reminderWeekday) &&
      payload.reminderWeekday >= 0 &&
      payload.reminderWeekday <= 6
        ? (payload.reminderWeekday as WeeklyReportPrefs['reminderWeekday'])
        : DEFAULT_WEEKLY_REPORT_PREFS.reminderWeekday;
    const hour =
      typeof payload.reminderHourLocal === 'number' &&
      Number.isInteger(payload.reminderHourLocal) &&
      payload.reminderHourLocal >= 0 &&
      payload.reminderHourLocal <= 23
        ? payload.reminderHourLocal
        : DEFAULT_WEEKLY_REPORT_PREFS.reminderHourLocal;
    const quietStart = isValidHour(payload.quietHoursStartHour)
      ? payload.quietHoursStartHour
      : DEFAULT_WEEKLY_REPORT_PREFS.quietHoursStartHour;
    const quietEnd = isValidHour(payload.quietHoursEndHour)
      ? payload.quietHoursEndHour
      : DEFAULT_WEEKLY_REPORT_PREFS.quietHoursEndHour;
    return {
      reminderEnabled: Boolean(payload.reminderEnabled),
      reminderWeekday: weekday,
      reminderHourLocal: hour,
      budgetNoteEnabled: Boolean(payload.budgetNoteEnabled),
      quietHoursStartHour: quietStart,
      quietHoursEndHour: quietEnd === quietStart ? DEFAULT_WEEKLY_REPORT_PREFS.quietHoursEndHour : quietEnd,
      reminderOfferSeen: Boolean(payload.reminderOfferSeen),
      updatedAtMs: Number(rows[0]!.updated_at),
    };
  }

  async setWeeklyReportPrefs(
    patch: Partial<Omit<WeeklyReportPrefs, 'updatedAtMs'>>,
    updatedAtMs = this.clock(),
  ): Promise<WeeklyReportPrefs> {
    const current = await this.weeklyReportPrefs();
    const nextWeekday = patch.reminderWeekday ?? current.reminderWeekday;
    if (!Number.isInteger(nextWeekday) || nextWeekday < 0 || nextWeekday > 6) {
      throw new Error('reminderWeekday must be an integer 0..6');
    }
    const nextHour = patch.reminderHourLocal ?? current.reminderHourLocal;
    if (!Number.isInteger(nextHour) || nextHour < 0 || nextHour > 23) {
      throw new Error('reminderHourLocal must be an integer 0..23');
    }
    const nextQuietStart = patch.quietHoursStartHour ?? current.quietHoursStartHour;
    const nextQuietEnd = patch.quietHoursEndHour ?? current.quietHoursEndHour;
    if (!isValidHour(nextQuietStart) || !isValidHour(nextQuietEnd)) {
      throw new Error('quiet hours must be integers 0..23');
    }
    if (nextQuietStart === nextQuietEnd) {
      throw new Error('quiet hours start and end must differ');
    }
    const nextEnabled =
      patch.reminderEnabled !== undefined ? Boolean(patch.reminderEnabled) : current.reminderEnabled;
    const nextBudgetNoteEnabled =
      patch.budgetNoteEnabled !== undefined
        ? Boolean(patch.budgetNoteEnabled)
        : Boolean(current.budgetNoteEnabled);

    const nextOfferSeen =
      patch.reminderOfferSeen !== undefined ? Boolean(patch.reminderOfferSeen) : Boolean(current.reminderOfferSeen);

    const next: WeeklyReportPrefs = {
      reminderOfferSeen: nextOfferSeen,
      reminderEnabled: nextEnabled,
      reminderWeekday: nextWeekday as WeeklyReportPrefs['reminderWeekday'],
      reminderHourLocal: nextHour,
      budgetNoteEnabled: nextBudgetNoteEnabled,
      quietHoursStartHour: nextQuietStart,
      quietHoursEndHour: nextQuietEnd,
      updatedAtMs: Math.max(0, Math.round(updatedAtMs)),
    };

    await this.driver.run(
      `INSERT OR REPLACE INTO sealed_preferences (key, updated_at, payload) VALUES (?, ?, ?)`,
      [
        WEEKLY_REPORT_PREFS_KEY,
        next.updatedAtMs,
        seal(
          {
            reminderEnabled: next.reminderEnabled,
            reminderWeekday: next.reminderWeekday,
            reminderHourLocal: next.reminderHourLocal,
            budgetNoteEnabled: next.budgetNoteEnabled,
            quietHoursStartHour: next.quietHoursStartHour,
            quietHoursEndHour: next.quietHoursEndHour,
            reminderOfferSeen: next.reminderOfferSeen,
          },
          this.derived(),
          this.keyId,
          this.random,
        ),
      ],
    );
    return next;
  }

  /** Dismissed budget suggestions (package -> dismissed-at ms). Entries older than 7 days are dropped. */
  async budgetSuggestionDismissals(): Promise<Record<string, number>> {
    const rows = await this.driver.all<{ payload: Uint8Array }>(
      `SELECT payload FROM sealed_preferences WHERE key = ?`,
      [BUDGET_SUGGESTION_KEY],
    );
    if (rows.length === 0) return {};
    const payload = open<{ dismissed?: Record<string, unknown> }>(rows[0]!.payload, this.derived(), this.keyId);
    const out: Record<string, number> = {};
    for (const [app, at] of Object.entries(payload.dismissed ?? {})) {
      if (typeof at === 'number' && Number.isFinite(at)) out[app] = at;
    }
    return out;
  }

  async dismissBudgetSuggestion(app: string, nowMs = this.clock()): Promise<Record<string, number>> {
    const trimmed = app.trim();
    if (!trimmed) throw new Error('dismissBudgetSuggestion: app is required');
    const now = Math.max(0, Math.round(nowMs));
    const current = await this.budgetSuggestionDismissals();
    current[trimmed] = now;
    const kept = Object.entries(current)
      .filter(([, at]) => now - at < BUDGET_SUGGESTION_DISMISS_WINDOW_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, BUDGET_SUGGESTION_MAX_DISMISSALS);
    const next = Object.fromEntries(kept);
    await this.driver.run(
      `INSERT OR REPLACE INTO sealed_preferences (key, updated_at, payload) VALUES (?, ?, ?)`,
      [BUDGET_SUGGESTION_KEY, now, seal({ dismissed: next }, this.derived(), this.keyId, this.random)],
    );
    return next;
  }

  /** User app rules (package -> { label, setAtMs }). Only the user writes these. */
  async appRules(): Promise<Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }>> {
    const rows = await this.driver.all<{ payload: Uint8Array }>(
      `SELECT payload FROM sealed_preferences WHERE key = ?`,
      [APP_RULES_KEY],
    );
    if (rows.length === 0) return {};
    const payload = open<{ rules?: Record<string, unknown> }>(rows[0]!.payload, this.derived(), this.keyId);
    const out: Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }> = {};
    for (const [app, rec] of Object.entries(payload.rules ?? {})) {
      const r = rec as { label?: unknown; setAtMs?: unknown } | null;
      if ((r?.label === 'intentional' || r?.label === 'mindless') && typeof r.setAtMs === 'number' && Number.isFinite(r.setAtMs)) {
        out[app] = { label: r.label, setAtMs: r.setAtMs };
      }
    }
    return out;
  }

  /**
   * Set (or replace) the user's rule for one app. Rules never touch stored
   * `intent_label` events. Throws if the store is at the rule cap and `app` is new.
   */
  async setAppRule(
    app: string,
    label: 'intentional' | 'mindless',
    nowMs = this.clock(),
  ): Promise<Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }>> {
    const trimmed = app.trim();
    if (!trimmed || trimmed.length > 200) throw new Error('setAppRule: app is required');
    if (label !== 'intentional' && label !== 'mindless') throw new Error('setAppRule: label must be intentional or mindless');
    const current = await this.appRules();
    if (!(trimmed in current) && Object.keys(current).length >= APP_RULES_STORE_MAX) {
      throw new Error('setAppRule: rule limit reached');
    }
    current[trimmed] = { label, setAtMs: Math.max(0, Math.round(nowMs)) };
    await this.writeAppRules(current, Math.max(0, Math.round(nowMs)));
    return current;
  }

  /** Remove the user's rule for one app (one tap in the UI). Past labels are unchanged. */
  async clearAppRule(app: string, nowMs = this.clock()): Promise<Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }>> {
    const trimmed = app.trim();
    if (!trimmed) throw new Error('clearAppRule: app is required');
    const current = await this.appRules();
    delete current[trimmed];
    await this.writeAppRules(current, Math.max(0, Math.round(nowMs)));
    return current;
  }

  private async writeAppRules(
    rules: Record<string, { label: 'intentional' | 'mindless'; setAtMs: number }>,
    updatedAt: number,
  ): Promise<void> {
    await this.driver.run(
      `INSERT OR REPLACE INTO sealed_preferences (key, updated_at, payload) VALUES (?, ?, ?)`,
      [APP_RULES_KEY, updatedAt, seal({ rules }, this.derived(), this.keyId, this.random)],
    );
  }

  /** Intent Check settings. Off by default. Never writes `intent_label` events. */
  async intentCheckPrefs(): Promise<IntentCheckPrefs> {
    const rows = await this.driver.all<{ updated_at: number; payload: Uint8Array }>(
      `SELECT updated_at, payload FROM sealed_preferences WHERE key = ?`,
      [INTENT_CHECK_PREFS_KEY],
    );
    if (rows.length === 0) return { ...DEFAULT_INTENT_CHECK_PREFS_STORE };
    const payload = open<Partial<IntentCheckPrefs>>(rows[0]!.payload, this.derived(), this.keyId);
    return {
      enabled: payload.enabled === true,
      pausedAfterIgnored: payload.pausedAfterIgnored === true,
      updatedAtMs: typeof payload.updatedAtMs === 'number' ? payload.updatedAtMs : rows[0]!.updated_at,
    };
  }

  async setIntentCheckPrefs(
    patch: Partial<Pick<IntentCheckPrefs, 'enabled' | 'pausedAfterIgnored'>>,
    nowMs = this.clock(),
  ): Promise<IntentCheckPrefs> {
    const current = await this.intentCheckPrefs();
    const next: IntentCheckPrefs = {
      enabled: patch.enabled ?? current.enabled,
      pausedAfterIgnored: patch.pausedAfterIgnored ?? current.pausedAfterIgnored,
      updatedAtMs: Math.max(0, Math.round(nowMs)),
    };
    await this.driver.run(
      `INSERT OR REPLACE INTO sealed_preferences (key, updated_at, payload) VALUES (?, ?, ?)`,
      [INTENT_CHECK_PREFS_KEY, next.updatedAtMs, seal({ ...next }, this.derived(), this.keyId, this.random)],
    );
    return next;
  }

  /** Prompt bookkeeping for Intent Check. Carries no labels; wiped by typed DELETE. */
  async intentCheckState(): Promise<IntentCheckStateRecord | null> {
    const rows = await this.driver.all<{ payload: Uint8Array }>(
      `SELECT payload FROM sealed_preferences WHERE key = ?`,
      [INTENT_CHECK_STATE_KEY],
    );
    if (rows.length === 0) return null;
    return open<IntentCheckStateRecord>(rows[0]!.payload, this.derived(), this.keyId);
  }

  async setIntentCheckState(state: IntentCheckStateRecord): Promise<void> {
    await this.driver.run(
      `INSERT OR REPLACE INTO sealed_preferences (key, updated_at, payload) VALUES (?, ?, ?)`,
      [INTENT_CHECK_STATE_KEY, Math.max(0, Math.round(state.updatedAtMs)), seal({ ...state }, this.derived(), this.keyId, this.random)],
    );
  }

  async reminderDeliveryState(): Promise<ReminderDeliveryState> {
    const rows = await this.driver.all<{ updated_at: number; payload: Uint8Array }>(
      `SELECT updated_at, payload FROM sealed_preferences WHERE key = ?`,
      [REMINDER_DELIVERY_KEY],
    );
    if (rows.length === 0) {
      return { lastWeeklySlot: null, sentBudgetKeys: [], updatedAtMs: 0 };
    }
    const payload = open<Partial<ReminderDeliveryState>>(rows[0]!.payload, this.derived(), this.keyId);
    const keys = Array.isArray(payload.sentBudgetKeys)
      ? payload.sentBudgetKeys.filter((x): x is string => typeof x === 'string').slice(-64)
      : [];
    return {
      lastWeeklySlot: typeof payload.lastWeeklySlot === 'string' ? payload.lastWeeklySlot : null,
      sentBudgetKeys: keys,
      updatedAtMs: Number(rows[0]!.updated_at),
    };
  }

  async setReminderDeliveryState(
    patch: Partial<Omit<ReminderDeliveryState, 'updatedAtMs'>>,
    updatedAtMs = this.clock(),
  ): Promise<ReminderDeliveryState> {
    const current = await this.reminderDeliveryState();
    const lastWeeklySlot =
      patch.lastWeeklySlot !== undefined ? patch.lastWeeklySlot : current.lastWeeklySlot;
    const sentBudgetKeys = (patch.sentBudgetKeys ?? current.sentBudgetKeys).slice(-64);
    const next: ReminderDeliveryState = {
      lastWeeklySlot,
      sentBudgetKeys,
      updatedAtMs: Math.max(0, Math.round(updatedAtMs)),
    };
    await this.driver.run(
      `INSERT OR REPLACE INTO sealed_preferences (key, updated_at, payload) VALUES (?, ?, ?)`,
      [
        REMINDER_DELIVERY_KEY,
        next.updatedAtMs,
        seal(
          {
            lastWeeklySlot: next.lastWeeklySlot,
            sentBudgetKeys: next.sentBudgetKeys,
          },
          this.derived(),
          this.keyId,
          this.random,
        ),
      ],
    );
    return next;
  }

  /**
   * Build the complete local JSON archive bundle (events, sessions, gaps,
   * budgets, goals, weekly report prefs, and reset audit).
   */
  async exportBundle(exportedAt = new Date(this.clock()).toISOString()): Promise<MirrorExportBundle> {
    const [events, sessions, gaps, budgets, goals, weeklyReportPrefs, lastReset, budgetSuggestionDismissals, appRules, intentCheck] =
      await Promise.all([
        this.events(),
        this.sessions(),
        this.gaps(),
        this.budgets(),
        this.goals(),
        this.weeklyReportPrefs(),
        this.lastResetAudit(),
        this.budgetSuggestionDismissals(),
        this.appRules(),
        this.intentCheckPrefs(),
      ]);
    return {
      exportedAt,
      schemaVersion: SCHEMA_VERSION,
      encryption: 'none',
      events,
      sessions,
      gaps,
      budgets,
      goals,
      weeklyReportPrefs,
      budgetSuggestionDismissals,
      appRules,
      intentCheck,
      lastReset,
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
