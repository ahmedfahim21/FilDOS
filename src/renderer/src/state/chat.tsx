import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {
  ChatMention,
  ChatSessionMeta,
  ChatToolCall,
  ChatTurn,
  LlmModelStatus,
  SemanticHit,
} from '@shared/types';
import {
  DEFAULT_LLM_MODEL_ID,
  LLM_MODELS,
  parseCustomModelInput,
  recommendLlmModel,
  type LlmModelConfig,
  type LlmModelDef,
  type LlmSystemSpecs,
} from '@shared/llmModels';

/** One rendered bubble in the Assistant conversation. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Files/folders the user attached (user messages). */
  mentions?: ChatMention[];
  /** Slash command the message ran with (user messages). */
  command?: string;
  /** Semantic hits backing a /find answer (assistant messages). */
  sources?: SemanticHit[];
  /** File actions the Assistant performed while answering (assistant messages). */
  toolCalls?: ChatToolCall[];
  /** Assistant messages stream in; errors keep any partial text. */
  status?: 'streaming' | 'done' | 'error';
  error?: string;
}

interface ChatContextValue {
  messages: ChatMessage[];
  /** True while an answer is streaming (send is disabled). */
  busy: boolean;
  /** Selected chat model id (persisted to prefs.ai.llmModelId). */
  modelId: string;
  /** Live status per catalog model id. */
  statuses: Record<string, LlmModelStatus>;
  /** True once the selected model is downloaded. */
  modelReady: boolean;
  /** The saved session this conversation belongs to (null until first send). */
  sessionId: string | null;
  /** Saved conversations, most recent first (refreshed via refreshSessions). */
  sessions: ChatSessionMeta[];
  /** What this machine can run (null until probed). */
  specs: LlmSystemSpecs | null;
  /** The catalog model recommended for this machine (null until specs load). */
  recommendedId: string | null;
  /** Stored per-model generation settings (partials over the defaults). */
  configs: Record<string, Partial<LlmModelConfig>>;
  /** Every known model: the built-in catalog plus the user's custom additions. */
  allModels: LlmModelDef[];
  /** Look up any known model's definition. */
  modelDef: (id: string) => LlmModelDef | undefined;
  /** Add a model from user input (hf: URI / owner/repo / .gguf URL).
   * Returns an error message, or null on success. */
  addCustomModel: (input: string) => Promise<string | null>;
  /** Remove a custom model: forget the entry and delete any weights. */
  forgetCustomModel: (id: string) => Promise<void>;
  /** Patch one model's settings (persisted to prefs.ai.llmConfigs). */
  setConfig: (id: string, patch: Partial<LlmModelConfig> | null) => void;
  setModelId: (id: string) => void;
  /** Download a catalog model; progress lands in `statuses`. */
  download: (id: string) => Promise<void>;
  /** Delete a downloaded model's weights from disk. */
  removeModel: (id: string) => Promise<void>;
  send: (args: {
    text: string;
    mentions: ChatMention[];
    command?: string;
    cwd?: string;
    /** 'research' from the maximized page; 'chat' (default) from the rail. */
    mode?: 'chat' | 'research';
  }) => Promise<void>;
  /** Abort the in-flight answer (its partial text is kept). */
  stop: () => void;
  // Composer state lives here (not in ChatSurface) so an in-progress draft,
  // its attached mentions, and the Research toggle survive maximizing/
  // restoring — the rail and page mount separate ChatSurface instances.
  composerDraft: string;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  composerMentions: ChatMention[];
  setComposerMentions: Dispatch<SetStateAction<ChatMention[]>>;
  composerResearch: boolean;
  setComposerResearch: Dispatch<SetStateAction<boolean>>;
  /** Start a fresh conversation (the old one stays saved). */
  newChat: () => void;
  /** Reload the saved-session list. */
  refreshSessions: () => Promise<void>;
  /** Reopen a saved conversation to continue it. */
  openSession: (id: string) => Promise<void>;
  /** Delete a saved conversation. */
  deleteSession: (id: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/** Prior turns replayed for continuity (the main process caps again defensively). */
const HISTORY_TURNS = 8;

/**
 * Holds the Assistant conversation, the chat-model selection, model download
 * states, and the saved-session list. One `window.llm.onEvent` subscription
 * routes streamed chunks/sources/errors to the assistant message they belong
 * to by requestId. Persistence happens in the main process (db/chats.ts);
 * this side only tracks which session the live conversation continues.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [modelId, setModelIdState] = useState(DEFAULT_LLM_MODEL_ID);
  const [statuses, setStatuses] = useState<Record<string, LlmModelStatus>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [specs, setSpecs] = useState<LlmSystemSpecs | null>(null);
  const [configs, setConfigs] = useState<Record<string, Partial<LlmModelConfig>>>({});
  const [customModels, setCustomModels] = useState<LlmModelDef[]>([]);
  // Composer draft/mentions/Research toggle — persisted across the rail↔page swap.
  const [composerDraft, setComposerDraft] = useState('');
  const [composerMentions, setComposerMentions] = useState<ChatMention[]>([]);
  const [composerResearch, setComposerResearch] = useState(false);
  const activeRequest = useRef<string | null>(null);
  // Whether the user has a saved model pick; until then we auto-follow the
  // machine's recommendation once specs are probed (first-run gets a capable
  // model instead of the tiny catalog default).
  const userPickedModel = useRef(false);

  const refreshStatuses = useCallback(async () => {
    const res = await window.llm.models();
    if (res.ok) setStatuses(Object.fromEntries(res.data.map((s) => [s.modelId, s])));
  }, []);

  // Restore the picked model, per-model settings and custom models; fetch statuses.
  useEffect(() => {
    window.prefs
      .get()
      .then((prefs) => {
        if (prefs.ai?.llmModelId) {
          userPickedModel.current = true;
          setModelIdState(prefs.ai.llmModelId);
        }
        if (prefs.ai?.llmConfigs) setConfigs(prefs.ai.llmConfigs);
        if (prefs.ai?.llmCustomModels) setCustomModels(prefs.ai.llmCustomModels);
      })
      .then(refreshStatuses);
    // Probing loads the llama.cpp binding in the worker — cheap, no model load.
    window.llm.specs().then((res) => {
      if (res.ok) setSpecs(res.data);
    });
  }, [refreshStatuses]);

  // First run (no saved pick): follow the machine's recommendation once specs
  // land. Not persisted — it stays a suggestion until the user actively picks.
  useEffect(() => {
    if (specs && !userPickedModel.current) setModelIdState(recommendLlmModel(specs));
  }, [specs]);

  // Live download progress, keyed by model id.
  useEffect(
    () =>
      window.llm.onModelProgress((s) =>
        setStatuses((prev) => ({ ...prev, [s.modelId]: s })),
      ),
    [],
  );

  // Route streamed output into the assistant message carrying its requestId.
  useEffect(
    () =>
      window.llm.onEvent((event) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== event.requestId) return m;
            switch (event.type) {
              case 'chunk':
                return { ...m, content: m.content + event.text };
              case 'sources':
                return { ...m, sources: event.hits };
              case 'tool':
                return { ...m, toolCalls: [...(m.toolCalls ?? []), event.call] };
              case 'done':
                return { ...m, status: 'done' as const };
              case 'error':
                return { ...m, status: 'error' as const, error: event.error.message };
            }
          }),
        );
        if (event.type === 'done' || event.type === 'error') {
          if (activeRequest.current === event.requestId) {
            activeRequest.current = null;
            setBusy(false);
          }
        }
      }),
    [],
  );

  const setModelId = useCallback((id: string) => {
    userPickedModel.current = true;
    setModelIdState(id);
    // Merge into the existing ai prefs — a plain patch would clobber the
    // enable toggle and provider that state/ai.tsx owns.
    window.prefs
      .get()
      .then((p) =>
        window.prefs.set({
          ai: {
            enabled: p.ai?.enabled ?? false,
            activeProvider: p.ai?.activeProvider ?? 'embedded',
            ...p.ai,
            llmModelId: id,
          },
        }),
      )
      .catch(() => {});
  }, []);

  const download = useCallback(async (id: string) => {
    setStatuses((prev) => ({ ...prev, [id]: { modelId: id, state: 'downloading', progress: 0 } }));
    const res = await window.llm.download(id);
    if (!res.ok) {
      setStatuses((prev) => ({
        ...prev,
        [id]: { modelId: id, state: 'error', message: res.error.message },
      }));
    }
  }, []);

  const removeModel = useCallback(async (id: string) => {
    const res = await window.llm.remove(id);
    if (res.ok) setStatuses((prev) => ({ ...prev, [id]: { modelId: id, state: 'absent' } }));
  }, []);

  const allModels = useMemo(() => [...LLM_MODELS, ...customModels], [customModels]);
  const modelDef = useCallback(
    (id: string) => allModels.find((m) => m.id === id),
    [allModels],
  );

  /** Persist the custom-model list, merging over the stored ai prefs. */
  const persistCustomModels = useCallback((models: LlmModelDef[]) => {
    setCustomModels(models);
    window.prefs
      .get()
      .then((p) =>
        window.prefs.set({
          ai: {
            enabled: p.ai?.enabled ?? false,
            activeProvider: p.ai?.activeProvider ?? 'embedded',
            ...p.ai,
            llmCustomModels: models,
          },
        }),
      )
      .catch(() => {});
  }, []);

  const addCustomModel = useCallback(
    async (input: string): Promise<string | null> => {
      const def = parseCustomModelInput(input);
      if (!def) {
        return 'Enter a Hugging Face repo (owner/repo, optionally :quant) or a direct .gguf URL.';
      }
      if (allModels.some((m) => m.id === def.id)) return 'That model is already in the list.';
      persistCustomModels([...customModels, def]);
      // Register the new id with the worker so its status shows up as absent.
      setStatuses((prev) => ({ ...prev, [def.id]: { modelId: def.id, state: 'absent' } }));
      return null;
    },
    [allModels, customModels, persistCustomModels],
  );

  const setConfig = useCallback((id: string, patch: Partial<LlmModelConfig> | null) => {
    setConfigs((prev) => {
      const next = { ...prev };
      if (patch === null) {
        delete next[id]; // reset to defaults
      } else {
        next[id] = { ...prev[id], ...patch };
      }
      // Merge into the stored ai prefs (same discipline as setModelId).
      window.prefs
        .get()
        .then((p) =>
          window.prefs.set({
            ai: {
              enabled: p.ai?.enabled ?? false,
              activeProvider: p.ai?.activeProvider ?? 'embedded',
              ...p.ai,
              llmConfigs: next,
            },
          }),
        )
        .catch(() => {});
      return next;
    });
  }, []);

  const forgetCustomModel = useCallback(
    async (id: string) => {
      await window.llm.remove(id).catch(() => {}); // best effort — weights may not exist
      persistCustomModels(customModels.filter((m) => m.id !== id));
      setConfig(id, null); // drop its stored parameters too
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (modelId === id) setModelId(DEFAULT_LLM_MODEL_ID);
    },
    [customModels, persistCustomModels, modelId, setModelId, setConfig],
  );

  const send = useCallback(
    async ({ text, mentions, command, cwd, mode }: { text: string; mentions: ChatMention[]; command?: string; cwd?: string; mode?: 'chat' | 'research' }) => {
      const requestId = crypto.randomUUID();
      // History = completed exchanges so far, oldest first.
      const history: ChatTurn[] = messages
        .filter((m) => m.content && (m.role === 'user' || m.status === 'done'))
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: text, mentions, command },
        { id: requestId, role: 'assistant', content: '', status: 'streaming' },
      ]);
      activeRequest.current = requestId;
      setBusy(true);

