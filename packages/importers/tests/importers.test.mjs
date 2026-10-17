/**
 * packages/importers/tests/importers.test.mjs
 *
 * Two layers are tested on purpose:
 *   - the parsers, against the ugly things real exports contain (BOMs, quoted
 *     commas, CRLF, ragged rows, ads, split files, impossible timestamps);
 *   - the commit path, against a fake store *and* the real encrypted store, so
 *     "revoking deletes exactly what the import produced" is proven rather than
 *     asserted in a comment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const importers = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'importers.mjs') });
const ml = await bundleTs(join(PKG, '..', 'ml/src/index.ts'), { outfile: join(HERE, '.build', 'ml.mjs') });
const storeMod = await bundleTs(join(PKG, '..', 'store/src/index.ts'), { outfile: join(HERE, '.build', 'store.mjs'), external: [] });
const { NodeSqliteDriver, TEST_ROOT_KEY, counterRandom } = await bundleTs(join(PKG, '..', 'store/testing/node-driver.ts'), {
  outfile: join(HERE, '.build', 'driver.mjs'),
});

const { parseCsv, parseEpochSeconds, redditExport, googleTakeout, videoIdOf, preview, commit, exportConsentSubject, MAX_FILE_CHARS } = importers;

/* --------------------------------------------------------------- helpers ---- */

const hash = (value) => createHash('sha256').update(value).digest('hex');

function fakeStore({ grants = [], existing = [], reject = null } = {}) {
  const events = new Map();
  for (const h of existing) events.set(h, { id: `evt_${h.slice(0, 12)}`, item_hash: h });
  const imports = [];
  return {
    hashItems: (ids) => ids.map(hash),
    itemHashes: async (hashes) => hashes.filter((h) => events.has(h)),
    liveGrants: async () => new Map(grants.map((subject) => [subject, {}])),
    appendEvents: async (list) => {
      if (reject) return { inserted: 0, duplicate: 0, rejected: list.map((event) => ({ id: event.id, reason: reject })) };
      let inserted = 0;
      for (const event of list) {
        if (events.has(event.item_hash)) continue;
        events.set(event.item_hash, event);
        inserted += 1;
      }
      return { inserted, duplicate: list.length - inserted, rejected: [] };
    },
    recordImport: async (record) => {
      imports.push(record);
    },
    _events: events,
    _imports: imports,
  };
}

const csv = (...lines) => lines.join('\r\n');

const redditBundle = () => ({
  label: 'reddit-export-2026-10-01',
  files: [
    {
      name: 'saved_posts.csv',
      text: '\uFEFF' + csv(
        'id,title,created_utc,permalink',
        'abc123,"Zone system, part one",1759000000,/r/photography/abc123/',
        'def456,"A title with ""quotes"" inside",1759100000,/r/photography/def456/',
        'ghi789,"A title\nwith a newline",1759200000,/r/photography/ghi789/',
        'bad000,,1759300000,/r/photography/bad000/',
        'bad001,"No timestamp",not-a-number,/r/photography/bad001/',
      ),
    },
    {
      name: 'saved_comments.csv',
      text: csv('id,body,created_utc,permalink', 'cmt001,"A saved comment, with a comma",1759400000,/r/photography/comments/cmt001/'),
    },
    // Present in real exports, and deliberately ignored: Mirror imports saves,
    // not everything a person ever wrote.
    { name: 'posts.csv', text: csv('id,title,created_utc,permalink', 'own001,"Something I wrote",1759500000,/r/photography/own001/') },
  ],
});

const takeoutBundle = () => ({
  label: 'takeout-2026-10-01',
  files: [
    {
      name: 'watch-history.json',
      text: JSON.stringify([
        { header: 'YouTube', title: 'Watched Zone System, Part One', titleUrl: 'https://www.youtube.com/watch?v=abc123XYZ', time: '2026-09-30T19:41:03.119Z' },
        { header: 'YouTube', title: 'Watched An advertisement', titleUrl: 'https://www.youtube.com/watch?v=ad999', time: '2026-09-30T19:45:00Z', details: [{ name: 'From Google Ads' }] },
        { header: 'YouTube', title: 'Rangefinder basics', titleUrl: 'https://youtu.be/rf123456', time: '2026-09-29T08:00:00Z' },
        { header: 'YouTube', title: 'Watched Broken time', titleUrl: 'https://www.youtube.com/watch?v=bad000', time: 'yesterday' },
      ]),
    },
  ],
});

