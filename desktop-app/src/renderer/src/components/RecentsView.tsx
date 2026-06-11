import { useCallback, useEffect, useState } from 'react';
import type { RecentItem } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { parentOf } from '@/lib/path';
import { Icon } from './Icon';

/**
 * Overlay listing files recently opened through FilDOS, newest first.
 * Vanished files are pruned server-side when the list loads.
 */
export function RecentsView({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  /** Jump the browser to a folder (used by "Show in Folder"). */
  onNavigate: (path: string) => void;
}) {
  const { notifyError } = useToast();
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await window.recents.list();
    if (r.ok) setItems(r.data);
    else notifyError(r.error);
    setLoading(false);
  }, [notifyError]);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onClose]);

  const open = async (item: RecentItem) => {
    const r = await window.fsapi.open(item.path);
    if (!r.ok) notifyError(r.error);
  };

  const remove = async (item: RecentItem) => {
    const r = await window.recents.remove(item.path);
    if (r.ok) load();
    else notifyError(r.error);
  };

  const clear = async () => {
    const r = await window.recents.clear();
    if (r.ok) load();
    else notifyError(r.error);
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="panelview" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panelview__head">
          <h2>
            <Icon name="clock" size={16} /> Recents
          </h2>
          <div className="panelview__actions">
            <button className="btn" onClick={clear} disabled={items.length === 0}>
              Clear
            </button>
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <div className="panelview__list">
          {loading ? (
            <div className="pane__state">Loading…</div>
          ) : items.length === 0 ? (
            <div className="pane__state">Nothing opened recently</div>
          ) : (
            items.map((item) => (
              <div key={item.path} className="panelrow" onDoubleClick={() => open(item)}>
                <Icon name="file" size={16} />
                <div className="panelrow__info">
                  <div className="panelrow__name" title={item.path}>
                    {item.name}
                  </div>
                  <div className="panelrow__meta">{item.path}</div>
                </div>
                <div className="panelrow__date">{formatDate(item.openedAt)}</div>
                <button className="btn" onClick={() => open(item)}>
                  <Icon name="open" size={14} /> Open
                </button>
                <button
                  className="iconbtn"
                  title="Show in Folder"
                  onClick={() => {
                    onNavigate(parentOf(item.path));
                    onClose();
                  }}
                >
                  <Icon name="folder" size={14} />
                </button>
                <button
                  className="iconbtn"
                  title="Remove from Recents"
                  onClick={() => remove(item)}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
