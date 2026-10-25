import { basename, extname, relative, sep } from 'node:path';

/**
 * What the indexer skips while crawling. Layers: built-in rules that drop
 * obvious junk (hidden dotfiles, system trees, dependency/cache trees, app
 * bundles) so a whole-filesystem crawl stays sane, files that hold secrets
 * (never read, wherever they are), a codebase rule that keeps only
 * documentation inside detected code projects, cache and dataset folders
 * (detected while crawling), plus the user's own "Hide from AI" list managed
 * in Settings. Pure + separator-aware, so it's the same on every platform.
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
 * segments, it holds secrets, or it falls under a user exclusion. Works for
 * files and directories (a skipped directory means the crawl never descends
 * into it).
 *
 * With `root`, the built-in segment rules only look below it: a root is a
 * deliberate choice, so one that itself sits under a dot-folder, `tmp` or
 * `Library` is still crawled (only what's inside it is filtered).
 */
export function isIgnored(path: string, excludes: readonly string[] = [], root?: string): boolean {
  const scoped = root && isUnder(path, root) ? relative(root, path) : path;
  for (const segment of scoped.split(/[\\/]/)) {
    if (segment && segmentIgnored(segment)) return true;
  }
  if (isSecretFile(path)) return true;
  return excludes.some((base) => isUnder(path, base));
}

// --- secrets -----------------------------------------------------------------
//
// Keys, certificates, credential and password files are never read, wherever
// they live — not even for a filename chunk.

/** Extensions of key, certificate, keystore and password-vault files. */
const SECRET_EXTENSIONS = new Set([
  'pem', 'key', 'p12', 'pfx', 'p8', 'keystore', 'jks', 'kdbx', 'kdb', 'ppk', 'gpg', 'pgp', 'asc',
  'crt', 'cer', 'der', 'csr', 'ovpn', 'env',
]);

/** Exact lowercase names of credential files. */
const SECRET_NAMES = new Set([
  'credentials', 'credentials.json', 'credentials.yml', 'credentials.yaml', 'client_secret.json',
  'service-account.json', 'secrets.json', 'secrets.yml', 'secrets.yaml', 'id_rsa', 'id_dsa',
  'id_ecdsa', 'id_ed25519', 'known_hosts', 'authorized_keys', 'netrc', 'pgpass', 'htpasswd',
]);

/** True for files that hold keys, certificates or credentials (`prod.env`, `server.pem`, `id_rsa`…). */
export function isSecretFile(path: string): boolean {
  const name = basename(path).toLowerCase().replace(/^\./, '');
  if (SECRET_NAMES.has(name)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(name)) return true;
  if (/(^|\.)env(\.[\w-]+)?$/.test(name)) return true; // .env, prod.env, .env.local
  return SECRET_EXTENSIONS.has(extname(name).slice(1));
}

// --- caches and datasets -----------------------------------------------------

/** The header the Cache Directory Tagging spec requires in a CACHEDIR.TAG file (exact bytes). */
export const CACHEDIR_SIGNATURE = 'Signature: 8a477f597d28d172789f06886806bc55';

/** True when a CACHEDIR.TAG file's contents mark its folder as a cache. */
export function isCacheDirTag(contents: string): boolean {
  return contents.startsWith(CACHEDIR_SIGNATURE);
}

/** Camera and phone names: `IMG_1234`, `DSC01234`, `PXL_2026…`, `VID_…`. Not machine-made. */
const CAMERA_NAME = /^(img|dsc|dscn|dscf|pxl|mvimg|vid|mov|gopr|dji)[_-]?\d/i;

/**
 * Names a program wrote: `frame_00042`, `clip-0123`, `00042`, a UUID or a long
 * hex hash. Camera names (`IMG_1234`) and date-stamped phone names
 * (`20261021_143022`) don't count — those are people's photos.
 */
export function isMachineName(name: string): boolean {
  const stem = name.replace(/\.[^.]+$/, '');
  if (CAMERA_NAME.test(stem)) return false;
  if (/^(19|20)\d{2}[-_.]?\d{2}[-_.]?\d{2}/.test(stem)) return false;
  return (
    /^[a-z]+[_-]?\d{3,}$/i.test(stem) ||
    /^\d{3,}$/.test(stem) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stem) ||
    /^[0-9a-f]{16,}$/i.test(stem)
  );
}

/** How many same-kind, machine-named media files make a folder a dataset. */
export const DATASET_MIN_FILES = 200;

/**
 * True when a folder's file names look like training data: hundreds of
 * machine-named files of one media kind. `kindOf` maps a name to its media
 * kind (or null for non-media).
 */
export function looksLikeDataset(names: readonly string[], kindOf: (name: string) => string | null): boolean {
  const counts = new Map<string, number>();
  for (const name of names) {
    const kind = kindOf(name);
    if (!kind || !isMachineName(name)) continue;
    const n = (counts.get(kind) ?? 0) + 1;
    if (n >= DATASET_MIN_FILES) return true;
    counts.set(kind, n);
  }
  return false;
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

// --- pictures ----------------------------------------------------------------

/** Screenshot names across macOS, Windows and Linux tools and locales. */
const SCREENSHOT_NAME = /^(screenshot|screen shot|scr[_ -]?\d|capture d['’]écran|bildschirmfoto|captura de pantalla|スクリーンショット|截屏|屏幕截图)/i;

export function isScreenshot(path: string): boolean {
  return SCREENSHOT_NAME.test(basename(path));
}

/**
 * Vision soft-token budget for a picture: screenshots hold small text and UI
 * detail, so they get twice a photo's budget. (Budgets range 70–1120; more
 * reads finer detail and costs proportionally more.)
 */
export const PHOTO_BUDGET = 140;
export const SCREENSHOT_BUDGET = 280;

export function visionBudget(path: string): number {
  return isScreenshot(path) ? SCREENSHOT_BUDGET : PHOTO_BUDGET;
}
