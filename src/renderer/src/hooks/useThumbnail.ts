import { useEffect, useState } from 'react';

/**
 * Lazily fetch a thumbnail data URL for an image path. Returns null until ready
 * (or if unavailable). `enabled` lets callers skip non-image entries.
 */
export function useThumbnail(path: string, size: number, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    window.fsapi.thumbnail(path, size).then((result) => {
      if (!cancelled && result.ok) setUrl(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [path, size, enabled]);

  return url;
}
