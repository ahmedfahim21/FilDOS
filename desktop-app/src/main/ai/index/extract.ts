import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import { assertValidPath } from '../../fs/service';

/**
 * Pull plain text out of a file for indexing. Only text-like formats are read
 * (source code, markup, config, data) — binaries (images, video, archives,
 * office docs) are skipped for now; richer extractors can be added later. Files
 * over the size cap are skipped too, since a single huge file would dwarf the
 * index. Anything unreadable yields null rather than throwing, so a crawl over a
 * folder never dies on one bad file (mirrors service.search's resilience).
 */

/** Skip files larger than this — return null ("skipped"). */
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Extensions (without the dot) we treat as text-extractable. */
export const TEXT_EXTENSIONS = new Set([
  // documents & data
  'txt', 'text', 'md', 'markdown', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonc',
  'ndjson', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties',
  // web & markup
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'svg', 'vue', 'svelte',
  // source code
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cxx', 'cs', 'php', 'swift', 'm', 'mm',
  'scala', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'lua', 'pl', 'r', 'dart',
  'sql', 'graphql', 'gql', 'proto',
]);

/** True when a file's extension marks it as text we can extract. */
export function isExtractable(path: string): boolean {
  return TEXT_EXTENSIONS.has(extname(path).slice(1).toLowerCase());
}

/**
 * Extract UTF-8 text from `path`, or null when it can't/shouldn't be indexed
 * (unsupported type, too large, looks binary, or unreadable).
 */
export async function extractText(path: string): Promise<string | null> {
  try {
    const safe = assertValidPath(path);
    if (!isExtractable(safe)) return null;

    const stat = await fs.stat(safe);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;

    const buf = await fs.readFile(safe);
    // A NUL byte means it's really binary despite the extension — skip it.
    if (buf.includes(0)) return null;
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}
