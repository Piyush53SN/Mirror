/**
 * Containers: the phone frame, the glass materials, sheets and data displays.
 *
 * The material stack is the one thing the reference image actually specifies:
 * a blurred backdrop, a translucent shell over it, sunk cards inside the shell,
 * and a shadow that stays ambient (outside the shell the luminance falls ≤2%
 * over 40px, so a hard drop shadow would be a lie).
 */
import * as React from 'react';
import { View, ScrollView, Pressable, Animated, BackHandler, PanResponder } from '../host';
import { isSheetDragStart, sheetDragOffset, sheetReleaseAction } from './sheetDrag';
import type { PressableProps } from '../host';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Pattern, Rect, RadialGradient, Image as SvgImage, Stop } from 'react-native-svg';
import { GRAIN_DATA_URI, GRAIN_TILE_PX } from '../grain';
import type { StyleProp, ViewStyle } from '../host';
import { useLiveBlur, useTheme } from '../theme';
import type { MirrorTheme } from '../tokens';
import { useWindowDimensions } from '../host';
import { a11yTarget, layoutMetrics } from '../a11y';
import { Text } from './text';

const withTheme = (theme: MirrorTheme | undefined) => theme ?? useTheme();

/* ------------------------------------------------------------ backdrop ------ */

/**
 * The backdrop: a smooth diagonal gradient (no bands or hard edges), soft radial glows, and a
 * grain texture. The glows are radial gradients that fade to transparent, so they have no
 * outline. Grain is a pattern of a small noise tile, painted at low alpha. Nothing here blurs.
 */
const FILL: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 0.4, y: 1 };
const GLOW_VIEWBOX = '0 0 100 100';

