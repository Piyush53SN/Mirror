/**
 * tests/security.test.mjs
 *
 * Tests for the two scanners CI runs: secret-scan and dependency-scan.
 *
 * The test file deliberately builds every fake credential by concatenation. A
 * literal secret-shaped string in this file would be a finding in the very scan
 * it is testing — and the repository self-check below would fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { scanText, scanRepository, isPlaceholder, shannonEntropy, SKIP_PATHS } from '../scripts/security/secret-scan.mjs';
import { evaluateAudit } from '../scripts/security/dependency-scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const findings = (text) => scanText(text, 'fixture.txt').filter((f) => f.status === 'finding');

const AWS = 'AKIA' + 'Z7X4QW2NPLK9M3RT';
const GITHUB = 'ghp' + '_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const SLACK = 'xox' + 'b-' + '123456789012-abcdefghijklmnop';
const STRIPE = 'sk' + '_' + 'live_' + '4eC39HqLyjWDarjtT1zdp7dc';
const GOOGLE = 'AIza' + 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
const JWT = 'eyJhbGciOiJIUzI1NiJ9' + '.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0' + '.' + 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
const PRIVATE_KEY = '-----BEGIN ' + 'PRIVATE KEY-----';

/* ------------------------------------------------------------ secret scan -- */

test('each credential shape is detected', () => {
  const cases = [
    [AWS, 'aws-access-key'],
    [GITHUB, 'github-token'],
    [SLACK, 'slack-token'],
    [STRIPE, 'stripe-key'],
    [GOOGLE, 'google-api-key'],
    [JWT, 'jwt'],
    [PRIVATE_KEY, 'private-key'],
  ];
  for (const [value, rule] of cases) {
    const found = findings(`const credential = '${value}';\n`);
    assert.ok(found.some((f) => f.rule === rule), `${rule} was not detected in ${value.slice(0, 10)}…`);
  }
});

test('a high-entropy assignment is detected, a password-shaped one is not', () => {
  const high = ['apiKey', " = '", 'Zx9', 'Qm2', 'Lp7', 'Vr4', 'Nt8', 'Wq3', 'Hf6', 'Bd1', 'Ks5', "'"].join('');
  assert.ok(findings(`${high};\n`).some((f) => f.rule === 'generic-secret'), 'high-entropy value must be found');

  const low = `password = '${'a'.repeat(24)}';\n`;
  const result = scanText(low, 'fixture.txt');
  assert.equal(result.filter((f) => f.status === 'finding').length, 0, 'a low-entropy password must not fail the build');
  assert.ok(result.some((f) => f.status === 'low-entropy'));
});

test('placeholders are reported as allowed, not as findings', () => {
  for (const value of ['MRRCANARY-9f2c1a7b3d4e', 'AKIA' + 'EXAMPLE000000000', 'your-api-key-here', '<token>', 'sk_live_placeholder0000000000']) {
    assert.ok(isPlaceholder(value), `${value} should be recognised as a placeholder`);
  }
  assert.equal(findings(`const key = '${'MRRCANARY-'}9f2c1a7b3d4e';\n`).length, 0);
});

test('entropy separates random strings from words', () => {
  assert.ok(shannonEntropy('aaaaaaaaaaaaaaaa') < 1);
  assert.ok(shannonEntropy('Zx9Qm2Lp7Vr4Nt8Wq3Hf6Bd1Ks5') > 4);
});

test('findings name file, line and rule, and mask the value', () => {
  const [finding] = findings(`nothing here\nconst k = '${AWS}';\n`);
  assert.equal(finding.path, 'fixture.txt');
  assert.equal(finding.line, 2);
  assert.match(finding.match, /^AKIA…RT/);
  assert.ok(!finding.match.includes(AWS), 'the report must not echo the whole secret');
});

test('the repository itself is clean', () => {
  const result = scanRepository(ROOT);
  const real = result.findings.filter((finding) => finding.status === 'finding');
  assert.deepEqual(real, [], `unexpected secrets: ${real.map((f) => `${f.path}:${f.line}`).join(', ')}`);
  assert.ok(result.files > 50, `expected to scan the repo, saw ${result.files} files`);
});

test('git-ignored files are not scanned; tracked files are', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-secrets-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, '.gitignore'), '.env\n');
    writeFileSync(join(dir, 'kept.txt'), `token = '${AWS}'\n`);
    writeFileSync(join(dir, '.env'), `token = '${AWS}'\n`);
    const result = scanRepository(dir);
    const paths = result.findings.filter((f) => f.status === 'finding').map((f) => f.path);
    assert.deepEqual(paths, ['kept.txt']);
    assert.ok(SKIP_PATHS.includes('package-lock.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------- dependency scan -- */

const auditReport = (counts, vulnerabilities = {}) => ({
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...counts } },
  vulnerabilities,
});

