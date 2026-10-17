#!/usr/bin/env bash
# Build the Android app and run the merged-manifest gate on the artifact.
#
# This is the only script that can produce the file the gate exists to read.
# It is deliberately loud about preconditions: no JDK or no Android SDK is a
# *precondition failure* (exit 2), not a clean run, and never a pass.
#
# Usage:
#   scripts/android/build-and-gate.sh            # debug APK
#   scripts/android/build-and-gate.sh --release  # release AAB (needs signing)
#
# Exit codes: 0 build + gate clean · 1 build or gate failed · 2 precondition missing.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/apps/mobile"
VARIANT="debug"
TASK=":app:assembleDebug"
if [[ "${1:-}" == "--release" ]]; then
  VARIANT="release"
  TASK=":app:bundleRelease"
fi

missing=()
command -v java >/dev/null 2>&1 || missing+=("java (JDK 17+)")
if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  missing+=("ANDROID_HOME or ANDROID_SDK_ROOT (Android SDK with platform-tools, platforms;android-36, build-tools)")
fi
[[ -x "$APP/android/gradlew" ]] || missing+=("apps/mobile/android/gradlew (run: cd apps/mobile && npx expo prebuild --platform android)")

if (( ${#missing[@]} > 0 )); then
  echo "build-and-gate: cannot build — preconditions missing:" >&2
  for item in "${missing[@]}"; do echo "  - $item" >&2; done
  echo "" >&2
  echo "This is MANUAL. On a workstation with the Android SDK:" >&2
  echo "  1. cd apps/mobile/android && ./gradlew $TASK" >&2
  echo "  2. cd $ROOT && npm run android:manifest" >&2
  exit 2
fi

# The build downloads AGP, Kotlin and AndroidX from Maven; if this machine cannot
# reach them, that is a precondition failure too, not a code failure.
if ! curl -fsS -o /dev/null --max-time 8 https://repo.maven.apache.org/maven2/ 2>/dev/null; then
  echo "build-and-gate: repo.maven.apache.org is unreachable — dependencies cannot resolve." >&2
  echo "  This is an offline/precondition failure (exit 2), not a build failure." >&2
  exit 2
fi

echo "build-and-gate: $TASK"
( cd "$APP/android" && ./gradlew "$TASK" --no-daemon ) || { echo "build-and-gate: Gradle failed" >&2; exit 1; }

echo "build-and-gate: merged-manifest gate"
( cd "$ROOT" && npm run --silent android:manifest -- --variant "$VARIANT" ) || exit 1

echo "build-and-gate: clean"
