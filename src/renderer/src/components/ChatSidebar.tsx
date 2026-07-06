import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiModelState, ChatMention, ChatSessionMeta, Entry, SemanticHit } from '@shared/types';
import { CHAT_COMMANDS, getLlmModelDef, LLM_MODELS } from '@shared/llmModels';
import { useChat, type ChatMessage } from '@/state/chat';
import { useNavigation } from '@/state/navigation';
import { activeToken, completeToken, parseCommand, pruneMentions } from '@/lib/chatComposer';
import { MarkdownLite } from '@/lib/markdownLite';
import { fileLogo } from '@/lib/fileLogo';
import { timeAgo } from '@/lib/format';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Mark } from './Logo';

/**
 * Empty-state starters. Each card prefills the composer with a working recipe;
 * the tints follow the scoop-per-meaning rule (mint = AI/search, blueberry =
 * documents, grape = system/insight) — accents only, never body text.
 */
const SUGGESTIONS = [
  {
    icon: 'folder' as const,
    tint: 'bg-blueberry/10 text-blueberry',
    title: 'Summarize this folder',
    desc: 'A quick gist of everything in view',
    text: '/summarize ',
  },
  {
    icon: 'search' as const,
    tint: 'bg-mint/10 text-mint',
    title: 'Find a file',
    desc: 'Describe what you remember about it',
    text: '/find ',
  },
  {
    icon: 'info' as const,
    tint: 'bg-grape/10 text-grape',
    title: 'Explain a file',
    desc: 'Attach any file with @',
    text: '/explain @',
  },
];

/** Model lifecycle → status-dot scoop (the one place chat uses non-mint scoops). */
const STATE_DOT: Record<AiModelState, string> = {
  ready: 'bg-mint',
  downloading: 'bg-mango animate-pulse',
  error: 'bg-strawberry',
  absent: 'bg-muted-foreground/40',
};

/** The folder containing a path (for jumping to a source file). */
function parentOf(path: string): string {
  const sep = window.platform?.sep ?? '/';
  const ix = path.lastIndexOf(sep);
  return ix > 0 ? path.slice(0, ix) : sep;
}

/** The FilDOS file-type icon for a name we only know as a mention (no Entry). */
function iconFor(name: string, isDirectory: boolean): string {
  const dot = name.lastIndexOf('.');
  const ext = !isDirectory && dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return fileLogo({
    name,
    path: '',
    isDirectory,
    isSymlink: false,
    isHidden: false,
    size: 0,
    ext,
    modified: 0,
    created: 0,
  });
}

