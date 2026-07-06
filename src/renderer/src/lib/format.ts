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

/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago"; older dates fall back to the short date. */
export function timeAgo(ms: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
