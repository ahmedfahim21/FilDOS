import { useEffect, useState, type DragEvent } from 'react';
import type { QuickAccessItem, Tag } from '@shared/types';
import { useNavigation, type NavPage } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { TagDot } from './TagDots';

const itemClass = (active = false, drop = false) =>
  cn(
    'flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-foreground [&_svg]:text-muted-foreground hover:bg-accent',
    active && 'bg-primary text-white hover:bg-primary [&_svg]:text-white',
    drop && 'bg-accent ring-2 ring-inset ring-primary',
  );

export function Sidebar({
  tags,
  activePage,
  onDropPath,
  onOpenTag,
  onOpenRecents,
  onOpenTrash,
  onDropOnTag,
}: {
  tags: Tag[];
  /** The metadata page currently in view, so its entry is highlighted. */
  activePage: NavPage | null;
  onDropPath: (path: string, e: DragEvent) => void;
  onOpenTag: (tag: Tag) => void;
  onOpenRecents: () => void;
  onOpenTrash: () => void;
  /** Drop files onto a tag in the sidebar to apply it. */
  onDropOnTag: (tag: Tag, e: DragEvent) => void;
}) {
  const { currentPath, navigate } = useNavigation();
  const { notifyError } = useToast();
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    window.fsapi.quickAccess().then((result) => {
      if (result.ok) setItems(result.data);
      else notifyError(result.error);
    });
  }, [notifyError]);

  const title = 'text-muted-foreground px-2 pb-2 text-[11px] tracking-[0.06em] uppercase';

  return (
    <aside className="border-border bg-card flex w-60 shrink-0 flex-col overflow-y-auto border-r px-2 py-3">
      <Logo className="px-2 pt-1 pb-4 text-lg" />
      <div className={title}>Quick Access</div>
      <nav>
        {items.map((item) => (
          <button
            key={item.path}
            data-testid="quick-access-item"
            className={itemClass(
              !activePage && currentPath === item.path,
              dropTarget === item.path,
            )}
            onClick={() => navigate(item.path)}
            title={item.path}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(item.path);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              setDropTarget(null);
              onDropPath(item.path, e);
            }}
          >
            <Icon name="folder" size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {tags.length > 0 && (
        <>
          <div className={title}>Tags</div>
          <nav>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={itemClass(
                  activePage?.kind === 'tag' && activePage.tagId === tag.id,
                  dropTarget === `tag:${tag.id}`,
                )}
                onClick={() => onOpenTag(tag)}
                title={`Files tagged “${tag.name}”`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(`tag:${tag.id}`);
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  setDropTarget(null);
                  onDropOnTag(tag, e);
                }}
              >
                <TagDot color={tag.color} className="mx-0.75" />
                <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis">
                  {tag.name}
                </span>
                {tag.count > 0 && (
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {tag.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="min-h-3 flex-1" />
      <button
        className={itemClass(activePage?.kind === 'recents')}
        onClick={onOpenRecents}
        title="Recently opened files"
      >
        <Icon name="clock" size={16} />
        <span>Recents</span>
      </button>
      <button
        className={itemClass(activePage?.kind === 'trash')}
        onClick={onOpenTrash}
        title="Trash"
      >
        <Icon name="trash" size={16} />
        <span>Trash</span>
      </button>
    </aside>
  );
}
