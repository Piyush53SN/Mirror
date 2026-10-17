#!/usr/bin/env node
/**
 * Bundle reachability check.
 *
 * `npm audit` reports *packages*, not *code that ships*. A package is flagged as
 * "high" when one of its dependencies has an advisory, so `expo` and
 * `react-native` appear in the list even though the vulnerable code is in a
 * build-time dependency neither of them bundles. The only way to know what is in
 * the app is to look at the app.
 *
 * This script:
 *   1. runs `npm audit --json`,
 *   2. bundles the real app entry with Metro (`expo export:embed`, production),
 *   3. reads the bundle's source map — the authoritative list of modules that
 *      were included,
 *   4. fails if any package that **carries an advisory itself** (`via` objects,
 *      not transitive parents) is in that list.
 *
 * Exit codes: 0 clean, 1 a vulnerable package is in the bundle, 2 could not run.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MOBILE = join(ROOT, 'apps/mobile');

/** Flatten a plain or indexed source map into its module paths. */
export function readSources(map) {
  if (!map) return [];
  if (Array.isArray(map.sections)) return map.sections.flatMap((section) => section?.map?.sources ?? []);
  return map.sources ?? [];
}

/** Which npm packages contributed at least one module to the graph. */
export function packagesInSources(sources) {
  const packages = new Map();
  for (const source of sources) {
    const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(source);
    if (!match) continue;
    packages.set(match[1], (packages.get(match[1]) ?? 0) + 1);
  }
  return packages;
}

/** The packages that actually carry an advisory (not the parents npm propagates to). */
export function advisoryPackages(audit) {
  const byPackage = new Map();
  for (const entry of Object.values(audit?.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via !== 'object' || !via) continue;
      const previous = byPackage.get(via.name);
      const severity = entry.severity;
      if (!previous || rank(severity) < rank(previous.severity)) {
        byPackage.set(via.name, { package: via.name, severity, title: via.title, url: via.url });
      }
    }
  }
  return [...byPackage.values()].sort((a, b) => rank(a.severity) - rank(b.severity));
}

const rank = (severity) => ['critical', 'high', 'moderate', 'low', 'info'].indexOf(severity);

/**
 * The gate. `blocking` advisories are high or critical; a moderate advisory in a
 * shipped package is reported but does not fail, and is listed in the report so
 * the decision is visible rather than silent.
 */
export function checkBundle({ sources, audit }) {
  if (sources.length === 0) throw new Error('the source map contains no modules — a vacuous pass is not a pass');
  const bundled = packagesInSources(sources);
  const advisories = advisoryPackages(audit);
  const inBundle = advisories.filter((advisory) => bundled.has(advisory.package));

  const flagged = Object.entries(audit?.vulnerabilities ?? {})
    .filter(([, entry]) => entry.severity === 'high' || entry.severity === 'critical')
    .map(([name]) => name);
  const flaggedPresent = flagged.filter((name) => bundled.has(name)).sort();

  const blocking = inBundle.filter((advisory) => advisory.severity === 'high' || advisory.severity === 'critical');
  return {
    modules: sources.length,
    packages: bundled.size,
    advisories,
    inBundle,
    blocking,
    flaggedPresent,
    ok: blocking.length === 0,
  };
}

function loadAudit() {
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        /* fall through */
      }
    }
    throw new Error('npm audit did not return JSON (offline?)');
  }
}

export function buildBundle({ outDir = join(ROOT, '.reports/bundle') } = {}) {
  mkdirSync(outDir, { recursive: true });
  const bundle = join(outDir, 'app.bundle.js');
  const map = join(outDir, 'app.bundle.map');
  try {
    execFileSync(
      'npx',
      [
        'expo',
        'export:embed',
        '--platform',
        'android',
        '--dev',
        'false',
        '--entry-file',
        'index.js',
        '--bundle-output',
        bundle,
        '--sourcemap-output',
        map,
        '--assets-dest',
        join(outDir, 'assets'),
      ],
      { cwd: MOBILE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    const message = [error.stderr, error.stdout].filter(Boolean).join('\n').slice(-2000);
    throw new Error(`Metro bundling failed:\n${message}`);
  }
  return { bundle, map };
}

/* ------------------------------------------------------------------- CLI -- */

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const mapArg = process.argv.includes('--map') ? process.argv[process.argv.indexOf('--map') + 1] : null;
  let bundle;
  let mapPath = mapArg;
  try {
    if (!mapPath) {
      console.log('bundle-check: bundling apps/mobile with Metro (production)…');
      const built = buildBundle();
      mapPath = built.map;
      bundle = built.bundle;
    }
    const sources = readSources(JSON.parse(readFileSync(resolve(mapPath), 'utf8')));
    const audit = loadAudit();
    const result = checkBundle({ sources, audit });

    mkdirSync(join(ROOT, '.reports'), { recursive: true });
    writeFileSync(join(ROOT, '.reports/bundle.json'), JSON.stringify({ ...result, bundle, map: mapPath, generatedAt: new Date().toISOString() }, null, 2));

    console.log(
      `bundle-check: ${result.modules} modules, ${result.packages} npm packages; ${result.advisories.length} advisory package(s), ${result.inBundle.length} in the bundle`,
    );
    for (const advisory of result.inBundle) {
      const label = advisory.severity === 'high' || advisory.severity === 'critical' ? '✗' : '!';
      console.error(`  ${label} ${advisory.package} (${advisory.severity}) is in the bundle — ${advisory.title}`);
    }
    if (result.flaggedPresent.length > 0) {
      console.log(`  flagged as parents, present as code: ${result.flaggedPresent.join(', ')} (their vulnerable dependencies are what the check looks for)`);
    }
    if (!result.ok) process.exit(1);
    console.log('bundle-check: no vulnerable package is in the app bundle');
    process.exit(0);
  } catch (error) {
    console.error(`bundle-check: ${error.message}`);
    process.exit(2);
  }
}
