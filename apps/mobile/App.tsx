import * as React from 'react';
import { createTheme } from '@mirror/ui';
import { PERSONAS, SCREENS } from '@mirror/ui/screens';
import { renderScreen } from '@mirror/ui/render';

export default function App(): React.ReactElement {
  const theme = createTheme('dark');
  return renderScreen(SCREENS[0]!, PERSONAS[0]!, theme, 'default');
}
