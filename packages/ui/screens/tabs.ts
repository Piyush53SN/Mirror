/**
 * The tab bar's contents — and nothing else.
 *
 * Five sections, in the order the brief's prototype uses: Home, Insights, Journey,
 * Sessions, You. This list is deliberately its own module so that `kit.tsx` (which
 * renders the bar) and `index.tsx` (which maps screens onto tabs) share one source
 * and a test can assert the five labels without importing the whole inventory.
 */
export type TabItemSpec = { id: string; label: string };

export const TAB_ITEMS: TabItemSpec[] = [
  { id: 'home', label: 'Home' },
  { id: 'insights', label: 'Insights' },
  { id: 'journey', label: 'Journey' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'you', label: 'You' },
];
