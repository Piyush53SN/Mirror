#!/usr/bin/env node
/**
 * Secret scanning.
 *
 * Scans every file git would commit — tracked and untracked-but-not-ignored — for
 * credentials: private keys, provider tokens, JWTs, and generic
 * `key = "high-entropy string"` assignments. Two rules shape it:
 *
 *   1. **The repository is the unit.** A secret in a scratch file that is not
 *      committed is not a leak; one in a tracked file is. Ignored paths
 *      (`node_modules`, build output, canary reports) are skipped, because
 *      scanning them produces noise that trains people to ignore the result.
 *   2. **Placeholders are not findings.** The canary fixtures, `example` keys and
 *      `<your-key>` templates are recognised and reported as `allowed`, so the
 *      gate can stay at zero without an ever-growing ignore list of files.
 *
 * Exit codes: 0 clean, 1 findings, 2 could not run (e.g. not a git checkout).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Files that are generated, vendored, or contain hashes by design. */
export const SKIP_PATHS = [
  'package-lock.json',
  'packages/ui/mockups/gallery/',
  'prototype/',
  'public/',
  '.build/',
  'privacy/',
  'builds/',
];

/** Built-in placeholder markers. A match containing one of these is reported as allowed. */
export const PLACEHOLDER_MARKERS = [
  'mrrcanary-',
  'example',
  'placeholder',
  'redacted',
  'your-',
  'your_',
  '<',
  'xxxx',
  'changeme',
  'not-a-real',
];

export const RULES = [
  {
    id: 'private-key',
    description: 'a private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  { id: 'aws-access-key', description: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'github-token', description: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'slack-token', description: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'stripe-key', description: 'a Stripe secret key', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { id: 'google-api-key', description: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'jwt', description: 'a JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    id: 'bearer-token',
    description: 'a bearer token in a header',
    pattern: /authorization\s*[:=]\s*['"]?bearer\s+[A-Za-z0-9._-]{20,}/i,
  },
  {
    id: 'generic-secret',
    description: 'a credential-looking assignment',
    // The capture group is the candidate value; it is checked for entropy so
    // `password = "password"` does not fail the build.
    pattern: /(?:api[_-]?key|secret|password|passwd|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"]([A-Za-z0-9+/=_-]{20,})['"]/i,
    capture: 1,
    minEntropy: 3.5,
  },
  { id: 'expo-token', description: 'an Expo token assignment', pattern: /\bEXPO_TOKEN\s*[:=]\s*\S+/ },
];

/** Shannon entropy per character. Random base64 sits around 4.5–6; English ~4. */
export function shannonEntropy(value) {
  if (!value) return 0;
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function isPlaceholder(value) {
  const lower = String(value).toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

const mask = (value) => `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;

/**
 * Scan one text blob. Exported so the rules can be tested without touching git.
 * Returns findings for that file, each with line and rule.
 */
export function scanText(text, path = '<memory>') {
  const findings = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      const candidate = rule.capture ? match[rule.capture] : match[0];
      if (!candidate) continue;
      if (isPlaceholder(candidate) || isPlaceholder(line)) {
        findings.push({ path, line: index + 1, rule: rule.id, description: rule.description, status: 'allowed', match: mask(candidate) });
        continue;
      }
      if (rule.minEntropy !== undefined && shannonEntropy(candidate) < rule.minEntropy) {
        findings.push({ path, line: index + 1, rule: rule.id, description: rule.description, status: 'low-entropy', match: mask(candidate) });
        continue;
      }
      findings.push({ path, line: index + 1, rule: rule.id, description: rule.description, status: 'finding', match: mask(candidate) });
    }
  }
  return findings;
}

export function listRepositoryFiles(cwd) {
  const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function scanRepository(cwd) {
  if (!statSync(join(cwd, '.git')).isDirectory()) throw new Error(`${cwd} is not a git checkout`);
  const files = listRepositoryFiles(cwd).filter((file) => !SKIP_PATHS.some((skip) => file.includes(skip)));
  const findings = [];
  for (const file of files) {
    const absolute = join(cwd, file);
    let buffer;
    try {
      buffer = readFileSync(absolute);
    } catch {
      continue; // deleted between listing and reading
    }
    if (buffer.includes(0)) continue; // binary
    findings.push(...scanText(buffer.toString('utf8'), relative(cwd, absolute)));
  }
  return { files: files.length, findings };
}

/* ------------------------------------------------------------------- CLI -- */

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const cwd = process.cwd();
  let result;
  try {
    result = scanRepository(cwd);
  } catch (error) {
    console.error(`secret-scan: cannot run — ${error.message}`);
    process.exit(2);
  }
  const real = result.findings.filter((finding) => finding.status === 'finding');
  const allowed = result.findings.filter((finding) => finding.status === 'allowed');
  const lowEntropy = result.findings.filter((finding) => finding.status === 'low-entropy');

  console.log(`secret-scan: ${result.files} files scanned, ${real.length} finding(s), ${allowed.length} allowed, ${lowEntropy.length} low-entropy ignored`);
  for (const finding of real) console.error(`  ✗ ${finding.path}:${finding.line} — ${finding.description} [${finding.rule}] ${finding.match}`);

  if (real.length > 0) process.exit(1);
  process.exit(0);
}
