import type { ChatMention } from '@shared/types';
import { Icon } from '@/components/Icon';
import { iconFor } from './util';

/** A small pill for one attached file/folder mention. */
export function MentionChip({ mention, onRemove }: { mention: ChatMention; onRemove?: () => void }) {
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
