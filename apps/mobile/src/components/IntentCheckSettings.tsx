/**
 * P4.4c: Settings → Intent Check. Off by default. Turning it on is the only moment
 * notification permission is requested for this feature; if permission is denied the
 * feature still works as an in-app card on Home.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Callout, Card, Divider, Pill, SectionHeader, Text, useTheme } from '@mirror/ui';
import { formatWindowLabel } from '@mirror/shared-types';
import { MIUI_BEST_EFFORT_REMINDER_NOTE } from '@mirror/core-analytics';
import { useMirrorApp } from '../context/MirrorAppContext';

export function IntentCheckSettings(): React.ReactElement {
  const theme = useTheme();
  const { intentCheckPrefs, updateIntentCheck, notificationsAllowed, weeklyReportPrefs } = useMirrorApp();
  const quietLabel = weeklyReportPrefs
    ? formatWindowLabel({ startHour: weeklyReportPrefs.quietHoursStartHour, endHour: weeklyReportPrefs.quietHoursEndHour })
    : '23:00–05:00';
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const enabled = intentCheckPrefs?.enabled === true;
  const paused = intentCheckPrefs?.pausedAfterIgnored === true;
  // Shown only while Intent Check is on and Android notifications are denied (card-only mode).
  const notificationsOff = enabled && notificationsAllowed === false;

  const toggle = async () => {
    if (!updateIntentCheck) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateIntentCheck(!enabled);
    } catch {
      setNotice('Could not update Intent Check right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="intent-check-settings" style={{ gap: theme.space(2.5) }}>
        <View style={{ gap: theme.space(0.5) }}>
          <Text role="micro" tone="muted" theme={theme}>
            OPT-IN · OFF BY DEFAULT
          </Text>
          <SectionHeader
            theme={theme}
            title="Intent Check"
            caption="At most one optional question per day, about one sitting over 5 minutes."
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
              Ask about one sitting a day
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              One tap: Intentional, Mindless or Not sure. Skipping is fine. Nothing is labeled
              unless you tap. Quiet hours are respected.
            </Text>
          </View>
          <Pill
            testID="intent-check-toggle"
            theme={theme}
            variant={enabled ? 'primary' : 'secondary'}
            disabled={busy || !updateIntentCheck}
            onPress={toggle}
            accessibilityLabel={`Intent Check, currently ${enabled ? 'on' : 'off'}`}
          >
            {enabled ? 'On' : 'Off'}
          </Pill>
        </View>

        {notificationsOff ? (
          <View testID="intent-check-notifications-off">
            <Text role="micro" tone="muted" theme={theme}>
              Notifications are off, so the question appears in the app only.
            </Text>
          </View>
        ) : null}

        {enabled && paused ? (
          <View testID="intent-check-paused-status">
            <Text role="micro" tone="muted" theme={theme}>
              Paused after three questions went unanswered in a row. Turn it off and on again to resume.
            </Text>
          </View>
        ) : null}

        {notice ? (
          <Callout theme={theme} tone="limit">
            {notice}
          </Callout>
        ) : null}

        <View testID="intent-check-quiet-hours" style={{ gap: theme.space(0.5) }}>
          <Text role="label" theme={theme}>
            {`Quiet hours ${quietLabel}`}
          </Text>
          <Text role="micro" tone="muted" theme={theme}>
            No question is asked inside this window. It uses the shared reminder quiet hours, so changing them above changes this too.
          </Text>
        </View>

        <Divider theme={theme} />
        <Text role="micro" tone="muted" theme={theme}>
          Your answers are ordinary per-sitting labels. They appear in Sessions and Insights, and
          they are included in export and removed by typed DELETE.
        </Text>
        <Text role="micro" tone="muted" theme={theme}>
          {MIUI_BEST_EFFORT_REMINDER_NOTE}
        </Text>
      </View>
    </Card>
  );
}
