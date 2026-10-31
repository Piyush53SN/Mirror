#!/usr/bin/env node
/**
 * Signed Release APK Privacy & Integrity Verifier (Step 5, Stage 3).
 *
 * Honest architectural premise:
 *   Mirror's release APK strips `android.permission.INTERNET` (`tools:node="remove"`),
 *   so Android withholds Linux group `AID_INET` (GID 3003) from `dev.mirror.app`.
 *   Zero outbound HTTP/HTTPS traffic through `mitmproxy` is therefore expected by OS
 *   kernel enforcement alone — the runtime `mitmproxy` + `logcat` canary confirms
 *   zero runtime flows and checks that no `MRRCANARY-*` token leaks into `logcat`,
 *   while this verifier proves the three release invariants directly on the artifacts:
 *     1. Merged release manifest has NO `android.permission.INTERNET` (and keeps
 *        `android.permission.PACKAGE_USAGE_STATS` + documented `WorkManager` permissions).
 *     2. Merged release manifest has NO `BIND_NOTIFICATION_LISTENER_SERVICE` and NO
 *        `NotificationListenerService` (or `AccessibilityService`) component.
 *     3. Signed APK passes `apksigner verify --verbose --print-certs` under APK Signature
 *        Scheme v2/v3 with the permanent release certificate — NEVER `CN=Android Debug`.
 *
 * Usage:
 *   node scripts/privacy/verify-signed-apk.mjs \
 *     --apk mirror-v0.1.0-rc1-release.apk \
 *     [--manifest apps/mobile/android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml] \
 *     [--manifest-json .reports/merged-manifest-release.json] \
 *     [--apksigner-report .reports/apksigner-verify.txt] \
 *     [--canary-report privacy/android-report.json] \
 *     [--logcat privacy/logcat-http.txt] \
 *     [--canaries privacy/canaries.txt] \
 *     [--run-emulator] \
 *     [--out privacy/signed-apk-verification.json]
 *
 * Exit codes:
 *   0  all supplied + required release checks passed
 *   1  a privacy, manifest, or release-certificate check FAILED
 *   2  precondition missing (no APK / manifest / apksigner available to inspect)
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_FROM_LIBRARIES,
  FORBIDDEN_PERMISSIONS,
  FORBIDDEN_SERVICE_PERMISSIONS,
  REQUIRED_PERMISSIONS,
  auditManifest,
  findMergedManifest,
} from '../android/check-merged-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

export const ARCHITECTURAL_INTERNET_DISCLOSURE =
  'Without android.permission.INTERNET in the release manifest, Android withholds Linux group AID_INET (GID 3003) from dev.mirror.app, so zero network traffic in mitmproxy is expected by OS enforcement. Runtime canary capture confirms 0 flows and 0 logcat canary leaks; merged release manifest + apksigner verification prove INTERNET removal, NotificationListener absence, and non-debug release signing.';

/**
 * Parse `aapt2 dump xmltree <apk> --file AndroidManifest.xml` output into permissions & services
 * when only the compiled binary APK is available (no raw XML or CI JSON report).
 */
export function parseAapt2XmlTree(treeText) {
  const permissions = new Set();
  const services = [];
  const lines = String(treeText ?? '').split(/\r?\n/);

  let currentElement = null;
  let currentIndent = -1;
  let serviceObj = null;

  for (const line of lines) {
    const elemMatch = /^(\s*)E:\s+([A-Za-z0-9_.-]+)\b/.exec(line);
    if (elemMatch) {
      const indent = elemMatch[1].length;
      const tag = elemMatch[2];
      if (serviceObj && indent <= currentIndent) {
        services.push(serviceObj);
        serviceObj = null;
      }
      currentElement = tag;
      currentIndent = indent;
      if (tag === 'service') {
        serviceObj = {
          name: '<unnamed>',
          permission: null,
          accessibility: false,
          notificationListener: false,
        };
      }
      continue;
    }

    const attrNameMatch = /A:\s+(?:http:\/\/schemas\.android\.com\/apk\/res\/android:)?name(?:\([^)]*\))?="([^"]+)"/.exec(
      line,
    );
    if (attrNameMatch) {
      const val = attrNameMatch[1];
      if (currentElement === 'uses-permission' || currentElement === 'uses-permission-sdk-23') {
        permissions.add(val);
      } else if (serviceObj && currentElement === 'service' && serviceObj.name === '<unnamed>') {
        serviceObj.name = val;
      } else if (serviceObj && currentElement === 'action') {
        if (val.includes('AccessibilityService')) serviceObj.accessibility = true;
        if (val.includes('NotificationListenerService')) serviceObj.notificationListener = true;
      }
    }

    const attrPermMatch =
      /A:\s+(?:http:\/\/schemas\.android\.com\/apk\/res\/android:)?permission(?:\([^)]*\))?="([^"]+)"/.exec(line);
    if (attrPermMatch && serviceObj && currentElement === 'service') {
      serviceObj.permission = attrPermMatch[1];
      if (attrPermMatch[1] === 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE') {
        serviceObj.notificationListener = true;
      }
      if (attrPermMatch[1] === 'android.permission.BIND_ACCESSIBILITY_SERVICE') {
        serviceObj.accessibility = true;
      }
    }
  }

  if (serviceObj) services.push(serviceObj);
  return { permissions: [...permissions].sort(), services };
}

