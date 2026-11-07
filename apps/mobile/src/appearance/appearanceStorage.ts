/** Native persistence for the appearance preference (expo-secure-store, plain UI key). */
import * as SecureStore from 'expo-secure-store';
import { parseAppearance } from './AppearanceContext';
import type { ThemePreference } from '@mirror/ui';

export const APPEARANCE_KEY = 'mirror.ui.appearance';

export async function loadAppearance(): Promise<ThemePreference> {
  try {
    return parseAppearance(await SecureStore.getItemAsync(APPEARANCE_KEY));
  } catch {
    return 'system';
  }
}

export function saveAppearance(next: ThemePreference): void {
  SecureStore.setItemAsync(APPEARANCE_KEY, next).catch(() => undefined);
}
