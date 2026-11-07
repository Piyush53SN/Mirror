/**
 * Appearance preference (Auto / Light / Dark) as React state. Presentation only: no analytics,
 * scoring, or export reads it. Persistence is injected by App.tsx, so this module has no native
 * imports and stays testable. Default is 'system', which follows the OS light/dark setting.
 */
import * as React from 'react';
import type { ThemePreference } from '@mirror/ui';

const VALID: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function parseAppearance(raw: string | null | undefined): ThemePreference {
  return VALID.includes(raw as ThemePreference) ? (raw as ThemePreference) : 'system';
}

type AppearanceValue = {
  appearance: ThemePreference;
  setAppearance: (next: ThemePreference) => void;
};

const AppearanceContext = React.createContext<AppearanceValue>({
  appearance: 'system',
  setAppearance: () => undefined,
});

export function AppearanceProvider({
  children,
  initial = 'system',
  persist,
}: {
  children: React.ReactNode;
  initial?: ThemePreference;
  persist?: (next: ThemePreference) => void;
}) {
  const [appearance, setState] = React.useState<ThemePreference>(initial);
  // If the stored value arrives after first render, adopt it once.
  React.useEffect(() => setState(initial), [initial]);
  const setAppearance = React.useCallback(
    (next: ThemePreference) => {
      setState(next);
      persist?.(next);
    },
    [persist],
  );
  const value = React.useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceValue {
  return React.useContext(AppearanceContext);
}
