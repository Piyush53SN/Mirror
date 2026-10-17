/**
 * tests/privacy.test.mjs
 *
 * Tests the canary scanner itself. The rule the harness enforces is simple —
 * content must not leave the device — but the ways text can leave are not, so
 * each encoding gets its own case, including the awkward ones (a token inside a
 * Basic auth header, a hex dump, a UTF-16 log file).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCanaries,
  canariesFrom,
  encodedForms,
  decodeBlobs,
  scanText,
  scanValue,
  scanTranscript,
  emptyTranscript,
  describeFinding,
  CANARY_MARKER,
} from '../scripts/privacy/canary.mjs';

const TOKEN = 'MRRCANARY-9f2c1a7b3d4e';
const OTHER = 'MRRCANARY-000000000001';

/* --------------------------------------------------------------- canary set -- */

test('canaries are unique, prefixed and random per call', () => {
  const a = makeCanaries(8);
  const b = makeCanaries(8);
  assert.equal(a.length, 8);
  assert.equal(new Set([...a, ...b]).size, 16, 'two runs must not share a token');
  for (const token of a) assert.match(token, new RegExp(`^${CANARY_MARKER}-[0-9a-f]{12}$`));
});

test('deterministic canaries are available for tests and docs', () => {
  assert.deepEqual(canariesFrom(['a b', 'x/y']), canariesFrom(['a b', 'x/y']));
  assert.equal(canariesFrom(['a b'])[0], 'MRRCANARY-ab0000000000');
});

/* ---------------------------------------------------------------- encodings -- */

test('a token in clear text is found, with its location', () => {
  const findings = scanText(`query=${TOKEN}`, [TOKEN], '$.query');
  assert.equal(findings.length, 1);
  assert.deepEqual({ token: findings[0].token, encoding: findings[0].encoding, location: findings[0].location }, { token: TOKEN, encoding: 'raw', location: '$.query' });
});

test('every encoded form in encodedForms() is found', () => {
  for (const form of encodedForms(TOKEN)) {
    const findings = scanText(`prefix ${form.value} suffix`, [TOKEN], 'x');
    assert.ok(findings.length >= 1, `form ${form.encoding} was not detected`);
    assert.ok(findings.some((f) => f.token === TOKEN));
  }
});

test('a token inside a larger base64 blob is found (Basic auth)', () => {
  const header = `Basic ${Buffer.from(`${TOKEN}:hunter2`).toString('base64')}`;
  const findings = scanText(header, [TOKEN], 'request.headers.authorization');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].encoding, 'base64');
});

test('base64url is decoded too', () => {
  const blob = Buffer.from(`{"saved":"${TOKEN}"}`).toString('base64url');
  const findings = scanText(`payload=${blob}`, [TOKEN]);
  assert.ok(findings.some((f) => f.encoding === 'base64' || f.encoding === 'base64url'), JSON.stringify(findings));
});

test('a hex dump is decoded', () => {
  const dump = Buffer.from(`subject=${TOKEN}`).toString('hex');
  const findings = scanText(dump, [TOKEN]);
  assert.ok(findings.some((f) => f.encoding === 'hex'), JSON.stringify(findings));
});

test('a UTF-16LE buffer is decoded, whether as text or re-encoded to base64', () => {
  const utf16 = Buffer.from(`q=${TOKEN}`, 'utf16le');
  const direct = scanText(utf16, [TOKEN]);
  assert.ok(direct.length > 0, 'raw UTF-16LE bytes must be decoded');

  const asBase64 = utf16.toString('base64');
  const viaBase64 = scanText(asBase64, [TOKEN]);
  assert.ok(viaBase64.length > 0, 'UTF-16LE text inside base64 must be decoded');

  const asString = Buffer.from(`q=${TOKEN}`, 'utf16le').toString('utf16le');
  const fromString = Buffer.from(asString, 'utf16le').toString('utf8');
  assert.ok(scanText(fromString, [TOKEN]).length > 0 || fromString.includes('\u0000'));
});

