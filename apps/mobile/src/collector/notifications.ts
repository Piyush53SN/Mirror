/**
 * Opt-in `POST_NOTIFICATIONS` permission helper (Android 13+ / API 33+).
 *
 * Non-negotiable rule:
 *   `requestOptInNotificationPermission` MUST ONLY be called in direct response
 *   to the user turning ON a reminder toggle (`reminderEnabled` or `budgetNoteEnabled`).
 *   It must NEVER run on app startup, foreground resume, or background sync.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import type { UsageSource } from './usageSource';

export const POST_NOTIFICATIONS_PERMISSION = 'android.permission.POST_NOTIFICATIONS';

export type NotificationPermissionOutcome = 'granted' | 'denied';

export async function requestOptInNotificationPermission(
  usage?: Pick<UsageSource, 'areNotificationsEnabled'> | null,
): Promise<NotificationPermissionOutcome> {
  try {
    if (Platform.OS === 'android') {
      const sdkVersion =
        typeof Platform.Version === 'number'
          ? Platform.Version
          : Number.parseInt(String(Platform.Version ?? '0'), 10);
      if (Number.isFinite(sdkVersion) && sdkVersion >= 33 && PermissionsAndroid?.request) {
        const already = PermissionsAndroid.check
          ? await PermissionsAndroid.check(POST_NOTIFICATIONS_PERMISSION as any).catch(() => false)
          : false;
        if (!already) {
          const status = await PermissionsAndroid.request(POST_NOTIFICATIONS_PERMISSION as any);
          if (status !== PermissionsAndroid.RESULTS.GRANTED) {
            return 'denied';
          }
        }
      }
      if (usage && typeof usage.areNotificationsEnabled === 'function') {
        return usage.areNotificationsEnabled() ? 'granted' : 'denied';
      }
      return 'granted';
    }
    return 'granted';
  } catch {
    return 'denied';
  }
}
