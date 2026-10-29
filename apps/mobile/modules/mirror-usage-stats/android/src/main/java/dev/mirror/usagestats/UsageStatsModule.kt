package dev.mirror.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Log
import android.view.WindowInsets
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android usage collector's native half.
 *
 * It does exactly two things: report whether Usage Access is granted, and return
 * raw `UsageEvents` rows for a window. Every decision about what a row means —
 * pairing, dropping unclosed intervals, rejecting implausible durations — is made
 * in TypeScript (`@mirror/core-analytics`), where it is tested without a device.
 *
 * Deliberate omissions:
 *   - no accessibility service, no overlay, no screen capture;
 *   - no `QUERY_ALL_PACKAGES`: `UsageEvents` names packages without enumerating
 *     the device;
 *   - no content: package names, class names and timestamps only. The class name
 *     is returned so the JS layer can skip system dialogs, and is not stored.
 *
 * Verified constants against Android SDK (UsageEvents.Event):
 *   ACTIVITY_RESUMED=1, ACTIVITY_PAUSED=2, SCREEN_INTERACTIVE=15,
 *   SCREEN_NON_INTERACTIVE=16, KEYGUARD_SHOWN=17, KEYGUARD_HIDDEN=18,
 *   FOREGROUND_SERVICE_START=19, FOREGROUND_SERVICE_STOP=20,
 *   CONTINUING_FOREGROUND_SERVICE=21, ROLLOVER_FOREGROUND_SERVICE=22,
 *   ACTIVITY_STOPPED=23, ACTIVITY_DESTROYED=24 (hide), FLUSH_TO_DISK=25 (hide),
 *   DEVICE_SHUTDOWN=26, DEVICE_STARTUP=27.
 */
