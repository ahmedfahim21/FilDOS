import { useState } from 'react';
import { useChat } from '@/state/chat';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { PageChrome } from './Page';
import { ChatSurface } from './chat';

/**
 * The expanded Assistant — the docked rail's conversation given the full content
 * pane. Opened from the rail's Maximize button as a `{ kind: 'chat' }` page view,
 * so Back/Forward traverse it and the file sidebar stays put; it shares
 * {@link ChatProvider} with the rail, so the live conversation carries across.
 *
 * Expanding is purely about room — it is **not** research mode. Research is an
 * explicit toggle in the composer (see {@link ChatSurface}), available here and
 * in the rail alike.
 */
export function ChatPage({ onRestore }: { onRestore: () => void }) {
  const chat = useChat();
  const [view, setView] = useState<'chat' | 'history'>('chat');

  return (
    <div data-testid="chat-page" className="bg-background flex h-full min-h-0 flex-col">
      <PageChrome>
        <div className="flex items-center gap-0.5">
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
            <Icon name="clock" size={15} />
          </button>
          <button
            onClick={() => {
              chat.newChat();
              setView('chat');
            }}
            disabled={chat.busy}
            className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md disabled:opacity-40"
            title="New conversation"
            aria-label="New conversation"
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            onClick={onRestore}
            className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md"
            title="Restore to rail"
            aria-label="Restore to rail"
          >
            <Icon name="minimize" size={15} />
          </button>
        </div>
      </PageChrome>

      <ChatSurface
        variant="page"
        view={view}
        onOpenSession={(id) => {
          chat.openSession(id);
          setView('chat');
        }}
      />
    </div>
  );
}
