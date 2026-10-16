/**
 * Text and display primitives.
 *
 * Every one of these takes an optional `theme` prop. In an app you let the
 * provider supply it; in a test or the mockup renderer you pass it explicitly.
 * Nothing here reads a raw pixel value from anywhere except the token object.
 */
import * as React from 'react';
import { RNText, View } from '../host.js';
import type { StyleProp, TextStyle, ViewStyle } from '../host.js';
import { useTheme } from '../theme.js';
import type { MirrorTheme, TypeRole } from '../tokens.js';
import type { DataTier } from '../tiers.js';
import { TIERS } from '../tiers.js';

type BaseProps = {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  theme?: MirrorTheme;
  numberOfLines?: number;
  /** 'auto' lets the OS font setting through; tokens scale on top of it. */
  allowFontScaling?: boolean;
  /**
   * Announce changes to this text — used where a number updates in place
   * (meters, budgets). 'polite' is the only value any component here needs.
   */
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
};

const withTheme = (theme: MirrorTheme | undefined) => theme ?? useTheme();

/* ------------------------------------------------------------------- Text -- */

export type TextProps = BaseProps & {
  /** Type role from the measured scale. There is no other way to set a size. */
  role?: TypeRole;
  /** Only for colour. Sizes never come from here. */
  tone?: 'core' | 'muted' | 'onAnchor' | 'mutedOnAnchor' | 'onChip' | 'onLight';
  weight?: 'auto' | 'regular' | 'medium' | 'bold';
  center?: boolean;
};

