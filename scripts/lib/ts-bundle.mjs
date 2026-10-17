/**
 * Bundle a TypeScript entry for a node:test file.
 *
 * Tests import the package's real source (never a copy), which means they need a
 * bundler. esbuild is already a dev dependency for the design-system mockups, so
 * there is no second toolchain: one helper, used by every package test.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

export async function bundleTs(entry, { outfile, external = [] } = {}) {
  const out = outfile ?? join(dirname(entry), '.build', 'bundle.mjs');
  mkdirSync(dirname(out), { recursive: true });
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
  return import(`${pathToFileURL(out).href}?v=${Date.now()}`);
}
