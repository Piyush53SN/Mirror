/**
 * A small RFC 4180 CSV reader.
 *
 * The alternative is a dependency, and a dependency that parses untrusted export
 * files is exactly the kind of thing this project should keep small and reviewable.
 * Handles quoted fields, escaped quotes, embedded commas and newlines, CRLF, and a
 * UTF-8 BOM (Google's exports have one).
 */
export type CsvTable = { header: string[]; rows: Record<string, string>[]; skipped: number };

/** Split into records, respecting quotes. Returns raw field arrays. */
export function parseCsvRows(text: string, { delimiter = ',' }: { delimiter?: string } = {}): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // A trailing blank line yields a single empty field; drop it.
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

/** Parse a table whose first row is a header. Column names are lower-cased. */
export function parseCsv(text: string, options: { delimiter?: string } = {}): CsvTable {
  const rows = parseCsvRows(text, options);
  if (rows.length === 0) return { header: [], rows: [], skipped: 0 };
  const header = (rows[0] ?? []).map((name) => name.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  let skipped = 0;
  for (const raw of rows.slice(1)) {
    if (raw.length !== header.length) {
      skipped += 1;
      continue;
    }
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = raw[index] ?? '';
    });
    out.push(record);
  }
  return { header, rows: out, skipped };
}
