import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { FilePreview } from '@shared/types';
import { AUDIO_EXTENSIONS, TEXT_EXTENSIONS, VIDEO_EXTENSIONS } from '../ai/index/extract';

/**
 * What Quick Look shows for a file. Pictures, PDFs and recordings are read by
 * the renderer through a one-time `fildos-media://preview/` grant for that
 * file; text comes back inline (the first TEXT_PREVIEW_BYTES); pictures
 * Chromium can't decode come back decoded by the OS.
 */
export const TEXT_PREVIEW_BYTES = 128 * 1024;

/** Pictures Chromium renders itself. */
const WEB_IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico', 'apng']);
/** Pictures only the OS decodes (HEVC-coded HEIF, TIFF). */
const OS_IMAGES = new Set(['heic', 'heif', 'tif', 'tiff']);

export interface PreviewDeps {
  /** A one-time protocol URL the renderer may read `path` through. */
  grant(path: string): string;
  /** An OS-decoded picture as a data URL, or null when the OS can't decode it. */
  osImage(path: string): Promise<string | null>;
  /** A document's text (DOCX), or null when it can't be read. */
  docText(path: string): Promise<string | null>;
}

/** The first `max` bytes as text, or null when they look binary (a NUL byte, invalid UTF-8). */
export function sniffText(bytes: Uint8Array, max: number): { text: string; truncated: boolean } | null {
  const head = bytes.subarray(0, max);
  if (head.includes(0)) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  // A cut can split a multi-byte character: back off up to 3 bytes before calling it binary.
  for (let trim = 0; trim <= (bytes.length > max ? 3 : 0); trim++) {
    try {
      return { text: decoder.decode(head.subarray(0, head.length - trim)), truncated: bytes.length > max };
    } catch {
      // try a shorter cut
    }
  }
  return null;
}

async function readHead(path: string, n: number): Promise<Uint8Array> {
  const file = await fs.open(path, 'r');
  try {
    // One byte past the limit tells a cut file from one that fits exactly.
    const { buffer, bytesRead } = await file.read(Buffer.alloc(n + 1), 0, n + 1, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function previewOf(path: string, deps: PreviewDeps): Promise<FilePreview> {
  const stat = await fs.stat(path);
  if (stat.isDirectory()) return { kind: 'folder', items: (await fs.readdir(path)).length };
  const ext = extname(path).slice(1).toLowerCase();
  if (WEB_IMAGES.has(ext)) return { kind: 'image', url: deps.grant(path) };
  if (OS_IMAGES.has(ext)) {
    const url = await deps.osImage(path);
    return url ? { kind: 'image', url } : { kind: 'none' };
  }
  if (ext === 'pdf') return { kind: 'pdf', url: deps.grant(path) };
  if (VIDEO_EXTENSIONS.has(ext)) return { kind: 'video', url: deps.grant(path) };
  if (AUDIO_EXTENSIONS.has(ext)) return { kind: 'audio', url: deps.grant(path) };
  if (ext === 'docx') {
    const text = await deps.docText(path);
    if (text === null) return { kind: 'none' };
    return { kind: 'document', text: text.slice(0, TEXT_PREVIEW_BYTES), truncated: text.length > TEXT_PREVIEW_BYTES };
  }
  // Known text types, and anything else that reads as text (README, Makefile, .gitignore…).
  const sniffed = sniffText(await readHead(path, TEXT_PREVIEW_BYTES), TEXT_PREVIEW_BYTES);
  if (sniffed) return { kind: 'text', ...sniffed, language: ext };
  if (TEXT_EXTENSIONS.has(ext)) console.info('[fildos] preview: not text after all:', path);
  return { kind: 'none' };
}
