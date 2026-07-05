import { useCallback, useEffect, useState } from 'react';
import type { Entry, RecentItem, ViewMode } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { parentOf } from '@/lib/path';
import { fileLogo } from '@/lib/fileLogo';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import {
  Page,
  PageChrome,
  PageGrid,
  PageList,
  PageLoader,
  PageRow,
  PageRowDate,
  PageRowIcon,
  PageRowInfo,
  PageState,
} from './Page';

interface Menu { x: number; y: number; item: RecentItem }

const TILE_W = 128;
const TILE_H = 116;
const LOGO_SIZE = 54;

/** Construct a minimal Entry-like object from a RecentItem for fileLogo. */
function recentToEntry(item: RecentItem): Entry {
  const ext = item.name.includes('.') ? item.name.split('.').pop()!.toLowerCase() : '';
  return {
    path: item.path,
    name: item.name,
    isDirectory: false,
    isSymlink: false,
    isHidden: false,
    size: 0,
    ext,
    modified: 0,
    created: 0,
  };
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="border-border flex shrink-0 overflow-hidden rounded-md border">
      {(['list', 'grid'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            'flex items-center px-1.5 py-1 transition-colors duration-150',
            m === mode
              ? 'bg-foreground/[0.09] text-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Icon name={m} size={13} />
        </button>
      ))}
    </div>
  );
}

/**
 * Page listing files recently opened through FilDOS, newest first.
 * Vanished files are pruned server-side when the list loads.
 */
export function RecentsView({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const { notifyError } = useToast();
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [menu, setMenu] = useState<Menu | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await window.recents.list();
    if (r.ok) setItems(r.data);
    else notifyError(r.error);
    setLoading(false);
  }, [notifyError]);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !menu && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onBack, menu]);

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

  const openMenu = (e: React.MouseEvent, item: RecentItem) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, item });
  };

  return (
    <Page>
      <PageChrome>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <Button variant="outline" size="sm" onClick={clear} disabled={items.length === 0}>
          Clear
        </Button>
      </PageChrome>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <PageState>Nothing opened recently</PageState>
      ) : viewMode === 'grid' ? (
        <PageGrid>
          {items.map((item) => (
            <div
              key={item.path}
              style={{ width: TILE_W, height: TILE_H }}
              className="flex cursor-default flex-col items-center gap-1.5 rounded-lg p-1.5 hover:bg-accent"
              title={item.path}
              onDoubleClick={() => open(item)}
              onContextMenu={(e) => openMenu(e, item)}
            >
              <div className="grid min-h-0 w-full flex-1 place-items-center">
                <img
                  src={fileLogo(recentToEntry(item))}
                  alt=""
                  draggable={false}
                  style={{ maxWidth: LOGO_SIZE, maxHeight: LOGO_SIZE }}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div
                className="line-clamp-2 w-full text-center text-xs font-medium leading-tight"
                style={{ wordBreak: 'break-word' }}
              >
                {item.name}
              </div>
            </div>
          ))}
        </PageGrid>
      ) : (
        <PageList>
          {items.map((item) => (
            <PageRow
              key={item.path}
              onDoubleClick={() => open(item)}
              onContextMenu={(e) => openMenu(e, item)}
            >
              <PageRowIcon>
                <img
                  src={fileLogo(recentToEntry(item))}
                  alt=""
                  width={16}
                  height={16}
                  draggable={false}
                />
              </PageRowIcon>
              <PageRowInfo name={item.name} meta={item.path} title={item.path} />
              <PageRowDate>{formatDate(item.openedAt)}</PageRowDate>
            </PageRow>
          ))}
        </PageList>
      )}

      {menu && (
        <DropdownMenu
          key={`${menu.x},${menu.y}`}
          open
          modal={false}
          onOpenChange={(o) => !o && setMenu(null)}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0 }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            <DropdownMenuItem onSelect={() => open(menu.item)}>
              <Icon name="open" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNavigate(parentOf(menu.item.path))}>
              <Icon name="folder" /> Show in Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => remove(menu.item)}>
              <Icon name="close" /> Remove from Recents
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Page>
  );
}
