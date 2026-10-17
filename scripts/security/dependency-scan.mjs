#!/usr/bin/env node
/**
 * Dependency scanning.
 *
 * `npm audit` against the committed lockfile. The gate is deliberately about
 * **shipped risk**, not about a number that looks good:
 *
 *   - a **critical** advisory fails the build, always;
 *   - `--strict` also fails on **high** — not the default, because npm propagates
 *     Expo's build-time advisories (braces, node-forge) up to 14 parent packages
 *     including `expo` itself. Those leaves are verified absent from the app
 *     bundle by `security:bundle`, which is the check that matters for shipping;
 *     the flag is turned on when Expo ships patched dependencies.
 *   - moderate/low are reported, never silent.
 *
 * The report is written to `.reports/dependencies.json` (ignored by git) so a CI
 * artifact can carry the full detail without pasting it into a log.
 *
 * Exit codes: 0 within policy, 1 over policy, 2 could not run (offline, no audit).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

export function evaluateAudit(report, { strict = false } = {}) {
  const counts = report?.metadata?.vulnerabilities ?? { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  const vulnerabilities = Object.values(report?.vulnerabilities ?? {});
  const packages = vulnerabilities
    .map((entry) => ({ name: entry.name, severity: entry.severity, direct: Boolean(entry.isDirect), fixAvailable: Boolean(entry.fixAvailable) }))
    .sort((a, b) => ['critical', 'high', 'moderate', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'moderate', 'low', 'info'].indexOf(b.severity));

  // npm propagates a finding up the dependency tree: `expo` is reported as "high"
  // because one of its build-time dependencies is. The packages that actually
  // carry an advisory are the `via` objects, and those are what a bundle check
  // must look for. Keeping both lists makes the difference explicit.
  const advisories = [];
  for (const entry of vulnerabilities) {
    for (const via of entry.via ?? []) {
      if (typeof via !== 'object' || !via) continue;
      advisories.push({ package: via.name, severity: entry.severity, title: via.title, url: via.url, range: via.range });
    }
  }
  const vulnerablePackages = [...new Set(advisories.map((advisory) => advisory.package))].sort();

  const failures = [];
  if (counts.critical > 0) failures.push(`${counts.critical} critical advisory(ies)`);
  if (strict && counts.high > 0) failures.push(`${counts.high} high advisory(ies) (--strict)`);

  return { counts, packages, advisories, vulnerablePackages, failures, ok: failures.length === 0 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const strict = process.argv.includes('--strict');
  let report;
  try {
    const output = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    report = JSON.parse(output);
  } catch (error) {
    // `npm audit` exits non-zero when it finds anything; its stdout is still JSON.
    if (error.stdout) {
      try {
        report = JSON.parse(error.stdout);
      } catch {
        report = null;
      }
    }
    if (!report) {
      console.error('dependency-scan: could not run npm audit (offline, or npm missing)');
      if (error.stderr) console.error(String(error.stderr).split('\n').slice(0, 5).join('\n'));
      process.exit(2);
    }
  }

  const result = evaluateAudit(report, { strict });
  mkdirSync('.reports', { recursive: true });
  writeFileSync('.reports/dependencies.json', JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2));

  console.log(
    `dependency-scan: ${result.counts.total} advisories — critical ${result.counts.critical}, high ${result.counts.high}, moderate ${result.counts.moderate}, low ${result.counts.low}`,
  );
  const direct = result.packages.filter((p) => p.direct).slice(0, 5);
  if (direct.length) console.log(`  direct: ${direct.map((p) => `${p.name} (${p.severity})`).join(', ')}`);
  if (!strict && result.counts.high > 0) {
    console.log('  high advisories are reported, not blocking: they are build-time leaves (see bundle-check)');
  }

  if (!result.ok) {
    for (const failure of result.failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  process.exit(0);
}
