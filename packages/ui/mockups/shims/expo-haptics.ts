/** Test and mockup shim for expo-haptics: every call resolves, nothing vibrates. */
export const selectionAsync = (): Promise<void> => Promise.resolve();
export const impactAsync = (): Promise<void> => Promise.resolve();
export const performAndroidHapticsAsync = (): Promise<void> => Promise.resolve();
export const AndroidHaptics = { Clock_Tick: 'Clock_Tick' } as const;
