/**
 * **Reddit's own data export** — not the Reddit OAuth connector.
 *
 * This is the "connector export" P1b-2 means, and the distinction is the point:
 *
 *   | | tier | mechanism | phase |
 *   | --- | --- | --- | --- |
 *   | Reddit OAuth connector (`reddit`) | **A** | official API, scopes `read`/`save` | **P5** |
 *   | Reddit data export (`reddit-export`) | **B** | the ZIP Reddit gives the person | **P1b-2** |
 *
 * The file is requested at `reddit.com/settings/data-request` and arrives as a ZIP.
 * The person unzips it; Mirror reads the CSVs it contains. Recognised files:
 * `saved_posts.csv`, `saved_comments.csv`, `posts.csv`, `comments.csv`. Only
 * `saved_*` produce items by default, because a saved post is a signal of intent
 * and a posted comment is authorship — Mirror is not built to archive what
 * somebody wrote.
 *
 * Column names have changed across export versions, so the parser reads the
 * header rather than a fixed layout, and refuses a row it cannot understand
 * instead of importing a half-filled record.
 */
import { parseCsv } from './csv';
import type { ImportBundle, ParseResult, ParsedItem, ParseWarning, SourceParser } from './types';

const SAVED_FILES = ['saved_posts.csv', 'saved_comments.csv'];

type Row = Record<string, string>;

/** Reddit exports use `1234567890` or `1234567890.0` (UTC seconds, sometimes float). */
export function parseEpochSeconds(value: string | undefined): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const ms = seconds * 1000;
  // Sanity bound: Reddit was founded in 2005, and a timestamp in the future is a
  // corrupt row, not a prediction.
  if (ms < Date.UTC(2005, 0, 1) || ms > Date.now() + 86_400_000) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function titleOf(row: Row): string | null {
  const title = row.title?.trim();
  if (title && title.length > 0) return title;
  const body = row.body?.trim();
  if (body && body.length > 0) return body.slice(0, 280);
  const link = row.link_title?.trim();
  if (link && link.length > 0) return link;
  return null;
}

/** The stable identity Reddit itself uses: `t3_` for posts, `t1_` for comments. */
function canonicalIdOf(row: Row, kind: 'post' | 'comment'): string | null {
  const raw = row.id?.trim();
  if (raw) return `reddit:${kind}:${raw}`;
  const permalink = row.permalink?.trim();
  if (permalink) return `reddit:${kind}:${permalink}`;
  return null;
}

export const redditExport: SourceParser = {
  id: 'reddit-export',
  name: 'Reddit data export',
  plainLanguage: 'Posts and comments you saved, from the data export you requested from Reddit.',
  expects: SAVED_FILES,
  detect(bundle) {
    return bundle.files.some((file) => SAVED_FILES.includes(file.name.toLowerCase()));
  },
  parse(bundle: ImportBundle): ParseResult {
    const items: ParsedItem[] = [];
    const warnings: ParseWarning[] = [];
    let rowsSeen = 0;

    for (const file of bundle.files) {
      const name = file.name.toLowerCase();
      if (!SAVED_FILES.includes(name)) continue;
      const kind: 'post' | 'comment' = name.includes('comment') ? 'comment' : 'post';
      const table = parseCsv(file.text);
      if (table.header.length === 0) {
        warnings.push({ file: file.name, reason: 'empty file' });
        continue;
      }
      if (table.skipped > 0) warnings.push({ file: file.name, reason: `${table.skipped} row(s) had the wrong number of columns` });

      table.rows.forEach((row, index) => {
        rowsSeen += 1;
        const subject = titleOf(row);
        const at = parseEpochSeconds(row.created_utc ?? row.created);
        const canonicalId = canonicalIdOf(row, kind);
        if (!subject || !at || !canonicalId) {
          warnings.push({ file: file.name, row: index + 2, reason: !subject ? 'no title or body' : !at ? 'unreadable timestamp' : 'no id or permalink' });
          return;
        }
        items.push({ canonicalId, subject, at });
      });
    }

    if (rowsSeen === 0) warnings.push({ file: SAVED_FILES[0]!, reason: 'no rows found — is this the unzipped data export folder?' });

    items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.canonicalId.localeCompare(b.canonicalId));
    return { items, warnings, rowsSeen };
  },
};
