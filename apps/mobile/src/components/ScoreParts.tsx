/**
 * The score parts, opened from the hero: each measured part as a small bar showing its points
 * against its own maximum. Presentation only: the numbers are the Score's existing factor points.
 * Single hue (the gauge colour). Unmeasured parts stay unmeasured: listed, never drawn as zero.
 */
import * as React from 'react';
import { Animated, View } from 'react-native';
import { Text, useSweep, type MirrorTheme } from '@mirror/ui';
import type { Score } from '@mirror/core-analytics';

/** Fades and lifts the panel in. Duration comes from the theme, so it is 0 under reduce-motion. */
export function ScorePartsExpand({ theme, children }: { theme: MirrorTheme; children: React.ReactNode }): React.ReactElement {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const duration = theme.motion('base');
    if (duration <= 0) {
      anim.setValue(1);
      return undefined;
    }
    const run = Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [anim, theme]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function PartBar({ ratio, theme }: { ratio: number; theme: MirrorTheme }): React.ReactElement {
  const shown = useSweep(Math.max(0, Math.min(1, ratio)), theme);
  return (
    <View
      style={{
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: theme.color.borderHairline,
      }}
    >
      <View
        style={{
          width: `${Math.round(shown * 100)}%`,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.palette.gauge[0],
        }}
      />
    </View>
  );
}

export function ScoreParts({ iqs, theme }: { iqs: Score; theme: MirrorTheme }): React.ReactElement {
  return (
    <View testID="home-score-parts" style={{ gap: theme.space(2.5) }}>
      <Text role="micro" tone="muted" theme={theme}>
        SCORE PARTS · EACH BAR IS POINTS OUT OF THAT PART'S MAXIMUM
      </Text>
      {iqs.factors.map((f) => {
        const measured = f.measurable && f.max > 0;
        const valueText = measured ? `${f.points.toFixed(1)} of ${f.max}` : 'Not measured';
        return (
          <View key={f.id} testID={`home-score-part-${f.id}`} style={{ gap: theme.space(1) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(2) }}>
              <Text role="label" theme={theme} style={{ flex: 1 }}>
                {f.label}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {valueText}
              </Text>
            </View>
            {measured ? (
              <PartBar ratio={f.points / f.max} theme={theme} />
            ) : (
              <Text role="micro" tone="muted" theme={theme}>
                {f.detail}
              </Text>
            )}
          </View>
        );
      })}
      <Text role="micro" tone="muted" theme={theme}>
        Parts that are not measured are not counted as zero. Full wording lives in Why this score.
      </Text>
    </View>
  );
}
