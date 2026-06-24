import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AiModelStatus, Result } from '@shared/types';
import { AI_MODELS, DEFAULT_MODEL_ID } from '@shared/aiModels';

interface AiContextValue {
  /** Whether the user has enabled the AI features. */
  enabled: boolean;
  /** The selected provider id ('embedded' | 'cloud'). */
  activeProvider: string;
  /** The selected embedding model id. */
  modelId: string;
  /** Status of every catalog model (the active one updates live while downloading). */
  statuses: Record<string, AiModelStatus>;
  /** The active model's status (shortcut for statuses[modelId]). */
  status: AiModelStatus | null;
  /** True while a download request is in flight. */
  busy: boolean;
  setEnabled: (value: boolean) => void;
  setProvider: (id: string) => void;
  setModel: (id: string) => void;
  /** Ensure the active model is downloaded; progress arrives via the status stream. */
  download: () => Promise<Result<void>>;
  refreshStatuses: () => Promise<void>;
}

const AiContext = createContext<AiContextValue | null>(null);

/**
 * Holds the AI settings (enable toggle + active provider + model) and the live
 * status of each catalog model. Settings persist to prefs; statuses are fetched
 * on mount and kept fresh by the main-process progress stream. Mirrors the other
 * renderer contexts (toast / clipboard).
 */
export function AiProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [activeProvider, setActiveProvider] = useState('embedded');
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [statuses, setStatuses] = useState<Record<string, AiModelStatus>>({});
  const [busy, setBusy] = useState(false);

  // Load persisted AI settings once.
  useEffect(() => {
    window.prefs.get().then((prefs) => {
      if (!prefs.ai) return;
      setEnabledState(prefs.ai.enabled);
      setActiveProvider(prefs.ai.activeProvider);
      if (prefs.ai.modelId) setModelId(prefs.ai.modelId);
    });
  }, []);

  const refreshStatuses = useCallback(async () => {
    const entries = await Promise.all(
      AI_MODELS.map(async (m) => {
        const res = await window.ai.status(m.id);
        const status: AiModelStatus = res.ok
          ? res.data
          : { state: 'absent', modelId: m.id, dim: m.dim };
        return [m.id, status] as const;
      }),
    );
    setStatuses(Object.fromEntries(entries));
  }, []);

  // Fetch statuses on mount and whenever the provider changes.
  useEffect(() => {
    refreshStatuses();
  }, [activeProvider, refreshStatuses]);

  // Live download/state progress from the worker, keyed by model id.
  useEffect(
    () => window.ai.onModelProgress((s) => setStatuses((prev) => ({ ...prev, [s.modelId]: s }))),
    [],
  );

  const persist = useCallback(
    (next: { enabled: boolean; activeProvider: string; modelId: string }) => {
      window.prefs.set({ ai: next }).catch(() => {});
    },
    [],
  );

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      persist({ enabled: value, activeProvider, modelId });
    },
    [activeProvider, modelId, persist],
  );

  const setProvider = useCallback(
    (id: string) => {
      setActiveProvider(id);
      persist({ enabled, activeProvider: id, modelId });
    },
    [enabled, modelId, persist],
  );

  const setModel = useCallback(
    (id: string) => {
      setModelId(id);
      persist({ enabled, activeProvider, modelId: id });
    },
    [enabled, activeProvider, persist],
  );

  const download = useCallback(async (): Promise<Result<void>> => {
    setBusy(true);
    const res = await window.ai.download();
    setBusy(false);
    await refreshStatuses();
    return res;
  }, [refreshStatuses]);

  return (
    <AiContext.Provider
      value={{
        enabled,
        activeProvider,
        modelId,
        statuses,
        status: statuses[modelId] ?? null,
        busy,
        setEnabled,
        setProvider,
        setModel,
        download,
        refreshStatuses,
      }}
    >
      {children}
    </AiContext.Provider>
  );
}

export function useAi(): AiContextValue {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAi must be used within AiProvider');
  return ctx;
}
