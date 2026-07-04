import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AiModelStatus, Result } from '@shared/types';
import { getModelDef, IMAGE_MODEL_ID, INDEX_MODEL_IDS, RERANKER_MODEL_ID, TEXT_MODEL_ID } from '@shared/aiModels';

interface AiContextValue {
  /** Whether the user has enabled the AI features. */
  enabled: boolean;
  /** The selected provider id ('embedded' | 'cloud'). */
  activeProvider: string;
  /** Live status of the two internal models, keyed by id. */
  statuses: Record<string, AiModelStatus>;
  /** True once the text model is downloaded and ready (search/index can run). */
  ready: boolean;
  /** True while a download request is in flight. */
  busy: boolean;
  setEnabled: (value: boolean) => void;
  setProvider: (id: string) => void;
  /** Download both internal models (text + image). */
  downloadModels: () => Promise<void>;
  /** Download a single model by id (retry button). */
  downloadModel: (id: string) => Promise<Result<void>>;
  refreshStatuses: () => Promise<void>;
}

const AiContext = createContext<AiContextValue | null>(null);

/**
 * Holds the AI enable toggle + provider and the live status of the two models
 * the app manages automatically (a text model + CLIP for images — the user never
 * picks a model). Enabling AI downloads both. Statuses are fetched on mount and
 * kept fresh by the main-process progress stream.
 */
export function AiProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [activeProvider, setActiveProvider] = useState('embedded');
  const [statuses, setStatuses] = useState<Record<string, AiModelStatus>>({});
  const [busy, setBusy] = useState(false);

  const refreshStatuses = useCallback(async () => {
    const allIds = [...INDEX_MODEL_IDS, RERANKER_MODEL_ID];
    const entries = await Promise.all(
      allIds.map(async (id) => {
        const res = await window.ai.status(id);
        const status: AiModelStatus = res.ok
          ? res.data
          : { state: 'absent', modelId: id, dim: getModelDef(id)?.dim ?? 0 };
        return [id, status] as const;
      }),
    );
    setStatuses(Object.fromEntries(entries));
  }, []);

  const downloadModel = useCallback((id: string) => window.ai.download(id), []);

  const downloadModels = useCallback(async () => {
    setBusy(true);
    await window.ai.download(TEXT_MODEL_ID);
    await window.ai.download(IMAGE_MODEL_ID);
    setBusy(false);
    await refreshStatuses();
  }, [refreshStatuses]);

  // Load persisted AI settings once.
  useEffect(() => {
    window.prefs.get().then((prefs) => {
      if (!prefs.ai) return;
      setEnabledState(prefs.ai.enabled);
      setActiveProvider(prefs.ai.activeProvider);
    });
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

  const persist = useCallback((next: { enabled: boolean; activeProvider: string }) => {
    window.prefs.set({ ai: next }).catch(() => {});
  }, []);

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      persist({ enabled: value, activeProvider });
      if (value) downloadModels(); // auto-fetch both models on enable
    },
    [activeProvider, persist, downloadModels],
  );

  const setProvider = useCallback(
    (id: string) => {
      setActiveProvider(id);
      persist({ enabled, activeProvider: id });
    },
    [enabled, persist],
  );

  return (
    <AiContext.Provider
      value={{
        enabled,
        activeProvider,
        statuses,
        ready: enabled && statuses[TEXT_MODEL_ID]?.state === 'ready',
        busy,
        setEnabled,
        setProvider,
        downloadModels,
        downloadModel,
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
