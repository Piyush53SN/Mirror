import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { Pill, Text, useTheme } from '@mirror/ui';
import { formatSpokenDay, toDayStr, useMirrorApp } from '../context/MirrorAppContext';

export function DayPickerStrip(): React.ReactElement {
  const theme = useTheme();
  const { selectedDay, setSelectedDay, setExpandedSessionId, dayOptions } = useMirrorApp();
  const todayKey = toDayStr(Date.now());
  const isTodaySelected = selectedDay === todayKey;

  return (
    <View testID="day-picker-strip" style={{ gap: theme.space(1), paddingTop: theme.space(1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: theme.space(1) }}>
        <Text role="micro" tone="muted" theme={theme}>
          {`Day (last ${dayOptions.length} days)`}
        </Text>
        {isTodaySelected ? (
          <Text role="micro" tone="muted" theme={theme}>
            Today so far, provisional
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingVertical: theme.space(1),
          paddingHorizontal: theme.space(0.5),
        }}
      >
        <View style={{ flexDirection: 'row', gap: theme.space(1.5) }}>
          {dayOptions.map((day) => {
            const isSelected = day === selectedDay;
            const isToday = day === todayKey;
            const shortLabel = isToday ? `Today (${day.slice(5)})` : day.slice(5);
            const spoken = isToday
              ? `${formatSpokenDay(day, true, false)}, Today so far, provisional${isSelected ? ', selected' : ''}`
              : formatSpokenDay(day, false, isSelected);
            return (
              <Pill
                key={day}
                theme={theme}
                variant={isSelected ? 'primary' : 'secondary'}
                accessibilityLabel={spoken}
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
