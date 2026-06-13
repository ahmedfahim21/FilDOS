import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigation, type ColumnWidths, type SortKey } from '@/state/navigation';
import { formatDate, formatSize, typeLabel } from '@/lib/format';
import { fileLogo } from '@/lib/fileLogo';
import { cn } from '@/lib/utils';
import { RenameInput } from './RenameInput';
import { TagDots } from './TagDots';
import type { FileViewProps } from './viewTypes';

const ROW_HEIGHT = 30;

// Shared grid template for the header and every row; the --w-* vars (set on the
// container) drive the resizable Size/Type/Modified columns.
const GRID =
  'grid grid-cols-[minmax(0,1fr)_var(--w-size,100px)_var(--w-type,140px)_var(--w-modified,200px)] items-center';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'modified', label: 'Modified' },
];

const cellClass =
  'overflow-hidden px-2.5 text-ellipsis whitespace-nowrap text-muted-foreground group-data-selected:text-white/85';

const STATE =
  'flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground';

export function FileList({
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
  const { sort, setSort, columnWidths } = useNavigation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // CSS vars drive the resizable grid columns for both header and rows.
  const gridVars = {
    '--w-size': `${columnWidths.size}px`,
    '--w-type': `${columnWidths.type}px`,
    '--w-modified': `${columnWidths.modified}px`,
  } as React.CSSProperties;

  const header = (
    <div className={cn(GRID, 'border-border bg-background shrink-0 border-b')}>
      {COLUMNS.map((col) => (
        <div key={col.key} className="relative flex items-center overflow-hidden">
          <button
            className="text-muted-foreground hover:text-foreground flex flex-1 items-center gap-1 overflow-hidden border-0 bg-transparent px-2.5 py-2 text-left text-xs font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              setSort(col.key);
            }}
          >
            {col.label}
            {sort.key === col.key && (
              <span className="text-[8px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>
            )}
          </button>
          {col.key !== 'name' && <ColumnResizer column={col.key as keyof ColumnWidths} />}
        </div>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (loading) {
    body = <div className={STATE}>Loading…</div>;
  } else if (error) {
    body = (
      <div className={STATE}>
        <strong className="text-foreground">Can’t open this folder</strong>
        <span>{error.message}</span>
      </div>
    );
  } else if (entries.length === 0) {
    body = <div className={STATE}>This folder is empty</div>;
  } else {
    body = (
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const entry = entries[vi.index];
            const selected = selection.has(entry.path);
            const editing = renamingPath === entry.path;
            return (
              <div
                key={entry.path}
                draggable
                data-selected={selected || undefined}
                className={cn(
                  GRID,
                  'group border-b border-transparent hover:bg-accent',
                  selected && 'bg-primary text-white hover:bg-primary',
                  entry.isHidden && 'opacity-55',
                  dropTarget === entry.path &&
                    'bg-accent ring-2 ring-inset ring-primary',
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
                <div className="text-foreground flex items-center gap-2 overflow-hidden px-2.5 group-data-selected:text-white">
                  <img
                    src={fileLogo(entry)}
                    alt=""
                    width={16}
                    height={16}
                    draggable={false}
                    className="shrink-0"
                  />
                  {editing ? (
                    <RenameInput
                      initial={entry.name}
                      onCommit={(name) => onRenameCommit(entry, name)}
                      onCancel={onRenameCancel}
                    />
                  ) : (
                    <>
                      <span className="overflow-hidden text-ellipsis">
                        {entry.name}
                      </span>
                      <TagDots tags={getTags(entry.path)} className="ml-2" />
                    </>
                  )}
                </div>
                <div className={cellClass}>
                  {entry.isDirectory ? '—' : formatSize(entry.size)}
                </div>
                <div className={cellClass}>{typeLabel(entry)}</div>
                <div className={cellClass}>{formatDate(entry.modified)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="filelist"
      style={gridVars}
      onClick={onBackgroundClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onBackgroundContextMenu(e.clientX, e.clientY);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnPane}
    >
      {header}
      {body}
    </div>
  );
}

/** Draggable divider that resizes a fixed column. */
function ColumnResizer({ column }: { column: keyof ColumnWidths }) {
  const { columnWidths, setColumnWidth } = useNavigation();

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[column];
    const onMove = (ev: PointerEvent) =>
      setColumnWidth(column, startWidth + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return <div className="col-resizer" onPointerDown={onPointerDown} onClick={(e) => e.stopPropagation()} />;
}
