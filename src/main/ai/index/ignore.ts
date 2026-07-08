import { extname, sep } from 'node:path';

/**
 * What the indexer skips while crawling. Three layers: built-in rules that drop
 * obvious junk (hidden dotfiles, system trees, dependency/cache trees, app
 * bundles) so a whole-filesystem crawl stays sane, a codebase rule that keeps
 * only documentation inside detected code projects, plus the user's own
 * "Hide from AI" list managed in Settings. Pure + separator-aware, so it's the
 * same on every platform.
 */

/** Lowercased directory names we never descend into (dotfiles handled separately). */
const DENY_SEGMENTS = new Set([
  // dependency / cache trees
  'node_modules', 'bower_components', '__pycache__', 'site-packages', 'caches',
  // system trees — macOS
  'library', 'applications',
  // system trees — Windows
  'appdata', 'programdata', 'windows', 'program files', 'program files (x86)',
  'system volume information', '$recycle.bin',
  // scratch space
  'tmp', 'temp',
]);

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

/**
 * Segments the AI index skips but interactive *name* search still descends
 * into: they routinely hold files the user put there deliberately, and a name
 * query is an explicit request. The heavyweight junk (dotfolders, dependency
 * trees, Library/AppData) stays skipped in both.
 */
const NAME_SEARCH_ALLOW = new Set(['tmp', 'temp', 'applications']);

/** Like `isIgnored`, tuned for the recursive filename search (no user excludes). */
export function isIgnoredForNameSearch(path: string): boolean {
  for (const segment of path.split(/[\\/]/)) {
    if (segment && segmentIgnored(segment) && !NAME_SEARCH_ALLOW.has(segment.toLowerCase())) {
      return true;
    }
  }
  return false;
}

// --- codebases ---------------------------------------------------------------
//
// A generic file browser has no business embedding every source file of every
// checked-out repo — it bloats the index and drowns search in near-duplicate
// code hits. Inside a directory recognised as a code project we index only its
// documentation (README, docs/*.md, specs…), which carries the project's
// meaning; everything else is skipped.

/** Lowercased file/dir names whose presence marks a directory as a code project root. */
export const CODEBASE_MARKERS = new Set([
  '.git', '.hg', '.svn',
  'package.json', 'pnpm-workspace.yaml', 'deno.json', 'tsconfig.json',
  'cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', 'requirements.txt',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'gemfile', 'composer.json', 'mix.exs', 'cmakelists.txt', 'makefile',
  'package.swift', 'pubspec.yaml',
]);

/** True when any of a directory's entry names marks it as a code project root. */
export function hasCodebaseMarker(names: Iterable<string>): boolean {
  for (const name of names) {
    if (CODEBASE_MARKERS.has(name.toLowerCase())) return true;
  }
  return false;
}

/**
 * Generated/dependency trees skipped when already inside a codebase — build
 * output holds only machine-written copies of docs (bundled READMEs, license
 * files) that pollute search. Deliberately NOT applied outside codebases: a
 * user's folder literally named "Build" or "Out" may hold real documents.
 */
const CODEBASE_BUILD_DIRS = new Set([
  'dist', 'out', 'build', 'target', 'coverage', 'vendor', 'venv', 'bin', 'obj',
]);

/** True when a directory inside a codebase is build output (never descended). */
export function isCodebaseBuildDir(name: string): boolean {
  return CODEBASE_BUILD_DIRS.has(name.toLowerCase());
}

/** Documentation formats still indexed inside a codebase. */
const CODEBASE_DOC_EXTENSIONS = new Set(['md', 'markdown', 'mdx', 'rst', 'txt', 'pdf', 'docx']);

/** True when a file inside a codebase should still be indexed (docs only). */
export function isCodebaseDoc(path: string): boolean {
  return CODEBASE_DOC_EXTENSIONS.has(extname(path).slice(1).toLowerCase());
}
