/**
 * Chart primitives for Home and the other tabs. Plain React Native Views only, so there is
 * no SVG or native dependency. Each chart has a text alternative for TalkBack (an
 * accessibilityLabel that lists the values) and the same numbers the rest of the screen shows.
 *
 * Curves are straight segments, not smoothed. Rings and donuts are drawn as tick marks
 * around a circle. Animation runs once on mount and when a value changes. It uses the
 * theme's motion durations, so it is off under reduce-motion.
 */
import * as React from 'react';
import { Animated, View, type LayoutChangeEvent } from 'react-native';
import { Text } from './text';
import type { MirrorTheme } from '../tokens';

const RING_TICKS = 48;

type Geometry = { wrap: { position: 'absolute'; left: 0; top: 0; width: number; height: number; transform: { rotate: string }[] }; tick: { position: 'absolute'; left: number; top: number; width: number; height: number; borderRadius: number } };

/** Geometry for N ticks around a circle of `size`. Built once per size, outside JSX. */
function tickGeometry(size: number, thickness: number, count: number): Geometry[] {
  const tickW = Math.max(2, ((Math.PI * size) / count) * 0.62);
  const out: Geometry[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      wrap: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        transform: [{ rotate: `${(i * 360) / count}deg` }],
      },
      tick: {
        position: 'absolute',
        left: (size - tickW) / 2,
        top: 0,
        width: tickW,
        height: thickness,
        borderRadius: tickW / 2,
      },
    });
  }
  return out;
}

