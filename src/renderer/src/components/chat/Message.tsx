import { useState } from 'react';
import type { ChatToolCall, SemanticHit } from '@shared/types';
import type { ChatMessage } from '@/state/chat';
import { MarkdownLite } from '@/lib/markdownLite';
import { fileLogo } from '@/lib/fileLogo';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import { MentionChip } from './MentionChip';
import { TOOL_ICONS } from './util';

/** Ranked /find results under an answer — each row jumps to the file. */
export function SourcesCard({ hits, onOpen }: { hits: SemanticHit[]; onOpen: (hit: SemanticHit) => void }) {
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

/**
 * One file action the Assistant performed — an activity chip above the answer.
 * Success ticks mint; a failed action shows why in strawberry.
 */
export function ToolCallRow({ call }: { call: ChatToolCall }) {
  return (
    <div className="border-border bg-muted/40 flex w-fit max-w-full items-center gap-1.5 rounded-lg border px-2 py-1">
      <Icon
        name={TOOL_ICONS[call.name] ?? 'sparkles'}
        size={12}
        className={cn('shrink-0', call.ok ? 'text-mint' : 'text-strawberry')}
      />
      <span
        className={cn('truncate text-2xs', call.ok ? 'text-foreground' : 'text-strawberry')}
        title={call.paths?.join('\n')}
      >
        {call.summary}
      </span>
      <Icon
        name={call.ok ? 'check' : 'close'}
        size={10}
        className={cn('shrink-0', call.ok ? 'text-mint' : 'text-strawberry')}
      />
    </div>
  );
}

/** The mint "thinking" indicator: three softly bouncing dots. */
export function TypingDots() {
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
export function CopyButton({ text }: { text: string }) {
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

/**
 * One rendered bubble in the conversation. `variant` widens the assistant's
 * answer column on the maximized page while keeping the rail compact; the user
 * bubble stays a right-aligned pill on both.
 */
export function Message({
  message,
  onOpenSource,
  variant = 'rail',
}: {
  message: ChatMessage;
  onOpenSource: (hit: SemanticHit) => void;
  variant?: 'rail' | 'page';
}) {
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

  const thinking = message.status === 'streaming' && !message.content && !message.toolCalls?.length;
  return (
    <div className="group flex flex-col items-start">
      {!!message.toolCalls?.length && (
        <div className="mb-1.5 flex w-full flex-col gap-1">
          {message.toolCalls.map((call, ix) => (
            <ToolCallRow key={ix} call={call} />
          ))}
        </div>
      )}
      {thinking ? (
        <TypingDots />
      ) : (
        <div className={cn('text-foreground w-full max-w-full break-words', variant === 'page' && 'text-[0.95rem]')}>
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
