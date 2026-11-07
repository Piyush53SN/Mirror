/** The Refresh glyph for the header icon button. A plain circular arrow, drawn in the given colour. */
import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

export function RefreshIcon({ color, size = 22 }: { color: string; size?: number }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        fill={color}
        d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
      />
    </Svg>
  );
}
