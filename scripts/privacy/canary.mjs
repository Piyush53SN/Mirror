/**
 * scripts/privacy/canary.mjs
 *
 * Privacy canary scanner — detects when synthetic canary tokens leak out of
 * the device via any encoding. Used by tests/privacy.test.mjs and by the
 * mitmproxy + Playwright canary in CI.
 *
 * The file was previously gitignored by a broad `privacy/` pattern. It is now
 * tracked; only top-level `/privacy/` reports remain ignored.
 */

import { randomBytes } from 'node:crypto';

export const CANARY_MARKER = 'MRRCANARY';

/**
 * Generate `n` random canary tokens, each `MRRCANARY-` + 12 hex chars.
 * Uniqueness across calls is probabilistic (48 bits of entropy) but
 * effectively guaranteed for the small `n` used in tests.
 */
export function makeCanaries(n) {
  const out = [];
  const seen = new Set();
  while (out.length < n) {
    const hex = randomBytes(6).toString('hex'); // 12 hex chars
    const token = `${CANARY_MARKER}-${hex}`;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * Deterministic canaries for tests and docs.
 * For each input string, take its lowercased alphanumeric chars, truncate to
 * 12, pad with `0`. This matches the existing test expectation:
 *   canariesFrom(['a b'])[0] === 'MRRCANARY-ab0000000000'
 */
export function canariesFrom(inputs) {
  return inputs.map((raw) => {
    const alnum = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
    const base = alnum.slice(0, 12).padEnd(12, '0');
    return `${CANARY_MARKER}-${base}`;
  });
}

/**
 * All encoded forms of a token that the scanner should recognise.
 * Returns [{encoding, value}, ...]
 */
export function encodedForms(token) {
  const forms = [];
  forms.push({ encoding: 'raw', value: token });
  try {
    forms.push({ encoding: 'base64', value: Buffer.from(token, 'utf8').toString('base64') });
  } catch {}
  try {
    forms.push({ encoding: 'base64url', value: Buffer.from(token, 'utf8').toString('base64url') });
  } catch {}
  try {
    forms.push({ encoding: 'hex', value: Buffer.from(token, 'utf8').toString('hex') });
  } catch {}
  try {
    const url = encodeURIComponent(token);
    // Include even if unchanged — the scanner still handles it, and the test
    // for "every encoded form" expects it to be present.
    forms.push({ encoding: 'url', value: url });
  } catch {}
  // UTF-16LE raw bytes as a string are not a stable "form" for direct matching,
  // but the scanner decodes them, so we include a base64-of-utf16le variant
  // to exercise the nested path (base64 -> utf16le).
  try {
    const utf16 = Buffer.from(token, 'utf16le');
    forms.push({ encoding: 'base64', value: utf16.toString('base64') });
  } catch {}
  return forms;
}

/**
 * Attempt to decode `text` as various encodings, returning an array of
 * successfully decoded printable strings. Used by the dedicated test and
 * internally by scanText.
 *
 * For binary noise (e.g. "\xff\xfe\x00") it returns [].
 */
export function decodeBlobs(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Printable ASCII check — we don't want to return binary garbage.
  const isPrintable = (s) => {
    if (!s) return false;
    // Allow common whitespace, but require mostly printable
    // At least 4 printable chars and no excessive nulls
    if (s.includes('\u0000') && s.length < 10) {
      // Could still be utf16le text with nulls; check if stripping nulls yields printable
      const stripped = s.replace(/\u0000/g, '');
      return stripped.length >= 4 && /^[\x20-\x7E\s]+$/.test(stripped);
    }
    return s.length >= 4 && /^[\x20-\x7E\s]+$/.test(s);
  };

  // base64 (full string)
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length >= 8) {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length >= 4) {
        const s = buf.toString('utf8');
        if (isPrintable(s)) out.push(s);
        const s16 = buf.toString('utf16le');
        if (isPrintable(s16) && s16 !== s) out.push(s16);
      }
    }
  } catch {}

  // base64url
  try {
    if (/^[A-Za-z0-9_-]+$/.test(trimmed) && trimmed.length >= 8) {
      const buf = Buffer.from(trimmed, 'base64url');
      if (buf.length >= 4) {
        const s = buf.toString('utf8');
        if (isPrintable(s)) out.push(s);
      }
    }
  } catch {}

  // hex
  try {
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0 && trimmed.length >= 8) {
      const buf = Buffer.from(trimmed, 'hex');
      if (buf.length >= 4) {
        const s = buf.toString('utf8');
        if (isPrintable(s)) out.push(s);
      }
    }
  } catch {}

  // url
  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded !== trimmed && isPrintable(decoded)) out.push(decoded);
  } catch {}

  return out;
}

