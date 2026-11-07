/**
 * The day timeline (swimlane): one row per top app plus "Other", on one shared 00–24 axis with ticks
 * every 6 hours. Blocks are sittings (merged when the gap is under 60 s), never narrower than 3dp.
 * Tap a block for its app and start and end times. The list below is the 48dp route to every sitting.
 * Presentation only. Colour separates apps; it never says good or bad.
 */
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Pill, PressScale, Text, useTheme, type MirrorTheme } from '@mirror/ui';
import { formatDuration } from '../context/MirrorAppContext';
import { blockPixels, clockLabel, swimlaneRows, type LaneBlock, type SwimlaneRow } from '../homeCharts';

/** Width of the label column. The hourly bars use the same gutter, so both share one axis. */
export const TIMELINE_GUTTER = 88;
const LANE_VISUAL_H = 22;
const LANE_ROW_H = 48;
const TICKS = [0, 6, 12, 18, 24] as const;

type Picked = { row: number; block: number } | null;

function laneColour(theme: MirrorTheme, row: SwimlaneRow): string {
  const palette = theme.palette.chart;
  return palette[Math.min(row.colourIndex, palette.length - 1)];
}

/** The axis, shared by the lanes and the hourly bars below. */
export function TimelineAxis({ theme, trackWidth }: { theme: MirrorTheme; trackWidth: number }): React.ReactElement {
  return (
    <View style={{ height: 16, marginLeft: TIMELINE_GUTTER, width: trackWidth }}>
      {TICKS.map((h) => {
        const x = (h / 24) * trackWidth;
        const edge = h === 0 ? 0 : h === 24 ? -28 : -14;
        return (
          <Text
            key={`tick-${h}`}
            role="micro"
            tone="muted"
            theme={theme}
            style={{ position: 'absolute', left: Math.max(0, Math.min(trackWidth - 28, x + edge)), width: 28, textAlign: h === 0 ? 'left' : h === 24 ? 'right' : 'center' }}
          >
            {String(h).padStart(2, '0')}
          </Text>
        );
      })}
    </View>
  );
}

