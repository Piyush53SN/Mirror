/**
 * P4.4c: the in-app Intent Check question on Home (and the one-time pause notice).
 *
 * - At most one question per local day, shown only while unanswered.
 * - Three answers only: Intentional, Mindless, Not sure. Each is one tap and writes
 *   one ordinary per-sitting label for this sitting. Nothing is written otherwise.
 * - No guilt copy, no streaks, no red states, no overlays, no sound.
 */
import * as React from 'react';
import { View } from 'react-native';
import { Callout, Card, Pill, Text, useTheme } from '@mirror/ui';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

export const INTENT_CHECK_ANSWERS: readonly { label: 'intentional' | 'mindless' | 'unsure'; text: string }[] = [
  { label: 'intentional', text: 'Intentional' },
  { label: 'mindless', text: 'Mindless' },
  { label: 'unsure', text: 'Not sure' },
];

export function IntentCheckCard(): React.ReactElement | null {
  const theme = useTheme();
  const { intentCheckCard, answerIntentCheck, acknowledgeIntentCheckPauseNotice, labels } = useMirrorApp();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  if (!intentCheckCard) return null;
  const { pending, pauseNotice } = intentCheckCard;
  if (!pending && !pauseNotice) return null;

  const appName = pending ? (labels?.[pending.app] || pending.app) : '';

  const answer = async (label: 'intentional' | 'mindless' | 'unsure') => {
    if (!pending || !answerIntentCheck) return;
    setBusy(true);
    setNotice(null);
    try {
      await answerIntentCheck(pending.sessionId, label);
    } catch {
      setNotice('Could not save that answer right now. Nothing changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card theme={theme} style={{ marginBottom: 0 }}>
      <View testID="intent-check-card" style={{ gap: theme.space(2) }}>
        {pauseNotice ? (
          <View testID="intent-check-pause-notice" style={{ gap: theme.space(1.5) }}>
            <Callout theme={theme} tone="neutral">
              Intent Check paused after three questions went unanswered in a row. Nothing was
              saved for them. Turn it on again in Settings whenever you like.
            </Callout>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pill
                testID="intent-check-pause-ok"
                theme={theme}
                variant="secondary"
                onPress={() => acknowledgeIntentCheckPauseNotice?.()}
                accessibilityLabel="Dismiss the Intent Check pause notice"
              >
                Got it
              </Pill>
            </View>
          </View>
        ) : null}

        {pending ? (
          <View style={{ gap: theme.space(1.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              QUICK CHECK · ONE SITTING · OPTIONAL
            </Text>
            <Text role="label" theme={theme}>
              {`Was your sitting in ${appName} (${formatDuration(pending.durationMs)}) intentional?`}
            </Text>
            <Text role="micro" tone="muted" theme={theme}>
              Only this one sitting is labeled, and only when you tap. Skipping is fine.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) }}>
              {INTENT_CHECK_ANSWERS.map((a) => (
                <Pill
                  key={a.label}
                  testID={`intent-check-answer-${a.label}`}
                  theme={theme}
                  variant={a.label === 'intentional' ? 'primary' : 'secondary'}
                  disabled={busy}
                  onPress={() => answer(a.label)}
                  accessibilityLabel={`Label this sitting as ${a.text.toLowerCase()}`}
                >
                  {a.text}
                </Pill>
              ))}
            </View>
            {notice ? (
              <Callout theme={theme} tone="neutral">
                {notice}
              </Callout>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
