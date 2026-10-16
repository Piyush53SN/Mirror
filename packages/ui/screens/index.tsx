/**
 * Section J — the screen inventory, as components.
 *
 * One file, because a screen's job here is to *compose* the design system and
 * declare what it needs; anything longer than that belongs in a primitive or a
 * pattern. Every screen states:
 *   - which data tiers it needs (`SCREENS[].requires`),
 *   - what it looks like with no data at all (`states: ['empty']`),
 *   - and which product rule it is carrying.
 *
 * The mockup renderer (packages/ui/mockups/render.mjs) renders every screen in
 * every persona × theme × state, and tests measure the result. Nothing here is a
 * picture of a screen: it is the screen.
 */
import * as React from 'react';
import { View } from '../src/host.js';
import type { MirrorTheme } from '../src/tokens.js';
import type { DataTier } from '../src/tiers.js';
import { duration, hedged, tierSummary } from '../src/format.js';
import { isOn, initialFlags } from '../src/flags.js';
import { BoundaryToggle, Chip, IconButton, LinkButton, Pill, SegmentedControl, TabBar } from '../src/primitives/controls.js';
import { Callout, ConfidenceChip, Divider, EmptyState, ListRow, Meter, SectionHeader, Stat, Text, TierBadge } from '../src/primitives/text.js';
import { Card, HeroCarousel, Screen, Sparkline, Toolbar, Sheet, Ring } from '../src/primitives/containers.js';
import {
  AskComposer,
  CapabilityMatrix,
  DataStanding,
  DegradedNotice,
  FactList,
  PermissionPrimer,
  PrivacyReceipt,
  WidgetPreview,
  WhySheet,
} from '../src/patterns.js';

/* ------------------------------------------------------------------ data ---- */

export type Persona = {
  id: string;
  name: string;
  blurb: string;
  tiers: DataTier[];
  connected: { label: string; tier: DataTier; connected: boolean; note: string }[];
  weeklyMinutes: number[];
  intentionalShare: number;
  topics: { name: string; depth: number; hours: number; trend: number; tier: string; firstSeen: string }[];
  sessions: { app: string; topic: string; minutes: number; kind: 'deep' | 'habit'; intent: 'Intentional' | 'Mindless' }[];
  budgets: { label: string; target: number; actual: number; unit: string }[];
  traits: { label: string; value: string; evidence: string }[];
  askable: string[];
};

const baseConnected = [
  { label: 'Per-app foreground time, launches, timestamps', tier: 'D' as DataTier, connected: true, note: 'Android Usage access. Automatic after one grant.' },
  { label: 'App category', tier: 'D' as DataTier, connected: true, note: 'Coarse label from the operating system.' },
  { label: 'Watch completion, searches, scroll depth', tier: 'C' as DataTier, connected: false, note: 'Desktop browser extension, allow-listed sites only.' },
  { label: 'Watch history, search history', tier: 'A' as DataTier, connected: false, note: 'The YouTube Data API has no watch-history endpoint. Use your Takeout export.' },
  { label: 'Saved items, subscriptions, communities', tier: 'A' as DataTier, connected: false, note: 'Reddit and Twitch OAuth, narrowest scopes.' },
  { label: 'Instagram and Amazon history', tier: 'B' as DataTier, connected: false, note: 'No consumer history API. Import your own export.' },
];

