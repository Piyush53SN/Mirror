/**
 * Goal-type picker for the weekly goal editor.
 *
 * Layout is a fixed two-column grid: each cell is 48% of the row (two columns with the
 * gap), the chip fills its cell, and nothing is allowed to shrink it. Labels may wrap to
 * two lines, but they are never truncated (no numberOfLines, no ellipsis, no fixed
 * height). The layout does not depend on the text happening to fit.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Pill, useTheme } from '@mirror/ui';
import type { GoalKind } from '@mirror/core-analytics';

export const GOAL_KIND_OPTIONS: readonly { id: GoalKind; label: string; description: string }[] = [
  {
    id: 'daily_app_foreground',
    label: 'App time/day',
    description: 'Day-clipped foreground time for selected app(s) on each recorded day.',
  },
  {
    id: 'daily_total_foreground',
    label: 'Total time/day',
    description: 'Total day-clipped foreground time across non-excluded apps on each recorded day.',
  },
  {
    id: 'daily_late_night_max',
    label: 'Late-night max',
    description: 'Foreground time during 23:00 to 05:00 local time on each recorded day (0m allowed).',
  },
  {
    id: 'daily_sitting_count_max',
    label: 'Max sittings/day',
    description: 'Merged sitting count per recorded day (optionally scoped to selected apps).',
  },
];

export function GoalTypeOptions({
  value,
  onSelect,
}: {
  value: GoalKind;
  onSelect: (kind: GoalKind) => void;
}): React.ReactElement {
  const theme = useTheme();
  // Styles and handlers are built here, not inline in JSX (keeps the JSX-text scan simple).
  const gridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1.5) } as const;
  const cellStyle = { width: '48%', flexShrink: 0 } as const;
  const chipStyle = { width: '100%', flexShrink: 0 } as const;
  const rows = GOAL_KIND_OPTIONS.map((opt) => ({
    opt,
    selected: value === opt.id,
    press: () => onSelect(opt.id),
  }));
  return (
    <View testID="goal-type-grid" style={gridStyle}>
      {rows.map((row) => (
        <View key={row.opt.id} testID={`goal-kind-cell-${row.opt.id}`} style={cellStyle}>
          <Pill
            testID={`goal-kind-${row.opt.id}`}
            theme={theme}
            variant={row.selected ? 'primary' : 'secondary'}
            onPress={row.press}
            accessibilityLabel={row.selected ? `Goal type ${row.opt.label}, selected` : `Goal type ${row.opt.label}`}
            style={chipStyle}
          >
            {row.opt.label}
          </Pill>
        </View>
      ))}
    </View>
  );
}
