import { useEffect, useMemo, useState } from 'react';
import type { AppError, Entry } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { sortEntries } from '@/lib/sortEntries';

interface DirectoryState {
  entries: Entry[];
  loading: boolean;
  error: AppError | null;
}

/**
 * Loads the current directory (or recursive search results), reloading on path,
 * refresh, live FS changes, or query changes. Returns the entries filtered
 * (hidden toggle + in-place query filter) and sorted.
 */
export function useDirectory() {
  const { currentPath, refreshToken, showHidden, sort, query, searchRecursive } =
    useNavigation();
  const [state, setState] = useState<DirectoryState>({
    entries: [],
    loading: true,
    error: null,
  });
  // Bumped by live filesystem-change events to trigger a reload.
  const [tick, setTick] = useState(0);

  // Debounce the query so recursive searches don't fire on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const recursive = searchRecursive && debouncedQuery.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const request = recursive
      ? window.fsapi.search(currentPath, debouncedQuery)
      : window.fsapi.listDir(currentPath);

    request.then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ entries: result.data, loading: false, error: null });
      } else {
        setState({ entries: [], loading: false, error: result.error });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentPath, refreshToken, tick, recursive, debouncedQuery]);

  // Watch the current directory and reload when it changes on disk.
  useEffect(() => {
    window.watcher.watch(currentPath).catch(() => {});
    const unsubscribe = window.watcher.onChanged((dirPath) => {
      if (dirPath === currentPath) setTick((t) => t + 1);
    });
    return unsubscribe;
  }, [currentPath]);

  const visible = useMemo(() => {
    let list = showHidden ? state.entries : state.entries.filter((e) => !e.isHidden);

    // In-place filter (recursive results are already filtered server-side).
    const q = query.trim().toLowerCase();
    if (!recursive && q) {
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }

    return sortEntries(list, sort);
  }, [state.entries, showHidden, sort, recursive, query]);

  return { ...state, visible };
}
