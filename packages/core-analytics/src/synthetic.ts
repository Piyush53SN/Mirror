/**
 * The synthetic dataset.
 *
 * Every layer above the schema is developed and tested against generated data, so
 * the generator has two jobs: be deterministic (same seed, same bytes) and produce
 * only events that pass `validateEvent`. If the generator can produce an invalid
 * event, the schema is not the contract we think it is.
 *
 * The data is plausible rather than realistic: app mix, evening weighting,
 * short-video habits and a long tail of reads. It is labelled demo data everywhere
 * it is rendered, and it never touches storage.
 */
import { assertEvent } from '@mirror/shared-types';
import type { MirrorEvent, DataTier } from '@mirror/shared-types';

/** Deterministic PRNG (mulberry32). Same seed → same sequence, on every platform. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SyntheticPersona = {
  id: 'ananya' | 'rehan' | 'mei';
  tiers: DataTier[];
  /** Relative weight per app: how often a sitting starts there. */
  appMix: { app: string; weight: number; sittingMs: [number, number] }[];
};

export const SYNTHETIC_PERSONAS: Record<SyntheticPersona['id'], SyntheticPersona> = {
  ananya: {
    id: 'ananya',
    tiers: ['D'],
    appMix: [
      { app: 'com.google.android.youtube', weight: 0.38, sittingMs: [20_000, 9 * 60_000] },
      { app: 'com.instagram.android', weight: 0.27, sittingMs: [8_000, 6 * 60_000] },
      { app: 'com.whatsapp', weight: 0.22, sittingMs: [15_000, 3 * 60_000] },
      { app: 'com.android.chrome', weight: 0.13, sittingMs: [30_000, 12 * 60_000] },
    ],
  },
  rehan: {
    id: 'rehan',
    tiers: ['D', 'C', 'B'],
    appMix: [
      { app: 'com.google.android.youtube', weight: 0.34, sittingMs: [15_000, 14 * 60_000] },
      { app: 'com.reddit.android', weight: 0.24, sittingMs: [10_000, 8 * 60_000] },
      { app: 'com.android.chrome', weight: 0.22, sittingMs: [40_000, 20 * 60_000] },
      { app: 'com.instagram.android', weight: 0.2, sittingMs: [6_000, 5 * 60_000] },
    ],
  },
  mei: {
    id: 'mei',
    tiers: ['D', 'C', 'B', 'A'],
    appMix: [
      { app: 'com.android.chrome', weight: 0.36, sittingMs: [60_000, 30 * 60_000] },
      { app: 'tv.twitch.android.app', weight: 0.26, sittingMs: [60_000, 25 * 60_000] },
      { app: 'com.reddit.android', weight: 0.2, sittingMs: [20_000, 9 * 60_000] },
      { app: 'com.instagram.android', weight: 0.18, sittingMs: [6_000, 4 * 60_000] },
    ],
  },
};

export type GenerateOptions = {
  persona: SyntheticPersona['id'] | SyntheticPersona;
  /** Seed makes the output reproducible; the same seed is used by every test. */
  seed?: number;
  /** Days back from `endDate` (inclusive). */
  days?: number;
  /** The last day generated, ISO date. Fixed by default so tests are stable. */
  endDate?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
};

/**
 * Generate `days` of events for one persona.
 *
 * The generator emits foreground/background pairs, plus tier-B/C events when the
 * persona has those tiers — so a generator bug cannot quietly produce a tier-C
 * event for a tier-D persona.
 */
