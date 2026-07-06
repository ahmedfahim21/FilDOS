import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ChatMention,
  ChatSessionMeta,
  ChatTurn,
  LlmModelStatus,
  SemanticHit,
} from '@shared/types';
import { DEFAULT_LLM_MODEL_ID, getLlmModelDef } from '@shared/llmModels';

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
  setModelId: (id: string) => void;
  /** Download a catalog model; progress lands in `statuses`. */
  download: (id: string) => Promise<void>;
  send: (args: {
    text: string;
    mentions: ChatMention[];
    command?: string;
    cwd?: string;
  }) => Promise<void>;
  /** Abort the in-flight answer (its partial text is kept). */
  stop: () => void;
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
  const activeRequest = useRef<string | null>(null);

  // Restore the picked model and fetch catalog statuses once.
  useEffect(() => {
    window.prefs.get().then((prefs) => {
      if (prefs.ai?.llmModelId) setModelIdState(prefs.ai.llmModelId);
    });
    window.llm.models().then((res) => {
      if (!res.ok) return;
      setStatuses(Object.fromEntries(res.data.map((s) => [s.modelId, s])));
    });
  }, []);

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

  const send = useCallback(
    async ({ text, mentions, command, cwd }: { text: string; mentions: ChatMention[]; command?: string; cwd?: string }) => {
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
          status: 'done' as const,
        })),
      );
      setSessionId(id);
      // Continue with the model the session last used, when it's still in the catalog.
      const meta = sessions.find((s) => s.id === id);
      if (meta?.modelId && getLlmModelDef(meta.modelId)) setModelId(meta.modelId);
    },
    [busy, sessions, setModelId],
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
        setModelId,
        download,
        send,
        stop,
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
