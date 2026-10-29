#!/usr/bin/env node
/**
 * Verify Android release signing secrets and optionally materialize the upload
 * keystore outside the git workspace (`$RUNNER_TEMP/signing/release.keystore`).
 *
 * Designed for `.github/workflows/release.yml` (and local pre-release checks):
 *   - Fails loudly (`exit 1` with GitHub Actions `::error::` annotation) if ANY
 *     required signing secret is missing, empty, or does not decode to a valid
 *     PKCS#12 / JKS keystore binary.
 *   - Never falls back to `debug.keystore`.
 *   - Never prints secret values, lengths of passwords, or keystore bytes.
 *   - Refuses to write keystore material inside the git repository root.
 *
 * Accepted secret env vars (canonical `docs/RELEASE_SIGNING.md` names first,
 * `MIRROR_UPLOAD_*` aliases accepted for compatibility):
 *   1. `ANDROID_KEYSTORE_BASE64`   (or `MIRROR_UPLOAD_KEYSTORE_BASE64`)
 *   2. `ANDROID_KEYSTORE_PASSWORD` (or `MIRROR_UPLOAD_STORE_PASSWORD`)
 *   3. `ANDROID_KEY_ALIAS`         (or `MIRROR_UPLOAD_KEY_ALIAS`)
 *   4. `ANDROID_KEY_PASSWORD`      (or `MIRROR_UPLOAD_KEY_PASSWORD`)
 *
 * Usage:
 *   node scripts/release/verify-signing-env.mjs \
 *     [--materialize <path-outside-repo>] \
 *     [--github-env <path-to-GITHUB_ENV>] \
 *     [--allow-store-file] \
 *     [--root <repo-root>]
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

function parseArgs(argv) {
  let root = resolve(import.meta.dirname, '..', '..');
  let materialize = null;
  let githubEnv = null;
  let allowStoreFile = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') {
      root = resolve(argv[++i]);
    } else if (a === '--materialize') {
      materialize = argv[++i] ?? '';
    } else if (a === '--github-env') {
      githubEnv = argv[++i] ?? '';
    } else if (a === '--allow-store-file') {
      allowStoreFile = true;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { root, materialize, githubEnv, allowStoreFile };
}

function nonEmptyEnv(env, primary, alias) {
  const p = typeof env[primary] === 'string' ? env[primary].trim() : '';
  if (p.length > 0) return p;
  const a = typeof env[alias] === 'string' ? env[alias].trim() : '';
  if (a.length > 0) return a;
  return '';
}

function isInsideRoot(targetPath, repoRoot) {
  const rel = relative(resolve(repoRoot), resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function isRecognizedKeystoreHeader(buf) {
  if (!buf || buf.length < 32) return false;
  // PKCS#12: DER-encoded ASN.1 PFX SEQUENCE starts with 0x30
  if (buf[0] === 0x30) return true;
  // JKS magic: 0xFEEDFEED
  if (buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfe && buf[3] === 0xed) return true;
  // JCEKS magic: 0xCECECECE
  if (buf[0] === 0xce && buf[1] === 0xce && buf[2] === 0xce && buf[3] === 0xce) return true;
  return false;
}

function decodeStrictBase64(raw) {
  const compact = raw.replace(/\s+/g, '');
  if (compact.length < 44 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return null;
  }
  return Buffer.from(compact, 'base64');
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function main() {
  const { root, materialize, githubEnv, allowStoreFile } = parseArgs(process.argv.slice(2));
  const env = process.env;

  const keystoreB64 = nonEmptyEnv(env, 'ANDROID_KEYSTORE_BASE64', 'MIRROR_UPLOAD_KEYSTORE_BASE64');
  const storeFileEnv = typeof env.MIRROR_UPLOAD_STORE_FILE === 'string' ? env.MIRROR_UPLOAD_STORE_FILE.trim() : '';
  const storePass = nonEmptyEnv(env, 'ANDROID_KEYSTORE_PASSWORD', 'MIRROR_UPLOAD_STORE_PASSWORD');
  const keyAlias = nonEmptyEnv(env, 'ANDROID_KEY_ALIAS', 'MIRROR_UPLOAD_KEY_ALIAS');
  const keyPass = nonEmptyEnv(env, 'ANDROID_KEY_PASSWORD', 'MIRROR_UPLOAD_KEY_PASSWORD');

  const missing = [];
  if (!keystoreB64 && !(allowStoreFile && storeFileEnv)) {
    missing.push('ANDROID_KEYSTORE_BASE64');
  }
  if (!storePass) missing.push('ANDROID_KEYSTORE_PASSWORD');
  if (!keyAlias) missing.push('ANDROID_KEY_ALIAS');
  if (!keyPass) missing.push('ANDROID_KEY_PASSWORD');

  if (missing.length > 0) {
    fail(
      `Missing required Android release signing secret(s): ${missing.join(', ')}. ` +
        'Configure all 4 secrets in GitHub Settings -> Secrets and variables -> Actions (see docs/RELEASE_SIGNING.md). ' +
        'Release builds fail loudly and never fall back to debug.keystore.',
    );
  }

  let keystoreBytes = null;
  let keystoreSource = '';

  if (keystoreB64) {
    keystoreBytes = decodeStrictBase64(keystoreB64);
    if (!keystoreBytes || !isRecognizedKeystoreHeader(keystoreBytes)) {
      const byteLen = keystoreBytes ? keystoreBytes.length : 0;
      fail(
        `ANDROID_KEYSTORE_BASE64 did not decode to a valid PKCS#12 or JKS keystore (${byteLen} bytes decoded). ` +
          'Re-encode your release keystore with `base64 -w 0 release.keystore` (see docs/RELEASE_SIGNING.md).',
      );
    }
    keystoreSource = 'ANDROID_KEYSTORE_BASE64';
  } else {
    const resolvedStore = resolve(storeFileEnv);
    if (isInsideRoot(resolvedStore, root)) {
      fail(`MIRROR_UPLOAD_STORE_FILE (${resolvedStore}) is inside the repository root; keep keystores outside the checkout.`);
    }
    if (!existsSync(resolvedStore) || statSync(resolvedStore).size < 32) {
      fail(`MIRROR_UPLOAD_STORE_FILE does not exist or is empty: ${resolvedStore}`);
    }
    const diskBytes = readFileSync(resolvedStore);
    if (!isRecognizedKeystoreHeader(diskBytes)) {
      fail(`MIRROR_UPLOAD_STORE_FILE is not a valid PKCS#12 or JKS keystore: ${resolvedStore}`);
    }
    keystoreBytes = diskBytes;
    keystoreSource = 'MIRROR_UPLOAD_STORE_FILE';
  }

  if (materialize !== null) {
    if (!materialize.trim()) {
      fail('--materialize requires a non-empty destination path outside the repository.');
    }
    const target = resolve(materialize);
    if (isInsideRoot(target, root)) {
      fail(`Refusing to materialize release keystore inside repository root (${target}). Use $RUNNER_TEMP/signing/release.keystore.`);
    }
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, keystoreBytes, { mode: 0o600 });
    chmodSync(target, 0o600);

    if (githubEnv) {
      appendFileSync(
        resolve(githubEnv),
        `MIRROR_RELEASE_KEYSTORE_PATH=${target}\n`,
        'utf8',
      );
    }
    console.log(
      `Release signing verified (${keystoreSource}, ${keystoreBytes.length} bytes, alias configured) -> materialized at ${target} (0600).`,
    );
    return;
  }

  console.log(
    `Release signing verified (${keystoreSource}, ${keystoreBytes.length} bytes, alias configured).`,
  );
}

main();
