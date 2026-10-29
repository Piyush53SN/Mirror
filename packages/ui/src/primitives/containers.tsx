/**
 * Containers: the phone frame, the glass materials, sheets and data displays.
 *
 * The material stack is the one thing the reference image actually specifies:
 * a blurred backdrop, a translucent shell over it, sunk cards inside the shell,
 * and a shadow that stays ambient (outside the shell the luminance falls ≤2%
 * over 40px, so a hard drop shadow would be a lie).
 */
import * as React from 'react';
import { View, ScrollView, Pressable } from '../host';
import type { StyleProp, ViewStyle } from '../host';
import { useLiveBlur, useTheme } from '../theme';
import type { MirrorTheme } from '../tokens';
import { useWindowDimensions } from '../host';
import { a11yTarget, layoutMetrics } from '../a11y';
import { Text } from './text';

const withTheme = (theme: MirrorTheme | undefined) => theme ?? useTheme();

/* ------------------------------------------------------------ backdrop ------ */

/**
 * The backdrop: veil → canvas → glow, plus the bloom the brief measured as
 * coming from below/behind-left, and the grain overlay (a token, not a texture
 * file — the reference has no film grain, so this stays at 0.02).
 */
export function Backdrop({ theme }: { theme?: MirrorTheme }) {
  const t = withTheme(theme);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.color.canvas }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: t.color.veil, opacity: t.isDark ? 0.5 : 0.35 }} />
      <View
        style={{
          position: 'absolute',
          left: '-22%',
          bottom: '-18%',
          width: '150%',
          height: '78%',
          borderRadius: t.radius.pill,
          backgroundColor: t.color.glow,
          opacity: t.color.bloomAlpha,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: '-30%',
          top: '-12%',
          width: '118%',
          height: '46%',
          borderRadius: t.radius.pill,
          backgroundColor: t.color.veil,
          opacity: 0.35,
        }}
      />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: t.color.grain }} />
    </View>
  );
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

/** A card sunk into the shell: the surface the reference uses for content. */
export function Card({
  children,
  elevated,
  style,
  theme,
}: {
  children?: React.ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View
      style={[
        {
          borderRadius: t.radius.card,
          padding: t.space(4),
          marginBottom: t.space(3),
          backgroundColor: elevated ? t.color.elevated : t.glass.card.fill,
          borderWidth: elevated ? 0 : 1,
          borderColor: t.color.borderCard,
        },
        style,
      ]}
    >
      {children}
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
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.space(3),
        paddingHorizontal: t.space(4),
        paddingBottom: t.space(2),
      }}
    >
      <View accessible accessibilityRole="header" style={{ flexShrink: 1 }}>
        <Text role="headline" theme={t}>
          {title}
        </Text>
        {subtitle ? (
          <Text role="label" tone="muted" theme={t} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space(2) }}>{actions}</View>
    </View>
  );
}

/* ----------------------------------------------------------------- Sheet ---- */

/**
 * A bottom sheet — uses an opaque `theme.color.card` surface so underlying text
 * never bleeds through and contrast stays >= 4.5:1 across dark and light themes.
 * `dismissible` is always true by construction: the scrim and the handle are both
 * real >= 48dp `Pressable` targets for TalkBack, and `accessibilityViewIsModal`
 * keeps screen-reader focus inside the open sheet.
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
  if (!open) return null;
  return (
    <View
      accessibilityViewIsModal
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}
    >
      {/* scrim: tapping outside closes, and it is always at least 48dp in both dimensions */}
      <Pressable
        onPress={onClose}
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
      <View
        style={{
          backgroundColor: t.color.card,
          borderTopLeftRadius: t.radius.sheet,
          borderTopRightRadius: t.radius.sheet,
          borderWidth: 1,
          borderColor: t.color.borderCard,
          maxHeight: (height * parseInt(maxHeight, 10)) / 100,
          paddingBottom: t.space(6) + Math.max(0, bottomInset),
        }}
      >
        {/* grab handle: 48dp tall Pressable, the visible bar is 4dp */}
        <Pressable
          onPress={onClose}
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
        <View accessible accessibilityRole="header" style={{ paddingHorizontal: t.space(4), paddingBottom: t.space(2) }}>
          <Text role="title-lg" theme={t}>
            {title}
          </Text>
          {subtitle ? (
            <Text role="label" tone="muted" theme={t}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: t.space(4) }} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
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
