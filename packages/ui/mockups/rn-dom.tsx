/**
 * The `react-native` → DOM binding used by the mockup renderer and the component
 * tests.
 *
 * It exists so the *same* components that ship to the phone can be rendered to
 * HTML, where a human can look at them and where tests can measure them. It is a
 * shim, not a browser: it implements the handful of RN primitives the design
 * system uses, and translates RN style objects (numbers = dp, camelCase keys)
 * into inline CSS. Anything it does not implement throws, so a component that
 * reaches for an unsupported primitive fails loudly instead of rendering wrong.
 *
 * The renderer is selected by an esbuild alias — the design system itself has no
 * idea this file exists (see src/host.ts).
 */
import * as React from 'react';

/* --------------------------------------------------------------- styles ----- */

const UNITLESS = new Set([
  'opacity',
  'flex',
  'flexGrow',
  'flexShrink',
  'zIndex',
  'fontWeight',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'aspectRatio',
  'elevation',
]);

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** RN style object → React inline style object (px-suffixed where we need it). */
export function toCss(style: unknown): React.CSSProperties {
  const flat = flatten(style);
  const out: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(flat)) {
    if (raw === undefined || raw === null) continue;
    const cssKey = kebab(key);
    if (typeof raw === 'number') {
      out[cssKey] = UNITLESS.has(key) || cssKey.startsWith('--') ? raw : `${raw}px`;
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      out[cssKey] = String(raw);
    } else {
      // transforms, shadowOffset, hitSlop and friends are not representable in
      // inline CSS; the two that matter for looks are handled explicitly.
      if (key === 'transform' && Array.isArray(raw)) {
        out.transform = (raw as Record<string, number>[])
          .map((t) => Object.entries(t).map(([fn, v]) => `${fn === 'rotate' ? 'rotate' : fn}(${typeof v === 'number' ? `${v}deg` : v})`).join(' '))
          .join(' ');
      }
      if (key === 'shadowColor' || key === 'shadowOpacity' || key === 'shadowRadius' || key === 'shadowOffset') {
        const shadow = flat as Record<string, string | number>;
        const offset = (shadow.shadowOffset as unknown as { width: number; height: number }) ?? { width: 0, height: 0 };
        out.boxShadow = `${offset.width ?? 0}px ${offset.height ?? 0}px ${shadow.shadowRadius ?? 0}px ${shadow.shadowColor ?? 'rgba(0,0,0,0.2)'}`;
      }
    }
  }
  return out as React.CSSProperties;
}

type StyleLeaf = Record<string, unknown>;

function flatten(style: unknown): StyleLeaf {
  const out: StyleLeaf = {};
  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object') {
      // Platform.select / registered styles resolve to plain objects here
      Object.assign(out, node as StyleLeaf);
    }
  };
  visit(style);
  return out;
}

/* ------------------------------------------------------------ components ---- */

type Common = Record<string, unknown> & { children?: React.ReactNode };

/** Accessibility props are camelCase in RN and kebab in ARIA; map them once. */
function ariaFrom(props: Common): Record<string, unknown> {
  const aria: Record<string, unknown> = {};
  if (props.accessibilityLabel) aria['aria-label'] = props.accessibilityLabel;
  if (props.accessibilityHint) aria['aria-description'] = props.accessibilityHint;
  if (props.accessibilityRole) aria.role = props.accessibilityRole;
  const state = props.accessibilityState as Record<string, unknown> | undefined;
  if (state) {
    if (state.selected !== undefined) aria['aria-selected'] = String(state.selected);
    if (state.disabled !== undefined) aria['aria-disabled'] = String(state.disabled);
    if (state.expanded !== undefined) aria['aria-expanded'] = String(state.expanded);
  }
  if (props.accessibilityValue) aria['aria-valuenow'] = String((props.accessibilityValue as Record<string, unknown>).now ?? '');
  if (props.accessibilityLiveRegion) aria['aria-live'] = String(props.accessibilityLiveRegion);
  if (props.accessibilityViewIsModal) aria['aria-modal'] = 'true';
  if (props.testID) aria['data-testid'] = props.testID;
  return aria;
}

