/**
 * Ports.
 *
 * The store does not know what SQLite it is talking to, where the key comes from,
 * or what time it is. Each of those is a small interface with an adapter per
 * environment, so the same storage code runs in tests (Node's SQLite, fixed
 * keys), on Android/iOS (expo-sqlite, platform keystore) and in a future sync
 * layer without a rewrite.
 */

/** The subset of SQL both node:sqlite and expo-sqlite can answer. */
export interface SqlDriver {
  /** Execute one or more statements with no parameters (DDL, PRAGMA). */
  exec(sql: string): Promise<void>;
  /** Run a write. Returns the number of affected rows when the driver knows it. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Read rows as plain objects. */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run `fn` inside a transaction; rolls back if it throws. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * A 32-byte root key. On device it is created once and kept in the platform
 * keystore (`expo-secure-store`, `requireAuthentication` not required because the
 * app itself is the boundary; see docs/P1B.md). It never leaves the device and is
 * never written to the database.
 */
export interface KeyProvider {
  /** Stable id of the key, stored beside ciphertext so a rotation can be detected. */
  keyId(): Promise<string>;
  /** 32 bytes. Implementations must return a copy, not an internal buffer. */
  rootKey(): Promise<Uint8Array>;
}

/** Injected so tests are deterministic and the store has no ambient clock. */
export type Clock = () => number;

/** Injected random source: `expo-crypto.getRandomBytes` on device, node:crypto in tests. */
export type RandomBytes = (length: number) => Uint8Array;

export type StoreOptions = {
  driver: SqlDriver;
  keys: KeyProvider;
  clock?: Clock;
  random?: RandomBytes;
  /**
   * Whether content-class events (titles, queries, URLs) may be written. This is
   * the storage-side enforcement of the `collectContent` preference: when it is
   * false, a content event is refused, not silently downgraded.
   */
  allowContent?: boolean;
  /** Days of raw/imported events kept. Mirrors the retention policy. */
  retentionDays?: 90 | 180 | 365;
  /** Called for anything the store refuses or repairs. Never throws. */
  onDiagnostic?: (message: string, detail?: unknown) => void;
};

export type AppendResult = {
  inserted: number;
  /** Already present (same id) — ingest is idempotent. */
  duplicate: number;
  /** Refused before reaching SQL. */
  rejected: { id: string; reason: string }[];
};

export type StoredEvent = {
  id: string;
  at: number;
  kind: string;
  tier: string;
  content: string;
  session_id: string | null;
  payload: Record<string, unknown>;
};

export type ConsentEntry = {
  id: string;
  at: string;
  action: 'granted' | 'revoked' | 'updated';
  subject: string;
  tier: string;
  scopes: string[];
  promise: string;
  method: string;
  deletes_imported_events: boolean;
};

export type ConnectionRow = {
  connector_id: string;
  status: string;
  scopes: string[];
  token_ref: string;
  connected_at: string | null;
  last_sync_at: string | null;
  items_imported: number;
  revoked_at: string | null;
};

export type CursorState = {
  /** Where the next collection should start. */
  at: number | null;
  /** Intervals seen but not yet closed. Carried across syncs so a session that
   *  straddles two runs is completed, not lost.
   *  Now includes per-class map so splitting a stream gives same totals.
   */
  open: { app: string; startMs: number; activities?: { className: string; startMs: number }[] }[];
};

export type SessionRow = {
  id: string;
  app: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  source: string;
};

export type GapReason = 'too_long' | 'abandoned_open' | 'orphan_background' | 'invalid_package' | 'os_query_failed';

export type DataGap = {
  source: string;
  reason: GapReason;
  from_ms: number | null;
  to_ms: number | null;
  count: number;
  recorded_at: number;
};

export type RollupRecord = {
  day: string;
  payload: Record<string, unknown>;
  computed_at: number;
};

export type ImportRecord = {
  id: string;
  source_id: string;
  export_format: string;
  imported_at: string;
  item_count: number;
  consent_id: string;
};

export type StoreResetReason =
  | 'user_delete_all'
  | 'key_mismatch_reset'
  | 'keystore_invalidated'
  | 'reinstall_or_storage_cleared';

export type KeyIntegrityResult =
  | { ok: true; currentKeyId: string }
  | {
      ok: false;
      reason: 'key_mismatch' | 'corrupt_ciphertext';
      currentKeyId: string;
      message: string;
    };

export type StoreResetAudit = {
  at: number;
  day: string;
  reason: StoreResetReason;
  previousHistoryStartDay?: string | null;
  detail?: string;
};

export type DayStoreRowCounts = {
  day: string;
  events: number;
  fgEvents: number;
  bgEvents: number;
  labelEvents: number;
  otherEvents: number;
  sessions: number;
};

export type SessionRepairSnapshot = {
  at: number;
  day: string;
  recoveredFgEvents: number;
  rebuiltDays: number;
  before: DayStoreRowCounts[];
  after: DayStoreRowCounts[];
};

export type StoredBudgetPeriod = 'daily' | 'weekly';
export type StoredBudgetTargetKind = 'app' | 'group';

export type StoredBudgetDefinition = {
  id: string;
  name: string;
  kind: StoredBudgetTargetKind;
  packages: readonly string[];
  period: StoredBudgetPeriod;
  limitMs: number;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type StoredGoalKind =
  | 'daily_total_foreground'
  | 'daily_app_foreground'
  | 'daily_late_night_max'
  | 'daily_sitting_count_max';

export type StoredGoalDefinition = {
  id: string;
  title: string;
  kind: StoredGoalKind;
  targetMs?: number;
  targetCount?: number;
  packages?: readonly string[];
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WeeklyReportPrefs = {
  /** Strictly off by default; local opt-in weekly summary reminder. */
  reminderEnabled: boolean;
  /** Weekday for weekly report summary (`0` = Sunday .. `6` = Saturday). */
  reminderWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Local hour `0..23` (default `19`, outside `23:00–05:00` quiet hours). */
  reminderHourLocal: number;
  /** Optional separate toggle (strictly off by default) for a gentle local note when a budget is exceeded. */
  budgetNoteEnabled?: boolean;
  updatedAtMs: number;
};

export type ReminderDeliveryState = {
  lastWeeklySlot: string | null;
  sentBudgetKeys: readonly string[];
  updatedAtMs: number;
};

export type MirrorExportBundle = {
  exportedAt: string;
  schemaVersion: number;
  encryption: 'none';
  events: StoredEvent[];
  sessions: SessionRow[];
  gaps: DataGap[];
  budgets: StoredBudgetDefinition[];
  goals: StoredGoalDefinition[];
  weeklyReportPrefs: WeeklyReportPrefs;
  lastReset: StoreResetAudit | null;
};



