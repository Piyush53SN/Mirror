/**
 * Theme, motion, text scale and the live-blur budget.
 *
 * The provider is deliberately small: it resolves tokens once per accessibility
 * state and hands the result down. Everything a component needs is on the
 * returned theme object, so a component can be rendered in a test with no
 * provider noise (`<ThemeProvider theme={darkTheme()}>`).
 */
import * as React from 'react';
import { AccessibilityInfo } from 'react-native';
import { createTheme, DEFAULT_THEME, type MirrorTheme, type ThemeName, type ThemeOverrides } from './tokens';

type ThemeContextValue = {
  theme: MirrorTheme;
  setTheme: (name: ThemeName) => void;
  toggleTheme: () => void;
  /** Live-blurred layers currently mounted. The budget is 3. */
  liveLayers: number;
  /** Slots in registration order — first come, first blurred (tab bar, then sheet). */
  liveSlots: readonly string[];
  registerLiveLayer: (id: string, budget: number) => () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: React.ReactNode;
  /** Start from this theme; default is the image-derived dark theme. */
  initialTheme?: ThemeName;
  /** Force an accessibility state (tests, Storybook, the mockup renderer). */
  overrides?: ThemeOverrides;
  /** Follow the OS for transparency/motion (default true). */
  followSystem?: boolean;
};

export function ThemeProvider({ children, initialTheme = DEFAULT_THEME, overrides = {}, followSystem = true }: ThemeProviderProps) {
  const [name, setName] = React.useState<ThemeName>(initialTheme);
  const [system, setSystem] = React.useState<{ reduceMotion: boolean; reduceTransparency: boolean }>({
    reduceMotion: false,
    reduceTransparency: false,
  });

  React.useEffect(() => {
    if (!followSystem || !AccessibilityInfo) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v: boolean) => alive && setSystem((s) => ({ ...s, reduceMotion: v })));
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setSystem((s) => ({ ...s, reduceMotion: v })));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, [followSystem]);

  const theme = React.useMemo(
    () =>
      createTheme(name, {
        reducedMotion: overrides.reducedMotion ?? (followSystem ? system.reduceMotion : false),
        reducedTransparency: overrides.reducedTransparency ?? (followSystem ? system.reduceTransparency : false),
        textScale: overrides.textScale,
      }),
    [name, overrides.reducedMotion, overrides.reducedTransparency, overrides.textScale, followSystem, system],
  );

  const [slots, setSlots] = React.useState<string[]>([]);

  const registerLiveLayer = React.useCallback((id: string, budget: number) => {
    setSlots((current) => {
      if (current.includes(id)) return current;
      // Only the first `budget` layers keep a slot; later ones fall back to a
      // pre-composited fill. This is the runtime half of the design-time rule in
      // the token block (glass.blurBudget), and tests assert it directly.
      if (current.length >= budget) return current;
      return [...current, id];
    });
    return () => setSlots((current) => current.filter((s) => s !== id));
  }, []);
  const liveLayers = slots.length;

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setName,
      toggleTheme: () => setName((n) => (n === 'dark' ? 'light' : 'dark')),
      liveLayers,
      liveSlots: slots,
      registerLiveLayer,
    }),
    [theme, slots, liveLayers, registerLiveLayer],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): MirrorTheme {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider> (or pass `theme` explicitly — every component accepts one).');
  return ctx.theme;
}

export function useThemeControls(): Omit<ThemeContextValue, 'theme'> {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeControls must be used inside <ThemeProvider>.');
  return ctx;
}

/**
 * Claims one of the three live-blur slots while mounted, in mount order.
 * Returns whether the claim was granted. When it is not, the surface paints its
 * pre-composited fill instead of blurring — the app degrades quietly rather than
 * dropping frames, which is the point of having a budget at all.
 */
export function useLiveBlur(id: string, enabled = true): boolean {
  const ctx = React.useContext(ThemeContext);
  const register = ctx?.registerLiveLayer;
  const budget = ctx?.theme.glass.blurBudget.liveBlurredLayers ?? 3;

  React.useEffect(() => {
    if (!enabled || !register) return;
    return register(id, budget);
  }, [enabled, id, register, budget]);

  if (!ctx || !enabled) return false;
  return ctx.liveSlots.includes(id);
}

export { ThemeContext };
