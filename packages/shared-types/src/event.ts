/**
 * The Mirror event schema.
 *
 * One event type, discriminated by `kind`, because the storage layer, the
 * ingestion pipeline, the synthetic generator and the privacy canary all have to
 * agree on exactly one shape.
 *
 * Field naming: **snake_case**. These objects are persisted and (in P6) may be
 * serialised by the sync layer, so the wire format is the name of record; the
 * TypeScript type names stay PascalCase. `session_id`, `item_hash`,
 * `topic_vector` and `completion_ratio` are named exactly as the brief requires.
 *
 * Every event carries:
 *   - `tier`    which of the four allowed data sources produced it,
 *   - `origin`  the mechanism (used to prove no forbidden source ever appears),
 *   - `content` whether the payload is metadata (safe to aggregate) or content
 *               (titles, queries, URLs — never leaves the device in Privacy Mode),
 *   - `consent` which grant covered it (required for A/B/C, absent for D).
 *
 * There is deliberately no device id, account id or install id: correlation is
 * local, and an event that cannot be joined to a person is an event that cannot
 * be leaked as one.
 */
import type { DataTier } from './tier.js';

export const SCHEMA_VERSION = 1;

/** Dimensionality of an on-device topic embedding. Fixed so storage has one shape. */
export const TOPIC_VECTOR_DIM = 32;

/** The only four mechanisms the brief allows. Nothing else validates. */
export const ORIGINS = ['os', 'extension', 'api', 'export', 'user'] as const;
export type Origin = (typeof ORIGINS)[number];

/** `metadata` is countable; `content` is readable and never leaves the device. */
export const CONTENT_CLASSES = ['metadata', 'content'] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

export type EventKind =
  | 'app_foreground'
  | 'app_background'
  | 'device_unlock'
  | 'web_visit'
  | 'api_item'
  | 'import_item'
  | 'intent_label'
  | 'focus_window';

type Base<TKind extends EventKind> = {
  schema_version: typeof SCHEMA_VERSION;
  /** Local-only identifier. Any UUID works; it is never sent anywhere. */
  id: string;
  kind: TKind;
  /** ISO-8601 with an explicit Z. Local timezones are applied at read time. */
  at: string;
  tier: DataTier;
  origin: Origin;
  content: ContentClass;
  /** Required for A/B/C events: the grant that makes the event lawful to record. */
  consent?: string;
  /**
   * The sitting this event was attributed to, assigned at ingest.
   * Optional on raw events (attribution happens later); required on labels.
   */
  session_id?: string;
};

/**
 * An opaque item identity: HMAC-SHA256, hex, keyed with a per-install secret held
 * in the platform keystore. It lets two events about the same item be joined
 * without storing the URL or title they came from. Without the key — which never
 * leaves the device — the hash is not reversible.
 */
export type ItemHash = string;

/** A 32-dimensional, unit-length topic direction. Never a title, never a URL. */
export type TopicVector = number[];

export type AppForegroundEvent = Base<'app_foreground'> & {
  /** Android package name, e.g. `com.google.android.youtube`. */
  app: string;
  /** Foreground activity class when the OS exposes it (metadata only). */
  activity?: string;
};

export type AppBackgroundEvent = Base<'app_background'> & {
  app: string;
  /** Milliseconds the app was in the foreground. Derived, then checked. */
  duration_ms: number;
};

export type DeviceUnlockEvent = Base<'device_unlock'>;

export type WebVisitEvent = Base<'web_visit'> & {
  /** Host only — never a full URL with a query string. */
  host: string;
  duration_ms: number;
  /** 0..1, from the extension. Absent means "not measured", never 0. */
  scroll_depth?: number;
  /** Share of a video or audio item watched, 0..1. */
  completion_ratio?: number;
  /** The query, when the visit began with a search. Content, by definition. */
  query?: string;
  item_hash?: ItemHash;
  topic_vector?: TopicVector;
};

export type ApiItemEvent = Base<'api_item'> & {
  /** Connector id from @mirror/connectors, e.g. `reddit`. */
  source_id: string;
  action: 'saved' | 'subscribed' | 'followed' | 'liked';
  /** What the item was about, when the API says so. Content. */
  subject?: string;
  item_hash?: ItemHash;
  topic_vector?: TopicVector;
};

export type ImportItemEvent = Base<'import_item'> & {
  source_id: string;
  /** Which export produced it, e.g. `takeout`. */
  export_format: string;
  subject?: string;
  item_hash?: ItemHash;
  topic_vector?: TopicVector;
};

export type IntentLabelEvent = Base<'intent_label'> & {
  /** The session this label belongs to; labels never travel without it. */
  session_id: string;
  label: 'intentional' | 'mindless' | 'unsure';
};

export type FocusWindowEvent = Base<'focus_window'> & {
  window_id: string;
  /** `start`, `end`, or `left` when the user returned early. */
  phase: 'start' | 'end' | 'left';
};

export type MirrorEvent =
  | AppForegroundEvent
  | AppBackgroundEvent
  | DeviceUnlockEvent
  | WebVisitEvent
  | ApiItemEvent
  | ImportItemEvent
  | IntentLabelEvent
  | FocusWindowEvent;

export type MirrorEventKind = MirrorEvent['kind'];
