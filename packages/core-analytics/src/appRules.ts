/**
 * App rules (P4.4b): a user can mark an app once as "always intentional" or
 * "always mindless". Sittings of that app that the user has not labelled
 * themselves then count as that label, shown as *the user's rule*.
 *
 * Honesty rules (Tier D):
 *   - A rule is the user's own explicit statement. Mirror never infers intent
 *     from duration, time of day, or app category; a rule is the only source.
 *   - A per-sitting label always wins over a rule, including `unsure`.
 *   - Rules never write to stored `intent_label` events, so past per-sitting
 *     labels are never changed. Rules only fill in sittings with no label.
 *   - Rules never apply to labeling-excluded apps (launchers, galleries,
 *     installers, system UI), even if a stored rule names one.
 */
import { isLabelingExcludedApp } from './usage';
import type { IntentLabel } from './scoring';

export type AppRuleLabel = 'intentional' | 'mindless';
export type IntentLabelValue = 'intentional' | 'mindless' | 'unsure';

export type AppRule = {
  app: string;
  label: AppRuleLabel;
  /** When the user set the rule (epoch ms). */
  setAtMs: number;
};

export type AppRuleMap = Readonly<Record<string, { label: AppRuleLabel; setAtMs: number }>>;

export type AppRuleSittingInput = { id: string; app: string };

export type AppRuleResolution = {
  /** Effective label per sitting id: the user's sitting label, else the app rule. */
  labels: Record<string, IntentLabelValue>;
  /** Sitting ids whose effective label came from an app rule. */
  ruleSourceIds: Set<string>;
  /** Per app with a rule: how many sittings the rule covers and how many keep their own label. */
  coverage: Record<string, AppRuleCoverage>;
};

export type AppRuleCoverage = {
  label: AppRuleLabel;
  /** Sittings of this app with no sitting label; the rule applies to these. */
  ruleSittings: number;
  /** Sittings of this app that already have their own label; those labels win. */
  keptOwnLabels: number;
};

/** Upper bound on stored rules. Keeps the sealed payload small. */
export const APP_RULES_MAX = 200;

/** Plain-language definition for the UI. */
export const APP_RULE_DEFINITION =
  'Your rule: sittings of this app count as the label you chose, unless you label a sitting yourself. Mirror does not guess from how long you used it.';

export function isAppRuleLabel(value: unknown): value is AppRuleLabel {
  return value === 'intentional' || value === 'mindless';
}

/**
 * Resolve effective intent labels. Pure: inputs are not mutated. Duration,
 * timing and app category are never read.
 */
export function resolveIntentLabels(input: {
  sessions: readonly AppRuleSittingInput[];
  sittingLabels: Readonly<Record<string, IntentLabelValue>>;
  rules: AppRuleMap;
  ignorePackages?: Iterable<string>;
}): AppRuleResolution {
  const labels: Record<string, IntentLabelValue> = { ...input.sittingLabels };
  const ruleSourceIds = new Set<string>();
  const coverage: Record<string, AppRuleCoverage> = {};
  const ignore = input.ignorePackages ? [...input.ignorePackages] : undefined;

  for (const [app, rule] of Object.entries(input.rules)) {
    if (!isAppRuleLabel(rule?.label)) continue;
    if (isLabelingExcludedApp(app, undefined, ignore)) continue;
    coverage[app] = { label: rule.label, ruleSittings: 0, keptOwnLabels: 0 };
  }

  for (const s of input.sessions) {
    const cov = coverage[s.app];
    if (!cov) continue;
    const own = input.sittingLabels[s.id];
    if (own !== undefined) {
      cov.keptOwnLabels += 1;
      continue;
    }
    labels[s.id] = cov.label;
    ruleSourceIds.add(s.id);
    cov.ruleSittings += 1;
  }

  return { labels, ruleSourceIds, coverage };
}

/**
 * The label list every engine receives. Rule-derived entries carry `source: 'rule'`
 * so `countExplicitLabels` can apply the rule gate. Sitting labels stay `sitting`.
 */
export function toIntentLabelList(resolution: AppRuleResolution): IntentLabel[] {
  return Object.entries(resolution.labels).map(([sessionId, label]) => ({
    sessionId,
    label,
    source: resolution.ruleSourceIds.has(sessionId) ? 'rule' : 'sitting',
  }));
}

/** One-sentence note for the UI about what a rule currently covers. Never reports a guess. */
export function describeRuleCoverage(app: string, cov: AppRuleCoverage | undefined): string {
  if (!cov) return `No rule for ${app}.`;
  const kind = cov.label === 'intentional' ? 'intentional' : 'mindless';
  const covered =
    cov.ruleSittings === 0
      ? 'No unlabeled sittings of this app yet.'
      : `Counts ${cov.ruleSittings} unlabeled ${cov.ruleSittings === 1 ? 'sitting' : 'sittings'} (including earlier days) as ${kind}.`;
  const kept =
    cov.keptOwnLabels > 0
      ? ` ${cov.keptOwnLabels} ${cov.keptOwnLabels === 1 ? 'sitting keeps' : 'sittings keep'} your own label.`
      : '';
  return `${covered}${kept}`;
}