export const PERSONAS: Persona[] = [
  {
    id: 'ananya',
    name: 'Ananya',
    blurb: 'Student, tier D only — the baseline case: usage data and nothing else.',
    tiers: ['D'],
    connected: baseConnected.map((c) => (c.tier === 'D' ? { ...c, connected: true } : c)),
    weeklyMinutes: [96, 118, 104, 132, 121, 88, 76],
    intentionalShare: 0.46,
    topics: [],
    sessions: [
      { app: 'YouTube', topic: '—', minutes: 42, kind: 'habit', intent: 'Mindless' },
      { app: 'Instagram', topic: '—', minutes: 27, kind: 'habit', intent: 'Mindless' },
      { app: 'WhatsApp', topic: '—', minutes: 19, kind: 'deep', intent: 'Intentional' },
      { app: 'Chrome', topic: '—', minutes: 12, kind: 'deep', intent: 'Intentional' },
    ],
    budgets: [
      { label: 'Short video', target: 60, actual: 96, unit: 'min/day' },
      { label: 'Social feed', target: 45, actual: 38, unit: 'min/day' },
    ],
    traits: [
      { label: 'Evening-heavy use', value: '64% after 8 pm', evidence: 'Foreground time by hour, tier D, 14 days.' },
      { label: 'Frequent switching', value: '38 app switches/hour', evidence: 'Launch timestamps, tier D.' },
    ],
    askable: ['How much of my week was intentional?', 'When do I switch apps most?'],
  },
  {
    id: 'rehan',
    name: 'Rehan',
    blurb: 'Creator, tiers D + B + C — usage plus an imported export and the browser extension.',
    tiers: ['D', 'C', 'B'],
    connected: baseConnected.map((c) => (c.tier === 'D' || c.tier === 'C' || c.tier === 'B' ? { ...c, connected: true } : c)),
    weeklyMinutes: [112, 96, 128, 141, 118, 104, 92],
    intentionalShare: 0.61,
    topics: [
      { name: 'Film photography', depth: 78, hours: 4.2, trend: 14, tier: 'B+C', firstSeen: '6 weeks ago' },
      { name: 'Rust programming', depth: 64, hours: 2.6, trend: 8, tier: 'C', firstSeen: '3 weeks ago' },
      { name: 'Urban gardening', depth: 41, hours: 1.1, trend: -6, tier: 'B', firstSeen: '11 weeks ago' },
    ],
    sessions: [
      { app: 'YouTube', topic: 'Film photography', minutes: 46, kind: 'deep', intent: 'Intentional' },
      { app: 'Reddit', topic: 'Rust programming', minutes: 24, kind: 'deep', intent: 'Intentional' },
      { app: 'YouTube', topic: 'Shorts', minutes: 38, kind: 'habit', intent: 'Mindless' },
      { app: 'Instagram', topic: '—', minutes: 22, kind: 'habit', intent: 'Mindless' },
    ],
    budgets: [
      { label: 'Short video', target: 30, actual: 38, unit: 'min/day' },
      { label: 'Social feed', target: 30, actual: 22, unit: 'min/day' },
      { label: 'Deep reading', target: 45, actual: 51, unit: 'min/day' },
    ],
    traits: [
      { label: 'Deliberate starter', value: '3 of 4 topics began from a search', evidence: 'First-seen events, tier C search terms and tier B history.' },
      { label: 'Shallow tail', value: '22% of short-video sessions end under 8s', evidence: 'Session length distribution, tier C.' },
    ],
    askable: ['Which topic grew the most this month?', 'How deep was my film photography reading?'],
  },
  {
    id: 'mei',
    name: 'Mei',
    blurb: 'Researcher, all four tiers — the fullest picture Mirror can honestly build.',
    tiers: ['D', 'C', 'B', 'A'],
    connected: baseConnected.map((c) => ({ ...c, connected: true })),
    weeklyMinutes: [88, 92, 76, 104, 96, 71, 64],
    intentionalShare: 0.72,
    topics: [
      { name: 'Astronomy', depth: 81, hours: 5.1, trend: 9, tier: 'A+C', firstSeen: '9 weeks ago' },
      { name: 'Urban gardening', depth: 66, hours: 3.4, trend: 3, tier: 'B', firstSeen: '14 weeks ago' },
      { name: 'Rust programming', depth: 58, hours: 2.2, trend: -4, tier: 'C', firstSeen: '5 weeks ago' },
      { name: 'Film photography', depth: 37, hours: 0.8, trend: 12, tier: 'B', firstSeen: '2 weeks ago' },
    ],
    sessions: [
      { app: 'Chrome', topic: 'Astronomy', minutes: 52, kind: 'deep', intent: 'Intentional' },
      { app: 'Twitch', topic: 'Astronomy live', minutes: 61, kind: 'deep', intent: 'Intentional' },
      { app: 'Reddit', topic: 'Urban gardening', minutes: 18, kind: 'deep', intent: 'Intentional' },
      { app: 'Instagram', topic: 'Film photography', minutes: 27, kind: 'habit', intent: 'Mindless' },
    ],
    budgets: [
      { label: 'Short video', target: 20, actual: 12, unit: 'min/day' },
      { label: 'Social feed', target: 25, actual: 27, unit: 'min/day' },
      { label: 'Deep reading', target: 60, actual: 74, unit: 'min/day' },
    ],
    traits: [
      { label: 'Long-form preference', value: 'Average session 24 minutes', evidence: 'Session lengths across tiers A/B/C/D.' },
      { label: 'Low late-night use', value: '8% after 11 pm', evidence: 'Timestamps, tier D.' },
    ],
    askable: ['What did I learn about this month?', 'Which sources did I actually open?'],
  },
];

export type ScreenState = 'default' | 'empty';

export type ScreenProps = {
  theme: MirrorTheme;
  persona: Persona;
  state?: ScreenState;
};

const HERO = (p: Persona) => [
  {
    id: 'week',
    kicker: 'This week',
    title: `${duration(p.weeklyMinutes.reduce((a, b) => a + b, 0))} on screen`,
    body: `${Math.round(p.intentionalShare * 100)}% of it was deliberate, by your own labels and session length.`,
    stat: { value: duration(p.weeklyMinutes[6] ?? 0).replace(/\D+$/, ''), unit: duration(p.weeklyMinutes[6] ?? 0).replace(/^[\d]+/, ''), label: 'today' },
  },
  {
    id: 'shift',
    kicker: 'Shift',
    title: 'Evenings are getting lighter',
    body: 'After-8pm use is down 18% against your four-week median. No nudge was sent to make that happen.',
  },
  {
    id: 'habit',
    kicker: 'Habit',
    title: 'Short video is your largest habit block',
    body: '38% of habit minutes fall after 11pm. Neutral observation, no streak, no reminder unless you ask for one.',
  },
];

/**
 * The empty state every screen uses. It always offers the same one action —
 * explaining what Mirror would need — because an empty screen that only says
 * "no data" leaves the user stuck, and one that offers a "get started" nudge
 * breaks the no-engagement rule.
 */
function NothingYet({
  theme,
  needs,
  available,
  feature,
  actionLabel = 'Explain what Mirror needs',
}: {
  theme: MirrorTheme;
  needs: DataTier[];
  available: DataTier[];
  feature: string;
  actionLabel?: string;
}) {
  return (
    <DegradedNotice
      theme={theme}
      needs={needs}
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

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'insights', label: 'Insights' },
  { id: 'journey', label: 'Journey' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'you', label: 'You' },
];

/* ------------------------------------------------------------------ J1 ------ */

