import * as React from 'react';
import { View } from 'react-native';
import {
  Card,
  LinkButton,
  Meter,
  Pill,
  Text,
  useTheme,
} from '@mirror/ui';
import { useMirrorApp } from '../context/MirrorAppContext';
import { useResolvedBudgets } from './AttentionBudgetSection';

export function HomeBudgetStrip(): React.ReactElement {
  const theme = useTheme();
  const { setActiveTab } = useMirrorApp();
  const { summary } = useResolvedBudgets();
  const items = summary.items;

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
          {items.map((item) => {
            const label = `${item.name} · ${item.period === 'daily' ? 'Daily' : 'Weekly'}${item.kind === 'group' ? ` (${item.packages.length} apps)` : ''}`;
            return (
              <View key={item.id} testID={`home-budget-item-${item.id}`} style={{ gap: theme.space(0.5) }}>
                <Meter
                  theme={theme}
                  value={item.meterFillRatio}
                  tone={item.enabled ? 'anchor' : 'muted'}
                  label={label}
                  caption={item.statusLine}
                />
                {item.isPartialWindow ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Partial week · ${item.recordedDays} of 7 days recorded (not extrapolated)`}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
}
