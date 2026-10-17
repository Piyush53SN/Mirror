/**
 * A connection record.
 *
 * What the app remembers about a linked source — and, deliberately, what it does
 * *not* remember: there is no field for an access token, a refresh token or a
 * password. Tokens live in the platform keystore; this record holds a reference
 * (`keystore:<alias>`) that is useless on its own. A validator rule rejects any
 * key that looks like a credential, so a future contributor cannot quietly add
 * one.
 */
export const CONNECTION_SCHEMA_VERSION = 1;

export const CONNECTION_STATUSES = ['disconnected', 'connected', 'error'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export type Connection = {
  schema_version: typeof CONNECTION_SCHEMA_VERSION;
  connector_id: string;
  status: ConnectionStatus;
  /** Scopes actually granted, which may be fewer than requested. */
  scopes: string[];
  /** Keystore alias, never a token: `keystore:mirror.reddit`. */
  token_ref: string;
  connected_at?: string;
  last_sync_at?: string;
  last_error?: { at: string; code: string };
  items_imported: number;
  revoked_at?: string;
};

export type ConnectionIssue = { path: string; message: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const TOKEN_REF = /^keystore:[A-Za-z0-9._-]{3,64}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,40}$/;
const CREDENTIAL_KEY = /(access_?token|refresh_?token|id_?token|secret|password|authorization|api_?key)/i;

export type ConnectionContext = {
  /** Connector ids the registry knows; when provided, the record must match one. */
  connectorIds?: string[];
  /** Allowed scopes per connector id; when provided, granted scopes must be a subset. */
  allowedScopes?: Record<string, string[]>;
};

export function validateConnection(input: unknown, context: ConnectionContext = {}): { ok: true; value: Connection } | { ok: false; issues: ConnectionIssue[] } {
  const issues: ConnectionIssue[] = [];
  if (input === null || typeof input !== 'object') return { ok: false, issues: [{ path: '', message: 'connection must be an object' }] };
  const c = input as Record<string, any>;
  const bad = (path: string, message: string) => issues.push({ path, message });

  // Credential-shaped fields are refused by name, whatever their value.
  for (const key of Object.keys(c)) {
    if (CREDENTIAL_KEY.test(key) && key !== 'token_ref') bad(key, 'credentials never appear in a connection record; tokens live in the keystore');
  }

  if (c.schema_version !== CONNECTION_SCHEMA_VERSION) bad('schema_version', `must be ${CONNECTION_SCHEMA_VERSION}`);
  if (typeof c.connector_id !== 'string' || c.connector_id.length === 0) bad('connector_id', 'must name the connector');
  else if (context.connectorIds && !context.connectorIds.includes(c.connector_id)) bad('connector_id', 'is not in the connector registry');
  if (!CONNECTION_STATUSES.includes(c.status)) bad('status', 'must be disconnected, connected or error');

  if (!Array.isArray(c.scopes) || c.scopes.some((s: unknown) => typeof s !== 'string')) {
    bad('scopes', 'must be an array of strings');
  } else if (context.allowedScopes && typeof c.connector_id === 'string') {
    const allowed = context.allowedScopes[c.connector_id] ?? [];
    for (const scope of c.scopes) {
      if (!allowed.includes(scope)) bad('scopes', `"${scope}" is not an allowed scope for ${c.connector_id}`);
    }
  }

  if (typeof c.token_ref !== 'string' || !TOKEN_REF.test(c.token_ref)) bad('token_ref', 'must be a keystore reference, e.g. keystore:mirror.reddit');
  if (!Number.isInteger(c.items_imported) || c.items_imported < 0) bad('items_imported', 'must be a non-negative integer');

  for (const field of ['connected_at', 'last_sync_at', 'revoked_at'] as const) {
    if (c[field] !== undefined && (typeof c[field] !== 'string' || !ISO.test(c[field]))) bad(field, 'must be ISO-8601 UTC');
  }

  if (c.status === 'connected') {
    if (!c.connected_at) bad('connected_at', 'a connected record must say when it connected');
    if (c.revoked_at) bad('revoked_at', 'a connected record cannot also be revoked');
  }
  if (c.status === 'disconnected') {
    if (!c.revoked_at) bad('revoked_at', 'a disconnected record must say when it was revoked');
  }
  if (c.status === 'error') {
    if (!c.last_error || typeof c.last_error !== 'object') {
      bad('last_error', 'an error record must carry the error');
    } else {
      if (typeof c.last_error.at !== 'string' || !ISO.test(c.last_error.at)) bad('last_error.at', 'must be ISO-8601 UTC');
      if (typeof c.last_error.code !== 'string' || !ERROR_CODE.test(c.last_error.code)) {
        bad('last_error.code', 'must be an uppercase code, not a provider message');
      }
      // A provider message may echo a URL or an item; error records carry codes.
      for (const key of Object.keys(c.last_error)) {
        if (key !== 'at' && key !== 'code') bad(`last_error.${key}`, 'error records carry no free text');
      }
    }
  }
  if (c.status !== 'error' && c.last_error !== undefined) bad('last_error', 'only an error record carries an error');

  if (c.connected_at && c.revoked_at && Date.parse(c.revoked_at) < Date.parse(c.connected_at)) {
    bad('revoked_at', 'cannot precede connected_at');
  }
  if (c.last_sync_at && c.connected_at && Date.parse(c.last_sync_at) < Date.parse(c.connected_at)) {
    bad('last_sync_at', 'cannot precede connected_at');
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: input as Connection };
}