export function DayTimeline({
  sessions,
  day,
  labels,
  appOrder,
}: {
  sessions: readonly { id?: string; app: string; startMs: number; endMs: number }[];
  day: string;
  labels: Record<string, string>;
  appOrder: readonly string[];
}): React.ReactElement {
  const theme = useTheme();
  const rows = React.useMemo(() => swimlaneRows(sessions, day, appOrder, labels), [sessions, day, appOrder, labels]);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<Picked>(null);
  const [listOpen, setListOpen] = React.useState(false);
  const total = rows.reduce((n, r) => n + r.blocks.length, 0);

  React.useEffect(() => {
    setPicked(null);
    setListOpen(false);
  }, [day]);

  const sel: { row: SwimlaneRow; block: LaneBlock } | null =
    picked && rows[picked.row] && rows[picked.row].blocks[picked.block] ? { row: rows[picked.row], block: rows[picked.row].blocks[picked.block] } : null;
  const togglePick = (next: Picked): void => setPicked((prev) => (prev && next && prev.row === next.row && prev.block === next.block ? null : next));

  // Tap a lane: the nearest block to the touch, within 8dp.
  const hitBlock = (row: number, x: number): number | null => {
    if (trackWidth <= 0) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    rows[row].blocks.forEach((b, i) => {
      const px = blockPixels(b.left, b.width, trackWidth);
      const dist = x >= px.x && x <= px.x + px.w ? 0 : Math.min(Math.abs(x - px.x), Math.abs(x - (px.x + px.w)));
      if (dist <= 8 && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    return best;
  };

  const alt =
    total === 0
      ? 'No sittings recorded for this day.'
      : `Day timeline: ${total} ${total === 1 ? 'sitting' : 'sittings'} in ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}, one per app, on a 0 to 24 hour axis. Use the sittings list to reach each one.`;

  return (
    <View testID="home-day-timeline" accessibilityLabel={alt} style={{ gap: theme.space(1.5) }}>
      <View onLayout={(e) => setTrackWidth(Math.max(0, e.nativeEvent.layout.width - TIMELINE_GUTTER))} style={{ gap: theme.space(0.5) }}>
        {/* Lanes: label column on the left, the shared 0-24 track on the right. */}
        {rows.map((row, r) => {
          const px = trackWidth;
          return (
            <View key={row.key} testID={`timeline-row-${row.key}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: LANE_ROW_H }}>
              <View style={{ width: TIMELINE_GUTTER, paddingRight: theme.space(2) }}>
                <Text role="micro" theme={theme}>
                  {row.label}
                </Text>
              </View>
              <Pressable
                testID={`timeline-lane-${row.key}`}
                accessibilityRole="none"
                accessibilityLabel={`${row.label}: ${row.blocks.length} ${row.blocks.length === 1 ? 'sitting' : 'sittings'}`}
                onPress={(e) => togglePick(hitBlock(r, e.nativeEvent.locationX) === null ? null : { row: r, block: hitBlock(r, e.nativeEvent.locationX) as number })}
                style={{ flex: 1, height: LANE_ROW_H, justifyContent: 'center' }}
              >
                <Svg width={px} height={LANE_VISUAL_H} viewBox={`0 0 ${Math.max(1, px)} ${LANE_VISUAL_H}`}>
                  <Rect x={0} y={LANE_VISUAL_H / 2 - 0.5} width={Math.max(0, px)} height={1} fill={theme.color.inkMuted} />
                  {row.blocks.map((b, i) => {
                    const p = blockPixels(b.left, b.width, px);
                    const isPicked = picked !== null && picked.row === r && picked.block === i;
                    return (
                      <Rect
                        key={b.key}
                        x={p.x}
                        y={0}
                        width={p.w}
                        height={LANE_VISUAL_H}
                        rx={4}
                        fill={laneColour(theme, row)}
                        stroke={isPicked ? theme.color.ink : 'none'}
                        strokeWidth={isPicked ? 2 : 0}
                      />
                    );
                  })}
                </Svg>
              </Pressable>
            </View>
          );
        })}
        <TimelineAxis theme={theme} trackWidth={trackWidth} />
      </View>
      {sel ? (
        <View testID="home-day-timeline-detail" accessible accessibilityLabel={`${sel.row.label}, ${clockLabel(sel.block.startMs)} to ${clockLabel(sel.block.endMs)}`} style={{ gap: theme.space(0.5) }}>
          <Text role="label" theme={theme}>
            {sel.row.label}
          </Text>
          <Text role="micro" tone="muted" theme={theme}>
            {`${clockLabel(sel.block.startMs)} to ${clockLabel(sel.block.endMs)} · ${formatDuration(sel.block.endMs - sel.block.startMs)}${sel.block.count > 1 ? ` · ${sel.block.count} sittings merged` : ''}`}
          </Text>
        </View>
      ) : (
        <Text role="micro" tone="muted" theme={theme}>
          {total > 0 ? 'Tap a block to see its app and start and end times.' : 'No sittings recorded for this day yet.'}
        </Text>
      )}
      {total > 0 ? (
        <View style={{ gap: theme.space(1) }}>
          <Pill testID="home-day-ribbon-list-toggle" variant="secondary" onPress={() => setListOpen((o) => !o)} accessibilityLabel={listOpen ? 'Hide the sittings list' : `Show the sittings list, ${total} sittings`}>
            {listOpen ? 'Hide sittings' : `List sittings (${total})`}
          </Pill>
          {listOpen
            ? rows.flatMap((row, r) =>
                row.blocks.map((b, i) => (
                  <PressScale
                    key={`row-${row.key}-${b.key}`}
                    testID={`home-sitting-${row.key}-${i}`}
                    theme={theme}
                    onPress={() => togglePick({ row: r, block: i })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked !== null && picked.row === r && picked.block === i }}
                    accessibilityLabel={`${row.label}, ${clockLabel(b.startMs)} to ${clockLabel(b.endMs)}, ${formatDuration(b.endMs - b.startMs)}.`}
                    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: theme.space(2), paddingHorizontal: theme.space(2), borderRadius: theme.radius.md }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: laneColour(theme, row) }} />
                    <Text role="micro" theme={theme} style={{ flex: 1 }}>
                      {row.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${clockLabel(b.startMs)}–${clockLabel(b.endMs)}`}
                    </Text>
                  </PressScale>
                )),
              )
            : null}
        </View>
      ) : null}
    </View>
  );
}
