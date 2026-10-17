/**
 * The checks a connector must pass before it may ship.
 *
 * These run in CI, not at runtime: a connector that fails here is a build
 * failure, so no user ever sees an over-broad permission request.
 */
import type { Connector } from './types.js';
import { CONNECTORS } from './registry.js';

/**
 * Per-provider scope allowlist. A scope that is not here cannot be requested,
 * even if the provider would grant it.
 */
export const SCOPE_ALLOWLIST: Record<string, string[]> = {
  reddit: ['read', 'save'],
  youtube: ['https://www.googleapis.com/auth/youtube.readonly'],
  spotify: ['user-library-read', 'user-top-read', 'playlist-read-private'],
  github: ['read:user'],
};

/** Substrings that mark a write or administrative scope. Never allowed. */
export const FORBIDDEN_SCOPE_MARKERS = [
  'write',
  'post',
  'comment',
  'upload',
  'delete',
  'moderate',
  'admin',
  'manage',
  'follow',
  'message',
  'dm',
  'notifications',
];

export type ConnectorProblem = { connector: string; field: string; message: string };

export function validateConnector(connector: Connector, allowlist = SCOPE_ALLOWLIST): ConnectorProblem[] {
  const problems: ConnectorProblem[] = [];
  const push = (field: string, message: string) => problems.push({ connector: connector.id, field, message });

  if (connector.tier !== 'A') push('tier', 'connectors are tier A only');
  if (connector.origin !== 'api') push('origin', 'connectors use origin "api" only');
  if (connector.auth !== 'oauth2') push('auth', 'connectors use OAuth 2.0 only; password flows are forbidden');
  if (!connector.redirectUri.startsWith('mirror://oauth/')) push('redirectUri', 'must be an app-owned scheme, so no web callback receives the code');
  if (connector.hosts.length === 0) push('hosts', 'a connector must list the hosts it contacts');
  if (connector.hosts.some((h) => /[*]/.test(h))) push('hosts', 'wildcard hosts are not allowed');
  if (connector.retention.revoke !== 'one-tap') push('retention', 'revocation must be one tap');

  const allowed = allowlist[connector.id];
  if (!allowed) {
    push('id', 'no scope allowlist exists for this provider');
  } else {
    for (const scope of connector.scopes) {
      if (!allowed.includes(scope)) push('scopes', `"${scope}" is not in the allowlist for ${connector.id}`);
      const lower = scope.toLowerCase();
      for (const marker of FORBIDDEN_SCOPE_MARKERS) {
        if (lower.includes(marker)) push('scopes', `"${scope}" looks like a ${marker} scope; Mirror never writes`);
      }
    }
  }

  // Scope minimisation: a scope nobody uses is a permission nobody needs.
  const used = new Set(connector.collectors.flatMap((c) => c.scopes));
  for (const scope of connector.scopes) {
    if (!used.has(scope)) push('scopes', `"${scope}" is requested but no collector uses it`);
  }
  for (const collector of connector.collectors) {
    if (collector.kind !== 'api_item') push(`collectors.${collector.id}`, 'connectors may only emit api_item events');
    for (const scope of collector.scopes) {
      if (!connector.scopes.includes(scope)) push(`collectors.${collector.id}`, `uses "${scope}" without declaring it`);
    }
    if (!collector.plainLanguage || collector.plainLanguage.length < 12) {
      push(`collectors.${collector.id}`, 'needs a plain-language description of at least 12 characters');
    }
  }
  if (connector.collectors.length === 0) push('collectors', 'a connector with no collectors collects nothing and should not exist');

  return problems;
}

export function validateRegistry(registry: Connector[] = CONNECTORS): ConnectorProblem[] {
  const problems = registry.flatMap((c) => validateConnector(c));
  const ids = registry.map((c) => c.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) problems.push({ connector: id, field: 'id', message: 'duplicate connector id' });
  return problems;
}

/** The library as a whole: what is in the registry must be valid, full stop. */
export const REGISTRY_ERRORS = validateRegistry();

export type ConsentSummary = { connector: string; headline: string; items: string[]; revoke: string };

/** One plain-language paragraph per connector, assembled from its own collectors. */
export function describeConsent(connector: Connector): ConsentSummary {
  return {
    connector: connector.id,
    headline: `${connector.name} will share what you already saved, liked or joined. Mirror never posts, follows or messages anyone.`,
    items: connector.collectors.map((c) => c.plainLanguage),
    revoke: `You can disconnect ${connector.name} in one tap; its imported events are deleted ${connector.retention.deletesImportedEvents ? 'immediately' : 'at the next cleanup'}.`,
  };
}
