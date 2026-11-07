/**
 * Goal-type picker for the weekly goal editor.
 *
 * Four full-width stacked options. Each row is a full-width radio with a label and a
 * one-line description. Nothing is sized to fit text: rows take the full width and grow
 * in height, so long text wraps and is never clipped. Labels have no slashes.
 */
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Text, useTheme } from '@mirror/ui';
import type { GoalKind } from '@mirror/core-analytics';

export const GOAL_KIND_OPTIONS: readonly { id: GoalKind; label: string; description: string }[] = [
  {
    id: 'daily_app_foreground',
    label: 'App time',
    description: 'Foreground time for chosen apps, each recorded day.',
  },
  {
    id: 'daily_total_foreground',
    label: 'Total time',
    description: 'Foreground time across all counted apps, each recorded day.',
  },
  {
    id: 'daily_late_night_max',
    label: 'Late-night limit',
    description: 'Time from 23:00 to 05:00 local, each recorded day. Zero is allowed.',
  },
  {
    id: 'daily_sitting_count_max',
    label: 'Sitting limit',
    description: 'Merged sittings per recorded day, optionally for chosen apps.',
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
  // Built outside JSX so the JSX-text scan stays simple.
  const listStyle = { gap: theme.space(2) } as const;
  const rowBase = {
    width: '100%',
    flexShrink: 0,
    minHeight: theme.size.touchTarget,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.space(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
  } as const;
  const rows = GOAL_KIND_OPTIONS.map((opt) => {
    const selected = value === opt.id;
    return {
      opt,
      selected,
      press: () => onSelect(opt.id),
      rowStyle: {
        ...rowBase,
        backgroundColor: selected ? theme.color.anchor : theme.color.card,
        borderColor: selected ? theme.color.anchor : theme.color.borderCard,
      },
      dotStyle: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: selected ? theme.color.onAnchor : theme.color.inkMuted,
        backgroundColor: selected ? theme.color.onAnchor : 'transparent',
      },
      textColour: selected ? theme.color.onAnchor : theme.color.ink,
      subColour: selected ? theme.color.mutedOnAnchor : theme.color.inkMuted,
    };
  });
  return (
    <View testID="goal-type-grid" style={listStyle}>
      {rows.map((row) => (
        <Pressable
          key={row.opt.id}
          testID={`goal-kind-${row.opt.id}`}
          onPress={row.press}
          accessibilityRole="radio"
          accessibilityState={{ selected: row.selected }}
          accessibilityLabel={`${row.opt.label}. ${row.opt.description}${row.selected ? ' Selected.' : ''}`}
          style={row.rowStyle}
        >
          <View style={row.dotStyle} />
          <View style={{ flex: 1, gap: theme.space(0.5), minWidth: 0 }}>
            <Text role="label" theme={theme} style={{ color: row.textColour }}>
              {row.opt.label}
            </Text>
            <Text role="micro" theme={theme} style={{ color: row.subColour }}>
              {row.opt.description}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
