/**
 * Number, duration and date formatting.
 *
 * These exist so screens cannot drift apart in how they say "2h 14m", and so the
 * *hedged* wordings the product requires ("about", "roughly") are attached to the
 * numbers that deserve them: everything derived from tier D usage data is an
 * estimate, and the copy says so.
 */
import type { DataTier } from './tiers.js';

const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');

/** 134 -> "2h 14m"; 47 -> "47m"; 0 -> "0m" (never "—", which reads as missing data). */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function clock(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

export function shortDay(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] as string;
}

export function relativeDay(date: Date | number, now: Date | number = Date.now()): string {
  const d = (typeof date === 'number' ? date : date.getTime()) as number;
  const n = (typeof now === 'number' ? now : now.getTime()) as number;
  const days = Math.floor((n - d) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/**
 * Attach the confidence wording to a number. Tier A/B values are counted; tier C
 * is measured with our own extension; tier D is inferred from usage, so it gets
 * a hedge word.
 */
export function hedged(value: string, tier: DataTier, kind: 'duration' | 'count' | 'score' = 'score'): string {
  if (tier === 'D') {
    if (kind === 'duration') return `about ${value}`;
    return `roughly ${value}`;
  }
  return value;
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** "3 sources · D + B" style standing line used under headers. */
export function tierSummary(tiers: DataTier[]): string {
  if (tiers.length === 0) return 'no sources yet';
  const order: DataTier[] = ['D', 'C', 'B', 'A'];
  return tiers.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(' + ');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
