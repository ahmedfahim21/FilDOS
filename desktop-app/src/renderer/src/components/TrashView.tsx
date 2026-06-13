import { useCallback, useEffect, useState } from 'react';
import type { TrashedItem } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import {
  Panel,
  PanelActions,
  PanelHeader,
  PanelList,
  PanelNote,
  PanelRow,
  PanelRowDate,
  PanelRowIcon,
  PanelRowInfo,
  PanelState,
  PanelTitle,
} from './Panel';

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
    <Panel onClose={onClose}>
      <PanelHeader>
        <PanelTitle>Trash</PanelTitle>
        <PanelActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.fsapi.openOsTrash()}
          >
            Open OS Trash
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={empty}
            disabled={items.length === 0}
          >
            Empty
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </Button>
        </PanelActions>
      </PanelHeader>

      <PanelNote>
        Items deleted in FilDOS. Restore is best-effort — it can fail if the
        original location is occupied or the OS renamed the item.
      </PanelNote>

      <PanelList>
        {loading ? (
          <PanelState>Loading…</PanelState>
        ) : items.length === 0 ? (
          <PanelState>Nothing tracked in Trash</PanelState>
        ) : (
          items.map((item) => (
            <PanelRow key={item.id}>
              <PanelRowIcon>
                <Icon name="file" size={16} />
              </PanelRowIcon>
              <PanelRowInfo
                name={item.name}
                meta={item.originalPath}
                title={item.originalPath}
              />
              <PanelRowDate>{formatDate(item.deletedAt)}</PanelRowDate>
              <Button variant="outline" size="sm" onClick={() => restore(item.id)}>
                <Icon name="restore" size={14} /> Restore
              </Button>
            </PanelRow>
          ))
        )}
      </PanelList>
    </Panel>
  );
}
