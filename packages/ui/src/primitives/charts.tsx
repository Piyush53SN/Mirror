/**
 * Chart primitives for Home and the other tabs. Donut and line are drawn with react-native-svg;
 * rings and the gauge are tick marks built from Views. Each chart has a text alternative for TalkBack (an
 * accessibilityLabel that lists the values) and the same numbers the rest of the screen shows.
 *
 * Curves are straight segments, not smoothed. Rings are drawn as tick marks around a circle.
 * Animation runs once on mount and when a value changes. It uses the
 * theme's motion durations, so it is off under reduce-motion.
 */
import * as React from 'react';
import { Animated, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
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

export type ArcSpec = { start: number; end: number; color: string };

/**
 * Start and end angles (radians, clockwise from 12 o'clock) for each positive segment.
 * Pure. A segment that is the whole circle gets a full sweep, handled by the caller.
 */
export function donutArcs(segments: readonly DonutSegment[]): ArcSpec[] {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return [];
  const out: ArcSpec[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const v = Math.max(0, seg.value);
    if (v <= 0) continue;
    const sweep = (v / total) * Math.PI * 2;
    out.push({ start: cursor, end: cursor + sweep, color: seg.color });
    cursor += sweep;
  }
  return out;
}

/** SVG path for one arc of a circle centred at (cx, cy). Pure. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const full = end - start >= Math.PI * 2 - 1e-9;
  const toXY = (a: number): [number, number] => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  if (full) {
    const [x0, y0] = toXY(0);
    const [x1, y1] = toXY(Math.PI);
    return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1} A ${r} ${r} 0 1 1 ${x0} ${y0}`;
  }
  const [x0, y0] = toXY(start);
  const [x1, y1] = toXY(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function Donut({ segments, size = 120, thickness = 12, accessibilityLabel, children, testID }: DonutProps): React.ReactElement {
  const center = size / 2;
  const r = center - thickness / 2;
  const arcs = React.useMemo(() => donutArcs(segments), [segments]);
  const label = accessibilityLabel ?? describeDonut(segments);
  const centreStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => (
          <Path
            key={`a${i}`}
            d={arcPath(center, center, r, a.start, a.end)}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
          />
        ))}
      </Svg>
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

export type LineGeometry = {
  xs: number[];
  ys: (number | null)[];
  /** One SVG path string per run of consecutive non-null points. */
  runs: string[];
};

/** Pixel geometry for a line chart of `width` x `height`. Pure. Gaps split the runs. */
export function lineGeometry(points: readonly LinePoint[], width: number, height: number): LineGeometry {
  const max = points.reduce((m, p) => (p.value !== null && p.value > m ? p.value : m), 0);
  const scaleMax = max > 0 ? max * 1.15 : 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const xs = points.map((_, i) => i * step);
  const ys = points.map((p) => (p.value === null ? null : height - (p.value / scaleMax) * height));
  const runs: string[] = [];
  let current = '';
  points.forEach((_, i) => {
    const y = ys[i];
    if (y === null) {
      if (current) runs.push(current);
      current = '';
      return;
    }
    current += `${current ? ' L' : 'M'} ${xs[i]} ${y}`;
  });
  if (current) runs.push(current);
  return { xs, ys, runs };
}

export function LineChart({ points, theme, formatValue, height = 140, title, showLabels = true, testID }: LineChartProps): React.ReactElement {
  const [width, setWidth] = React.useState(0);
  const geo = React.useMemo(() => (width > 0 ? lineGeometry(points, width, height) : null), [points, width, height]);
  const handleLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);
  const inkColour = theme.color.ink;
  const cardColour = theme.color.card;
  const accent = theme.palette.chart[0];

  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={describeLine(points, formatValue, title)} onLayout={handleLayout}>
      <View style={{ height, width: '100%' }}>
        {geo ? (
          <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {geo.xs.length > 0 ? (
              <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={theme.color.borderHairline} strokeWidth={1} />
            ) : null}
            {points.map((p, i) =>
              p.selected && geo.ys[i] !== null ? (
                <Line key={`g${i}`} x1={geo.xs[i]} x2={geo.xs[i]} y1={0} y2={height} stroke={theme.color.borderHairline} strokeWidth={1} />
              ) : null,
            )}
            {geo.runs.map((d, i) => (
              <Path key={`r${i}`} d={d} fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {points.map((p, i) => {
              const y = geo.ys[i];
              if (y === null || y === undefined) return null;
              const r = p.selected ? 7 : 4;
              return (
                <Circle
                  key={`p${i}`}
                  cx={geo.xs[i]}
                  cy={y}
                  r={r}
                  fill={p.partial ? cardColour : inkColour}
                  stroke={p.partial ? inkColour : 'none'}
                  strokeWidth={p.partial ? 2 : 0}
                />
              );
            })}
          </Svg>
        ) : null}
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
