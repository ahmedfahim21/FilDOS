import { useCallback, useEffect, useState } from 'react';
import type { RecentItem } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { parentOf } from '@/lib/path';
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
 * Page listing files recently opened through FilDOS, newest first.
 * Vanished files are pruned server-side when the list loads.
 */
export function RecentsView({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onBack]);

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
    <Page
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={items.length === 0}
        >
          Clear
        </Button>
      }
    >
      <PageList>
        {loading ? (
          <PageState>Loading…</PageState>
        ) : items.length === 0 ? (
          <PageState>Nothing opened recently</PageState>
        ) : (
          items.map((item) => (
            <PageRow key={item.path} onDoubleClick={() => open(item)}>
              <PageRowIcon>
                <Icon name="file" size={16} />
              </PageRowIcon>
              <PageRowInfo name={item.name} meta={item.path} title={item.path} />
              <PageRowDate>{formatDate(item.openedAt)}</PageRowDate>
              <Button variant="outline" size="sm" onClick={() => open(item)}>
                <Icon name="open" size={14} /> Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Show in Folder"
                onClick={() => onNavigate(parentOf(item.path))}
              >
                <Icon name="folder" size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Remove from Recents"
                onClick={() => remove(item)}
              >
                <Icon name="close" size={12} />
              </Button>
            </PageRow>
          ))
        )}
      </PageList>
    </Page>
  );
}
