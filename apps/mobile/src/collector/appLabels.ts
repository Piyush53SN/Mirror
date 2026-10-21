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
  const cached = cache.get(pkg);
  if (cached && cached !== pkg) return cached;
  if (pkg.includes('.')) {
    const last = pkg.split('.').pop() ?? pkg;
    return last.charAt(0).toUpperCase() + last.slice(1);
  }
  return cached ?? pkg;
}

function readableFallback(pkg: string): string {
  if (!pkg) return pkg;
  if (pkg.includes('.')) {
    const parts = pkg.split('.');
    const last = parts.pop() ?? pkg;
    if (last.length <= 2 && parts.length > 0) {
      const secondLast = parts.pop() ?? '';
      return `${secondLast}.${last}`.replace(/^[a-z]/, (c) => c.toUpperCase());
    }
    return last.charAt(0).toUpperCase() + last.slice(1);
  }
  return pkg;
}

export async function resolveAppLabels(packages: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(packages)].filter((p) => p && !cache.has(p));
  if (unique.length > 0) {
    try {
      const mod = getUsageStatsModule();
      if (mod?.getAppLabels) {
        const rows = mod.getAppLabels(unique) as { packageName: string; label: string }[];
        for (const row of rows) {
          if (row?.packageName) {
            const label = row.label && row.label !== row.packageName ? row.label : readableFallback(row.packageName);
            cache.set(row.packageName, label);
          }
        }
      }
    } catch {
      // best-effort
    }
    for (const pkg of unique) if (!cache.has(pkg)) cache.set(pkg, readableFallback(pkg));
  }
  const out: Record<string, string> = {};
  for (const pkg of packages) {
    const cached = cache.get(pkg);
    out[pkg] = cached && cached !== pkg ? cached : readableFallback(pkg);
  }
  return out;
}

export function clearLabelCache(): void {
  cache.clear();
}
