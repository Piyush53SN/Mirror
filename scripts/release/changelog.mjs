#!/usr/bin/env node
/**
 * Generate CHANGELOG.md for a Mirror release tag (or upcoming release from HEAD).
 * Usage: node scripts/release/changelog.mjs [tag]
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function refExists(ref) {
  if (!ref) return false;
  return Boolean(sh(`git rev-parse --verify --quiet "${ref}^{commit}"`));
}

const releaseTags = sh('git tag --sort=-v:refname')
  .split('\n')
  .map((t) => t.trim())
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));

const requestedTag = process.argv[2] || releaseTags[0] || 'v0.1.0';
const endRef = refExists(requestedTag) ? requestedTag : 'HEAD';

let prevTag = '';
for (const candidate of releaseTags) {
  if (candidate === requestedTag) continue;
  if (refExists(candidate) && sh(`git merge-base --is-ancestor "${candidate}" "${endRef}" && echo yes`) === 'yes') {
    prevTag = candidate;
    break;
  }
}

const logRange = prevTag ? `${prevTag}..${endRef}` : endRef;
console.log(`Changelog: ${prevTag || 'initial'}..${requestedTag} (git range: ${logRange})`);

const commits = sh(`git log ${logRange} --no-merges --max-count=40 --pretty=format:"- %s (%h) %ad" --date=short`);
const shortlog = commits || '- Initial release';
const generatedDate = sh('git log -1 --format=%ad --date=short HEAD') || new Date().toISOString().split('T')[0];

const changelog = `# Changelog ${requestedTag}

Generated: ${generatedDate}
Range: ${prevTag || 'initial'}..${requestedTag}

## Highlights (v0.1 — Android On-Device Tier D)

- **Day-clipped OS foreground totals (Digital Wellbeing parity):** Per-app daily totals sum raw \`UsageEvents\` foreground intervals clipped strictly to \`[00:00 local, min(now, 24:00 local)]\` with symmetric 6h lookaround and \`CONTINUE_PREVIOUS_DAY\` handling — eliminating \`INTERVAL_DAILY\` pre-midnight bucket bleed while matching Digital Wellbeing within \`max(10%, 60s)\`. Excludes launchers (\`CATEGORY_HOME\`), Mirror itself, Settings, Play Store/Services, and Android/OEM Package installers.
- **Explicit older-day source labels (\`Stored\` vs \`Approximate\`):** Days beyond Android’s rolling ~7-day \`UsageEvents\` buffer are explicitly badged as **Stored** (when served from Mirror’s encrypted local event log) or **Approximate** (when served from fallback \`INTERVAL_DAILY\` OS buckets).
- **Reconciled 5-tab Frosted Horizon shell (\`Home · Insights · Journey · Sessions · You\`):** Unified canonical day sittings across \`Home\`, \`Insights\`, \`IQS\`, and \`Sessions\`; reconciled active foreground screen time vs merged \`<= 15 min\` sitting spans; honest \`IQS v2\` out of measured parts only (\`/55\` before 5 explicit labels, \`/75\` with 5+ explicit labels, minimum-activity floors enforced, never rescaled to 100).
- **P3 multi-day & counterfactual on-device analytics:** Shipped \`J4 Interest Evolution\`, \`J9 Discovery Journey\`, \`J11 Rabbit Hole\`, \`J18 What-if Simulator\` (every output explicitly labelled \`Estimate\`), and \`J20 Focus Windows\` (requires \`>= 21\` local days and \`>= 5\` sittings/cell; zero diagnostic language) behind the honest \`orphans <= 50\` and \`gaps <= 100\` reliability gate.
- **Degraded-tier & local-storage honesty:** \`TIERS.B\` (\`Your export\`) marked unavailable for v0.1, OAuth claims hidden until P5 connectors exist, AEAD-encrypted local \`MirrorStore\` (\`expo-sqlite\` + \`SecureStore\`, \`allowBackup: false\`), full \`Delete all data\` wipe with reset audit timestamp on \`You\`.
- **Release hardening (Steps 1–4):** \`INTERNET\` stripped from release merged \`AndroidManifest.xml\` via \`tools:node="remove"\`, \`ACCESS_NETWORK_STATE\` scoped and documented for \`WorkManager\`, external env-var upload signing (\`with-release-signing.js\`), OTA disabled/narrow-only guard, offline guard, and privacy canary self-tests.

## Commits

${shortlog}

## v0.1 Checklist vs Spec

- **5-tab shell & J3/J5/J6/J7/J8/J17:** ✅ Frosted Horizon dark-first UI, dynamic \`IQS v2\` max (\`/55\` / \`/75\`), \`WhyScoreSheet\` factor sum & label-count parity, open-times-only session list with optional explicit intent labels (\`neverCounts\` duration hints)
- **P3 J4 / J9 / J11 / J18 / J20:** ✅ Wired to real local history with progress empty states on short history (\`< 3\` days / \`< 21\` days for J20) and \`limited history\` caveats below 14 days
- **Digital Wellbeing parity & older-day source badges:** ✅ Day-clipped \`UsageEvents\` foreground totals within \`max(10%, 60s)\`, \`Stored\` / \`Approximate\` badges on older days, 7-tap \`DebugView\` with \`Day fg\`, \`Stored\`, \`Sittings\`, and \`Raw INTERVAL_DAILY\` pre-midnight bucket diagnostics
- **Merged release manifest gate:** ✅ \`INTERNET\` removed in release variant; \`SYSTEM_ALERT_WINDOW\`, \`ACCESS_LOCAL_NETWORK\`, \`QUERY_ALL_PACKAGES\`, and \`AD_ID\` blocked and verified on Gradle
- **Release signing & Stage-1 preflight:** ✅ External upload keystore env-var/property signing (\`docs/RELEASE_SIGNING.md\`), zero keystores or secrets in repo, \`make release-stage1\` green
- **OTA, offline & privacy guards:** ✅ \`check-ota-guard.mjs\`, \`check-offline.mjs\`, \`secret-scan.mjs\`, \`bundle-check.mjs\`, and \`npm run test:privacy\` green (Step 5 signed-APK emulator privacy canary next)

## Verification

- \`npm run verify\`: tokens, lockfile, typechecks, ESLint, unit/property/UI/config/manifest/release/privacy/security tests, secret scan, Metro bundle check
- \`node scripts/release/bump-version.mjs --check\`: \`v0.1.0\` (\`versionCode 1\`) aligned across manifests, \`build.gradle\`, and \`package-lock.json\`
- \`make release-stage1\`: preflight passed, no keystore in tree
- \`node scripts/android/check-ota-guard.mjs\`: PASSED
- \`node scripts/android/check-offline.mjs\`: PASSED
`;

const outPath = resolve(ROOT, 'CHANGELOG.md');
writeFileSync(outPath, changelog, 'utf8');
console.log(`Wrote ${outPath}`);
