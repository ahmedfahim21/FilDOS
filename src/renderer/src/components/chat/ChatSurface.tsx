import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Entry, SemanticHit } from '@shared/types';
import { CHAT_COMMANDS } from '@shared/llmModels';
import { useChat } from '@/state/chat';
import { useNavigation } from '@/state/navigation';
import {
  activeToken,
  completeToken,
  parseCommand,
  pruneMentions,
  tokenBeforeCaret,
} from '@/lib/chatComposer';
import { fileLogo } from '@/lib/fileLogo';
import { cn } from '@/lib/utils';
import type { ChatMention } from '@shared/types';
import { Icon } from '@/components/Icon';
import { Mark } from '@/components/Logo';
import { Conversation } from './Conversation';
import { Message } from './Message';
import { ModelChip } from './ModelChip';
import { HistoryView } from './HistoryView';
import { MentionChip } from './MentionChip';
import { PromptHighlight } from './PromptHighlight';
import { ResearchCallout } from './ResearchCallout';
import { SUGGESTIONS, parentOf } from './util';

/** Textarea + its colored mirror share these exact box metrics so glyphs align. */
const FIELD_BOX = 'px-3 py-2.5 text-sm leading-5';

/**
 * The shared Assistant body: the streaming conversation (or the saved-session
 * history) plus the rich composer. Both the docked rail (`ChatSidebar`) and the
 * expanded page (`ChatPage`) render this — they differ only in their outer
 * chrome and in `variant` (compact rail vs. centered page column).
 *
 * **Research** is an explicit, per-surface toggle in the composer (like
 * ChatGPT/Perplexity), independent of expanding: when on, the message is sent
 * with `mode: 'research'`, which widens the harness in the main process (bigger
 * context window, a larger file-context budget, and the agentic search tool).
 */
