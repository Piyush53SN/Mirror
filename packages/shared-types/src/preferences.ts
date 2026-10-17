/**
 * Preferences, flags and consent grants.
 *
 * Three rules shape this file:
 *
 *   1. Typed flags, every one defaulting to off. A flag that defaults on is a
 *      decision taken away from the person.
 *   2. Nothing here can be changed from the network. `applyOverrides` accepts a
 *      *narrowing* only: an override may switch a feature off, and is refused if
 *      it would switch one on. That is the technical form of "deployment can
 *      never add collection".
 *   3. Consent is data, not a boolean. Each grant records what was asked, when,
 *      and whether it is still live, so revoking one can delete exactly the
 *      events it covered.
 */
import { TIERS, type DataTier } from './tier';

export const PREFERENCES_VERSION = 1;

/** Public surface of the private/public distinction. DIP/PIP stay in code. */
export const VISIBILITIES = ['private', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type FeatureFlags = {
  /** Social surface: off by default, and off again after every update. */
  social: boolean;
  /** Matches, sharing and public profile all sit behind this. */
  shareCards: boolean;
  /** Opt-in nudges. The only place Mirror may interrupt. */
  nudges: boolean;
  /** Focus windows: a person-set intention, never a target. */
  focusWindows: boolean;
  /** Weekly report generation; on, because it is computed on-device only. */
  weeklyReport: boolean;
  /** The Ask sheet (local question answering over aggregates). */
  askSheet: boolean;
  /** Android home-screen widget. */
  widget: boolean;
  /** The browser extension capture surface (tier C). */
  extensionCapture: boolean;
};

export const DEFAULT_FLAGS: FeatureFlags = {
  social: false,
  shareCards: false,
  nudges: false,
  focusWindows: true,
  weeklyReport: true,
  askSheet: true,
  widget: false,
  extensionCapture: false,
};

export type QuietHours = { start: string; end: string; enabled: boolean };

export type Preferences = {
  version: typeof PREFERENCES_VERSION;
  /** Private = DIP: raw events never leave the device. */
  visibility: Visibility;
  /** Which tiers the person has agreed to use at all. */
  tiers: Record<DataTier, boolean>;
  flags: FeatureFlags;
  /** Metadata only: counts, durations, no titles. On by default. */
  collectMetadata: boolean;
  /** Titles, queries and URLs: content class events. Off by default. */
  collectContent: boolean;
  notifications: {
    enabled: boolean;
    quietHours: QuietHours;
    /** Local only. No push service exists. */
    channel: 'local';
  };
  accessibility: {
    reduceMotion: boolean;
    reduceTransparency: boolean;
    /** 1 = 100%. Capped at 2 (200%) by the design system. */
    fontScale: number;
  };
  /** Data minimisation: imported items are trimmed to this window. */
  retentionDays: 180;
};

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_VERSION,
  visibility: 'private',
  tiers: { A: false, B: false, C: false, D: false },
  flags: { ...DEFAULT_FLAGS },
  collectMetadata: true,
  collectContent: false,
  notifications: { enabled: false, quietHours: { start: '22:00', end: '07:00', enabled: true }, channel: 'local' },
  accessibility: { reduceMotion: false, reduceTransparency: false, fontScale: 1 },
  retentionDays: 180,
};

export type ConsentGrant = {
  id: string;
  /** What was granted: a tier, a connector, the extension, or the OS collector. */
  subject: string;
  tier: DataTier;
  /** Exact scope strings as shown to the person. */
  scopes: string[];
  grantedAt: string;
  revokedAt?: string;
  /** What the consent screen promised, kept so a later audit can compare. */
  promise: string;
};

export type ValidationIssue = { path: string; message: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validatePreferences(input: unknown): { ok: true; value: Preferences } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (input === null || typeof input !== 'object') return { ok: false, issues: [{ path: '', message: 'preferences must be an object' }] };
  const p = input as Record<string, any>;
  const bad = (path: string, message: string) => issues.push({ path, message });

  if (p.version !== PREFERENCES_VERSION) bad('version', `must be ${PREFERENCES_VERSION}`);
  if (!VISIBILITIES.includes(p.visibility)) bad('visibility', 'must be private or public');

  for (const tier of TIERS) {
    if (typeof p.tiers?.[tier] !== 'boolean') bad(`tiers.${tier}`, 'must be a boolean');
  }
  for (const key of Object.keys(DEFAULT_FLAGS)) {
    if (typeof p.flags?.[key] !== 'boolean') bad(`flags.${key}`, 'must be a boolean');
  }
  for (const key of Object.keys(p.flags ?? {})) {
    if (!(key in DEFAULT_FLAGS)) bad(`flags.${key}`, 'unknown flag — flags are a closed set');
  }
  for (const key of ['collectMetadata', 'collectContent'] as const) {
    if (typeof p[key] !== 'boolean') bad(key, 'must be a boolean');
  }
  if (p.collectContent === true && p.collectMetadata === false) {
    bad('collectContent', 'content cannot be collected while metadata is off');
  }
  if (p.notifications?.channel !== 'local') bad('notifications.channel', 'only local notifications exist');
  for (const edge of ['start', 'end'] as const) {
    const v = p.notifications?.quietHours?.[edge];
    if (typeof v !== 'string' || !HHMM.test(v)) bad(`notifications.quietHours.${edge}`, 'must be HH:MM');
  }
  if (
    typeof p.accessibility?.fontScale !== 'number' ||
    !Number.isFinite(p.accessibility.fontScale) ||
    p.accessibility.fontScale < 1 ||
    p.accessibility.fontScale > 2
  ) {
    bad('accessibility.fontScale', 'must be between 1 and 2');
  }
  for (const key of ['reduceMotion', 'reduceTransparency'] as const) {
    if (typeof p.accessibility?.[key] !== 'boolean') bad(`accessibility.${key}`, 'must be a boolean');
  }
  if (p.retentionDays !== 180 && p.retentionDays !== 90 && p.retentionDays !== 365) {
    bad('retentionDays', 'must be 90, 180 or 365 — a fixed set, so no server can extend it');
  }
  if (p.visibility === 'public' && p.flags?.social === false) {
    bad('visibility', 'a public profile requires the social flag; they can never disagree');
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: input as Preferences };
}

