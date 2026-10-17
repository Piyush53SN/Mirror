/**
 * The demo import, run through the real importers.
 *
 * The screen must not invent numbers. `DEMO_PREVIEW` is a frozen fixture, and
 * `tests/import.test.mjs` recomputes it with `preview()` on this exact bundle and
 * asserts the two are equal. If the parser or the bundle changes, the test fails
 * instead of the screen quietly showing yesterday's story.
 *
 * The hash below is **not** the store's HMAC: this is a demo fixture that never
 * touches disk, so a cheap deterministic digest is enough to model "already
 * imported". The real `ImportStorePort` is supplied by `@mirror/store`, which
 * keys HMAC-SHA256 with the per-install secret.
 */
import { MAX_FILE_CHARS, exportConsentSubject, googleTakeout, preview, redditExport, type ImportBundle, type Preview } from '@mirror/importers';
import type { ImportStorePort } from '@mirror/importers';

/** FNV-1a. Demo only — see the note above. */
export function demoHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** One saved post the demo pretends was already imported. */
export const DEMO_ALREADY_IMPORTED = 'reddit:post:t3_demo001';

const SAVED_POSTS = [
  't3_demo001,1754870400,askscience,Why is the sky blue at noon and red at dusk?',
  't3_demo002,1755043200,woodworking,Sharpening a card scraper without a jig',
  't3_demo003,1755216000,AskHistorians,How did medieval cities handle waste?',
  't3_demo004,1755388800,linux,The case for a boring window manager',
  't3_demo005,1755561600,bikewrench,Replacing a freewheel at home',
  't3_demo006,1755734400,askscience,What actually happens in a black hole merger?',
  't3_demo007,1755907200,woodworking,Dovetails by hand: a first attempt',
  't3_demo008,1756080000,movies,The quiet editing of slow cinema',
  't3_demo009,1756252800,linux,Why does my laptop suspend at 3am?',
  't3_demo010,1756425600,bikewrench,When to replace a chain instead of a cassette',
  't3_demo011,1756598400,AskHistorians,Bread riots and the price of grain',
  't3_demo012,1756771200,askscience,How do octopuses taste with their arms?',
  't3_demo013,1756944000,woodworking,Finishing oil vs. varnish on walnut',
  't3_demo014,1757116800,movies,Why film grain is coming back',
  't3_demo015,1757289600,linux,Reading a kernel oops without panic',
  't3_demo016,1757462400,bikewrench,A misaligned derailleur hanger',
  't3_demo017,1757635200,AskHistorians,The logistics of Roman roads',
  't3_demo018,1757808000,askscience,Why are flames orange and not blue?',
  't3_demo019,1757980800,woodworking,A sharpening station that fits a drawer',
  't3_demo020,1758153600,movies,The sound design of rain',
];

const SAVED_COMMENTS = [
  't1_demo101,1758240000,,"The trick is to sharpen the whole bevel, not just the edge."',
  't1_demo102,1758412800,,"I replaced mine after the chain checker said 0.75."',
];

/** A malformed row, kept on purpose: the screen must show a refusal, not hide it. */
const BAD_ROW = 't3_demo900,,linux,A row with no timestamp at all';

export function demoBundle(): ImportBundle {
  return {
    label: 'reddit-export-demo.zip (unzipped)',
    files: [
      {
        name: 'saved_posts.csv',
        text: ['id,created_utc,subreddit,title', ...SAVED_POSTS, BAD_ROW].join('\n'),
      },
      {
        name: 'saved_comments.csv',
        text: ['id,created_utc,subreddit,body', ...SAVED_COMMENTS].join('\n'),
      },
    ],
  };
}

/** An in-memory store: one item already imported, nothing else. */
export function demoStore(): ImportStorePort & { appended: number } {
  const existing = new Set([demoHash(DEMO_ALREADY_IMPORTED)]);
  const store = {
    appended: 0,
    hashItems: (ids: readonly string[]) => ids.map(demoHash),
    itemHashes: (hashes: readonly string[]) => hashes.filter((hash) => existing.has(hash)),
    liveGrants: async () => new Map([['export:reddit-export', { id: 'demo-grant' }]]),
    appendEvents: async (events: readonly unknown[]) => {
      store.appended += events.length;
      // A second commit in the same session must see the first one's hashes,
      // otherwise the demo would claim an import that never becomes a no-op.
      for (const event of events) {
        const hash = (event as { item_hash?: string }).item_hash;
        if (hash) existing.add(hash);
      }
      return { inserted: events.length, duplicate: 0, rejected: [] };
    },
    recordImport: async () => undefined,
  };
  return store;
}

/** The live preview — what the test recomputes. */
export function demoPreview(): Promise<Preview> {
  return preview(redditExport, demoBundle(), demoStore());
}

/**
 * The same preview, frozen. `tests/import.test.mjs` proves this equals
 * `demoPreview()`; do not edit by hand without running that test.
 */
export const DEMO_PREVIEW: Preview = {
  parserId: 'reddit-export',
  name: 'Reddit data export',
  total: 22,
  fresh: 21,
  duplicates: 1,
  firstAt: '2025-08-13T00:00:00Z',
  lastAt: '2025-09-21T00:00:00Z',
  byMonth: [
    { month: '2025-08', count: 10 },
    { month: '2025-09', count: 11 },
  ],
  warnings: [{ file: 'saved_posts.csv', row: 22, reason: 'unreadable timestamp' }],
};

/** Month range for the preview line, e.g. `Aug – Sep 2025`. */
export function monthRange(p: Pick<Preview, 'byMonth'>): string | null {
  if (p.byMonth.length === 0) return null;
  const first = p.byMonth[0]!.month;
  const last = p.byMonth[p.byMonth.length - 1]!.month;
  const label = (month: string) => {
    const [year, mm] = month.split('-');
    const name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1] ?? month;
    return `${name} ${year}`;
  };
  return first === last ? label(first) : `${label(first)} – ${label(last)}`;
}

/** The characters a single file may contain before Mirror refuses it. */
export const IMPORT_MAX_MILLIONS = Math.round(MAX_FILE_CHARS / 1_000_000);

/**
 * What a too-large file does, in one sentence — used by both the screen and the
 * test, so the copy cannot drift from the guard.
 */
export function oversizedFileSentence(name: string, sizeChars: number, maxFileChars = MAX_FILE_CHARS): string {
  if (sizeChars <= maxFileChars) return `Read whole: ${name} is under the ${IMPORT_MAX_MILLIONS} million character limit.`;
  return `Refused: ${name} is larger than ${IMPORT_MAX_MILLIONS} million characters. Split the export or request a shorter date range.`;
}

export { googleTakeout, redditExport, exportConsentSubject };
