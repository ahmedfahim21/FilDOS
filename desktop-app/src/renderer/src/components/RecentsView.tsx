import { useCallback, useEffect, useState } from 'react';
import type { RecentItem } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { parentOf } from '@/lib/path';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import {
  Panel,
  PanelActions,
  PanelHeader,
  PanelList,
  PanelRow,
  PanelRowDate,
  PanelRowIcon,
  PanelRowInfo,
  PanelState,
  PanelTitle,
} from './Panel';

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
    <Panel onClose={onClose}>
      <PanelHeader>
        <PanelTitle>
          <Icon name="clock" size={16} /> Recents
        </PanelTitle>
        <PanelActions>
          <Button
            variant="outline"
            size="sm"
            onClick={clear}
            disabled={items.length === 0}
          >
            Clear
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

      <PanelList>
        {loading ? (
          <PanelState>Loading…</PanelState>
        ) : items.length === 0 ? (
          <PanelState>Nothing opened recently</PanelState>
        ) : (
          items.map((item) => (
            <PanelRow key={item.path} onDoubleClick={() => open(item)}>
              <PanelRowIcon>
                <Icon name="file" size={16} />
              </PanelRowIcon>
              <PanelRowInfo name={item.name} meta={item.path} title={item.path} />
              <PanelRowDate>{formatDate(item.openedAt)}</PanelRowDate>
              <Button variant="outline" size="sm" onClick={() => open(item)}>
                <Icon name="open" size={14} /> Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Show in Folder"
                onClick={() => {
                  onNavigate(parentOf(item.path));
                  onClose();
                }}
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
            </PanelRow>
          ))
        )}
      </PanelList>
    </Panel>
  );
}
