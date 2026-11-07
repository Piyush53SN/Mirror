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
import { Animated, PanResponder, Pressable, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
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

/* ---------------------------------------------------------- hooks (motion) --- */

/** Shown value that counts up from 0 to `target` once per change. Immediate under reduce-motion. */
export function useCountUp(target: number | null, theme: MirrorTheme): number | null {
  const anim = React.useRef(new Animated.Value(0)).current;
  const [shown, setShown] = React.useState<number | null>(target === null ? null : theme.reducedMotion ? target : 0);
  React.useEffect(() => {
    const id = anim.addListener(({ value }) => setShown(value));
    return () => anim.removeListener(id);
  }, [anim]);
  React.useEffect(() => {
    if (target === null) {
      setShown(null);
      return undefined;
    }
    const duration = theme.motion('base');
    if (duration <= 0) {
      anim.setValue(target);
      setShown(target);
      return undefined;
    }
    const run = Animated.timing(anim, { toValue: target, duration, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [anim, target, theme]);
  return shown === null ? null : Math.round(shown);
}

/** 0..1 sweep for rings and gauges (same timing as the draw-in). Immediate under reduce-motion. */
export function useSweep(target: number, theme: MirrorTheme): number {
  return useDrawIn(target, theme).shown;
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
  /** Index into `segments` of the highlighted segment (drawn thicker). */
  selectedIndex?: number | null;
  /** Tap a segment. Receives the index into `segments`. */
  onSelectSegment?: (index: number) => void;
  /** Long-press a segment. Receives the index into `segments`. */
  onLongPressSegment?: (index: number) => void;
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

export type ArcSpec = { start: number; end: number; color: string; index: number };

/**
 * Start and end angles (radians, clockwise from 12 o'clock) for each positive segment, keeping
 * each segment's index into the input. Pure.
 */
export function donutArcs(segments: readonly DonutSegment[]): ArcSpec[] {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return [];
  const out: ArcSpec[] = [];
  let cursor = 0;
  segments.forEach((seg, index) => {
    const v = Math.max(0, seg.value);
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    out.push({ start: cursor, end: cursor + sweep, color: seg.color, index });
    cursor += sweep;
  });
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

/**
 * Which segment a touch at (x, y) inside a donut of `size` falls on, or -1. Pure. The ring is
 * hit with a generous band (a few dp either side of the stroke) so the target is easy to reach.
 */
export function donutIndexAt(x: number, y: number, size: number, thickness: number, arcs: readonly ArcSpec[]): number {
  const c = size / 2;
  const dx = x - c;
  const dy = y - c;
  const dist = Math.hypot(dx, dy);
  const r = c - thickness / 2;
  const band = thickness / 2 + 8;
  if (Math.abs(dist - r) > band) return -1;
  let angle = Math.atan2(dx, -dy); // 0 at 12 o'clock, clockwise
  if (angle < 0) angle += Math.PI * 2;
  for (const arc of arcs) {
    if (angle >= arc.start && angle < arc.end) return arc.index;
  }
  return -1;
}

export function Donut({
  segments,
  size = 120,
  thickness = 12,
  accessibilityLabel,
  children,
  testID,
  selectedIndex = null,
  onSelectSegment,
  onLongPressSegment,
}: DonutProps): React.ReactElement {
  const center = size / 2;
  const r = center - thickness / 2;
  const arcs = React.useMemo(() => donutArcs(segments), [segments]);
  const label = accessibilityLabel ?? describeDonut(segments);
  const centreStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } as const;
  const drawn = (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a) => (
        <Path
          key={`a${a.index}`}
          d={arcPath(center, center, r, a.start, a.end)}
          fill="none"
          stroke={a.color}
          strokeWidth={a.index === selectedIndex ? thickness + 6 : thickness}
          strokeLinecap="butt"
        />
      ))}
    </Svg>
  );
  const interactive = Boolean(onSelectSegment || onLongPressSegment);
  return (
    <View testID={testID} accessible={!interactive} accessibilityRole="image" accessibilityLabel={interactive ? undefined : label} style={{ width: size, height: size }}>
      {interactive ? (
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={(e: GestureResponderEvent) => {
            const idx = donutIndexAt(e.nativeEvent.locationX, e.nativeEvent.locationY, size, thickness, arcs);
            if (idx >= 0) onSelectSegment?.(idx);
          }}
          onLongPress={(e: GestureResponderEvent) => {
            const idx = donutIndexAt(e.nativeEvent.locationX, e.nativeEvent.locationY, size, thickness, arcs);
            if (idx >= 0) onLongPressSegment?.(idx);
          }}
          style={{ width: size, height: size }}
        >
          {drawn}
        </Pressable>
      ) : (
        drawn
      )}
      <View style={centreStyle} pointerEvents="box-none">
        {children}
      </View>
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
  /** Local day (YYYY-MM-DD), passed back when a day is tapped. */
  day?: string;
};

/** Width of the left column that holds the y-axis labels. */
export const Y_GUTTER = 44;

export type LineChartProps = {
  points: readonly LinePoint[];
  theme: MirrorTheme;
  /** Formats one value for the text alternative and bubble, e.g. "1h 20m". */
  formatValue: (v: number) => string;
  height?: number;
  /** Shown as the chart's name in the text alternative. */
  title: string;
  /** Show the day labels under the plot. Sparklines turn this off. */
  showLabels?: boolean;
  /** Dashed line at the average of the recorded days, with a label. */
  showAverage?: boolean;
  /** Tap a day (a tap, not a drag). Receives the index into `points`. */
  onSelectIndex?: (index: number) => void;
  /** Controlled scrub position for previews and tests. Null or absent: follow the touch. */
  scrubIndex?: number | null;
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

/** Mean of the recorded (non-null) values, or null when none. Pure. */
export function lineAverage(points: readonly LinePoint[]): number | null {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Index of the day under x for a plot `plotWidth` wide with `n` days. Pure, clamped. */
export function scrubIndexFromX(x: number, plotWidth: number, n: number): number {
  if (n <= 1 || plotWidth <= 0) return 0;
  const i = Math.round((Math.max(0, Math.min(plotWidth, x)) / plotWidth) * (n - 1));
  return Math.max(0, Math.min(n - 1, i));
}

/** Top of the y-axis: the largest recorded value, or 1 when there is none. Pure. */
export function axisMax(points: readonly LinePoint[]): number {
  return points.reduce((m, p) => (p.value !== null && p.value > m ? p.value : m), 0);
}

export type LineGeometry = {
  xs: number[];
  ys: (number | null)[];
  /** One SVG path string per run of consecutive non-null points. */
  runs: string[];
  /** The y value that sits at the top of the plot. */
  scaleMax: number;
};

/** Pixel geometry for a line chart of `width` x `height`. Pure. Gaps split the runs. */
export function lineGeometry(points: readonly LinePoint[], width: number, height: number): LineGeometry {
  const max = axisMax(points);
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
  return { xs, ys, runs, scaleMax };
}

export function LineChart({
  points,
  theme,
  formatValue,
  height = 140,
  title,
  showLabels = true,
  showAverage = false,
  onSelectIndex,
  scrubIndex = null,
  testID,
}: LineChartProps): React.ReactElement {
  const [width, setWidth] = React.useState(0);
  const [scrub, setScrub] = React.useState<number | null>(null);
  const [focus, setFocus] = React.useState<number | null>(null);
  const originRef = React.useRef(0);
  const plotWidth = Math.max(0, width - Y_GUTTER);
  const geo = React.useMemo(() => (plotWidth > 0 ? lineGeometry(points, plotWidth, height) : null), [points, plotWidth, height]);
  const avg = React.useMemo(() => lineAverage(points), [points]);
  const active = scrubIndex ?? scrub ?? focus;
  const inkColour = theme.color.ink;
  const cardColour = theme.color.card;
  const accent = theme.palette.chart[0];
  const n = points.length;
  const handleLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  const indexAtX = React.useCallback((x: number) => scrubIndexFromX(x, plotWidth, n), [plotWidth, n]);
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        // Only a clearly horizontal drag claims the touch, so taps and vertical scrolling keep working.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        // The plot starts at pageX - locationX on the grant event (the child fills the plot at 0,0).
        onPanResponderGrant: (e) => {
          originRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        },
        onPanResponderMove: (_e, g) => setScrub(indexAtX(g.moveX - originRef.current)),
        onPanResponderRelease: () => setScrub(null),
        onPanResponderTerminate: () => setScrub(null),
      }),
    [indexAtX],
  );

  const bubble = (() => {
    if (active === null || active === undefined || !geo || n === 0) return null;
    const p = points[active];
    if (!p) return null;
    const x = geo.xs[active] ?? 0;
    const y = geo.ys[active];
    const bubbleW = 132;
    const left = Math.max(0, Math.min(plotWidth - bubbleW, x - bubbleW / 2));
    const top = y === null || y === undefined ? 0 : Math.max(0, y - 50);
    const text = p.value === null ? `${p.label} · no data` : `${p.label} · ${formatValue(p.value)}${p.partial ? ' (partial)' : ''}`;
    return (
      <View
        testID={testID ? `${testID}-bubble` : undefined}
        pointerEvents="none"
        style={{ position: 'absolute', left: Y_GUTTER + left, top, width: bubbleW, paddingVertical: theme.space(1), paddingHorizontal: theme.space(2), borderRadius: theme.radius.md, backgroundColor: theme.color.anchor }}
      >
        <Text role="micro" theme={theme} style={{ color: theme.color.onAnchor, textAlign: 'center' }}>
          {text}
        </Text>
      </View>
    );
  })();

  const axis = [
    { v: axisMax(points), y: 0 },
    { v: axisMax(points) / 2, y: height / 2 },
    { v: 0, y: height },
  ];

  const interactive = Boolean(onSelectIndex);
  const valueText = active !== null && active !== undefined && points[active] ? `${points[active].label}, ${points[active].value === null ? 'no data' : formatValue(points[active].value as number)}` : '';
  const a11y = interactive
    ? {
        accessibilityRole: 'adjustable' as const,
        accessibilityValue: { text: valueText || 'Use up or down to move between days' },
        accessibilityActions: [
          { name: 'increment', label: 'Next day' },
          { name: 'decrement', label: 'Previous day' },
        ],
        onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
          const current = focus ?? n - 1;
          const next = e.nativeEvent.actionName === 'increment' ? Math.min(n - 1, current + 1) : Math.max(0, current - 1);
          setFocus(next);
          onSelectIndex?.(next);
        },
      }
    : { accessibilityRole: 'image' as const };

  return (
    <View testID={testID} accessible accessibilityLabel={describeLine(points, formatValue, title)} {...a11y} onLayout={handleLayout}>
      <View style={{ flexDirection: 'row', height }}>
        <View style={{ width: Y_GUTTER, height }}>
          {width > 0
            ? axis.map((t, i) => (
                <Text
                  key={`y${i}`}
                  role="micro"
                  tone="muted"
                  theme={theme}
                  style={{ position: 'absolute', top: Math.max(0, Math.min(height - 14, t.y - 7)), left: 0, width: Y_GUTTER - theme.space(1.5), textAlign: 'right' }}
                >
                  {formatValue(t.v)}
                </Text>
              ))
            : null}
        </View>
        <View style={{ flex: 1, height }} {...pan.panHandlers}>
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            disabled={!interactive}
            onPress={(e: GestureResponderEvent) => {
              if (!interactive) return;
              const i = indexAtX(e.nativeEvent.locationX);
              setFocus(i);
              onSelectIndex?.(i);
            }}
            style={{ width: '100%', height }}
          >
            {geo ? (
              <Svg width={plotWidth} height={height} viewBox={`0 0 ${plotWidth} ${height}`}>
                <Line x1={0} x2={plotWidth} y1={height - 0.5} y2={height - 0.5} stroke={theme.color.borderHairline} strokeWidth={1} />
                {showAverage && avg !== null ? (
                  <Line
                    x1={0}
                    x2={plotWidth}
                    y1={height - (avg / geo.scaleMax) * height}
                    y2={height - (avg / geo.scaleMax) * height}
                    stroke={inkColour}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.6}
                  />
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
                  const r = p.selected || i === active ? 7 : 4;
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
          </Pressable>
          {bubble ? <View pointerEvents="none" style={{ position: 'absolute', left: -Y_GUTTER, top: 0 }}>{bubble}</View> : null}
        </View>
      </View>
      {showAverage && avg !== null && geo ? (
        <Text role="micro" tone="muted" theme={theme} style={{ marginLeft: Y_GUTTER, marginTop: theme.space(1) }}>
          {`Dashed line: average of recorded days, ${formatValue(avg)}`}
        </Text>
      ) : null}
      {showLabels ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: Y_GUTTER, marginTop: theme.space(1.5) }}>
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
