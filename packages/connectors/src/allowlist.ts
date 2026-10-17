/**
 * The extension allowlist.
 *
 * One list, two consumers: the manifest's `host_permissions` / `content_scripts`
 * matches (checked by tests/config.test.mjs) and the runtime check in the content
 * script, which refuses to run anywhere else even if the browser injects it. A
 * host added here is added to both, or the build fails.
 *
 * These are hosts where reading time and scroll depth are meaningful and where
 * the page structure is stable. Social feeds and private surfaces are deliberately
 * absent: they are the places where capture would become surveillance.
 */
export const EXTENSION_HOSTS = [
  'arxiv.org',
  'en.wikipedia.org',
  'www.youtube.com',
  'github.com',
  'developer.mozilla.org',
] as const;

export const EXTENSION_MATCH_PATTERNS = EXTENSION_HOSTS.map((host) => `https://${host}/*`);

/** Hosts that must never be captured, even if a person allow-lists a parent domain. */
export const NEVER_CAPTURE_HOSTS = [
  'mail.google.com',
  'web.whatsapp.com',
  'onlinebanking.example',
  'accounts.google.com',
  'login.microsoftonline.com',
];