export function Text({
  role = 'body',
  tone = 'core',
  weight = 'auto',
  center,
  children,
  style,
  theme,
  numberOfLines,
  allowFontScaling = true,
  accessibilityLiveRegion,
}: TextProps) {
  const t = withTheme(theme);
  const type = t.type(role);
  const colour =
    tone === 'muted' ? t.color.inkMuted : tone === 'onAnchor' ? t.color.onAnchor : tone === 'mutedOnAnchor' ? t.color.mutedOnAnchor : tone === 'onChip' ? t.color.onChip : tone === 'onLight' ? t.color.ink : t.color.ink;
  const fontWeight = weight === 'auto' ? type.fontWeight : weight === 'bold' ? '700' : weight === 'medium' ? '500' : '400';
  return (
    <RNText
      allowFontScaling={allowFontScaling}
      numberOfLines={numberOfLines}
      accessibilityLiveRegion={accessibilityLiveRegion}
      style={[
        {
          color: colour,
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          fontWeight: fontWeight as TextStyle['fontWeight'],
          letterSpacing: type.letterSpacing,
          textAlign: center ? 'center' : 'auto',
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/** Section heading + optional trailing action, used by every screen body. */
export function SectionHeader({
  title,
  caption,
  trailing,
  theme,
}: {
  title: string;
  caption?: string;
  trailing?: React.ReactNode;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space(2) }}>
      <View style={{ flexShrink: 1 }}>
        <Text role="title-lg" theme={t}>
          {title}
        </Text>
        {caption ? (
          <Text role="label" tone="muted" theme={t} style={{ marginTop: t.space(1) }}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/* ------------------------------------------------------------------- Stat -- */

export function Stat({
  value,
  unit,
  label,
  hint,
  tone = 'core',
  theme,
}: {
  value: string;
  unit?: string;
  label: string;
  /** The hedge word ("about", "roughly") belongs in the sentence, not the number. */
  hint?: string;
  tone?: TextProps['tone'];
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={`${label}: ${value} ${unit ?? ''}`.trim()}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space(1) }}>
        <Text role="display" tone={tone} theme={t}>
          {value}
        </Text>
        {unit ? (
          <Text role="title" tone={tone} theme={t}>
            {unit}
          </Text>
        ) : null}
      </View>
      <Text role="label" tone="muted" theme={t} style={{ marginTop: t.space(1) }}>
        {label}
      </Text>
      {hint ? (
        <Text role="micro" tone="muted" theme={t} style={{ marginTop: t.space(1) }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- Badges -- */

export function TierBadge({ tier, ghost, theme }: { tier: DataTier | '—'; ghost?: boolean; theme?: MirrorTheme }) {
  const t = withTheme(theme);
  const style: ViewStyle = ghost
    ? { borderWidth: 1, borderColor: t.color.borderCard, backgroundColor: 'transparent' }
    : { backgroundColor: t.color.chip };
  const tone = ghost ? 'muted' : 'onChip';
  return (
    <View
      accessible
      accessibilityLabel={`data tier ${tier}${tier === '—' ? '' : `: ${TIERS[tier as DataTier].name}`}`}
      style={[{ minWidth: t.space(4), height: t.space(3), alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.space(1), borderRadius: t.radius.pill }, style]}
    >
      <Text role="micro" tone={tone} theme={t}>
        {tier}
      </Text>
    </View>
  );
}

/**
 * The confidence chip. It names *which* tiers a screen is standing on and opens
 * the capability matrix — the honest alternative to a tooltip that says "beta".
 */
export function ConfidenceChip({
  tiers,
  onPress,
  label,
  theme,
}: {
  tiers: DataTier[];
  onPress?: () => void;
  label?: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const text = label ?? (tiers.length ? `Based on ${tiers.slice().sort().join(' + ')}` : 'No data yet');
  return (
    <View
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${text}${onPress ? '. Opens the capability matrix.' : ''}`}
      onStartShouldSetResponder={onPress ? () => true : undefined}
      onResponderRelease={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space(1),
        paddingHorizontal: t.space(2),
        minHeight: t.size.chipTouchHeight,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space(1),
          paddingHorizontal: t.space(2),
          height: t.size.chipHeight,
          borderRadius: t.radius.pill,
          backgroundColor: t.glass.chip.fill,
          borderWidth: 1,
          borderColor: t.color.borderCard,
        }}
      >
        <Text role="label" tone="muted" theme={t}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- ListRow ---- */

export function ListRow({
  leading,
  title,
  meta,
  trailing,
  onPress,
  accessibilityLabel,
  theme,
}: {
  leading?: React.ReactNode;
  title: string;
  meta?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space(3), paddingVertical: t.space(3), minHeight: t.size.touchTarget }}>
      {leading}
      <View style={{ flex: 1 }}>
        <Text role="body" theme={t}>
          {title}
        </Text>
        {meta ? (
          <Text role="label" tone="muted" theme={t} style={{ marginTop: 2 }}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return content;
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, meta].filter(Boolean).join(', ')}
      onStartShouldSetResponder={() => true}
      onResponderRelease={onPress}
    >
      {content}
    </View>
  );
}

/* ------------------------------------------------------------ Callout etc. -- */

/**
 * The one place a caveat is rendered. `tone="warn"` is reserved for a real
 * limitation ("this cannot be measured"), never for engagement copy.
 */
export function Callout({
  children,
  tone = 'neutral',
  theme,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'limit';
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View
      style={{
        borderRadius: t.radius.md,
        padding: t.space(3),
        backgroundColor: tone === 'limit' ? t.glass.chip.fill : 'transparent',
        borderWidth: 1,
        borderColor: t.color.borderCard,
        gap: t.space(1),
      }}
    >
      <Text role="label" tone="muted" theme={t}>
        {children}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  theme,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ alignItems: 'center', paddingVertical: t.space(6), paddingHorizontal: t.space(4), gap: t.space(2) }}>
      <View
        style={{
          width: t.space(6),
          height: t.space(6),
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: t.color.borderCard,
        }}
      />
      <Text role="title" theme={t} center>
        {title}
      </Text>
      <Text role="label" tone="muted" theme={t} center style={{ maxWidth: 260 }}>
        {body}
      </Text>
      {action}
    </View>
  );
}

export function Divider({ theme }: { theme?: MirrorTheme }) {
  const t = withTheme(theme);
  return <View style={{ height: 1, backgroundColor: t.color.borderCard, marginVertical: t.space(2) }} />;
}

/** A labelled 0…1 meter. Used by budgets, depth scores and tier coverage. */
export function Meter({
  value,
  label,
  caption,
  tone = 'anchor',
  theme,
}: {
  value: number;
  label: string;
  caption?: string;
  tone?: 'anchor' | 'muted';
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ gap: t.space(1) }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text role="label" theme={t}>
          {label}
        </Text>
        {caption ? (
          <Text role="label" tone="muted" theme={t}>
            {caption}
          </Text>
        ) : null}
      </View>
      <View style={{ height: 8, borderRadius: t.radius.pill, backgroundColor: t.glass.chip.fill, overflow: 'hidden' }}>
        <View
          style={{
            width: `${clamped * 100}%`,
            height: '100%',
            borderRadius: t.radius.pill,
            backgroundColor: tone === 'anchor' ? t.color.anchor : t.color.inkMuted,
          }}
        />
      </View>
    </View>
  );
}