test('a critical advisory always fails', () => {
  const result = evaluateAudit(auditReport({ critical: 1, total: 1 }));
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /critical/);
});

test('high advisories block only in strict mode', () => {
  const report = auditReport({ high: 3, total: 3 });
  assert.equal(evaluateAudit(report).ok, true);
  assert.equal(evaluateAudit(report, { strict: true }).ok, false);
});

test('a clean audit passes in every mode', () => {
  assert.equal(evaluateAudit(auditReport({ total: 0 })).ok, true);
  assert.equal(evaluateAudit(auditReport({ total: 0 }), { strict: true }).ok, true);
});

test('packages are ordered by severity, worst first', () => {
  const result = evaluateAudit(
    auditReport({ high: 1, moderate: 1, total: 2 }, {
      a: { name: 'a', severity: 'moderate', isDirect: true },
      b: { name: 'b', severity: 'high', isDirect: false },
    }),
  );
  assert.deepEqual(result.packages.map((p) => p.name), ['b', 'a']);
});

test('a malformed report degrades to zero counts rather than throwing', () => {
  const result = evaluateAudit({});
  assert.equal(result.counts.total, 0);
  assert.equal(result.ok, true);
});

/* ------------------------------------------------------------ bundle check -- */

const { readSources, packagesInSources, advisoryPackages, checkBundle } = await import('../scripts/security/bundle-check.mjs');

const auditWith = (vulnerabilities) => ({ metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } }, vulnerabilities });
const PARENT_AUDIT = auditWith({
  expo: { name: 'expo', severity: 'high', via: ['node-forge'], effects: [] },
  'node-forge': { name: 'node-forge', severity: 'high', via: [{ name: 'node-forge', title: 'RSA signature check', url: 'https://example.test' }], effects: ['expo'] },
});

test('source maps are read whether plain or indexed', () => {
  assert.deepEqual(readSources({ sources: ['a.js'] }), ['a.js']);
  assert.deepEqual(readSources({ sections: [{ map: { sources: ['a.js'] } }, { map: { sources: ['b.js'] } }] }), ['a.js', 'b.js']);
  assert.deepEqual(readSources(null), []);
});

test('packages are extracted from module paths, scoped names included', () => {
  const packages = packagesInSources([
    '/node_modules/react/index.js',
    '/node_modules/@expo/metro-config/src/x.js',
    '/node_modules/@expo/metro-config/src/y.js',
    '/app/App.tsx',
  ]);
  assert.equal(packages.get('react'), 1);
  assert.equal(packages.get('@expo/metro-config'), 2);
  assert.equal(packages.size, 2);
});

test('advisories are attributed to the package that carries them, not its parent', () => {
  const advisories = advisoryPackages(PARENT_AUDIT);
  assert.deepEqual(advisories.map((a) => a.package), ['node-forge']);
  assert.equal(advisories[0].severity, 'high');
});

test('a vulnerable package in the bundle fails; a flagged parent alone does not', () => {
  const parentOnly = checkBundle({ sources: ['/node_modules/expo/index.js'], audit: PARENT_AUDIT });
  assert.equal(parentOnly.ok, true, 'expo is flagged only because of its dependency');
  assert.deepEqual(parentOnly.inBundle, []);

  const leaked = checkBundle({ sources: ['/node_modules/expo/index.js', '/node_modules/node-forge/lib/index.js'], audit: PARENT_AUDIT });
  assert.equal(leaked.ok, false);
  assert.deepEqual(leaked.blocking.map((a) => a.package), ['node-forge']);
});

test('a moderate advisory is reported but does not block', () => {
  const audit = auditWith({ uuid: { name: 'uuid', severity: 'moderate', via: [{ name: 'uuid', title: 'bounds check', url: 'https://example.test' }] } });
  const result = checkBundle({ sources: ['/node_modules/uuid/index.js'], audit });
  assert.equal(result.ok, true);
  assert.equal(result.inBundle.length, 1);
  assert.equal(result.inBundle[0].severity, 'moderate');
});

test('an empty source map is an error, never a vacuous pass', () => {
  assert.throws(() => checkBundle({ sources: [], audit: PARENT_AUDIT }), /vacuous pass/);
});