class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MirrorUsageStats")

    Function("hasPermission") {
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      hasUsageAccess(context)
    }

    Function("openSettings") {
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
    }

    Function("queryEvents") { sinceMs: Double, untilMs: Double ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      if (!hasUsageAccess(context)) throw CodedException("NO_PERMISSION", "Usage Access is not granted", null)
      if (untilMs <= sinceMs) return@Function emptyList<Map<String, Any?>>()

      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = manager.queryEvents(sinceMs.toLong(), untilMs.toLong()) ?: return@Function emptyList<Map<String, Any?>>()
      val out = ArrayList<Map<String, Any?>>()
      val event = UsageEvents.Event()
      val invalidCounts = HashMap<String, Int>()
      val pkgRegex = Regex("^[a-zA-Z][a-zA-Z0-9_]*(?:\\.[a-zA-Z0-9_]+)+$")
      while (events.getNextEvent(event)) {
        val pkg = event.packageName ?: ""
        if (pkg.isEmpty() || !pkg.matches(pkgRegex)) {
          invalidCounts[pkg] = (invalidCounts[pkg] ?: 0) + 1
        }
        val row = HashMap<String, Any?>()
        row["packageName"] = event.packageName
        row["className"] = event.className
        row["eventType"] = event.eventType
        row["timeStamp"] = event.timeStamp
        out.add(row)
      }
      if (invalidCounts.isNotEmpty()) {
        val top10 = invalidCounts.entries.sortedByDescending { it.value }.take(10)
        Log.d("MirrorUsageStats", "Top invalid_package: ${top10.joinToString { "'${it.key}'=${it.value}" }}")
      }
      out
    }

    Function("getAppLabels") { packages: List<String> ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      val pm = context.packageManager
      val out = ArrayList<Map<String, String>>()
      for (pkg in packages) {
        try {
          val label = try {
            val ai = if (android.os.Build.VERSION.SDK_INT >= 33) {
              pm.getApplicationInfo(pkg, android.content.pm.PackageManager.ApplicationInfoFlags.of(0))
            } else {
              @Suppress("DEPRECATION")
              pm.getApplicationInfo(pkg, 0)
            }
            pm.getApplicationLabel(ai).toString()
          } catch (e: Exception) {
            pkg
          }
          out.add(mapOf("packageName" to pkg, "label" to label))
        } catch (e: Exception) {
          out.add(mapOf("packageName" to pkg, "label" to pkg))
        }
      }
      out
    }

    Function("queryUsageStats") { sinceMs: Double, untilMs: Double ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      if (!hasUsageAccess(context)) throw CodedException("NO_PERMISSION", "Usage Access is not granted", null)
      if (untilMs <= sinceMs) return@Function emptyList<Map<String, Any?>>()
      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val stats = manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, sinceMs.toLong(), untilMs.toLong()) ?: emptyList()
      val out = ArrayList<Map<String, Any?>>()
      for (s in stats) {
        if (s.totalTimeInForeground <= 0) continue
        val row = HashMap<String, Any?>()
        row["packageName"] = s.packageName
        row["totalTimeInForeground"] = s.totalTimeInForeground
        row["lastTimeUsed"] = s.lastTimeUsed
        row["firstTimeStamp"] = s.firstTimeStamp
        row["lastTimeStamp"] = s.lastTimeStamp
        out.add(row)
      }
      out
    }

    Function("queryEventsDebug") { sinceMs: Double, untilMs: Double ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      if (!hasUsageAccess(context)) throw CodedException("NO_PERMISSION", "Usage Access is not granted", null)
      if (untilMs <= sinceMs) return@Function emptyList<Map<String, Any?>>()
      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = manager.queryEvents(sinceMs.toLong(), untilMs.toLong()) ?: return@Function emptyList<Map<String, Any?>>()
      val out = ArrayList<Map<String, Any?>>()
      val event = UsageEvents.Event()
      val invalidCounts = HashMap<String, Int>()
      val pkgRegex = Regex("^[a-zA-Z][a-zA-Z0-9_]*(?:\\.[a-zA-Z0-9_]+)+$")
      while (events.getNextEvent(event)) {
        val pkg = event.packageName ?: ""
        if (pkg.isEmpty() || !pkg.matches(pkgRegex)) {
          invalidCounts[pkg] = (invalidCounts[pkg] ?: 0) + 1
        }
        val row = HashMap<String, Any?>()
        row["packageName"] = event.packageName
        row["className"] = event.className
        row["eventType"] = event.eventType
        row["timeStamp"] = event.timeStamp
        row["typeName"] = when (event.eventType) {
          0 -> "NONE"
          1 -> "ACTIVITY_RESUMED" // MOVE_TO_FOREGROUND deprecated same value
          2 -> "ACTIVITY_PAUSED" // MOVE_TO_BACKGROUND deprecated same value
          3 -> "END_OF_DAY"
          4 -> "CONTINUE_PREVIOUS_DAY"
          5 -> "CONFIGURATION_CHANGE"
          6 -> "SYSTEM_INTERACTION"
          7 -> "USER_INTERACTION"
          8 -> "SHORTCUT_INVOCATION"
          9 -> "CHOOSER_ACTION"
          10 -> "NOTIFICATION_SEEN"
          11 -> "STANDBY_BUCKET_CHANGED"
          12 -> "NOTIFICATION_INTERRUPTION"
          13 -> "SLICE_PINNED_PRIV"
          14 -> "SLICE_PINNED"
          15 -> "SCREEN_INTERACTIVE"
          16 -> "SCREEN_NON_INTERACTIVE"
          17 -> "KEYGUARD_SHOWN"
          18 -> "KEYGUARD_HIDDEN"
          19 -> "FOREGROUND_SERVICE_START"
          20 -> "FOREGROUND_SERVICE_STOP"
          21 -> "CONTINUING_FOREGROUND_SERVICE"
          22 -> "ROLLOVER_FOREGROUND_SERVICE"
          23 -> "ACTIVITY_STOPPED"
          24 -> "ACTIVITY_DESTROYED"
          25 -> "FLUSH_TO_DISK"
          26 -> "DEVICE_SHUTDOWN"
          27 -> "DEVICE_STARTUP"
          else -> "UNKNOWN_${event.eventType}"
        }
        out.add(row)
      }
      if (invalidCounts.isNotEmpty()) {
        val top10 = invalidCounts.entries.sortedByDescending { it.value }.take(10)
        Log.d("MirrorUsageStats", "Debug Top invalid_package: ${top10.joinToString { "'${it.key}'=${it.value}" }}")
      }
      out
    }

    Function("getLauncherPackages") {
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      try {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).apply {
          addCategory(Intent.CATEGORY_HOME)
        }
        val resolveInfos = if (android.os.Build.VERSION.SDK_INT >= 33) {
          pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
          @Suppress("DEPRECATION")
          pm.queryIntentActivities(intent, 0)
        }
        val pkgs = resolveInfos.mapNotNull { it.activityInfo?.packageName }.distinct()
        Log.d("MirrorUsageStats", "Launchers via HOME: $pkgs")
        pkgs
      } catch (e: Exception) {
        Log.d("MirrorUsageStats", "getLauncherPackages failed: ${e.message}")
        emptyList<String>()
      }
    }

    Function("getWindowInsets") {
      val context = appContext.reactContext ?: return@Function mapOf(
        "top" to 24.0,
        "bottom" to 16.0,
        "left" to 0.0,
        "right" to 0.0
      )
      val density = context.resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
      val rootInsets = appContext.currentActivity?.window?.decorView?.rootWindowInsets
      if (rootInsets != null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          val bars = rootInsets.getInsets(
            WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
          )
          return@Function mapOf(
            "top" to (bars.top / density).toDouble(),
            "bottom" to (bars.bottom / density).toDouble(),
            "left" to (bars.left / density).toDouble(),
            "right" to (bars.right / density).toDouble()
          )
        } else {
          @Suppress("DEPRECATION")
          return@Function mapOf(
            "top" to (rootInsets.systemWindowInsetTop / density).toDouble(),
            "bottom" to (rootInsets.systemWindowInsetBottom / density).toDouble(),
            "left" to (rootInsets.systemWindowInsetLeft / density).toDouble(),
            "right" to (rootInsets.systemWindowInsetRight / density).toDouble()
          )
        }
      }
      val res = context.resources
      val statusId = res.getIdentifier("status_bar_height", "dimen", "android")
      val navId = res.getIdentifier("navigation_bar_height", "dimen", "android")
      val topDp = if (statusId > 0) (res.getDimensionPixelSize(statusId) / density).toDouble() else 24.0
      val bottomDp = if (navId > 0) (res.getDimensionPixelSize(navId) / density).toDouble() else 16.0
      mapOf(
        "top" to topDp,
        "bottom" to bottomDp,
        "left" to 0.0,
        "right" to 0.0
      )
    }
  }

  private fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    if (mode == AppOpsManager.MODE_DEFAULT) {
      return context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
