/**
 * scripts/privacy/self-test.mjs
 *
 * Self-test for the JS canary scanner. Ensures the scanner itself doesn't
 * leak and that a clean transcript is clean. Used by `npm run privacy:self-test`
 * which is part of `npm run test:privacy`.
 *
 * Exit codes: 0 = clean, 1 = leak found / assertion failed, 2 = precondition
 * missing (canary module not found).
 */

let canary;
try {
  canary = await import('./canary.mjs');
} catch (e) {
  console.error(`self-test: precondition missing — cannot load canary.mjs: ${e.message} (exit 2)`);
  process.exit(2);
}

const {
  makeCanaries,
  canariesFrom,
  scanValue,
  scanTranscript,
  emptyTranscript,
  CANARY_MARKER,
} = canary;

const TOKEN = `${CANARY_MARKER}-9f2c1a7b3d4e`;

function assert(cond, msg) {
  if (!cond) {
    console.error(`self-test FAILED: ${msg}`);
    process.exit(1);
  }
}

// 1. makeCanaries produces unique prefixed tokens
{
  const a = makeCanaries(4);
  assert(a.length === 4, 'makeCanaries length');
  assert(new Set(a).size === 4, 'makeCanaries unique');
  for (const t of a) assert(t.startsWith(`${CANARY_MARKER}-`), `prefix ${t}`);
}

// 2. deterministic canaries
{
  const d = canariesFrom(['a b']);
  assert(d[0] === `${CANARY_MARKER}-ab0000000000`, `deterministic ${d[0]}`);
}

// 3. clean transcript has no findings
{
  const transcript = {
    ...emptyTranscript(),
    requests: [{ method: 'POST', url: 'https://api.example/v1/aggregate', headers: { 'content-type': 'application/json' }, body: '{"sessions":3}' }],
    logs: ['flush ok'],
    errors: [],
  };
  const findings = scanTranscript(transcript, [TOKEN]);
  assert(findings.length === 0, `clean transcript should have 0 findings, got ${findings.length}`);
}

// 4. leaky transcript is caught
{
  const transcript = {
    requests: [{ method: 'POST', url: `https://api.example/s?q=${TOKEN}`, headers: {}, body: '' }],
    logs: [],
    errors: [],
    files: [],
    console: [],
  };
  const findings = scanTranscript(transcript, [TOKEN]);
  assert(findings.length >= 1, 'leaky transcript should be caught');
  assert(findings.some(f => f.location === 'request[0].url'), 'location should be request[0].url');
}

// 5. scanValue walks nested structures
{
  const payload = { a: { b: `x ${TOKEN}` } };
  const findings = scanValue(payload, [TOKEN]);
  assert(findings.length >= 1, 'scanValue should find nested token');
}

console.log('privacy self-test: ok (JS canary)');
