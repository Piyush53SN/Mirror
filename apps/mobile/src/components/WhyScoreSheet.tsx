import * as React from 'react';
import { View } from 'react-native';
import { Callout, Sheet, Text, WhySheet, useTheme } from '@mirror/ui';
import type { Score } from '@mirror/core-analytics';

export function WhyScoreSheet({
  open,
  iqs,
  onClose,
}: {
  open: boolean;
  iqs: Score;
  onClose: () => void;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Sheet
      open={open}
      title="Why this score"
      subtitle={
        iqs.value !== null
          ? `Interaction quality · ${Math.round(iqs.value)} out of ${iqs.max}`
          : 'Interaction quality · minimum activity not met yet'
      }
      onClose={onClose}
      theme={theme}
    >
      <View style={{ gap: theme.space(3), paddingBottom: theme.space(2) }}>
        <WhySheet
          score={iqs.value ?? 0}
          maxScore={iqs.max}
          components={iqs.factors.map((f) => ({
            label: f.label,
            points: f.points,
            note: f.detail,
            tier: f.tier,
          }))}
          caveat={iqs.caveat}
          theme={theme}
        />
        <View style={{ gap: theme.space(1) }}>
          <Text role="label" theme={theme}>
            Confidence reasons:
          </Text>
          {iqs.confidence.reasons.map((r, idx) => (
            <Text key={idx} role="micro" tone="muted" theme={theme}>
              {`• ${r}`}
            </Text>
          ))}
        </View>
        <Callout theme={theme} tone="neutral">
          {`Current max is /${iqs.max}: only measured factors enter the denominator — session length (25, needs 5+ sittings)${iqs.factors.find((f) => f.id === 'switching')?.measurable ? ', switching (15)' : ' [switching hidden until 3+ sittings & 15+ min active]'}${iqs.factors.find((f) => f.id === 'late_night')?.measurable ? ', late-night (15)' : ' [late-night hidden until 15+ min sitting time]'}${iqs.factors.find((f) => f.id === 'deliberate' || f.id === 'deliberate_share')?.measurable ? ', deliberate share (20)' : ''}. Small-sample rates leave the max rather than counting as zero (reaches /75 with 5+ decisive labels and 15+ min; /100 adds Tier A/B/C topic depth).`}
        </Callout>
      </View>
    </Sheet>
  );
}
