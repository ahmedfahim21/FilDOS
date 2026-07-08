import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { IndexProgress, Result } from '@shared/types';
import { playNotify } from '@/lib/sounds';

interface IndexingContextValue {
  /** Live progress from the background indexer (null until first status). */
  progress: IndexProgress | null;
  /** Files/folders hidden from AI. */
  excludes: string[];
  /** Minutes between background rescans. */
  intervalMinutes: number;
  /** Keep indexing (tray-resident) after the last window closes. */
  ambient: boolean;
  /** File extensions (lowercase, no dot) the indexer never touches. */
  excludeExtensions: string[];
  start: () => Promise<Result<void>>;
  pause: () => Promise<Result<void>>;
  clear: () => Promise<Result<void>>;
  addExclude: (path: string) => Promise<void>;
  removeExclude: (path: string) => Promise<void>;
  /** Native picker to hide more paths from AI. */
  pickExcludes: () => Promise<void>;
  setIntervalMinutes: (minutes: number) => Promise<void>;
  setAmbient: (enabled: boolean) => Promise<void>;
  setExcludeExtensions: (exts: string[]) => Promise<void>;
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
  const [ambient, setAmbientState] = useState(true);
  const [excludeExtensions, setExcludeExtsState] = useState<string[]>([]);

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
      setAmbientState(p.index?.ambient ?? true);
      setExcludeExtsState(p.index?.excludeExtensions ?? []);
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
  const pickExcludes = useCallback(async () => {
    const res = await window.index.pickExcludes();
    if (res.ok) setExcludes(res.data);
  }, []);
  const setIntervalMinutes = useCallback(async (minutes: number) => {
    setInterval(minutes); // optimistic
    await window.index.setInterval(minutes);
  }, []);
  const setAmbient = useCallback(async (enabled: boolean) => {
    setAmbientState(enabled); // optimistic
    await window.index.setAmbient(enabled);
  }, []);
  const setExcludeExtensions = useCallback(async (exts: string[]) => {
    setExcludeExtsState(exts); // optimistic; replaced by the normalized list
    const res = await window.index.setExcludeExtensions(exts);
    if (res.ok) setExcludeExtsState(res.data);
  }, []);

  return (
    <IndexingContext.Provider
      value={{
        progress,
        excludes,
        intervalMinutes,
        ambient,
        excludeExtensions,
        start,
        pause,
        clear,
        addExclude,
        removeExclude,
        pickExcludes,
        setIntervalMinutes,
        setAmbient,
        setExcludeExtensions,
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