export function ChatSurface({
  variant,
  view,
  onOpenSession,
}: {
  variant: 'rail' | 'page';
  view: 'chat' | 'history';
  onOpenSession: (id: string) => void;
}) {
  const chat = useChat();
  const nav = useNavigation();
  const page = variant === 'page';

  // Draft/mentions/research live in ChatProvider so they survive maximizing or
  // restoring (which unmounts one ChatSurface and mounts the other).
  const {
    composerDraft: draft,
    setComposerDraft: setDraft,
    composerMentions: mentions,
    setComposerMentions: setMentions,
    composerResearch: research,
    setComposerResearch: setResearch,
  } = chat;
  // Caret is transient DOM state; seed it at the end of any restored draft.
  const [caret, setCaret] = useState(() => draft.length);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [popupIx, setPopupIx] = useState(0);
  // Esc hides the popup for the token being typed; typing again re-opens it.
  const [dismissedTokenStart, setDismissedTokenStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
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

  // Grow the textarea with its content (up to ~5 lines), including
  // programmatic changes (suggestion clicks, clearing after send).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, page ? 200 : 120)}px`;
  }, [draft, view, page]);

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
    [token, options, draft, caret, setDraft, setMentions],
  );

  const liveMentions = useMemo(() => pruneMentions(draft, mentions), [draft, mentions]);

  const prefill = useCallback((text: string) => {
    setDraft(text);
    setCaret(text.length);
    pendingCaret.current = text.length;
  }, [setDraft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || chat.busy || !chat.modelReady) return;
    const { command, body } = parseCommand(text);
    chat.send({
      text: body.trim() || text,
      mentions: pruneMentions(text, mentions),
      command,
      cwd: nav.currentPath,
      mode: research ? 'research' : 'chat',
    });
    setDraft('');
    setCaret(0);
    setMentions([]);
  }, [draft, mentions, chat, nav.currentPath, research, setDraft, setMentions]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While an IME composition is active, Enter/keys confirm a candidate — let
    // the IME handle them instead of submitting or driving the popup.
    if (e.nativeEvent.isComposing) return;
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
    // Backspace at the end of a completed @file / #folder / /command removes
    // the whole token (and its chip) — an atomic mention, not plain text.
    if (e.key === 'Backspace' && !e.shiftKey) {
      const el = e.currentTarget;
      if (el.selectionStart != null && el.selectionStart === el.selectionEnd) {
        const del = tokenBeforeCaret(draft, el.selectionStart, mentions);
        if (del) {
          e.preventDefault();
          setDraft(draft.slice(0, del.start) + draft.slice(del.end));
          setCaret(del.start);
          pendingCaret.current = del.start;
          if (del.mention) setMentions((prev) => prev.filter((m) => m.path !== del.mention!.path));
          return;
        }
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
        prefill('/');
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
    [draft, prefill, setDraft],
  );

  const openSource = useCallback(
    (hit: SemanticHit) => {
      nav.navigate(hit.isDirectory ? hit.path : parentOf(hit.path));
    },
    [nav],
  );

  const model = chat.modelDef(chat.modelId);
  const status = chat.statuses[chat.modelId];
  const downloading = status?.state === 'downloading';

  if (view === 'history') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <HistoryView onOpen={onOpenSession} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation watch={chat.messages}>
        {chat.messages.length === 0 ? (
          <EmptyState variant={variant} onPick={prefill} />
        ) : (
          <div className={cn('flex flex-col gap-4 px-4 py-4', page && 'mx-auto max-w-3xl py-6')}>
            {chat.messages.map((m) => (
              <Message key={m.id} message={m} onOpenSource={openSource} variant={variant} />
            ))}
          </div>
        )}
      </Conversation>

      <div className={cn(page && 'mx-auto w-full max-w-3xl')}>
        {/* Research nudges toward a capable model when a small one is selected. */}
        {research && <ResearchCallout />}

        {/* Model download call-to-action (shown until the picked model is local). */}
        {!chat.modelReady && (
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
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground flex items-center gap-1.5 text-xs font-medium">
                        {status?.state === 'error' ? 'Download failed' : `Get ${model?.label}`}
                        {chat.recommendedId === chat.modelId && (
                          <span className="bg-mint/15 text-mint rounded-full px-1.5 py-px text-3xs font-medium">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate text-2xs">
                        {status?.state === 'error'
                          ? (status.message ?? 'Something went wrong.')
                          : model?.sizeMb
                            ? `One-time ${(model.sizeMb / 1024).toFixed(1)} GB download · runs offline`
                            : 'One-time download · runs offline'}
                      </div>
                    </div>
                    <button
                      onClick={() => chat.download(chat.modelId)}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
                    >
                      {status?.state === 'error' ? 'Retry' : 'Download'}
                    </button>
                  </div>
                  <button
                    onClick={() => nav.openPage({ kind: 'settings' })}
                    className="text-muted-foreground hover:text-foreground text-2xs underline-offset-2 hover:underline"
                  >
                    Compare and manage models in Settings
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="relative p-3">
          {popupOpen && (
            <div className="border-border material animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none absolute right-3 bottom-full left-3 z-10 mb-1.5 overflow-hidden rounded-xl border shadow-xl duration-150 ease-snappy">
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

            {/* Transparent-text textarea over its colored mirror (see PromptHighlight). */}
            <div className="relative">
              <PromptHighlight
                ref={overlayRef}
                text={draft}
                mentions={liveMentions}
                className={cn(
                  'text-foreground pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap',
                  FIELD_BOX,
                )}
              />
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
                onScroll={(e) => {
                  if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                placeholder={page ? 'Ask to research across your files…' : 'Ask about your files…'}
                className={cn(
                  // `break-words` matches the overlay's wrapping so the caret can't
                  // drift from the visible (mirrored) text on a long unbroken name.
                  'placeholder:text-muted-foreground caret-foreground relative w-full resize-none border-0 bg-transparent break-words text-transparent outline-none',
                  page ? 'max-h-50' : 'max-h-30',
                  FIELD_BOX,
                )}
              />
            </div>

            <div className="flex items-center gap-1 px-2 pb-2">
              <ModelChip />
              {/* Explicit Research toggle (ChatGPT/Perplexity-style): widens the
                  harness for cross-file research when on, off by default. */}
              <button
                onClick={() => setResearch((r) => !r)}
                aria-pressed={research}
                title={
                  research
                    ? 'Research on — searches across your files with more context'
                    : 'Research — search across your files with more context'
                }
                className={cn(
                  'flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-medium transition-colors',
                  research
                    ? 'bg-mint/15 text-mint'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon name="search" size={13} />
                Research
              </button>
              <div className="flex-1" />
              {(['@', '#', '/'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => insertTrigger(t)}
                  disabled={t === '/' && !!draft.trim()}
                  className={cn(
                    'border-border hover:bg-accent hover:text-foreground rounded border px-1.5 py-0.5 font-mono text-2xs disabled:opacity-30',
                    t === '@' && 'text-blueberry',
                    t === '#' && 'text-grape',
                    t === '/' && 'text-mint',
                  )}
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
      </div>
    </div>
  );
}

/** The zero-message welcome: syntax legend + starter recipes. */
function EmptyState({ variant, onPick }: { variant: 'rail' | 'page'; onPick: (text: string) => void }) {
  const page = variant === 'page';
  return (
    <div
      className={cn(
        'mx-auto flex h-full flex-col items-center justify-center gap-5 px-6 text-center',
        page && 'max-w-xl gap-6',
      )}
    >
      <div
        className={cn(
          'border-border bg-background flex items-center justify-center rounded-2xl border shadow-sm',
          page ? 'size-16' : 'size-14',
        )}
      >
        <Mark className={page ? 'size-8' : 'size-7'} />
      </div>
      <div className="space-y-1.5">
        <div className={cn('text-foreground font-medium', page ? 'text-base' : 'text-sm')}>
          {page ? 'Research across your files' : 'Ask your files anything'}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Answers come from a model running entirely on this device — nothing leaves your system.
        </p>
      </div>
      {/* Syntax legend as keycaps, in each trigger's scoop. */}
      <div className="flex items-center gap-3">
        {(
          [
            ['@', 'file', 'text-blueberry'],
            ['#', 'folder', 'text-grape'],
            ['/', 'command', 'text-mint'],
          ] as const
        ).map(([key, label, tint]) => (
          <span key={key} className="text-muted-foreground flex items-center gap-1 text-2xs">
            <kbd className={cn('border-border bg-background rounded border px-1.5 py-0.5 font-mono text-2xs shadow-[0_1px_0_0_var(--color-border)]', tint)}>
              {key}
            </kbd>
            {label}
          </span>
        ))}
      </div>
      <div className={cn('flex w-full flex-col gap-1.5', page && 'sm:grid sm:grid-cols-2')}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.text)}
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
  );
}
