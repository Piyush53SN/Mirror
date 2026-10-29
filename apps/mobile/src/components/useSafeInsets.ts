import { useEffect, useState } from 'react';
import { AppState, Dimensions, Platform, StatusBar } from 'react-native';

export type SafeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function fallbackSafeInsets(): SafeInsets {
  const top = Platform.OS === 'android' ? Math.max(24, StatusBar.currentHeight ?? 28) : 44;
  const bottom = Platform.OS === 'android' ? 20 : 34;
  return { top, bottom, left: 0, right: 0 };
}

export function normalizeSafeInsets(candidate?: Partial<SafeInsets> | null): SafeInsets {
  const fb = fallbackSafeInsets();
  if (!candidate) return fb;
  return {
    top: typeof candidate.top === 'number' && Number.isFinite(candidate.top) ? Math.max(fb.top, Math.ceil(candidate.top)) : fb.top,
    bottom: typeof candidate.bottom === 'number' && Number.isFinite(candidate.bottom) ? Math.max(fb.bottom, Math.ceil(candidate.bottom)) : fb.bottom,
    left: typeof candidate.left === 'number' && Number.isFinite(candidate.left) ? Math.max(0, Math.ceil(candidate.left)) : 0,
    right: typeof candidate.right === 'number' && Number.isFinite(candidate.right) ? Math.max(0, Math.ceil(candidate.right)) : 0,
  };
}

/**
 * Resolves system status-bar, camera-cutout, and navigation-bar safe-area insets
 * in dp, preferring Android `WindowInsets` supplied by `MirrorAppContext` and
 * falling back cleanly to `StatusBar.currentHeight` in tests and mockups.
 */
export function useSafeInsets(contextInsets?: SafeInsets | null): SafeInsets {
  const [fallback, setFallback] = useState<SafeInsets>(() => fallbackSafeInsets());

  useEffect(() => {
    const sync = () => setFallback(fallbackSafeInsets());
    const dimSub = Dimensions.addEventListener('change', sync);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      dimSub.remove();
      appSub.remove();
    };
  }, []);

  return contextInsets ? normalizeSafeInsets(contextInsets) : fallback;
}
