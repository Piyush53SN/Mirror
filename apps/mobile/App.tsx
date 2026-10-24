import React from 'react';
import { ThemeProvider } from '@mirror/ui';
import { MirrorAppProvider } from './src/MirrorAppProvider';
import { MirrorTabShell } from './src/MirrorTabShell';

export default function App() {
  return (
    <ThemeProvider initialTheme="dark">
      <MirrorAppProvider>
        <MirrorTabShell />
      </MirrorAppProvider>
    </ThemeProvider>
  );
}
