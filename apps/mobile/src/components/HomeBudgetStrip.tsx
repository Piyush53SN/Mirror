import * as React from 'react';
import { Pressable, View } from 'react-native';
import {
  Card,
  LinkButton,
  Pill,
  ProgressRing,
  Text,
  useTheme,
} from '@mirror/ui';
import { useMirrorApp } from '../context/MirrorAppContext';
import { useResolvedBudgets } from './AttentionBudgetSection';

type BudgetItem = ReturnType<typeof useResolvedBudgets>['summary']['items'][number];

/**
 * One budget as a ring with its status line. The ring fills by meterFillRatio (soft: it is
 * capped at full and never turns red). Text is the same status text as before.
 */
function BudgetTile({ item }: { item: BudgetItem }): React.ReactElement {
  const theme = useTheme();
  const label = `${item.name} · ${item.period === 'daily' ? 'Daily' : 'Weekly'}${item.kind === 'group' ? ` (${item.packages.length} apps)` : ''}`;
  const fill = Math.max(0, Math.min(1, item.meterFillRatio));
  return (
    <View testID={`home-budget-item-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3), minHeight: 48 }}>
      <ProgressRing
        value={fill}
        max={1}
        size={64}
        thickness={6}
        theme={theme}
        color={item.enabled ? theme.palette.primaryGradient[0] : theme.color.inkMuted}
        accessibilityLabel={`${label}. ${item.statusLine}`}
      >
        <Text role="micro" theme={theme}>
          {`${Math.round(fill * 100)}%`}
        </Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: theme.space(0.5) }}>
        <Text role="label" theme={theme}>
          {label}
        </Text>
        <Text role="micro" tone="muted" theme={theme}>
          {item.statusLine}
        </Text>
        {item.isPartialWindow ? (
          <Text role="micro" tone="muted" theme={theme}>
            {`Partial week · ${item.recordedDays} of 7 days recorded (not extrapolated)`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Dashed tile that opens Insights to add a budget. Budgets are never created automatically. */
function AddBudgetTile({ onPress }: { onPress: () => void }): React.ReactElement {
  const theme = useTheme();
  return (
    <Pressable
      testID="home-budget-add"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add budget in Insights"
      style={{
        width: '100%',
        minHeight: 56,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.color.inkMuted,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.space(2),
      }}
    >
      <Text role="label" theme={theme}>
        + Add budget
      </Text>
    </Pressable>
  );
}

export function HomeBudgetStrip(): React.ReactElement {
  const theme = useTheme();
  const { setActiveTab } = useMirrorApp();
  const { summary } = useResolvedBudgets();
  const items = summary.items;
  const openInsights = (): void => setActiveTab('insights');

  if (items.length === 0) {
    return (
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View
          testID="home-budget-strip"
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: theme.space(2),
          }}
        >
          <View testID="home-budget-empty" style={{ flex: 1, minWidth: 190, gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              ATTENTION BUDGET · SOFT REFERENCE
            </Text>
            <Text role="label" theme={theme}>
              No attention budgets set
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              Optional daily or weekly targets for an app or group — soft reference only, never blocks apps.
            </Text>
          </View>
          <Pill
            testID="home-budget-setup-btn"
            theme={theme}
            variant="secondary"
            onPress={() => setActiveTab('insights')}
            accessibilityLabel="Set up an attention budget in Insights"
          >
            Set up in Insights
          </Pill>
        </View>
      </Card>
    );
  }

  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="home-budget-strip" style={{ gap: theme.space(2.5) }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: theme.space(2),
          }}
        >
          <View style={{ flex: 1, minWidth: 180, gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              ATTENTION BUDGET · TIER D
            </Text>
            <Text role="title" theme={theme}>
              Attention budgets
            </Text>
          </View>
          <LinkButton
            testID="home-budget-manage-btn"
            theme={theme}
            onPress={() => setActiveTab('insights')}
          >
            Manage in Insights
          </LinkButton>
        </View>

        <View testID="home-budget-list" style={{ gap: theme.space(2) }}>
          {items.map((item) => (
            <BudgetTile key={item.id} item={item} />
          ))}
          <AddBudgetTile onPress={openInsights} />
        </View>
      </View>
    </Card>
  );
}
