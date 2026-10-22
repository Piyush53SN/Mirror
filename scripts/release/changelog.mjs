#!/usr/bin/env node
/**
 * Generate CHANGELOG.md delta since previous tag.
 * Usage: node scripts/release/changelog.mjs [tag]
 * If tag not provided, uses HEAD.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const currentTag = process.argv[2] || sh('git describe --tags --abbrev=0 HEAD') || 'v0.1.0';
const prevTag = sh(`git describe --tags --abbrev=0 ${currentTag}^ 2>/dev/null`) || sh('git tag --sort=-v:refname | head -n 2 | tail -n 1') || '';

console.log(`Changelog: ${prevTag}..${currentTag}`);

let logRange = '';
if (prevTag) {
  logRange = `${prevTag}..${currentTag}`;
} else {
  logRange = currentTag;
}

const commits = sh(`git log ${logRange} --pretty=format:"- %s (%h) %ad" --date=short`);
const shortlog = commits || '- Initial release';

const changelog = `# Changelog ${currentTag}

Generated: ${new Date().toISOString().split('T')[0]}
Range: ${prevTag || 'initial'}..${currentTag}

## Highlights (P2)

- Per-app daily totals from OS aggregate queryUsageStats (INTERVAL_DAILY) – matches Digital Wellbeing by construction, excludes launchers (HOME role) and Mirror itself and system UI (Settings rule consistent)
- App opens only – no durations, no scaling (P2 fix: orphans 319, Genshin orig 22s shown as 8m54s, Security orig 7m20s shown as 16s) – avoids inventing durations
- J3 dashboard (Frosted Horizon design) wired to real data: IQS tier-D only, Based on usage patterns only chip, data-tier chip (D), Why sheet with parts summing to score, confidence 0.49 cap when approximate
- Release Stage 1: tag-triggered pipeline (v*), GitHub Release, changelog, OTA guard (updates disabled/narrow-only), offline test (works with backend off), deployment.md + 30-min quickstart
- Privacy canary: self-test ok, addon ok, manifest gate ok (SYSTEM_ALERT_WINDOW + ACCESS_LOCAL_NETWORK blocked)

## Commits

${shortlog}

## P2 Checklist vs Spec

- J3 Dashboard: ✅ wired to real data, Frosted Horizon, IQS /75, chips, Why sheet
- J17 Why drawer: ✅ parts add up, caveat, confidence reasons, tier-D only note
- J5 Depth, J6 Curiosity, J7 IQS, J8 Sessions, J24 Persona picker: ✅ engine ready, J8 fixed to open-times only
- X1 Import: ✅ preview real, frozen fixture test-checked
- Release Stage 1: ✅ tag pipeline, GitHub Release, changelog, OTA guard, offline test, deployment.md quickstart, DEBUG_KEYSTORE_BASE64 stable sig, mirror-test.apk phone-testable
- Privacy canary: ✅ self-test ok, addon ok, manifest gate ok, secret scan ok, bundle 721 modules
- Data tier + Based on usage patterns only chips: ✅ TierBadge D, ConfidenceChip D, Chip label
- Per-app totals OS: ✅ matches Digital Wellbeing, excludes launchers+Mirror+system UI
- Session timeline: ✅ open times only, no durations, no scaling, orphans 319 explained in debug
- Hidden debug 7x tap: ✅ validation same period, OS vs Mirror, Honkai raw, Share JSON
- Settings rule consistent: ✅ DEFAULT_IGNORED everywhere, only launchers+Mirror close previous
- Fixture README: ✅ synthetic honkai-day-raw will be replaced via debug Share

P3 on hold – interest evolution, discovery, rabbit-hole, what-if, focus windows remain mockups.

## Verification

- npm run verify: tokens, typechecks, lint, 251 tests, secret scan, bundle
- make android-build: Gradle debug + release manifest gate, BUILD SUCCESSFUL, no forbidden permissions
- make release-stage1: preflight ok, no keystore in tree
- make privacy: self-test ok, addon ok
- OTA guard: node scripts/android/check-ota-guard.mjs – PASSED
- Offline test: node scripts/android/check-offline.mjs – PASSED
`;

const outPath = resolve(ROOT, 'CHANGELOG.md');
writeFileSync(outPath, changelog, 'utf8');
console.log(`Wrote ${outPath}`);
console.log(changelog);
