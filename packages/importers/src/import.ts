/**
 * Preview → confirm → import.
 *
 * The shape is the privacy promise made usable: nothing is written until the
 * person has seen **what would be written** (how many items, which months, how
 * many are already here) and confirmed. `preview()` is read-only; `commit()` is
 * the only function that writes, and it refuses without a live grant.
 *
 * **Dedupe is by `item_hash`.** The identity of a saved post is HMAC-SHA256 under
 * a per-install key, so the store can answer "have I seen this before?" without
 * holding the id in the clear, and the same export imported twice is a no-op. The
 * event id is derived from that hash too, so even a preview/commit race converges.
 *
 * **The grant is the unit of deletion.** Every imported event cites
 * `export:<importer>`; revoking that subject removes exactly those events and
 * their `imports` rows. Nothing has to be scanned or decrypted to undo an import.
 */
import type { ParsedItem, Preview, SourceParser, ImportBundle, ParseWarning } from './types';

export type ImportStorePort = {
  /** HMAC-SHA256 of each canonical identity, keyed by the per-install secret. */
  hashItems(canonicalIds: readonly string[]): string[];
  /** Which of these hashes already exist in the store. */
  itemHashes(hashes: readonly string[]): Promise<readonly string[]> | readonly string[];
  liveGrants(): Promise<ReadonlyMap<string, unknown>>;
  appendEvents(events: readonly unknown[]): Promise<{ inserted: number; duplicate: number; rejected: { id: string; reason: string }[] }>;
  recordImport(record: {
    id: string;
    source_id: string;
    export_format: string;
    imported_at: string;
    item_count: number;
    consent_id: string;
  }): Promise<void>;
};

/** The consent subject an export import writes under. */
export function exportConsentSubject(parserId: string): string {
  return `export:${parserId}`;
}

/** Why a preview may still be refused at commit time. */
export type CommitRefusal = 'no-consent' | 'nothing-new' | 'content-off';

export type CommitResult =
  | { status: 'imported'; imported: number; duplicates: number; rejected: { id: string; reason: string }[]; importId: string; vectors: { eventId: string; vector: readonly number[] }[] }
  | { status: 'refused'; reason: CommitRefusal; detail?: string };

export type CommitOptions = ImportLimits & {
  now: number;
  /** Injected so the package stays dependency-free; `@mirror/ml` supplies it in the app. */
  embed?: (text: string) => readonly number[];
  /** Force a specific provenance id; otherwise it is derived from the batch. */
  importId?: string;
};

/** Guard on characters read, so a corrupt export cannot exhaust the phone's memory. */
export const MAX_FILE_CHARS = 64 * 1024 * 1024;

export type ImportLimits = {
  /** Overridable so a test can prove the guard without allocating 64 MB. */
  maxFileChars?: number;
};
const MAX_WARNINGS = 40;

