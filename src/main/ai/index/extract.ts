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
/** Size cap for DOCX (mammoth needs the whole file in memory). */
export const DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
/**
 * Sanity ceiling for PDFs. Unlike DOCX, PDFs are parsed through a byte-range
 * transport (see extractPdf) that reads only the ranges pdfjs asks for, so this
 * guards against pathological files — not memory.
 */
export const PDF_MAX_BYTES = 512 * 1024 * 1024; // 512 MB
/** Hard stop on pages parsed from one PDF (with PDF_MAX_TEXT_CHARS, "index the
 * relevant front" of a huge book rather than skipping it). */
export const PDF_MAX_PAGES = 2000;
/** Upper bound on extracted text, so one huge doc can't dominate the index. */
export const MAX_TEXT_CHARS = 1_000_000;
/**
 * Tighter cap for PDFs: embedding is the expensive step (~each 2 KB chunk is
 * an inference), and a book's search identity lives in its front — title, TOC,
 * intro, first chapters. 300 K chars ≈ 100+ pages ≈ ~170 chunks, a fraction of
 * the full-book cost.
 */
export const PDF_MAX_TEXT_CHARS = 300_000;

const PDF_RANGE_CHUNK = 1024 * 1024; // 1 MB per ranged read
/** A pathological PDF must not stall the indexing pipeline behind one file. */
const PDF_PARSE_TIMEOUT_MS = 90_000;

/** Plain-text-extractable extensions (without the dot). */
export const TEXT_EXTENSIONS = new Set([
  // documents & data
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonc',
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
  if (!stat.isFile() || stat.size > PDF_MAX_BYTES) return null;
  // Load the legacy build (Node-friendly, no DOM worker) lazily.
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfjsTypes;

  // Feed pdfjs byte ranges on demand instead of buffering the whole file:
  // the xref sits at the tail, and pages fetch only the ranges they need, so
  // a 300 MB book parses with bounded memory instead of being skipped.
  const fh = await fs.open(path, 'r');
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
    const parse = async (): Promise<string> => {
      const doc = await task.promise;
      let text = '';
      const pages = Math.min(doc.numPages, PDF_MAX_PAGES);
      for (let i = 1; i <= pages && text.length < PDF_MAX_TEXT_CHARS; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
      }
      return text.length > PDF_MAX_TEXT_CHARS ? text.slice(0, PDF_MAX_TEXT_CHARS) : text;
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
