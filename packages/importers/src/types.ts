/**
 * Importer contracts.
 *
 * Every source is **tier B**: data the person downloaded themselves, under their
 * own right to data portability. That matters for two reasons — the privacy model
 * (a user export is an allowed source, scraping is not) and the consent model (a
 * tier-B event must cite a grant, so an import is never anonymous).
 *
 * Files arrive already extracted. Mirror does not ship a ZIP reader in P1b-2: the
 * person unzips the export and picks the folder, which is honest, has no
 * dependency, and keeps a parser for a container format out of the attack surface.
 */
export type ImportFile = { name: string; text: string };

export type ImportBundle = {
  /** What the importer is looking at, for the preview header. */
  label: string;
  files: ImportFile[];
};

export type ParsedItem = {
  /** Canonical identity, e.g. `reddit:saved:t3_abc123`. Hashed before storage. */
  canonicalId: string;
  /** What the item was about. Content — sealed at rest. */
  subject: string;
  /** ISO-8601 UTC. */
  at: string;
};

export type ParseWarning = { file: string; row?: number; reason: string };

export type ParseResult = {
  items: ParsedItem[];
  warnings: ParseWarning[];
  /** How many rows the parser saw, including the ones it refused. */
  rowsSeen: number;
};

export type SourceParser = {
  /** Stable id: `google-takeout`, `reddit-export`. */
  id: string;
  /** Product name for the UI. */
  name: string;
  /** Plain-language description of what is read. */
  plainLanguage: string;
  /** Which files this parser needs; used to tell the person what to select. */
  expects: string[];
  /** Cheap check: does this bundle look like mine? */
  detect(bundle: ImportBundle): boolean;
  parse(bundle: ImportBundle): ParseResult;
};

export type Preview = {
  parserId: string;
  name: string;
  total: number;
  /** New items, i.e. not already hashed by a previous import. */
  fresh: number;
  duplicates: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Month bucket → count, oldest first. */
  byMonth: { month: string; count: number }[];
  warnings: ParseWarning[];
};
