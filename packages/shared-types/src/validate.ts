/**
 * The event validator.
 *
 * Zero dependencies and zero surprises: a schema this small does not need a
 * general-purpose validator, and a hand-written one can say exactly which rule
 * failed. The JSON Schema file next to it is the interop description; this is the
 * enforcement, and a test keeps the two in step.
 *
 * Rules that exist because of the brief, not because of JSON Schema:
 *   - `additionalProperties: false` everywhere: an unknown field is a bug or a
 *     leak, and both should fail loudly.
 *   - A/B/C events must carry `consent`; D events must not pretend to (the OS
 *     grant is recorded in settings, not stamped on every event).
 *   - `content: 'content'` events may not use origin `os`: the OS never yields
 *     titles, queries or URLs, so such an event is a fabricated signal.
 *   - `web_visit.host` is a hostname, never a URL with a path or query.
 *   - `topic_vector` is a unit vector, 32 dimensions: a direction, not a title.
 *   - `item_hash` is HMAC-SHA256 hex, so it is opaque and fixed-width.
 *   - Timestamps must be ISO-8601 UTC with a Z.
 */
import type { DataTier } from './tier';
import { TIERS } from './tier';
import { CONTENT_CLASSES, ORIGINS, SCHEMA_VERSION, TOPIC_VECTOR_DIM, type MirrorEvent } from './event';

export type ValidationError = { path: string; message: string };
export type ValidationResult = { ok: true; value: MirrorEvent } | { ok: false; errors: ValidationError[] };

const KINDS = [
  'app_foreground',
  'app_background',
  'device_unlock',
  'web_visit',
  'api_item',
  'import_item',
  'intent_label',
  'focus_window',
] as const;

const COMMON = ['schema_version', 'id', 'kind', 'at', 'tier', 'origin', 'content', 'consent', 'session_id'] as const;

/** Fields each kind may carry, beyond the common ones. */
export const KIND_FIELDS: Record<string, readonly string[]> = {
  app_foreground: ['app', 'activity'],
  app_background: ['app', 'duration_ms'],
  device_unlock: [],
  web_visit: ['host', 'duration_ms', 'scroll_depth', 'completion_ratio', 'query', 'item_hash', 'topic_vector'],
  api_item: ['source_id', 'action', 'subject', 'item_hash', 'topic_vector'],
  import_item: ['source_id', 'export_format', 'subject', 'item_hash', 'topic_vector'],
  intent_label: ['label'],
  focus_window: ['window_id', 'phase'],
};

/** Fields a kind must carry (beyond the three every event carries). */
export const KIND_REQUIRED: Record<string, readonly string[]> = {
  app_foreground: ['app'],
  app_background: ['app', 'duration_ms'],
  device_unlock: [],
  web_visit: ['host', 'duration_ms'],
  api_item: ['source_id', 'action'],
  import_item: ['source_id', 'export_format'],
  intent_label: ['session_id', 'label'],
  focus_window: ['window_id', 'phase'],
};

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const SESSION_ID = /^ses_[A-Za-z0-9_-]{6,40}$/;
const ITEM_HASH = /^[0-9a-f]{64}$/;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Unit-vector tolerance: rounding to 4 decimals keeps ‖v‖ within this. */
const NORM_MIN = 0.97;
const NORM_MAX = 1.03;

const fail = (path: string, message: string): ValidationError => ({ path, message });

/** Validate a topic embedding. Exported because embeddings arrive in P1. */
export function validateTopicVector(value: unknown, path = 'topic_vector'): ValidationError[] {
  if (!Array.isArray(value)) return [fail(path, 'must be an array of numbers')];
  if (value.length !== TOPIC_VECTOR_DIM) return [fail(path, `must have exactly ${TOPIC_VECTOR_DIM} dimensions`)];
  let sumSquares = 0;
  for (let i = 0; i < value.length; i++) {
    const n = value[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) return [fail(`${path}[${i}]`, 'must be a finite number')];
    if (n < -1 || n > 1) return [fail(`${path}[${i}]`, 'must be between -1 and 1')];
    sumSquares += n * n;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm < NORM_MIN || norm > NORM_MAX) {
    return [fail(path, `must be a unit vector (norm ${norm.toFixed(3)} is outside ${NORM_MIN}–${NORM_MAX})`)];
  }
  return [];
}

