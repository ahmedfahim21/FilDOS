import { useCallback, useEffect, useState } from 'react';
import type { TrashedItem } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import {
  Page,
  PageList,
  PageRow,
  PageRowDate,
  PageRowIcon,
  PageRowInfo,
  PageState,
} from './Page';

/**
 * Page listing items FilDOS has trashed, with best-effort restore. Restore
 * can fail (the OS may have renamed on collision, or the original parent is
 * gone) — failures surface as toasts and the item stays listed for retry.
 */
export function TrashView({
  onBack,
  onChanged,
}: {
  onBack: () => void;
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onBack]);

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
    <Page
      note="Items deleted in FilDOS. Restore is best-effort — it can fail if the original location is occupied or the OS renamed the item."
      actions={
        <>
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
        </>
      }
    >
      <PageList>
        {loading ? (
          <PageState>Loading…</PageState>
        ) : items.length === 0 ? (
          <PageState>Nothing tracked in Trash</PageState>
        ) : (
          items.map((item) => (
            <PageRow key={item.id}>
              <PageRowIcon>
                <Icon name="file" size={16} />
              </PageRowIcon>
              <PageRowInfo
                name={item.name}
                meta={item.originalPath}
                title={item.originalPath}
              />
              <PageRowDate>{formatDate(item.deletedAt)}</PageRowDate>
              <Button variant="outline" size="sm" onClick={() => restore(item.id)}>
                <Icon name="restore" size={14} /> Restore
              </Button>
            </PageRow>
          ))
        )}
      </PageList>
    </Page>
  );
}