/* ------------------------------------------------------------------ CSV ----- */

test('CSV: quoted commas, escaped quotes, newlines, CRLF and a BOM', () => {
  const table = parseCsv('\uFEFFa,b,c\r\n"x,1","say ""hi""","two\nlines"\r\n');
  assert.deepEqual(table.header, ['a', 'b', 'c']);
  assert.equal(table.rows.length, 1);
  assert.deepEqual(table.rows[0], { a: 'x,1', b: 'say "hi"', c: 'two\nlines' });
  assert.equal(table.skipped, 0);
});

test('CSV: a ragged row is skipped and counted, never half-imported', () => {
  const table = parseCsv(csv('a,b', '1,2', '3', '4,5,6'));
  assert.equal(table.rows.length, 1);
  assert.equal(table.skipped, 2);
});

test('property: arbitrary text parses without throwing, and never invents fields', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 400 }), (text) => {
      const table = parseCsv(text);
      assert.ok(Array.isArray(table.rows));
      for (const row of table.rows) for (const name of Object.keys(row)) assert.ok(table.header.includes(name));
    }),
    { numRuns: 60 },
  );
});

/* --------------------------------------------------------------- reddit ----- */

test('Reddit: epoch seconds are bounded and normalised to ISO-UTC', () => {
  assert.equal(parseEpochSeconds('1759000000'), '2025-09-27T19:06:40Z');
  assert.equal(parseEpochSeconds('1759000000.0'), '2025-09-27T19:06:40Z');
  assert.equal(parseEpochSeconds('0'), null);
  assert.equal(parseEpochSeconds('yesterday'), null);
  assert.equal(parseEpochSeconds(String(Date.now() / 1000 + 999_999)), null, 'a future date is corruption, not a prediction');
  assert.equal(parseEpochSeconds('1000'), null, 'before Reddit existed');
});

test('Reddit: saves are imported, authored posts are not, bad rows become warnings', () => {
  const result = redditExport.parse(redditBundle());
  assert.equal(result.rowsSeen, 5 + 1);
  assert.deepEqual(
    result.items.map((item) => item.canonicalId),
    ['reddit:post:abc123', 'reddit:post:def456', 'reddit:post:ghi789', 'reddit:comment:cmt001'],
  );
  assert.equal(result.items[0].subject, 'Zone system, part one');
  assert.equal(result.items[1].subject, 'A title with "quotes" inside');
  assert.ok(result.items[2].subject.includes('\n'), 'a quoted newline survives');
  assert.equal(result.items[3].subject, 'A saved comment, with a comma');
  assert.ok(!result.items.some((item) => item.canonicalId.includes('own001')));
  const reasons = result.warnings.map((warning) => warning.reason);
  assert.ok(reasons.includes('no title or body'));
  assert.ok(reasons.includes('unreadable timestamp'));
  assert.equal(redditExport.detect(redditBundle()), true);
  assert.equal(redditExport.detect({ label: '', files: [{ name: 'watch-history.json', text: '[]' }] }), false);
});

test('Reddit: an empty export is a warning that names the likely mistake', () => {
  const result = redditExport.parse({ label: '', files: [{ name: 'saved_posts.csv', text: 'id,title,created_utc\n' }] });
  assert.equal(result.items.length, 0);
  assert.match(result.warnings.at(-1).reason, /no rows|unzipped/i);
});

/* --------------------------------------------------------------- takeout ---- */

