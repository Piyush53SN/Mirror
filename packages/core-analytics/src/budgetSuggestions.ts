/**
 * P4.4a — Budget suggestions inside the weekly report (Tier D, local only).
 *
 * Mirror never creates a budget on its own. A suggestion is a question shown as
 * "Set a 1h budget?" with Accept / Dismiss. Accepting is the only path that
 * writes a budget, and that happens in the UI on a tap.
 *
 * Rules:
 *   1. Source: per-app DAY-CLIPPED foreground totals over the last 7 local days
 *      (never merged sitting spans).
 *   2. Only recorded days count. The average divides by recorded days inside the
 *      window, never by 7 when history is partial. Below
 *      `BUDGET_SUGGESTION_MIN_RECORDED_DAYS` nothing is suggested.
 *   3. The suggested limit is the average rounded to the nearest 15 minutes, and
 *      it must be at least 30 minutes.
 *   4. Skipped: apps that already have an enabled budget, shared excluded/launcher
 *      packages, and apps dismissed less than 7 days ago.
 *   5. Up to `BUDGET_SUGGESTION_MAX_ITEMS` (3) suggestions are returned, strongest
 *      average first. Each one is accepted or dismissed separately.
 *   6. Neutral copy only. No streaks, no red, no guilt, no "exceeded" framing.
 */

import type { BudgetDayForegroundInput } from './budgets';
import { formatDurationShort } from './scoring';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export const BUDGET_SUGGESTION_WINDOW_DAYS = 7;
export const BUDGET_SUGGESTION_MIN_RECORDED_DAYS = 3;
export const BUDGET_SUGGESTION_MIN_LIMIT_MS = 30 * MINUTE_MS;
export const BUDGET_SUGGESTION_ROUND_MS = 15 * MINUTE_MS;
/** A dismissed suggestion does not return for this long. */
export const BUDGET_SUGGESTION_DISMISS_MS = 7 * DAY_MS;
export const BUDGET_SUGGESTION_MAX_ITEMS = 3;

export type BudgetSuggestion = {
  /** Package the suggested budget would cover (one app). */
  app: string;
  label: string;
  /** Day-clipped average over recorded days in the window (ms). */
  averageMs: number;
  /** Suggested daily soft limit (ms), rounded to 15 minutes. */
  suggestedLimitMs: number;
  recordedDays: number;
  title: string;
  body: string;
};

export type BudgetSuggestionInput = {
  endDay: string;
  dayTotals: readonly BudgetDayForegroundInput[];
  recordedDays: readonly string[];
  /** Packages already covered by an enabled budget (skipped). */
  existingBudgetPackages?: readonly string[];
  /** Shared excluded / launcher packages (skipped). */
  ignorePackages?: readonly string[];
  /** Dismissal timestamps keyed by package. */
  dismissals?: Readonly<Record<string, number>>;
  nowMs: number;
  appLabels?: Readonly<Record<string, string>>;
  /** 1..3, default 3. */
  maxSuggestions?: 1 | 2 | 3;
};

function shiftDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split('-').map((n) => Number(n));
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + deltaDays * DAY_MS;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** The 7 local day keys ending on (and including) `endDay`. */
export function budgetSuggestionWindowDays(endDay: string): string[] {
  const out: string[] = [];
  for (let i = BUDGET_SUGGESTION_WINDOW_DAYS - 1; i >= 0; i -= 1) out.push(shiftDay(endDay, -i));
  return out;
}

export function roundToSuggestionStep(ms: number): number {
  return Math.round(ms / BUDGET_SUGGESTION_ROUND_MS) * BUDGET_SUGGESTION_ROUND_MS;
}

export function suggestBudgets(input: BudgetSuggestionInput): BudgetSuggestion[] {
  const windowDays = new Set(budgetSuggestionWindowDays(input.endDay));
  const recorded = new Set(input.recordedDays.filter((d) => windowDays.has(d)));
  if (recorded.size < BUDGET_SUGGESTION_MIN_RECORDED_DAYS) return [];

  const covered = new Set(input.existingBudgetPackages ?? []);
  const ignored = new Set(input.ignorePackages ?? []);
  const dismissals = input.dismissals ?? {};

  // Sum day-clipped totals per app over recorded days inside the window only.
  const sums = new Map<string, number>();
  for (const entry of input.dayTotals) {
    if (!windowDays.has(entry.day) || !recorded.has(entry.day)) continue;
    for (const row of entry.totals) {
      if (!row.app || !Number.isFinite(row.totalMs) || row.totalMs <= 0) continue;
      sums.set(row.app, (sums.get(row.app) ?? 0) + row.totalMs);
    }
  }

  const candidates: BudgetSuggestion[] = [];
  for (const [app, sumMs] of sums) {
    if (covered.has(app) || ignored.has(app)) continue;
    const dismissedAt = dismissals[app];
    if (typeof dismissedAt === 'number' && input.nowMs - dismissedAt < BUDGET_SUGGESTION_DISMISS_MS) continue;
    const averageMs = sumMs / recorded.size;
    const suggestedLimitMs = roundToSuggestionStep(averageMs);
    if (suggestedLimitMs < BUDGET_SUGGESTION_MIN_LIMIT_MS) continue;
    const label = input.appLabels?.[app] ?? app;
    const limitLabel = formatDurationShort(suggestedLimitMs);
    candidates.push({
      app,
      label,
      averageMs: Math.round(averageMs),
      suggestedLimitMs,
      recordedDays: recorded.size,
      title: `Set a ${limitLabel} budget?`,
      body: `${label} averaged ${formatDurationShort(averageMs)} a day over ${recorded.size} recorded days (day-clipped foreground). A soft reference only. Nothing is created unless you tap Accept.`,
    });
  }

  candidates.sort((a, b) => b.averageMs - a.averageMs || a.app.localeCompare(b.app));
  const requested = Math.floor(input.maxSuggestions ?? BUDGET_SUGGESTION_MAX_ITEMS);
  const cap = Math.max(1, Math.min(BUDGET_SUGGESTION_MAX_ITEMS, requested));
  return candidates.slice(0, cap);
}