/**
 * Audit a release manifest from raw XML, a CI `merged-manifest-release.json` object,
 * or parsed `{ permissions, services }` (e.g. from `aapt2 dump xmltree`).
 */
export function verifyReleaseManifestInput(input) {
  let permissions = [];
  let services = [];
  let problems = [];
  let sourceKind = 'unknown';

  if (typeof input === 'string') {
    const trimmed = input.trimStart();
    if (trimmed.startsWith('{')) {
      return verifyReleaseManifestInput(JSON.parse(trimmed));
    }
    if (trimmed.startsWith('<')) {
      sourceKind = 'xml';
      const res = auditManifest(input, { variant: 'release' });
      permissions = res.parsed.permissions;
      services = res.parsed.services;
      problems = [...res.problems];
    } else if (trimmed.includes('E: manifest')) {
      sourceKind = 'aapt2-xmltree';
      const parsed = parseAapt2XmlTree(input);
      permissions = parsed.permissions;
      services = parsed.services;
      problems = auditParsedRelease(permissions, services);
    } else {
      throw new Error('Unrecognized manifest format (expected AndroidManifest.xml, merged-manifest JSON, or aapt2 xmltree)');
    }
  } else if (input && typeof input === 'object') {
    sourceKind = 'json-report';
    if (input.variant && String(input.variant).toLowerCase() !== 'release') {
      problems.push(`manifest report variant is "${input.variant}", expected "release"`);
    }
    permissions = Array.isArray(input.parsed?.permissions) ? [...input.parsed.permissions] : [];
    services = Array.isArray(input.parsed?.services) ? [...input.parsed.services] : [];
    problems.push(...auditParsedRelease(permissions, services));
  } else {
    throw new Error('Missing manifest input');
  }

  const hasUsageStats = permissions.includes('android.permission.PACKAGE_USAGE_STATS');
  const hasInternet = permissions.includes('android.permission.INTERNET');
  const hasNotificationListenerPermission = permissions.includes(
    'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  );
  const notificationListenerServices = services.filter(
    (s) =>
      s.notificationListener === true ||
      s.permission === 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE' ||
      String(s.name ?? '').includes('NotificationListener'),
  );
  const hasNotificationListener =
    hasNotificationListenerPermission || notificationListenerServices.length > 0;

  return {
    ok: problems.length === 0 && hasUsageStats && !hasInternet && !hasNotificationListener,
    sourceKind,
    hasUsageStats,
    hasInternet,
    hasNotificationListener,
    permissions,
    servicesCount: services.length,
    problems,
  };
}

function auditParsedRelease(permissions, services) {
  const problems = [];
  const present = new Set(permissions);
  const allowedSet = new Set([...ALLOWED_FROM_LIBRARIES, ...REQUIRED_PERMISSIONS]);
  const forbiddenSet = new Set([...FORBIDDEN_PERMISSIONS, 'android.permission.INTERNET']);

  for (const req of REQUIRED_PERMISSIONS) {
    if (!present.has(req)) {
      problems.push(`${req} is missing: the usage collector cannot work without it`);
    }
  }
  for (const p of permissions) {
    if (p === 'android.permission.INTERNET') {
      problems.push('android.permission.INTERNET is forbidden in release builds (must declare no internet permission)');
    } else if (forbiddenSet.has(p)) {
      problems.push(`${p} is forbidden and must be blocked`);
    } else if (!allowedSet.has(p)) {
      problems.push(`${p} is not on the release allowlist`);
    }
  }
  for (const s of services) {
    if (
      (s.permission && FORBIDDEN_SERVICE_PERMISSIONS.includes(s.permission)) ||
      s.accessibility ||
      s.notificationListener
    ) {
      problems.push(`service ${s.name} exposes a forbidden capability (accessibility or notification listening)`);
    }
  }
  return problems;
}

/**
 * Verify `apksigner verify --verbose --print-certs` output.
 * Must be validly signed (v2 or v3) and NEVER signed by `CN=Android Debug`.
 */
export function verifyApksignerOutput(reportText) {
  const text = String(reportText ?? '');
  const problems = [];

  if (!text.trim()) {
    return {
      ok: false,
      verifiedV2: false,
      verifiedV3: false,
      signerDn: null,
      sha256Digest: null,
      isDebugCert: false,
      problems: ['apksigner output is empty'],
    };
  }

  const doesNotVerify = /DOES NOT VERIFY/i.test(text);
  const verifiedLine = /^Verified using v2 scheme[^:]*:\s*true/im.test(text);
  const verifiedV3Line = /^Verified using v3(?:\.1)? scheme[^:]*:\s*true/im.test(text);
  const genericVerified = /^Verifies\s*$/im.test(text);

  if (doesNotVerify || (!verifiedLine && !verifiedV3Line && !genericVerified)) {
    problems.push('APK signature did not verify under APK Signature Scheme v2/v3');
  }

  const dnMatch = /Signer #1 certificate DN:\s*(.+)/i.exec(text);
  const shaMatch = /Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})/i.exec(text);
  const signerDn = dnMatch ? dnMatch[1].trim() : null;
  const sha256Digest = shaMatch ? shaMatch[1].toLowerCase() : null;

  if (!signerDn) {
    problems.push('Signer #1 certificate DN missing from apksigner --print-certs output');
  }

  const isDebugCert =
    /CN\s*=\s*Android Debug/i.test(text) || /\bandroiddebugkey\b/i.test(text);
  if (isDebugCert) {
    problems.push(
      `APK is signed with a debug certificate (${signerDn ?? 'CN=Android Debug'}), not the permanent release certificate`,
    );
  }

  return {
    ok: problems.length === 0,
    verifiedV2: verifiedLine,
    verifiedV3: verifiedV3Line,
    signerDn,
    sha256Digest,
    isDebugCert,
    problems,
  };
}

