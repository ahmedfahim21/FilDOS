import { useEffect, useState, type DragEvent } from 'react';
import type { QuickAccessItem, Tag } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { Icon } from './Icon';

export function Sidebar({
  tags,
  onDropPath,
  onOpenTag,
  onOpenRecents,
  onOpenTrash,
  onDropOnTag,
}: {
  tags: Tag[];
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

  return (
    <aside className="sidebar">
      <div className="sidebar__title">Quick Access</div>
      <nav>
        {items.map((item) => (
          <button
            key={item.path}
            className={`sidebar__item${currentPath === item.path ? ' is-active' : ''}${
              dropTarget === item.path ? ' is-droptarget' : ''
            }`}
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
          <div className="sidebar__title">Tags</div>
          <nav>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={`sidebar__item${
                  dropTarget === `tag:${tag.id}` ? ' is-droptarget' : ''
                }`}
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
                <span className="tagdot" style={{ background: tag.color }} />
                <span className="sidebar__grow">{tag.name}</span>
                {tag.count > 0 && <span className="sidebar__count">{tag.count}</span>}
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="sidebar__spacer" />
      <button className="sidebar__item" onClick={onOpenRecents} title="Recently opened files">
        <Icon name="clock" size={16} />
        <span>Recents</span>
      </button>
      <button className="sidebar__item" onClick={onOpenTrash} title="Trash">
        <Icon name="trash" size={16} />
        <span>Trash</span>
      </button>
    </aside>
  );
}
