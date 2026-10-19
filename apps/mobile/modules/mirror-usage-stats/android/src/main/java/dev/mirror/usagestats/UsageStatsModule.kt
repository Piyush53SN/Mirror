package dev.mirror.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
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
      // The OS may have no events for a window that is too old; an empty list is a
      // legitimate answer, not an error.
      val events = manager.queryEvents(sinceMs.toLong(), untilMs.toLong()) ?: return@Function emptyList<Map<String, Any?>>()
      val out = ArrayList<Map<String, Any?>>()
      val event = UsageEvents.Event()
      while (events.getNextEvent(event)) {
        val row = HashMap<String, Any?>()
        row["packageName"] = event.packageName
        row["className"] = event.className
        row["eventType"] = event.eventType
        row["timeStamp"] = event.timeStamp
        out.add(row)
      }
      out
    }

    Function("getAppLabels") { packages: List<String> ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "no Android context", null)
      val pm = context.packageManager
      val out = ArrayList<Map<String, String>>()
      for (pkg in packages) {
        try {
          // getApplicationInfo with 0 works on API <33; on 33+ it still works via compat,
          // but we try the new API first when available.
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
  }

  private fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    if (mode == AppOpsManager.MODE_DEFAULT) {
      // Some OEMs report DEFAULT when the app-level special access is granted.
      return context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
