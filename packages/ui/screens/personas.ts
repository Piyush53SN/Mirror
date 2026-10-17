/**
 * Demo personas.
 *
 * These are the *only* data in the design system, and they exist so that every
 * screen can be rendered in a state a real user could be in. Three personas, one
 * per data standing: tier D only, D+B+C, and all four tiers. A screen that cannot
 * be built from tiers the persona has must say so (see `DegradedNotice`); it may
 * never invent the missing signal.
 *
 * In the app this file is demo data behind the `demoPersona` flag; the numbers
 * here are plausible, not measured, and the UI never presents them as real.
 */
import type { DataTier } from '../src/tiers';

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
  /** Session-length bands. Tier D is enough for these — they are the honest floor. */
  depthBands: { label: string; share: number; note: string }[];
  /** Curiosity vs habit: the two halves of the same week. */
  curiosity: { deepHours: number; habitHours: number; switchesPerHour: number; note: string };
  /** The composite score, with the parts that produce it. */
  iqs: {
    value: number;
    band: string;
    parts: { label: string; points: number; max: number; tier: DataTier; detail: string }[];
    caveat: string;
  };
  /** Learning arcs: a topic followed over months, with what came next. */
  arcs: { topic: string; stage: string; weeks: number[]; next: string; sourceTier: string }[];
  /** How a topic was reached, step by step. Empty without tier A/B/C. */
  paths: { topic: string; steps: { step: string; tier: DataTier; when: string }[] }[];
  rabbit: { sessions: number; minutes: number; lateNightShare: number; example: string };
  goals: { label: string; progress: number; target: string; note: string }[];
  /** Privacy Mode means this list is empty by construction; Report Mode fills it. */
  networkLog: { when: string; host: string; bytes: number; why: string }[];
  intents: { label: string; ask: boolean; note: string }[];
  chat: { with: string; topic: string; messages: { from: 'you' | 'them'; text: string }[] } | null;
  update: { current: string; available: string; notes: string; bytes: number };
  /** The dashboard's headline number, explained part by part. */
  whyParts: { label: string; points: number; note: string; tier: DataTier }[];
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
    depthBands: [
      { label: 'under 8 s', share: 0.31, note: 'opens that were abandoned before anything could be read' },
      { label: '8 s – 1 min', share: 0.38, note: 'checks, replies, glancing' },
      { label: '1 – 5 min', share: 0.22, note: 'reading and watching' },
      { label: '5 – 20 min', share: 0.08, note: 'longer sittings' },
      { label: 'over 20 min', share: 0.01, note: 'rare, and mostly one app' },
    ],
    curiosity: { deepHours: 5.1, habitHours: 8.4, switchesPerHour: 38, note: 'Habit is the larger half. That is the whole finding, and no nudge was sent about it.' },
    iqs: {
      value: 41,
      band: 'usage-only band',
      parts: [
        { label: 'Session length mix', points: 14, max: 30, tier: 'D', detail: '31% of opens end under 8 seconds.' },
        { label: 'Deliberate share', points: 12, max: 25, tier: 'D', detail: 'From your own labels, not from content.' },
        { label: 'Switching pressure', points: 8, max: 20, tier: 'D', detail: '38 switches per hour, evening-weighted.' },
        { label: 'Late-night share', points: 7, max: 15, tier: 'D', detail: '36% after 11pm.' },
        { label: 'Topic depth', points: 0, max: 10, tier: 'A', detail: 'Not measured: needs topic data.' },
      ],
      caveat: 'The band is capped at 75 while topic depth is unmeasured. A score without its parts would be a horoscope.',
    },
    arcs: [],
    paths: [],
    rabbit: { sessions: 9, minutes: 118, lateNightShare: 0.38, example: 'Short-video sessions that restarted 5 times inside 20 minutes.' },
    goals: [
      { label: 'Short video under 60 min/day', progress: 0.62, target: '60 min/day', note: 'Set by you in week 38. Never shown as a streak.' },
      { label: 'Phone-free first hour', progress: 0.45, target: '5 days/week', note: 'Counted from launch timestamps, tier D.' },
    ],
    networkLog: [],
    intents: [
      { label: 'Short video', ask: true, note: 'Ask after 10 minutes in-app.' },
      { label: 'Social feed', ask: true, note: 'Ask after 5 minutes.' },
      { label: 'Messaging', ask: false, note: 'Never ask: it is a tool, not a habit.' },
    ],
    chat: null,
    update: { current: '0.1.0', available: '0.2.0', notes: 'Adds focus windows and a smaller widget. Nothing new is collected, and no permission is added.', bytes: 8_400_000 },
    whyParts: [
      { label: 'Yesterday, before 8pm', points: 52, note: 'from foreground time', tier: 'D' },
      { label: 'Evening block', points: 41, note: 'after 8pm, 3 sessions', tier: 'D' },
      { label: 'Late-night block', points: 33, note: 'after 11pm, 1 session', tier: 'D' },
    ],
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
    depthBands: [
      { label: 'under 8 s', share: 0.19, note: 'mostly feed opens' },
      { label: '8 s – 1 min', share: 0.29, note: 'checks and skims' },
      { label: '1 – 5 min', share: 0.31, note: 'reading, watching' },
      { label: '5 – 20 min', share: 0.16, note: 'sittings with a subject' },
      { label: 'over 20 min', share: 0.05, note: 'long reads and lectures' },
    ],
    curiosity: { deepHours: 9.8, habitHours: 5.2, switchesPerHour: 21, note: 'Curiosity is ahead, and the shallow tail is concentrated in one app.' },
    iqs: {
      value: 67,
      band: 'measured band',
      parts: [
        { label: 'Session length mix', points: 22, max: 30, tier: 'D', detail: 'Only 19% of opens end under 8 seconds.' },
        { label: 'Deliberate share', points: 18, max: 25, tier: 'D', detail: 'From your labels.' },
        { label: 'Switching pressure', points: 13, max: 20, tier: 'D', detail: '21 switches per hour.' },
        { label: 'Late-night share', points: 6, max: 15, tier: 'D', detail: '23% after 11pm.' },
        { label: 'Topic depth', points: 8, max: 10, tier: 'C', detail: 'Three topics above depth 40, two still growing.' },
      ],
      caveat: 'Computed only from parts that exist. The topic part uses tier B/C data and names which.',
    },
    arcs: [
      { topic: 'Film photography', stage: 'practising', weeks: [8, 14, 21, 33, 44, 58, 71, 78], next: 'Darkroom printing — three sources followed, none opened yet.', sourceTier: 'B+C' },
      { topic: 'Rust programming', stage: 'learning', weeks: [3, 9, 18, 27, 38, 47, 58, 64], next: 'Ownership chapter, revisited twice.', sourceTier: 'C' },
      { topic: 'Urban gardening', stage: 'stalled', weeks: [22, 30, 39, 44, 41, 39, 40, 41], next: 'No new sources since week 44.', sourceTier: 'B' },
    ],
    paths: [
      {
        topic: 'Film photography',
        steps: [
          { step: 'Search: "how to meter for black and white"', tier: 'C', when: '6 weeks ago' },
          { step: 'Article: zone system explained', tier: 'C', when: '6 weeks ago' },
          { step: 'Video: developing at home, 24 min watched to 92%', tier: 'C', when: '5 weeks ago' },
          { step: 'Saved: developer chemistry list', tier: 'A', when: '2 weeks ago' },
        ],
      },
      {
        topic: 'Rust programming',
        steps: [
          { step: 'Search: "rust borrow checker explained"', tier: 'C', when: '3 weeks ago' },
          { step: 'Docs pages: 14 opened, 6 read past halfway', tier: 'C', when: '3 weeks ago' },
          { step: 'Community post answered', tier: 'A', when: '1 week ago' },
        ],
      },
    ],
    rabbit: { sessions: 6, minutes: 74, lateNightShare: 0.29, example: 'A 41-minute stretch that alternated Shorts and the feed 12 times.' },
    goals: [
      { label: 'Short video under 30 min/day', progress: 0.79, target: '30 min/day', note: 'You raised this yourself after three weeks under it.' },
      { label: 'One long read a day', progress: 0.86, target: '6 days/week', note: 'Measured as a session over 8 minutes with a topic attached.' },
    ],
    networkLog: [
      { when: '3 days ago', host: 'www.googleapis.com (YouTube Data API)', bytes: 2_140, why: 'Subscription list, narrowest scope, read-only.' },
      { when: '9 days ago', host: 'oauth.reddit.com', bytes: 1_870, why: 'Saved posts, after you connected it.' },
    ],
    intents: [
      { label: 'Short video', ask: true, note: 'Ask after 10 minutes in-app.' },
      { label: 'Long reads', ask: false, note: 'Never interrupt a long read.' },
      { label: 'Communities', ask: true, note: 'Ask after 20 minutes.' },
    ],
    chat: {
      with: 'Sam · matched on film photography',
      topic: 'Film photography',
      messages: [
        { from: 'them', text: 'Your arc shows darkroom printing next — did you ever try it?' },
        { from: 'you', text: 'Not yet. Mirror says I have followed three sources and opened none.' },
        { from: 'them', text: 'Mine said the same thing about cyanotypes.' },
      ],
    },
    update: { current: '0.1.0', available: '0.2.0', notes: 'Adds focus windows and a smaller widget. Nothing new is collected, and no permission is added.', bytes: 8_400_000 },
    whyParts: [
      { label: 'Yesterday, before 8pm', points: 61, note: 'from foreground time', tier: 'D' },
      { label: 'Evening block', points: 34, note: 'after 8pm, 2 sessions', tier: 'D' },
      { label: 'Late-night block', points: 12, note: 'after 11pm, 1 session', tier: 'D' },
    ],
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
      { label: 'Short video', target: 20, actual: 11, unit: 'min/day' },
      { label: 'Deep reading', target: 60, actual: 74, unit: 'min/day' },
    ],
    traits: [
      { label: 'Long-form preference', value: 'Average session 24 minutes', evidence: 'Session lengths across tiers A/B/C/D.' },
      { label: 'Low late-night use', value: '8% after 11 pm', evidence: 'Timestamps, tier D.' },
    ],
    askable: ['What did I learn about this month?', 'Which sources did I actually open?'],
    depthBands: [
      { label: 'under 8 s', share: 0.11, note: 'almost all of it is one app' },
      { label: '8 s – 1 min', share: 0.22, note: 'checks, replies' },
      { label: '1 – 5 min', share: 0.27, note: 'reading' },
      { label: '5 – 20 min', share: 0.28, note: 'papers, lectures, long reads' },
      { label: 'over 20 min', share: 0.12, note: 'sittings with a subject and a question' },
    ],
    curiosity: { deepHours: 12.4, habitHours: 2.9, switchesPerHour: 14, note: 'Deep work dominates. Mirror says so once and then stays quiet.' },
    iqs: {
      value: 82,
      band: 'measured band',
      parts: [
        { label: 'Session length mix', points: 27, max: 30, tier: 'D', detail: '11% of opens end under 8 seconds.' },
        { label: 'Deliberate share', points: 21, max: 25, tier: 'D', detail: 'From your labels.' },
        { label: 'Switching pressure', points: 17, max: 20, tier: 'D', detail: '14 switches per hour.' },
        { label: 'Late-night share', points: 12, max: 15, tier: 'D', detail: '8% after 11pm.' },
        { label: 'Topic depth', points: 5, max: 10, tier: 'A', detail: 'Four topics followed; two went past depth 60.' },
      ],
      caveat: 'The parts are all measured here. The band tops out at 85: the last points would need content quality, which Mirror cannot judge.',
    },
    arcs: [
      { topic: 'Astronomy', stage: 'deep', weeks: [18, 26, 34, 47, 55, 62, 74, 81], next: 'Stellar spectra — an instrument project, two sources opened.', sourceTier: 'A+C' },
      { topic: 'Urban gardening', stage: 'practising', weeks: [30, 36, 42, 50, 57, 61, 64, 66], next: 'Composting, read consistently for 6 weeks.', sourceTier: 'B' },
      { topic: 'Rust programming', stage: 'learning', weeks: [12, 20, 31, 40, 49, 54, 57, 58], next: 'Async chapter, slowing down.', sourceTier: 'C' },
      { topic: 'Film photography', stage: 'starting', weeks: [2, 6, 11, 17, 23, 29, 33, 37], next: 'Metering basics.', sourceTier: 'B' },
    ],
    paths: [
      {
        topic: 'Astronomy',
        steps: [
          { step: 'Saved: ESA press release on a comet', tier: 'A', when: '9 weeks ago' },
          { step: 'Docs/reference: orbital mechanics primer, 31 min', tier: 'C', when: '8 weeks ago' },
          { step: 'Live stream watched to 94%', tier: 'C', when: '4 weeks ago' },
          { step: 'Subscription: an instrument channel', tier: 'A', when: '1 week ago' },
        ],
      },
      {
        topic: 'Urban gardening',
        steps: [
          { step: 'Imported Takeout: 12 gardening videos', tier: 'B', when: '14 weeks ago' },
          { step: 'Community thread read for 9 minutes', tier: 'A', when: '7 weeks ago' },
          { step: 'Saved: composting ratios', tier: 'A', when: '3 weeks ago' },
        ],
      },
    ],
    rabbit: { sessions: 2, minutes: 21, lateNightShare: 0.05, example: 'One 14-minute feed drift after a film photography post.' },
    goals: [
      { label: 'Short video under 20 min/day', progress: 0.93, target: '20 min/day', note: 'Quietly met for 5 of 6 weeks.' },
      { label: 'One long read a day', progress: 0.88, target: '6 days/week', note: 'Defined as a session over 8 minutes with a topic attached.' },
      { label: 'Two phone-free evenings', progress: 0.5, target: '2/week', note: 'Counted from launch timestamps.' },
    ],
    networkLog: [
      { when: 'yesterday', host: 'www.googleapis.com (YouTube Data API)', bytes: 3_980, why: 'Watch-history import, user-initiated.' },
      { when: '4 days ago', host: 'reddit.com/api/v1', bytes: 2_260, why: 'Saved posts, read-only scope.' },
      { when: '11 days ago', host: 'mirror.example (update check)', bytes: 640, why: 'Version manifest only. Disabled when the backend is off.' },
    ],
    intents: [
      { label: 'Short video', ask: true, note: 'Ask after 10 minutes in-app.' },
      { label: 'Social feed', ask: false, note: 'Off: you asked to be left alone on this one.' },
      { label: 'Research browsing', ask: false, note: 'Never ask during long-form reading.' },
    ],
    chat: {
      with: 'Ana · matched on astronomy',
      topic: 'Astronomy',
      messages: [
        { from: 'you', text: 'Your arc says stellar spectra. Mine is still on orbital mechanics.' },
        { from: 'them', text: 'Same instrument project, different week. No streaks here, so we can just talk.' },
      ],
    },
    update: { current: '0.1.0', available: '0.2.0', notes: 'Adds focus windows and a smaller widget. Nothing new is collected, and no permission is added.', bytes: 8_400_000 },
    whyParts: [
      { label: 'Yesterday, before 8pm', points: 74, note: 'from foreground time', tier: 'D' },
      { label: 'Evening block', points: 52, note: 'after 8pm, 2 sessions', tier: 'D' },
      { label: 'Late-night block', points: 8, note: 'after 11pm, 1 session', tier: 'D' },
    ],
  },
];

export const personaById = (id: string): Persona => {
  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`unknown persona "${id}" (known: ${PERSONAS.map((p) => p.id).join(', ')})`);
  return persona;
};
