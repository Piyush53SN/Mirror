# Fixtures – real vs synthetic

## device-day-raw.json
Synthetic realistic day with Genshin, YouTube, WhatsApp, Brawl, Reddit, Chrome, includes launcher fg closing, screen-off, invalid_package and orphan. Will be replaced with real capture from phone via debug screen Share button.

## honkai-day-raw.json
**Synthetic, invented** to reproduce Honkai 31s vs OS 52m48s, Genshin 27s vs 9m36s, 336 orphan events. Contains:
- Honkai fg MainActivity at 11:40:00, systemui fg StatusBar at 11:40:31 (notification shade) – old code closed Honkai at 31s, new code does not
- Honkai bg at 12:32:48 (52m48s) – becomes orphan if closed at 31s
- Launcher fg at 12:32:49
- Genshin fg at 12:40:00, systemui fg at 12:40:27 (27s), bg at 12:49:36 (9m36s)
- Honkai fg UnityPlayerActivity at 12:50:00, bg with empty className at 12:51:40, STOPPED at 12:51:40.5 (orphan), SCREEN_NON_INTERACTIVE at 12:51:50

This fixture will be **replaced with real raw events from phone once captured via debug screen**.

### How to capture real Honkai raw events via debug screen

1. Install `mirror-test.apk` from latest CI artifact
2. Grant Usage Access, use Honkai: Star Rail for a real session (e.g., 30-60m)
3. Open Mirror → main screen shows per-app totals from OS (authoritative) and sessions approximate
4. Tap "What this build is" card **7 times** → hidden debug screen appears
5. In debug screen, find card "Honkai/Genshin raw events last 24h" – shows RESUMED/PAUSED/STOPPED with class names
6. Also card "Debug - raw UsageEvents last 24h" → button "Share raw events JSON" → Share → save JSON
7. Filter JSON for Honkai package `com.HoYoverse.hkrpgoversea` and include RESUMED/PAUSED/STOPPED/Destroyed with className and timestamp
8. Replace `honkai-day-raw.json` with that real capture (keep array of objects with packageName, className, eventType, timeStamp)
9. Run `npm run test:packages` – should show totalMs matching OS total (52m48s) with new logic, not 31s
10. Update PROGRESS.md with real numbers and explanation of why old rebuild lost 99%

Real capture will show actual class names (e.g., `com.unity3d.player.UnityPlayerActivity`, `com.HoYoverse.hkrpgoversea.MainActivity`) and actual event sequence that causes orphan.

## Why event rebuild loses 99%

See PROGRESS.md round 8 for detailed explanation: systemui fg closing (notification shade), per-class mismatch, 2s cursor overlap, unknown types CONFIGURATION_CHANGE and FOREGROUND_SERVICE, screen-off.

With OS totals for per-app daily, totals match by construction, timeline is approximate scaled.
