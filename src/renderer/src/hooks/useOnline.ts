import { useEffect, useState } from 'react';

/**
 * Tracks the machine's network connectivity via `navigator.onLine` and the
 * window `online`/`offline` events. Reliable for the "no network at all" case
 * we care about (browsing cloud folders needs a connection); it can't detect a
 * connected-but-no-internet captive portal, but the OS reports a downed link.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Re-sync in case the status changed before listeners were attached.
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
