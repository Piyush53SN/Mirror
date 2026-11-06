import * as React from 'react';
import { View } from 'react-native';
import { Callout, Divider, Pill, SectionHeader, Surface, Text, useTheme } from '@mirror/ui';
import { DEFAULT_WEEKLY_REPORT_PREFS, type WeeklyReportPrefs } from '@mirror/store';
import { NIGHT_WINDOW, formatWindowLabel } from '@mirror/shared-types';
import { MIUI_BEST_EFFORT_REMINDER_NOTE } from '@mirror/core-analytics';
import { useMirrorApp } from '../context/MirrorAppContext';
import { IntentCheckSettings } from './IntentCheckSettings';

const WEEKDAY_OPTIONS: readonly { day: 0 | 1 | 2 | 3 | 4 | 5 | 6; short: string; spoken: string }[] = [
  { day: 0, short: 'Sun', spoken: 'Sunday' },
  { day: 1, short: 'Mon', spoken: 'Monday' },
  { day: 2, short: 'Tue', spoken: 'Tuesday' },
  { day: 3, short: 'Wed', spoken: 'Wednesday' },
  { day: 4, short: 'Thu', spoken: 'Thursday' },
  { day: 5, short: 'Fri', spoken: 'Friday' },
  { day: 6, short: 'Sat', spoken: 'Saturday' },
];

/** Reminder quiet-hour presets. The first entry is the shared night window (default). */
const QUIET_HOUR_PRESETS: readonly { startHour: number; endHour: number; id: string }[] = [
  { startHour: NIGHT_WINDOW.startHour, endHour: NIGHT_WINDOW.endHour, id: 'night' },
  { startHour: 22, endHour: 7, id: 'late' },
  { startHour: 0, endHour: 6, id: 'after_midnight' },
];

const DAYTIME_HOUR_OPTIONS: readonly { hour: number; label: string }[] = [
  { hour: 9, label: '09:00' },
  { hour: 12, label: '12:00' },
  { hour: 19, label: '19:00' },
  { hour: 21, label: '21:00' },
];


/**
 * Settings → Reminders. Single control for reminder quiet hours (stored in
 * weeklyReportPrefs.quietHoursStartHour/EndHour). Reminders are off by default and
 * only request POST_NOTIFICATIONS after the user turns a toggle on.
 */