export function generateEvents(options: GenerateOptions): MirrorEvent[] {
  const persona = typeof options.persona === 'string' ? SYNTHETIC_PERSONAS[options.persona] : options.persona;
  const seed = options.seed ?? 20261017;
  const days = options.days ?? 14;
  const end = Date.parse(`${options.endDate ?? '2026-10-16'}T00:00:00Z`);
  const random = rng(seed);
  const events: MirrorEvent[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${String(++seq).padStart(8, '0')}`;

  const totalWeight = persona.appMix.reduce((a, b) => a + b.weight, 0);
  const pickApp = () => {
    let r = random() * totalWeight;
    for (const entry of persona.appMix) {
      r -= entry.weight;
      if (r <= 0) return entry;
    }
    return persona.appMix[persona.appMix.length - 1]!;
  };

  for (let day = days - 1; day >= 0; day--) {
    const dayStart = end - day * 86_400_000;
    // 4–14 sittings a day, weighted toward the evening.
    const sittings = 4 + Math.floor(random() * 11);
    let cursor = dayStart + (7 + random() * 4) * 3_600_000;
    for (let i = 0; i < sittings; i++) {
      const entry = pickApp();
      const evening = random() < 0.45 ? 13 : 9; // more use after 8pm
      cursor += (1 + random() * 2.5) * 3_600_000 * (random() < 0.5 ? 1 : evening / 9);
      if (cursor > dayStart + 23.5 * 3_600_000) break;
      const [min, max] = entry.sittingMs;
      const duration = Math.round(min + random() * (max - min));
      const at = dayStart + (cursor - dayStart);
      const startIso = iso(at);
      const endIso = iso(at + duration);
      events.push({ schemaVersion: 1, id: id('evt'), kind: 'app_foreground', at: startIso, tier: 'D', origin: 'os', content: 'metadata', app: entry.app });
      events.push({ schemaVersion: 1, id: id('evt'), kind: 'app_background', at: endIso, tier: 'D', origin: 'os', content: 'metadata', app: entry.app, durationMs: duration });

      // Tier C: a browser visit with a search, only for personas that have C.
      if (persona.tiers.includes('C') && entry.app === 'com.android.chrome' && random() < 0.7) {
        const hosts = ['arxiv.org', 'youtube.com', 'developer.mozilla.org', 'en.wikipedia.org'];
        events.push({
          schemaVersion: 1,
          id: id('evt'),
          kind: 'web_visit',
          at: startIso,
          tier: 'C',
          origin: 'extension',
          content: 'content',
          consent: `grant_extension_${persona.id}`,
          host: hosts[Math.floor(random() * hosts.length)]!,
          durationMs: duration,
          scrollDepth: Number(random().toFixed(2)),
          ...(random() < 0.5 ? { query: ['borrow checker', 'zone system', 'stellar spectra', 'composting ratio'][Math.floor(random() * 4)]! } : {}),
        });
      }
      // Tier B: an imported item, only for personas that have B.
      if (persona.tiers.includes('B') && random() < 0.12) {
        events.push({
          schemaVersion: 1,
          id: id('evt'),
          kind: 'import_item',
          at: startIso,
          tier: 'B',
          origin: 'export',
          content: 'content',
          consent: `grant_takeout_${persona.id}`,
          sourceId: 'youtube',
          exportFormat: 'takeout',
          subject: ['film photography', 'rust programming', 'urban gardening'][Math.floor(random() * 3)]!,
        });
      }
      // Tier A: an API item, only for personas that have A.
      if (persona.tiers.includes('A') && random() < 0.08) {
        events.push({
          schemaVersion: 1,
          id: id('evt'),
          kind: 'api_item',
          at: startIso,
          tier: 'A',
          origin: 'api',
          content: 'content',
          consent: `grant_reddit_${persona.id}`,
          sourceId: 'reddit',
          action: 'saved',
          subject: 'astronomy',
        });
      }
      cursor += duration;
    }
    // A couple of unlocks, tier D.
    for (let u = 0; u < 3; u++) {
      events.push({ schemaVersion: 1, id: id('evt'), kind: 'device_unlock', at: iso(dayStart + (7 + random() * 16) * 3_600_000), tier: 'D', origin: 'os', content: 'metadata' });
    }
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.kind.localeCompare(b.kind));
  // The generator validates its own output: an invalid synthetic event would make
  // every downstream test a test of the wrong contract.
  for (const event of events) assertEvent(event);
  return events;
}