/** A small pill for one attached file/folder mention. */
function MentionChip({ mention, onRemove }: { mention: ChatMention; onRemove?: () => void }) {
  return (
    <span className="border-border bg-muted/60 text-foreground inline-flex max-w-44 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-2xs">
      <img src={iconFor(mention.name, mention.kind === 'folder')} alt="" className="size-3.5 shrink-0" />
      <span className="truncate" title={mention.path}>{mention.name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label={`Remove ${mention.name}`}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </span>
  );
}

/** Ranked /find results under an answer — each row jumps to the file. */
function SourcesCard({ hits, onOpen }: { hits: SemanticHit[]; onOpen: (hit: SemanticHit) => void }) {
  if (!hits.length) return null;
  return (
    <div className="border-border mt-2 w-full overflow-hidden rounded-lg border">
      <div className="border-border bg-muted/40 text-muted-foreground flex items-center gap-1.5 border-b px-2.5 py-1 text-3xs font-medium tracking-wider uppercase">
        Sources
        <span className="bg-mint/12 text-mint rounded-full px-1.5 font-mono normal-case">{hits.length}</span>
      </div>
      {hits.map((h) => (
        <button
          key={h.path}
          onClick={() => onOpen(h)}
          title={h.path}
          className="hover:bg-accent group flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        >
          <img src={fileLogo(h)} alt="" className="size-4 shrink-0" />
          <span className="text-foreground min-w-0 flex-1 truncate text-xs">{h.name}</span>
          {/* Relevance meter — an honest mint bar per hit. */}
          <span className="bg-border h-1 w-10 shrink-0 overflow-hidden rounded-full">
            <span
              className="bg-mint block h-full rounded-full"
              style={{ width: `${Math.round(Math.max(0.08, Math.min(1, h.score)) * 100)}%` }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

/** The mint "thinking" indicator: three softly bouncing dots. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1.5" aria-label="Thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="bg-mint size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  );
}

/** Copy-to-clipboard with a brief confirmation tick. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded-md"
      title="Copy answer"
      aria-label="Copy answer"
    >
      <Icon name={copied ? 'check' : 'copy'} size={12} className={cn(copied && 'text-mint')} />
    </button>
  );
}

function Message({ message, onOpenSource }: { message: ChatMessage; onOpenSource: (hit: SemanticHit) => void }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="bg-primary/10 max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2">
          {message.command && (
            <span className="bg-mint/12 text-mint mr-1.5 inline-block rounded px-1.5 py-px align-middle font-mono text-2xs font-medium">
              /{message.command}
            </span>
          )}
          <span className="text-foreground text-sm break-words whitespace-pre-wrap">{message.content}</span>
        </div>
        {!!message.mentions?.length && (
          <div className="flex max-w-[88%] flex-wrap justify-end gap-1">
            {message.mentions.map((m) => (
              <MentionChip key={m.path} mention={m} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const thinking = message.status === 'streaming' && !message.content;
  return (
    <div className="group flex flex-col items-start">
      {thinking ? (
        <TypingDots />
      ) : (
        <div className="text-foreground w-full max-w-full break-words">
          <MarkdownLite text={message.content} />
          {message.status === 'streaming' && (
            <span className="bg-mint ml-0.5 inline-block h-3.5 w-0.5 animate-pulse align-middle" />
          )}
        </div>
      )}
      {message.sources && <SourcesCard hits={message.sources} onOpen={onOpenSource} />}
      {message.status === 'error' && (
        <div className="border-strawberry/30 bg-strawberry/5 text-strawberry mt-1.5 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
          <Icon name="info" size={12} className="shrink-0" />
          {message.error ?? 'Something went wrong.'}
        </div>
      )}
      {message.status === 'done' && message.content && (
        <div className="mt-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <CopyButton text={message.content} />
        </div>
      )}
    </div>
  );
}

/** The model chip in the composer footer — opens the picker as a drop-up. */
function ModelChip() {
  const { modelId, statuses, setModelId } = useChat();
  const current = getLlmModelDef(modelId);
  const state: AiModelState = statuses[modelId]?.state ?? 'absent';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1.5 rounded-md px-1.5 py-1 text-2xs font-medium"
          title="Choose the chat model"
        >
          <span className={cn('size-1.5 rounded-full', STATE_DOT[state])} />
          {current?.label ?? modelId}
          <Icon name="chevron" size={10} className="-rotate-90 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        {LLM_MODELS.map((def) => {
          const status = statuses[def.id];
          const s: AiModelState = status?.state ?? 'absent';
          return (
            <DropdownMenuItem
              key={def.id}
              onClick={() => setModelId(def.id)}
              className="flex-col items-start gap-0.5 py-2"
            >
              <div className="flex w-full items-center gap-2">
                <span className={cn('size-1.5 shrink-0 rounded-full', STATE_DOT[s])} />
                <span className="text-sm font-medium">{def.label}</span>
                <span className="text-muted-foreground ml-auto font-mono text-3xs">
                  {s === 'ready'
                    ? 'on device'
                    : s === 'downloading'
                      ? `${Math.round((status?.progress ?? 0) * 100)}%`
                      : `${(def.sizeMb / 1024).toFixed(1)} GB`}
                </span>
                {def.id === modelId && <Icon name="check" size={13} className="text-mint" />}
              </div>
              <span className="text-muted-foreground pl-3.5 text-2xs">{def.description}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Saved conversations — reopen to continue, hover to delete. */
function HistoryView({ onOpen }: { onOpen: (id: string) => void }) {
  const { sessions, sessionId, deleteSession, refreshSessions } = useChat();
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  if (!sessions.length) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Icon name="clock" size={20} />
        <p className="text-xs">No saved conversations yet. Everything you ask is kept here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {sessions.map((s: ChatSessionMeta) => (
        <div
          key={s.id}
          className={cn(
            'group hover:bg-accent relative rounded-lg px-2.5 py-2 transition-colors',
            s.id === sessionId && 'bg-accent',
          )}
        >
          <button onClick={() => onOpen(s.id)} className="block w-full text-left">
            <div className="flex items-center gap-1.5">
              {s.id === sessionId && <span className="bg-mint size-1.5 shrink-0 rounded-full" />}
              <span className="text-foreground min-w-0 flex-1 truncate pr-6 text-xs font-medium">{s.title}</span>
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-3xs">
              <span>{timeAgo(s.updatedAt)}</span>
              <span aria-hidden>·</span>
              <span>{s.messageCount} messages</span>
              {s.modelId && getLlmModelDef(s.modelId) && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{getLlmModelDef(s.modelId)!.label}</span>
                </>
              )}
            </div>
          </button>
          <button
            onClick={() => deleteSession(s.id)}
            className="text-muted-foreground hover:text-strawberry absolute top-2 right-2 grid size-6 place-items-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
            title="Delete conversation"
            aria-label={`Delete "${s.title}"`}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * The Assistant rail — chat with your files, powered by a fully on-device LLM.
 * Mention a file with `@`, a folder with `#`, start with `/` for commands
 * (summarize, find, explain, compare). Conversations are saved automatically
 * and can be reopened from the history view. Docked to the right of the
 * content pane; the header aligns with the location row (h-11 + border-b).
 */
export function ChatSidebar({ onClose }: { onClose: () => void }) {
  const chat = useChat();
  const nav = useNavigation();

  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [popupIx, setPopupIx] = useState(0);
  // Esc hides the popup for the token being typed; typing again re-opens it.
  const [dismissedTokenStart, setDismissedTokenStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // The current folder's entries feed the @/# autocomplete.
  useEffect(() => {
    let cancelled = false;
    window.fsapi.listDir(nav.currentPath).then((res) => {
      if (!cancelled) setEntries(res.ok ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [nav.currentPath]);

  // Keep the conversation pinned to the newest message while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, view]);

  // Grow the textarea with its content (up to ~5 lines), including
  // programmatic changes (suggestion clicks, clearing after send).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft, view]);

  // Restore the caret after a programmatic completion.
  useEffect(() => {
    if (pendingCaret.current === null) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  }, [draft]);

  const token = useMemo(() => activeToken(draft, caret), [draft, caret]);

  const options = useMemo(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    if (token.trigger === '/') {
      return CHAT_COMMANDS.filter((c) => c.id.startsWith(q)).map((c) => ({
        key: c.id,
        label: `/${c.id}`,
        detail: c.description,
        image: null as string | null,
        complete: c.id,
        entry: null as Entry | null,
      }));
    }
    const wantFolders = token.trigger === '#';
    return entries
      .filter((e) => e.isDirectory === wantFolders && !e.isHidden)
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((e) => ({
        key: e.path,
        label: e.name,
        detail: null as string | null,
        image: fileLogo(e),
        complete: e.name,
        entry: e,
      }));
  }, [token, entries]);

  const popupOpen = !!token && options.length > 0 && dismissedTokenStart !== token.start;

  // Clamp the highlighted row when the option list changes.
  useEffect(() => setPopupIx(0), [token?.trigger, token?.start, options.length]);

  const pick = useCallback(
    (ix: number) => {
      if (!token || !options[ix]) return;
      const opt = options[ix];
      const next = completeToken(draft, caret, token, opt.complete);
      if (opt.entry) {
        const mention: ChatMention = {
          kind: token.trigger === '#' ? 'folder' : 'file',
          path: opt.entry.path,
          name: opt.entry.name,
        };
        setMentions((prev) => (prev.some((m) => m.path === mention.path) ? prev : [...prev, mention]));
      }
      setDraft(next.text);
      setCaret(next.caret);
      pendingCaret.current = next.caret;
      setDismissedTokenStart(null);
    },
    [token, options, draft, caret],
  );

  const liveMentions = useMemo(() => pruneMentions(draft, mentions), [draft, mentions]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || chat.busy || !chat.modelReady) return;
    const { command, body } = parseCommand(text);
    chat.send({
      text: body.trim() || text,
      mentions: pruneMentions(text, mentions),
      command,
      cwd: nav.currentPath,
    });
    setDraft('');
    setCaret(0);
    setMentions([]);
  }, [draft, mentions, chat, nav.currentPath]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPopupIx((i) => (i + 1) % options.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPopupIx((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(popupIx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedTokenStart(token?.start ?? null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  /** The @ / # / / keycaps under the composer insert their trigger at the caret. */
  const insertTrigger = useCallback(
    (trigger: '@' | '#' | '/') => {
      if (trigger === '/') {
        if (draft.trim()) return;
        setDraft('/');
        setCaret(1);
        pendingCaret.current = 1;
        return;
      }
      const pos = textareaRef.current?.selectionStart ?? draft.length;
      const before = draft.slice(0, pos);
      const insert = (before && !/\s$/.test(before) ? ' ' : '') + trigger;
      setDraft(before + insert + draft.slice(pos));
      const c = pos + insert.length;
      setCaret(c);
      pendingCaret.current = c;
    },
    [draft],
  );

  const openSource = useCallback(
    (hit: SemanticHit) => {
      nav.navigate(hit.isDirectory ? hit.path : parentOf(hit.path));
    },
    [nav],
  );

  const model = getLlmModelDef(chat.modelId);
  const status = chat.statuses[chat.modelId];
  const downloading = status?.state === 'downloading';

  return (
    <aside className="border-border bg-card animate-in slide-in-from-right-4 fade-in-0 flex w-96 shrink-0 flex-col border-l duration-200">
      <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Mark className="size-4" />
        <span className="text-foreground text-sm font-medium">Assistant</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setView((v) => (v === 'history' ? 'chat' : 'history'))}
            className={cn(
              'text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md',
              view === 'history' && 'bg-accent text-foreground',
            )}
            title="Conversation history"
            aria-label="Conversation history"
            aria-pressed={view === 'history'}
          >
            <Icon name="clock" size={14} />
          </button>
          <button
            onClick={() => {
              chat.newChat();
              setView('chat');
              textareaRef.current?.focus();
            }}
            disabled={chat.busy}
            className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md disabled:opacity-40"
            title="New conversation"
            aria-label="New conversation"
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md"
            title="Close Assistant"
            aria-label="Close Assistant"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </header>

      {/* Body: the conversation, or the saved-session history. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {view === 'history' ? (
          <HistoryView
            onOpen={(id) => {
              chat.openSession(id);
              setView('chat');
            }}
          />
        ) : chat.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="border-border bg-background flex size-14 items-center justify-center rounded-2xl border shadow-sm">
              <Mark className="size-7" />
            </div>
            <div className="space-y-1.5">
              <div className="text-foreground text-sm font-medium">Ask your files anything</div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Answers come from a model running entirely on this device — nothing leaves your system.
              </p>
            </div>
            {/* Syntax legend as keycaps. */}
            <div className="flex items-center gap-3">
              {(
                [
                  ['@', 'file'],
                  ['#', 'folder'],
                  ['/', 'command'],
                ] as const
              ).map(([key, label]) => (
                <span key={key} className="text-muted-foreground flex items-center gap-1 text-2xs">
                  <kbd className="border-border bg-background text-foreground rounded border px-1.5 py-0.5 font-mono text-2xs shadow-[0_1px_0_0_var(--color-border)]">
                    {key}
                  </kbd>
                  {label}
                </span>
              ))}
            </div>
            <div className="flex w-full flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => {
                    setDraft(s.text);
                    setCaret(s.text.length);
                    pendingCaret.current = s.text.length;
                  }}
                  className="border-border bg-background hover:border-mint/40 group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors"
                >
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', s.tint)}>
                    <Icon name={s.icon} size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="text-foreground block truncate text-xs font-medium">{s.title}</span>
                    <span className="text-muted-foreground block truncate text-2xs">{s.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4">
            {chat.messages.map((m) => (
              <Message key={m.id} message={m} onOpenSource={openSource} />
            ))}
          </div>
        )}
      </div>

      {/* Model download call-to-action (shown until the picked model is local). */}
      {view === 'chat' && !chat.modelReady && (
        <div className="px-3 pt-3">
          <div className="border-border bg-background rounded-xl border p-3">
            {downloading ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-2xs">
                  <span className="text-foreground font-medium">Downloading {model?.label}</span>
                  <span className="text-muted-foreground font-mono">
                    {Math.round((status?.progress ?? 0) * 100)}%
                  </span>
                </div>
                <div className="bg-border h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-mint h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-foreground text-xs font-medium">
                    {status?.state === 'error' ? 'Download failed' : `Get ${model?.label}`}
                  </div>
                  <div className="text-muted-foreground truncate text-2xs">
                    {status?.state === 'error'
                      ? (status.message ?? 'Something went wrong.')
                      : `One-time ${((model?.sizeMb ?? 0) / 1024).toFixed(1)} GB download · runs offline`}
                  </div>
                </div>
                <button
                  onClick={() => chat.download(chat.modelId)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
                >
                  {status?.state === 'error' ? 'Retry' : 'Download'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Composer */}
      {view === 'chat' && (
        <div className="relative p-3">
          {popupOpen && (
            <div className="border-border bg-popover absolute right-3 bottom-full left-3 z-10 mb-1.5 overflow-hidden rounded-xl border shadow-xl">
              <div className="border-border text-muted-foreground border-b px-3 py-1 text-3xs font-medium tracking-wider uppercase">
                {token!.trigger === '/' ? 'Commands' : token!.trigger === '#' ? 'Folders' : 'Files'}
              </div>
              {options.map((opt, ix) => (
                <button
                  key={opt.key}
                  onMouseEnter={() => setPopupIx(ix)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep the textarea focused
                    pick(ix);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
                    ix === popupIx ? 'bg-accent' : '',
                  )}
                >
                  {opt.image ? (
                    <img src={opt.image} alt="" className="size-4 shrink-0" />
                  ) : (
                    <span className="text-mint w-4 shrink-0 text-center font-mono font-bold">/</span>
                  )}
                  <span className="text-foreground shrink-0 font-medium">{opt.label}</span>
                  {opt.detail && <span className="text-muted-foreground truncate">{opt.detail}</span>}
                  {ix === popupIx && (
                    <kbd className="border-border text-muted-foreground ml-auto shrink-0 rounded border px-1 font-mono text-3xs">
                      ⏎
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="border-border bg-background focus-within:ring-mint/30 focus-within:border-mint/50 rounded-xl border transition-shadow focus-within:ring-2">
            {liveMentions.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pt-2.5">
                {liveMentions.map((m) => (
                  <MentionChip
                    key={m.path}
                    mention={m}
                    onRemove={() => {
                      setMentions((prev) => prev.filter((x) => x.path !== m.path));
                      const tokenText = (m.kind === 'file' ? '@' : '#') + m.name;
                      setDraft((d) => d.replace(tokenText + ' ', '').replace(tokenText, ''));
                    }}
                  />
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setDismissedTokenStart(null);
              }}
              onKeyDown={onKeyDown}
              onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              placeholder="Ask about your files…"
              className="text-foreground placeholder:text-muted-foreground max-h-30 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none"
            />

            <div className="flex items-center gap-1 px-2 pb-2">
              <ModelChip />
              <div className="flex-1" />
              {(['@', '#', '/'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => insertTrigger(t)}
                  disabled={t === '/' && !!draft.trim()}
                  className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded border px-1.5 py-0.5 font-mono text-2xs disabled:opacity-30"
                  title={t === '@' ? 'Mention a file' : t === '#' ? 'Mention a folder' : 'Run a command'}
                >
                  {t}
                </button>
              ))}
              {chat.busy ? (
                <button
                  onClick={chat.stop}
                  className="border-border text-foreground hover:bg-accent ml-1 grid size-7 shrink-0 place-items-center rounded-full border"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <span className="bg-foreground size-2 rounded-[2px]" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!draft.trim() || !chat.modelReady}
                  className="bg-primary text-primary-foreground ml-1 grid size-7 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-35"
                  title="Send"
                  aria-label="Send"
                >
                  <Icon name="up" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
