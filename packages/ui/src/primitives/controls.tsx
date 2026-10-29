/**
 * Interactive primitives.
 *
 * Every control here is built through `touchTarget()`/`Pressable` with hitSlop,
 * so the 48dp rule is a property of the component rather than a style each
 * screen has to remember. The mockup tests measure the rendered output; the
 * `size` prop only ever changes what you *see*, never what you can hit.
 */
import * as React from 'react';
import { Pressable, TextInput, View } from '../host';
import type { StyleProp, ViewStyle } from '../host';
import { useTheme } from '../theme';
import type { MirrorTheme } from '../tokens';
import type { DataTier } from '../tiers';
import { a11yTarget, coerceLabel, hitSlopFor } from '../a11y';
import { Text, TierBadge } from './text';

type ControlBase = {
  onPress?: () => void;
  disabled?: boolean;
  theme?: MirrorTheme;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const withTheme = (theme: MirrorTheme | undefined) => theme ?? useTheme();

/** Shared press behaviour: hitSlop, pressed feedback that respects reduce-motion. */
function usePressableBase(theme: MirrorTheme, visualHeight: number, onPress?: () => void, disabled?: boolean) {
  return {
    hitSlop: hitSlopFor(visualHeight, theme),
    disabled,
    onPress,
    style: ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => ({
      opacity: pressed && !theme.reducedMotion ? 0.86 : 1,
    }),
  };
}

/* ---------------------------------------------------------------- Pill ------ */

export type PillProps = ControlBase & {
  children: string;
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: React.ReactNode;
  /** Visual height; the hit area is padded up to 48dp automatically. */
  size?: number;
  /** Optional spoken override for TalkBack (e.g. spoken dates instead of MM-DD). */
  accessibilityLabel?: string;
};

/**
 * The reference's "Create" pill: an anchor-coloured capsule with dark ink.
 * Primary pills are for the single most likely intent on a screen, never for
 * encouragement.
 */
export function Pill({
  children,
  variant = 'primary',
  onPress,
  disabled,
  icon,
  theme,
  style,
  size,
  accessibilityLabel,
  testID,
}: PillProps) {
  const t = withTheme(theme);
  const height = size ?? 44;
  const press = usePressableBase(t, height, onPress, disabled);
  const baseBackground = variant === 'primary' ? t.color.anchor : variant === 'secondary' ? t.glass.chip.fill : 'transparent';
  const background = disabled ? t.glass.chip.fill : baseBackground;
  const colour = disabled ? t.color.inkMuted : variant === 'primary' ? t.color.onAnchor : t.color.ink;
  // Coerce children to string for accessibilityLabel – prevents ReadableNativeArray crash when children is array at runtime
  const rawChildren: unknown = accessibilityLabel ?? children;
  const labelForA11y = typeof rawChildren === 'string' ? rawChildren : Array.isArray(rawChildren) ? rawChildren.join(' ') : String(rawChildren ?? '');

  return (
    <Pressable
      testID={testID}
      {...press}
      {...a11yTarget(labelForA11y, undefined, disabled)}
      style={[
        {
          minHeight: t.size.touchTarget,
          minWidth: t.size.touchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: t.space(4),
        },
        style,
      ]}
    >
      <View
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space(2),
          paddingHorizontal: t.space(4),
          borderRadius: t.radius.pill,
          backgroundColor: background,
          borderWidth: disabled || variant === 'quiet' ? 1 : 0,
          borderColor: t.color.borderCard,
        }}
      >
        {icon}
        <Text role="label" theme={t} style={{ color: colour, fontWeight: '600' }}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

/* ----------------------------------------------------------- IconButton ----- */

export function IconButton({
  label,
  children,
  onPress,
  disabled,
  badge,
  theme,
  testID,
}: ControlBase & { label: string; children: React.ReactNode; badge?: boolean }) {
  const t = withTheme(theme);
  const press = usePressableBase(t, t.size.iconButton, onPress, disabled);
  return (
    <Pressable
      testID={testID}
      {...press}
      {...a11yTarget(label, undefined, disabled)}
      style={{
        width: t.size.iconButton,
        height: t.size.iconButton,
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.glass.chip.fill,
        borderWidth: 1,
        borderColor: t.color.borderCard,
      }}
    >
      {children}
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: t.space(2),
            right: t.space(2),
            width: 7,
            height: 7,
            borderRadius: t.radius.pill,
            backgroundColor: t.color.ink,
            borderWidth: 1.5,
            borderColor: t.color.anchor,
          }}
        />
      ) : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Chip ------ */

