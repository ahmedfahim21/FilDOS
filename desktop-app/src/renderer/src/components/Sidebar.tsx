import { useEffect, useState, type DragEvent } from 'react';
import type { QuickAccessItem } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { Icon } from './Icon';

export function Sidebar({
  onDropPath,
  onOpenTrash,
}: {
  onDropPath: (path: string, e: DragEvent) => void;
  onOpenTrash: () => void;
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

      <div className="sidebar__spacer" />
      <button className="sidebar__item" onClick={onOpenTrash} title="Trash">
        <Icon name="trash" size={16} />
        <span>Trash</span>
      </button>
    </aside>
  );
}