test('Takeout: verb stripped, ads skipped, video id extracted, bad time refused', () => {
  const result = googleTakeout.parse(takeoutBundle());
  assert.equal(result.rowsSeen, 4);
  assert.deepEqual(result.items.map((item) => item.subject), ['Rangefinder basics', 'Zone System, Part One']);
  assert.deepEqual(result.items.map((item) => item.canonicalId), ['youtube:watch:rf123456', 'youtube:watch:abc123XYZ']);
  assert.equal(videoIdOf('https://www.youtube.com/watch?v=abc123XYZ&t=10'), 'abc123XYZ');
  assert.equal(videoIdOf('https://example.com/watch?v=abc'), null);
  const reasons = result.warnings.map((warning) => warning.reason);
  assert.ok(reasons.includes('advertisement entry skipped'));
  assert.ok(reasons.includes('unreadable timestamp'));
});

test('Takeout: a split or truncated file is reported, not guessed at', () => {
  const split = googleTakeout.parse({ label: '', files: [{ name: 'watch-history.json', text: '{"not":"an array"}' }] });
  assert.equal(split.items.length, 0);
  assert.match(split.warnings[0].reason, /not a JSON array/);
  const boms = googleTakeout.parse({ label: '', files: [{ name: 'WATCH-HISTORY.JSON', text: '\uFEFF[]' }] });
  assert.equal(boms.items.length, 0, 'extension matching is case-insensitive');
});

/* --------------------------------------------------------------- preview ---- */

test('preview: counts fresh vs duplicate, buckets by month, and writes nothing', async () => {
  const store = fakeStore();
  const result = await preview(redditExport, redditBundle(), store);
  assert.equal(result.total, 4);
  assert.equal(result.fresh, 4);
  assert.equal(result.duplicates, 0);
  assert.equal(result.firstAt, '2025-09-27T19:06:40Z');
  assert.equal(result.lastAt, '2025-10-02T10:13:20Z');
  assert.deepEqual(result.byMonth.map((bucket) => bucket.month), ['2025-09', '2025-10']);
  assert.equal(store._events.size, 0, 'preview must not import');
  assert.equal(store._imports.length, 0);
});

test('preview: items already imported are duplicates, and duplicates inside one file count once', async () => {
  const existing = [hash('reddit:post:abc123')];
  const store = fakeStore({ existing });
  const doubled = redditBundle();
  doubled.files[0].text += '\r\nabc123,"Zone system, part one",1759000000,/r/photography/abc123/';
  const result = await preview(redditExport, doubled, store);
  assert.equal(result.total, 5);
  assert.equal(result.fresh, 3);
  assert.equal(result.duplicates, 2);
});

test('preview: an oversized file is skipped with a warning that says what to do', async () => {
  const result = await preview(
    redditExport,
    { label: '', files: [{ name: 'saved_posts.csv', text: 'x'.repeat(500) }] },
    fakeStore(),
    { maxFileChars: 100 },
  );
  assert.equal(result.total, 0);
  assert.match(result.warnings[0].reason, /split the export/);
  assert.ok(MAX_FILE_CHARS > 1_000_000);
});

test('preview: warnings are capped, so a corrupt file cannot blow up the preview', async () => {
  const rows = ['id,title,created_utc,permalink'];
  for (let i = 0; i < 80; i += 1) rows.push(`bad${i},,1759000000,/r/x/bad${i}/`);
  const result = await preview(redditExport, { label: '', files: [{ name: 'saved_posts.csv', text: rows.join('\n') }] }, fakeStore());
  assert.equal(result.total, 0);
  assert.ok(result.warnings.length <= 41);
  assert.match(result.warnings.at(-1).reason, /suppressed/);
});

/* -------------------------------------------------------------- commit ------ */

test('commit: refuses without a live grant for the export subject', async () => {
  const store = fakeStore();
  const result = await commit(redditExport, redditBundle(), store, { now: Date.parse('2026-10-17T10:00:00Z') });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'no-consent');
  assert.equal(store._events.size, 0);
  assert.equal(exportConsentSubject('reddit-export'), 'export:reddit-export');
});