/**
 * A filter chip. The tap area is 48dp tall; the pill you see is 32dp. That gap
 * is the whole reason chips in this system feel right on a phone.
 */
export function Chip({
  label,
  value,
  onPress,
  static: isStatic,
  theme,
  testID,
}: ControlBase & { label: string; value?: string; static?: boolean }) {
  const t = withTheme(theme);
  if (isStatic) {
    return (
      <View style={{ height: t.size.touchTarget, justifyContent: 'center' }}>
        <View
          style={{
            height: t.size.chipHeight,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space(1),
            paddingHorizontal: t.space(3),
            borderRadius: t.radius.pill,
            backgroundColor: t.glass.chip.fill,
            borderWidth: 1,
            borderColor: t.color.borderCard,
          }}
        >
          <Text role="label" tone="muted" theme={t}>
            {label}
          </Text>
          {value ? (
            <Text role="label" tone="muted" theme={t} style={{ fontWeight: '600' }}>
              {value}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
  const press = usePressableBase(t, t.size.chipHeight, onPress);
  return (
    <Pressable
      testID={testID}
      {...press}
      {...a11yTarget(`${label}${value ? `: ${value}` : ''}. Opens a picker.`)}
      style={{ height: t.size.touchTarget, justifyContent: 'center', minWidth: t.size.touchTarget }}
    >
      <View
        style={{
          height: t.size.chipHeight,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space(1),
          paddingHorizontal: t.space(3),
          borderRadius: t.radius.pill,
          backgroundColor: t.glass.chip.fill,
          borderWidth: 1,
          borderColor: t.color.borderCard,
        }}
      >
        <Text role="label" tone="muted" theme={t}>
          {label}
        </Text>
        {value ? (
          <Text role="label" theme={t} style={{ fontWeight: '600' }}>
            {value}
          </Text>
        ) : null}
        <Text role="micro" tone="muted" theme={t}>
          ▾
        </Text>
      </View>
    </Pressable>
  );
}

/** Horizontal scroller of chips, with the edge inset the brief measured. */
export function ChipRow({ children, theme }: { children: React.ReactNode; theme?: MirrorTheme }) {
  const t = withTheme(theme);
  return (
    <View style={{ flexDirection: 'row', gap: t.space(2), paddingHorizontal: t.space(4), flexWrap: 'wrap' }}>{children}</View>
  );
}

/* ------------------------------------------------------ SegmentedControl ---- */

export type SegmentOption<T extends string> = { value: T; label: string; icon?: React.ReactNode };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  theme,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        borderRadius: t.radius.pill,
        backgroundColor: t.glass.chip.fill,
        borderWidth: 1,
        borderColor: t.color.borderCard,
        alignSelf: 'flex-start',
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            hitSlop={hitSlopFor(44, t)}
            style={{ minHeight: t.size.touchTarget + 4, minWidth: t.size.touchTarget, padding: 3, justifyContent: 'center' }}
          >
            <View
              style={{
                height: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space(1),
                paddingHorizontal: t.space(4),
                borderRadius: t.radius.pill,
                backgroundColor: selected ? t.color.anchor : 'transparent',
              }}
            >
              {option.icon}
              <Text role="label" theme={t} style={{ color: selected ? t.color.onAnchor : t.color.inkMuted, fontWeight: '600' }}>
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------- BoundaryToggle ----- */

export type Boundary = 'private' | 'public';

/**
 * The Private | Public control. It exists on every screen that can be shared,
 * because the product rule is that profiles are never merged *and the user can
 * always see which one is on screen*. The caption under it states, in the UI,
 * what leaves the device — not in a policy page.
 */
export function BoundaryToggle({
  value,
  onChange,
  consequence,
  theme,
}: {
  value: Boundary;
  onChange: (value: Boundary) => void;
  /** Rendered as a live description; screens pass the real consequence sentence. */
  consequence: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ gap: t.space(2) }}>
      <SegmentedControl
        label="Profile being viewed"
        value={value}
        onChange={onChange}
        theme={t}
        options={[
          { value: 'private' as Boundary, label: 'Private' },
          { value: 'public' as Boundary, label: 'Public' },
        ]}
      />
      <Text
        role="label"
        tone={value === 'public' ? 'core' : 'muted'}
        theme={t}
        accessibilityLiveRegion="polite"
        style={{ paddingHorizontal: t.space(4) }}
      >
        {consequence}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------- TabBar ----- */

export type TabItem = { id: string; label: string; icon?: React.ReactNode };

/**
 * The floating tab bar. Two things are deliberate: it is the only control pinned
 * to the bottom (a floating bar, not a full-width one — the brief measured 16pt
 * margins), and it is one of the two surfaces allowed to spend a live-blur pass.
 */
export function TabBar({
  items,
  active,
  onChange,
  bottomOffset,
  theme,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Granted by useLiveBlur(); false paints the pre-composited fill instead. */
  liveBlur?: boolean;
  /** Distance from the bottom edge in dp (defaults to 16dp, or safe-area bottom + 8dp on device). */
  bottomOffset?: number;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Sections"
      style={{
        position: 'absolute',
        left: t.space(4),
        right: t.space(4),
        bottom: bottomOffset ?? t.space(4),
        height: t.size.tabBar,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: t.space(1),
        borderRadius: t.radius.pill,
        backgroundColor: t.glass.tabbar.fill,
        borderWidth: 1,
        borderColor: t.color.borderHairline,
      }}
    >
      {/*
        How the blur is applied is a platform concern (expo-blur / a native
        BlurView, wired in P0). What this system owns is whether the layer may
        blur at all - `liveBlur` is granted by the 3-layer budget - and which
        pre-composited fill it paints when it may not.
      */}
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            style={{
              flex: 1,
              minWidth: t.size.touchTarget,
              minHeight: t.size.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              borderRadius: t.radius.pill,
              backgroundColor: selected ? t.color.elevated : 'transparent',
            }}
          >
            {item.icon}
            <Text role="micro" tone={selected ? 'core' : 'muted'} theme={t}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The accessible name of a control is the text a user would read, so controls
 * take nodes and flatten them here. Interpolated counts (`Show the 3 sessions`)
 * therefore still produce a name a screen reader can speak.
 */
function plainText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join(' ');
  const el = node as { props?: { children?: React.ReactNode } };
  return el && el.props ? plainText(el.props.children) : '';
}

/* ---------------------------------------------------------- LinkButton ------ */

/**
 * A text-weight action ("Why this score"). The hit area is padded out and pulled
 * back, so a 60dp-wide word is still a 48dp target without shifting the line.
 */
export function LinkButton({ children, onPress, theme, testID }: ControlBase & { children: React.ReactNode }) {
  const t = withTheme(theme);
  const press = usePressableBase(t, t.size.touchTarget, onPress);
  return (
    <Pressable
      testID={testID}
      {...press}
      {...a11yTarget(plainText(children))}
      style={{
        minHeight: t.size.touchTarget,
        minWidth: t.size.touchTarget,
        justifyContent: 'center',
        paddingHorizontal: t.space(2),
      }}
    >
      <Text role="label" theme={t} style={{ fontWeight: '600' }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** "Share to public" style action — always names the tier it will expose. */
export function TierAction({
  label,
  tiers,
  onPress,
  theme,
}: {
  label: string;
  tiers: DataTier[];
  onPress?: () => void;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space(2) }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {tiers.map((tier) => (
          <TierBadge key={tier} tier={tier} ghost theme={t} />
        ))}
      </View>
      <LinkButton onPress={onPress} theme={t}>
        {label}
      </LinkButton>
    </View>
  );
}

/* ----------------------------------------------------------- TextField ----- */

export type TextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  testID?: string;
  theme?: MirrorTheme;
};

/**
 * Single-line text input with >= 48dp touch height, opaque `theme.color.card`
 * surface for >= 4.5:1 ink/placeholder contrast, and explicit TalkBack label.
 */
export function TextField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  autoCapitalize = 'characters',
  editable = true,
  testID,
  theme,
}: TextFieldProps) {
  const t = withTheme(theme);
  const type = t.type('body');
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.color.inkMuted}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      editable={editable}
      accessibilityLabel={coerceLabel(accessibilityLabel)}
      style={{
        minHeight: t.size.touchTarget,
        paddingHorizontal: t.space(3),
        paddingVertical: t.space(2),
        borderRadius: t.radius.md,
        backgroundColor: t.color.card,
        borderWidth: 1,
        borderColor: t.color.borderCard,
        color: t.color.ink,
        fontSize: type.fontSize,
        fontWeight: '600',
      }}
    />
  );
}