/** J1 · Onboarding — the three promises, then the choice to skip. */
export function OnboardingScreen({ theme }: ScreenProps) {
  const promises = [
    { title: 'Your history stays on this phone', body: 'Titles, searches and timestamps are stored and analysed locally, encrypted.' },
    { title: 'Two profiles, never merged', body: 'Private holds everything. Public holds only the topics you pick, one by one. Nothing is copied across.' },
    { title: 'No streaks, no guilt, no dark patterns', body: 'Mirror exists to reduce mindless use. It will not nudge you to come back.' },
  ];
  return (
    <Screen title="Onboarding" theme={theme} padded>
      <View style={{ paddingTop: theme.space(6), gap: theme.space(4) }}>
        <Text role="micro" tone="muted" theme={theme}>
          MIRROR
        </Text>
        <Text role="display" theme={theme}>
          {`See how you actually use your phone`}
        </Text>
        <Text role="body" tone="muted" theme={theme}>
          {`Mirror shows the quality of your attention, not just the hours. It runs on this device and never asks you to log anything by hand.`}
        </Text>
        {promises.map((p) => (
          <Card key={p.title} theme={theme}>
            <Text role="title" theme={theme}>
              {p.title}
            </Text>
            <Text role="label" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
              {p.body}
            </Text>
          </Card>
        ))}
        <Pill theme={theme}>Continue</Pill>
        <View style={{ alignItems: 'center' }}>
          <LinkButton theme={theme}>Explore with demo data</LinkButton>
        </View>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J2 ------ */

/** J2 · Permission primer — explains before the OS asks, and the "not now" path. */
export function PermissionPrimerScreen({ theme }: ScreenProps) {
  return (
    <Screen title="Permission primer" theme={theme} padded>
      <PermissionPrimer
        theme={theme}
        ask={{
          systemName: 'Usage access · Settings → Apps → Special access → Usage access → Mirror',
          sees: 'How long you use each app and when you open them — foreground time, launches, timestamps.',
          cannotSee: 'What is inside those apps. No content, no messages, no notifications. Mirror never reads them.',
          settingsPath: 'Android settings → Special access → Usage access',
        }}
        onAllow={() => undefined}
        onDeny={() => undefined}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ J3 ------ */

/** J3 · Home — the reference layout: hero, week strip, habits, budget. */
export function HomeScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const [hero, setHero] = React.useState(0);
  const empty = state === 'empty';
  const slides = HERO(persona);
  return (
    <Screen
      title="Home"
      theme={theme}
      padded={false}
      header={
        <Toolbar
          theme={theme}
          title={`Good evening, ${persona.name}`}
          subtitle={empty ? 'Nothing collected yet' : `Week of ${tierSummary(persona.tiers)} data`}
          actions={
            <>
              <IconButton label="Search your own data" theme={theme}>
                <Text role="label" theme={theme}>⌕</Text>
              </IconButton>
              <IconButton label="Profile and settings" theme={theme} badge>
                <Text role="label" theme={theme}>{persona.name.slice(0, 1)}</Text>
              </IconButton>
            </>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ paddingHorizontal: theme.space(4), gap: theme.space(3) }}>
        <BoundaryToggle
          theme={theme}
          value="private"
          onChange={() => undefined}
          consequence="Private. Only your selections are ever shared — nothing else leaves this phone."
        />
        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
          <Chip label="Range" value="This week" theme={theme} />
          <Chip label="App" value="All" theme={theme} />
          <Chip label="Topic" value={persona.topics[0]?.name ?? 'All'} theme={theme} />
        </View>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {empty ? (
          <Card theme={theme}>
            <EmptyState
              title="No usage data yet"
              body="Mirror has nothing to show until Android usage access is granted. It will not fill the gap with estimates."
              action={<Pill theme={theme}>Explain what it can see</Pill>}
              theme={theme}
            />
          </Card>
        ) : (
          <>
            <HeroCarousel theme={theme} slides={slides} index={hero} onIndexChange={setHero} />
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Last 7 days" caption={hedged(duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0)), 'D', 'duration')} />
              <Sparkline theme={theme} values={persona.weeklyMinutes} label={`Daily screen time for 7 days, ${persona.weeklyMinutes.join(', ')} minutes`} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.space(2) }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <Text key={d} role="micro" tone="muted" theme={theme}>
                    {d}
                  </Text>
                ))}
              </View>
            </Card>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Attention budget" caption="soft limits, no streaks" />
              {persona.budgets.map((b) => (
                <View key={b.label} style={{ marginBottom: theme.space(3) }}>
                  <Meter
                    theme={theme}
                    value={b.target / Math.max(b.actual, b.target)}
                    label={b.label}
                    caption={`${b.actual} / ${b.target} ${b.unit}`}
                    tone={b.actual > b.target ? 'muted' : 'anchor'}
                  />
                </View>
              ))}
              <LinkButton theme={theme}>Adjust a budget</LinkButton>
            </Card>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Learning arcs" caption="topics you are going deeper on" />
              {persona.topics.length === 0 ? (
                <NothingYet theme={theme} needs={['A', 'B', 'C']} available={persona.tiers} feature="Topic arcs" actionLabel="Import an export" />
              ) : (
                persona.topics.slice(0, 3).map((topic) => (
                  <ListRow
                    key={topic.name}
                    theme={theme}
                    leading={<TierBadge tier={(topic.tier[0] as DataTier) ?? 'D'} ghost theme={theme} />}
                    title={topic.name}
                    meta={`${topic.hours}h · first seen ${topic.firstSeen}`}
                    trailing={
                      <Text role="label" theme={theme} style={{ fontWeight: '600' }}>
                        {`${topic.depth}`}
                      </Text>
                    }
                  />
                ))
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J4 ------ */

/** J4 · Insights — patterns, with the "why" sheet one tap away. */
export function InsightsScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Screen
      title="Insights"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Insights" subtitle="Descriptive, never diagnostic" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
      overlay={
        <Sheet theme={theme} open={open} title="Why this depth score" subtitle="Every component, with its source tier" onClose={() => setOpen(false)}>
          <WhySheet
            theme={theme}
            score={78}
            maxScore={100}
            caveat="Depth is an estimate built from session length, completion and return visits. It describes behaviour, not understanding."
            components={[
              { label: 'Median session length', points: 26.4, tier: 'D', note: 'Foreground time per session, 14-day median.' },
              { label: 'Completion rate', points: 22.1, tier: 'C', note: 'Watch completion from the browser extension.' },
              { label: 'Return visits', points: 18.7, tier: 'B', note: 'Imported history: distinct days.' },
              { label: 'Cross-source corroboration', points: 10.8, tier: 'A', note: 'Same topic seen in an official API and in usage.' },
            ]}
          />
        </Sheet>
      }
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Quality of attention" caption="this week" />
          <View style={{ flexDirection: 'row', gap: theme.space(4), alignItems: 'center' }}>
            <Ring theme={theme} value={persona.intentionalShare} caption="intentional" />
            <View style={{ flex: 1, gap: theme.space(2) }}>
              <Stat theme={theme} value={`${Math.round(persona.intentionalShare * 100)}%`} label="Deliberate sessions" hint={hedged('from session length and your labels', 'D')} />
              <Text role="label" tone="muted" theme={theme}>
                {`${duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))} total, ${persona.sessions.filter((s) => s.kind === 'habit').reduce((a, s) => a + s.minutes, 0)}m in habit loops.`}
              </Text>
            </View>
          </View>
        </Card>
        {state === 'empty' ? (
          <NothingYet theme={theme} needs={['D']} available={[]} feature="Insights" />
        ) : (
          <>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Patterns" caption="stated, then evidenced" />
              {persona.traits.map((trait) => (
                <View key={trait.label} style={{ marginBottom: theme.space(3) }}>
                  <Text role="title" theme={theme}>
                    {trait.label}
                  </Text>
                  <Text role="label" theme={theme}>
                    {trait.value}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {trait.evidence}
                  </Text>
                </View>
              ))}
            </Card>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Deepest topic" caption={persona.topics[0]?.name ?? 'needs topic data'} />
              {persona.topics.length ? (
                <>
                  <Stat theme={theme} value={String(persona.topics[0]?.depth)} label="depth score" hint="0–100, descriptive estimate" />
                  <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3) }}>
                    <LinkButton theme={theme} onPress={() => setOpen(true)}>
                      Why this score
                    </LinkButton>
                    <LinkButton theme={theme}>Label a session</LinkButton>
                  </View>
                </>
              ) : (
                <NothingYet theme={theme} needs={['A', 'B', 'C']} available={persona.tiers} feature="Depth scoring" actionLabel="Import an export" />
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J5 ------ */

/** J5 · Journey — how interests appeared, grew and faded. */
export function JourneyScreen({ theme, persona }: ScreenProps) {
  return (
    <Screen
      title="Journey"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Journey"
          subtitle="Where your curiosity went"
          actions={
            <IconButton label="Journey options: range and sources" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {persona.topics.length === 0 ? (
          <DegradedNotice
            theme={theme}
            needs={['A', 'B', 'C']}
            available={persona.tiers}
            feature="Interest evolution"
            actions={<Pill theme={theme} variant="quiet">Import an export</Pill>}
          />
        ) : (
          <Card theme={theme}>
            <SectionHeader theme={theme} title="Interest evolution" caption="first seen, then depth over time" />
            {persona.topics.map((topic) => (
              <View key={topic.name} style={{ marginBottom: theme.space(4) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text role="title" theme={theme}>
                    {topic.name}
                  </Text>
                  <Text role="label" tone="muted" theme={theme}>
                    {`${topic.trend > 0 ? '+' : ''}${topic.trend}%`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginTop: theme.space(2), height: 32, alignItems: 'flex-end' }}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        height: Math.max(3, ((topic.depth / 100) * (i / 11)) * 32 + (i > 8 ? topic.depth / 6 : 0)),
                        borderRadius: theme.radius.xs,
                        backgroundColor: i > 8 ? theme.color.anchor : theme.color.inkMuted,
                        opacity: i > 8 ? 1 : 0.5,
                      }}
                    />
                  ))}
                </View>
                <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                  {`first seen ${topic.firstSeen} · ${tierSummary(topic.tier.split('+') as DataTier[])} · ${topic.hours}h this month`}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: theme.space(2) }}>
                  <LinkButton theme={theme}>Open the sessions behind this</LinkButton>
                </View>
              </View>
            ))}
          </Card>
        )}
        <Card theme={theme}>
          <SectionHeader theme={theme} title="What changed this month" />
          <FactList
            theme={theme}
            items={[
              { label: 'New topics', value: String(persona.topics.length ? 1 : 0), detail: 'First seen in the last 30 days.' },
              { label: 'Faded topics', value: String(persona.topics.filter((t) => t.trend < 0).length), detail: 'No session in 21 days.' },
              { label: 'Sources behind this', value: tierSummary(persona.tiers) },
            ]}
          />
        </Card>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J6 ------ */

/** J6 · Sessions — the raw material, labelled by the user. */
export function SessionsScreen({ theme, persona, state = 'default' }: ScreenProps) {
  return (
    <Screen
      title="Sessions"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Sessions" subtitle="Longest first. Labels train the local model." />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {state === 'empty' ? (
          <NothingYet theme={theme} needs={['D']} available={[]} feature="Sessions" actionLabel="Grant usage access" />
        ) : null}
        <Card theme={theme} style={state === 'empty' ? { display: 'none' } : undefined}>
          {persona.sessions.map((s, i) => (
            <View key={`${s.app}-${i}`}>
              <ListRow
                theme={theme}
                leading={<TierBadge tier={s.topic === '—' ? 'D' : 'C'} ghost theme={theme} />}
                title={`${s.app} · ${duration(s.minutes)}`}
                meta={`${s.topic} · ${s.kind === 'deep' ? 'deep session' : 'habit loop'}`}
                trailing={
                  <View style={{ flexDirection: 'row', gap: theme.space(2), alignItems: 'center' }}>
                    <Text role="micro" tone="muted" theme={theme}>
                      {s.intent}
                    </Text>
                    <LinkButton theme={theme}>Change</LinkButton>
                  </View>
                }
              />
              {i < persona.sessions.length - 1 ? <Divider theme={theme} /> : null}
            </View>
          ))}
        </Card>
        <Callout theme={theme} tone="limit">
          {persona.tiers.includes('C')
            ? 'Session labels stay on this device and are used to score your own sessions, never to train anything shared.'
            : 'Without the browser extension Mirror cannot see what a session was about — only that it happened, and for how long.'}
        </Callout>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J7 ------ */

/** J7 · Discovery — rabbit-hole detection, stated without drama. */
export function DiscoveryScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const rabbit = persona.sessions.filter((s) => s.kind === 'habit');
  const minutes = rabbit.reduce((a, s) => a + s.minutes, 0);
  return (
    <Screen
      title="Discovery"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Discovery"
          subtitle="Exploration vs. exploitation"
          actions={
            <IconButton label="Discovery options: what counts as a rabbit hole" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {state === 'empty' ? <NothingYet theme={theme} needs={['D']} available={[]} feature="Rabbit-hole detection" actionLabel="Grant usage access" /> : null}
        <Card theme={theme} style={state === 'empty' ? { display: 'none' } : undefined}>
          <SectionHeader theme={theme} title="Rabbit holes" caption="definition shown, not implied" />
          <Text role="label" tone="muted" theme={theme}>
            A rabbit hole here is three or more consecutive short sessions on the same app with no search, no save and no
            cross-app follow-up.
          </Text>
          <Divider theme={theme} />
          {rabbit.length === 0 ? (
            <EmptyState theme={theme} title="No rabbit holes this week" body="Nothing met the definition. That is a real result, not a missing signal." />
          ) : (
            <>
              <Stat theme={theme} value={duration(minutes)} label="in habit loops this week" hint={`${rabbit.length} sessions met the definition`} />
              <View style={{ flexDirection: 'row', marginTop: theme.space(3) }}>
                <LinkButton theme={theme}>Show the {rabbit.length} sessions</LinkButton>
              </View>
            </>
          )}
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Exploration this week" />
          <FactList
            theme={theme}
            items={[
              { label: 'New topics opened', value: persona.tiers.includes('A') || persona.tiers.includes('B') ? '4' : 'unavailable', detail: 'Needs topic-level data (A/B/C).' },
              { label: 'Searches started', value: persona.tiers.includes('C') ? '11' : 'unavailable', detail: 'From the browser extension on allow-listed sites.' },
              { label: 'Top app by time', value: persona.sessions[0]?.app ?? '—', detail: 'Tier D foreground time.' },
            ]}
          />
        </Card>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J8 ------ */

/** J8 · What-if — counterfactuals computed locally, with their assumptions shown. */
export function WhatIfScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const baseline = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  const scenarios = [
    { label: 'Remove short video', delta: -0.18, note: 'Assumes the minutes are not replaced by another app — they usually are, partially.' },
    { label: 'Cap feed sessions at 10 min', delta: -0.11, note: 'Applied to sessions longer than the cap, using your own distribution.' },
    { label: 'Enable quiet hours 22:00–07:00', delta: -0.07, note: 'Counts only usage inside the window.' },
  ];
  return (
    <Screen
      title="What if"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="What if"
          subtitle="Computed on this device from your own history"
          actions={
            <IconButton label="What-if options: change the scenarios" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {state === 'empty' ? <NothingYet theme={theme} needs={['D']} available={[]} feature="What-if scenarios" actionLabel="Grant usage access" /> : null}
        <Card theme={theme} style={state === 'empty' ? { display: 'none' } : undefined}>
          <SectionHeader theme={theme} title={`Baseline: ${duration(baseline)}`} caption="last 7 days" />
          {scenarios.map((s) => (
            <View key={s.label} style={{ marginBottom: theme.space(3) }}>
              <Meter theme={theme} value={1 + s.delta} label={s.label} caption={`${Math.round(s.delta * 100)}%`} />
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                {s.note}
              </Text>
              <LinkButton theme={theme}>Change this scenario</LinkButton>
            </View>
          ))}
        </Card>
        <Callout theme={theme} tone="limit">
          What-if is a calculation over your history, not a prediction. Mirror does not forecast behaviour and does not turn
          these into goals on your behalf.
        </Callout>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J9 ------ */

/** J9 · Focus — windows you choose; Mirror never blocks anything silently. */
export function FocusScreen({ theme }: ScreenProps) {
  return (
    <Screen
      title="Focus"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Focus windows" subtitle="You choose; Mirror only reminds you of your own choice" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Scheduled" caption="local notifications only" />
          <FactList
            theme={theme}
            items={[
              { label: 'Weekday deep work', value: '09:00–11:30', detail: 'Announces at the start; never counts down, never nags.' },
              { label: 'Quiet hours', value: '22:30–07:00', detail: 'Notifications are suppressed; collection continues locally.' },
            ]}
          />
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="How it behaves" />
          <Text role="label" tone="muted" theme={theme}>
            A focus window does not block apps and does not shame you when you leave it. It shows one line when you return
            and nothing else. You can delete the window in one tap.
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3) }}>
            <Pill theme={theme} variant="secondary">
              Add a window
            </Pill>
            <Pill theme={theme} variant="quiet">
              Remove all
            </Pill>
          </View>
        </Card>
        <Callout theme={theme}>
          Focus windows are tier D only: they need nothing but timestamps, and work with no network and no account.
        </Callout>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J10 ----- */

/** J10 · Behaviour profile — descriptive traits with their evidence attached. */
export function ProfileScreen({ theme, persona, state = 'default' }: ScreenProps) {
  return (
    <Screen
      title="Behaviour profile"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Behaviour profile"
          subtitle="Descriptions of what you did, never diagnoses"
          actions={
            <IconButton label="Profile options: recompute and export" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {state === 'empty' ? <NothingYet theme={theme} needs={['D']} available={[]} feature="Behaviour profile" actionLabel="Grant usage access" /> : null}
        <Card theme={theme} style={state === 'empty' ? { display: 'none' } : undefined}>
          <SectionHeader theme={theme} title="Traits" caption="each with the evidence it came from" />
          {persona.traits.map((trait) => (
            <View key={trait.label} style={{ marginBottom: theme.space(4) }}>
              <Text role="title" theme={theme}>
                {trait.label}
              </Text>
              <Text role="body" theme={theme}>
                {trait.value}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {trait.evidence}
              </Text>
              <View style={{ flexDirection: 'row' }}>
                <LinkButton theme={theme}>Show the raw events</LinkButton>
              </View>
            </View>
          ))}
        </Card>
        <Callout theme={theme} tone="limit">
          These are estimates from behaviour, not a personality test and not a clinical instrument. Mirror will not label you
          as anything you cannot see the evidence for.
        </Callout>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J11 ----- */

/** J11 · Weekly report — a local document, shareable only as an image you approve. */
export function WeeklyReportScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const total = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  return (
    <Screen
      title="Weekly report"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Weekly report"
          subtitle="Built on this device, printed on request"
          actions={
            <IconButton label="Report options: week and sections" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        {state === 'empty' ? <NothingYet theme={theme} needs={['D']} available={[]} feature="Weekly report" actionLabel="Grant usage access" /> : null}
        <Card theme={theme} elevated style={state === 'empty' ? { display: 'none' } : undefined}>
          <Text role="micro" tone="muted" theme={theme}>
            WEEK 42
          </Text>
          <Text role="headline" theme={theme} style={{ marginTop: theme.space(1) }}>
            {`${duration(total)} on screen`}
          </Text>
          <Text role="label" theme={theme} style={{ marginTop: theme.space(2) }}>
            {`${Math.round(persona.intentionalShare * 100)}% deliberate · ${persona.topics.length} topics tracked · ${persona.budgets.filter((b) => b.actual <= b.target).length}/${persona.budgets.length} budgets inside`}
          </Text>
          <Divider theme={theme} />
          <Sparkline theme={theme} values={persona.weeklyMinutes} label="Daily totals for the reported week" />
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Sections" caption="what is included, and what is not" />
          <FactList
            theme={theme}
            items={[
              { label: 'Attention quality', value: `${Math.round(persona.intentionalShare * 100)}%`, detail: 'Session lengths + your labels.' },
              { label: 'Topic movement', value: persona.topics.length ? `${persona.topics.length} topics` : 'unavailable', detail: 'Needs A/B/C data.' },
              { label: 'Anything shared', value: '0 B', detail: 'The report never leaves the device unless you export the image yourself.' },
            ]}
          />
        </Card>
        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
          <Pill theme={theme} variant="secondary">
            Render share image
          </Pill>
          <Pill theme={theme} variant="quiet">
            Export PDF
          </Pill>
        </View>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J12 ----- */

/** J12 · Budgets — soft limits you set, shown as plain numbers. */
export function BudgetScreen({ theme, persona, state = 'default' }: ScreenProps) {
  return (
    <Screen
      title="Attention budget"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Attention budget"
          subtitle="Soft limits, never red, never a streak"
          actions={
            <IconButton label="Budget options: units and reset" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        {state === 'empty' || persona.budgets.length === 0 ? (
          <Card theme={theme}>
            <EmptyState
              theme={theme}
              title="No budgets yet"
              body="A budget is a number you choose. Mirror will not suggest one, because a suggestion is a nudge."
              action={<Pill theme={theme}>Set a budget</Pill>}
            />
          </Card>
        ) : (
          persona.budgets.map((b) => {
            const over = b.actual > b.target;
            return (
              <Card key={b.label} theme={theme}>
                <SectionHeader theme={theme} title={b.label} caption={`${b.target} ${b.unit} target`} />
                <Stat theme={theme} value={String(b.actual)} unit={b.unit.split('/')[0]} label="last 7 days average" hint={over ? `Over by ${b.actual - b.target} — shown as a number, not a warning` : 'Inside the budget'} />
                <View style={{ marginTop: theme.space(3) }}>
                  <Meter theme={theme} value={Math.min(1, b.actual / (b.target * 1.5))} label="usage against target" caption={`${Math.round((b.actual / b.target) * 100)}%`} tone={over ? 'muted' : 'anchor'} />
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <LinkButton theme={theme}>Adjust this budget</LinkButton>
                </View>
              </Card>
            );
          })
        )}
        <Callout theme={theme}>
          Budgets are stored on this device and are never sent anywhere, not even as an aggregate.
        </Callout>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J13 ----- */

/** J13 · Ask — questions answered from local data, or refused. */
export function AskScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const [value, setValue] = React.useState('');
  const hasHistory = persona.weeklyMinutes.length === 7;
  return (
    <Screen
      title="Ask"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Ask Mirror" subtitle="On-device answers over your own data" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <AskComposer
          theme={theme}
          value={value}
          onChange={setValue}
          onSubmit={() => undefined}
          suggestions={persona.askable}
          canAnswer={hasHistory && state === 'default'}
          blockedReason="Ask needs at least a week of on-device history before it can answer without guessing."
        />
        {state === 'default' && hasHistory ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title="Example answer" caption="with its sources" />
            <Text role="body" theme={theme}>
              {value || persona.askable[0]}
            </Text>
            <Divider theme={theme} />
            <Text role="label" tone="muted" theme={theme}>
              {`Answered from ${tierSummary(persona.tiers)} data, ${duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))} of history. No model left this device, and this screen makes no network request.`}
            </Text>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J14 ----- */

/** J14 · Widgets — including the honest "no public widget yet" state. */
export function WidgetsScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const canPublish = persona.tiers.some((t) => t !== 'D');
  return (
    <Screen
      title="Widgets"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Widgets" subtitle="Glanceable, local, and explicit about privacy" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        {state === 'empty' ? <NothingYet theme={theme} needs={['D']} available={[]} feature="Widgets" actionLabel="Grant usage access" /> : null}
        <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
          <WidgetPreview
            theme={theme}
            size="small"
            variant="private"
            title="Today"
            value={duration(persona.weeklyMinutes[6] ?? 0)}
            caption="Private widget: shows totals only, never which app or what you read."
            bars={persona.weeklyMinutes.map((m) => m / Math.max(...persona.weeklyMinutes))}
          />
          <WidgetPreview
            theme={theme}
            size="medium"
            variant={canPublish ? 'public' : 'private'}
            title={canPublish ? 'Topics' : 'No public widget'}
            value={canPublish ? String(persona.topics.length) : '—'}
            caption={
              canPublish
                ? 'Public widget: only topics you published, with a coarse bucket. Never history.'
                : 'A public widget needs topic data (A/B/C). With usage data only, Mirror shows nothing here rather than inventing it.'
            }
            bars={canPublish ? persona.topics.map((t) => t.depth / 100) : undefined}
          />
        </View>
        <Callout theme={theme} tone="limit">
          Widgets are rendered by the OS, which can show them on a lock screen. That is why the private widget shows totals
          and no titles, and why a public widget can only exist from topics you published yourself.
        </Callout>
        <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
          <Pill theme={theme} variant="secondary">
            Add private widget
          </Pill>
          {canPublish ? (
            <Pill theme={theme} variant="quiet">
              Add public widget
            </Pill>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J15 ----- */

/** J15 · You — settings, exports and the standing of every source. */
export function YouScreen({ theme, persona }: ScreenProps) {
  const flags = initialFlags;
  return (
    <Screen
      title="You"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="You" subtitle="Everything Mirror knows, and where it came from" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Sources" caption={tierSummary(persona.tiers)} />
          <FactList
            theme={theme}
            items={persona.connected.map((c) => ({ label: c.label, value: `${c.tier}${c.connected ? ' · on' : ' · off'}`, detail: c.note }))}
          />
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Features" caption="social is off and stays off unless you ask" />
          <FactList
            theme={theme}
            items={[
              { label: 'Insights', value: isOn(flags, 'insights') ? 'on' : 'off', detail: 'Local analysis only.' },
              { label: 'Weekly report', value: isOn(flags, 'weeklyReport') ? 'on' : 'off', detail: 'Rendered on device.' },
              { label: 'Cloud report', value: isOn(flags, 'cloudReport') ? 'on' : 'off', detail: 'Off by default. Would send aggregates, never events.' },
              { label: 'Matching with others', value: isOn(flags, 'socialMatching') ? 'on' : 'off', detail: 'Off by default. Shares selected topics only — never watch, search or purchase history.' },
            ]}
          />
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Your data" />
          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
            <Pill theme={theme} variant="secondary">
              Export everything
            </Pill>
            <Pill theme={theme} variant="quiet">
              Import an export
            </Pill>
          </View>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(3) }}>
            Exports are written to a file you choose. Importing is the only way tier B data arrives — Mirror never fetches it.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J16 ----- */

/** J16 · Privacy centre — retention, deletion, the receipt and the matrix. */
export function PrivacyCentreScreen({ theme, persona }: ScreenProps) {
  const [sheet, setSheet] = React.useState<'receipt' | 'matrix' | null>(null);
  return (
    <Screen
      title="Privacy centre"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Privacy centre" subtitle="Nothing here is a promise you cannot check" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
      overlay={
        <>
          <Sheet theme={theme} open={sheet === 'receipt'} title="Privacy receipt" subtitle="This month, from the on-device log" onClose={() => setSheet(null)}>
            <PrivacyReceipt
              theme={theme}
              periodLabel="October"
              rows={[
                { label: 'Sent this month', value: '0 B', detail: 'Privacy Mode has never made an outbound request.' },
                { label: 'Raw events sent', value: '0', detail: 'Titles, searches and timestamps stay here.' },
                { label: 'Update check', value: '0 B', detail: 'Would appear here if it ever ran.' },
              ]}
              zeroCopy="In Privacy Mode this list is empty by construction, not by configuration. A remote config change cannot make it non-empty."
            />
          </Sheet>
          <Sheet theme={theme} open={sheet === 'matrix'} title="What Mirror can see" subtitle="By data tier" onClose={() => setSheet(null)}>
            <CapabilityMatrix theme={theme} available={persona.tiers} rows={persona.connected} />
          </Sheet>
        </>
      }
    >
      <View style={{ gap: theme.space(3) }}>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Retention" caption="you set it; the default is 90 days" />
          <FactList
            theme={theme}
            items={[
              { label: 'Raw events', value: '90 days', detail: 'Older events are deleted, not aggregated.' },
              { label: 'Daily summaries', value: '18 months', detail: 'Counts and durations only, no titles.' },
              { label: 'Session labels you wrote', value: 'kept', detail: 'They are yours; Mirror will not expire them silently.' },
            ]}
          />
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Check it yourself" />
          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
            <Pill theme={theme} variant="secondary" onPress={() => setSheet('receipt')}>
              Open receipt
            </Pill>
            <Pill theme={theme} variant="quiet" onPress={() => setSheet('matrix')}>
              Capability matrix
            </Pill>
          </View>
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Delete" caption="one tap, no confirmation maze" />
          <Text role="label" tone="muted" theme={theme}>
            Deleting erases the local database, including every imported export and every label you wrote. Mirrors of nothing
            exist elsewhere: there is no server copy to chase.
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3) }}>
            <Pill theme={theme} variant="quiet">
              Delete all data
            </Pill>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J17 ----- */

/** J17 · Public profile — what another person would see. */
export function PublicProfileScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const published = state === 'empty' ? [] : persona.topics.slice(0, 1);
  return (
    <Screen
      title="Public profile"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Public profile" subtitle="Exactly what a match would see" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <BoundaryToggle theme={theme} value="public" onChange={() => undefined} consequence="Public. Visible to others: the topics you published, and a coarse activity bucket. Nothing else." />
        <Card theme={theme} elevated>
          <Text role="title-lg" theme={theme}>
            {persona.name}
          </Text>
          <Text role="label" tone="muted" theme={theme}>
            {published.length ? `${published.length} topic published` : 'Nothing published yet'}
          </Text>
          <Divider theme={theme} />
          {published.length ? (
            published.map((t) => (
              <View key={t.name} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2) }}>
                <TierBadge tier={(t.tier[0] as DataTier) ?? 'D'} ghost theme={theme} />
                <Text role="body" theme={theme}>
                  {t.name}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {t.depth > 60 ? 'deep interest' : 'exploring'}
                </Text>
              </View>
            ))
          ) : (
            <EmptyState theme={theme} title="Nothing is public" body="A public profile starts empty. Topics are published one at a time, and each one shows what exactly would be shared." />
          )}
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Never shared, under any setting" />
          <FactList
            theme={theme}
            items={[
              { label: 'Watch history', value: 'never' },
              { label: 'Search history', value: 'never' },
              { label: 'Purchases', value: 'never' },
              { label: 'Session timestamps', value: 'never' },
              { label: 'Exact usage minutes', value: 'never', detail: 'A coarse bucket at most: light / regular / heavy.' },
            ]}
          />
        </Card>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J18 ----- */

/** J18 · Matches — off by default, and it says so instead of teasing. */
export function MatchesScreen({ theme, persona, state = 'default' }: ScreenProps) {
  const socialOn = isOn(initialFlags, 'socialMatching') && state !== 'empty';
  return (
    <Screen
      title="Matches"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Matches" subtitle="Off by default, and not required to use Mirror" />}
      footer={<View style={{ height: theme.size.tabBar + theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        {!socialOn ? (
          <Card theme={theme}>
            <EmptyState
              theme={theme}
              title="Matching is off"
              body="Mirror is complete without it. If you turn it on, matching uses only the topics you publish, one by one — never your watch, search or purchase history, and never your raw usage."
              action={
                <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Pill theme={theme} variant="secondary">
                    See what would be shared
                  </Pill>
                  <Pill theme={theme} variant="quiet">
                    Leave it off
                  </Pill>
                </View>
              }
            />
          </Card>
        ) : null}
        <Card theme={theme}>
          <SectionHeader theme={theme} title="What matching can use" caption="published topics only — and this list is the whole list" />
          <FactList
            theme={theme}
            items={[
              { label: 'Your published topics', value: persona.topics.length ? `${persona.topics.length}` : '0', detail: 'Each one is opt-in and removable in one tap.' },
              { label: 'Coarse activity bucket', value: 'optional', detail: 'light / regular / heavy — never minutes.' },
              { label: 'Your usage history', value: 'never', detail: 'Not shared, not derived into a shareable form.' },
            ]}
          />
        </Card>
        <Callout theme={theme} tone="limit">
          Mirror will not notify you to come back, will not show who viewed you, and will not rank people by how much they
          use their phone.
        </Callout>
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------- manifest ---- */

export type ScreenSpec = {
  /** Section J identifier. */
  id: string;
  slug: string;
  title: string;
  /** Which phase ships it, from the roadmap. */
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
  /** Tiers the screen needs to show anything beyond its empty state. */
  requires: DataTier[];
  /** States the mockup renderer must produce for this screen. */
  states: ScreenState[];
  /** The product rule this screen carries, so the next person knows why it exists. */
  rule: string;
  Component: React.ComponentType<ScreenProps>;
};

export const SCREENS: ScreenSpec[] = [
  { id: 'J1', slug: 'onboarding', title: 'Onboarding', phase: 'P2', requires: [], states: ['default'], rule: 'State the three promises before asking for anything.', Component: OnboardingScreen },
  { id: 'J2', slug: 'permission-primer', title: 'Permission primer', phase: 'P1', requires: [], states: ['default'], rule: 'Explain the permission before the OS dialog, and make "not now" as easy as "allow".', Component: PermissionPrimerScreen },
  { id: 'J3', slug: 'home', title: 'Home', phase: 'P2', requires: ['D'], states: ['default', 'empty'], rule: 'The measured reference layout: hero, budget, arcs — and an honest empty state.', Component: HomeScreen },
  { id: 'J4', slug: 'insights', title: 'Insights', phase: 'P2', requires: ['D'], states: ['default', 'empty'], rule: 'Every score explains itself; no number appears without its parts.', Component: InsightsScreen },
  { id: 'J5', slug: 'journey', title: 'Journey', phase: 'P3', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Interest evolution is only shown when topic-level data exists.', Component: JourneyScreen },
  { id: 'J6', slug: 'sessions', title: 'Sessions', phase: 'P3', requires: ['D'], states: ['default', 'empty'], rule: 'The user can annotate their own sessions; labels stay local.', Component: SessionsScreen },
  { id: 'J7', slug: 'discovery', title: 'Discovery', phase: 'P3', requires: ['D'], states: ['default', 'empty'], rule: 'Define "rabbit hole" in the UI, then report against that definition.', Component: DiscoveryScreen },
  { id: 'J8', slug: 'what-if', title: 'What if', phase: 'P3', requires: ['D'], states: ['default', 'empty'], rule: 'Counterfactuals are calculations over your history, never predictions.', Component: WhatIfScreen },
  { id: 'J9', slug: 'focus', title: 'Focus windows', phase: 'P3', requires: ['D'], states: ['default', 'empty'], rule: 'Focus never blocks or shames; it repeats the choice you made.', Component: FocusScreen },
  { id: 'J10', slug: 'profile', title: 'Behaviour profile', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Descriptive traits with their evidence attached, never clinical labels.', Component: ProfileScreen },
  { id: 'J11', slug: 'weekly-report', title: 'Weekly report', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'A local document; sharing is an export you perform, not a sync.', Component: WeeklyReportScreen },
  { id: 'J12', slug: 'budget', title: 'Attention budget', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Budgets are chosen by the user and rendered as numbers, never alarms.', Component: BudgetScreen },
  { id: 'J13', slug: 'ask', title: 'Ask Mirror', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Answer from local data or refuse — never guess, never call out.', Component: AskScreen },
  { id: 'J14', slug: 'widgets', title: 'Widgets', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Widgets can appear on a lock screen: show totals privately, topics publicly.', Component: WidgetsScreen },
  { id: 'J15', slug: 'you', title: 'You', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Every source and every feature flag visible in one place.', Component: YouScreen },
  { id: 'J16', slug: 'privacy-centre', title: 'Privacy centre', phase: 'P5', requires: [], states: ['default'], rule: 'Retention, deletion, receipt and capability matrix — all checkable in-app.', Component: PrivacyCentreScreen },
  { id: 'J17', slug: 'public-profile', title: 'Public profile', phase: 'P6', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Show the user exactly what a match sees, including the never-shared list.', Component: PublicProfileScreen },
  { id: 'J18', slug: 'matches', title: 'Matches', phase: 'P6', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Social is off by default and says so instead of teasing engagement.', Component: MatchesScreen },
];

export const TAB_ITEMS = TABS;
export { TABS };

export const screensByPhase = (phase: ScreenSpec['phase']) => SCREENS.filter((s) => s.phase === phase);