const domProps = (props: Common, { skipStyle = false }: { skipStyle?: boolean } = {}) => {
  const { children: _children, style, ...rest } = props;
  delete rest.hitSlop;
  delete rest.testID;
  delete rest.accessibilityState;
  delete rest.accessibilityValue;
  const dom: Record<string, unknown> = { ...ariaFrom(props), ...rest };
  if (!skipStyle) dom.style = toCss(style);
  delete dom.accessibilityLabel;
  delete dom.accessibilityHint;
  delete dom.accessibilityRole;
  delete dom.accessibilityValue;
  delete dom.accessibilityLiveRegion;
  delete dom.accessibilityViewIsModal;
  delete dom.importantForAccessibility;
  delete dom.accessible;
  delete dom.pointerEvents;
  return dom;
};

export const View = ({ children, ...props }: Common) => {
  const interceptor = props.onStartShouldSetResponder ? true : undefined;
  return (
    <div {...(domProps({ ...props, children }, { skipStyle: false }) as React.HTMLAttributes<HTMLDivElement>)} data-view="1" data-interactive={interceptor ? '1' : undefined}>
      {children as React.ReactNode}
    </div>
  );
};

export const Text = ({ children, ...props }: Common) => (
  <span {...(domProps({ ...props, children }) as React.HTMLAttributes<HTMLSpanElement>)} data-text="1">
    {children as React.ReactNode}
  </span>
);
/** src/host.ts imports `Text as RNText`; keep both names working. */
export const RNText = Text;

export const TextInput = ({
  value,
  placeholder,
  onChangeText,
  editable = true,
  ...props
}: Common & {
  value?: string;
  placeholder?: string;
  onChangeText?: (text: string) => void;
  editable?: boolean;
}) => {
  const clean = { ...props };
  delete clean.placeholderTextColor;
  delete clean.autoCapitalize;
  delete clean.autoCorrect;
  delete clean.returnKeyType;
  const dom = domProps(clean);
  return (
    <input
      type="text"
      data-input="1"
      value={typeof value === 'string' ? value : ''}
      placeholder={typeof placeholder === 'string' ? placeholder : undefined}
      disabled={editable === false ? true : undefined}
      onChange={(e) => onChangeText?.(e.currentTarget?.value ?? (e.target as HTMLInputElement | undefined)?.value ?? '')}
      {...(dom as React.InputHTMLAttributes<HTMLInputElement>)}
    />
  );
};

/**
 * Pressable renders a real <button> with data-tap, which is how every downstream
 * measurement (the 48dp gate, accessible-name checks) finds tap targets.
 */
export const Pressable = ({ children, ...props }: Common) => {
  const { style } = props;
  const resolved = typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  const { children: _c, ...rest } = props;
  const dom = domProps({ ...rest, style: resolved });
  const disabled = Boolean(props.disabled);
  return (
    <button type="button" data-tap="1" disabled={disabled || undefined} {...(dom as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {typeof children === 'function' ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false }) : (children as React.ReactNode)}
    </button>
  );
};

export const ScrollView = ({ children, contentContainerStyle, ...props }: Common & { contentContainerStyle?: unknown }) => (
  <div {...(domProps(props) as React.HTMLAttributes<HTMLDivElement>)} data-scroll="1">
    <div style={toCss(contentContainerStyle)}>{children as React.ReactNode}</div>
  </div>
);

export const ActivityIndicator = () => <span data-spinner="1">…</span>;
export const StatusBar = Object.assign((_props: Common) => null, { currentHeight: 28 });
export const Image = ({ source, ...props }: Common) => (
  <span {...(domProps(props) as React.HTMLAttributes<HTMLSpanElement>)} data-image={JSON.stringify(source)} />
);

export const Platform = {
  OS: 'android' as const,
  select: <T,>(spec: { android?: T; ios?: T; default?: T }): T | undefined => spec.android ?? spec.default,
  Version: 34,
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: flatten,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hairlineWidth: 1,
};

export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: (_event: string, _handler: () => void) => ({ remove: () => undefined }),
};

export const AppState = {
  currentState: 'active' as const,
  addEventListener: (_event: string, _handler: (state: string) => void) => ({ remove: () => undefined }),
};

/** Reduce-motion is driven by the renderer, not the OS, in mockups and tests. */
export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_event: string, _handler: (value: boolean) => void) => ({ remove: () => undefined }),
};

export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type StyleProp<T> = T | T[] | null | undefined | false;
export type TextInputProps = Record<string, unknown>;