/** A cheap FNV-1a fingerprint, used only for a stable import id. */
function fingerprint(parts: readonly string[]): string {
  let hash = 2166136261;
  const input = parts.join('\u0000');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function capWarnings(warnings: ParseWarning[]): ParseWarning[] {
  if (warnings.length <= MAX_WARNINGS) return warnings;
  const kept = warnings.slice(0, MAX_WARNINGS);
  kept.push({ file: warnings[MAX_WARNINGS]!.file, reason: `${warnings.length - MAX_WARNINGS} further warnings suppressed` });
  return kept;
}

/** Files that are too large to parse in memory are skipped, with a warning — not truncated. */
function gateFiles(bundle: ImportBundle, limits: ImportLimits = {}): { bundle: ImportBundle; warnings: ParseWarning[] } {
  const maxFileChars = limits.maxFileChars ?? MAX_FILE_CHARS;
  const warnings: ParseWarning[] = [];
  const files = bundle.files.filter((file) => {
    if (file.text.length <= maxFileChars) return true;
    warnings.push({ file: file.name, reason: `file is larger than ${Math.round(maxFileChars / 1_000_000)} M characters; split the export and try the part` });
    return false;
  });
  return { bundle: { ...bundle, files }, warnings };
}

const MONTH = (iso: string) => iso.slice(0, 7);

/**
 * What would happen if this bundle were imported now.
 *
 * Read-only by construction: it hashes and counts, and never appends.
 */
export async function preview(parser: SourceParser, bundle: ImportBundle, store: ImportStorePort, limits: ImportLimits = {}): Promise<Preview> {
  // Detection runs on the *original* bundle: an oversized file is why parsing is
  // gated, not evidence that this is the wrong export.
  if (!parser.detect(bundle)) {
    throw new Error(`${parser.name} does not recognise these files; expected ${parser.expects.join(', ')}`);
  }
  const gated = gateFiles(bundle, limits);
  const parsed = parser.parse(gated.bundle);
  const warnings = capWarnings([...gated.warnings, ...parsed.warnings]);

  const hashes = store.hashItems(parsed.items.map((item) => item.canonicalId));
  const existing = new Set(await store.itemHashes(hashes));

  const seen = new Set<string>();
  let duplicates = 0;
  const fresh: { item: ParsedItem; hash: string }[] = [];
  parsed.items.forEach((item, index) => {
    const hash = hashes[index]!;
    if (seen.has(hash) || existing.has(hash)) {
      duplicates += 1;
      return;
    }
    seen.add(hash);
    fresh.push({ item, hash });
  });

  const byMonth = new Map<string, number>();
  for (const { item } of fresh) byMonth.set(MONTH(item.at), (byMonth.get(MONTH(item.at)) ?? 0) + 1);
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));

  return {
    parserId: parser.id,
    name: parser.name,
    total: parsed.items.length,
    fresh: fresh.length,
    duplicates,
    firstAt: fresh.length > 0 ? fresh[0]!.item.at : null,
    lastAt: fresh.length > 0 ? fresh[fresh.length - 1]!.item.at : null,
    byMonth: months,
    warnings,
  };
}

/**
 * Commit the previewed import.
 *
 * Refusals are values, not exceptions: a missing grant is an expected answer, and
 * the caller shows it as a state rather than an error dialog.
 */
export async function commit(parser: SourceParser, bundle: ImportBundle, store: ImportStorePort, options: CommitOptions): Promise<CommitResult> {
  const subject = exportConsentSubject(parser.id);
  const grants = await store.liveGrants();
  if (!grants.has(subject)) return { status: 'refused', reason: 'no-consent', detail: `no live grant for ${subject}` };

  const summary = await preview(parser, bundle, store);
  if (summary.fresh === 0) return { status: 'refused', reason: 'nothing-new' };

  const parsed = parser.parse(gateFiles(bundle, options).bundle);
  const hashes = store.hashItems(parsed.items.map((item) => item.canonicalId));
  const existing = new Set(await store.itemHashes(hashes));
  const seen = new Set<string>();
  const at = new Date(options.now).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const events: Record<string, unknown>[] = [];
  const vectors: { eventId: string; vector: readonly number[] }[] = [];

  parsed.items.forEach((item, index) => {
    const hash = hashes[index]!;
    if (seen.has(hash) || existing.has(hash)) return;
    seen.add(hash);
    const id = `imp_${hash.slice(0, 40)}`;
    const vector = options.embed?.(item.subject);
    const event: Record<string, unknown> = {
      schema_version: 1,
      id,
      kind: 'import_item',
      at: item.at,
      tier: 'B',
      origin: 'export',
      content: 'content',
      consent: subject,
      source_id: parser.id,
      export_format: parser.id,
      subject: item.subject,
      item_hash: hash,
    };
    if (vector) {
      event.topic_vector = vector;
      vectors.push({ eventId: id, vector });
    }
    events.push(event);
  });

  // A commit with nothing fresh left after the second hash pass (another import
  // won the race) must still be a refusal, not an empty successful import.
  if (events.length === 0) return { status: 'refused', reason: 'nothing-new' };

  const appended = await store.appendEvents(events);
  if (appended.inserted === 0) {
    const contentOff = appended.rejected.some((rejection) => /content/.test(rejection.reason));
    return {
      status: 'refused',
      reason: contentOff ? 'content-off' : 'nothing-new',
      detail: appended.rejected[0]?.reason,
    };
  }

  const importId = options.importId ?? `imp_${fingerprint([parser.id, subject, ...events.map((event) => String(event.item_hash))])}`;
  await store.recordImport({
    id: importId,
    source_id: parser.id,
    export_format: parser.id,
    imported_at: at,
    item_count: appended.inserted,
    consent_id: subject,
  });

  return { status: 'imported', imported: appended.inserted, duplicates: appended.duplicate, rejected: appended.rejected, importId, vectors };
}
