/**
 * The screen inventory — every screen Mirror ships, as components.
 *
 * The user brief references a "Section J" screen list; no such section exists in
 * the repository, so this inventory is a derivation from the brief and the
 * roadmap. It is meant to be reviewed: see the P-UI-2 report.
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
import { View } from '../src/host';
import type { DataTier } from '../src/tiers';
import { duration, hedged, tierSummary } from '../src/format';
import { isOn, initialFlags } from '../src/flags';
import { BoundaryToggle, Chip, IconButton, LinkButton, Pill, SegmentedControl } from '../src/primitives/controls';
import { Callout, Divider, EmptyState, ListRow, Meter, SectionHeader, Stat, Text, TierBadge } from '../src/primitives/text';
import { Card, HeroCarousel, Screen, Sparkline, Toolbar, Sheet } from '../src/primitives/containers';
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
} from '../src/patterns';
import { PERSONAS, type Persona } from './personas';
import { ConfidenceLine, Definition, NothingYet, ScoreBlock, TabFooter, canSupply, type ScreenProps, type ScreenState } from './kit';
import { demoBands, demoScores } from './scores';
import { DEMO_PREVIEW, IMPORT_MAX_MILLIONS, exportConsentSubject, monthRange } from './demoImport';

/* ------------------------------------------------------------------ data ---- */

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


/* ------------------------------------------------------------------ J1 ------ */

