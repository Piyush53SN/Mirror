/**
 * mockups/render-lib.mjs — the bundling seam shared by the renderer and the tests.
 *
 * Kept separate from render.mjs so tests can build the renderer bundle without
 * running the whole gallery, and so there is exactly one place that knows how
 * `react-native` is aliased for a non-RN host.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));

export const paths = {
  here: HERE,
  ui: join(HERE, '..'),
  root: join(HERE, '..', '..', '..'),
  gallery: join(HERE, 'gallery'),
  // The bundle must stay inside the repo so that Node can resolve the external
  // `react` / `react-dom/server` imports from the workspace node_modules. The
  // directory is gitignored: it is a build artifact, not a deliverable.
  bundleDir: join(HERE, '.build'),
  entry: join(HERE, 'entry.tsx'),
  rnShim: join(HERE, 'rn-dom.tsx'),
};

/**
 * Build the design system for Node with `react-native` aliased to the DOM
 * binding. Cached by mtime: repeated calls in a test file rebuild at most once.
 */
export async function buildRenderer({ force = false } = {}) {
  mkdirSync(paths.bundleDir, { recursive: true });
  const outfile = join(paths.bundleDir, 'render.bundle.mjs');
  await esbuild.build({
    entryPoints: [paths.entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    alias: { 'react-native': paths.rnShim },
    external: ['react', 'react-dom', 'react-dom/server'],
    logLevel: force ? 'info' : 'warning',
  });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}
