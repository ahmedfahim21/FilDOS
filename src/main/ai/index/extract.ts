import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type * as PdfjsTypes from 'pdfjs-dist';
import { assertValidPath } from '../../fs/service';

/**
 * Pull text out of a file for indexing. Plain-text formats (code, markup,
 * config, data) are read directly; PDFs are parsed with pdfjs and Word .docx
 * with mammoth. Other binaries (images, video, archives, legacy Office) are
 * skipped here — pictures are embedded as media by the indexer.
 * Anything unreadable yields null rather than throwing, so a crawl never dies on
 * one bad file (mirrors service.search's resilience).
 */

/** Size cap for plain-text files. */
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
/** Size cap for DOCX (mammoth needs the whole file in memory). */
export const DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
/**
 * Sanity ceiling for PDFs. Unlike DOCX, PDFs are parsed through a byte-range
 * transport (see extractPdf) that reads only the ranges pdfjs asks for, so this
 * guards against pathological files — not memory.
 */
export const PDF_MAX_BYTES = 512 * 1024 * 1024; // 512 MB
/** Hard stop on pages read from one PDF. Indexing reads long PDFs in steps
 * (the indexer's later pass), so this only bounds pathological files. */
export const PDF_MAX_PAGES = 5000;
/** Upper bound on extracted text, so one huge doc can't dominate the index. */
export const MAX_TEXT_CHARS = 1_000_000;
/**
 * Cap on a PDF's text when read whole (chat context, "find similar"). The
 * index doesn't use it: it reads every page, a step at a time.
 */
export const PDF_MAX_TEXT_CHARS = 300_000;

const PDF_RANGE_CHUNK = 1024 * 1024; // 1 MB per ranged read
/** A pathological PDF must not stall the indexing pipeline behind one file. */
const PDF_PARSE_TIMEOUT_MS = 90_000;

/** Plain-text-extractable extensions (without the dot). */
export const TEXT_EXTENSIONS = new Set([
  // documents & data
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonc',
  'ndjson', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties',
  // web & markup
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'svg', 'vue', 'svelte',
  // source code
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cxx', 'cs', 'php', 'swift', 'm', 'mm',
  'scala', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'lua', 'pl', 'r', 'dart',
  'sql', 'graphql', 'gql', 'proto',
]);

/**
 * Data and config formats: indexed for exact keyword lookup (an order number
 * in a CSV, a key in a config) but never embedded — rows of values mean
 * nothing to an embedding model, and they'd crowd real documents out of
 * meaning search.
 */
export const DATA_EXTENSIONS = new Set([
  'csv', 'tsv', 'json', 'jsonc', 'ndjson', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'properties', 'log', 'sql',
]);

export function isDataFile(path: string): boolean {
  return DATA_EXTENSIONS.has(extname(path).slice(1).toLowerCase());
}

/** Below this many tokens a text is too short to judge as "mostly numbers". */
const NUMERIC_MIN_TOKENS = 20;

/**
 * True when most of a text's tokens are numbers (a table of readings, a data
 * dump saved as .txt): keyword-searchable, but not worth a vector.
 */
export function isMostlyNumeric(text: string): boolean {
  const tokens = text.split(/[\s,;:|()[\]{}"']+/).filter(Boolean);
  if (tokens.length < NUMERIC_MIN_TOKENS) return false;
  const numeric = tokens.filter((t) => /^[-+]?[\d.,/%]+$/.test(t)).length;
  return numeric / tokens.length >= 0.5;
}

/** Rich document formats parsed by a dedicated extractor. */
export const DOC_EXTENSIONS = new Set(['pdf', 'docx']);

/** Image formats — embedded as pictures (not text-extracted). */
export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif',
]);

const extOf = (path: string) => extname(path).slice(1).toLowerCase();

/** True when a file's text can be extracted (plain text or a parsed document). */
export function isExtractable(path: string): boolean {
  const ext = extOf(path);
  return TEXT_EXTENSIONS.has(ext) || DOC_EXTENSIONS.has(ext);
}

