import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Entry, Result, Tag } from '@shared/types';
import { useToast } from '@/state/toast';

/**
 * Tag state for the browser: the full tag list (for the sidebar and menus)
 * plus the path → tags map for the entries currently on screen. All tag
 * mutations funnel through here so every consumer stays in sync.
 */
export function useTagState(visible: Entry[]) {
  const { notifyError } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [byPath, setByPath] = useState<Record<string, number[]>>({});
  // Bumped after any tag mutation to re-fetch both the list and the map.
  const [token, setToken] = useState(0);

  const refresh = useCallback(() => setToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    window.tags.list().then((r) => {
      if (!cancelled && r.ok) setTags(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const paths = visible.map((e) => e.path);
    if (paths.length === 0) {
      setByPath({});
      return;
    }
    window.tags.forPaths(paths).then((r) => {
      if (!cancelled && r.ok) setByPath(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, token]);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  /** Tags attached to a path (only meaningful for currently visible entries). */
  const getTags = useCallback(
    (path: string): Tag[] =>
      (byPath[path] ?? [])
        .map((id) => tagById.get(id))
        .filter((t): t is Tag => t !== undefined),
    [byPath, tagById],
  );

  const run = useCallback(
    async <T>(op: Promise<Result<T>>) => {
      const result = await op;
      if (result.ok) refresh();
      else notifyError(result.error);
      return result;
    },
    [refresh, notifyError],
  );

  const create = useCallback(
    async (name: string): Promise<Tag | null> => {
      const result = await run(window.tags.create(name));
      return result.ok ? result.data : null;
    },
    [run],
  );

  const rename = useCallback(
    (id: number, name: string) => run(window.tags.rename(id, name)),
    [run],
  );
  const remove = useCallback((id: number) => run(window.tags.remove(id)), [run]);
  const assign = useCallback(
    (paths: string[], tagId: number) => run(window.tags.assign(paths, tagId)),
    [run],
  );
  const unassign = useCallback(
    (paths: string[], tagId: number) => run(window.tags.unassign(paths, tagId)),
    [run],
  );

  return { tags, getTags, refresh, create, rename, remove, assign, unassign };
}

export type TagState = ReturnType<typeof useTagState>;
