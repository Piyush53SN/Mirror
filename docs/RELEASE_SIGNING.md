# Permanent Android Release Signing & GitHub Secrets (v0.1)

Mirror's encrypted local store (`mirror.db` + Android Keystore `expo-secure-store`)
survives in-place app updates **only when consecutive APKs/AABs share the exact
same signing certificate**. If the signing certificate changes, Android refuses
`adb install -r` (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) and requires an uninstall,
which wipes `mirror.db` and `expo-secure-store`.

Never commit a `.keystore` / `.jks` file (`scripts/android/release-preflight.mjs`
fails the build if one exists in the tree), and never paste passwords, base64
keystores, or tokens into chat or shell arguments.

---

## 1. Create the permanent release keystore locally (outside the repo)

Run these commands in a local terminal with JDK 17+ (`keytool`):

```bash
# 1. Create a restricted directory strictly OUTSIDE the Mirror repository
mkdir -p ~/.mirror-signing
chmod 700 ~/.mirror-signing

# 2. Generate a permanent PKCS12 release/upload keystore interactively
#    (DO NOT pass -storepass or -keypass on the command line so they never enter ~/.zsh_history / ~/.bash_history)
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore ~/.mirror-signing/mirror-release.keystore \
  -alias mirror \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=Mirror Release, OU=Mobile, O=Mirror, C=IN"

chmod 600 ~/.mirror-signing/mirror-release.keystore
```

Record two things immediately in your password manager (plus an offline encrypted backup):
1. The `~/.mirror-signing/mirror-release.keystore` file itself.
2. The keystore password and key alias (`mirror`). For PKCS12 keystores, `storePassword` and `keyPassword` are the same passphrase.

Verify the keystore and record the **public** SHA-256 certificate fingerprint:

```bash
keytool -list -v -keystore ~/.mirror-signing/mirror-release.keystore -alias mirror | grep -E "Alias|Valid|SHA256:"
```

---

## 2. Configure GitHub Actions Repository Secrets (zero clipboard/history leaks)

Using the GitHub CLI (`gh auth status` authenticated as repo owner) from your local machine:

```bash
# 1. Upload the base64-encoded release keystore directly via stdin (no temp file left on disk)
base64 < ~/.mirror-signing/mirror-release.keystore | tr -d '\r\n' | gh secret set ANDROID_KEYSTORE_BASE64 --repo Piyush53SN/Mirror

# 2. Set the alias
printf '%s' 'mirror' | gh secret set ANDROID_KEY_ALIAS --repo Piyush53SN/Mirror

# 3. Enter the keystore & key passphrase interactively (prompts securely without echoing)
gh secret set ANDROID_KEYSTORE_PASSWORD --repo Piyush53SN/Mirror
gh secret set ANDROID_KEY_PASSWORD --repo Piyush53SN/Mirror

# 4. Confirm secret names exist (GitHub never prints values)
gh secret list --repo Piyush53SN/Mirror
```

*(Optional — if you also keep debug-signed branch preview builds via `android-build.yml` separate from production releases, ensure `DEBUG_KEYSTORE_BASE64` is also set once so branch test builds keep a stable debug signature across CI runs.)*

---

## 3. Build & verify a release APK / AAB locally

`apps/mobile/plugins/with-release-signing.js` configures `signingConfigs.release` in
`apps/mobile/android/app/build.gradle` to read `MIRROR_UPLOAD_*` from the environment:

```bash
# Prompt for the passphrase into an unexported read -s variable in the current shell only
read -r -s -p "Keystore passphrase: " MIRROR_PW && echo

cd /path/to/Mirror/apps/mobile/android
MIRROR_UPLOAD_STORE_FILE="$HOME/.mirror-signing/mirror-release.keystore" \
MIRROR_UPLOAD_STORE_PASSWORD="$MIRROR_PW" \
MIRROR_UPLOAD_KEY_ALIAS="mirror" \
MIRROR_UPLOAD_KEY_PASSWORD="$MIRROR_PW" \
  ./gradlew :app:assembleRelease :app:bundleRelease --no-daemon

unset MIRROR_PW
```

Verify the signature on the resulting APK and confirm `INTERNET` is absent from the merged release manifest:

```bash
# Verify v2/v3 APK signature & SHA-256 certificate fingerprint
apksigner verify --verbose --print-certs \
  apps/mobile/android/app/build/outputs/apk/release/app-release.apk

# Verify merged release manifest passes the strict release gate (no INTERNET)
npm run android:manifest -- --variant release
```

---

## 4. Wiring `ANDROID_KEYSTORE_*` in `.github/workflows/release.yml` (manual repo-owner edit)

GitHub App tokens without the `workflows` permission cannot push edits to `.github/workflows/*`.
In `.github/workflows/release.yml`, replace the `debug.keystore` signing arguments in the
`Build phone-testable APK` step (or add a signed release step) on `main` via GitHub's workflow editor:

```yaml
      - name: Restore release keystore
        if: ${{ secrets.ANDROID_KEYSTORE_BASE64 != '' }}
        run: |
          install -m 700 -d "$RUNNER_TEMP/signing"
          printf '%s' "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > "$RUNNER_TEMP/signing/release.keystore"
          chmod 600 "$RUNNER_TEMP/signing/release.keystore"

      - name: Build signed release APK & AAB
        env:
          MIRROR_UPLOAD_STORE_FILE: ${{ runner.temp }}/signing/release.keystore
          MIRROR_UPLOAD_STORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          MIRROR_UPLOAD_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          MIRROR_UPLOAD_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          cd apps/mobile/android
          ./gradlew :app:assembleRelease :app:bundleRelease --no-daemon
          cp app/build/outputs/apk/release/app-release.apk "$GITHUB_WORKSPACE/mirror-release.apk"
          cp app/build/outputs/bundle/release/app-release.aab "$GITHUB_WORKSPACE/mirror-release.aab"

      - name: Shred temporary keystore
        if: always()
        run: rm -rf "$RUNNER_TEMP/signing"
```

---

## 5. One-time signature transition on your phone

If your phone currently has `dev.mirror.app` installed from an earlier `debug.keystore`-signed
`mirror-test.apk`, switching to the permanent `mirror-release.keystore` requires **one**
uninstall (`adb uninstall dev.mirror.app`) before installing `app-release.apk`. Every subsequent
release (`v0.1.0`, `v0.1.1`, `v0.2.0`, …) signed with `mirror-release.keystore` will install
in-place (`adb install -r`) and preserve `mirror.db` and `SecureStore` across updates.
