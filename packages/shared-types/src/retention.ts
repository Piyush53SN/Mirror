/**
 * The retention policy.
 *
 * Retention is a schema, not a number in a settings screen, because a promise
 * like "imported items are deleted when you disconnect" has to be checkable. The
 * policy is fixed at build time (`DEFAULT_RETENTION`), a person may choose one of
 * three documented windows, and no server can extend it — the same rule as
 * preferences.
 *
 * `diagnostics` is pinned to 0: Mirror does not collect crash or release-health
 * data, so there is no bucket to retain.
 */
export const RETENTION_SCHEMA_VERSION = 1;

export const RETENTION_CLASSES = ['raw_events', 'derived_daily', 'derived_weekly', 'imported_events', 'exports', 'diagnostics'] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];

export const RETENTION_WINDOWS = [90, 180, 365] as const;
export type RetentionWindow = (typeof RETENTION_WINDOWS)[number];

export type RetentionPolicy = {
  schema_version: typeof RETENTION_SCHEMA_VERSION;
  /** The window the person chose. */
  default_days: RetentionWindow;
  /** Days kept per class. 0 means "never stored". */
  classes: Record<RetentionClass, number>;
  /** Revoking a connector deletes what it imported; that is not configurable. */
  on_revoke: 'delete_imported_events';
  /** Uninstalling erases the encrypted store; there is no cloud copy in Private mode. */
  on_uninstall: 'delete_everything';
  /** Upper bound on any record, including derived ones. */
  hard_delete_after_days: number;
};

export type RetentionIssue = { path: string; message: string };

export function defaultRetention(days: RetentionWindow = 180): RetentionPolicy {
  return {
    schema_version: RETENTION_SCHEMA_VERSION,
    default_days: days,
    classes: {
      raw_events: days,
      derived_daily: days,
      derived_weekly: Math.max(days, 365),
      imported_events: days,
      exports: 7,
      diagnostics: 0,
    },
    on_revoke: 'delete_imported_events',
    on_uninstall: 'delete_everything',
    hard_delete_after_days: Math.max(days, 365),
  };
}

export function validateRetention(input: unknown): { ok: true; value: RetentionPolicy } | { ok: false; issues: RetentionIssue[] } {
  const issues: RetentionIssue[] = [];
  if (input === null || typeof input !== 'object') return { ok: false, issues: [{ path: '', message: 'retention policy must be an object' }] };
  const p = input as Record<string, any>;
  const bad = (path: string, message: string) => issues.push({ path, message });

  if (p.schema_version !== RETENTION_SCHEMA_VERSION) bad('schema_version', `must be ${RETENTION_SCHEMA_VERSION}`);
  if (!RETENTION_WINDOWS.includes(p.default_days)) bad('default_days', 'must be 90, 180 or 365');

  for (const key of Object.keys(p.classes ?? {})) {
    if (!(RETENTION_CLASSES as readonly string[]).includes(key)) bad(`classes.${key}`, 'unknown retention class');
  }
  for (const cls of RETENTION_CLASSES) {
    const value = p.classes?.[cls];
    if (!Number.isInteger(value) || value < 0) bad(`classes.${cls}`, 'must be a non-negative integer number of days');
    if (value > 365 * 5) bad(`classes.${cls}`, 'must not exceed 5 years; Mirror is not an archive');
  }
  if (p.classes?.diagnostics !== 0) bad('classes.diagnostics', 'Mirror collects no diagnostics, so its retention must be 0');

  if (p.on_revoke !== 'delete_imported_events') bad('on_revoke', 'revocation must delete imported events');
  if (p.on_uninstall !== 'delete_everything') bad('on_uninstall', 'uninstalling must delete everything');

  if (!Number.isInteger(p.hard_delete_after_days) || p.hard_delete_after_days < 1 || p.hard_delete_after_days > 365 * 5) {
    bad('hard_delete_after_days', 'must be an integer between 1 and 1825');
  } else {
    for (const cls of RETENTION_CLASSES) {
      const value = p.classes?.[cls];
      if (Number.isInteger(value) && value > p.hard_delete_after_days) {
        bad(`classes.${cls}`, `cannot exceed hard_delete_after_days (${p.hard_delete_after_days})`);
      }
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: input as RetentionPolicy };
}

/**
 * When a record of `cls` created at `from` stops existing.
 * `null` means it is never stored (diagnostics), so nothing is returned.
 */
export function expiresAt(policy: RetentionPolicy, cls: RetentionClass, from: string): string | null {
  const days = policy.classes[cls];
  if (days === 0) return null;
  const start = Date.parse(from);
  if (Number.isNaN(start)) throw new Error(`expiresAt: invalid timestamp ${from}`);
  return new Date(start + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
