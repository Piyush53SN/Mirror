/**
 * Patterns: the compositions that carry the product's rules.
 *
 * These are the components a screen author should reach for before writing
 * anything new, because each one encodes a rule that is easy to get wrong:
 * permissions are explained before they are requested; a score explains itself;
 * a limitation is stated rather than estimated; and a receipt is a receipt, not
 * a marketing page.
 */
import * as React from 'react';
import { View, ScrollView } from './host';
import { useTheme } from './theme';
import type { MirrorTheme } from './tokens';
import type { DataTier } from './tiers';
import { IMPOSSIBLE, TIERS, degrade as computeDegrade } from './tiers';
import { Pill, LinkButton, Chip } from './primitives/controls';
import { Callout, ConfidenceChip, Divider, EmptyState, ListRow, Meter, SectionHeader, Stat, Text, TierBadge } from './primitives/text';
import { Card } from './primitives/containers';

const withTheme = (theme: MirrorTheme | undefined) => theme ?? useTheme();

/* ------------------------------------------------------- PermissionPrimer ---- */

export type PermissionAsk = {
  /** Android permission string or iOS entitlement, shown verbatim. */
  systemName: string;
  /** What Mirror can see with it — in the user's words. */
  sees: string;
  /** What it cannot see. This line is not optional. */
  cannotSee: string;
  /** Where the settings screen lives, so the user can leave immediately. */
  settingsPath: string;
};

/**
 * The primer: shown *before* the OS dialog, because a system dialog cannot
 * explain itself. It names the permission, states the two halves (sees / cannot
 * see), and gives the settings path. The deny path is as prominent as allow.
 */
export function PermissionPrimer({
  ask,
  onAllow,
  onDeny,
  theme,
}: {
  ask: PermissionAsk;
  onAllow: () => void;
  onDeny: () => void;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ flex: 1, padding: t.space(4), gap: t.space(3), justifyContent: 'center' }}>
      <Text role="display" theme={t}>
        {`Usage access for Mirror`}
      </Text>
      <Card theme={t}>
        <Text role="body" theme={t}>
          {ask.systemName}
        </Text>
        <Divider theme={t} />
        <View style={{ gap: t.space(2) }}>
          <View style={{ flexDirection: 'row', gap: t.space(2), alignItems: 'flex-start' }}>
            <TierBadge tier="D" theme={t} />
            <Text role="label" theme={t} style={{ flex: 1 }}>
              {ask.sees}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: t.space(2), alignItems: 'flex-start' }}>
            <TierBadge tier="—" ghost theme={t} />
            <Text role="label" tone="muted" theme={t} style={{ flex: 1 }}>
              {ask.cannotSee}
            </Text>
          </View>
        </View>
        <Divider theme={t} />
        <Text role="micro" tone="muted" theme={t}>
          {`You can revoke this in ${ask.settingsPath} at any time; nothing is collected after that.`}
        </Text>
      </Card>
      <Pill onPress={onAllow} theme={t}>
        Open Android settings
      </Pill>
      <View style={{ alignItems: 'center' }}>
        <LinkButton onPress={onDeny} theme={t}>
          Not now
        </LinkButton>
      </View>
      <Text role="micro" tone="muted" theme={t} center>
        Mirror keeps working without it — it just has nothing to show.
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- WhySheet ---- */

export type WhyComponent = { label: string; points: number; note?: string; tier: DataTier };

/**
 * "Why is this score what it is." The components must sum to the score, exactly.
 * If they do not, the sheet says so rather than hiding the discrepancy — this is
 * the component that makes every other number in the app auditable.
 */
