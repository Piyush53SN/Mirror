import * as React from 'react';
import { View } from 'react-native';
import { Callout, Sheet, WhySheet, useTheme } from '@mirror/ui';
import type { Score } from '@mirror/core-analytics';
import { useMirrorApp } from '../context/MirrorAppContext';
import { useSafeInsets } from './useSafeInsets';

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
  const { insets: contextInsets } = useMirrorApp();
  const insets = useSafeInsets(contextInsets);

  const measuredFactors = iqs.factors.filter((f) => f.measurable && f.max > 0);
  const unmeasuredFactors = iqs.factors.filter((f) => !f.measurable && f.max > 0);
  const measuredMax =
    typeof iqs.measuredMax === 'number'
      ? iqs.measuredMax
      : measuredFactors.reduce((sum, f) => sum + f.max, 0);
  const scaleMax = iqs.max > 0 ? iqs.max : 100;
  const confidenceExplanation =
    iqs.confidence.explanation ??
    `Confidence is ${Math.round(iqs.confidence.score * 100)}% (${iqs.confidence.level}) based on ${iqs.confidence.sample} recorded sitting${iqs.confidence.sample === 1 ? '' : 's'} and ${iqs.confidence.labels} explicit label${iqs.confidence.labels === 1 ? '' : 's'}.`;

  return (
    <Sheet
      open={open}
      title="Why this score"
      subtitle={
        iqs.value !== null
          ? `Interaction quality · ${Math.round(iqs.value)} out of ${scaleMax} (${measuredMax} pts measured today)`
          : 'Interaction quality · minimum activity not met yet'
      }
      onClose={onClose}
      bottomInset={insets.bottom}
      theme={theme}
    >
      <View style={{ gap: theme.space(3), paddingBottom: theme.space(2) }}>
        <WhySheet
          score={iqs.value ?? 0}
          maxScore={scaleMax}
          measuredMax={measuredMax}
          components={measuredFactors.map((f) => ({
            label: f.label,
            points: f.points,
            maxPoints: f.max,
            note: f.detail,
            tier: f.tier,
          }))}
          unmeasuredComponents={unmeasuredFactors.map((f) => ({
            label: f.label,
            maxPoints: f.max,
            reason: f.detail,
            tier: f.tier,
          }))}
          confidence={{
            scorePct: Math.round(iqs.confidence.score * 100),
            level: iqs.confidence.level,
            explanation: confidenceExplanation,
            reasons: iqs.confidence.reasons,
          }}
          caveat={iqs.caveat}
          theme={theme}
        />
        <Callout theme={theme} tone="neutral">
          {`The composite scale is fixed at ${scaleMax} points. Today ${measuredMax} points are measured and ${Math.max(0, scaleMax - measuredMax)} points are shown separately as not measured — unmeasured parts are never counted as zero and never rescaled to hide what is missing.`}
        </Callout>
      </View>
    </Sheet>
  );
}
