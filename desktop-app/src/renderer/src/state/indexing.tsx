import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { IndexProgress, Result } from '@shared/types';

interface IndexingContextValue {
  /** Live progress from the background indexer (null until first status). */
  progress: IndexProgress | null;
  /** Files/folders excluded from indexing. */
  excludes: string[];
  start: () => Promise<Result<void>>;
  pause: () => Promise<Result<void>>;
  clear: () => Promise<Result<void>>;
  addExclude: (path: string) => Promise<void>;
  removeExclude: (path: string) => Promise<void>;
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

  const refreshExcludes = useCallback(async () => {
    const res = await window.index.listExcludes();
    if (res.ok) setExcludes(res.data);
  }, []);

  useEffect(() => {
    window.index.status().then((r) => {
      if (r.ok) setProgress(r.data);
    });
    refreshExcludes();
  }, [refreshExcludes]);

  // Live indexing progress from the background worker.
  useEffect(() => window.index.onProgress(setProgress), []);

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

  return (
    <IndexingContext.Provider
      value={{ progress, excludes, start, pause, clear, addExclude, removeExclude }}
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
