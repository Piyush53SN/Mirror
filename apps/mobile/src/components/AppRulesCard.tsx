import * as React from 'react';
import { View } from 'react-native';
import { APP_RULE_DEFINITION, type AppRuleCoverage, describeRuleCoverage } from '@mirror/core-analytics';
import { Card, ConfidenceChip, Pill, Text, useTheme } from '@mirror/ui';

export type AppRuleEntry = { label: 'intentional' | 'mindless'; setAtMs: number };

/**
 * P4.4b: lists the user's own app rules with one-tap removal. Presentational only:
 * it never writes on render, and removal goes through `onRemove` (a user tap).
 */
export function AppRulesCard(props: {
  rules: Record<string, AppRuleEntry>;
  coverage: Record<string, AppRuleCoverage> | undefined;
  appLabel: (app: string) => string;
  onRemove: (app: string) => Promise<void> | void;
}): React.ReactElement {
  const theme = useTheme();
  const { rules, coverage, appLabel, onRemove } = props;
  const entries = Object.entries(rules).sort((a, b) => b[1].setAtMs - a[1].setAtMs);

  return (
    <Card theme={theme} style={{ marginBottom: theme.space(2) }}>
      <View style={{ gap: theme.space(1), marginBottom: theme.space(1.5) }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2), alignItems: 'center' }}>
          <Text role="label" theme={theme}>
            App rules
          </Text>
          <ConfidenceChip tiers={['D']} label="your rules (Tier D feedback)" theme={theme} />
        </View>
        <Text role="micro" tone="muted" theme={theme}>
          {APP_RULE_DEFINITION}
        </Text>
      </View>
      {entries.length === 0 ? (
        <Text role="micro" tone="muted" theme={theme}>
          No app rules yet. Open a sitting and choose Always intentional or Always mindless for that app.
        </Text>
      ) : (
        <View style={{ gap: theme.space(2) }}>
          {entries.map(([app, rule]) => {
            const name = appLabel(app);
            const kind = rule.label === 'intentional' ? 'Always intentional' : 'Always mindless';
            return (
              <View
                key={app}
                testID={`app-rule-${app}`}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.color.borderHairline,
                  paddingTop: theme.space(2),
                  gap: theme.space(1),
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space(2) }}>
                  <View style={{ flex: 1 }}>
                    <Text role="label" theme={theme}>
                      {`${name} · ${kind}`}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {describeRuleCoverage(app, coverage?.[app])}
                    </Text>
                  </View>
                  <Pill
                    theme={theme}
                    variant="secondary"
                    accessibilityLabel={`Remove the ${kind} rule for ${name}`}
                    onPress={() => onRemove(app)}
                  >
                    Remove rule
                  </Pill>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
