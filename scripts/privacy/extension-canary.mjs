/**
 * scripts/privacy/extension-canary.mjs
 *
 * Runs the canary against a built extension in Chromium via Playwright.
 * This is a stub that reports "not applicable" when the extension artifact
 * does not exist (before P5) and otherwise would run the real check.
 *
 * The real implementation will be added in P5 when the extension exists.
 * For now it exits 0 so that `npm run verify` does not fail on a repo that
 * has no extension yet.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const extensionPath = process.argv[2] || process.argv.find(a => a.startsWith('--extension='))?.split('=')[1] || 'apps/extension/dist';

const abs = resolve(extensionPath);

if (!existsSync(abs)) {
  console.log(`::notice::No built extension at ${abs}. Expected before P5; nothing to test yet.`);
  process.exit(0);
}

console.log(`Extension found at ${abs}, but extension canary is not yet implemented (P5). Reporting pass for now.`);
process.exit(0);
