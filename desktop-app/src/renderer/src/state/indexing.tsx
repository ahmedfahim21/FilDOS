import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { IndexProgress, Result } from '@shared/types';
import { playNotify } from '@/lib/sounds';

interface IndexingContextValue {
  /** Live progress from the background indexer (null until first status). */
  progress: IndexProgress | null;
  /** Files/folders excluded from indexing. */
  excludes: string[];
  /** Minutes between background rescans. */
  intervalMinutes: number;
  start: () => Promise<Result<void>>;
  pause: () => Promise<Result<void>>;
  clear: () => Promise<Result<void>>;
  addExclude: (path: string) => Promise<void>;
  removeExclude: (path: string) => Promise<void>;
  setIntervalMinutes: (minutes: number) => Promise<void>;
}

const IndexingContext = createContext<IndexingContextValue | null>(null);

/**
 * Holds background-indexing progress and the exclusion list. Progress is fetched
 * once on mount and then kept live by the main-process push stream; exclusions
 * are re-read after each change. Mirrors state/ai.tsx.
 */
export function IndexingProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [intervalMinutes, setInterval] = useState(15);

  const refreshExcludes = useCallback(async () => {
    const res = await window.index.listExcludes();
    if (res.ok) setExcludes(res.data);
  }, []);

  useEffect(() => {
    window.index.status().then((r) => {
      if (r.ok) setProgress(r.data);
    });
    window.prefs.get().then((p) => {
      if (p.index?.intervalMinutes) setInterval(p.index.intervalMinutes);
    });
    refreshExcludes();
  }, [refreshExcludes]);

  // Live indexing progress from the background worker.
  const wasActive = useRef(false);
  useEffect(
    () =>
      window.index.onProgress((p) => {
        const active = p.state === 'scanning' || p.state === 'indexing';
        if (wasActive.current && !active && p.state === 'idle' && p.indexed > 0) {
          playNotify();
        }
        wasActive.current = active;
        setProgress(p);
      }),
    [],
  );

  const start = useCallback(() => window.index.start(), []);
  const pause = useCallback(() => window.index.pause(), []);
  const clear = useCallback(() => window.index.clear(), []);

  const addExclude = useCallback(
    async (path: string) => {
      await window.index.addExclude(path);
      await refreshExcludes();
    },
    [refreshExcludes],
  );
  const removeExclude = useCallback(
    async (path: string) => {
      await window.index.removeExclude(path);
      await refreshExcludes();
    },
    [refreshExcludes],
  );
  const setIntervalMinutes = useCallback(async (minutes: number) => {
    setInterval(minutes); // optimistic
    await window.index.setInterval(minutes);
  }, []);

  return (
    <IndexingContext.Provider
      value={{
        progress,
        excludes,
        intervalMinutes,
        start,
        pause,
        clear,
        addExclude,
        removeExclude,
        setIntervalMinutes,
      }}
    >
      {children}
    </IndexingContext.Provider>
  );
}

export function useIndexing(): IndexingContextValue {
  const ctx = useContext(IndexingContext);
  if (!ctx) throw new Error('useIndexing must be used within IndexingProvider');
  return ctx;
}
