#!/usr/bin/env node
/**
 * Dependency scanning.
 *
 * `npm audit` against the committed lockfile. The gate is deliberately about
 * **shipped risk**, not about a number that looks good:
 *
 *   - a **critical** advisory fails the build, always;
 *   - `--strict` also fails on **high** — not the default today, because the
 *     Expo 58 / React Native 0.88 toolchain currently carries 33 high advisories
 *     in dev-only paths (metro, jest, Expo CLI). They are reported here and
 *     tracked in docs/PROGRESS.md; P1a upgrades the toolchain, and the flag is
 *     turned on when the count reaches zero.
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
  const packages = Object.values(report?.vulnerabilities ?? {})
    .map((entry) => ({ name: entry.name, severity: entry.severity, direct: Boolean(entry.isDirect), fixAvailable: Boolean(entry.fixAvailable) }))
    .sort((a, b) => ['critical', 'high', 'moderate', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'moderate', 'low', 'info'].indexOf(b.severity));

  const failures = [];
  if (counts.critical > 0) failures.push(`${counts.critical} critical advisory(ies)`);
  if (strict && counts.high > 0) failures.push(`${counts.high} high advisory(ies) (--strict)`);

  return { counts, packages, failures, ok: failures.length === 0 };
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
    console.log('  high advisories are reported, not blocking, until P1a upgrades the Expo toolchain; see docs/PROGRESS.md');
  }

  if (!result.ok) {
    for (const failure of result.failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  process.exit(0);
}