test('commit: writes tier-B import events with hashes and a provenance row', async () => {
  const store = fakeStore({ grants: [exportConsentSubject('reddit-export')] });
  const result = await commit(redditExport, redditBundle(), store, { now: Date.parse('2026-10-17T10:00:00Z') });
  assert.equal(result.status, 'imported');
  assert.equal(result.imported, 4);
  assert.equal(store._events.size, 4);
  const [event] = [...store._events.values()];
  assert.equal(event.tier, 'B');
  assert.equal(event.origin, 'export');
  assert.equal(event.content, 'content');
  assert.equal(event.consent, 'export:reddit-export');
  assert.match(event.item_hash, /^[0-9a-f]{64}$/);
  assert.match(event.id, /^imp_[0-9a-f]{40}$/);
  assert.equal(store._imports.length, 1);
  assert.equal(store._imports[0].item_count, 4);
  assert.equal(store._imports[0].consent_id, 'export:reddit-export');
});

test('commit: a second import of the same export is a refusal, not a duplicate write', async () => {
  const store = fakeStore({ grants: [exportConsentSubject('reddit-export')] });
  const first = await commit(redditExport, redditBundle(), store, { now: 1 });
  assert.equal(first.status, 'imported');
  const second = await commit(redditExport, redditBundle(), store, { now: 2 });
  assert.equal(second.status, 'refused');
  assert.equal(second.reason, 'nothing-new');
  assert.equal(store._events.size, 4);
  assert.equal(store._imports.length, 1);
});

test('commit: content switched off is reported as such, not as a silent zero', async () => {
  const store = fakeStore({
    grants: [exportConsentSubject('reddit-export')],
    reject: 'content events are off; the person has not opted in',
  });
  const result = await commit(redditExport, redditBundle(), store, { now: 1 });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'content-off');
  assert.equal(store._imports.length, 0);
});

test('commit: with an embedder, vectors are returned for the caller to store', async () => {
  const store = fakeStore({ grants: [exportConsentSubject('reddit-export')] });
  const result = await commit(redditExport, redditBundle(), store, { now: 1, embed: ml.embed });
  assert.equal(result.status, 'imported');
  assert.equal(result.vectors.length, 4);
  for (const { vector } of result.vectors) {
    assert.equal(vector.length, 384);
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.02, 'unit length within the validator tolerance');
  }
  for (const event of store._events.values()) assert.equal(event.topic_vector.length, 384);
});

test('commit: a parser that cannot recognise the files is a loud error, not an empty import', async () => {
  await assert.rejects(() => preview(googleTakeout, redditBundle(), fakeStore()), /does not recognise/);
});

/* ------------------------------------------------- real store integration --- */

test('end to end: import into the encrypted store, then revoke and prove it is gone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-import-'));
  const driver = NodeSqliteDriver.file(join(dir, 'mirror.db'));
  const keys = { keyId: async () => 'test-key-1', rootKey: async () => new Uint8Array(TEST_ROOT_KEY) };
  const s = new storeMod.MirrorStore({ driver, keys, random: counterRandom(), clock: () => Date.parse('2026-10-17T10:00:00Z'), allowContent: true });
  try {
    await s.open();
    const subject = exportConsentSubject('reddit-export');
    await s.appendConsent({
      id: 'cns_export_0001',
      at: '2026-10-17T09:00:00Z',
      action: 'granted',
      subject,
      tier: 'B',
      scopes: ['reddit-export'],
      promise: 'Mirror will read the export you selected and keep only what you confirm.',
      method: 'in_app',
      deletes_imported_events: false,
    });

    const result = await commit(redditExport, redditBundle(), s, { now: Date.parse('2026-10-17T10:00:00Z') });
    assert.equal(result.status, 'imported');
    assert.equal((await s.counts()).total, 4);
    assert.equal((await s.imports()).length, 1);

    const revoked = await s.revoke({
      id: 'cns_export_0002',
      at: '2026-10-17T11:00:00Z',
      subject,
      tier: 'B',
      scopes: ['reddit-export'],
      promise: 'Mirror will read the export you selected and keep only what you confirm.',
      method: 'in_app',
    });
    assert.equal(revoked.deletedEvents, 4, 'revocation deletes exactly the imported events');
    assert.equal((await s.counts()).total, 0);
    assert.equal((await s.imports()).length, 0);
  } finally {
    driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