export function validateGrant(grant: unknown): { ok: true; value: ConsentGrant } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const g = (grant ?? {}) as Record<string, any>;
  const bad = (path: string, message: string) => issues.push({ path, message });
  if (typeof g.id !== 'string' || g.id.length < 4) bad('id', 'must be a stable id');
  if (typeof g.subject !== 'string' || g.subject.length === 0) bad('subject', 'must name what was granted');
  if (!TIERS.includes(g.tier)) bad('tier', 'must be A, B, C or D');
  if (!Array.isArray(g.scopes) || g.scopes.some((s: unknown) => typeof s !== 'string')) bad('scopes', 'must be an array of strings');
  if (typeof g.grantedAt !== 'string' || !ISO.test(g.grantedAt)) bad('grantedAt', 'must be ISO-8601 UTC');
  if (g.revokedAt !== undefined && (typeof g.revokedAt !== 'string' || !ISO.test(g.revokedAt))) bad('revokedAt', 'must be ISO-8601 UTC when present');
  if (g.revokedAt && Date.parse(g.revokedAt) < Date.parse(g.grantedAt)) bad('revokedAt', 'cannot precede grantedAt');
  if (typeof g.promise !== 'string' || g.promise.length < 20) bad('promise', 'must record what was promised, in words');
  return issues.length ? { ok: false, issues } : { ok: true, value: grant as ConsentGrant };
}

/** Grants that are still live — the only ones an event may cite. */
export function isLive(grant: ConsentGrant, at: string): boolean {
  if (grant.revokedAt) return false;
  return Date.parse(grant.grantedAt) <= Date.parse(at);
}

/**
 * Remote overrides may only narrow. Anything that would widen collection is
 * refused, and the reason is returned rather than thrown so the caller can log it.
 */
export type Overrides = {
  flags?: Partial<Record<keyof FeatureFlags, boolean>>;
  /** Turning a tier on remotely is never allowed; listed only to be refused. */
  tiers?: Partial<Record<DataTier, boolean>>;
  notificationsEnabled?: boolean;
};

export type OverrideResult = { preferences: Preferences; refused: { path: string; message: string }[] };

export function applyOverrides(preferences: Preferences, overrides: Overrides): OverrideResult {
  const next: Preferences = { ...preferences, flags: { ...preferences.flags }, tiers: { ...preferences.tiers } };
  const refused: OverrideResult['refused'] = [];

  for (const [key, value] of Object.entries(overrides.flags ?? {})) {
    if (!(key in DEFAULT_FLAGS)) {
      refused.push({ path: `flags.${key}`, message: 'unknown flag' });
      continue;
    }
    if (typeof value !== 'boolean') {
      refused.push({ path: `flags.${key}`, message: 'must be a boolean' });
      continue;
    }
    if (value === true && next.flags[key as keyof FeatureFlags] === false) {
      refused.push({ path: `flags.${key}`, message: 'remote configuration may disable a feature, never enable one' });
      continue;
    }
    next.flags[key as keyof FeatureFlags] = value;
  }

  for (const [tier, value] of Object.entries(overrides.tiers ?? {})) {
    if (value === true) {
      refused.push({ path: `tiers.${tier}`, message: 'data tiers are granted on the device, never remotely' });
    } else if (value === false) {
      next.tiers[tier as DataTier] = false;
    }
  }

  if (overrides.notificationsEnabled === true) {
    refused.push({ path: 'notifications.enabled', message: 'notifications are opted into on the device only' });
  } else if (overrides.notificationsEnabled === false) {
    next.notifications = { ...next.notifications, enabled: false };
  }

  // Invariants survive every override.
  if (next.visibility === 'public' && next.flags.social === false) next.visibility = 'private';
  return { preferences: next, refused };
}
