/**
 * Typed feature flags.
 *
 * Rules this file encodes (they come from the product brief, not from taste):
 *   - every feature sits behind a typed flag;
 *   - social features are OFF by default and cannot be switched on by remote
 *     config, a deployment, or an OTA update — only by a deliberate code change
 *     plus the user's own consent state;
 *   - a flag can never add collection, a permission, or an outbound request.
 *     If a flag could do that, it does not belong here.
 */
import type { DataTier } from './tiers';

export type FlagName = keyof typeof FLAG_DEFAULTS;

export type FlagDefinition = {
  /** Off unless a build or the user turns it on. */
  defaultOn: boolean;
  /** Who is allowed to change it. `user` means it needs in-app consent. */
  owner: 'build' | 'user';
  /** Minimum data tier the feature needs to have anything to show. */
  needs: DataTier[];
  /** What the UI must say when the flag is on but the data is missing. */
  emptyState: string;
};

export const FLAG_DEFAULTS = {
  /** Local-only insights: the product's core, on by default. */
  insights: { defaultOn: true, owner: 'build', needs: ['D'], emptyState: 'No usage data yet — Mirror needs Android usage access to say anything at all.' },
  /** Topic-level analysis needs titles, which only tier A/B/C sources carry. */
  topics: { defaultOn: true, owner: 'build', needs: ['A', 'B', 'C'], emptyState: 'No topic data yet. Connect a source or import an export, or stay on the usage-only view.' },
  /** Weekly report is local-only and printable; no server involved. */
  weeklyReport: { defaultOn: true, owner: 'build', needs: ['D'], emptyState: 'A report appears once there are seven days of on-device history.' },
  /** Ask runs on-device over your own data. */
  ask: { defaultOn: true, owner: 'build', needs: ['D'], emptyState: 'Ask needs at least a week of history before it can answer without guessing.' },
  /** Widgets are local renderings of local data. */
  widgets: { defaultOn: true, owner: 'build', needs: ['D'], emptyState: 'Widgets show demo values until there is data to render.' },
  /** Experimental algorithms, off by default. */
  experimentalScoring: { defaultOn: false, owner: 'build', needs: ['D'], emptyState: 'Experimental scoring is off.' },
  /** Anything that leaves the device. Off by default, user-owned, and it still cannot add collection. */
  cloudReport: { defaultOn: false, owner: 'user', needs: ['D'], emptyState: 'Cloud reports are off. Nothing leaves this device.' },
  /** Social matching. Off by default and *structurally* unable to expose history. */
  socialMatching: { defaultOn: false, owner: 'user', needs: ['A', 'B', 'C'], emptyState: 'Matching is off. Turning it on shares only the topics you pick, one by one — never your watch, search or purchase history.' },
  /** Compare-with-friends style features inherit the same rule. */
  friendComparison: { defaultOn: false, owner: 'user', needs: ['A', 'B', 'C'], emptyState: 'Comparison is off.' },
} as const satisfies Record<string, FlagDefinition>;

export type FlagState = Partial<Record<FlagName, boolean>>;

/** The state a shipping app starts in: everything user-owned stays off. */
export const initialFlags: Required<FlagState> = Object.fromEntries(
  Object.entries(FLAG_DEFAULTS).map(([name, def]) => [name, def.defaultOn]),
) as Required<FlagState>;

export const isOn = (flags: FlagState, name: FlagName): boolean => flags[name] ?? FLAG_DEFAULTS[name].defaultOn;

/** Flags that lost their data source: on, but with nothing to say. */
export function flagsMissingData(flags: FlagState, available: DataTier[]): FlagName[] {
  return (Object.keys(FLAG_DEFAULTS) as FlagName[]).filter((name) => {
    if (!isOn(flags, name)) return false;
    const needs = FLAG_DEFAULTS[name].needs;
    return !needs.some((tier) => available.includes(tier));
  });
}

/**
 * The build-time assertion, run by tests. A flag being on by default never turns
 * on *collection* — collection is governed by the permission model (tiers.ts),
 * not by flags. What a default-on flag may not do is leave the user staring at
 * an empty screen with no explanation, and what a user-owned flag may not do is
 * start on. Both are checked here.
 */
export function auditFlagPosture(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const [name, def] of Object.entries(FLAG_DEFAULTS) as [FlagName, FlagDefinition][]) {
    if (def.owner === 'user' && def.defaultOn) {
      problems.push(`${name}: user-owned flags must start off`);
    }
    if (def.defaultOn && !def.emptyState) {
      problems.push(`${name}: default-on flags must state what the UI says when the data is missing`);
    }
  }
  return { ok: problems.length === 0, problems };
}
