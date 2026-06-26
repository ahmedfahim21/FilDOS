import { sep } from 'node:path';

/**
 * What the indexer skips while crawling. Two layers: built-in rules that drop
 * obvious junk (hidden dotfiles, dependency/cache trees, app bundles) so a
 * whole-filesystem crawl stays sane, plus the user's own exclusions managed in
 * Settings. Pure + separator-aware, so it's the same on every platform.
 */

/** Lowercased directory names we never descend into (dotfiles handled separately). */
const DENY_SEGMENTS = new Set(['node_modules', 'caches', 'appdata', '$recycle.bin']);

function segmentIgnored(segment: string): boolean {
  if (segment.startsWith('.')) return true; // hidden / dotfiles (.git, .cache, .Trash…)
  const lower = segment.toLowerCase();
  if (DENY_SEGMENTS.has(lower)) return true;
  if (lower.endsWith('.app')) return true; // macOS application bundle
  return false;
}

/** True when `path` is `base` or sits beneath it (separator-aware prefix match). */
export function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(base.endsWith(sep) ? base : base + sep);
}

/**
 * Whether the indexer should skip this path — a built-in rule matches one of its
 * segments, or it falls under a user exclusion. Works for files and directories
 * (a skipped directory means the crawl never descends into it).
 */
export function isIgnored(path: string, excludes: readonly string[] = []): boolean {
  for (const segment of path.split(/[\\/]/)) {
    if (segment && segmentIgnored(segment)) return true;
  }
  return excludes.some((base) => isUnder(path, base));
}