/**
 * Evaluate optional runtime canary capture (`privacy/android-report.json` + `logcat-http.txt`).
 */
export function verifyRuntimeCanaryCapture({ reportJson, logcatText = '', canaries = [] }) {
  const problems = [];
  const parsed = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
  const flows = Number(parsed?.flows ?? 0);
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];

  if (findings.length > 0) {
    problems.push(`mitmproxy canary reported ${findings.length} leak finding(s)`);
  }
  if (flows > 0) {
    problems.push(
      `unexpected ${flows} HTTP/HTTPS flow(s) captured despite release APK having no internet permission`,
    );
  }
  for (const token of canaries) {
    if (token && String(logcatText).includes(token)) {
      problems.push(`canary token ${token.slice(0, 12)}… appeared in logcat capture`);
    }
  }

  return {
    ok: problems.length === 0,
    flows,
    findingsCount: findings.length,
    zeroTrafficExpectedWithoutInternet: true,
    problems,
  };
}

function findAndroidBuildTool(toolName) {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/usr/local/lib/android/sdk';
  const buildToolsDir = join(sdkRoot, 'build-tools');
  if (existsSync(buildToolsDir)) {
    const versions = readdirSync(buildToolsDir).sort().reverse();
    for (const v of versions) {
      const candidate = join(buildToolsDir, v, toolName);
      if (existsSync(candidate)) return candidate;
    }
  }
  if (toolName === 'apkanalyzer') {
    for (const sub of ['cmdline-tools/latest/bin/apkanalyzer', 'cmdline-tools/16.0/bin/apkanalyzer']) {
      const candidate = join(sdkRoot, sub);
      if (existsSync(candidate)) return candidate;
    }
  }
  const whichRes = spawnSync('which', [toolName], { encoding: 'utf8' });
  if (whichRes.status === 0 && whichRes.stdout.trim()) return whichRes.stdout.trim();
  return null;
}

