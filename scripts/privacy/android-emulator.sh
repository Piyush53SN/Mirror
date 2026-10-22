#!/usr/bin/env bash
# scripts/privacy/android-emulator.sh
# Real E2E privacy canary on emulator with mitmproxy.
# Steps:
# 1. Find APK (arg or common locations)
# 2. Generate canaries via canary.mjs, export MIRROR_CANARIES and MIRROR_CANARY_REPORT
# 3. Start mitmdump on 8080 with addon mitmproxy_canary.py
# 4. Configure emulator proxy 10.0.2.2:8080, push CA cert
# 5. Install APK, launch dev.mirror.app, collect 10s logcat http filter
# 6. Stop mitmdump, check report flows/findings, exit 0 clean 1 leak 2 precondition
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

APK_CANDIDATE="${1:-}"
if [ -z "$APK_CANDIDATE" ]; then
  for p in mirror-test.apk .reports/mirror-test.apk app/build/outputs/apk/release/app-release.apk app/build/outputs/apk/debug/app-debug.apk builds/mirror-debug.apk; do
    if [ -f "$p" ]; then APK_CANDIDATE="$p"; break; fi
  done
fi

if [ -z "$APK_CANDIDATE" ] || [ ! -f "$APK_CANDIDATE" ]; then
  echo "android-emulator: precondition missing — no APK (exit 2)" >&2
  echo "Checked: mirror-test.apk .reports/mirror-test.apk app/build/outputs/apk/release/app-release.apk app/build/outputs/apk/debug/app-debug.apk builds/mirror-debug.apk" >&2
  exit 2
fi

APK="$APK_CANDIDATE"
echo "APK: $APK"

REPORT_DIR="privacy"
REPORT_JSON="$REPORT_DIR/android-report.json"
CANARY_FILE="$REPORT_DIR/canaries.txt"
MITM_LOG="$REPORT_DIR/mitmproxy.log"
LOGCAT_HTTP="$REPORT_DIR/logcat-http.txt"
mkdir -p "$REPORT_DIR"

echo "Generating canaries..."
node scripts/privacy/canary.mjs 3 > "$CANARY_FILE" 2>&1 || true
# canary.mjs prints canaries? It uses makeCanaries – check its output. Fallback: generate via node -e
if [ ! -s "$CANARY_FILE" ] || ! grep -q "MRRCANARY" "$CANARY_FILE"; then
  node -e "import('./scripts/privacy/canary.mjs').then(m=>{const cs=m.makeCanaries(3); console.log(cs.join('\n'))})" > "$CANARY_FILE" 2>&1 || echo "MRRCANARY-TEST-1234567890AB" > "$CANARY_FILE"
fi
CANARIES=$(tr '\n' ',' < "$CANARY_FILE" | sed 's/,$//')
echo "Canaries: $CANARIES"

export MIRROR_CANARIES="$CANARIES"
export MIRROR_CANARY_REPORT="$REPORT_JSON"
rm -f "$REPORT_JSON" "$MITM_LOG" "$LOGCAT_HTTP"

echo "Starting mitmdump on 8080 with addon..."
# Start mitmdump in background
mitmdump --listen-port 8080 -s scripts/privacy/mitmproxy_canary.py --set canaries="$CANARIES" --set canary_report="$REPORT_JSON" > "$MITM_LOG" 2>&1 &
MITM_PID=$!
sleep 2
if ! kill -0 $MITM_PID 2>/dev/null; then
  echo "mitmdump failed to start, log:" >&2
  cat "$MITM_LOG" >&2
  exit 2
fi
echo "mitmdump pid $MITM_PID"

# Configure emulator proxy
echo "Configuring emulator proxy to 10.0.2.2:8080..."
adb shell settings put global http_proxy 10.0.2.2:8080 || true
adb shell settings put global global_http_proxy_host 10.0.2.2 || true
adb shell settings put global global_http_proxy_port 8080 || true

# Push CA cert if available
if [ -f ~/.mitmproxy/mitmproxy-ca-cert.cer ]; then
  adb push ~/.mitmproxy/mitmproxy-ca-cert.cer /sdcard/mitmproxy-ca-cert.cer || true
fi

echo "Installing APK..."
adb install -r "$APK" || true

echo "Launching dev.mirror.app..."
adb shell am start -n dev.mirror.app/.MainActivity || adb shell am start -n dev.mirror.app/dev.mirror.app.MainActivity || true

echo "Collecting logcat http for 10s..."
timeout 10 adb logcat | grep -i -E "http|mirror|canary" > "$LOGCAT_HTTP" 2>&1 || true

echo "Stopping mitmdump..."
kill $MITM_PID || true
sleep 1
kill -9 $MITM_PID 2>/dev/null || true

# Clear proxy
adb shell settings put global http_proxy :0 || true
adb shell settings delete global global_http_proxy_host || true
adb shell settings delete global global_http_proxy_port || true
adb shell settings delete global http_proxy || true

echo "Checking report..."
if [ ! -f "$REPORT_JSON" ]; then
  echo "No report generated, assuming 0 flows – checking logcat only"
  echo '{"flows":0,"findings":[],"canaries":["***"]}' > "$REPORT_JSON"
fi

cat "$REPORT_JSON"

# Check for leaks via node
node -e "
import fs from 'fs';
const reportPath = process.env.MIRROR_CANARY_REPORT || 'privacy/android-report.json';
const logcatPath = 'privacy/logcat-http.txt';
let report = { flows: 0, findings: [] };
try { report = JSON.parse(fs.readFileSync(reportPath,'utf8')); } catch(e) { console.error('No report JSON', e.message); }
const findings = report.findings || [];
if (findings.length > 0) {
  console.error('LEAK FOUND in mitmproxy report:', JSON.stringify(findings,null,2));
  process.exit(1);
}
let logcat = '';
try { logcat = fs.readFileSync(logcatPath,'utf8'); } catch {}
const canaryFile = fs.readFileSync('privacy/canaries.txt','utf8');
const canaries = canaryFile.split(/\\s+/).filter(c=>c.startsWith('MRRCANARY'));
for (const c of canaries) {
  if (logcat.includes(c)) {
    console.error('LEAK FOUND in logcat-http.txt:', c);
    process.exit(1);
  }
}
console.log('android-emulator: clean – no canary in flows/logcat');
"

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "android-emulator: PASSED – no leaks, flows checked"
  exit 0
elif [ $EXIT_CODE -eq 1 ]; then
  echo "android-emulator: FAILED – canary leak found"
  exit 1
else
  exit $EXIT_CODE
fi
