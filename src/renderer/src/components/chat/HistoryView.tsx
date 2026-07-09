import { useEffect } from 'react';
import type { ChatSessionMeta } from '@shared/types';
import { useChat } from '@/state/chat';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';

/** Saved conversations — reopen to continue, hover to delete. */
export function HistoryView({ onOpen }: { onOpen: (id: string) => void }) {
  const { sessions, sessionId, deleteSession, refreshSessions, modelDef } = useChat();
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-0.5 p-2">
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
              {s.modelId && modelDef(s.modelId) && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{modelDef(s.modelId)!.label}</span>
                </>
              )}
            </div>
          </button>
          <button
            onClick={() => deleteSession(s.id)}
            className="text-muted-foreground hover:text-strawberry focus-visible:ring-ring absolute top-2 right-2 grid size-6 place-items-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
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