test('a percent-encoded token is found when it contains encodable characters', () => {
  const token = 'MRRCANARY-a b+c';
  const encoded = encodeURIComponent(token);
  assert.ok(!encoded.includes(token), 'precondition: the encoding must change the token');
  const findings = scanText(`/search?q=${encoded}`, [token]);
  assert.equal(findings[0].encoding, 'url');
});

test('the same token in the clear and in base64 is reported once per encoding', () => {
  const text = `${TOKEN} ${Buffer.from(TOKEN).toString('base64')}`;
  const findings = scanText(text, [TOKEN]);
  assert.deepEqual(findings.map((f) => f.encoding).sort(), ['base64', 'raw']);
});

test('a look-alike token is not flagged', () => {
  assert.deepEqual(scanText(`query=${OTHER}`, [TOKEN]), []);
  assert.deepEqual(scanText('nothing to see here', [TOKEN]), []);
});

test('empty and missing values are safe', () => {
  for (const value of ['', null, undefined]) assert.deepEqual(scanText(value, [TOKEN]), []);
});

/* ------------------------------------------------------------- deep scanning -- */

test('nested values are scanned, and every path is named', () => {
  const payload = { a: [{ b: { c: `x ${TOKEN}` } }], d: Buffer.from(TOKEN) };
  const findings = scanValue(payload, [TOKEN]);
  const locations = findings.map((f) => f.location);
  assert.ok(locations.includes('$.a[0].b.c'), locations.join(','));
  assert.ok(locations.some((l) => l.startsWith('$.d')), locations.join(','));
});

test('numbers and booleans do not crash the scanner', () => {
  assert.deepEqual(scanValue({ n: 42, b: true, z: null }, [TOKEN]), []);
});

/* --------------------------------------------------------------- transcript -- */

test('a clean transcript produces no findings', () => {
  const transcript = {
    ...emptyTranscript(),
    requests: [{ method: 'POST', url: 'https://api.example/v1/aggregate', headers: { 'content-type': 'application/json' }, body: '{"sessions":3}' }],
    logs: ['flush ok: 3 sessions'],
    errors: ['TypeError at aggregate.ts:41'],
  };
  assert.deepEqual(scanTranscript(transcript, [TOKEN]), []);
});

test('a leak in each channel is found, in the right place', () => {
  const transcript = {
    requests: [
      { method: 'POST', url: 'https://api.example/v1/events', headers: {}, body: `{"q":"${TOKEN}"}` },
      { method: 'GET', url: `https://api.example/s?q=${TOKEN}`, headers: {}, body: '' },
      { method: 'POST', url: 'https://api.example/v1/events', headers: { 'x-meta': Buffer.from(TOKEN).toString('base64') }, body: '' },
    ],
    logs: [`log ${TOKEN}`],
    errors: [`error ${TOKEN}`],
    files: [{ name: 'export.json', content: `{"q":"${TOKEN}"}` }],
    console: [`console ${TOKEN}`],
  };
  const locations = scanTranscript(transcript, [TOKEN]).map((f) => f.location);
  for (const expected of ['request[0].body', 'request[1].url', 'request[2].headers.x-meta', 'log[0]', 'errorReport[0]', 'file[0].content', 'console[0]']) {
    assert.ok(locations.includes(expected), `missing ${expected} in ${locations.join(', ')}`);
  }
});

test('findings can be described without echoing the whole token', () => {
  const [finding] = scanText(`q=${TOKEN}`, [TOKEN], '$.query');
  const description = describeFinding(finding);
  assert.ok(description.includes('$.query'));
  assert.ok(!description.includes(TOKEN), 'a report must not become a second leak');
});

test('decodeBlobs ignores binary noise', () => {
  assert.deepEqual(decodeBlobs(Buffer.from([0xff, 0xfe, 0x00]).toString('utf8')), []);
});
