/**
 * Connector contracts.
 *
 * A connector is the only way Mirror learns anything about what a person reads,
 * watches or saves off-device, and the brief allows exactly one mechanism: an
 * official OAuth API. So a connector declaration is not configuration — it is a
 * permission request that is checked before code exists:
 *
 *   - every scope is declared and justified by a collector that uses it;
 *   - no write scopes, ever: Mirror reads, it never posts, follows or saves;
 *   - the hosts it may contact are listed, so the network layer can refuse
 *     anything else;
 *   - the tier is always A (official API), and the origin is always `api`.
 *
 * Anything that cannot be expressed here is not a connector. That is the point.
 */
import type { MirrorEventKind } from '@mirror/shared-types';

export type ConnectorId = string;

export type Collector = {
  /** Stable id used in events and in the consent screen. */
  id: string;
  /** The event kind it produces; must be an `api_item`. */
  kind: Extract<MirrorEventKind, 'api_item'>;
  /** What the person sees on the consent screen, in plain words. */
  plainLanguage: string;
  /** The scope(s) this collector needs; every one must appear in `scopes`. */
  scopes: string[];
  /** Why the API cannot answer this with fewer scopes, when that is not obvious. */
  scopeNote?: string;
};

export type Connector = {
  id: ConnectorId;
  /** Product name, used verbatim on the consent screen. */
  name: string;
  tier: 'A';
  origin: 'api';
  auth: 'oauth2';
  /** Exact scopes requested, in the order they are requested. Never a wildcard. */
  scopes: string[];
  /** Hosts this connector may contact. The network layer refuses all others. */
  hosts: string[];
  /** OAuth redirect; the scheme is owned by the app, so no web callback is needed. */
  redirectUri: string;
  collectors: Collector[];
  /** What the person can revoke, and how long the imported data is kept. */
  retention: { keepImportedEventsDays: number; revoke: 'one-tap'; deletesImportedEvents: boolean };
};

export type RefusedSource = {
  id: ConnectorId;
  name: string;
  reason: string;
};
