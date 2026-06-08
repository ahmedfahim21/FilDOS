import { useCallback, useEffect, useState } from 'react';
import type { TrashedItem } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { Icon } from './Icon';

/**
 * Overlay listing items FilDOS has trashed, with best-effort restore. Restore
 * can fail (the OS may have renamed on collision, or the original parent is
 * gone) — failures surface as toasts and the item stays listed for retry.
 */
export function TrashView({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify, notifyError } = useToast();
  const [items, setItems] = useState<TrashedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await window.fsapi.listTrashed();
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

  const restore = async (id: string) => {
    const r = await window.fsapi.restoreTrashed([id]);
    if (r.ok) {
      notify('success', 'Restored');
      load();
      onChanged();
    } else {
      notifyError(r.error);
    }
  };

  const empty = async () => {
    const r = await window.fsapi.emptyTrash();
    if (r.ok) {
      notify('success', 'Trash emptied');
      load();
    } else {
      notifyError(r.error);
    }
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="trashview" onMouseDown={(e) => e.stopPropagation()}>
        <div className="trashview__head">
          <h2>Trash</h2>
          <div className="trashview__actions">
            <button className="btn" onClick={() => window.fsapi.openOsTrash()}>
              Open OS Trash
            </button>
            <button className="btn btn--danger" onClick={empty} disabled={items.length === 0}>
              Empty
            </button>
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <p className="trashview__note">
          Items deleted in FilDOS. Restore is best-effort — it can fail if the
          original location is occupied or the OS renamed the item.
        </p>

        <div className="trashview__list">
          {loading ? (
            <div className="pane__state">Loading…</div>
          ) : items.length === 0 ? (
            <div className="pane__state">Nothing tracked in Trash</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="trashrow">
                <Icon name="file" size={16} />
                <div className="trashrow__info">
                  <div className="trashrow__name" title={item.originalPath}>
                    {item.name}
                  </div>
                  <div className="trashrow__meta">{item.originalPath}</div>
                </div>
                <div className="trashrow__date">{formatDate(item.deletedAt)}</div>
                <button className="btn" onClick={() => restore(item.id)}>
                  <Icon name="restore" size={14} /> Restore
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
