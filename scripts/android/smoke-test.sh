#!/usr/bin/env bash
set -euo pipefail

APK="${1:-}"
if [ -z "$APK" ]; then
  echo "::error::APK path not provided"
  exit 1
fi

echo "=== Smoke test for $APK ==="
echo "--- emulator check ---"
adb devices

echo "--- installing $APK ---"
adb install -r "$APK"

echo "--- checking package installed ---"
adb shell pm list packages | grep dev.mirror.app

echo "--- launching app (must not be masked with || true) ---"
# Try first MainActivity, if that fails try fully qualified - but no || true that hides both failures
if adb shell am start -n dev.mirror.app/.MainActivity; then
  echo "Launch via .MainActivity succeeded"
else
  echo "First launch failed, trying fully qualified dev.mirror.app.MainActivity"
  adb shell am start -n dev.mirror.app/dev.mirror.app.MainActivity
fi

echo "--- waiting 15s for app to start ---"
sleep 15

echo "--- logcat filtered (mirror|WorkDatabase|InitializationProvider|AndroidRuntime|FATAL) ---"
adb logcat -d | grep -i -E "mirror|WorkDatabase|InitializationProvider|AndroidRuntime|FATAL" | head -n 200 || true

echo "--- checking if process is alive (fail if pidof empty) ---"
PID=$(adb shell pidof dev.mirror.app || true)
echo "pidof dev.mirror.app: '$PID'"
if [ -z "$PID" ]; then
  echo "::error::pidof dev.mirror.app is empty after 15s wait - app crashed or did not start"
  echo "--- full logcat tail (last 500 lines) ---"
  adb logcat -d | tail -n 500
  echo "--- filtered logcat for failure ---"
  adb logcat -d | grep -i -E "mirror|WorkDatabase|InitializationProvider|AndroidRuntime|FATAL|Exception" | tail -n 200 || true
  exit 1
fi
echo "Process alive with PID $PID"

echo "--- checking for WorkDatabase crash ---"
if adb logcat -d | grep -i "Failed to create an instance of class androidx.work.impl.WorkDatabase"; then
  echo "::error::Found WorkDatabase crash - R8 keep rules missing"
  echo "--- filtered logcat ---"
  adb logcat -d | grep -i -E "WorkDatabase|mirror|FATAL" | tail -n 100
  exit 1
fi

echo "--- checking for InitializationProvider crash ---"
if adb logcat -d | grep -i "Unable to get provider androidx.startup.InitializationProvider"; then
  echo "::error::Found InitializationProvider crash - WorkManager init failed"
  echo "--- filtered logcat ---"
  adb logcat -d | grep -i -E "InitializationProvider|mirror|FATAL" | tail -n 100
  exit 1
fi

echo "--- checking for FATAL EXCEPTION mentioning dev.mirror.app ---"
if adb logcat -d | grep -i "FATAL EXCEPTION" | grep -i "dev.mirror.app"; then
  echo "::error::Found FATAL EXCEPTION mentioning dev.mirror.app"
  adb logcat -d | grep -i -A 50 "FATAL EXCEPTION"
  exit 1
fi

echo "--- checking for AndroidRuntime FATAL for dev.mirror.app ---"
if adb logcat -d | grep -E "AndroidRuntime" | grep -i "dev.mirror.app" | grep -i "FATAL"; then
  echo "::error::Found AndroidRuntime FATAL for dev.mirror.app"
  adb logcat -d | grep -E "AndroidRuntime" | tail -n 100
  exit 1
fi

echo "--- checking for JSApplicationIllegalArgumentException / accessibilityLabel / ReadableNativeArray crash (round14) ---"
if adb logcat -d | grep -i -E "JSApplicationIllegalArgumentException|accessibilityLabel.*RCTView|ReadableNativeArray.*String|ClassCastException.*ReadableNativeArray"; then
  echo "::error::Found accessibilityLabel crash (ReadableNativeArray cannot be cast to String) – Pill children array bug"
  adb logcat -d | grep -i -B 10 -A 30 -E "JSApplicationIllegalArgumentException|accessibilityLabel|ReadableNativeArray|RCTView|ClassCastException" | tail -n 200
  exit 1
fi

# Also check for any FATAL EXCEPTION at all that might be related
if adb logcat -d | grep -i "FATAL EXCEPTION" | head -n 5; then
  echo "Found some FATAL EXCEPTION (checking if related to mirror):"
  adb logcat -d | grep -i -B 5 -A 30 "FATAL EXCEPTION" | head -n 150
  # Fail if it mentions mirror or WorkDatabase or InitializationProvider or accessibilityLabel crash
  if adb logcat -d | grep -i "FATAL EXCEPTION" | grep -i -E "mirror|WorkDatabase|InitializationProvider|dev.mirror|accessibilityLabel|ReadableNativeArray|RCTView|JSApplicationIllegalArgumentException"; then
    echo "::error::FATAL EXCEPTION related to Mirror found"
    adb logcat -d | grep -i -B 5 -A 50 "FATAL EXCEPTION" | tail -n 300
    exit 1
  fi
  # Also fail on any AndroidRuntime FATAL with ClassCastException (could be a11y bug)
  if adb logcat -d | grep -i "AndroidRuntime" | grep -i -E "FATAL|ClassCastException|ReadableNativeArray"; then
    echo "::error::AndroidRuntime FATAL with ClassCastException found – likely accessibilityLabel array bug"
    adb logcat -d | grep -i -B 5 -A 30 "AndroidRuntime" | tail -n 200
    exit 1
  fi
fi

echo "Smoke test passed - no WorkManager crash, pid alive ($PID), no FATAL EXCEPTION for dev.mirror.app, no accessibilityLabel crash"
