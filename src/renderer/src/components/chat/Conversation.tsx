import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';

/** Distance from the bottom (px) within which we still count as "stuck". */
const STICK_THRESHOLD = 48;

/**
 * A scroll container that keeps the conversation pinned to the newest message
 * while an answer streams in, but releases the moment the user scrolls up to
 * read back — with a "Jump to latest" pill to re-attach. Reimplements AI
 * Elements' stick-to-bottom behavior with no dependency.
 *
 * `watch` is the value that changes as content grows (the messages array); when
 * it changes and we're stuck, we scroll to the bottom.
 */
export function Conversation({
  watch,
  children,
  className,
}: {
  watch: unknown;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Follow new content only while attached to the bottom.
  useEffect(() => {
    if (stuck) scrollToBottom();
  }, [watch, stuck, scrollToBottom]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStuck(distance <= STICK_THRESHOLD);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={onScroll}
        className={cn('h-full overflow-y-auto [scrollbar-gutter:stable]', className)}
      >
        {children}
      </div>
      {!stuck && (
        <button
          onClick={() => {
            scrollToBottom();
            setStuck(true);
          }}
          className="border-border material text-foreground animate-in fade-in-0 zoom-in-95 absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium shadow-md duration-150 ease-snappy"
          title="Jump to latest"
        >
          <Icon name="up" size={11} className="rotate-180" />
          Latest
        </button>
      )}
    </div>
  );
}