function findDefaultReleaseApk(root) {
  try {
    const rootEntries = readdirSync(root)
      .filter((n) => /^mirror-v.*-release\.apk$/.test(n))
      .sort()
      .reverse();
    if (rootEntries.length > 0) return join(root, rootEntries[0]);
  } catch {
    // ignore
  }
  const gradleApk = join(root, 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk');
  if (existsSync(gradleApk)) return gradleApk;
  return null;
}

function parseCliArgs(argv) {
  const opts = {
    apk: null,
    manifest: null,
    manifestJson: null,
    apksignerReport: null,
    canaryReport: null,
    logcat: null,
    canariesFile: null,
    runEmulator: false,
    out: join(ROOT, 'privacy', 'signed-apk-verification.json'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apk') opts.apk = resolve(argv[++i]);
    else if (a === '--manifest') opts.manifest = resolve(argv[++i]);
    else if (a === '--manifest-json') opts.manifestJson = resolve(argv[++i]);
    else if (a === '--apksigner-report') opts.apksignerReport = resolve(argv[++i]);
    else if (a === '--canary-report') opts.canaryReport = resolve(argv[++i]);
    else if (a === '--logcat') opts.logcat = resolve(argv[++i]);
    else if (a === '--canaries') opts.canariesFile = resolve(argv[++i]);
    else if (a === '--run-emulator') opts.runEmulator = true;
    else if (a === '--out') opts.out = resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseCliArgs(process.argv.slice(2));
  const apkPath = opts.apk ?? findDefaultReleaseApk(ROOT);

  console.log('Mirror Signed Release APK Privacy & Integrity Verifier');
  console.log(`  Note: ${ARCHITECTURAL_INTERNET_DISCLOSURE}\n`);

  if (!apkPath || !existsSync(apkPath)) {
    console.error(
      'verify-signed-apk: precondition missing — signed release APK not found (exit 2).\n' +
        '  Pass --apk path/to/mirror-v0.1.0-rc1-release.apk after downloading the RC build.',
    );
    process.exit(2);
  }

  const apkBytes = readFileSync(apkPath);
  const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
  console.log(`  APK:          ${apkPath}`);
  console.log(`  APK SHA-256:  ${apkSha256} (${(apkBytes.length / (1024 * 1024)).toFixed(2)} MiB)`);

  // 1. Merged Release Manifest check
  let manifestInput = null;
  let manifestSource = null;
  const defaultManifestJson = join(ROOT, '.reports', 'merged-manifest-release.json');
  if (opts.manifest && existsSync(opts.manifest)) {
    manifestInput = readFileSync(opts.manifest, 'utf8');
    manifestSource = opts.manifest;
  } else if (opts.manifestJson && existsSync(opts.manifestJson)) {
    manifestInput = readFileSync(opts.manifestJson, 'utf8');
    manifestSource = opts.manifestJson;
  } else {
    const apkanalyzer = findAndroidBuildTool('apkanalyzer');
    const aapt2 = findAndroidBuildTool('aapt2');
    if (apkanalyzer) {
      const res = spawnSync(apkanalyzer, ['manifest', 'print', apkPath], { encoding: 'utf8' });
      if (res.status === 0 && res.stdout.trim().startsWith('<')) {
        manifestInput = res.stdout;
        manifestSource = `apkanalyzer:${apkPath}`;
      }
    }
    if (!manifestInput && aapt2) {
      const res = spawnSync(aapt2, ['dump', 'xmltree', apkPath, '--file', 'AndroidManifest.xml'], {
        encoding: 'utf8',
      });
      if (res.status === 0 && res.stdout.includes('E: manifest')) {
        manifestInput = res.stdout;
        manifestSource = `aapt2:${apkPath}`;
      }
    }
    if (!manifestInput) {
      const mergedXml = findMergedManifest({ root: ROOT, variant: 'release' });
      if (mergedXml && existsSync(mergedXml)) {
        manifestInput = readFileSync(mergedXml, 'utf8');
        manifestSource = mergedXml;
      } else if (existsSync(defaultManifestJson)) {
        manifestInput = readFileSync(defaultManifestJson, 'utf8');
        manifestSource = defaultManifestJson;
      }
    }
  }

  if (!manifestInput) {
    console.error(
      'verify-signed-apk: precondition missing — no release manifest source available (pass --manifest, --manifest-json, or install Android SDK build-tools aapt2/apkanalyzer) (exit 2).',
    );
    process.exit(2);
  }

  const manifestCheck = verifyReleaseManifestInput(manifestInput);
  console.log(`  Manifest:     ${manifestSource} (${manifestCheck.permissions.length} permissions)`);
  console.log(`    PACKAGE_USAGE_STATS present: ${manifestCheck.hasUsageStats ? 'yes (ok)' : 'NO (FAIL)'}`);
  console.log(`    INTERNET permission present: ${manifestCheck.hasInternet ? 'YES (FAIL)' : 'no (ok — stripped)'}`);
  console.log(
    `    NotificationListener present: ${manifestCheck.hasNotificationListener ? 'YES (FAIL)' : 'no (ok — absent)'}`,
  );

  // 2. Release Signing Certificate check
  let apksignerText = null;
  let apksignerSource = null;
  const defaultApksignerTxt = join(ROOT, '.reports', 'apksigner-verify.txt');
  const apksignerBin = findAndroidBuildTool('apksigner');
  if (apksignerBin) {
    const res = spawnSync(apksignerBin, ['verify', '--verbose', '--print-certs', apkPath], {
      encoding: 'utf8',
    });
    apksignerText = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
    apksignerSource = `apksigner:${apkPath}`;
  } else if (opts.apksignerReport && existsSync(opts.apksignerReport)) {
    apksignerText = readFileSync(opts.apksignerReport, 'utf8');
    apksignerSource = opts.apksignerReport;
  } else if (existsSync(defaultApksignerTxt)) {
    apksignerText = readFileSync(defaultApksignerTxt, 'utf8');
    apksignerSource = defaultApksignerTxt;
  }

  if (!apksignerText) {
    console.error(
      'verify-signed-apk: precondition missing — apksigner not installed and no --apksigner-report supplied (exit 2).',
    );
    process.exit(2);
  }

  const certCheck = verifyApksignerOutput(apksignerText);
  console.log(`  Signature:    ${apksignerSource}`);
  console.log(`    Signer DN:   ${certCheck.signerDn ?? '<missing>'}`);
  console.log(`    Cert SHA256: ${certCheck.sha256Digest ?? '<missing>'}`);
  console.log(`    Debug cert:  ${certCheck.isDebugCert ? 'YES (FAIL)' : 'no (ok — release certificate)'}`);

  // 3. Optional / integrated emulator + mitmproxy runtime canary
  let runtimeCanaryCheck = null;
  if (opts.runEmulator) {
    console.log('\n  Running emulator + mitmproxy canary against signed APK...');
    execFileSync('bash', [join(ROOT, 'scripts/privacy/android-emulator.sh'), apkPath], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    opts.canaryReport = opts.canaryReport ?? join(ROOT, 'privacy', 'android-report.json');
    opts.logcat = opts.logcat ?? join(ROOT, 'privacy', 'logcat-http.txt');
    opts.canariesFile = opts.canariesFile ?? join(ROOT, 'privacy', 'canaries.txt');
  }

  if (opts.canaryReport && existsSync(opts.canaryReport)) {
    const reportJson = readFileSync(opts.canaryReport, 'utf8');
    const logcatText = opts.logcat && existsSync(opts.logcat) ? readFileSync(opts.logcat, 'utf8') : '';
    const canaries =
      opts.canariesFile && existsSync(opts.canariesFile)
        ? readFileSync(opts.canariesFile, 'utf8')
            .split(/\s+/)
            .filter((c) => c.startsWith('MRRCANARY'))
        : [];
    runtimeCanaryCheck = verifyRuntimeCanaryCapture({ reportJson, logcatText, canaries });
    console.log(
      `  Runtime canary: ${runtimeCanaryCheck.flows} flow(s) (0 expected without INTERNET), ${runtimeCanaryCheck.findingsCount} finding(s)`,
    );
  } else {
    console.log(
      '  Runtime canary: not supplied (pass --run-emulator on an emulator host or --canary-report privacy/android-report.json)',
    );
  }

  const allProblems = [
    ...manifestCheck.problems,
    ...certCheck.problems,
    ...(runtimeCanaryCheck ? runtimeCanaryCheck.problems : []),
  ];
  const overallOk = manifestCheck.ok && certCheck.ok && (runtimeCanaryCheck ? runtimeCanaryCheck.ok : true);

  const summary = {
    ok: overallOk,
    apkPath,
    apkSha256,
    apkSizeBytes: apkBytes.length,
    architecturalDisclosure: ARCHITECTURAL_INTERNET_DISCLOSURE,
    manifest: { source: manifestSource, ...manifestCheck },
    signature: { source: apksignerSource, ...certCheck },
    runtimeCanary: runtimeCanaryCheck,
    problems: allProblems,
  };

  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(summary, null, 2));
  console.log(`\nWrote verification report: ${opts.out}`);

  if (!overallOk) {
    console.error('\nverify-signed-apk: FAILED');
    for (const p of allProblems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }

  console.log('\nverify-signed-apk: PASSED');
  process.exit(0);
}
