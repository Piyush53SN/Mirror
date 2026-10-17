/**
 * Shared pieces for the Section J screens.
 *
 * Everything here exists because more than one screen needs it and none of them
 * should invent its own version: the empty state, a score that shows its parts,
 * and a definition block for the terms the product defines for itself.
 */
import * as React from 'react';
import { View } from '../src/host';
import type { MirrorTheme } from '../src/tokens';
import type { DataTier } from '../src/tiers';
import { Callout, Divider, Meter, Text, TierBadge } from '../src/primitives/text';
import { DegradedNotice } from '../src/patterns';
import { TabBar, Pill } from '../src/primitives/controls';
import { useLiveBlur } from '../src/theme';
import { TAB_ITEMS } from './tabs';
import type { Persona } from './personas';

export type ScreenState = 'default' | 'empty';

export type ScreenProps = {
  theme: MirrorTheme;
  persona: Persona;
  state?: ScreenState;
  /** The tab this screen belongs to; drives the floating tab bar's selected item. */
  tab?: string;
};

/**
 * The bottom chrome every tab screen shares: a spacer the scroll body can run
 * under, and the floating tab bar itself. The bar is one of the two surfaces
 * allowed to spend a live-blur pass, so it asks `useLiveBlur` and falls back to
 * its pre-composited fill when the budget is spent.
 */
export function TabFooter({ theme, active }: { theme: MirrorTheme; active: string }) {
  const liveBlur = useLiveBlur(`tabbar:${active}`, true);
  return (
    <>
      <View style={{ height: theme.size.tabBar + theme.space(6) }} />
      <TabBar
        items={TAB_ITEMS.map((t) => ({ id: t.id, label: t.label }))}
        active={active}
        onChange={() => undefined}
        liveBlur={liveBlur}
        theme={theme}
      />
    </>
  );
}

/**
 * Whether a persona can supply everything a feature needs.
 *
 * `needs` are required outright; `anyOf` is satisfied by any single tier. The
 * distinction exists because "depth" is not a tier-D feature: it needs OS session
 * data *and* at least one content-level signal, and saying otherwise would be the
 * fake-signal failure the brief forbids.
 */
export function canSupply(persona: Persona, needs: DataTier[], anyOf: DataTier[] = []): boolean {
  return needs.every((t) => persona.tiers.includes(t)) && (anyOf.length === 0 || anyOf.some((t) => persona.tiers.includes(t)));
}

/**
 * The empty state every screen uses. It always offers the same one action —
 * explaining what Mirror would need — because an empty screen that only says
 * "no data" leaves the user stuck, and one that offers a "get started" nudge
 * breaks the no-engagement rule.
 */
export function NothingYet({
  theme,
  needs,
  anyOf,
  available,
  feature,
  actionLabel = 'Explain what Mirror needs',
}: {
  theme: MirrorTheme;
  needs: DataTier[];
  anyOf?: DataTier[];
  available: DataTier[];
  feature: string;
  actionLabel?: string;
}) {
  return (
    <DegradedNotice
      theme={theme}
      needs={needs}
      anyOf={anyOf}
      available={available}
      feature={feature}
      actions={
        <Pill theme={theme} variant="quiet">
          {actionLabel}
        </Pill>
      }
    />
  );
}

export type ScorePart = { label: string; points: number; max: number; tier: DataTier; detail?: string };

/**
 * A score and its parts, in that order. The number is never allowed to appear
 * alone: the parts are what the user checks, and the caveat is what stops the
 * score from being read as a verdict. `onWhy` is rendered by the caller (the
 * Why drawer), not here, so this stays presentational.
 */
export function ScoreBlock({
  theme,
  title,
  score,
  max = 100,
  band,
  parts,
  caveat,
  action,
  columns = 1,
}: {
  theme: MirrorTheme;
  title: string;
  score: number;
  max?: number;
  band?: string;
  parts: ScorePart[];
  caveat?: string;
  action?: React.ReactNode;
  columns?: 1 | 2;
}) {
  const sum = parts.reduce((total, p) => total + p.points, 0);
  const sumMax = parts.reduce((total, p) => total + p.max, 0);
  return (
    <View style={{ gap: theme.space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text role="micro" tone="muted" theme={theme}>
            {title.toUpperCase()}
          </Text>
          <Text role="display" theme={theme}>
            {String(score)}
          </Text>
          {band ? (
            <Text role="label" tone="muted" theme={theme}>
              {band}
            </Text>
          ) : null}
        </View>
        <Text role="label" tone="muted" theme={theme}>
          {`of ${max}`}
        </Text>
      </View>
      <Divider theme={theme} />
      <View style={{ gap: theme.space(3) }}>
        {parts.map((part) => (
          <View key={part.label} style={columns === 2 ? { width: '48%' } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space(2) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2), flexShrink: 1 }}>
                <TierBadge tier={part.tier} ghost theme={theme} />
                <Text role="label" theme={theme} style={{ flexShrink: 1 }}>
                  {part.label}
                </Text>
              </View>
              <Text role="label" tone="muted" theme={theme}>
                {`${part.points}/${part.max}`}
              </Text>
            </View>
            <View style={{ marginTop: theme.space(1) }}>
              <Meter
                theme={theme}
                value={part.max === 0 ? 0 : part.points / part.max}
                label={`${part.label}: ${part.points} of ${part.max} points`}
                tone={part.points === 0 ? 'muted' : 'anchor'}
              />
            </View>
            {part.detail ? (
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                {part.detail}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <Callout theme={theme} tone="neutral">
        <Text role="label" tone="muted" theme={theme}>
          {`The parts add to ${sum} of a possible ${sumMax}. The score is reported on the same scale as the parts it is made of.`}
        </Text>
      </Callout>
      {caveat ? (
        <Callout theme={theme} tone="limit">
          <Text role="label" theme={theme}>
            {caveat}
          </Text>
        </Callout>
      ) : null}
      {action ? <View style={{ flexDirection: 'row' }}>{action}</View> : null}
    </View>
  );
}

/**
 * A term Mirror defines for itself, shown wherever the term is used. "Rabbit
 * hole", "depth" and "habit loop" are not standard units, so the definition is
 * part of the interface, not a tooltip in a help centre.
 */
export function Definition({ theme, term, children }: { theme: MirrorTheme; term: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.space(1) }}>
      <Text role="micro" tone="muted" theme={theme}>
        {`HOW MIRROR DEFINES “${term.toUpperCase()}”`}
      </Text>
      {children}
    </View>
  );
}
