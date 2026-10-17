/**
 * The registry, and the refusal list.
 *
 * Scope choices are deliberately narrow. Where a provider offers a broader scope
 * that would also work, the narrow one is used and the reason recorded, because
 * "it would also work" is how permission creep starts.
 */
import type { Connector, RefusedSource } from './types';

export const CONNECTORS: Connector[] = [
  {
    id: 'reddit',
    name: 'Reddit',
    tier: 'A',
    origin: 'api',
    auth: 'oauth2',
    // `save` is required to read the saved list; `read` is required for posts.
    scopes: ['read', 'save'],
    hosts: ['oauth.reddit.com', 'www.reddit.com'],
    redirectUri: 'mirror://oauth/reddit',
    collectors: [
      { id: 'saved-posts', kind: 'api_item', plainLanguage: 'Posts and comments you saved', scopes: ['read', 'save'] },
      { id: 'joined-communities', kind: 'api_item', plainLanguage: 'Communities you joined', scopes: ['read'] },
    ],
    retention: { keepImportedEventsDays: 180, revoke: 'one-tap', deletesImportedEvents: true },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    tier: 'A',
    origin: 'api',
    auth: 'oauth2',
    // `youtube.readonly` is a restricted Google scope. Mirror asks only for it,
    // never for upload, comment or watch-history scopes.
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    hosts: ['oauth2.googleapis.com', 'www.googleapis.com'],
    redirectUri: 'mirror://oauth/youtube',
    collectors: [
      { id: 'liked-videos', kind: 'api_item', plainLanguage: 'Videos you liked', scopes: ['https://www.googleapis.com/auth/youtube.readonly'] },
      { id: 'playlists', kind: 'api_item', plainLanguage: 'Playlists you made', scopes: ['https://www.googleapis.com/auth/youtube.readonly'], scopeNote: 'The API returns liked videos and playlists under one read-only scope; there is no narrower option.' },
    ],
    retention: { keepImportedEventsDays: 180, revoke: 'one-tap', deletesImportedEvents: true },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    tier: 'A',
    origin: 'api',
    auth: 'oauth2',
    scopes: ['user-library-read', 'user-top-read', 'playlist-read-private'],
    hosts: ['accounts.spotify.com', 'api.spotify.com'],
    redirectUri: 'mirror://oauth/spotify',
    collectors: [
      { id: 'liked-songs', kind: 'api_item', plainLanguage: 'Albums you saved', scopes: ['user-library-read'] },
      { id: 'top-artists', kind: 'api_item', plainLanguage: 'Your most-played artists', scopes: ['user-top-read'] },
      { id: 'private-playlists', kind: 'api_item', plainLanguage: 'Your private playlists', scopes: ['playlist-read-private'] },
    ],
    retention: { keepImportedEventsDays: 180, revoke: 'one-tap', deletesImportedEvents: true },
  },
  {
    id: 'github',
    name: 'GitHub',
    tier: 'A',
    origin: 'api',
    auth: 'oauth2',
    // Public data only: Mirror does not ask for repo, org or notification scopes.
    scopes: ['read:user'],
    hosts: ['github.com', 'api.github.com'],
    redirectUri: 'mirror://oauth/github',
    collectors: [{ id: 'starred-repos', kind: 'api_item', plainLanguage: 'Repositories you starred', scopes: ['read:user'] }],
    retention: { keepImportedEventsDays: 180, revoke: 'one-tap', deletesImportedEvents: true },
  },
];

/**
 * Sources Mirror will not connect, with the reason a person can read.
 *
 * This list is part of the product: a connector request that lands here cannot
 * be implemented by scraping, by an unofficial client, or by asking for the
 * account password. Adding a source means finding an official API, not finding a
 * workaround.
 */
export const REFUSED_SOURCES: RefusedSource[] = [
  { id: 'instagram-saved', name: 'Instagram saved posts', reason: 'No official API exposes a person’s saved posts; the only routes are scraping or an unofficial client.' },
  { id: 'netflix-viewing', name: 'Netflix viewing history', reason: 'Netflix publishes no personal viewing-history API.' },
  { id: 'tiktok-history', name: 'TikTok watch history', reason: 'TikTok’s API covers publishing and analytics for creators, not personal watch history.' },
  { id: 'whatsapp-messages', name: 'WhatsApp messages', reason: 'Message content is not behaviour Mirror measures, and there is no API for it.' },
  { id: 'bank-transactions', name: 'Bank transactions', reason: 'Spending is not in scope, and open-banking access would collect far more than Mirror needs.' },
];