export function validateEvent(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [fail('', 'event must be an object')] };
  }
  const e = input as Record<string, unknown>;

  if (e.schema_version !== SCHEMA_VERSION) errors.push(fail('schema_version', `must be ${SCHEMA_VERSION}`));
  if (typeof e.id !== 'string' || !ID.test(e.id)) errors.push(fail('id', 'must be 8-64 chars of [A-Za-z0-9_-]'));
  if (typeof e.kind !== 'string' || !KINDS.includes(e.kind as (typeof KINDS)[number])) {
    errors.push(fail('kind', `must be one of ${KINDS.join(', ')}`));
  }
  if (typeof e.at !== 'string' || !ISO_UTC.test(e.at)) errors.push(fail('at', 'must be ISO-8601 UTC ending in Z'));
  if (typeof e.tier !== 'string' || !TIERS.includes(e.tier as DataTier)) errors.push(fail('tier', `must be one of ${TIERS.join(', ')}`));
  if (typeof e.origin !== 'string' || !ORIGINS.includes(e.origin as (typeof ORIGINS)[number])) {
    errors.push(fail('origin', `must be one of ${ORIGINS.join(', ')}`));
  }
  if (typeof e.content !== 'string' || !CONTENT_CLASSES.includes(e.content as (typeof CONTENT_CLASSES)[number])) {
    errors.push(fail('content', `must be one of ${CONTENT_CLASSES.join(', ')}`));
  }

  const kind = typeof e.kind === 'string' ? e.kind : '';
  const allowed = new Set([...COMMON, ...(KIND_FIELDS[kind] ?? [])]);
  for (const key of Object.keys(e)) {
    // `undefined` is not a value JSON can carry, so a key set to undefined is
    // treated as absent rather than as an unknown field. Callers building objects
    // with conditional fields therefore do not have to strip them first.
    if (e[key] === undefined) continue;
    if (!allowed.has(key)) errors.push(fail(key, 'unknown field — the schema is closed'));
  }
  for (const key of KIND_REQUIRED[kind] ?? []) {
    if (e[key] === undefined || e[key] === null) errors.push(fail(key, `required for ${kind}`));
  }

  // Consent: A/B/C events are lawful only under a named grant.
  const tier = e.tier as DataTier;
  if ((tier === 'A' || tier === 'B' || tier === 'C') && typeof e.consent !== 'string') {
    errors.push(fail('consent', `required for tier ${tier} events`));
  }
  if (tier === 'D' && e.consent !== undefined) {
    errors.push(fail('consent', 'tier D events do not carry a consent id: the OS grant lives in settings'));
  }

  // Content and origin must agree: the OS cannot produce titles or queries.
  if (e.content === 'content' && e.origin === 'os') {
    errors.push(fail('content', 'the OS produces metadata only; a content event from origin "os" is fabricated'));
  }

  if (e.session_id !== undefined && (typeof e.session_id !== 'string' || !SESSION_ID.test(e.session_id))) {
    errors.push(fail('session_id', 'must look like ses_<6-40 chars>'));
  }
  if (e.item_hash !== undefined && (typeof e.item_hash !== 'string' || !ITEM_HASH.test(e.item_hash))) {
    errors.push(fail('item_hash', 'must be 64 lowercase hex characters (HMAC-SHA256)'));
  }
  if (e.topic_vector !== undefined) errors.push(...validateTopicVector(e.topic_vector));

  if (e.duration_ms !== undefined) {
    if (typeof e.duration_ms !== 'number' || !Number.isFinite(e.duration_ms) || e.duration_ms < 0 || e.duration_ms > MAX_INTERVAL_MS) {
      errors.push(fail('duration_ms', 'must be a finite number between 0 and 24h'));
    }
  }
  if (e.app !== undefined && (typeof e.app !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(e.app))) {
    errors.push(fail('app', 'must be an Android-style package name'));
  }
  if (e.host !== undefined) {
    if (typeof e.host !== 'string' || !HOST.test(e.host)) errors.push(fail('host', 'must be a bare hostname'));
    else if (e.host.includes('/') || e.host.includes('?')) errors.push(fail('host', 'must not contain a path or query'));
  }
  for (const ratio of ['scroll_depth', 'completion_ratio'] as const) {
    const v = e[ratio];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      errors.push(fail(ratio, 'must be a number between 0 and 1'));
    }
  }
  if (e.completion_ratio !== undefined && e.content !== 'content') {
    errors.push(fail('completion_ratio', 'is a content signal; the event must be marked content'));
  }
  if (e.topic_vector !== undefined && e.content !== 'content') {
    errors.push(fail('topic_vector', 'is derived from content; the event must be marked content'));
  }
  if (e.item_hash !== undefined && e.content !== 'content') {
    errors.push(fail('item_hash', 'identifies a content item; the event must be marked content'));
  }
  if (e.action !== undefined && !['saved', 'subscribed', 'followed', 'liked'].includes(String(e.action))) {
    errors.push(fail('action', 'must be saved, subscribed, followed or liked'));
  }
  if (e.label !== undefined && !['intentional', 'mindless', 'unsure'].includes(String(e.label))) {
    errors.push(fail('label', 'must be intentional, mindless or unsure'));
  }
  if (e.phase !== undefined && !['start', 'end', 'left'].includes(String(e.phase))) {
    errors.push(fail('phase', 'must be start, end or left'));
  }
  if (e.query !== undefined && (typeof e.query !== 'string' || e.query.length > 512)) {
    errors.push(fail('query', 'must be a string of at most 512 characters'));
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: input as MirrorEvent };
}

export function assertEvent(input: unknown): MirrorEvent {
  const result = validateEvent(input);
  if (!result.ok) {
    throw new Error(`invalid event: ${result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; ')}`);
  }
  return result.value;
}