export function ReminderSettings(): React.ReactElement {
  const theme = useTheme();
  const {
    weeklyReportPrefs: ctxPrefs,
    updateWeeklyReportPrefs,
    openNotificationSettings,
  } = useMirrorApp();

  const [fallbackPrefs, setFallbackPrefs] = React.useState<WeeklyReportPrefs>(() => ({
    ...DEFAULT_WEEKLY_REPORT_PREFS,
  }));
  const prefs = ctxPrefs ?? fallbackPrefs;

  const [reminderNotice, setReminderNotice] = React.useState<string | null>(null);
  const quietLabel = formatWindowLabel({
    startHour: prefs.quietHoursStartHour,
    endHour: prefs.quietHoursEndHour,
  });
  const [savingPrefs, setSavingPrefs] = React.useState(false);

  const handleUpdatePrefs = React.useCallback(
    async (patch: Partial<Omit<WeeklyReportPrefs, 'updatedAtMs'>>) => {
      setReminderNotice(null);
      setSavingPrefs(true);
      try {
        if (updateWeeklyReportPrefs) {
          const res = await updateWeeklyReportPrefs(patch);
          if (!res.ok) {
            if (res.reason === 'permission_denied') {
              setReminderNotice(
                'Notifications are turned off for Mirror in Android settings, so local reminders stay off until notification permission is allowed.',
              );
            } else {
              setReminderNotice('Could not update reminder settings right now.');
            }
          }
        } else {
          setFallbackPrefs((prev) => ({
            ...prev,
            ...patch,
            updatedAtMs: Date.now(),
          }));
        }
      } finally {
        setSavingPrefs(false);
      }
    },
    [updateWeeklyReportPrefs],
  );

  return (
    <View testID="settings-reminders" style={{ gap: theme.space(3) }}>
      {/* P4.4c: Intent Check (off by default; its own opt-in) */}
      <IntentCheckSettings />

      {/* 3. Opt-in Local Reminder & Optional Gentle Budget Note */}
      <Surface theme={theme}>
        <View testID="insights-reminders-card" style={{ gap: theme.space(2.5) }}>
          <View style={{ gap: theme.space(0.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              OPT-IN LOCAL NOTIFICATIONS · OFF BY DEFAULT
            </Text>
            <SectionHeader
              theme={theme}
              title="Local reminders"
              caption={`permission requested only if you turn a toggle on · quiet hours ${quietLabel}`}
            />
          </View>

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
              <Text role="label" theme={theme}>
                Weekly summary reminder
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                Calm local note once a week when your 7-day report is ready.
              </Text>
            </View>
            <Pill
              testID="weekly-reminder-toggle"
              theme={theme}
              variant={prefs.reminderEnabled ? 'primary' : 'secondary'}
              disabled={savingPrefs}
              onPress={() => handleUpdatePrefs({ reminderEnabled: !prefs.reminderEnabled })}
              accessibilityLabel={`Weekly summary reminder, currently ${prefs.reminderEnabled ? 'on' : 'off'}`}
            >
              {prefs.reminderEnabled ? 'On' : 'Off'}
            </Pill>
          </View>

          {prefs.reminderEnabled ? (
            <View testID="weekly-reminder-schedule" style={{ gap: theme.space(1.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                PREFERRED DAY & DAYTIME HOUR (OUTSIDE {quietLabel.toUpperCase()} QUIET HOURS)
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(1), flexWrap: 'wrap' }}>
                {WEEKDAY_OPTIONS.map((w) => (
                  <Pill
                    key={w.day}
                    testID={`reminder-weekday-${w.day}`}
                    theme={theme}
                    variant={prefs.reminderWeekday === w.day ? 'primary' : 'secondary'}
                    disabled={savingPrefs}
                    onPress={() => handleUpdatePrefs({ reminderWeekday: w.day })}
                    accessibilityLabel={`Reminder day ${w.spoken}${prefs.reminderWeekday === w.day ? ', selected' : ''}`}
                  >
                    {w.short}
                  </Pill>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: theme.space(1), flexWrap: 'wrap' }}>
                {DAYTIME_HOUR_OPTIONS.map((h) => (
                  <Pill
                    key={h.hour}
                    testID={`reminder-hour-${h.hour}`}
                    theme={theme}
                    variant={prefs.reminderHourLocal === h.hour ? 'primary' : 'secondary'}
                    disabled={savingPrefs}
                    onPress={() => handleUpdatePrefs({ reminderHourLocal: h.hour })}
                    accessibilityLabel={`Reminder time ${h.label}${prefs.reminderHourLocal === h.hour ? ', selected' : ''}`}
                  >
                    {h.label}
                  </Pill>
                ))}
              </View>
            </View>
          ) : null}

          <Divider theme={theme} />

          <View testID="reminder-quiet-hours" style={{ gap: theme.space(1.5) }}>
            <Text role="label" theme={theme}>
              Reminder quiet hours
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              No reminder or note is posted inside this window. Default is the night window {quietLabel}. Your goals and score are not affected.
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space(1), flexWrap: 'wrap' }}>
              {QUIET_HOUR_PRESETS.map((preset) => {
                const selected =
                  prefs.quietHoursStartHour === preset.startHour &&
                  prefs.quietHoursEndHour === preset.endHour;
                const presetLabel = formatWindowLabel({
                  startHour: preset.startHour,
                  endHour: preset.endHour,
                });
                return (
                  <Pill
                    key={preset.id}
                    testID={`quiet-hours-${preset.id}`}
                    theme={theme}
                    variant={selected ? 'primary' : 'secondary'}
                    disabled={savingPrefs}
                    onPress={() =>
                      handleUpdatePrefs({
                        quietHoursStartHour: preset.startHour,
                        quietHoursEndHour: preset.endHour,
                      })
                    }
                    accessibilityLabel={`Reminder quiet hours ${presetLabel}${selected ? ', selected' : ''}`}
                  >
                    {presetLabel}
                  </Pill>
                );
              })}
            </View>
          </View>

          <Divider theme={theme} />

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
              <Text role="label" theme={theme}>
                Gentle budget note
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                Optional calm one-time note when an active soft budget goes over its target (never blocks apps).
              </Text>
            </View>
            <Pill
              testID="budget-note-toggle"
              theme={theme}
              variant={prefs.budgetNoteEnabled ? 'primary' : 'secondary'}
              disabled={savingPrefs}
              onPress={() =>
                handleUpdatePrefs({ budgetNoteEnabled: !Boolean(prefs.budgetNoteEnabled) })
              }
              accessibilityLabel={`Gentle budget note, currently ${prefs.budgetNoteEnabled ? 'on' : 'off'}`}
            >
              {prefs.budgetNoteEnabled ? 'On' : 'Off'}
            </Pill>
          </View>

          {reminderNotice ? (
            <View testID="reminder-permission-notice" style={{ gap: theme.space(1.5) }}>
              <Callout theme={theme} tone="limit">
                {reminderNotice}
              </Callout>
              {openNotificationSettings ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Pill
                    testID="open-notification-settings-btn"
                    theme={theme}
                    variant="secondary"
                    onPress={openNotificationSettings}
                    accessibilityLabel="Open Android notification settings for Mirror"
                  >
                    Open notification settings
                  </Pill>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text role="micro" tone="muted" theme={theme}>
            {MIUI_BEST_EFFORT_REMINDER_NOTE}
          </Text>
        </View>
      </Surface>
    </View>
  );
}