export function WhySheet({
  score,
  maxScore,
  components,
  caveat,
  theme,
}: {
  score: number;
  maxScore: number;
  components: WhyComponent[];
  caveat: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const sum = components.reduce((total, c) => total + c.points, 0);
  const consistent = Math.abs(sum - score) < 1e-6;
  const max = Math.max(...components.map((c) => Math.abs(c.points)), 1);

  return (
    <View style={{ gap: t.space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space(2) }}>
        <Text role="display" theme={t}>
          {String(Math.round(score))}
        </Text>
        <Text role="label" tone="muted" theme={t}>
          {`/ ${maxScore}`}
        </Text>
      </View>

      <View style={{ gap: t.space(2) }}>
        {components.map((c) => (
          <View key={c.label} style={{ gap: t.space(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space(2) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space(2), flexShrink: 1 }}>
                <TierBadge tier={c.tier} ghost theme={t} />
                <Text role="label" theme={t}>
                  {c.label}
                </Text>
              </View>
              <Text role="label" theme={t} style={{ fontWeight: '600' }}>
                {`${c.points >= 0 ? '+' : ''}${c.points.toFixed(1)}`}
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: t.radius.pill, backgroundColor: t.glass.chip.fill, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.min(100, (Math.abs(c.points) / max) * 100)}%`,
                  height: '100%',
                  borderRadius: t.radius.pill,
                  backgroundColor: c.points < 0 ? t.color.inkMuted : t.color.anchor,
                }}
              />
            </View>
            {c.note ? (
              <Text role="micro" tone="muted" theme={t}>
                {c.note}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Callout theme={t} tone={consistent ? 'neutral' : 'limit'}>
        {consistent
          ? caveat
          : `These parts do not add up to the score (${sum.toFixed(1)} vs ${score.toFixed(1)}). That is a bug, not a rounding choice — please report it.`}
      </Callout>
    </View>
  );
}

/* ------------------------------------------------------- CapabilityMatrix ---- */

/**
 * What Mirror can and cannot see, by tier. This is the screen that keeps the
 * marketing honest, and the source of every "unavailable" state elsewhere.
 */
export function CapabilityMatrix({
  available,
  rows,
  theme,
}: {
  available: DataTier[];
  /** Per-source rows: label, tier, and whether it is connected on this device. */
  rows: { label: string; tier: DataTier; connected: boolean; note: string }[];
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ gap: t.space(3) }}>
      <SectionHeader title="What Mirror can see" caption="Tier A API · B export · C extension · D OS usage" theme={t} />
      {rows.map((row) => (
        <ListRow
          key={row.label}
          leading={<TierBadge tier={row.tier} ghost={!row.connected} theme={t} />}
          title={row.label}
          meta={row.note}
          trailing={
            <Text role="label" theme={t} style={{ fontWeight: '700', color: row.connected ? t.color.ink : t.color.inkMuted }}>
              {row.connected ? 'yes' : 'no'}
            </Text>
          }
          theme={t}
        />
      ))}
      <Divider theme={t} />
      <SectionHeader title="What Mirror will not do" caption="Impossible without the techniques Mirror refuses to use" theme={t} />
      {IMPOSSIBLE.map((row) => (
        <ListRow
          key={row.label}
          leading={<TierBadge tier={row.tier} ghost theme={t} />}
          title={row.label}
          meta={row.reason}
          theme={t}
        />
      ))}
      <Callout theme={t}>
        {`Connected tiers on this device: ${available.length ? available.slice().sort().join(' + ') : 'none'}. ` +
          'Anything marked no is shown as unavailable rather than estimated.'}
      </Callout>
    </View>
  );
}

/* -------------------------------------------------------- PrivacyReceipt ---- */

export type ReceiptRow = { label: string; value: string; detail?: string };

/**
 * The privacy receipt: what left the device this month, in bytes, with every
 * category named — including the ones that would appear if a feature is enabled
 * later. A receipt with no numbers is a slogan.
 */
export function PrivacyReceipt({
  periodLabel,
  rows,
  zeroCopy,
  onExport,
  theme,
}: {
  periodLabel: string;
  rows: ReceiptRow[];
  zeroCopy: string;
  onExport?: () => void;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ gap: t.space(3) }}>
      <SectionHeader title={`Privacy receipt · ${periodLabel}`} caption="Generated from the on-device network log" theme={t} />
      <View style={{ flexDirection: 'row', gap: t.space(3) }}>
        {rows.slice(0, 2).map((row) => (
          <Card key={row.label} theme={t} style={{ flex: 1 }}>
            <Stat value={row.value} label={row.label} hint={row.detail} theme={t} />
          </Card>
        ))}
      </View>
      {rows.slice(2).map((row) => (
        <ListRow key={row.label} title={row.label} meta={row.detail} trailing={<Text role="label" theme={t}>{row.value}</Text>} theme={t} />
      ))}
      <Callout theme={t} tone="limit">
        {zeroCopy}
      </Callout>
      {onExport ? (
        <Pill variant="secondary" onPress={onExport} theme={t}>
          Export the raw log
        </Pill>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------- DegradedNotice ---- */

/**
 * Rendered wherever a feature cannot run. The message comes from `degrade()` in
 * tiers.ts, so screens cannot soften it into "coming soon" — the only additions
 * allowed are the concrete ways to fix it.
 */
export function DegradedNotice({
  needs,
  anyOf,
  available,
  feature,
  actions,
  theme,
}: {
  needs: DataTier[];
  /** When set, at least one of these tiers is also required (e.g. a content signal). */
  anyOf?: DataTier[];
  available: DataTier[];
  feature: string;
  actions?: React.ReactNode;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const result = computeDegrade(available, needs, feature, anyOf ?? []);
  if (result.ok) return null;
  return (
    <Card theme={t}>
      <EmptyState
        title={`${feature} is unavailable`}
        body={result.message}
        action={<View style={{ flexDirection: 'row', gap: t.space(2), flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</View>}
        theme={t}
      />
      {/* The badges name what is missing. For an anyOf requirement the whole set is
          shown, because "one of A/B/C" is the actual condition — showing only the
          first would misstate what the user would have to connect. */}
      <View style={{ flexDirection: 'row', gap: t.space(1), justifyContent: 'center', flexWrap: 'wrap' }}>
        {[...result.missing, ...result.missingAny].map((tier) => (
          <TierBadge key={tier} tier={tier} theme={t} />
        ))}
      </View>
      <Text role="micro" tone="muted" theme={t} center style={{ marginTop: t.space(2) }}>
        {(result.missing[0] ? TIERS[result.missing[0]] : TIERS[result.missingAny[0] as DataTier]).how}
      </Text>
    </Card>
  );
}

/* ------------------------------------------------------------ DataSource ------ */

/** The standing line under a header: which tiers this screen is standing on. */
export function DataStanding({
  tiers,
  onPress,
  theme,
}: {
  tiers: DataTier[];
  onPress?: () => void;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ paddingHorizontal: t.space(4), paddingBottom: t.space(2) }}>
      <ConfidenceChip tiers={tiers} onPress={onPress} theme={t} />
      <Text role="micro" tone="muted" theme={t} style={{ marginTop: t.space(1) }}>
        Tap to see exactly what each source can and cannot provide.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- Demo chip ---- */

/** Re-exported from containers, where it is defined (patterns already imports them). */
export { DemoChip as DemoDataChip } from './primitives/containers';

/* ------------------------------------------------------------------ Ask ------ */

/**
 * Ask: a question box that answers from local data only. It states the boundary
 * ("on this device") in the placeholder, and it refuses rather than guesses when
 * the data is not there.
 */
export function AskComposer({
  value,
  onChange,
  onSubmit,
  suggestions,
  canAnswer,
  blockedReason,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  suggestions: string[];
  canAnswer: boolean;
  blockedReason?: string;
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  return (
    <View style={{ gap: t.space(3) }}>
      <Card theme={t}>
        <Text role="label" tone="muted" theme={t}>
          Answers are computed on this device. Nothing is sent anywhere, and Mirror says so when it cannot answer.
        </Text>
        <View
          style={{
            marginTop: t.space(3),
            minHeight: t.size.touchTarget,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.color.borderCard,
            backgroundColor: t.glass.chip.fill,
            paddingHorizontal: t.space(3),
            justifyContent: 'center',
          }}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Your question: ${value || 'empty'}`}
        >
          <Text role="body" tone={value ? 'core' : 'muted'} theme={t}>
            {value || 'How much of my week was intentional?'}
          </Text>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: t.space(2), flexWrap: 'wrap' }}>
        {suggestions.map((s) => (
          <Chip key={s} label={s} onPress={() => onChange(s)} theme={t} />
        ))}
      </View>
      {canAnswer ? (
        <Pill onPress={onSubmit} theme={t}>
          Answer from this device
        </Pill>
      ) : (
        <Callout theme={t} tone="limit">
          {blockedReason ?? 'There is not enough history on this device to answer without guessing.'}
        </Callout>
      )}
    </View>
  );
}

/* ------------------------------------------------------------- Widgets ------ */

/**
 * Home-screen widget previews. A widget is the most dangerous surface in a
 * privacy-first app (it is glanceable and often on a lock screen), so the
 * private variant shows *shape* rather than content, and the public variant can
 * only be created from topics the user explicitly published.
 */
export function WidgetPreview({
  size,
  variant,
  title,
  value,
  caption,
  bars,
  theme,
}: {
  size: 'small' | 'medium';
  variant: 'private' | 'public';
  title: string;
  value: string;
  caption: string;
  bars?: number[];
  theme?: MirrorTheme;
}) {
  const t = withTheme(theme);
  const width = size === 'small' ? 158 : 330;
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${size} widget, ${variant}. ${title}: ${value}. ${caption}`}
      style={{
        width,
        height: 158,
        borderRadius: t.radius.card,
        backgroundColor: variant === 'public' ? t.color.anchor : t.color.card,
        borderWidth: 1,
        borderColor: t.color.borderCard,
        padding: t.space(4),
        justifyContent: 'space-between',
      }}
    >
      <Text role="micro" tone={variant === 'public' ? 'onAnchor' : 'muted'} theme={t}>
        {`${title} · ${variant === 'public' ? 'Public' : 'Private'}`}
      </Text>
      <Text role={size === 'small' ? 'headline' : 'display'} tone={variant === 'public' ? 'onAnchor' : 'core'} theme={t}>
        {value}
      </Text>
      {bars ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
          {bars.map((b, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: Math.max(2, b * 26),
                borderRadius: t.radius.xs,
                backgroundColor: variant === 'public' ? t.color.onAnchor : t.color.inkMuted,
                opacity: 0.7,
              }}
            />
          ))}
        </View>
      ) : null}
      <Text role="micro" tone={variant === 'public' ? 'onAnchor' : 'muted'} theme={t} numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ FactList ------- */

/** Key/value rows for settings and profile screens. */
export function FactList({ items, theme }: { items: { label: string; value: string; detail?: string }[]; theme?: MirrorTheme }) {
  const t = withTheme(theme);
  return (
    <View>
      {items.map((item, i) => (
        // The index is part of the key on purpose: a reasons list legitimately
        // repeats the label "Reason", and a label-only key would duplicate.
        <View key={`${item.label}-${i}`}>
          <ListRow title={item.label} meta={item.detail} trailing={<Text role="label" theme={t}>{item.value}</Text>} theme={t} />
          {i < items.length - 1 ? <Divider theme={t} /> : null}
        </View>
      ))}
    </View>
  );
}

export { Meter, ScrollView };