export function Backdrop({ theme }: { theme?: MirrorTheme }) {
  const t = withTheme(theme);
  const p = t.palette;
  return (
    // Clipped to its own bounds, so the gradient and grain never draw past a rounded tile.
    <View pointerEvents="none" style={[FILL, { backgroundColor: p.gradient[0], overflow: 'hidden' }]}>
      <LinearGradient colors={p.gradient as unknown as [string, string, ...string[]]} start={GRADIENT_START} end={GRADIENT_END} style={FILL} />
      <Svg width="100%" height="100%" viewBox={GLOW_VIEWBOX} preserveAspectRatio="none" style={FILL}>
        <Defs>
          {p.glows.map((g, i) => (
            <RadialGradient key={`rg${i}`} id={`glow-${t.name}-${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.alpha} />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {p.glows.map((g, i) => (
          <Circle key={`gc${i}`} cx={g.x * 100} cy={g.y * 100} r={g.r * 100} fill={`url(#glow-${t.name}-${i})`} />
        ))}
      </Svg>
      <Svg width="100%" height="100%" style={FILL}>
        <Defs>
          <Pattern id={`grain-${t.name}`} x="0" y="0" width={GRAIN_TILE_PX} height={GRAIN_TILE_PX} patternUnits="userSpaceOnUse">
            <SvgImage href={{ uri: GRAIN_DATA_URI }} x="0" y="0" width={GRAIN_TILE_PX} height={GRAIN_TILE_PX} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#grain-${t.name})`} opacity={p.grainAlpha} />
      </Svg>
    </View>
  );
}

/** Soft ambient shadow for glass tiles. iOS shadow props plus Android elevation. */
function tileShadow(t: MirrorTheme): ViewStyle {
  return {
    shadowColor: t.palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 3,
  };
}

/* -------------------------------------------------------------- materials --- */

export function Surface({
  children,
  radius = 'card',
  style,
  theme,
}: {
  children?: React.ReactNode;
  radius?: keyof MirrorTheme['radius'];
  style?: StyleProp<ViewStyle>;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return <View style={[{ backgroundColor: t.glass.shell.fill, borderRadius: t.radius[radius] }, style]}>{children}</View>;
}

/**
 * A live-blur surface. It asks the theme for a slot in the 3-layer budget; when
 * it does not get one it silently paints its pre-composited fill. `layer` names
 * the surface so the budget is legible in the component tree.
 */
export function GlassSurface({
  children,
  layer,
  radius = 'card',
  style,
  theme,
}: {
  children?: React.ReactNode;
  layer: 'sheet' | 'tabbar';
  radius?: keyof MirrorTheme['radius'];
  style?: StyleProp<ViewStyle>;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const granted = useLiveBlur(`${layer}:${radius}`, t.glass[layer].live);
  const spec = t.glass[layer];
  return (
    <View
      style={[
        {
          backgroundColor: spec.fill,
          borderRadius: t.radius[radius],
          borderWidth: 1,
          borderColor: t.color.borderHairline,
        },
        style,
      ]}
    >
      {children}
      {/* blurPx is applied by the platform layer (expo-blur) — see TabBar */}
      <View style={{ height: 0, opacity: granted ? 1 : 0 }} />
    </View>
  );
}

/* ------------------------------------------------------- shared glass panel --- */

export type GlowName = 'teal' | 'violet' | 'indigo' | 'none';

/** Glow colour for a card. Neutral hues only; a glow never says good or bad. */
export function glowColour(t: MirrorTheme, glow: GlowName): string | undefined {
  if (glow === 'none') return undefined;
  if (glow === 'violet') return t.palette.glowViolet;
  if (glow === 'indigo') return t.palette.glowIndigo;
  return t.palette.glowTeal;
}

/** Splits an rgba() string into a hex colour and its alpha, for SVG stops. Null when it does not parse. Pure. */
export function rgbaParts(value: string): { hex: string; alpha: number } | null {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(value);
  if (!m) return null;
  const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  return { hex, alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/** Soft top highlight: a gradient from the panel highlight to clear, over the top 45%. No blur. */
export function PanelHighlight({ theme }: { theme: MirrorTheme }) {
  const p = theme.palette.panelHighlight;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%' }}>
      <LinearGradient
        colors={[p, 'transparent'] as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={FILL}
      />
    </View>
  );
}

/** Coloured glow: a radial gradient that fades to clear, drawn in the card's corner. Static, no blur. */
function GlowLayer({ colour, name }: { colour: string; name: string }) {
  const parts = rgbaParts(colour);
  if (!parts) return null;
  const { hex, alpha } = parts;
  const id = `card-glow-${name}`;
  return (
    <View pointerEvents="none" style={FILL}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={FILL}>
        <Defs>
          <RadialGradient id={id} cx="85%" cy="0%" r="80%">
            <Stop offset="0" stopColor={hex} stopOpacity={alpha} />
            <Stop offset="1" stopColor={hex} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * The one shared panel material. Every nested panel, card and chip uses it: a translucent tint
 * (never a flat grey), a hairline border and a soft top highlight. It clips its children to its
 * radius, so no backdrop, grain or glow layer can show as a square edge. Nothing here blurs.
 */
export function GlassPanel({
  children,
  radius = 'card',
  glow = 'none',
  style,
  theme,
  testID,
}: {
  children?: React.ReactNode;
  radius?: keyof MirrorTheme['radius'];
  glow?: GlowName;
  style?: StyleProp<ViewStyle>;
  theme?: MirrorTheme;
  testID?: string;
}) {
  const t = withTheme(theme);
  const colour = glowColour(t, glow);
  return (
    <View
      testID={testID}
      // The audit reads these from the owning panel: the glow and the highlight both sit under its text.
      data-glow={colour}
      data-gradient={[t.palette.panelHighlight, 'transparent']}
      style={[
        {
          borderRadius: t.radius[radius],
          overflow: 'hidden',
          backgroundColor: t.glass.panel.fill,
          borderWidth: 1,
          borderColor: t.color.borderCard,
        },
        style,
      ]}
    >
      {colour ? <GlowLayer colour={colour} name={`${t.name}-${glow}`} /> : null}
      <PanelHighlight theme={t} />
      {children}
    </View>
  );
}

/** A card sunk into the shell: a GlassPanel with padding and the ambient shadow outside its clip. */
export function Card({
  children,
  elevated,
  glow = 'teal',
  style,
  theme,
  testID,
}: {
  children?: React.ReactNode;
  elevated?: boolean;
  glow?: GlowName;
  style?: StyleProp<ViewStyle>;
  theme?: MirrorTheme;
  testID?: string;
}) {
  const t = withTheme(theme);
  if (elevated) {
    return (
      <View
        testID={testID}
        style={[
          { borderRadius: t.radius.card, padding: t.space(4), marginBottom: t.space(3), backgroundColor: t.color.elevated, ...tileShadow(t) },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  // The shadow sits on an outer view: iOS clips shadows of a view that has overflow hidden.
  return (
    <View style={[{ borderRadius: t.radius.card, marginBottom: t.space(3), backgroundColor: t.glass.panel.fill }, tileShadow(t), style]}>
      <GlassPanel theme={t} glow={glow} style={{ padding: t.space(4) }} testID={testID}>
        {children}
      </GlassPanel>
    </View>
  );
}

/* ---------------------------------------------------------------- Screen ---- */

/**
 * The demo-data chip. Defined here rather than in patterns.tsx because patterns
 * imports containers, and a chip is too small a thing to invert that dependency
 * for. `patterns.DemoDataChip` re-exports it for consumers that expect it there.
 */
export function DemoChip({ persona, theme }: { persona: string; theme?: MirrorTheme }) {
  const t = withTheme(theme);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Demo data from ${persona}. Not your data.`}
      style={{ paddingHorizontal: t.space(4), paddingTop: t.space(2) }}
    >
      <View
        style={{
          alignSelf: 'flex-start',
          minHeight: t.size.chipHeight,
          justifyContent: 'center',
          paddingHorizontal: t.space(3),
          borderRadius: t.radius.pill,
          backgroundColor: t.glass.chip.fill,
          borderWidth: 1,
          borderColor: t.color.borderCard,
        }}
      >
        <Text role="micro" tone="muted" theme={t} style={{ fontWeight: '700' }}>
          {`DEMO DATA · ${persona.toUpperCase()}`}
        </Text>
      </View>
    </View>
  );
}

export type ScreenProps = {
  children: React.ReactNode;
  /** Header content (title row / brand + actions). */
  header?: React.ReactNode;
  /** Pinned below the scroll body, e.g. a floating tab bar. */
  footer?: React.ReactNode;
  /** Overlay above everything, e.g. a sheet + scrim. */
  overlay?: React.ReactNode;
  /** Set false for full-bleed screens (onboarding) that own their padding. */
  padded?: boolean;
  theme?: MirrorTheme;
  /** Test hook + accessibility name for the screen. */
  title: string;
};

export function Screen({ children, header, footer, overlay, padded = true, theme, title, demo }: ScreenProps & { demo?: string }) {
  const t = withTheme(theme);
  const metrics = layoutMetrics(t);
  return (
    <View
      accessibilityLabel={`${title} screen`}
      style={{ flex: 1, backgroundColor: t.color.canvas, borderRadius: t.radius.phone, overflow: 'hidden' }}
    >
      <Backdrop theme={t} />
      <StatusStrip theme={t} />
      {demo ? <DemoChip persona={demo} theme={t} /> : null}
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: padded ? metrics.gutter : 0,
          paddingBottom: metrics.bottomInset,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
      {overlay}
    </View>
  );
}

/** 44pt strip with the clock — the brief measured it; it doubles as the notch inset. */
export function StatusStrip({ label = '9:41', theme }: { label?: string; theme?: MirrorTheme }) {
  const t = withTheme(theme);
  return (
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: t.space(6), paddingBottom: t.space(1) }}>
      <Text role="micro" tone="muted" theme={t}>
        {label}
      </Text>
      <Text role="micro" tone="muted" theme={t}>
        ▮▮▮ ⌁
      </Text>
    </View>
  );
}

/** Header row: title, optional subtitle, optional actions on the right. */
export function Toolbar({
  title,
  subtitle,
  actions,
  theme,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View
      style={{
        minHeight: t.size.headerHeight,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: t.space(3),
        paddingHorizontal: t.space(4),
        paddingTop: t.space(1),
        paddingBottom: t.space(2),
      }}
    >
      <View accessible accessibilityRole="header" style={{ flex: 1, flexShrink: 1, minWidth: 180 }}>
        <Text role="headline" theme={t}>
          {title}
        </Text>
        {subtitle ? (
          <Text role="label" tone="muted" theme={t}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space(2), flexShrink: 0 }}>{actions}</View>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- Sheet ---- */

/**
 * A bottom sheet. Five ways to close it, each tested:
 *   1. drag the handle or header down past the snap threshold (or flick down);
 *   2. tap the scrim outside the sheet;
 *   3. the Android back button (hardwareBackPress);
 *   4. the visible Close button, which is also the TalkBack route;
 *   5. the handle, a 48dp Pressable.
 * Snap points are OPEN (rest) and DISMISSED (off the bottom). Dragging up is rubber-banded.
 * Motion uses the theme's durations, so reduce-motion closes and snaps instantly.
 * The surface is solid (the same panel hue family), so text never sits on a live layer.
 */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  theme,
  maxHeight = '86%' as const,
  bottomInset = 0,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  theme?: MirrorTheme;
  maxHeight?: `${number}%`;
  bottomInset?: number;
}) {
  const t = withTheme(theme);
  const { height } = useWindowDimensions();
  const sheetHeight = (height * parseInt(maxHeight, 10)) / 100;
  const dragY = React.useRef(new Animated.Value(0)).current;
  const [sheetH, setSheetH] = React.useState(sheetHeight);
  const closingRef = React.useRef(false);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const run = (): void => {
      closingRef.current = false;
      dragY.setValue(0);
      onCloseRef.current();
    };
    const duration = t.motion('base');
    if (duration <= 0) {
      run();
      return;
    }
    Animated.timing(dragY, { toValue: sheetH, duration, useNativeDriver: true }).start(({ finished }) => {
      if (finished) run();
    });
  }, [dragY, sheetH, t]);

  const snapBack = React.useCallback(() => {
    const duration = t.motion('fast');
    if (duration <= 0) {
      dragY.setValue(0);
      return;
    }
    Animated.timing(dragY, { toValue: 0, duration, useNativeDriver: true }).start();
  }, [dragY, t]);

  // Android back closes the sheet while it is open (and is consumed, so the screen behind stays).
  React.useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [open, dismiss]);

  // Reset the drag whenever the sheet opens again.
  React.useEffect(() => {
    if (open) dragY.setValue(0);
  }, [open, dragY]);

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => isSheetDragStart(g.dx, g.dy),
        onPanResponderMove: (_e, g) => dragY.setValue(sheetDragOffset(g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (sheetReleaseAction(g.dy, g.vy, sheetH) === 'dismiss') dismiss();
          else snapBack();
        },
        onPanResponderTerminate: () => snapBack(),
      }),
    [dragY, dismiss, snapBack, sheetH],
  );

  if (!open) return null;
  return (
    <View
      accessibilityViewIsModal
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}
    >
      {/* scrim: tapping outside closes, and it is always at least 48dp in both dimensions */}
      <Pressable
        onPress={dismiss}
        {...a11yTarget(`Dismiss ${title}`)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: t.color.scrim,
          minWidth: t.size.touchTarget,
          minHeight: t.size.touchTarget,
        }}
      />
      <Animated.View
        data-gradient={[t.palette.panelHighlight, 'transparent']}
        onLayout={(e: { nativeEvent: { layout: { height: number } } }) => setSheetH(e.nativeEvent.layout.height)}
        style={{
          backgroundColor: t.glass.sheet.fill,
          borderTopLeftRadius: t.radius.sheet,
          borderTopRightRadius: t.radius.sheet,
          borderWidth: 1,
          borderColor: t.color.borderCard,
          overflow: 'hidden',
          // A bounded column: the scroll area below takes what is left after the handle and
          // header, so long content (e.g. three budget suggestions) scrolls instead of clipping.
          maxHeight: (height * parseInt(maxHeight, 10)) / 100,
          flexShrink: 1,
          paddingBottom: t.space(6) + Math.max(0, bottomInset),
          transform: [{ translateY: dragY }],
        }}
      >
        <PanelHighlight theme={t} />
        {/* Drag area: the grab handle and the header. A 48dp Pressable closes it too. */}
        <View {...pan.panHandlers}>
          <Pressable
            onPress={dismiss}
            {...a11yTarget(`Close ${title}`)}
            style={{
              width: '100%',
              height: t.size.touchTarget,
              minWidth: t.size.touchTarget,
              minHeight: t.size.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: t.radius.pill, backgroundColor: t.color.borderCard }} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.space(2), paddingHorizontal: t.space(4), paddingBottom: t.space(2) }}>
            <View accessible accessibilityRole="header" style={{ flex: 1, flexShrink: 1 }}>
              <Text role="title-lg" theme={t}>
                {title}
              </Text>
              {subtitle ? (
                <Text role="label" tone="muted" theme={t}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {/* The visible Close: 48dp, labelled for TalkBack, same action as the other paths. */}
            <Pressable
              testID="sheet-close"
              onPress={dismiss}
              {...a11yTarget(`Close ${title}`)}
              style={{
                minHeight: t.size.touchTarget,
                minWidth: t.size.touchTarget,
                paddingHorizontal: t.space(3),
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: t.radius.pill,
                borderWidth: 1,
                borderColor: t.color.inkMuted,
              }}
            >
              <Text role="label" theme={t} style={{ fontWeight: '600' }}>
                Close
              </Text>
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space(4), paddingBottom: t.space(2) }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------- Hero ------- */

export type HeroSlide = { id: string; kicker: string; title: string; body: string; stat?: { value: string; unit?: string; label: string } };

/**
 * The swipeable hero from the reference layout: one slide per pager index, a dot
 * indicator, and no auto-advance (auto-advance is the enemy of a calm product).
 */
export function HeroCarousel({
  slides,
  index,
  onIndexChange,
  theme,
}: {
  slides: HeroSlide[];
  index: number;
  onIndexChange: (i: number) => void;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const { width } = useWindowDimensions();
  const slideWidth = Math.min(width, 390) - t.space(8);
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  return (
    <View style={{ marginBottom: t.space(3) }}>
      <View
        style={{
          borderRadius: t.radius.hero,
          backgroundColor: t.color.anchor,
          padding: t.space(4),
          minHeight: 176,
          justifyContent: 'space-between',
        }}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${slide.kicker}. ${slide.title}. ${slide.body}`}
      >
        <Text role="micro" theme={t} style={{ color: t.color.mutedOnAnchor }}>
          {slide.kicker}
        </Text>
        <Text role="headline" theme={t} style={{ color: t.color.onAnchor }}>
          {slide.title}
        </Text>
        <Text role="label" theme={t} style={{ color: t.color.mutedOnAnchor }}>
          {slide.body}
        </Text>
        {slide.stat ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space(1) }}>
            <Text role="display" theme={t} style={{ color: t.color.onAnchor }}>
              {slide.stat.value}
            </Text>
            {slide.stat.unit ? (
              <Text role="title" theme={t} style={{ color: t.color.onAnchor }}>
                {slide.stat.unit}
              </Text>
            ) : null}
            <Text role="label" theme={t} style={{ color: t.color.mutedOnAnchor }}>
              {slide.stat.label}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.space(1), marginTop: t.space(2) }}>
        {slides.map((s, i) => (
          <Pressable
            key={s.id}
            onPress={() => onIndexChange(i)}
            accessibilityRole="button"
            accessibilityLabel={`Slide ${i + 1} of ${slides.length}: ${s.title}`}
            accessibilityState={{ selected: i === index }}
            style={{
              width: t.size.touchTarget,
              height: t.size.touchTarget,
              minWidth: t.size.touchTarget,
              minHeight: t.size.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: i === index ? 18 : 7,
                height: 7,
                borderRadius: t.radius.pill,
                backgroundColor: i === index ? t.color.ink : t.color.borderCard,
              }}
            />
          </Pressable>
        ))}
      </View>
      <Text role="micro" tone="muted" theme={t} center>
        {`${index + 1} / ${slides.length} · swipe`}
      </Text>
      <Text role="micro" tone="muted" theme={t} center style={{ width: 0, height: 0 }}>
        {slideWidth.toFixed(0)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- Sparkline ---- */

/**
 * A 7-day trend line. It has no axes on purpose: the caption carries the numbers,
 * so a glance gives the shape and a read gives the value.
 */
export function Sparkline({
  values,
  height = 64,
  label,
  theme,
}: {
  values: number[];
  height?: number;
  label: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const max = Math.max(...values, 1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: t.space(1) }}>
      {values.map((value, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, (value / max) * (height - 8)),
            borderRadius: t.radius.xs,
            backgroundColor: t.color.inkMuted,
            opacity: i === values.length - 1 ? 1 : 0.55,
          }}
        />
      ))}
    </View>
  );
}

/** Concentric progress ring used for the day's focus share. */
export function Ring({
  value,
  caption,
  size = 96,
  theme,
}: {
  value: number;
  caption: string;
  size?: number;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={caption} accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }} style={{ alignItems: 'center', gap: t.space(1) }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: t.radius.pill,
          borderWidth: 8,
          borderColor: t.glass.chip.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 8,
            width: size - 16,
            height: 6,
            borderRadius: t.radius.pill,
            backgroundColor: t.color.anchor,
            transform: [{ rotate: `${clamped * 360}deg` }],
          }}
        />
        <Text role="title-lg" theme={t}>
          {`${Math.round(clamped * 100)}%`}
        </Text>
      </View>
      <Text role="micro" tone="muted" theme={t}>
        {caption}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------- press + entrance --- */

/**
 * Press feedback: the child eases to 98% while pressed (instant, 90 ms). The gesture and the
 * press handlers are the Pressable's own, so accessibility and hit targets are unchanged.
 * Under reduce-motion the duration is 0 and nothing scales.
 */
export function PressScale({
  children,
  theme,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { theme?: MirrorTheme; children: React.ReactNode }) {
  const t = withTheme(theme);
  const scale = React.useRef(new Animated.Value(1)).current;
  const ease = (to: number) => {
    const duration = t.motion('instant');
    if (duration <= 0) {
      scale.setValue(to);
      return;
    }
    Animated.timing(scale, { toValue: to, duration, useNativeDriver: true }).start();
  };
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        ease(0.98);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        ease(1);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={{ flex: 1, transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

/** Staggered entrance step and the cap on how many steps are staggered. Total stays under 300 ms. */
export const ENTER_STEP_MS = 30;
export const ENTER_MAX_STEPS = 4;

/**
 * One tile of a staggered entrance: fades in and rises 8 dp. Delay is index x 30 ms, capped at
 * four steps, then 160 ms (fast). Maximum 280 ms. Off when `enabled` is false or under reduce-motion.
 */
export function EnterTile({
  index,
  enabled,
  theme,
  children,
}: {
  index: number;
  enabled: boolean;
  theme?: MirrorTheme;
  children: React.ReactNode;
}) {
  const t = withTheme(theme);
  const anim = React.useRef(new Animated.Value(enabled ? 0 : 1)).current;
  React.useEffect(() => {
    if (!enabled) return undefined;
    const duration = t.motion('fast');
    if (duration <= 0) {
      anim.setValue(1);
      return undefined;
    }
    const delay = Math.min(index, ENTER_MAX_STEPS) * ENTER_STEP_MS;
    const run = Animated.timing(anim, { toValue: 1, duration, delay, useNativeDriver: true });
    run.start();
    return () => run.stop();
    // Runs once per mount: the entrance plays when the tab first appears, not on every render.
  }, []);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