/** True when a file is an image (embedded as a picture). */
export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extOf(path));
}

/** Audio formats Chromium decodes — embedded as sound, a window at a time. */
export const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus']);
/** Video formats Chromium plays — embedded as keyframes plus their soundtrack. */
export const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);

export function isAudio(path: string): boolean {
  return AUDIO_EXTENSIONS.has(extOf(path));
}

export function isVideo(path: string): boolean {
  return VIDEO_EXTENSIONS.has(extOf(path));
}

/** Audio or video. */
export function isMedia(path: string): boolean {
  return isAudio(path) || isVideo(path);
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

/** One PDF page's text (1-based page number). */
export interface PdfPage {
  n: number;
  text: string;
}

/** Pages `from`…`to` (1-based, inclusive, clamped) of a PDF, and how many it has. */
export interface PdfPages {
  total: number;
  pages: PdfPage[];
}

/**
 * Read a range of a PDF's pages. Pages keep their numbers, so a hit can point
 * at one. pdfjs reads through a byte-range transport (no whole-file
 * buffering), so a book-size PDF costs only the pages asked for; a parse that
 * stalls past PDF_PARSE_TIMEOUT_MS rejects.
 */
export async function extractPdfPages(path: string, from = 1, to = PDF_MAX_PAGES): Promise<PdfPages | null> {
  const safe = assertValidPath(path);
  const stat = await fs.stat(safe);
  if (!stat.isFile() || stat.size > PDF_MAX_BYTES) return null;
  // Load the legacy build (Node-friendly, no DOM worker) lazily.
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfjsTypes;

  // Feed pdfjs byte ranges on demand instead of buffering the whole file:
  // the xref sits at the tail, and pages fetch only the ranges they need.
  const fh = await fs.open(safe, 'r');
  const readRange = async (begin: number, end: number): Promise<Uint8Array> => {
    const buf = Buffer.alloc(Math.max(0, Math.min(end, stat.size) - begin));
    await fh.read(buf, 0, buf.length, begin);
    return new Uint8Array(buf);
  };

  class FileRangeTransport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin: number, end: number): void {
      readRange(begin, end).then(
        (data) => this.onDataRange(begin, data),
        () => {}, // file handle closed — extraction already settled
      );
    }
  }

  try {
    const transport = new FileRangeTransport(
      stat.size,
      await readRange(0, Math.min(PDF_RANGE_CHUNK, stat.size)),
    );
    // verbosity 0 = errors only: malformed embedded fonts in PDFs found on disk
    // otherwise spam the console with harmless "Type3/glyf" recovery warnings.
    const task = pdfjs.getDocument({
      range: transport,
      rangeChunkSize: PDF_RANGE_CHUNK,
      disableAutoFetch: true, // fetch ranges only when a page needs them
      useSystemFonts: true,
      verbosity: 0,
    });
    const parse = async (): Promise<PdfPages> => {
      const doc = await task.promise;
      const total = Math.min(doc.numPages, PDF_MAX_PAGES);
      const pages: PdfPage[] = [];
      for (let n = Math.max(1, from); n <= Math.min(total, to); n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push({ n, text: content.items.map((it) => ('str' in it ? it.str : '')).join(' ').trim() });
      }
      return { total, pages };
    };
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('PDF parse timed out')), PDF_PARSE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([parse(), timeout]);
    } finally {
      clearTimeout(timer);
      await task.destroy().catch(() => {});
    }
  } finally {
    await fh.close();
  }
}

/** A PDF's text, front first, up to PDF_MAX_TEXT_CHARS (for chat context and "find similar"). */
async function extractPdf(path: string): Promise<string | null> {
  const doc = await extractPdfPages(path);
  if (!doc) return null;
  let text = '';
  for (const p of doc.pages) {
    if (text.length >= PDF_MAX_TEXT_CHARS) break;
    text += p.text + '\n';
  }
  return text.length > PDF_MAX_TEXT_CHARS ? text.slice(0, PDF_MAX_TEXT_CHARS) : text;
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
