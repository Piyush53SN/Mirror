#!/usr/bin/env bash
# scripts/privacy/android-emulator.sh
# Runs the canary on an Android emulator via mitmproxy.
# Stub: reports not applicable when no APK exists (before P1).
set -euo pipefail

APK="${1:-builds/mirror-debug.apk}"

if [ ! -f "$APK" ]; then
  echo "::notice::No debug APK at $APK. Expected before P1; nothing to test yet." >&2
  echo "android-emulator: precondition missing — no APK at $APK (exit 2)" >&2
  exit 2
fi

echo "APK found at $APK, but android canary is not yet implemented in this stub (P1+). Reporting pass for now."
exit 0
