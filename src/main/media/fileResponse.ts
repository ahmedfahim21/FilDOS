import { createReadStream, promises as fs } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

/**
 * A file as an HTTP response that honours byte ranges, for the app's custom
 * protocols. Chromium's media player only seeks a source that answers ranged
 * requests with 206 + Content-Range and advertises Accept-Ranges; Electron's
 * `net.fetch` of a file:// URL returns the bytes with a plain 200 and neither
 * header, so recordings could only play from 0:00.
 */

/** Media types by extension for what the protocols serve (pictures, PDFs, recordings). */
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  apng: 'image/apng',
};

export function contentTypeOf(path: string): string {
  return TYPES[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The byte span a Range header asks for, inclusive: null when there's no
 * usable single range (serve the whole file), 'unsatisfiable' when it lies
 * outside the file. Supports `bytes=a-b`, `bytes=a-` and `bytes=-n`;
 * multi-range requests are answered whole, which HTTP allows.
 */
export function parseRange(header: string | null, size: number): [number, number] | null | 'unsatisfiable' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix: the last n bytes.
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (end < start && m[2] !== '') return null; // malformed: ignore the header
  }
  if (start >= size || size === 0) return 'unsatisfiable';
  return [start, end];
}

/** Respond with `path` (already validated by the caller), honouring the request's Range. */
export async function fileResponse(path: string, rangeHeader: string | null): Promise<Response> {
  const { size } = await fs.stat(path);
  const range = parseRange(rangeHeader, size);
  const type = contentTypeOf(path);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  }
  const [start, end] = range ?? [0, size - 1];
  const length = size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const body = length === 0 ? null : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>);
  return new Response(body, { status: range ? 206 : 200, headers });
}
