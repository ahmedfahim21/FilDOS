import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type * as PdfjsTypes from 'pdfjs-dist';
import { assertValidPath } from '../../fs/service';

/**
 * Pull text out of a file for indexing. Plain-text formats (code, markup,
 * config, data) are read directly; PDFs are parsed with pdfjs and Word .docx
 * with mammoth. Other binaries (images, video, archives, legacy Office) are
 * skipped here — images are embedded separately by a CLIP model in the indexer.
 * Anything unreadable yields null rather than throwing, so a crawl never dies on
 * one bad file (mirrors service.search's resilience).
 */

/** Size cap for plain-text files. */
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
/** Size cap for documents we parse (PDF/DOCX expand, so allow more). */
export const DOC_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
/** Upper bound on extracted text, so one huge doc can't dominate the index. */
export const MAX_TEXT_CHARS = 1_000_000;

/** Plain-text-extractable extensions (without the dot). */
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

/** Rich document formats parsed by a dedicated extractor. */
export const DOC_EXTENSIONS = new Set(['pdf', 'docx']);

/** Image formats — indexed by a CLIP model (not text-extracted). */
export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif',
]);

const extOf = (path: string) => extname(path).slice(1).toLowerCase();

/** True when a file's text can be extracted (plain text or a parsed document). */
export function isExtractable(path: string): boolean {
  const ext = extOf(path);
  return TEXT_EXTENSIONS.has(ext) || DOC_EXTENSIONS.has(ext);
}

/** True when a file is an image (embeddable by a CLIP model). */
export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extOf(path));
}

/** Trim to the text cap. */
function cap(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

async function extractPlain(path: string): Promise<string | null> {
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > MAX_BYTES) return null;
  const buf = await fs.readFile(path);
  if (buf.includes(0)) return null; // binary despite the extension
  return cap(buf.toString('utf-8'));
}

async function extractPdf(path: string): Promise<string | null> {
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > DOC_MAX_BYTES) return null;
  const data = new Uint8Array(await fs.readFile(path));
  // Load the legacy build (Node-friendly, no DOM worker) lazily.
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfjsTypes;
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;
  try {
    let text = '';
    for (let i = 1; i <= doc.numPages && text.length < MAX_TEXT_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
    }
    return cap(text);
  } finally {
    await task.destroy();
  }
}

interface MammothLike {
  extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }>;
}

async function extractDocx(path: string): Promise<string | null> {
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > DOC_MAX_BYTES) return null;
  const buffer = await fs.readFile(path);
  const mod = (await import('mammoth')) as unknown as { default?: MammothLike } & MammothLike;
  const mammoth = mod.default ?? mod;
  const { value } = await mammoth.extractRawText({ buffer });
  return cap(value);
}

/**
 * Extract text from `path`, or null when it can't/shouldn't be indexed
 * (unsupported type, too large, looks binary, or unreadable).
 */
export async function extractText(path: string): Promise<string | null> {
  try {
    const safe = assertValidPath(path);
    const ext = extOf(safe);
    if (TEXT_EXTENSIONS.has(ext)) return await extractPlain(safe);
    if (ext === 'pdf') return await extractPdf(safe);
    if (ext === 'docx') return await extractDocx(safe);
    return null;
  } catch {
    return null;
  }
}