/** J1 · Onboarding + privacy promise — three promises, then the choice to skip. */
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
export function PermissionPrimerScreen({ theme, persona }: ScreenProps) {
  const [step, setStep] = React.useState<'usage' | 'notifications'>('usage');
  const primers = {
    usage: {
      systemName: 'Usage access · Settings → Apps → Special access → Usage access → Mirror',
      sees: 'How long you use each app and when you open them — foreground time, launches, timestamps.',
      cannotSee: 'What is inside those apps. No content, no messages, no notifications. Mirror never reads them.',
      settingsPath: 'Android settings → Special access → Usage access',
    },
    notifications: {
      systemName: 'Notifications · Mirror may send local notifications',
      sees: 'Nothing new. Notifications are an output, not a source — Mirror writes them on this device and no server sends them.',
      cannotSee: 'It also cannot read any other app’s notifications. Reading notifications is a forbidden source, not a disabled feature.',
      settingsPath: 'Android settings → Apps → Mirror → Notifications (off unless you allow)',
    },
  } as const;
  return (
    <Screen
      demo={persona.name}
      title="Permission primers"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Before the system asks"
          subtitle={step === 'usage' ? 'Step 1 of 2 · usage access' : 'Step 2 of 2 · notifications'}
        />
      }
      footer={<View style={{ height: theme.space(6) }} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <SegmentedControl
          theme={theme}
          label="Permission"
          value={step}
          onChange={(v) => setStep(v as 'usage' | 'notifications')}
          options={[
            { value: 'usage', label: 'Usage access' },
            { value: 'notifications', label: 'Notifications' },
          ]}
        />
        <PermissionPrimer theme={theme} ask={primers[step]} onAllow={() => undefined} onDeny={() => undefined} />
        <Callout theme={theme} tone="neutral">
          <Text role="label" tone="muted" theme={theme}>
            {step === 'usage'
              ? 'Usage access is the only permission Mirror needs to work at all. Denying it leaves the app running with an empty, honest dashboard — not with a degraded one full of guesses.'
              : 'Notifications are optional and off by default. With them off, Mirror still works; you simply never hear from it, which for most people is the right setting.'}
          </Text>
        </Callout>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ J3 ------ */

/** J3 · Home — the reference layout: hero, week strip, habits, budget. */
export function HomeScreen({ theme, persona, state, tab }: ScreenProps) {
  const [hero, setHero] = React.useState(0);
  const empty = state === 'empty';
  const slides = HERO(persona);
  const signals = demoScores(persona);
  return (
    <Screen
      demo={persona.name}
      title="Dashboard"
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
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
            <Card theme={theme} elevated>
              <SectionHeader theme={theme} title="Interaction quality" caption="out of what Mirror can actually measure" />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space(2) }}>
                <Text role="display" theme={theme}>
                  {signals.iqs.value === null ? '—' : String(Math.round(signals.iqs.value))}
                </Text>
                <Text role="label" tone="muted" theme={theme}>
                  {`/ ${signals.iqs.max}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {signals.iqs.band}
                </Text>
              </View>
              <ConfidenceLine theme={theme} confidence={signals.confidence} />
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
                {signals.iqs.caveat}
              </Text>
              <View style={{ marginTop: theme.space(3) }}>
                <LinkButton theme={theme}>Why this score</LinkButton>
              </View>
            </Card>
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

/* ------------------------------------------------------------------ J5 ------ */

/** J5 · Journey — how interests appeared, grew and faded. */
export function JourneyScreen({ theme, persona, tab }: ScreenProps) {
  return (
    <Screen
      demo={persona.name}
      title="Interest Evolution"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Interest Evolution"
          subtitle="Where your curiosity went"
          actions={
            <IconButton label="Journey options: range and sources" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
export function SessionsScreen({ theme, persona, state, tab }: ScreenProps) {
  return (
    <Screen
      demo={persona.name}
      title="Sessions"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Sessions" subtitle="Longest first. Labels train the local model." />}
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
export function DiscoveryScreen({ theme, persona, state, tab }: ScreenProps) {
  const rabbit = persona.sessions.filter((s) => s.kind === 'habit');
  const minutes = rabbit.reduce((a, s) => a + s.minutes, 0);
  return (
    <Screen
      demo={persona.name}
      title="Discovery Journey"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Discovery Journey"
          subtitle="Exploration vs. exploitation, route by route"
          actions={
            <IconButton label="Discovery options: what counts as a rabbit hole" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
export function WhatIfScreen({ theme, persona, state, tab }: ScreenProps) {
  const baseline = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  const scenarios = [
    { label: 'Remove short video', delta: -0.18, note: 'Assumes the minutes are not replaced by another app — they usually are, partially.' },
    { label: 'Cap feed sessions at 10 min', delta: -0.11, note: 'Applied to sessions longer than the cap, using your own distribution.' },
    { label: 'Enable quiet hours 22:00–07:00', delta: -0.07, note: 'Counts only usage inside the window.' },
  ];
  return (
    <Screen
      demo={persona.name}
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
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
export function FocusScreen({ theme, persona, state, tab }: ScreenProps) {
  // A focus window is not a tier-D feature. Timestamps can tell you a window was
  // scheduled; they cannot tell you whether the time inside it was focused, because
  // that needs a content-level signal (a search, a topic, a read). With tier D
  // alone this screen would be a calendar pretending to be a measurement.
  const canMeasure = canSupply(persona, ['D'], ['A', 'B', 'C']);
  const empty = state === 'empty' || !canMeasure;
  return (
    <Screen
      demo={persona.name}
      title="Focus"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Focus windows" subtitle="You choose; Mirror only reminds you of your own choice" />}
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {empty ? (
          <NothingYet
            theme={theme}
            needs={['D']}
            anyOf={['A', 'B', 'C']}
            available={persona.tiers}
            feature="Focus windows"
            actionLabel="Connect a source"
          />
        ) : (
          <>
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
              <SectionHeader theme={theme} title="Did the window hold?" caption="measured, not assumed" />
              <FactList
                theme={theme}
                items={[
                  { label: 'Times you returned early', value: '2 of 5', detail: 'Counted from launches inside the window, tier D.' },
                  { label: 'What you returned to', value: 'a feed, twice', detail: 'Needs a tier A/B/C signal; shown only because you have one.' },
                  { label: 'Prompts sent', value: '0', detail: 'A window reminder is a local notification you scheduled, not a nudge.' },
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
              Focus windows need tier D for the schedule and one of tier A/B/C to say whether the time held. Never more, and
              never a guess when the second half is missing.
            </Callout>
          </>
        )}
      </View>
    </Screen>
  );
}

export function ProfileScreen({ theme, persona, state, tab }: ScreenProps) {
  return (
    <Screen
      demo={persona.name}
      title="Behavior Profile"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Behavior Profile"
          subtitle="Descriptions of what you did, never diagnoses"
          actions={
            <IconButton label="Profile options: recompute and export" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
export function WeeklyReportScreen({ theme, persona, state, tab }: ScreenProps) {
  const total = persona.weeklyMinutes.reduce((a, b) => a + b, 0);
  return (
    <Screen
      demo={persona.name}
      title="Weekly Report + Goals"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Weekly Report + Goals"
          subtitle="Built on this device, printed on request"
          actions={
            <IconButton label="Report options: week and sections" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Goals you set" caption="targets, not streaks" />
          {persona.goals.map((goal) => (
            <View key={goal.label} style={{ marginBottom: theme.space(4) }}>
              <Meter
                theme={theme}
                value={goal.progress}
                label={goal.label}
                caption={`${Math.round(goal.progress * 100)}% of ${goal.target}`}
                tone={goal.progress >= 0.8 ? 'anchor' : 'muted'}
              />
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                {goal.note}
              </Text>
            </View>
          ))}
          <Text role="micro" tone="muted" theme={theme}>
            A missed goal is a missed goal. Nothing resets, nothing turns red, and there is no counter of the days you kept it.
          </Text>
        </Card>
        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
          <Pill theme={theme} variant="secondary">
            Preview the share card
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
export function BudgetScreen({ theme, persona, state, tab }: ScreenProps) {
  return (
    <Screen
      demo={persona.name}
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
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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

/* ------------------------------------------------------------------ J15 ----- */

/** J15 · You — settings, exports and the standing of every source. */
/* ------------------------------------------------------------------ J16 ----- */

/** J16 · Privacy centre — retention, deletion, the receipt and the matrix. */
export function PrivacyCentreScreen({ theme, persona, tab }: ScreenProps) {
  const [sheet, setSheet] = React.useState<'receipt' | 'matrix' | null>(null);
  return (
    <Screen
      demo={persona.name}
      title="Privacy Center"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Privacy Center" subtitle="Nothing here is a promise you cannot check" />}
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
          <SectionHeader theme={theme} title="Network log" caption="every request this device made" />
          {persona.networkLog.length === 0 ? (
            <>
              <Text role="label" theme={theme}>
                0 requests. Privacy Mode is on, so nothing has left this device since it was installed.
              </Text>
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                This list is written from the app's own request layer, not from a server-side report — the one thing a server
                could not be trusted to tell you.
              </Text>
            </>
          ) : (
            persona.networkLog.map((entry) => (
              <ListRow
                key={`${entry.when}-${entry.host}`}
                theme={theme}
                title={entry.host}
                meta={`${entry.when} · ${entry.why}`}
                trailing={
                  <Text role="label" tone="muted" theme={theme}>
                    {`${entry.bytes} B`}
                  </Text>
                }
              />
            ))
          )}
          <Divider theme={theme} />
          <Text role="micro" tone="muted" theme={theme}>
            Every line is a request Mirror made. If a line is missing, it did not happen.
          </Text>
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
export function PublicProfileScreen({ theme, persona, state, tab }: ScreenProps) {
  const published = state === 'empty' ? [] : persona.topics.slice(0, 1);
  return (
    <Screen
      demo={persona.name}
      title="Public Profile editor"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Public Profile editor" subtitle="Edit, with a live preview of what a match sees" />}
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <BoundaryToggle theme={theme} value="public" onChange={() => undefined} consequence="Public. Visible to others: the topics you published, and a coarse activity bucket. Nothing else." />
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Editing what is published" caption="each row is one decision, reversible in one tap" />
          {persona.topics.length === 0 ? (
            <Text role="label" tone="muted" theme={theme}>
              No topics yet. A topic appears here once there is enough on-device evidence to describe it, and it stays private
              until you publish it.
            </Text>
          ) : (
            persona.topics.slice(0, 3).map((topic, i) => (
              <View key={topic.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space(3), marginBottom: theme.space(3) }}>
                <View style={{ flexShrink: 1 }}>
                  <Text role="label" theme={theme}>{topic.name}</Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`depth ${topic.depth} · shares “${topic.depth > 60 ? 'deep interest' : 'exploring'}” and nothing else`}
                  </Text>
                </View>
                <Pill theme={theme} variant={i === 0 ? 'primary' : 'quiet'}>
                  {i === 0 ? 'Published' : 'Private'}
                </Pill>
              </View>
            ))
          )}
        </Card>
        <Card theme={theme} elevated>
          <Text role="micro" tone="muted" theme={theme}>
            LIVE PREVIEW · WHAT A MATCH SEES
          </Text>
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
          ) : persona.topics.length === 0 ? (
            // "Nothing published" and "nothing you *could* publish" are different
            // states: without topic data there is no choice to make yet, and the
            // screen has to say which of the two the user is in.
            <DegradedNotice
              theme={theme}
              needs={['A', 'B', 'C']}
              available={persona.tiers}
              feature="Publishing a topic"
              actions={<Pill theme={theme} variant="quiet">Connect a source</Pill>}
            />
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
export function MatchesScreen({ theme, persona, state, tab }: ScreenProps) {
  const socialOn = isOn(initialFlags, 'socialMatching') && state !== 'empty';
  return (
    <Screen
      demo={persona.name}
      title="Matches / Chat"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Matches / Chat" subtitle="Off by default, and not required to use Mirror" />}
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
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
        {socialOn && persona.chat ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={persona.chat.with} caption={`matched on ${persona.chat.topic}`} />
            {persona.chat.messages.map((m, i) => (
              <View key={i} style={{ marginBottom: theme.space(2), alignItems: m.from === 'you' ? 'flex-end' : 'flex-start' }}>
                <View style={{ maxWidth: '86%' }}>
                  <Text role="body" theme={theme}>{m.text}</Text>
                  <Text role="micro" tone="muted" theme={theme}>{m.from === 'you' ? 'you' : 'them'}</Text>
                </View>
              </View>
            ))}
            <Divider theme={theme} />
            <FactList
              theme={theme}
              items={[
                { label: 'Shared in this chat', value: 'what you type', detail: 'Plus the published topic you both matched on.' },
                { label: 'Not shared', value: 'anything measured', detail: 'No totals, no session counts, no app names, no history.' },
                { label: 'Stored', value: 'on this device', detail: 'Messages are kept locally; deleting the match deletes them.' },
              ]}
            />
          </Card>
        ) : null}
        <Callout theme={theme} tone="limit">
          Mirror will not notify you to come back, will not show who viewed you, and will not rank people by how much they
          use their phone.
        </Callout>
        {persona.topics.length === 0 ? (
          // Off is not the same as ready-to-turn-on. Without topic data there is
          // nothing to match on, and turning the switch on would produce an empty
          // list the user could read as "no one is interested".
          <DegradedNotice
            theme={theme}
            needs={['A', 'B', 'C']}
            available={persona.tiers}
            feature="Matching once you turn it on"
            actions={<Pill theme={theme} variant="quiet">Connect a source</Pill>}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------- manifest ---- */

/* ================================================================== J5 ====== */

/** J5 · Depth — session-length distribution, and what "deep" is defined as. */
export function DepthScreen({ theme, persona, state, tab }: ScreenProps) {
  // Not a tier-D feature: session length alone is not the thing this screen is
  // named after. Without a content-level signal it refuses rather than relabelling.
  const canMeasure = canSupply(persona, ['D'], ['A', 'B', 'C']);
  const empty = state === 'empty' || !canMeasure;
  const bands = demoBands(persona);
  const under8 = bands[0]?.share ?? 0;
  return (
    <Screen
      demo={persona.name}
      title="Depth"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Depth"
          subtitle="How far into things you actually got"
          actions={
            <IconButton label="Depth options: range and sequence" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {empty ? (
          <NothingYet theme={theme} needs={['D']} anyOf={['A', 'B', 'C']} available={persona.tiers} feature="Depth" actionLabel="Connect a source" />
        ) : (
          <>
            <Card theme={theme} elevated>
              <Definition theme={theme} term="depth">
                <Text role="label" tone="muted" theme={theme}>
                  {`Depth is how long a single visit lasts, measured from the operating system's own session boundaries. It is a duration, not a judgement: a long visit to something you chose is the point, and a long visit you did not choose still counts as long.`}
                </Text>
              </Definition>
              <Divider theme={theme} />
              <View style={{ flexDirection: 'row', gap: theme.space(4), alignItems: 'flex-end' }}>
                <Stat theme={theme} value={`${Math.round(under8 * 100)}%`} label="of visits end under 8 s" hint="tier D" />
                <Stat theme={theme} value={`${Math.round((bands[4]?.share ?? 0) * 100)}%`} label="last more than 20 min" hint="tier D" />
              </View>
            </Card>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Visit length this week" caption="every visit, not a sample" />
              {bands.map((band) => (
                <View key={band.label} style={{ marginBottom: theme.space(3) }}>
                  <Meter
                    theme={theme}
                    value={band.share}
                    label={`${band.label} — ${band.note}`}
                    caption={`${Math.round(band.share * 100)}%`}
                    tone={band.label === 'under 8 s' ? 'muted' : 'anchor'}
                  />
                </View>
              ))}
            </Card>
            {persona.topics.length === 0 ? (
              <Card theme={theme}>
                <SectionHeader theme={theme} title="What the long visits were about" caption="needs topic data" />
                <NothingYet
                  theme={theme}
                  needs={['A', 'B', 'C']}
                  available={persona.tiers}
                  feature="Depth by topic"
                  actionLabel="Import an export"
                />
              </Card>
            ) : (
              <Card theme={theme}>
                <SectionHeader theme={theme} title="Deepest visits" caption="the subject each one was about" />
                {persona.sessions
                  .filter((s) => s.kind === 'deep')
                  .slice(0, 3)
                  .map((s) => (
                    <ListRow
                      key={`${s.app}-${s.minutes}`}
                      theme={theme}
                      title={`${s.minutes} min · ${s.app}`}
                      meta={s.topic === '—' ? 'no topic attached (tier D)' : s.topic}
                      leading={<TierBadge tier={s.topic === '—' ? 'D' : 'C'} ghost theme={theme} />}
                    />
                  ))}
              </Card>
            )}
            <Callout theme={theme} tone="limit">
              <Text role="label" theme={theme}>
                {/* The rule that keeps this screen honest: it can show duration, and it
                    refuses to claim the duration was good for you. */}
                Mirror can measure how long a visit lasted. It cannot measure whether the visit was any good for you, so it will
                not label a video, a post or an app as deep, shallow, useful or wasted.
              </Text>
            </Callout>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ================================================================== J6 ====== */

/** J6 · Curiosity vs Habit — the two halves of the same week, both named. */
export function CuriosityHabitScreen({ theme, persona, state, tab }: ScreenProps) {
  // Not a tier-D feature: session length alone is not the thing this screen is
  // named after. Without a content-level signal it refuses rather than relabelling.
  const canMeasure = canSupply(persona, ['D'], ['A', 'B', 'C']);
  const empty = state === 'empty' || !canMeasure;
  const { note } = persona.curiosity;
  // The split is engine output, not a persona literal: the same sessions and
  // labels that produce the IQS produce this. A missing split is not "zero deep
  // hours" — it is no measurement, and the empty state already says so.
  const split = demoScores(persona).curiosity;
  const deepHours = split ? Math.round((split.deepMs / 3_600_000) * 10) / 10 : 0;
  const habitHours = split ? Math.round((split.habitMs / 3_600_000) * 10) / 10 : 0;
  const switchesPerHour = split ? Math.round(split.switchesPerHour * 10) / 10 : 0;
  const total = deepHours + habitHours || 1;
  const unlabeledHours = split ? Math.round((split.unlabeledMs / 3_600_000) * 10) / 10 : 0;
  return (
    <Screen
      demo={persona.name}
      title="Curiosity vs habit"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Curiosity vs habit"
          subtitle="Two ways the same hour gets spent"
          actions={
            <IconButton label="Curiosity options: what counts as habit" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {empty ? (
          <NothingYet theme={theme} needs={['D']} anyOf={['A', 'B', 'C']} available={persona.tiers} feature="Curiosity vs habit" actionLabel="Connect a source" />
        ) : (
          <>
            <Card theme={theme}>
              <Definition theme={theme} term="habit">
                <Text role="label" tone="muted" theme={theme}>
                  {`A habit block is time in a feed you reached without searching for anything, made of visits under three minutes. Curiosity is everything else you attended to on purpose — a search, a saved item, a long read.`}
                </Text>
              </Definition>
              <Divider theme={theme} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Stat theme={theme} value={`${deepHours}h`} label="curiosity" hint="chosen starts" />
                <Stat theme={theme} value={`${habitHours}h`} label="habit" hint="feed drift" />
              </View>
              <View style={{ marginTop: theme.space(3) }}>
                <Meter
                  theme={theme}
                  value={deepHours / total}
                  label="curiosity share of attended time"
                  caption={`${Math.round((deepHours / total) * 100)}%`}
                />
              </View>
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
                {`${switchesPerHour} app switches per hour. ${unlabeledHours}h of attended time has no intent label yet and is counted, not guessed.`}
              </Text>
            </Card>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Where the habit minutes were" caption="by app, no content read" />
              {persona.budgets.map((b) => (
                <View key={b.label} style={{ marginBottom: theme.space(3) }}>
                  <Meter
                    theme={theme}
                    value={Math.min(1, b.actual / Math.max(b.target, 1))}
                    label={b.label}
                    caption={`${b.actual} / ${b.target} ${b.unit}`}
                    tone={b.actual > b.target ? 'muted' : 'anchor'}
                  />
                </View>
              ))}
            </Card>
            <Callout theme={theme} tone="neutral">
              <Text role="label" theme={theme}>{note}</Text>
            </Callout>
            <Callout theme={theme} tone="limit">
              <Text role="label" theme={theme}>
                Habit is not a failure and Mirror will not frame it as one. There is no streak to break here, no red state, and no
                message telling you to do better.
              </Text>
            </Callout>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ================================================================== J7 ====== */

/** J7 · IQS — the composite score, built only from parts that exist. */
export function IqsScreen({ theme, persona, state, tab }: ScreenProps) {
  const empty = state === 'empty' || demoScores(persona).iqs.value === null;
  const { iqs, confidence } = demoScores(persona);
  return (
    <Screen
      demo={persona.name}
      title="IQS"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Interaction quality"
          subtitle="A composite, never a verdict"
          actions={
            <IconButton label="IQS options: parts and weights" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {empty ? (
          <NothingYet theme={theme} needs={['D']} available={[]} feature="IQS" actionLabel="Grant usage access" />
        ) : (
          <Card theme={theme} elevated>
            <ScoreBlock
              theme={theme}
              title="Interaction Quality Score"
              score={iqs.value ?? 0}
              max={iqs.max}
              band={iqs.band}
              parts={iqs.factors.map((factor) => ({
                label: factor.label,
                points: factor.points,
                max: factor.max,
                tier: factor.tier,
                detail: factor.detail,
              }))}
              caveat={iqs.caveat}
              action={<LinkButton theme={theme}>Why this score</LinkButton>}
            />
            <Divider theme={theme} />
            <ConfidenceLine theme={theme} confidence={confidence} />
          </Card>
        )}
        <Card theme={theme}>
          <SectionHeader theme={theme} title="What this confidence means" />
          <FactList theme={theme} items={confidence.reasons.map((reason) => ({ label: 'Reason', value: '', detail: reason }))} />
        </Card>
        <Callout theme={theme} tone="limit">
          <Text role="label" theme={theme}>
            IQS is an estimate from behaviour on this device. It is not a diagnosis, not a personality test, and not comparable
            between people — the band exists because a single number invites exactly that comparison.
          </Text>
        </Callout>
      </View>
    </Screen>
  );
}

/* ================================================================== J11 ===== */

/** J11 · Rabbit Hole — the definition is yours, and it is printed on the screen. */
export function RabbitHoleScreen({ theme, persona, state, tab }: ScreenProps) {
  // Not a tier-D feature: session length alone is not the thing this screen is
  // named after. Without a content-level signal it refuses rather than relabelling.
  const canMeasure = canSupply(persona, ['D'], ['A', 'B', 'C']);
  const empty = state === 'empty' || !canMeasure;
  const rabbit = persona.rabbit;
  return (
    <Screen
      demo={persona.name}
      title="Rabbit hole"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Rabbit hole"
          subtitle="Drift, defined so you can disagree with it"
          actions={
            <IconButton label="Rabbit hole options: change the definition" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        <Card theme={theme}>
          <Definition theme={theme} term="rabbit hole">
            <Text role="label" tone="muted" theme={theme}>
              Five or more visits to the same feed within twenty minutes where each visit is under three minutes and no search
              started it. You can loosen or tighten this below, and the count changes with it.
            </Text>
          </Definition>
          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', marginTop: theme.space(3) }}>
            <Chip label="Visits" value="5+" theme={theme} />
            <Chip label="Window" value="20 min" theme={theme} />
            <Chip label="Visit length" value="under 3 min" theme={theme} />
          </View>
        </Card>
        {empty ? (
          <NothingYet theme={theme} needs={['D']} anyOf={['A', 'B', 'C']} available={persona.tiers} feature="Rabbit-hole detection" actionLabel="Connect a source" />
        ) : (
          <>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="This week" caption="against the definition above" />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Stat theme={theme} value={`${rabbit.sessions}`} label="blocks that qualified" />
                <Stat theme={theme} value={duration(rabbit.minutes)} label="inside them" />
                <Stat theme={theme} value={`${Math.round(rabbit.lateNightShare * 100)}%`} label="after 11pm" />
              </View>
              <Divider theme={theme} />
              <Text role="label" tone="muted" theme={theme}>{rabbit.example}</Text>
            </Card>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="What Mirror will not do about it" caption="the point of the screen" />
              <FactList
                theme={theme}
                items={[
                  { label: 'Block the feed', value: 'not offered' },
                  { label: 'Nudge you out of it', value: 'only if you ask', detail: 'An intent check you wrote yourself, one prompt, no repeat.' },
                  { label: 'Score you on it', value: 'never' },
                  { label: 'Show it publicly', value: 'never', detail: 'This number never appears on the public profile, in any form.' },
                ]}
              />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ================================================================== J13 ===== */

/** J13 · Connections / consent dashboard — sources, capability matrix, revocation. */
export function ConnectionsScreen({ theme, persona, tab }: ScreenProps) {
  const [boundary, setBoundary] = React.useState<'private' | 'public'>('private');
  return (
    <Screen
      demo={persona.name}
      title="Connections"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Connections"
          subtitle="Every source, and what each one cannot do"
          actions={
            <IconButton label="Connection options: add a source" theme={theme}>
              <Text role="label" theme={theme}>＋</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <BoundaryToggle
          theme={theme}
          value={boundary}
          onChange={setBoundary}
          consequence={
            boundary === 'private'
              ? 'Private. Connexions feed the private profile only. Nothing you connect here can be seen by a match.'
              : 'Public. Only topics you publish are shared — never a connected source, a watch history or a search.'
          }
        />
        <CapabilityMatrix theme={theme} available={persona.tiers} rows={persona.connected} />
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Revoking" caption="one tap, no confirmation maze" />
          <FactList
            theme={theme}
            items={[
              { label: 'Usage access', value: 'Android setting', detail: 'Revocable in Android settings; Mirror notices and stops collecting within a minute.' },
              { label: 'Extension (tier C)', value: 'per site', detail: 'Allow-listed sites only; removing the extension stops tier C at the browser.' },
              { label: 'OAuth sources (tier A)', value: 'per scope', detail: 'Revoke in the provider too — Mirror deletes its copy either way.' },
              { label: 'Imports (tier B)', value: 'delete any time', detail: 'An import is a file you can remove without affecting the others.' },
            ]}
          />
        </Card>
        <Callout theme={theme} tone="limit">
          <Text role="label" theme={theme}>
            Mirror will never ask for an accessibility service, a screen recorder, an overlay or a notification listener. If a
            future version offers a source that needs one of those, it is not this product.
          </Text>
        </Callout>
      </View>
    </Screen>
  );
}

/* ================================================================== J17 ===== */

/** J17 · Why drawer — a sheet over whatever number the user is questioning. */
export function WhyDrawerSheet({ theme, persona }: ScreenProps) {
  const { iqs, confidence } = demoScores(persona);
  const measured = iqs.factors.filter((factor) => factor.measurable);
  const missing = iqs.factors.filter((factor) => !factor.measurable);
  return (
    <Sheet
      open
      theme={theme}
      title="Why this score"
      subtitle="Every part that produced the number, including the parts that could not be measured"
      onClose={() => undefined}
    >
      <View style={{ gap: theme.space(3) }}>
        <WhySheet
          theme={theme}
          score={iqs.value ?? 0}
          maxScore={iqs.max}
          components={measured.map((factor) => ({ label: factor.label, points: factor.points, note: factor.detail, tier: factor.tier }))}
          caveat={iqs.caveat}
        />
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Confidence" caption="coverage, sample, labels and tiers" />
          <ConfidenceLine theme={theme} confidence={confidence} />
          <View style={{ marginTop: theme.space(2), gap: theme.space(1) }}>
            {confidence.reasons.map((reason) => (
              <Text key={reason} role="micro" tone="muted" theme={theme}>
                {`· ${reason}`}
              </Text>
            ))}
          </View>
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="What is not in this number" />
          <FactList
            theme={theme}
            items={[
              ...missing.map((factor) => ({ label: factor.label, value: 'not measured', detail: factor.detail })),
              { label: 'Content you watched', value: 'not measured', detail: 'It is content, so it stays on this device and is not scored by name.' },
              { label: 'Whether any of it was good for you', value: 'not measured' },
              { label: 'Anything on another device', value: 'not measured' },
            ]}
          />
        </Card>
        <Callout theme={theme} tone="limit">
          <Text role="label" theme={theme}>
            The measured parts add up exactly. If a part is missing it is listed, and the maximum is smaller — Mirror never
            re-weights the parts to hide a gap.
          </Text>
        </Callout>
      </View>
    </Sheet>
  );
}

/* ================================================================== J21 ===== */

/** J21 · Learning arcs — a topic followed over months, with what came next. */
export function LearningArcsScreen({ theme, persona, state, tab }: ScreenProps) {
  const empty = state === 'empty' || persona.arcs.length === 0;
  return (
    <Screen
      demo={persona.name}
      title="Learning arcs"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Learning arcs"
          subtitle="How a subject deepened, week by week"
          actions={
            <IconButton label="Arc options: range and topics" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        {empty ? (
          <NothingYet
            theme={theme}
            needs={['A', 'B', 'C']}
            available={persona.tiers}
            feature="Learning arcs"
            actionLabel="Import an export"
          />
        ) : (
          persona.arcs.map((arc) => (
            <Card key={arc.topic} theme={theme}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text role="title" theme={theme}>{arc.topic}</Text>
                <Chip label="stage" value={arc.stage} theme={theme} />
              </View>
              <View style={{ marginTop: theme.space(2) }}>
                <Sparkline
                  theme={theme}
                  values={arc.weeks}
                  label={`${arc.topic}: depth over the last eight weeks, ${arc.weeks.join(', ')}`}
                />
              </View>
              <Text role="label" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
                {arc.next}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>from tier {arc.sourceTier} sources</Text>
            </Card>
          ))
        )}
        {!empty ? (
          <Callout theme={theme} tone="neutral">
            <Text role="label" theme={theme}>
              A stalled arc is a fact, not a failure — it is listed the same way as a growing one, and Mirror will not ask you to
              pick it back up.
            </Text>
          </Callout>
        ) : null}
      </View>
    </Screen>
  );
}

/* ================================================================== J22 ===== */

/** J22 · Ask — a sheet that answers from local data or refuses, never guesses. */
export function AskSheet({ theme, persona, state }: ScreenProps) {
  const canAnswer = state !== 'empty' && persona.askable.length > 0;
  return (
    <Sheet open theme={theme} title="Ask Mirror" subtitle="Answers come from this device, or not at all" onClose={() => undefined}>
      <AskComposer
        theme={theme}
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        suggestions={canAnswer ? persona.askable : []}
        canAnswer={canAnswer}
        blockedReason={
          canAnswer
            ? undefined
            : 'There is not enough on-device history to answer without guessing. Mirror will not guess.'
        }
      />
    </Sheet>
  );
}

/* ================================================================== J23 ===== */

/** J23 · Privacy receipt — what left the device, in bytes, this month. */
export function PrivacyReceiptSheet({ theme, persona, state }: ScreenProps) {
  const rows = persona.networkLog;
  const bytes = rows.reduce((total, r) => total + r.bytes, 0);
  const empty = state === 'empty' || rows.length === 0;
  return (
    <Sheet open theme={theme} title="Privacy receipt" subtitle="Generated from the on-device request log" onClose={() => undefined}>
      <PrivacyReceipt
        theme={theme}
        periodLabel="October"
        rows={
          empty
            ? [
                { label: 'Sent this month', value: '0 B', detail: 'Privacy Mode has never made an outbound request.' },
                { label: 'Requests logged', value: '0' },
              ]
            : [
                { label: 'Sent this month', value: `${Math.round(bytes / 1024)} KB`, detail: `${rows.length} requests, all of them yours.` },
                { label: 'Raw events sent', value: '0', detail: 'Titles, searches and timestamps stay here.' },
                ...rows.slice(0, 3).map((r) => ({ label: r.host, value: `${r.bytes} B`, detail: `${r.when} — ${r.why}` })),
              ]
        }
        zeroCopy={
          empty
            ? 'In Privacy Mode this list is empty by construction: there is nothing to itemise because nothing was sent.'
            : 'Every line here is a request Mirror made. If a line is missing, it did not happen.'
        }
      />
    </Sheet>
  );
}

/* ================================================================== J24 ===== */

/** J24 · Demo persona picker — switches whose data is on screen, and says so. */
export function PersonaPickerSheet({ theme, persona }: ScreenProps) {
  return (
    <Sheet open theme={theme} title="Demo persona" subtitle="Which data the screens are built from" onClose={() => undefined}>
      <View style={{ gap: theme.space(3) }}>
        <Callout theme={theme} tone="limit">
          <Text role="label" theme={theme}>
            Demo data replaces your own while it is on. It is never mixed with it, never written to storage, and turning it off
            restores your real numbers unchanged.
          </Text>
        </Callout>
        {PERSONAS.map((p) => (
          <ListRow
            key={p.id}
            theme={theme}
            title={`${p.name}${p.id === persona.id ? ' · showing now' : ''}`}
            meta={p.blurb}
            leading={<TierBadge tier={(p.tiers[p.tiers.length - 1] as DataTier) ?? 'D'} ghost theme={theme} />}
            trailing={
              <Text role="label" theme={theme} style={{ fontWeight: '600' }}>
                {p.tiers.join('')}
              </Text>
            }
          />
        ))}
        <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
          <Pill theme={theme} variant={persona.id === 'ananya' ? 'primary' : 'quiet'}>Ananya · tier D</Pill>
          <Pill theme={theme} variant={persona.id === 'rehan' ? 'primary' : 'quiet'}>Rehan · D+B+C</Pill>
          <Pill theme={theme} variant={persona.id === 'mei' ? 'primary' : 'quiet'}>Mei · all tiers</Pill>
        </View>
      </View>
    </Sheet>
  );
}

/* ================================================================== J25 ===== */

/** J25 · Intent Check settings — the one place Mirror is allowed to interrupt. */
export function IntentCheckScreen({ theme, persona, tab }: ScreenProps) {
  return (
    <Screen
      demo={persona.name}
      title="Intent check"
      theme={theme}
      padded
      header={
        <Toolbar
          theme={theme}
          title="Intent check"
          subtitle="One question, only if you asked for it"
          actions={
            <IconButton label="Intent check options: timing and quiet hours" theme={theme}>
              <Text role="label" theme={theme}>⋯</Text>
            </IconButton>
          }
        />
      }
      footer={<TabFooter theme={theme} active={tab ?? 'home'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Where Mirror may ask" caption="off unless you turn it on" />
          {persona.intents.map((intent) => (
            <View key={intent.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space(3), marginBottom: theme.space(3) }}>
              <View style={{ flexShrink: 1 }}>
                <Text role="label" theme={theme}>{intent.label}</Text>
                <Text role="micro" tone="muted" theme={theme}>{intent.note}</Text>
              </View>
              <Pill theme={theme} variant={intent.ask ? 'primary' : 'quiet'}>
                {intent.ask ? 'Asks' : 'Silent'}
              </Pill>
            </View>
          ))}
        </Card>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Quiet hours" caption="no prompt can fire inside them" />
          <FactList
            theme={theme}
            items={[
              { label: 'Quiet hours', value: '22:00 – 07:00', detail: 'Local time, on this device. Nothing fires overnight.' },
              { label: 'Maximum prompts', value: '1 per day', detail: 'Never repeated inside a session.' },
              { label: 'Prompt style', value: 'local notification', detail: 'No push service, no server, no tracking pixel.' },
            ]}
          />
        </Card>
        <Callout theme={theme} tone="limit">
          <Text role="label" theme={theme}>
            The intent check exists to hold a decision you already made, once. It is not a reminder to use Mirror, it never counts
            how many times you followed it, and turning it off is one tap with no “are you sure”.
          </Text>
        </Callout>
        <Card theme={theme}>
          <SectionHeader theme={theme} title="Where your intent labels go" />
          <FactList
            theme={theme}
            items={[
              { label: 'Stored', value: 'on this device' },
              { label: 'Trains', value: 'a local model' },
              { label: 'Shared', value: 'never', detail: 'Intent labels are excluded from the public profile and from matches.' },
            ]}
          />
        </Card>
      </View>
    </Screen>
  );
}

/* ================================================================== J26 ===== */

/** J26 · Private share card preview — the card, and what would not be on it. */
export function ShareCardState({ theme, persona }: ScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.scrim, justifyContent: 'center', padding: theme.space(5), gap: theme.space(3) }}>
      <BoundaryToggle
        theme={theme}
        value="private"
        onChange={() => undefined}
        consequence="Private. This card is a preview; nothing leaves the device until you tap Share, and the preview is the whole card."
      />
      <Card theme={theme} elevated style={{ backgroundColor: theme.color.card }}>
        <Text role="micro" tone="muted" theme={theme}>
          PRIVATE · PREVIEW ONLY
        </Text>
        <Text role="headline" theme={theme} style={{ marginTop: theme.space(2) }}>
          {`${duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))} with ${persona.topics[0]?.name ?? 'one habit loop'} in the middle`}
        </Text>
        <Text role="label" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
          {`${Math.round(persona.intentionalShare * 100)}% deliberate · week 42`}
        </Text>
        <Divider theme={theme} />
        <FactList
          theme={theme}
          items={[
            { label: 'App names on the card', value: 'none' },
            { label: 'Topics on the card', value: persona.topics.length ? 'one, chosen by you' : 'none' },
            { label: 'Totals', value: 'private, never on a shared card' },
          ]}
        />
      </Card>
      <Text role="micro" theme={theme} style={{ color: theme.color.inkMuted, textAlign: 'center' }}>
        Nothing is shared until you tap Share, and this preview shows the whole card — there is no second version.
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space(2), justifyContent: 'center', flexWrap: 'wrap' }}>
        <Pill theme={theme} variant="secondary">Keep private</Pill>
        <Pill theme={theme} variant="quiet">Share this card</Pill>
      </View>
    </View>
  );
}

/* ================================================================== J27 ===== */

/** J27 · Home-screen widget — totals privately, topics only if you opt in. */
export function WidgetItem({ theme, persona }: ScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.canvas, padding: theme.space(5), gap: theme.space(4) }}>
      <Text role="micro" tone="muted" theme={theme} style={{ paddingTop: theme.space(4) }}>
        HOME SCREEN · AS IT WOULD APPEAR
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
        <WidgetPreview
          theme={theme}
          size="medium"
          variant="private"
          title="This week"
          value={duration(persona.weeklyMinutes.reduce((a, b) => a + b, 0))}
          caption="private widget · totals only"
          bars={persona.weeklyMinutes}
        />
        <WidgetPreview
          theme={theme}
          size="small"
          variant="private"
          title="Intentional"
          value={`${Math.round(persona.intentionalShare * 100)}%`}
          caption="private"
        />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
        <WidgetPreview
          theme={theme}
          size="medium"
          variant="public"
          title="Following"
          value={persona.topics.length ? (persona.topics[0] as { name: string }).name : 'nothing published'}
          caption="public widget · published topics only"
        />
      </View>
      <Callout theme={theme} tone="limit">
        <Text role="label" theme={theme}>
          A widget can sit on a lock screen. The private widget never shows an app name, a topic or a number a stranger could use,
          and the public widget only ever repeats what you already published.
        </Text>
      </Callout>
      <View style={{ gap: theme.space(2) }}>
        <SegmentedControl
          theme={theme}
          label="Widget layout"
          value="medium"
          onChange={() => undefined}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap' }}>
          <Pill theme={theme} variant="secondary">Add to home screen</Pill>
          <Pill theme={theme} variant="quiet">Keep widgets private</Pill>
        </View>
        <Text role="micro" tone="muted" theme={theme}>
          Widgets read from the on-device database only. Removing the widget does not remove any data, and adding it does not
          start any collection.
        </Text>
      </View>
    </View>
  );
}

/* ============================================================ P2 import ==== */

/**
 * Import an export — the screen that makes the P1b importers usable.
 *
 * This is deliberately **not** a Section J item: the brief's 28 items do not name
 * an import flow, and inventing a 29th entry would quietly change the inventory.
 * It ships as a P2 addition and the gallery lists it separately.
 *
 * The note about large Takeout files is here because it is the first thing that
 * goes wrong in real life: a decade of watch history is one enormous JSON file,
 * and a reader that truncates it would produce a confident, wrong picture.
 */
export function ImportScreen({ theme, persona, state, tab }: ScreenProps) {
  const empty = state === 'empty';
  return (
    <Screen
      demo={persona.name}
      title="Import an export"
      theme={theme}
      padded
      header={<Toolbar theme={theme} title="Import an export" subtitle="Your file, read on this phone" />}
      footer={<TabFooter theme={theme} active={tab ?? 'you'} />}
    >
      <View style={{ gap: theme.space(3) }}>
        <DataStanding theme={theme} tiers={persona.tiers} />
        <Card theme={theme}>
          <SectionHeader theme={theme} title="What an import can read" caption="tier B · user export · you choose the file" />
          <FactList
            theme={theme}
            items={[
              { label: 'Reddit data export', value: 'saved only', detail: 'saved_posts.csv and saved_comments.csv. Authored posts, comments and chat are never read.' },
              { label: 'Google Takeout', value: 'watch history', detail: 'watch-history.json. Advertisement entries are skipped and counted.' },
            ]}
          />
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            Nothing is uploaded. The file is read here, the preview is built here, and the import is written to the encrypted
            local database.
          </Text>
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader theme={theme} title="Large Takeout files" caption="read once, never truncated" />
          <Text role="label" theme={theme}>
            {`A decade of YouTube history can be 50–200 MB in one watch-history.json. Mirror reads one file at a time and refuses a file over ${IMPORT_MAX_MILLIONS} million characters (64 MiB) instead of cutting it short.`}
          </Text>
          <Text role="label" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            If yours is larger, Mirror says so and asks you to request a shorter date range or split the archive. It will not
            import part of a file and call the rest empty.
          </Text>
          <Callout theme={theme} tone="limit">
            <Text role="micro" theme={theme}>
              A partial import would make a quiet week look quiet. That is the one failure this screen exists to prevent.
            </Text>
          </Callout>
        </Card>

        {empty ? (
          <NothingYet theme={theme} needs={[]} available={persona.tiers} feature="Import" actionLabel="Choose a file" />
        ) : (
          <>
            <Card theme={theme}>
              <SectionHeader theme={theme} title="Preview" caption="nothing has been written yet" />
              <FactList
                theme={theme}
                items={[
                  { label: 'Items in the file', value: DEMO_PREVIEW.total.toLocaleString('en-GB') },
                  { label: 'New to Mirror', value: DEMO_PREVIEW.fresh.toLocaleString('en-GB') },
                  { label: 'Already imported', value: String(DEMO_PREVIEW.duplicates), detail: 'Matched by a keyed hash; the original id is not stored.' },
                  { label: 'Months covered', value: monthRange(DEMO_PREVIEW) ?? 'none yet' },
                ]}
              />
              {DEMO_PREVIEW.warnings.length > 0 ? (
                <View style={{ marginTop: theme.space(2) }}>
                  <Callout theme={theme} tone="limit">
                    <Text role="micro" theme={theme}>
                      {`${DEMO_PREVIEW.warnings.length === 1 ? 'One row was' : `${DEMO_PREVIEW.warnings.length} rows were`} refused, not guessed at: ${DEMO_PREVIEW.warnings[0]!.reason}.`}
                    </Text>
                  </Callout>
                </View>
              ) : null}
              <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
                Nothing is kept until you confirm. The preview is a count, not a copy.
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3), flexWrap: 'wrap' }}>
                <Pill theme={theme} variant="secondary">Choose another file</Pill>
                <Pill theme={theme} variant="quiet">Cancel</Pill>
              </View>
            </Card>

            <Card theme={theme}>
              <SectionHeader theme={theme} title="Before you confirm" caption="one grant, revocable in one tap" />
              <FactList
                theme={theme}
                items={[
                  { label: 'Grant needed', value: exportConsentSubject(DEMO_PREVIEW.parserId), detail: 'Only this import. It does not connect an account.' },
                  { label: 'If you revoke it', value: 'items are deleted', detail: 'Exactly the items this import produced; nothing else is touched.' },
                  { label: 'What stays', value: 'counts, no titles', detail: 'Daily totals survive retention; titles expire with the raw events.' },
                ]}
              />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ================================================================== J28 ===== */

/** J28 · Update available — calm, non-blocking, and explicit about collection. */
export function UpdateState({ theme, persona }: ScreenProps) {
  const { current, available, notes, bytes } = persona.update;
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.color.scrim, padding: theme.space(3) }}>
      <Card theme={theme} elevated>
        <Text role="micro" tone="muted" theme={theme}>
          {`VERSION ${current} → ${available}`}
        </Text>
        <Text role="title" theme={theme} style={{ marginTop: theme.space(1) }}>
          An update is available
        </Text>
        <Text role="label" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
          {notes}
        </Text>
        <Divider theme={theme} />
        <FactList
          theme={theme}
          items={[
            { label: 'Size', value: `${Math.round(bytes / 1_000_000)} MB` },
            { label: 'New permissions', value: 'none' },
            { label: 'New data sent anywhere', value: 'none' },
            { label: 'Works offline', value: 'yes', detail: 'The update is a download; nothing about your data changes.' },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(3), flexWrap: 'wrap' }}>
          <Pill theme={theme} variant="secondary">Later</Pill>
          <Pill theme={theme} variant="quiet">What changed</Pill>
        </View>
      </Card>
    </View>
  );
}

export type ScreenKind = 'screen' | 'sheet' | 'state' | 'widget';

export type ScreenSpec = {
  /** Inventory id, J1..J28 — the Section J list is 28 items. */
  id: string;
  slug: string;
  title: string;
  /**
   * How it appears: a full screen, a bottom sheet, a state of a parent screen,
   * or a home-screen widget. The gallery renders sheets/states *over* their
   * parent, so what a reviewer sees is what a user would see.
   */
  kind: ScreenKind;
  /** For sheets, states and widgets: the slug of the screen they appear on. */
  parent?: string;
  /** Which tab it is reached from, when it is a full screen. */
  tab?: string;
  /** Which phase ships it, from the roadmap. */
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
  /** Tiers the screen needs to show anything beyond its empty state. */
  requires: DataTier[];
  /**
   * Additional tiers of which at least one is needed. Some features are not
   * single-tier features: depth, rabbit holes, curiosity-vs-habit and focus
   * windows need the OS's session data *and* a content-level signal, and
   * declaring them as tier-D-only would be the fake-signal failure the brief
   * forbids.
   */
  requiresAnyOf?: DataTier[];
  /** States the mockup renderer must produce for this item. */
  states: ScreenState[];
  /** The product rule this screen carries, so the next person knows why it exists. */
  rule: string;
  Component: React.ComponentType<ScreenProps>;
};

/**
 * What ships in which phase — the roadmap from `docs/SPEC.md` §5, as a value so
 * the inventory can be checked against it instead of drifting.
 */
export const PHASES: { id: string; scope: string; items: string[] }[] = [
  { id: 'P1', scope: 'encrypted local storage, Android collector, ingestion, importers', items: ['J1', 'J2'] },
  { id: 'P2', scope: 'scoring engine, dashboard, Why-this-score, release stage 1', items: ['J3', 'J5', 'J6', 'J7', 'J8', 'J17', 'J24'] },
  { id: 'P3', scope: 'interest evolution, discovery, rabbit holes, what-if, focus windows', items: ['J4', 'J9', 'J11', 'J18', 'J20', 'J21', 'J25'] },
  { id: 'P4', scope: 'behaviour profile, weekly report, attention budget, ask, widgets', items: ['J10', 'J12', 'J19', 'J22', 'J27'] },
  { id: 'P5', scope: 'OAuth connectors, consent dashboard, extension, privacy receipt, release stage 2', items: ['J13', 'J14', 'J23', 'J28'] },
  { id: 'P6', scope: 'backend, encrypted sync, social layer, share cards, release stage 3', items: ['J15', 'J16', 'J26'] },
  { id: 'P7', scope: 'security review, store readiness, staged rollout, release stage 4', items: [] },
];

/** The Section J list, verbatim, so a test can prove the inventory covers it. */
export const SECTION_J: { id: string; title: string; kind: ScreenKind; parent?: string }[] = [
  { id: 'J1', title: 'Onboarding + privacy promise', kind: 'screen' },
  { id: 'J2', title: 'Permission primers (Usage access, notifications)', kind: 'screen' },
  { id: 'J3', title: 'Dashboard', kind: 'screen' },
  { id: 'J4', title: 'Interest Evolution', kind: 'screen' },
  { id: 'J5', title: 'Depth', kind: 'screen' },
  { id: 'J6', title: 'Curiosity vs Habit', kind: 'screen' },
  { id: 'J7', title: 'IQS', kind: 'screen' },
  { id: 'J8', title: 'Sessions', kind: 'screen' },
  { id: 'J9', title: 'Discovery Journey', kind: 'screen' },
  { id: 'J10', title: 'Behavior Profile', kind: 'screen' },
  { id: 'J11', title: 'Rabbit Hole', kind: 'screen' },
  { id: 'J12', title: 'Weekly Report + Goals', kind: 'screen' },
  { id: 'J13', title: 'Connections / Consent Dashboard (with capability matrix)', kind: 'screen' },
  { id: 'J14', title: 'Privacy Center (network log, delete everything)', kind: 'screen' },
  { id: 'J15', title: 'Public Profile editor (live preview)', kind: 'screen' },
  { id: 'J16', title: 'Matches / Chat', kind: 'screen' },
  { id: 'J17', title: 'Why drawer', kind: 'sheet', parent: 'dashboard' },
  { id: 'J18', title: 'What-if Simulator', kind: 'screen' },
  { id: 'J19', title: 'Attention Budget', kind: 'screen' },
  { id: 'J20', title: 'Focus Windows', kind: 'screen' },
  { id: 'J21', title: 'Learning Arcs', kind: 'screen' },
  { id: 'J22', title: 'Ask sheet', kind: 'sheet', parent: 'dashboard' },
  { id: 'J23', title: 'Privacy Receipt', kind: 'sheet', parent: 'privacy-center' },
  { id: 'J24', title: 'Demo persona picker', kind: 'sheet', parent: 'dashboard' },
  { id: 'J25', title: 'Intent Check settings', kind: 'screen' },
  { id: 'J26', title: 'Private Share Card preview', kind: 'state', parent: 'weekly-report-goals' },
  { id: 'J27', title: 'Home-screen widget', kind: 'widget', parent: 'dashboard' },
  { id: 'J28', title: '"Update available / app version" state (calm, non-blocking)', kind: 'state', parent: 'dashboard' },
];

/**
 * Screens that are **not** Section J items but ship in a phase.
 *
 * The P2 import flow is the first: the brief's 28 items are fixed, and adding a
 * 29th to `SCREENS` would make the inventory test a lie. Extras are rendered by
 * the gallery under their own heading and are listed in the manifest separately.
 */
export const EXTRA_SCREENS: ScreenSpec[] = [
  {
    id: 'X1',
    slug: 'import-export',
    title: 'Import an export',
    kind: 'screen',
    tab: 'you',
    phase: 'P2',
    requires: [],
    states: ['default', 'empty'],
    rule: 'Preview first, then confirm; read one file at a time and refuse a file too large to read whole.',
    Component: ImportScreen,
  },
];

export const SCREENS: ScreenSpec[] = [
  { id: 'J1', slug: 'onboarding', title: 'Onboarding + privacy promise', kind: 'screen', phase: 'P1', requires: [], states: ['default'], rule: 'State the three promises before asking for anything.', Component: OnboardingScreen },
  { id: 'J2', slug: 'permission-primers', title: 'Permission primers (Usage access, notifications)', kind: 'screen', phase: 'P1', requires: [], states: ['default'], rule: 'Explain each permission before the OS dialog, and make "not now" as easy as "allow".', Component: PermissionPrimerScreen },
  { id: 'J3', slug: 'dashboard', title: 'Dashboard', kind: 'screen', tab: 'home', phase: 'P2', requires: ['D'], states: ['default', 'empty'], rule: 'The measured reference layout — and an honest empty state instead of estimates.', Component: HomeScreen },
  { id: 'J4', slug: 'interest-evolution', title: 'Interest Evolution', kind: 'screen', tab: 'journey', phase: 'P3', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Interest evolution is only shown when topic-level data exists.', Component: JourneyScreen },
  { id: 'J5', slug: 'depth', title: 'Depth', kind: 'screen', tab: 'insights', phase: 'P2', requires: ['D'], requiresAnyOf: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Show how long visits last, and refuse to call any visit good or wasted.', Component: DepthScreen },
  { id: 'J6', slug: 'curiosity-vs-habit', title: 'Curiosity vs Habit', kind: 'screen', tab: 'insights', phase: 'P2', requires: ['D'], requiresAnyOf: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Name both halves of the week without framing habit as a failure.', Component: CuriosityHabitScreen },
  { id: 'J7', slug: 'iqs', title: 'IQS', kind: 'screen', tab: 'insights', phase: 'P2', requires: ['D'], states: ['default', 'empty'], rule: 'A composite score built only from parts that exist, with the band shown.', Component: IqsScreen },
  { id: 'J8', slug: 'sessions', title: 'Sessions', kind: 'screen', tab: 'sessions', phase: 'P2', requires: ['D'], states: ['default', 'empty'], rule: 'The user annotates their own sessions; labels stay local and train a local model.', Component: SessionsScreen },
  { id: 'J9', slug: 'discovery-journey', title: 'Discovery Journey', kind: 'screen', tab: 'journey', phase: 'P3', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Show the route a topic was reached by, step by step, with the tier of each step.', Component: DiscoveryScreen },
  { id: 'J10', slug: 'behavior-profile', title: 'Behavior Profile', kind: 'screen', tab: 'you', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Descriptive traits with their evidence attached, never clinical labels.', Component: ProfileScreen },
  { id: 'J11', slug: 'rabbit-hole', title: 'Rabbit Hole', kind: 'screen', tab: 'journey', phase: 'P3', requires: ['D'], requiresAnyOf: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Print the definition, let the user change it, and never punish what it finds.', Component: RabbitHoleScreen },
  { id: 'J12', slug: 'weekly-report-goals', title: 'Weekly Report + Goals', kind: 'screen', tab: 'you', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'A local document plus goals the user set; no streaks, no nudges.', Component: WeeklyReportScreen },
  { id: 'J13', slug: 'connections', title: 'Connections / Consent Dashboard (with capability matrix)', kind: 'screen', tab: 'you', phase: 'P5', requires: [], states: ['default'], rule: 'Every source with its capability matrix and a one-tap revoke.', Component: ConnectionsScreen },
  { id: 'J14', slug: 'privacy-center', title: 'Privacy Center (network log, delete everything)', kind: 'screen', tab: 'you', phase: 'P5', requires: [], states: ['default', 'empty'], rule: 'Retention, the network log, deletion and the receipt — all checkable in-app.', Component: PrivacyCentreScreen },
  { id: 'J15', slug: 'public-profile-editor', title: 'Public Profile editor (live preview)', kind: 'screen', tab: 'you', phase: 'P6', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Edit what is published with a live preview of exactly what a match sees.', Component: PublicProfileScreen },
  { id: 'J16', slug: 'matches-chat', title: 'Matches / Chat', kind: 'screen', tab: 'you', phase: 'P6', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Social is off by default; chat shares nothing but what the user sent.', Component: MatchesScreen },
  { id: 'J17', slug: 'why-drawer', title: 'Why drawer', kind: 'sheet', parent: 'dashboard', phase: 'P2', requires: ['D'], states: ['default'], rule: 'Every number opens into the parts that produced it, and the parts add up.', Component: WhyDrawerSheet },
  { id: 'J18', slug: 'what-if', title: 'What-if Simulator', kind: 'screen', tab: 'insights', phase: 'P3', requires: ['D'], states: ['default', 'empty'], rule: 'Counterfactuals are calculations over your history, never predictions.', Component: WhatIfScreen },
  { id: 'J19', slug: 'attention-budget', title: 'Attention Budget', kind: 'screen', tab: 'you', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Budgets are chosen by the user and rendered as numbers, never alarms.', Component: BudgetScreen },
  { id: 'J20', slug: 'focus-windows', title: 'Focus Windows', kind: 'screen', tab: 'you', phase: 'P3', requires: ['D'], requiresAnyOf: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'Focus never blocks or shames; it repeats the choice you made.', Component: FocusScreen },
  { id: 'J21', slug: 'learning-arcs', title: 'Learning Arcs', kind: 'screen', tab: 'journey', phase: 'P3', requires: ['A', 'B', 'C'], states: ['default', 'empty'], rule: 'A stalled arc is reported exactly like a growing one.', Component: LearningArcsScreen },
  { id: 'J22', slug: 'ask-sheet', title: 'Ask sheet', kind: 'sheet', parent: 'dashboard', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'Answer from local data or refuse — never guess, never call out.', Component: AskSheet },
  { id: 'J23', slug: 'privacy-receipt', title: 'Privacy Receipt', kind: 'sheet', parent: 'privacy-center', phase: 'P5', requires: [], states: ['default', 'empty'], rule: 'What left the device, in bytes, with the empty case explained rather than hidden.', Component: PrivacyReceiptSheet },
  { id: 'J24', slug: 'persona-picker', title: 'Demo persona picker', kind: 'sheet', parent: 'dashboard', phase: 'P2', requires: [], states: ['default'], rule: 'Demo data replaces yours while it is on, and is never mixed with it.', Component: PersonaPickerSheet },
  { id: 'J25', slug: 'intent-check-settings', title: 'Intent Check settings', kind: 'screen', tab: 'you', phase: 'P3', requires: ['D'], states: ['default'], rule: 'The only place Mirror may interrupt, off unless asked for, with quiet hours.', Component: IntentCheckScreen },
  { id: 'J26', slug: 'share-card-preview', title: 'Private Share Card preview', kind: 'state', parent: 'weekly-report-goals', phase: 'P6', requires: ['D'], states: ['default'], rule: 'Preview the whole card; nothing is shared until the user shares it.', Component: ShareCardState },
  { id: 'J27', slug: 'home-widget', title: 'Home-screen widget', kind: 'widget', parent: 'dashboard', phase: 'P4', requires: ['D'], states: ['default', 'empty'], rule: 'A lock-screen surface: totals privately, published topics only in public.', Component: WidgetItem },
  { id: 'J28', slug: 'update-state', title: '"Update available / app version" state (calm, non-blocking)', kind: 'state', parent: 'dashboard', phase: 'P5', requires: [], states: ['default'], rule: 'Calm and non-blocking, and explicit that nothing new is collected.', Component: UpdateState },
];

export { TAB_ITEMS, TAB_ITEMS as TABS } from './tabs';
export { PERSONAS, NothingYet, Definition, ScoreBlock };
export type { Persona, ScreenProps, ScreenState };

export const screensByPhase = (phase: ScreenSpec['phase']) => SCREENS.filter((s) => s.phase === phase);
export const screensByKind = (kind: ScreenKind) => SCREENS.filter((s) => s.kind === kind);
export const screensByTab = (tab: string) => SCREENS.filter((s) => s.tab === tab);
export const specBySlug = (slug: string) => SCREENS.find((s) => s.slug === slug);