      const res = await window.llm.send({
        requestId,
        sessionId: sessionId ?? undefined,
        modelId,
        prompt: text,
        history,
        mentions,
        command,
        cwd,
        mode,
      });
      if (res.ok) {
        setSessionId(res.data.sessionId);
      } else {
        // Errors normally arrive as stream events; this catches an invoke that
        // failed before the stream started (e.g. the worker died).
        setMessages((prev) =>
          prev.map((m) =>
            m.id === requestId && m.status === 'streaming'
              ? { ...m, status: 'error', error: res.error.message }
              : m,
          ),
        );
        if (activeRequest.current === requestId) {
          activeRequest.current = null;
          setBusy(false);
        }
      }
    },
    [messages, modelId, sessionId],
  );

  const stop = useCallback(() => {
    const id = activeRequest.current;
    if (id) window.llm.stop(id).catch(() => {});
  }, []);

  const newChat = useCallback(() => {
    if (busy) return;
    setMessages([]);
    setSessionId(null);
    setComposerDraft('');
    setComposerMentions([]);
  }, [busy]);

  const refreshSessions = useCallback(async () => {
    const res = await window.chats.list();
    if (res.ok) setSessions(res.data);
  }, []);

  const openSession = useCallback(
    async (id: string) => {
      if (busy) return;
      const res = await window.chats.messages(id);
      if (!res.ok) return;
      setMessages(
        res.data.map((m) => ({
          id: `stored-${m.id}`,
          role: m.role,
          content: m.content,
          command: m.command,
          mentions: m.mentions,
          sources: m.sources,
          toolCalls: m.toolCalls,
          status: 'done' as const,
        })),
      );
      setSessionId(id);
      // Continue with the model the session last used, when it's still known.
      const meta = sessions.find((s) => s.id === id);
      if (meta?.modelId && modelDef(meta.modelId)) setModelId(meta.modelId);
    },
    [busy, sessions, setModelId, modelDef],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await window.chats.remove(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        setMessages([]);
        setSessionId(null);
      }
    },
    [sessionId],
  );

  const modelReady = statuses[modelId]?.state === 'ready';
  const recommendedId = specs ? recommendLlmModel(specs) : null;

  return (
    <ChatContext.Provider
      value={{
        messages,
        busy,
        modelId,
        statuses,
        modelReady,
        sessionId,
        sessions,
        specs,
        recommendedId,
        configs,
        allModels,
        modelDef,
        addCustomModel,
        forgetCustomModel,
        setConfig,
        setModelId,
        download,
        removeModel,
        send,
        stop,
        composerDraft,
        setComposerDraft,
        composerMentions,
        setComposerMentions,
        composerResearch,
        setComposerResearch,
        newChat,
        refreshSessions,
        openSession,
        deleteSession,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
