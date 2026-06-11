import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Entry, IconSize, Tag } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { isImage } from '@/lib/format';
import { useThumbnail } from '@/hooks/useThumbnail';
import { Icon } from './Icon';
import { RenameInput } from './RenameInput';
import { TagDots } from './TagDots';
import type { FileViewProps, SelectMods } from './viewTypes';

/** Tile geometry per icon-size preference. */
const TILE: Record<IconSize, { width: number; height: number; thumb: number; icon: number }> = {
  small: { width: 96, height: 92, thumb: 60, icon: 30 },
  medium: { width: 128, height: 116, thumb: 96, icon: 44 },
  large: { width: 176, height: 158, thumb: 136, icon: 62 },
};

export function GridView({
  entries,
  loading,
  error,
  selection,
  renamingPath,
  getTags,
  onSelect,
  onActivate,
  onContextMenu,
  onBackgroundContextMenu,
  onBackgroundClick,
  onRenameCommit,
  onRenameCancel,
  onItemDragStart,
  onDropOnFolder,
  onDropOnPane,
}: FileViewProps) {
  const { iconSize } = useNavigation();
  const tile = TILE[iconSize];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // The scroll container only exists once we leave the loading/error/empty
  // states, so re-observe when that emptiness toggles.
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

  const perRow = Math.max(1, Math.floor((width || tile.width) / tile.width));
  const rowCount = Math.ceil(entries.length / perRow);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tile.height,
    overscan: 6,
  });

  // Row height changed with the icon size; drop cached measurements.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, iconSize]);

  if (loading) return <div className="pane__state">Loading…</div>;
  if (error) {
    return (
      <div className="pane__state pane__state--error">
        <strong>Can’t open this folder</strong>
        <span>{error.message}</span>
      </div>
    );
  }
  if (entries.length === 0) return <div className="pane__state">This folder is empty</div>;

  return (
    <div
      className="gridview"
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
              className="gridview__row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: tile.height,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {rowEntries.map((entry) => (
                <GridTile
                  key={entry.path}
                  entry={entry}
                  tile={tile}
                  tags={getTags(entry.path)}
                  selected={selection.has(entry.path)}
                  editing={renamingPath === entry.path}
                  onSelect={onSelect}
                  onActivate={onActivate}
                  onContextMenu={onContextMenu}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
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

function GridTile({
  entry,
  tile,
  tags,
  selected,
  editing,
  onSelect,
  onActivate,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  onItemDragStart,
  onDropOnFolder,
}: {
  entry: Entry;
  tile: (typeof TILE)[IconSize];
  tags: Tag[];
  selected: boolean;
  editing: boolean;
  onSelect: (entry: Entry, mods: SelectMods) => void;
  onActivate: (entry: Entry) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onRenameCommit: (entry: Entry, name: string) => void;
  onRenameCancel: () => void;
  onItemDragStart: (entry: Entry, e: DragEvent) => void;
  onDropOnFolder: (folder: Entry, e: DragEvent) => void;
}) {
  const thumb = useThumbnail(entry.path, tile.thumb, isImage(entry));
  const [over, setOver] = useState(false);

  return (
    <div
      draggable
      className={`tile${selected ? ' is-selected' : ''}${entry.isHidden ? ' is-hidden' : ''}${
        over ? ' is-droptarget' : ''
      }`}
      style={{ width: tile.width, height: tile.height }}
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
        if (editing) return;
        onSelect(entry, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!editing) onActivate(entry);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(entry, { toggle: false, range: false });
        onContextMenu(entry, e.clientX, e.clientY);
      }}
    >
      <div className="tile__thumb" style={{ height: tile.thumb }}>
        {thumb ? (
          <img src={thumb} alt="" draggable={false} />
        ) : (
          <Icon name={entry.isDirectory ? 'folder' : 'file'} size={tile.icon} />
        )}
      </div>
      {editing ? (
        <RenameInput
          className="tile__rename"
          initial={entry.name}
          onCommit={(name) => onRenameCommit(entry, name)}
          onCancel={onRenameCancel}
        />
      ) : (
        <div className="tile__name" title={entry.name}>
          <TagDots tags={tags} max={3} />
          {entry.name}
        </div>
      )}
    </div>
  );
}
