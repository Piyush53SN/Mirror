import React from 'react';
import { ThemeProvider, type ThemePreference } from '@mirror/ui';
import { MirrorAppProvider } from './src/MirrorAppProvider';
import { MirrorTabShell } from './src/MirrorTabShell';
import { AppearanceProvider, useAppearance } from './src/appearance/AppearanceContext';
import { loadAppearance, saveAppearance } from './src/appearance/appearanceStorage';

function ThemedApp() {
  const { appearance } = useAppearance();
  return (
    <ThemeProvider appearance={appearance}>
      <MirrorAppProvider>
        <MirrorTabShell />
      </MirrorAppProvider>
    </ThemeProvider>
  );
}

export default function App() {
  const [initial, setInitial] = React.useState<ThemePreference>('system');
  React.useEffect(() => {
    let alive = true;
    loadAppearance().then((value) => alive && setInitial(value));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <AppearanceProvider initial={initial} persist={saveAppearance}>
      <ThemedApp />
    </AppearanceProvider>
  );
}
