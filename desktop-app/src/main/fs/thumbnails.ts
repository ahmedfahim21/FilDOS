import { nativeImage } from 'electron';

/**
 * Generate (and cache) image thumbnails as data URLs via Electron's native
 * thumbnailer. Returns null for unsupported files/platforms. The cache is a
 * simple insertion-ordered Map with an upper bound.
 */
const cache = new Map<string, string | null>();
const MAX_ENTRIES = 500;

export async function thumbnail(path: string, size: number): Promise<string | null> {
  const key = `${size}:${path}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let url: string | null = null;
  try {
    const img = await nativeImage.createThumbnailFromPath(path, {
      width: size,
      height: size,
    });
    url = img.isEmpty() ? null : img.toDataURL();
  } catch {
    url = null; // unsupported type or platform
  }

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, url);
  return url;
}
