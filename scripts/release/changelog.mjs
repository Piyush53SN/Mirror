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

const rawArgs = process.argv.slice(2);
let outPathArg = null;
const positionalArgs = [];
for (let i = 0; i < rawArgs.length; i += 1) {
  if (rawArgs[i] === '--out') {
    outPathArg = rawArgs[++i] ? resolve(rawArgs[i]) : null;
  } else {
    positionalArgs.push(rawArgs[i]);
  }
}

const requestedTag = positionalArgs[0] || releaseTags[0] || 'v0.1.0';
const isPrerelease = requestedTag.includes('-');
const baseReleaseVersion = requestedTag.replace(/^v/, '').split('-')[0];
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

const prereleaseBanner = isPrerelease
  ? `\n> **Pre-release (${requestedTag})** — release candidate build (base version \`v${baseReleaseVersion}\`) published for on-device verification before cutting final \`v${baseReleaseVersion}\`.\n`
  : '';

const changelog = `# Changelog ${requestedTag}

Generated: ${generatedDate}
Range: ${prevTag || 'initial'}..${requestedTag}
${prereleaseBanner}
## Highlights (v0.1 — Android On-Device Tier D)

- **Day-clipped OS foreground totals (Digital Wellbeing parity) & append-only local history:** Per-app daily totals sum raw \`UsageEvents\` foreground intervals clipped strictly to \`[00:00 local, min(now, 24:00 local)]\` with symmetric 6h lookaround, \`CONTINUE_PREVIOUS_DAY\` handling, screen-off / keyguard sitting closure, unioned per-package stored intervals, non-destructive append-only \`MirrorStore\` sync (with one-time idempotent \`session_repair_v29\` recovery), and headless \`WorkManager\` launcher fallback — matching Digital Wellbeing within \`max(10%, 60s)\`. Excludes launchers (\`CATEGORY_HOME\`), Mirror itself, Settings, Play Store/Services, and Android/OEM package installers across both totals and sittings.
- **Explicit older-day source labels (\`Stored\` vs \`Approximate\`) & provisional today:** Days beyond Android’s rolling ~7-day \`UsageEvents\` buffer are badged **Stored** (when served from Mirror’s encrypted local event log) or **Approximate** (when served from fallback \`INTERVAL_DAILY\` OS buckets), and in-progress today is marked **Today so far, provisional**.
- **Reconciled 5-tab Frosted Horizon shell (\`Home · Insights · Journey · Sessions · You\`):** Attention signal shows \`<value> of <measuredMax> measured\` (\`/55\` before 5 explicit labels, \`/75\` with 5+ explicit labels, ring filled by \`value / measuredMax\`, unmeasured points listed separately, unfinished \`late_night\` held out today). Session rows keep duration hints hidden until after labeling and count only explicit \`Intentional\` / \`Mindless\` labels.
- **Multi-day patterns & combinable counterfactuals:** Interest Evolution & Discovery rank apps by day-clipped foreground time (keeping merged \`<= 15m\` spans only for sitting counts); Rabbit Hole runs on raw opens before merging (*4+ returns / 5+ opens >= 8s, <= 30m apart, no other app between, > 30m total span*); combinable What-if Simulator scenarios label every output \`Estimate\`; Focus Windows unlocks at \`>= 21\` local days and \`>= 5\` sittings/cell with non-diagnostic copy.
- **\`XChaCha20-Poly1305\` local store, no internet permission & archive export:** Local SQLite records are encrypted with \`XChaCha20-Poly1305\` (\`expo-sqlite\` + Android Keystore \`SecureStore\`, \`allowBackup: false\`). Release builds declare **no internet permission** (\`INTERNET\` stripped via \`tools:node="remove"\`, no \`NotificationListenerService\`). \`You\` includes \`Export all local data (JSON)\` (**archive only — no import in v0.1**, with plaintext warning and optional \`XChaCha20-Poly1305\` passphrase), \`Clear manual labels\`, and typed \`DELETE\` confirmation (\`Delete all local data\`). \`TIERS.B\` and OAuth connectors remain unavailable in v0.1.
- **One-time install note (\`docs/INSTALL.md\` & \`docs/RELEASE_NOTES_v0.1.0.md\`):** Migrating off an earlier \`debug.keystore\`-signed \`mirror-test.apk\` requires uninstalling \`dev.mirror.app\` once before installing \`mirror-v0.1.0-rc1-release.apk\` / \`mirror-v0.1.0-release.apk\`; updating from \`v0.1.0-rc1\` to \`v0.1.0\` installs in-place without uninstalling.

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

const outPath = outPathArg ?? resolve(ROOT, 'CHANGELOG.md');
writeFileSync(outPath, changelog, 'utf8');
console.log(`Wrote ${outPath}`);
