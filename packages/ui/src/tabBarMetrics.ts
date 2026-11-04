/**
 * Bottom tab bar geometry in one place (P4.4-UX bottom nav fix).
 *
 * Everything is measured from the physical bottom edge of the screen:
 *   - the solid canvas band reaches past the TOP edge of the bar and always covers
 *     the system navigation inset, so scrolling text never shows through the bar's
 *     surroundings or under the gesture / 3-button bar;
 *   - the two translucent fade bands sit above the solid band only;
 *   - the bar and its opaque backing share `barBottom`, so they cannot drift apart.
 */
export type TabBarMetricsInput = {
  /** Android system navigation inset in dp (from safe-area insets, never below fallback). */
  insetsBottom: number;
  /** Visual height of the floating tab bar in dp. */
  tabBarHeight: number;
  /** Theme spacing function (space(n) -> dp). */
  space: (n: number) => number;
};

export type TabBarMetrics = {
  /** Reserve above the system navigation inset (overlay bottom). */
  navBarReserve: number;
  /** Gap between the bar's bottom edge and the overlay bottom. */
  barBottom: number;
  /** Distance from the screen bottom to the top edge of the bar. */
  barTop: number;
  /** Height of each translucent fade band (two of them). */
  fadeBandHeight: number;
  /** Solid canvas band, measured from the screen bottom. */
  solidBandHeight: number;
  /** Whole bottom scrim: solid band + two fade bands. */
  scrimHeight: number;
};

export function tabBarMetrics({ insetsBottom, tabBarHeight, space }: TabBarMetricsInput): TabBarMetrics {
  const navBarReserve = Math.max(insetsBottom, space(5));
  const barBottom = space(4);
  const barTop = navBarReserve + barBottom + tabBarHeight;
  const fadeBandHeight = space(2);
  const solidBandHeight = barTop + space(2);
  return {
    navBarReserve,
    barBottom,
    barTop,
    fadeBandHeight,
    solidBandHeight,
    scrimHeight: solidBandHeight + 2 * fadeBandHeight,
  };
}
