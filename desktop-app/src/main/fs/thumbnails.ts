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
    // `size` is a square bounding box, so createThumbnailFromPath pins the
    // image's *logical* size to size×size even though the underlying bitmap
    // keeps the source aspect ratio. toDataURL() encodes at that squished
    // logical size — distorting non-square images — whereas toPNG() exports
    // the real (aspect-correct) bitmap, so we build the data URL from that.
    url = img.isEmpty() ? null : `data:image/png;base64,${img.toPNG().toString('base64')}`;
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
