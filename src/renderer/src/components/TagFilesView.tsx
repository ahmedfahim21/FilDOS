import { useCallback, useEffect, useState } from 'react';
import type { Entry, Tag, ViewMode } from '@shared/types';
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
import { RenameInput } from './RenameInput';
import { TagDot } from './TagDots';
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

interface Menu { x: number; y: number; entry: Entry }

const TILE_W = 128;
const TILE_H = 116;
const LOGO_SIZE = 54;

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
 * Page listing every file carrying a tag, with open / locate / untag actions
 * in the context menu, plus rename and delete for the tag itself.
 */
export function TagFilesView({
  tag,
  onBack,
  onNavigate,
  onRenameTag,
  onDeleteTag,
  onChanged,
}: {
  tag: Tag;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onRenameTag: (id: number, name: string) => void;
  onDeleteTag: (id: number) => void;
  onChanged: () => void;
}) {
  const { notifyError } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [menu, setMenu] = useState<Menu | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await window.tags.files(tag.id);
    if (r.ok) setEntries(r.data);
    else notifyError(r.error);
    setLoading(false);
  }, [tag.id, notifyError]);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !menu && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onBack, menu]);

  const open = async (entry: Entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.path);
      return;
    }
    const r = await window.fsapi.open(entry.path);
    if (!r.ok) notifyError(r.error);
  };

  const untag = async (entry: Entry) => {
    const r = await window.tags.unassign([entry.path], tag.id);
    if (r.ok) {
      load();
      onChanged();
    } else {
      notifyError(r.error);
    }
  };

  const showInFolder = (entry: Entry) =>
    onNavigate(entry.isDirectory ? entry.path : parentOf(entry.path));

  const openMenu = (e: React.MouseEvent, entry: Entry) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  return (
    <Page note="Files don't move when tagged — a tag is just a saved collection you can return to.">
      <PageChrome>
        {renaming ? (
          <>
            <TagDot color={tag.color} size={13} />
            <RenameInput
              initial={tag.name}
              onCommit={(name) => {
                setRenaming(false);
                if (name !== tag.name) onRenameTag(tag.id, name);
              }}
              onCancel={() => setRenaming(false)}
            />
          </>
        ) : (
          <>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenaming(true)}
            >
              <Icon name="rename" size={14} /> Rename
            </Button>
            {confirmingDelete ? (
              <Button variant="destructive" size="sm" onClick={() => onDeleteTag(tag.id)}>
                Delete tag and{' '}
                {entries.length ? `${entries.length} assignment(s)` : 'close'}?
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
                <Icon name="trash" size={14} /> Delete
              </Button>
            )}
          </>
        )}
      </PageChrome>

      {loading ? (
        <PageLoader />
      ) : entries.length === 0 ? (
        <PageState>No files carry this tag yet</PageState>
      ) : viewMode === 'grid' ? (
        <PageGrid>
          {entries.map((entry) => (
            <div
              key={entry.path}
              style={{ width: TILE_W, height: TILE_H }}
              className="flex cursor-default flex-col items-center gap-1.5 rounded-lg p-1.5 hover:bg-accent"
              title={entry.path}
              onDoubleClick={() => open(entry)}
              onContextMenu={(e) => openMenu(e, entry)}
            >
              <div className="grid min-h-0 w-full flex-1 place-items-center">
                <img
                  src={fileLogo(entry)}
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
                {entry.name}
              </div>
            </div>
          ))}
        </PageGrid>
      ) : (
        <PageList>
          {entries.map((entry) => (
            <PageRow
              key={entry.path}
              onDoubleClick={() => open(entry)}
              onContextMenu={(e) => openMenu(e, entry)}
            >
              <PageRowIcon>
                <img src={fileLogo(entry)} alt="" width={16} height={16} draggable={false} />
              </PageRowIcon>
              <PageRowInfo name={entry.name} meta={entry.path} title={entry.path} />
              <PageRowDate>{formatDate(entry.modified)}</PageRowDate>
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
            <DropdownMenuItem onSelect={() => open(menu.entry)}>
              <Icon name="open" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => showInFolder(menu.entry)}>
              <Icon name="folder" /> Show in Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => untag(menu.entry)}>
              <Icon name="close" /> Remove tag
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Page>
  );
}
