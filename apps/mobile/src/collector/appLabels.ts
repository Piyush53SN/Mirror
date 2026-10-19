/**
 * Resolve app labels from package names via the native module.
 *
 * Uses PackageManager with a narrow <queries> (MAIN/LAUNCHER intent) — no
 * QUERY_ALL_PACKAGES. Falls back to the package name when the label cannot
 * be resolved (e.g. the package is not visible or is system UI).
 *
 * The result is cached in memory for the process lifetime; labels do not
 * change often and re-querying on every refresh would be wasteful.
 */
import { getUsageStatsModule } from '../../modules/mirror-usage-stats';

const cache = new Map<string, string>();

export function getCachedLabel(pkg: string): string {
  return cache.get(pkg) ?? pkg;
}

export async function resolveAppLabels(packages: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(packages)].filter((p) => p && !cache.has(p));
  if (unique.length > 0) {
    try {
      const mod = getUsageStatsModule();
      if (mod?.getAppLabels) {
        const rows = mod.getAppLabels(unique) as { packageName: string; label: string }[];
        for (const row of rows) {
          if (row?.packageName) cache.set(row.packageName, row.label || row.packageName);
        }
      }
    } catch {
      // best-effort: leave cache as is, caller will fall back to package name
    }
    // ensure every requested pkg has at least itself cached, so we don't retry endlessly
    for (const pkg of unique) if (!cache.has(pkg)) cache.set(pkg, pkg);
  }
  const out: Record<string, string> = {};
  for (const pkg of packages) out[pkg] = cache.get(pkg) ?? pkg;
  return out;
}

export function clearLabelCache(): void {
  cache.clear();
}
