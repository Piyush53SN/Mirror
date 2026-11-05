/**
 * Bundle a TypeScript entry for a node:test file.
 *
 * Tests import the package's real source (never a copy), which means they need a
 * bundler. esbuild is already a dev dependency for the design-system mockups, so
 * there is no second toolchain: one helper, used by every package test.
 */
import { mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// Several test files share an `outfile` name (for example `.build/core.mjs`). `node --test`
// runs files in parallel, so a shared path let one file import another file's bundle
// ("sessionize is not a function"). Each call now writes its own file, imports it, and
// deletes it. The module is already evaluated by then, so the delete is safe.
export async function bundleTs(entry, { outfile, external = [] } = {}) {
  const requested = outfile ?? join(dirname(entry), '.build', 'bundle.mjs');
  mkdirSync(dirname(requested), { recursive: true });
  const out = requested.replace(/\.mjs$/, `.${process.pid}-${randomUUID().slice(0, 8)}.mjs`);
  await esbuild.build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: false,
    external,
    logLevel: 'warning',
  });
  try {
    return await import(`${pathToFileURL(out).href}?v=${randomUUID()}`);
  } finally {
    try {
      unlinkSync(out);
    } catch {
      // already gone; nothing to clean up
    }
  }
}
