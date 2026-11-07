/**
 * Appearance: Auto (follow the system), Light, or Dark. A display preference only.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Card, Pill, SectionHeader, Text, useTheme, type ThemePreference } from '@mirror/ui';
import { useAppearance } from '../appearance/AppearanceContext';

const OPTIONS: readonly { id: ThemePreference; label: string; hint: string }[] = [
  { id: 'system', label: 'Auto', hint: 'Follows your phone setting' },
  { id: 'light', label: 'Light', hint: 'Always light' },
  { id: 'dark', label: 'Dark', hint: 'Always dark' },
];

export function AppearanceSettings(): React.ReactElement {
  const theme = useTheme();
  const { appearance, setAppearance } = useAppearance();
  const current = OPTIONS.find((o) => o.id === appearance) ?? OPTIONS[0];
  return (
    <View testID="appearance-settings" style={{ gap: theme.space(2) }}>
      <SectionHeader theme={theme} title="Appearance" />
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(2.5) }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
            {OPTIONS.map((o) => (
              <Pill
                key={o.id}
                theme={theme}
                variant="secondary"
                selected={appearance === o.id}
                onPress={() => setAppearance(o.id)}
                accessibilityLabel={`Appearance ${o.label}. ${o.hint}.${appearance === o.id ? ' Selected.' : ''}`}
                testID={`appearance-${o.id}`}
              >
                {appearance === o.id ? `✓ ${o.label}` : o.label}
              </Pill>
            ))}
          </View>
          <Text role="micro" tone="muted" theme={theme}>
            {current.hint}. Your data and numbers are the same in every appearance.
          </Text>
        </View>
      </Card>
    </View>
  );
}
