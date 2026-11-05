#!/usr/bin/env node
// Runs every suite test file under fixed clock instants and timezones.
// A file that passes on the real clock but fails under a fixed instant depends on
// the wall clock (or on the process timezone) and fails this check.
//
// Why: v0.4.0-alpha.2 passed CI at 14:12Z on 2026-11-05 and failed release at
// 19:11Z the same day. In Asia/Kolkata the local day had rolled to 2026-11-06 by then.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHIM = pathToFileURL(join(ROOT, 'scripts', 'test', 'fake-clock.mjs')).href;

// Each combination is a fixed instant plus a timezone. The first one is the local
// midnight that broke alpha.2 (IST day rolls to 06 Nov). The second is a
// different local day than UTC in another zone.
export const COMBOS = [
  { now: '2026-11-05T18:30:00Z', tz: 'Asia/Kolkata' },
  { now: '2026-11-08T03:00:00Z', tz: 'America/Los_Angeles' },
  { now: '2026-11-01T12:00:00Z', tz: 'UTC' },
];

// Excluded on purpose, with the reason:
//  - packages/ui/tests/mockups.test.mjs: regenerates the gallery; covered by test:mockups.
//  - tests/android-build.test.mjs: not run by any npm script or workflow (stale, expects INTERNET).
const EXCLUDED = new Set([
  'packages/ui/tests/mockups.test.mjs',
  'tests/android-build.test.mjs',
]);

export function listSuiteFiles() {
  const out = [];
  const pkgDir = join(ROOT, 'packages');
  if (existsSync(pkgDir)) {
    for (const pkg of readdirSync(pkgDir, { withFileTypes: true })) {
      const testsDir = join(pkgDir, pkg.name, 'tests');
      if (!pkg.isDirectory() || !existsSync(testsDir)) continue;
      for (const f of readdirSync(testsDir)) if (f.endsWith('.test.mjs')) out.push(join(testsDir, f));
    }
  }
  for (const f of readdirSync(join(ROOT, 'tests'))) {
    if (f.endsWith('.test.mjs')) out.push(join(ROOT, 'tests', f));
  }
  return out
    .map((abs) => relative(ROOT, abs).split('\\').join('/'))
    .filter((rel) => !EXCLUDED.has(rel))
    .sort();
}

function runOne(file, combo) {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--test', file], {
      cwd: ROOT,
      env: {
        ...process.env,
        FAKE_NOW: combo.now,
        FAKE_CLOCK_MODE: 'frozen', // per-file results must be reproducible
        TZ: combo.tz,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${SHIM}`.trim(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ file, ok: code === 0, output });
    });
  });
}

async function runPool(items, limit, fn) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const files = listSuiteFiles();
  const failures = [];
  for (const combo of COMBOS) {
    const results = await runPool(files, 3, (f) => runOne(f, combo));
    const bad = results.filter((r) => !r.ok);
    console.log(`clock-matrix: now=${combo.now} TZ=${combo.tz}: ${files.length - bad.length}/${files.length} files pass`);
    for (const r of bad) {
      failures.push({ combo, file: r.file });
      console.log(`  FAIL ${r.file}`);
      console.log(`       rerun: FAKE_NOW=${combo.now} TZ=${combo.tz} node --test ${r.file}`);
      const tail = r.output.split('\n').filter((l) => /^not ok|error:|expected|actual/.test(l)).slice(0, 6);
      for (const l of tail) console.log(`       ${l}`);
    }
  }
  if (failures.length > 0) {
    console.error(`clock-matrix: ${failures.length} clock-dependent failure(s). Pin the test's clock and offset.`);
    process.exit(1);
  }
  console.log(`clock-matrix: all ${files.length} files pass at ${COMBOS.length} instants/timezones`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
