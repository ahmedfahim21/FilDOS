import type { Entry } from '@shared/types';

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  const rounded = exp === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[exp]}`;
}

/** Locale date+time from epoch ms, e.g. "Jun 8, 2026, 9:04 AM". */
export function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short, friendly type label for an entry. */
export function typeLabel(entry: Entry): string {
  if (entry.isDirectory) return 'Folder';
  if (entry.isSymlink) return 'Alias';
  return entry.ext ? `${entry.ext.toUpperCase()} file` : 'File';
}

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'heic',
  'tiff',
  'tif',
  'ico',
  'svg',
]);

/** Whether an entry is an image we can thumbnail. */
export function isImage(entry: Entry): boolean {
  return !entry.isDirectory && IMAGE_EXTS.has(entry.ext);
}

// Beyond raster images, the OS thumbnailers (QuickLook on macOS, the Shell
// thumbnail provider on Windows) can render previews for PDFs and most video
// formats. Unsupported types/platforms just yield null and fall back to the
// type icon, so this list is free to be generous.
const PREVIEW_EXTS = new Set([
  ...IMAGE_EXTS,
  'pdf',
  'mp4',
  'mov',
  'm4v',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'flv',
  '3gp',
  'mpg',
  'mpeg',
]);

/** Whether an entry is a file we should attempt a live thumbnail preview for. */
export function canPreview(entry: Entry): boolean {
  return !entry.isDirectory && PREVIEW_EXTS.has(entry.ext);
}