/**
 * Internal: collect candidate strings to check for canaries from a single
 * input value (string or Buffer). Each candidate carries the encoding that
 * produced it, so findings can report how the token was hidden.
 */
function collectCandidates(value) {
  const candidates = [];

  const add = (text, encoding) => {
    if (typeof text === 'string' && text.length > 0) {
      candidates.push({ text, encoding });
    }
  };

  if (Buffer.isBuffer(value)) {
    // Raw UTF-8 view
    add(value.toString('utf8'), 'raw');
    // UTF-16LE view — critical for the UTF-16LE test
    add(value.toString('utf16le'), 'utf16le');
    // Also try to interpret buffer as base64 text that itself contains utf16le
    // (e.g. Buffer.from(utf16leBytes).toString('base64') passed as string elsewhere
    // is handled in the string path, but we keep this for completeness)
    return candidates;
  }

  if (typeof value !== 'string') return candidates;

  const str = value;
  add(str, 'raw');

  // URL decode whole string and substrings
  try {
    const decoded = decodeURIComponent(str);
    if (decoded !== str) add(decoded, 'url');
  } catch {}

  // Also decode percent-encoded sequences individually via regex
  const urlRegex = /%[0-9A-Fa-f]{2}/g;
  if (urlRegex.test(str)) {
    try {
      const decoded = decodeURIComponent(str);
      if (decoded !== str) add(decoded, 'url');
    } catch {}
  }

  // Full-string decodings
  // base64
  try {
    if (/^[A-Za-z0-9+/=\s]+$/.test(str.trim()) && str.trim().length >= 8) {
      const buf = Buffer.from(str.trim(), 'base64');
      if (buf.length >= 4) {
        add(buf.toString('utf8'), 'base64');
        add(buf.toString('utf16le'), 'base64');
      }
    }
  } catch {}

  // base64url (full) — only if URL-safe chars present
  try {
    const t = str.trim();
    if ((t.includes('-') || t.includes('_')) && /^[A-Za-z0-9_-]+$/.test(t) && t.length >= 8) {
      const buf = Buffer.from(t, 'base64url');
      if (buf.length >= 4) {
        add(buf.toString('utf8'), 'base64url');
        add(buf.toString('utf16le'), 'base64url');
      }
    }
  } catch {}

  // hex (full)
  try {
    const t = str.trim();
    if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0 && t.length >= 8) {
      const buf = Buffer.from(t, 'hex');
      if (buf.length >= 4) add(buf.toString('utf8'), 'hex');
    }
  } catch {}

  // Substring extraction — this is what catches "Basic <base64>" and hex dumps
  // inside larger strings.
  const b64Re = /[A-Za-z0-9+/]{20,}={0,2}/g;
  for (const m of str.matchAll(b64Re)) {
    const chunk = m[0];
    try {
      const buf = Buffer.from(chunk, 'base64');
      if (buf.length < 4) continue;
      add(buf.toString('utf8'), 'base64');
      const s16 = buf.toString('utf16le');
      if (s16 !== buf.toString('utf8')) add(s16, 'base64');
    } catch {}
  }

  const b64urlRe = /[A-Za-z0-9_-]{20,}={0,2}/g;
  for (const m of str.matchAll(b64urlRe)) {
    const chunk = m[0];
    // Only treat as base64url if it actually uses URL-safe chars or
    // fails standard base64 alphabet. Otherwise we'd double-report the
    // same blob as both base64 and base64url.
    if (!chunk.includes('-') && !chunk.includes('_')) continue;
    try {
      const buf = Buffer.from(chunk, 'base64url');
      if (buf.length < 4) continue;
      add(buf.toString('utf8'), 'base64url');
      const s16 = buf.toString('utf16le');
      if (s16 !== buf.toString('utf8')) add(s16, 'base64url');
    } catch {}
  }

  const hexRe = /[0-9a-fA-F]{20,}/g;
  for (const m of str.matchAll(hexRe)) {
    const chunk = m[0];
    if (chunk.length % 2 !== 0) continue;
    try {
      const buf = Buffer.from(chunk, 'hex');
      if (buf.length < 4) continue;
      add(buf.toString('utf8'), 'hex');
    } catch {}
  }

  return candidates;
}

