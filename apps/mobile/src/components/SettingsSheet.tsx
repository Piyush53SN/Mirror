import * as React from 'react';
import { View } from 'react-native';
import { Sheet, useTheme } from '@mirror/ui';
import { useMirrorApp } from '../context/MirrorAppContext';
import { useSafeInsets } from './useSafeInsets';
import { ReminderSettings } from './ReminderSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { LocalDataControls } from './LocalDataControls';

/**
 * Settings: one place for reminders (+ the single quiet-hours control, which
 * writes the same stored pref the reminder evaluators read) and for your data
 * (export, clear labels, typed DELETE). Layout-only consolidation (P4.4-UX).
 */
export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const { insets: contextInsets } = useMirrorApp();
  const insets = useSafeInsets(contextInsets);
  return (
    <Sheet
      open={open}
      title="Settings"
      subtitle="Reminders and your data · stored on this device"
      onClose={onClose}
      bottomInset={insets.bottom}
      theme={theme}
    >
      <View testID="settings-sheet" style={{ gap: theme.space(5), paddingBottom: theme.space(2) }}>
        <AppearanceSettings />
        <ReminderSettings />
        <LocalDataControls />
      </View>
    </Sheet>
  );
}
