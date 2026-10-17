/**
 * Google Takeout — YouTube watch history.
 *
 * Takeout ships `watch-history.json`: a JSON array whose entries look like
 *
 *   { "header": "YouTube", "title": "Watched Zone System, Part One",
 *     "titleUrl": "https://www.youtube.com/watch?v=abc123",
 *     "time": "2026-09-30T19:41:03.119Z",
 *     "subtitles": [{ "name": "Ansel Adams" }] }
 *
 * Two honest notes:
 *   - entries that are ads (`details: [{"name": "From Google Ads"}]`) are counted
 *     and skipped. They are not something the person chose to watch.
 *   - a `title` that starts with "Watched " has the verb stripped, because storing
 *     the verb wastes the embedding and reads badly in a preview.
 */
import type { ImportBundle, ParseResult, ParsedItem, ParseWarning, SourceParser } from './types';

const FILE_NAMES = ['watch-history.json'];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** YouTube video id from a URL, when there is one. */
export function videoIdOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1) || null;
    const id = parsed.searchParams.get('v');
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function readEntries(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const googleTakeout: SourceParser = {
  id: 'google-takeout',
  name: 'Google Takeout',
  plainLanguage: 'YouTube watch history, from the Takeout archive you requested from Google.',
  expects: FILE_NAMES,
  detect(bundle) {
    return bundle.files.some((file) => FILE_NAMES.includes(file.name.toLowerCase()));
  },
  parse(bundle: ImportBundle): ParseResult {
    const items: ParsedItem[] = [];
    const warnings: ParseWarning[] = [];
    let rowsSeen = 0;

    for (const file of bundle.files) {
      if (!FILE_NAMES.includes(file.name.toLowerCase())) continue;
      const entries = readEntries(file.text);
      if (entries === null) {
        warnings.push({ file: file.name, reason: 'not a JSON array — Takeout may split history into parts' });
        continue;
      }
      entries.forEach((entry, index) => {
        rowsSeen += 1;
        const row = entry as Record<string, unknown>;
        const details = Array.isArray(row.details) ? row.details : [];
        const fromAds = details.some((detail) => typeof detail === 'object' && detail !== null && String((detail as Record<string, unknown>).name ?? '').includes('Google Ads'));
        if (fromAds) {
          warnings.push({ file: file.name, row: index + 1, reason: 'advertisement entry skipped' });
          return;
        }
        const rawTitle = typeof row.title === 'string' ? row.title.trim() : '';
        const title = rawTitle.replace(/^Watched\s+/i, '').replace(/^Viewed\s+/i, '').trim();
        const time = typeof row.time === 'string' ? row.time : '';
        if (!title) {
          warnings.push({ file: file.name, row: index + 1, reason: 'no title' });
          return;
        }
        if (!ISO.test(time)) {
          warnings.push({ file: file.name, row: index + 1, reason: 'unreadable timestamp' });
          return;
        }
        const videoId = videoIdOf(typeof row.titleUrl === 'string' ? row.titleUrl : undefined);
        items.push({
          canonicalId: videoId ? `youtube:watch:${videoId}` : `youtube:title:${title.toLowerCase()}`,
          subject: title,
          at: time.replace(/\.\d{3}Z$/, 'Z'),
        });
      });
    }

    if (rowsSeen === 0) warnings.push({ file: FILE_NAMES[0]!, reason: 'no entries found — is this the YouTube folder from Takeout?' });

    items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.canonicalId.localeCompare(b.canonicalId));
    return { items, warnings, rowsSeen };
  },
};
