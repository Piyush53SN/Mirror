/**
 * One light tick on a deliberate tap. Uses expo-haptics' selection feedback, which is a
 * short haptic and never a sound. Failure is silent: haptics are optional.
 */
import * as Haptics from 'expo-haptics';

export function tapFeedback(): void {
  Haptics.selectionAsync().catch(() => undefined);
}
