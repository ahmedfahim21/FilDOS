import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AppError, Entry } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { canPreview, formatDate, formatSize, typeLabel } from '@/lib/format';
import { fileLogo } from '@/lib/fileLogo';
import { sortEntries } from '@/lib/sortEntries';
import { cn } from '@/lib/utils';
import { useThumbnail } from '@/hooks/useThumbnail';
import { Icon } from './Icon';
import { TagDots } from './TagDots';
import type { FileViewProps } from './viewTypes';

const ROW_HEIGHT = 28;
const COLUMN_WIDTH = 248;

const STATE =
  'flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center text-2xs text-muted-foreground';

/** Loads a single column's directory, applying the app-wide hidden + sort. */
function useColumnEntries(path: string) {
  const { showHidden, sort, refreshToken } = useNavigation();
  const [state, setState] = useState<{
    entries: Entry[];
    loading: boolean;
    error: AppError | null;
  }>({ entries: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    window.fsapi.listDir(path).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        const list = showHidden
          ? result.data
          : result.data.filter((e) => !e.isHidden);
        setState({ entries: sortEntries(list, sort), loading: false, error: null });
      } else {
        setState({ entries: [], loading: false, error: result.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, showHidden, sort, refreshToken]);

  return state;
}

/**
 * Finder-style Miller-column browser. The leftmost column is the folder you were
 * in when you switched to this view; clicking a folder expands a new column to
 * its right, clicking a file shows a preview pane at the end. Selecting a folder
 * navigates (so the breadcrumb follows); navigating from elsewhere (breadcrumb,
 * sidebar, Back/Forward) collapses the trail back to that folder.
 */
export function ColumnView({
  getTags,
  onSelect,
  onActivate,
  onContextMenu,
  onBackgroundContextMenu,
  onBackgroundClick,
  onItemDragStart,
  onDropOnFolder,
  onDropOnPane,
}: FileViewProps) {
  const { currentPath, navigate } = useNavigation();

  // One folder path per column; the deepest column may have a file previewed.
  const [trail, setTrail] = useState<string[]>([currentPath]);
  const [selected, setSelected] = useState<Entry | null>(null);
  // The path we last navigated to ourselves, so the effect below can tell our
  // own drilling apart from an external navigation (breadcrumb / sidebar / Back).
  const navGuard = useRef(currentPath);

  useEffect(() => {
    if (currentPath === navGuard.current) return; // our own drill — trail is already right
    navGuard.current = currentPath; // external navigation → collapse to this folder
    setTrail([currentPath]);
    setSelected(null);
  }, [currentPath]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Keep the newest column in view as the trail grows or a preview opens.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [trail.length, selected]);

  const pickFolder = (col: number, folder: Entry) => {
    navGuard.current = folder.path;
    setTrail([...trail.slice(0, col + 1), folder.path]);
    setSelected(null);
    onSelect(folder, { toggle: false, range: false });
    navigate(folder.path);
  };

  const pickFile = (col: number, file: Entry) => {
    const parent = trail[col];
    navGuard.current = parent;
    setTrail(trail.slice(0, col + 1));
    setSelected(file);
    onSelect(file, { toggle: false, range: false });
    if (parent !== currentPath) navigate(parent);
  };

  return (
    <div
      className="flex min-h-0 flex-1 overflow-x-auto"
      ref={scrollRef}
      onClick={onBackgroundClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onBackgroundContextMenu(e.clientX, e.clientY);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnPane}
    >
      {trail.map((path, col) => {
        // The entry highlighted in this column: the child we drilled into, or —
        // in the last folder column — the file being previewed.
        const highlight =
          col + 1 < trail.length
            ? trail[col + 1]
            : col === trail.length - 1 && selected
              ? selected.path
              : null;
        return (
          <Column
            key={path}
            path={path}
            highlight={highlight}
            getTags={getTags}
            onPickFolder={(entry) => pickFolder(col, entry)}
            onPickFile={(entry) => pickFile(col, entry)}
            onActivate={onActivate}
            onContextMenu={onContextMenu}
            onSelect={onSelect}
            onItemDragStart={onItemDragStart}
            onDropOnFolder={onDropOnFolder}
          />
        );
      })}
      {selected && <ColumnPreview entry={selected} />}
    </div>
  );
}

function Column({
  path,
  highlight,
  getTags,
  onPickFolder,
  onPickFile,
  onActivate,
  onContextMenu,
  onSelect,
  onItemDragStart,
  onDropOnFolder,
}: {
  path: string;
  highlight: string | null;
  getTags: FileViewProps['getTags'];
  onPickFolder: (entry: Entry) => void;
  onPickFile: (entry: Entry) => void;
  onActivate: FileViewProps['onActivate'];
  onContextMenu: FileViewProps['onContextMenu'];
  onSelect: FileViewProps['onSelect'];
  onItemDragStart: FileViewProps['onItemDragStart'];
  onDropOnFolder: FileViewProps['onDropOnFolder'];
}) {
  const { entries, loading, error } = useColumnEntries(path);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div
      className="border-border flex min-h-0 shrink-0 flex-col border-r"
      style={{ width: COLUMN_WIDTH }}
    >
      {loading ? (
        <div className={STATE}>Loading…</div>
      ) : error ? (
        <div className={STATE}>{error.message}</div>
      ) : entries.length === 0 ? (
        <div className={STATE}>Empty folder</div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1" ref={scrollRef}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const entry = entries[vi.index];
              const active = highlight === entry.path;
              return (
                <div
                  key={entry.path}
                  draggable
                  className={cn(
                    'group mx-1 flex cursor-default items-center gap-2 rounded-md px-2 hover:bg-accent',
                    active && 'bg-primary/15 hover:bg-primary/15',
                    entry.isHidden && 'opacity-55',
                    dropTarget === entry.path && 'bg-accent ring-2 ring-inset ring-primary/40',
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    transform: `translateY(${vi.start}px)`,
                  }}
                  onDragStart={(e) => onItemDragStart(entry, e)}
                  onDragOver={
                    entry.isDirectory
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTarget(entry.path);
                        }
                      : undefined
                  }
                  onDragLeave={entry.isDirectory ? () => setDropTarget(null) : undefined}
                  onDrop={
                    entry.isDirectory
                      ? (e) => {
                          e.stopPropagation();
                          setDropTarget(null);
                          onDropOnFolder(entry, e);
                        }
                      : undefined
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (entry.isDirectory) onPickFolder(entry);
                    else onPickFile(entry);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!entry.isDirectory) onActivate(entry);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(entry, { toggle: false, range: false });
                    onContextMenu(entry, e.clientX, e.clientY);
                  }}
                >
                  <img
                    src={fileLogo(entry)}
                    alt=""
                    width={16}
                    height={16}
                    draggable={false}
                    className="shrink-0"
                  />
                  <span className="text-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">
                    {entry.name}
                  </span>
                  <TagDots tags={getTags(entry.path)} max={3} dotSize={6} />
                  {entry.isDirectory && (
                    <Icon
                      name="chevron"
                      size={14}
                      className="text-muted-foreground shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** The trailing preview pane: a large thumbnail and key metadata for a file. */
function ColumnPreview({ entry }: { entry: Entry }) {
  const preview = useThumbnail(entry.path, 256, canPreview(entry));
  return (
    <div className="flex w-72 shrink-0 flex-col items-center gap-4 overflow-y-auto p-5">
      <div className="bg-muted ring-border/50 grid aspect-square w-full place-items-center overflow-hidden rounded-lg ring-1 ring-inset">
        {preview ? (
          <img src={preview} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <img
            src={fileLogo(entry)}
            alt=""
            draggable={false}
            className="h-1/2 w-1/2 object-contain"
          />
        )}
      </div>
      <div className="w-full text-center">
        <div className="text-foreground wrap-break-word text-sm font-semibold">
          {entry.name}
        </div>
        <div className="text-muted-foreground mt-0.5 text-xs">{typeLabel(entry)}</div>
      </div>
      <dl className="text-2xs w-full space-y-1.5">
        <PreviewRow label="Size" value={formatSize(entry.size)} />
        <PreviewRow label="Modified" value={formatDate(entry.modified)} />
        <PreviewRow label="Created" value={formatDate(entry.created)} />
      </dl>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 flex items-center justify-between gap-2 border-b pb-1.5">
      <dt className="text-muted-foreground shrink-0 font-semibold uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-foreground truncate text-right">{value}</dd>
    </div>
  );
}
