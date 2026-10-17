/**
 * Background collection.
 *
 * One Expo BackgroundTask, registered once, running a single collection pass. On
 * Android it is WorkManager (persisted across reboots — which is why no
 * RECEIVE_BOOT_COMPLETED permission of our own is needed); on iOS it is
 * BGTaskScheduler. The OS decides when it actually runs, so the pass is written to
 * be safe at any interval: it reads a cursor, collects what is new, and is
 * idempotent.
 *
 * The task does no network work and no content work. It writes events to the
 * encrypted store and returns.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { collectUsage } from '@mirror/core-analytics';
import { MirrorStore } from '@mirror/store';
import { nativeUsageSource } from './usageSource';

export const USAGE_COLLECTION_TASK = 'mirror-usage-collection';

type Runtime = { store: MirrorStore };

let runtime: Runtime | null = null;

/** Injected once at app start; the task must not construct a second store. */
export function provideRuntime(next: Runtime): void {
  runtime = next;
}

/**
 * Defines the task. Must run before registration, and must be safe to call more
 * than once (fast refresh, re-entry).
 */
export function defineUsageTask(): void {
  if (TaskManager.isTaskDefined(USAGE_COLLECTION_TASK)) return;
  TaskManager.defineTask(USAGE_COLLECTION_TASK, async () => {
    if (!runtime) return BackgroundTask.BackgroundTaskResult.Failed;
    try {
      const result = await collectUsage(nativeUsageSource(), runtime.store, { now: Date.now() });
      // A missing permission is not a failure: the person may simply not have
      // granted it, and the OS should not retry with backoff for that.
      if (result.status === 'permission-required') return BackgroundTask.BackgroundTaskResult.Success;
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      // A thrown task is retried with backoff by the platform; that is the right
      // behaviour for a transient SQLite error.
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Register the daily collection. Opt-in elsewhere: nothing calls this until the primer grants access. */
export async function registerUsageTask(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
  await BackgroundTask.registerTaskAsync(USAGE_COLLECTION_TASK, { minimumInterval: 24 * 60 });
}

export async function unregisterUsageTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(USAGE_COLLECTION_TASK)) {
    await BackgroundTask.unregisterTaskAsync(USAGE_COLLECTION_TASK);
  }
}
