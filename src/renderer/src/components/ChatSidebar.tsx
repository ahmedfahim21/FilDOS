import { useState } from 'react';
import { useChat } from '@/state/chat';
import { useNavigation } from '@/state/navigation';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Mark } from './Logo';
import { ChatSurface } from './chat';

/**
 * The Assistant rail — chat with your files, powered by a fully on-device LLM.
 * Mention a file with `@`, a folder with `#`, start with `/` for commands
 * (summarize, find, explain, compare). Conversations are saved automatically
 * and can be reopened from the history view. Docked to the right of the content
 * pane; the header aligns with the location row (h-11 + border-b).
 *
 * The body + composer live in the shared {@link ChatSurface}, so **Maximize**
 * opens the same live conversation in the full-window {@link ChatPage} research
 * view (`nav.openPage({ kind: 'chat' })`).
 */
export function ChatSidebar({ onClose }: { onClose: () => void }) {
  const chat = useChat();
  const nav = useNavigation();
  const [view, setView] = useState<'chat' | 'history'>('chat');

  return (
    <aside className="border-border bg-card animate-in slide-in-from-right-4 fade-in-0 flex w-96 shrink-0 flex-col border-l duration-200">
      <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Mark className="size-4" />
        <span className="text-foreground text-sm font-medium">Assistant</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => nav.openPage({ kind: 'chat' })}
            className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md"
            title="Maximize to research view"
            aria-label="Maximize to research view"
          >
            <Icon name="maximize" size={14} />
          </button>
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

      <ChatSurface
        variant="rail"
        view={view}
        onOpenSession={(id) => {
          chat.openSession(id);
          setView('chat');
        }}
      />
    </aside>
  );
}
