/**
 * Demo signals → the real scoring engine.
 *
 * The screens must not carry their own arithmetic: a number that is printed in a
 * mockup and a number the app computes will drift, and the drift is invisible
 * until a reviewer compares two screens. So the personas keep only *inputs* —
 * the shape of their week and how they label it — and every score on screen comes
 * from `@mirror/core-analytics/scoring`.
 *
 * The events are synthetic, deterministic and labelled as demo data by the screen
 * chrome (the "Demo data · persona" chip). They are plausible, not measured, and
 * the app never presents them as a real person's week.
 */
import type { Confidence, CuriositySplit, DepthBand, IntentLabel, Score, ScoreInput } from '@mirror/core-analytics';
import { curiositySplit, scoreIqs, sessionBands } from '@mirror/core-analytics';
import type { Persona } from './personas';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A week that starts on a Sunday, so "last 7 days" and the demo agree. */
export const DEMO_WEEK_START = Date.parse('2026-10-11T00:00:00Z');
export const DEMO_WINDOW = { fromMs: DEMO_WEEK_START, toMs: DEMO_WEEK_START + 7 * DAY };
export const DEMO_SESSION_COUNT = 280;

/** Deterministic PRNG: the same persona always renders the same week. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const seedOf = (id: string) => [...id].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 2166136261);

const BAND_MS = [4_000, 30_000, 3 * MINUTE, 12 * MINUTE, 30 * MINUTE];
const BAND_NOTE: Record<string, string> = {
  'under-8s': 'opens that were abandoned before anything could be read',
  '8s-1m': 'checks, replies, glancing',
  '1-5m': 'reading and watching',
  '5-20m': 'longer sittings',
  'over-20m': 'rare, and mostly one app',
};

/** The bands with the copy the Depth screen prints. */
export function demoBands(persona: Persona): (DepthBand & { note: string })[] {
  return sessionBands(demoSessions(persona)).map((band) => ({ ...band, note: BAND_NOTE[band.id] ?? '' }));
}

/**
 * Build the persona's week from the shares it already declares.
 *
 * Sessions are laid out across seven days so that the late-night share of *time*
 * matches the persona, because that is the only placement the score reads. The
 * rest is spread through the day; overlaps are harmless (the engine sorts by
 * start and only counts app changes within the day's sitting).
 */
export function demoSessions(persona: Persona) {
  const random = mulberry32(seedOf(persona.id));
  const sessions: { id: string; app: string; startMs: number; endMs: number }[] = [];
  const apps = ['com.google.android.youtube', 'com.instagram.android', 'com.whatsapp', 'com.android.chrome'];

  const totalTarget = persona.depthBands.reduce((sum, band, index) => sum + band.share * BAND_MS[index]!, 0) * DEMO_SESSION_COUNT;
  const lateTarget = totalTarget * Math.min(0.9, Math.max(0, persona.curiosity.lateNightShare));
  let lateUsed = 0;
  let id = 0;

  for (let day = 0; day < 7; day += 1) {
    const dayStart = DEMO_WEEK_START + day * DAY;
    persona.depthBands.forEach((band, index) => {
      const count = Math.round((band.share * DEMO_SESSION_COUNT) / 7);
      for (let n = 0; n < count; n += 1) {
        const duration = BAND_MS[index] ?? 30_000;
        const isLate = lateTarget - lateUsed >= duration && duration > 0;
        const startMs = isLate
          ? dayStart + 23 * HOUR + 5 * MINUTE + Math.round((lateUsed % (50 * MINUTE)) / MINUTE) * MINUTE
          : dayStart + 8 * HOUR + Math.round((n / Math.max(1, count)) * 13 * HOUR) + Math.round(random() * 4) * MINUTE;
        if (isLate) lateUsed += duration;
        sessions.push({
          id: `ses_demo_${String(id).padStart(3, '0')}`,
          app: apps[Math.floor(random() * apps.length)] ?? apps[0]!,
          startMs: Math.min(startMs, DEMO_WINDOW.toMs - duration - 1),
          endMs: Math.min(startMs, DEMO_WINDOW.toMs - duration - 1) + duration,
        });
        id += 1;
      }
    });
  }
  return sessions;
}

/** Labels the persona applied to their own sittings: deterministic, and enough to score. */
export function demoLabels(persona: Persona, sessions: ReturnType<typeof demoSessions>): IntentLabel[] {
  const labelled = sessions.filter((_, index) => index % 3 === 0).slice(0, 60);
  const totalMs = labelled.reduce((sum, session) => sum + (session.endMs - session.startMs), 0);
  const targetIntentionalMs = totalMs * persona.intentionalShare;
  // The persona's share is a share of *time*, so the labels are assigned to hit
  // that time, not a count: otherwise a 30-minute sitting would weigh the same as
  // a 4-second open and "deliberate share" would quietly become "deliberate opens".
  const order = [...labelled].sort((a, b) => {
    const ha = seedOf(a.id) % 1000;
    const hb = seedOf(b.id) % 1000;
    return ha - hb || a.id.localeCompare(b.id);
  });
  let intentionalMs = 0;
  const intentionalIds = new Set<string>();
  for (const session of order) {
    const duration = session.endMs - session.startMs;
    if (intentionalMs + duration <= targetIntentionalMs) {
      intentionalIds.add(session.id);
      intentionalMs += duration;
    }
  }
  return labelled.map((session) => ({ sessionId: session.id, label: intentionalIds.has(session.id) ? 'intentional' : 'mindless' }));
}

export type DemoSignals = {
  input: ScoreInput;
  iqs: Score;
  bands: (DepthBand & { note: string })[];
  curiosity: CuriositySplit | null;
  confidence: Confidence;
};

/**
 * Rendering must not rebuild a week. The demo is deterministic, so the result is
 * cached by persona id: a screen can call `demoScores` as often as it likes and
 * pay for the engine once. (On a device the same rule is stronger: scoring runs
 * off the UI thread and the screen reads the stored result.)
 */
const CACHE = new Map<string, DemoSignals>();

export function demoScores(persona: Persona): DemoSignals {
  const cached = CACHE.get(persona.id);
  if (cached) return cached;
  const sessions = demoSessions(persona);
  const labels = demoLabels(persona, sessions);
  const input: ScoreInput = {
    window: DEMO_WINDOW,
    sessions,
    labels,
    // Demo weeks have no collection gaps: the chip says the data is demo, and a
    // fake gap would teach the reviewer the wrong thing about confidence.
    gaps: [],
    utcOffsetMinutes: 0,
  };
  const iqs = scoreIqs(input);
  const result: DemoSignals = { input, iqs, bands: demoBands(persona), curiosity: curiositySplit(input), confidence: iqs.confidence };
  CACHE.set(persona.id, result);
  return result;
}
