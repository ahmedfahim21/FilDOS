import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Entry, IconSize, Tag } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { canPreview } from '@/lib/format';
import { fileLogo } from '@/lib/fileLogo';
import { cn } from '@/lib/utils';
import { useThumbnail } from '@/hooks/useThumbnail';
import { TagDots } from './TagDots';
import type { FileViewProps, SelectMods } from './viewTypes';

/**
 * Square-tile edge per icon-size preference. `thumb` is the resolution the
 * preview is fetched at (a touch above the tile so cropping stays crisp).
 */
const TILE: Record<IconSize, { size: number; thumb: number }> = {
  small: { size: 104, thumb: 128 },
  medium: { size: 136, thumb: 160 },
  large: { size: 184, thumb: 224 },
};

/** Hairline grout between tiles so the wall reads as a mosaic, not a table. */
const GROUT = 2;

const STATE =
  'flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground';

/**
 * A wall of uniform square thumbnails with no filenames — images crop to fill,
 * everything else shows its centered type logo. Tiles pack edge-to-edge so a
 * photo-heavy folder reads as a contact sheet.
 */
export function GalleryView({
  entries,
  loading,
  error,
  onReconnect,
  selection,
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
  const { iconSize } = useNavigation();
  const tile = TILE[iconSize];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const isEmpty = entries.length === 0;

  // Track the scroll container's width to compute the column count.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [loading, error, isEmpty]);

  const step = tile.size + GROUT;
  const perRow = Math.max(1, Math.floor((width || step) / step));
  const rowCount = Math.ceil(entries.length / perRow);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => step,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, iconSize]);

  if (loading) return <div className={STATE}>Loading…</div>;
  if (error) {
    return (
      <div className={STATE}>
        <strong className="text-foreground">Can’t open this folder</strong>
        <span>{error.message}</span>
        {error.code === 'EAUTH' && onReconnect && (
          <button
            className="border-border text-foreground hover:bg-foreground/[0.08] mt-3 rounded-lg border px-3 py-1.5 text-sm font-medium"
            onClick={onReconnect}
          >
            Reconnect
          </button>
        )}
      </div>
    );
  }
  if (entries.length === 0) return <div className={STATE}>This folder is empty</div>;

  return (
    <div
      className="flex-1 overflow-y-auto p-2"
      ref={scrollRef}
      onClick={onBackgroundClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onBackgroundContextMenu(e.clientX, e.clientY);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnPane}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const start = vi.index * perRow;
          const rowEntries = entries.slice(start, start + perRow);
          return (
            <div
              key={vi.index}
              className="flex"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: step,
                gap: GROUT,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {rowEntries.map((entry) => (
                <GalleryTile
                  key={entry.path}
                  entry={entry}
                  size={tile.size}
                  thumb={tile.thumb}
                  tags={getTags(entry.path)}
                  selected={selection.has(entry.path)}
                  onSelect={onSelect}
                  onActivate={onActivate}
                  onContextMenu={onContextMenu}
                  onItemDragStart={onItemDragStart}
                  onDropOnFolder={onDropOnFolder}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GalleryTile({
  entry,
  size,
  thumb,
  tags,
  selected,
  onSelect,
  onActivate,
  onContextMenu,
  onItemDragStart,
  onDropOnFolder,
}: {
  entry: Entry;
  size: number;
  thumb: number;
  tags: Tag[];
  selected: boolean;
  onSelect: (entry: Entry, mods: SelectMods) => void;
  onActivate: (entry: Entry) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onItemDragStart: (entry: Entry, e: DragEvent) => void;
  onDropOnFolder: (folder: Entry, e: DragEvent) => void;
}) {
  const preview = useThumbnail(entry.path, thumb, canPreview(entry));
  const [over, setOver] = useState(false);

  return (
    <div
      draggable
      title={entry.name}
      className={cn(
        'group bg-muted relative shrink-0 cursor-default overflow-hidden rounded-md ring-1 ring-inset ring-border/50',
        entry.isHidden && 'opacity-55',
      )}
      style={{ width: size, height: size }}
      onDragStart={(e) => onItemDragStart(entry, e)}
      onDragOver={
        entry.isDirectory
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={entry.isDirectory ? () => setOver(false) : undefined}
      onDrop={
        entry.isDirectory
          ? (e) => {
              e.stopPropagation();
              setOver(false);
              onDropOnFolder(entry, e);
            }
          : undefined
      }
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entry, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onActivate(entry);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(entry, { toggle: false, range: false });
        onContextMenu(entry, e.clientX, e.clientY);
      }}
    >
      {preview ? (
        <img
          src={preview}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center p-2">
          <img
            src={fileLogo(entry)}
            alt=""
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{ width: size * 0.55, height: size * 0.55 }}
          />
        </div>
      )}

      {/* Tag dots pinned to a corner so the mosaic keeps its clean edges. */}
      {tags.length > 0 && (
        <div className="bg-background/80 absolute left-1 top-1 rounded-full px-1 py-0.5 backdrop-blur-sm">
          <TagDots tags={tags} max={3} dotSize={7} />
        </div>
      )}

      {/* Hover: a short filename over a dark gradient at the bottom. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/75 via-black/25 to-transparent px-1.5 pb-1 pt-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <span className="text-2xs w-full truncate font-medium text-white">
          {entry.name}
        </span>
      </div>

      {/* A little dark filter on hover + the selection / drop-target ring,
          drawn on top so they never shift layout. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-md ring-inset transition',
          over
            ? 'bg-primary/10 ring-2 ring-primary/60'
            : selected
              ? 'bg-primary/15 ring-2 ring-primary/60'
              : 'ring-0 group-hover:bg-black/15',
        )}
      />
    </div>
  );
}
