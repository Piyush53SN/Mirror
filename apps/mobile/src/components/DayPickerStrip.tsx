import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { Pill, Text, useTheme } from '@mirror/ui';
import { formatSpokenDay, toDayStr, useMirrorApp } from '../context/MirrorAppContext';

export function DayPickerStrip(): React.ReactElement {
  const theme = useTheme();
  const { selectedDay, setSelectedDay, setExpandedSessionId, dayOptions } = useMirrorApp();
  const todayKey = toDayStr(Date.now());

  return (
    <View style={{ gap: theme.space(1) }}>
      <Text role="micro" tone="muted" theme={theme}>
        {`Day (last ${dayOptions.length} days)`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: theme.space(1.5), paddingVertical: theme.space(0.5) }}>
          {dayOptions.map((day) => {
            const isSelected = day === selectedDay;
            const isToday = day === todayKey;
            const shortLabel = isToday ? `Today (${day.slice(5)})` : day.slice(5);
            return (
              <Pill
                key={day}
                theme={theme}
                variant={isSelected ? 'primary' : 'secondary'}
                accessibilityLabel={formatSpokenDay(day, isToday, isSelected)}
                onPress={() => {
                  setSelectedDay(day);
                  setExpandedSessionId(null);
                }}
              >
                {shortLabel}
              </Pill>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
