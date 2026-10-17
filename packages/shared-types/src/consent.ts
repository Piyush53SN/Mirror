/**
 * The consent log.
 *
 * Consent is not a boolean and not a single row: it is an append-only history of
 * what was asked, what was promised, and what was revoked. That history is what
 * makes "revocable in one tap" auditable — after a revocation, the app can delete
 * exactly the events that grant covered, and the person can see when the promise
 * changed.
 *
 * This is the log. The *live* state (which grant currently covers which subject)
 * is derived with `liveConsent()`; no second copy is stored, so the two cannot
 * disagree.
 */
import { TIERS, type DataTier } from './tier';

export const CONSENT_SCHEMA_VERSION = 1;

export const CONSENT_ACTIONS = ['granted', 'revoked', 'updated'] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export const CONSENT_METHODS = ['in_app', 'system_settings', 'oauth', 'extension_install'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export type ConsentLogEntry = {
  schema_version: typeof CONSENT_SCHEMA_VERSION;
  id: string;
  /** When the action happened, ISO-8601 UTC. */
  at: string;
  action: ConsentAction;
  /** What was granted: `os_usage`, a connector id, `extension:<host>`, or `tier:A`. */
  subject: string;
  tier: DataTier;
  /** Exact scopes as shown to the person. Empty only for the OS usage grant. */
  scopes: string[];
  /** The words on the consent screen, kept so a later change is visible. */
  promise: string;
  method: ConsentMethod;
  /** Revocations must say whether imported events are deleted. */
  deletes_imported_events: boolean;
};

export type ConsentLog = {
  schema_version: typeof CONSENT_SCHEMA_VERSION;
  entries: ConsentLogEntry[];
};

export type Issue = { path: string; message: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ENTRY_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function validateConsentLog(input: unknown): { ok: true; value: ConsentLog } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = [];
  if (input === null || typeof input !== 'object') return { ok: false, issues: [{ path: '', message: 'consent log must be an object' }] };
  const log = input as Record<string, any>;
  if (log.schema_version !== CONSENT_SCHEMA_VERSION) issues.push({ path: 'schema_version', message: `must be ${CONSENT_SCHEMA_VERSION}` });
  if (!Array.isArray(log.entries)) return { ok: false, issues: [...issues, { path: 'entries', message: 'must be an array' }] };

  const seen = new Set<string>();
  let previousAt = 0;
  const granted = new Map<string, number>();

  log.entries.forEach((entry: any, index: number) => {
    const base = `entries[${index}]`;
    if (entry === null || typeof entry !== 'object') {
      issues.push({ path: base, message: 'must be an object' });
      return;
    }
    if (entry.schema_version !== CONSENT_SCHEMA_VERSION) issues.push({ path: `${base}.schema_version`, message: `must be ${CONSENT_SCHEMA_VERSION}` });
    if (typeof entry.id !== 'string' || !ENTRY_ID.test(entry.id)) issues.push({ path: `${base}.id`, message: 'must be 8-64 chars of [A-Za-z0-9_-]' });
    else if (seen.has(entry.id)) issues.push({ path: `${base}.id`, message: 'duplicate entry id' });
    else seen.add(entry.id);

    if (typeof entry.at !== 'string' || !ISO.test(entry.at)) {
      issues.push({ path: `${base}.at`, message: 'must be ISO-8601 UTC' });
    } else {
      const at = Date.parse(entry.at);
      if (at < previousAt) issues.push({ path: `${base}.at`, message: 'the log is append-only; entries must be in time order' });
      previousAt = Math.max(previousAt, at);
    }

    if (!CONSENT_ACTIONS.includes(entry.action)) issues.push({ path: `${base}.action`, message: 'must be granted, revoked or updated' });
    if (typeof entry.subject !== 'string' || entry.subject.length === 0) issues.push({ path: `${base}.subject`, message: 'must name what was granted' });
    if (!TIERS.includes(entry.tier)) issues.push({ path: `${base}.tier`, message: 'must be A, B, C or D' });
    if (!Array.isArray(entry.scopes) || entry.scopes.some((s: unknown) => typeof s !== 'string')) {
      issues.push({ path: `${base}.scopes`, message: 'must be an array of strings' });
    }
    if (typeof entry.promise !== 'string' || entry.promise.length < 20) issues.push({ path: `${base}.promise`, message: 'must record what was promised, in words' });
    if (!CONSENT_METHODS.includes(entry.method)) issues.push({ path: `${base}.method`, message: 'must be in_app, system_settings, oauth or extension_install' });
    if (typeof entry.deletes_imported_events !== 'boolean') issues.push({ path: `${base}.deletes_imported_events`, message: 'must be a boolean' });

    // A revocation must revoke something that was granted, and must delete the
    // events that grant covered. Otherwise "one tap" is a promise with no effect.
    if (entry.action === 'revoked' && typeof entry.subject === 'string') {
      if (!granted.has(entry.subject)) {
        issues.push({ path: `${base}.subject`, message: 'revocation has no preceding grant for this subject' });
      } else if (entry.deletes_imported_events !== true) {
        issues.push({ path: `${base}.deletes_imported_events`, message: 'a revocation must delete the events its grant covered' });
      }
      granted.delete(entry.subject);
    }
    if ((entry.action === 'granted' || entry.action === 'updated') && typeof entry.subject === 'string') {
      granted.set(entry.subject, index);
    }
  });

  return issues.length ? { ok: false, issues } : { ok: true, value: input as ConsentLog };
}

/** The current grant per subject: the last non-revoked entry. */
export function liveConsent(log: ConsentLog): Map<string, ConsentLogEntry> {
  const live = new Map<string, ConsentLogEntry>();
  for (const entry of log.entries) {
    if (entry.action === 'revoked') live.delete(entry.subject);
    else live.set(entry.subject, entry);
  }
  return live;
}

/** The entries a revocation must delete: everything for that subject up to it. */
export function eventsCoveredBy(entry: ConsentLogEntry, log: ConsentLog): string[] {
  if (entry.action !== 'revoked') return [];
  return log.entries
    .filter((candidate) => Date.parse(candidate.at) <= Date.parse(entry.at))
    .filter((candidate) => candidate.subject === entry.subject && candidate.action !== 'revoked')
    .map((candidate) => candidate.id);
}
