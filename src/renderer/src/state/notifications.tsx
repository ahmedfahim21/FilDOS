import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AiModelState, IndexProgress } from '@shared/types';
import { getModelDef } from '@shared/aiModels';
import { LLM_MODELS } from '@shared/llmModels';

/** What produced the activity — a model download or the background indexer. */
export type NotificationKind = 'download' | 'index';
/** Lifecycle of one activity: running, finished, or failed. */
export type NotificationStatus = 'active' | 'done' | 'error';

/** One row in the notifications center. */
export interface AppNotification {
  /** Stable key: `model:<id>` or `index`. */
  id: string;
  kind: NotificationKind;
  /** Primary line, e.g. a model label or "Indexing files". */
  title: string;
  /** Secondary line, e.g. "128 of 540 files" or "Downloaded". */
  detail: string;
  status: NotificationStatus;
  /** Fraction in [0,1] while `active`; undefined = indeterminate. */
  progress?: number;
  /** Error detail when `status === 'error'`. */
  message?: string;
  updatedAt: number;
}

interface NotificationsContextValue {
  /** Newest/active first. */
  items: AppNotification[];
  /** Downloads + index runs currently in flight. */
  activeCount: number;
  /** A finished/failed item the user hasn't opened the panel to see yet. */
  unseen: boolean;
  /** At least one completed/failed (clearable) item exists. */
  hasCleared: boolean;
  /** Panel open/close — suppresses the unseen dot while the list is on screen. */
  setOpen: (open: boolean) => void;
  /** Remove one finished/failed item. */
  dismiss: (id: string) => void;
  /** Remove every finished/failed item, leaving anything still running. */
  clear: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Human label for a model id — embedding catalog, then chat catalog, then a
 * humanized fallback for user-added GGUF ids (`hf:owner/repo`, URLs). */
function modelLabel(id: string): string {
  const embed = getModelDef(id);
  if (embed) return embed.label;
  const llm = LLM_MODELS.find((m) => m.id === id);
  if (llm) return llm.label;
  const base = (id.split(/[/\\]/).pop() ?? id).replace(/\.gguf$/i, '');
  return base || id;
}

function statusOf(state: AiModelState): NotificationStatus | null {
  if (state === 'downloading') return 'active';
  if (state === 'ready') return 'done';
  if (state === 'error') return 'error';
  return null; // 'absent' — nothing to show
}

/**
 * Aggregates transient background activity — embedding + chat model downloads
 * and the indexer — into a persistent, session-scoped feed for the top-bar
 * notifications center. It subscribes directly to the three main-process
 * progress streams (independent of the AI/Chat/Indexing contexts) so it works
 * everywhere, and keeps completed rows around (marked done/error) until the
 * user clears them. A download only enters the feed once it's actively
 * downloading, so already-installed models don't flood the list on launch.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, AppNotification>>({});
  const [unseen, setUnseen] = useState(false);
  // Mirrors the last status per id so we can detect create/complete transitions
  // without reading state inside a setState updater.
  const lastStatus = useRef<Record<string, NotificationStatus>>({});
  const openRef = useRef(false);

  const push = useCallback((n: AppNotification) => {
    const prev = lastStatus.current[n.id];
    const created = prev === undefined;
    const completed = n.status !== 'active' && prev !== n.status;
    lastStatus.current[n.id] = n.status;
    if ((created || completed) && !openRef.current) setUnseen(true);
    setMap((m) => ({ ...m, [n.id]: n }));
  }, []);

  const remove = useCallback((id: string) => {
    delete lastStatus.current[id];
    setMap((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  }, []);

  // Shared handler for both model download streams (embedding + chat share the
  // { modelId, state, progress, message } shape).
  const onModel = useCallback(
    (s: { modelId: string; state: AiModelState; progress?: number; message?: string }) => {
      const id = `model:${s.modelId}`;
      const exists = lastStatus.current[id] !== undefined;
      const status = statusOf(s.state);
      // Ignore terminal/absent events for models we never saw downloading —
      // that keeps pre-installed models out of the feed on startup.
      if (!status || (!exists && status !== 'active')) return;
      push({
        id,
        kind: 'download',
        title: modelLabel(s.modelId),
        detail:
          status === 'active'
            ? s.progress != null
              ? `Downloading · ${Math.round(s.progress * 100)}%`
              : 'Downloading…'
            : status === 'done'
              ? 'Download complete'
              : 'Download failed',
        status,
        progress: status === 'active' ? s.progress : undefined,
        message: s.message,
        updatedAt: Date.now(),
      });
    },
    [push],
  );

  const onIndex = useCallback(
    (p: IndexProgress) => {
      const id = 'index';
      const exists = lastStatus.current[id] !== undefined;
      const active = p.state === 'scanning' || p.state === 'indexing' || p.state === 'paused';
      // Only start tracking once a run is actually underway.
      if (!exists && !active) return;

      let status: NotificationStatus;
      let detail: string;
      let progress: number | undefined;
      const frac = p.total > 0 ? Math.min(1, p.indexed / p.total) : undefined;

      if (p.state === 'scanning') {
        status = 'active';
        detail = `Scanning… ${p.scanned.toLocaleString()} files`;
        progress = undefined;
      } else if (p.state === 'indexing') {
        status = 'active';
        detail = `${p.indexed.toLocaleString()} of ${p.total.toLocaleString()} files`;
        progress = frac;
      } else if (p.state === 'paused') {
        status = 'active';
        detail = 'Paused';
        progress = frac;
      } else if (p.state === 'error') {
        status = 'error';
        detail = p.message || 'Indexing failed';
      } else {
        // idle — the run finished (or there was nothing to do).
        status = 'done';
        detail =
          p.indexed > 0
            ? `Indexed ${p.indexed.toLocaleString()} files${p.errors > 0 ? ` · ${p.errors} skipped` : ''}`
            : 'Everything up to date';
      }

      push({
        id,
        kind: 'index',
        title: 'Indexing files',
        detail,
        status,
        progress,
        message: p.message,
        updatedAt: Date.now(),
      });
    },
    [push],
  );

  useEffect(() => {
    const offs = [
      window.ai?.onModelProgress?.(onModel),
      window.llm?.onModelProgress?.(onModel),
      window.index?.onProgress?.(onIndex),
    ].filter(Boolean) as Array<() => void>;
    return () => offs.forEach((off) => off());
  }, [onModel, onIndex]);

  const setOpen = useCallback((open: boolean) => {
    openRef.current = open;
    if (open) setUnseen(false);
  }, []);

  const dismiss = useCallback((id: string) => remove(id), [remove]);

  const clear = useCallback(() => {
    setMap((m) => {
      const next: Record<string, AppNotification> = {};
      for (const [id, n] of Object.entries(m)) {
        if (n.status === 'active') next[id] = n;
        else delete lastStatus.current[id];
      }
      return next;
    });
  }, []);

  const value = useMemo<NotificationsContextValue>(() => {
    const items = Object.values(map).sort((a, b) => {
      const aActive = a.status === 'active' ? 1 : 0;
      const bActive = b.status === 'active' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.updatedAt - a.updatedAt;
    });
    const activeCount = items.filter((n) => n.status === 'active').length;
    const hasCleared = items.some((n) => n.status !== 'active');
    return { items, activeCount, unseen, hasCleared, setOpen, dismiss, clear };
  }, [map, unseen, setOpen, dismiss, clear]);

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
