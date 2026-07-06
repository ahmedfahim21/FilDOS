import { useState } from 'react';
import { useNavigation } from '@/state/navigation';
import { resolveDroppedPaths } from '@/lib/dragState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Mark } from './Logo';
import { CommandIcon } from 'hugeicons-react';

/**
 * The full-width window chrome across the very top. Carries the window controls
 * (native traffic lights on macOS), the app's navigation (back / forward /
 * refresh) at the top-left, the centered search launcher, and the Assistant
 * button at the far right. The whole bar is a drag region; interactive controls
 * opt out with `no-drag`.
 */
export function TopBar({
  onOpenSearch,
  onDropFile,
  onToggleChat,
  chatOpen,
}: {
  onOpenSearch: () => void;
  /** A file dropped on the search bar → open search and find similar files. */
  onDropFile: (paths: string[]) => void;
  onToggleChat: () => void;
  chatOpen: boolean;
}) {
  const { back, forward, refresh, canGoBack, canGoForward } = useNavigation();
  const isMac = window.platform?.os === 'darwin';
  const [dragOver, setDragOver] = useState(false);

  // The whole bar is a window-drag region; only interactive controls opt out —
  // keeping empty space (including the flex spacers) draggable to move the window.
  const NO_DRAG = '[-webkit-app-region:no-drag]';

  return (
    <div
      className={cn(
        'border-border bg-card flex h-13 shrink-0 items-center gap-2 border-b [-webkit-app-region:drag]',
        // Clear the macOS traffic lights (positioned at x:14 in the main process).
        isMac ? 'pr-3 pl-[76px]' : 'px-3',
      )}
    >
      {/* Left cluster — navigation, tucked by the window controls */}
      <div className="flex flex-1 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8', NO_DRAG)}
          onClick={back}
          disabled={!canGoBack}
          title="Back"
        >
          <Icon name="back" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8', NO_DRAG)}
          onClick={forward}
          disabled={!canGoForward}
          title="Forward"
        >
          <Icon name="forward" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8', NO_DRAG)}
          onClick={refresh}
          title="Refresh"
        >
          <Icon name="refresh" />
        </Button>
      </div>

      {/* Center — the app's front door (also a drop target: drop a file to
          find similar ones). */}
      <Button
        onClick={onOpenSearch}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const paths = resolveDroppedPaths(e);
          if (paths.length) onDropFile(paths);
        }}
        className={cn(
          'group bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 w-full max-w-120 items-center gap-2 rounded-md border px-2.5 transition-colors duration-150 [-webkit-app-region:no-drag]',
          dragOver && 'border-mint/60 bg-mint/5 text-foreground ring-mint/40 ring-2',
        )}
        aria-label="Search files"
        variant="ghost"
      >
        <Icon
          name={dragOver ? 'sparkles' : 'search'}
          className={cn('size-4 shrink-0', dragOver ? 'text-mint' : 'text-muted-foreground group-hover:text-foreground')}
        />
        <span className="flex-1 truncate text-left text-xs leading-none">
          {dragOver ? 'Drop to find similar files…' : 'Search'}
        </span>
        <kbd className="border-border/70 text-muted-foreground flex items-center gap-0.5 rounded border px-1 py-0.5 font-mono text-3xs leading-none">
          {isMac ? <CommandIcon className="size-2.5" /> : 'Ctrl+'}
          <span className="leading-none">K</span>
        </kbd>
      </Button>

      {/* Right — Assistant opener (primary) */}
      <div className="flex flex-1 justify-end">
        <Button
          variant="default"
          size="sm"
          onClick={onToggleChat}
          title="Ask AI"
          aria-pressed={chatOpen}
          className={cn('gap-1.5', NO_DRAG, chatOpen && 'ring-mint/50 ring-2 ring-offset-1 ring-offset-card')}
        >
          <Mark className="size-4" />
          Ask AI
        </Button>
      </div>
    </div>
  );
}