/**
 * Scan a single text/buffer value for canary tokens.
 * Returns [{token, encoding, location}, ...] — one per encoding per token.
 */
export function scanText(value, canaries, location = '') {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' && value.length === 0) return [];
  if (!Array.isArray(canaries) || canaries.length === 0) return [];

  const candidates = collectCandidates(value);
  const findings = [];
  const seen = new Set();

  for (const cand of candidates) {
    for (const token of canaries) {
      if (cand.text.includes(token)) {
        const key = `${token}|${cand.encoding}|${location}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ token, encoding: cand.encoding, location });
        }
      }
    }
  }

  return findings;
}

/**
 * Recursively scan any JS value (object, array, Buffer, string) for canaries,
 * building a JSON-path-like location string.
 */
export function scanValue(value, canaries, base = '$') {
  const findings = [];

  const walk = (val, loc) => {
    if (val === null || val === undefined) return;
    if (typeof val === 'string' || Buffer.isBuffer(val)) {
      findings.push(...scanText(val, canaries, loc));
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((el, i) => walk(el, `${loc}[${i}]`));
      return;
    }
    if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        // JSON-path: $.a.b, but escape if needed — keep simple
        const next = loc === '$' ? `$.${k}` : `${loc}.${k}`;
        walk(v, next);
      }
    }
  };

  walk(value, base);
  return findings;
}

export function emptyTranscript() {
  return {
    requests: [],
    logs: [],
    errors: [],
    files: [],
    console: [],
  };
}

/**
 * Scan a transcript (as produced by the mitmproxy canary) for leaks.
 * Locations match the expectations in tests/privacy.test.mjs:
 *   request[0].body, request[1].url, request[2].headers.x-meta,
 *   log[0], errorReport[0], file[0].content, console[0]
 */
export function scanTranscript(transcript, canaries) {
  const findings = [];
  if (!transcript || typeof transcript !== 'object') return findings;

  if (Array.isArray(transcript.requests)) {
    transcript.requests.forEach((req, i) => {
      if (!req) return;
      if (typeof req.url === 'string') {
        findings.push(...scanText(req.url, canaries, `request[${i}].url`));
      }
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        findings.push(...scanText(req.body, canaries, `request[${i}].body`));
      }
      if (req.headers && typeof req.headers === 'object') {
        for (const [hk, hv] of Object.entries(req.headers)) {
          findings.push(...scanText(hv, canaries, `request[${i}].headers.${hk}`));
        }
      }
    });
  }

  if (Array.isArray(transcript.logs)) {
    transcript.logs.forEach((l, i) => {
      findings.push(...scanText(l, canaries, `log[${i}]`));
    });
  }

  if (Array.isArray(transcript.errors)) {
    transcript.errors.forEach((e, i) => {
      findings.push(...scanText(e, canaries, `errorReport[${i}]`));
    });
  }

  if (Array.isArray(transcript.files)) {
    transcript.files.forEach((f, i) => {
      if (f && typeof f.content === 'string') {
        findings.push(...scanText(f.content, canaries, `file[${i}].content`));
      } else if (f && Buffer.isBuffer(f.content)) {
        findings.push(...scanText(f.content, canaries, `file[${i}].content`));
      }
    });
  }

  if (Array.isArray(transcript.console)) {
    transcript.console.forEach((c, i) => {
      findings.push(...scanText(c, canaries, `console[${i}]`));
    });
  }

  return findings;
}

/**
 * Describe a finding without echoing the whole token (to avoid the report
 * itself becoming a leak).
 */
export function describeFinding(finding) {
  const loc = finding.location || '(unknown)';
  const enc = finding.encoding || 'raw';
  const token = finding.token || '';
  // Show only first 4 chars + masked rest
  const masked = token.length > 4 ? `${token.slice(0, 4)}***${token.slice(-2)}` : '***';
  return `canary ${masked} leaked at ${loc} via ${enc}`;
}