/** Animated 0..1 that starts at 0 on mount and eases to `target` whenever it changes. */
function useDrawIn(target: number, theme: MirrorTheme): { value: Animated.Value; shown: number } {
  const anim = React.useRef(new Animated.Value(theme.reducedMotion ? target : 0)).current;
  const [shown, setShown] = React.useState(theme.reducedMotion ? target : 0);
  React.useEffect(() => {
    const id = anim.addListener(({ value }) => setShown(value));
    return () => anim.removeListener(id);
  }, [anim]);
  React.useEffect(() => {
    const duration = theme.motion('base');
    if (duration <= 0) {
      anim.setValue(target);
      return undefined;
    }
    const run = Animated.timing(anim, { toValue: target, duration, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [anim, target, theme]);
  return { value: anim, shown };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/* ----------------------------------------------------------- ProgressRing --- */

export type ProgressRingProps = {
  /** Measured amount. Use null when nothing is measured: the ring then shows only its track. */
  value: number | null;
  /** The measured maximum (for the attention signal: measuredMax, not 100). */
  max: number;
  size?: number;
  thickness?: number;
  theme: MirrorTheme;
  /** Text alternative for TalkBack, e.g. "Short video: 96 of 60 minutes a day". */
  accessibilityLabel: string;
  /** Optional centre content (big numeral and caption). */
  children?: React.ReactNode;
  testID?: string;
  /** Colour for the filled part. Defaults to the ink colour. */
  color?: string;
};

export function ProgressRing({
  value,
  max,
  size = 96,
  thickness = 8,
  theme,
  accessibilityLabel,
  children,
  testID,
  color,
}: ProgressRingProps): React.ReactElement {
  const fraction = value === null || max <= 0 ? 0 : clamp01(value / max);
  const { shown } = useDrawIn(fraction, theme);
  const geometry = React.useMemo(() => tickGeometry(size, thickness, RING_TICKS), [size, thickness]);
  const filled = Math.floor(shown * RING_TICKS + 1e-6);
  const fillColour = color ?? theme.color.ink;
  const trackColour = theme.color.borderHairline;
  const centreStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } as const;
  const accessibilityValue = value === null ? { text: 'not measured' } : { min: 0, max, now: value };
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={value === null ? `${accessibilityLabel}. Not measured` : accessibilityLabel}
      accessibilityValue={accessibilityValue}
      style={{ width: size, height: size }}
    >
      {geometry.map((g, i) => (
        <View key={`t${i}`} style={g.wrap}>
          <View style={[g.tick, { backgroundColor: i < filled ? fillColour : trackColour }]} />
        </View>
      ))}
      <View style={centreStyle}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ Donut --- */

export type DonutSegment = { label: string; value: number; color: string };

export type DonutProps = {
  segments: readonly DonutSegment[];
  size?: number;
  thickness?: number;
  theme: MirrorTheme;
  /** Text alternative. Built from the segments by default. */
  accessibilityLabel?: string;
  children?: React.ReactNode;
  testID?: string;
};

/** Describes the donut as "Label 40%, Other 10%" for TalkBack. Pure, so it can be tested. */
export function describeDonut(segments: readonly DonutSegment[]): string {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return 'Nothing to share yet';
  return segments
    .filter((s) => s.value > 0)
    .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
    .join(', ');
}

export function Donut({ segments, size = 120, thickness = 12, theme, accessibilityLabel, children, testID }: DonutProps): React.ReactElement {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const { shown } = useDrawIn(total > 0 ? 1 : 0, theme);
  const geometry = React.useMemo(() => tickGeometry(size, thickness, RING_TICKS), [size, thickness]);
  // Colour per tick: walk the segments by cumulative share.
  const colours = React.useMemo(() => {
    const out: string[] = [];
    let cursor = 0;
    for (const seg of segments) {
      const share = total > 0 ? Math.max(0, seg.value) / total : 0;
      const end = cursor + share * RING_TICKS;
      while (out.length < Math.round(end)) out.push(seg.color);
      cursor = end;
    }
    while (out.length < RING_TICKS) out.push(theme.color.borderHairline);
    return out;
  }, [segments, total, theme.color.borderHairline]);
  const filled = Math.floor(shown * RING_TICKS + 1e-6);
  const centreStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } as const;
  const label = accessibilityLabel ?? describeDonut(segments);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      {geometry.map((g, i) => (
        <View key={`d${i}`} style={g.wrap}>
          <View style={[g.tick, { backgroundColor: i < filled ? colours[i] : theme.color.borderHairline }]} />
        </View>
      ))}
      <View style={centreStyle}>{children}</View>
    </View>
  );
}

/* --------------------------------------------------------------- LineChart --- */

export type LinePoint = {
  label: string;
  /** Null means "no data for this day". It is drawn as a gap, never as zero. */
  value: number | null;
  /** The day has less than a full local day recorded. Drawn hollow and labelled partial. */
  partial?: boolean;
  /** The day the user has selected. Highlighted with a guide line and a larger dot. */
  selected?: boolean;
};

export type LineChartProps = {
  points: readonly LinePoint[];
  theme: MirrorTheme;
  /** Formats one value for the text alternative, e.g. "1h 20m". */
  formatValue: (v: number) => string;
  height?: number;
  /** Shown as the chart's name in the text alternative. */
  title: string;
  /** Show the day labels under the plot. Sparklines turn this off. */
  showLabels?: boolean;
  testID?: string;
};

/** Builds the TalkBack summary for a line chart. Pure. */
export function describeLine(points: readonly LinePoint[], formatValue: (v: number) => string, title: string): string {
  const parts = points.map((p) => {
    if (p.value === null) return `${p.label} no data`;
    return `${p.label} ${formatValue(p.value)}${p.partial ? ' (partial day)' : ''}`;
  });
  return `${title}. ${parts.join('. ')}.`;
}

export function LineChart({ points, theme, formatValue, height = 140, title, showLabels = true, testID }: LineChartProps): React.ReactElement {
  const [width, setWidth] = React.useState(0);
  const max = points.reduce((m, p) => (p.value !== null && p.value > m ? p.value : m), 0);
  const scaleMax = max > 0 ? max * 1.15 : 1;
  const segCount = Math.max(0, points.length - 1);
  const { shown } = useDrawIn(points.some((p) => p.value !== null) ? 1 : 0, theme);
  const drawn = shown * segCount;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const xs = points.map((_, i) => i * step);
  const ys = points.map((p) => (p.value === null ? null : height - (p.value / scaleMax) * height));
  const segments: React.ReactElement[] = [];
  const dots: React.ReactElement[] = [];
  const cardColour = theme.color.card;
  const inkColour = theme.color.ink;
  const handleLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  for (let i = 0; i < segCount; i += 1) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    if (y1 === null || y2 === null || y1 === undefined || y2 === undefined) continue;
    const dx = xs[i + 1] - xs[i];
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mx = (xs[i] + xs[i + 1]) / 2;
    const my = (y1 + y2) / 2;
    const drawing = Math.min(1, Math.max(0, drawn - i));
    const segStyle = {
      position: 'absolute',
      left: mx - len / 2,
      top: my - 1.5,
      width: len * drawing,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: inkColour,
      transform: [{ rotate: `${angle}deg` }],
    } as const;
    segments.push(<View key={`s${i}`} style={segStyle} />);
  }

  points.forEach((p, i) => {
    if (ys[i] === null || ys[i] === undefined) return;
    const big = p.selected === true;
    const size = big ? 14 : 8;
    const dotStyle = {
      position: 'absolute',
      left: xs[i] - size / 2,
      top: (ys[i] as number) - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: p.partial ? 2 : 0,
      borderColor: inkColour,
      backgroundColor: p.partial ? cardColour : inkColour,
    } as const;
    dots.push(<View key={`p${i}`} style={dotStyle} />);
  });

  const guides = points
    .map((p, i) => (p.selected ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => {
      const guideStyle = { position: 'absolute', left: xs[i] - 0.5, top: 0, width: 1, height, backgroundColor: theme.color.borderHairline } as const;
      return <View key={`g${i}`} style={guideStyle} />;
    });

  const baselineStyle = { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: theme.color.borderHairline } as const;
  const plotStyle = { height, width: '100%' } as const;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={describeLine(points, formatValue, title)} onLayout={handleLayout}>
      <View style={plotStyle}>
        {guides}
        <View style={baselineStyle} />
        {segments}
        {dots}
      </View>
      {showLabels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.space(1.5) }}>
          {points.map((p, i) => (
            <Text key={`l${i}`} role="micro" tone={p.selected ? undefined : 'muted'} theme={theme}>
              {p.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- Sparkline --- */

export function LineSparkline({
  values,
  theme,
  accessibilityLabel,
  height = 28,
  testID,
}: {
  values: readonly (number | null)[];
  theme: MirrorTheme;
  accessibilityLabel: string;
  height?: number;
  testID?: string;
}): React.ReactElement {
  const points: LinePoint[] = values.map((v, i) => ({ label: String(i + 1), value: v }));
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <LineChart points={points} theme={theme} formatValue={String} height={height} title={accessibilityLabel} showLabels={false} />
    </View>
  );
}
