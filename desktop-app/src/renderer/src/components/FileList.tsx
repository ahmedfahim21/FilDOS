import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigation, type ColumnWidths, type SortKey } from '@/state/navigation';
import { formatDate, formatSize, typeLabel } from '@/lib/format';
import { Icon } from './Icon';
import { RenameInput } from './RenameInput';
import type { FileViewProps } from './viewTypes';

const ROW_HEIGHT = 30;

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'size', label: 'Size', className: 'col-size' },
  { key: 'type', label: 'Type', className: 'col-type' },
  { key: 'modified', label: 'Modified', className: 'col-modified' },
];

export function FileList({
  entries,
  loading,
  error,
  selection,
  renamingPath,
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
    <div className="filelist__head">
      {COLUMNS.map((col) => (
        <div key={col.key} className="filelist__colwrap">
          <button
            className={`filelist__col ${col.className}`}
            onClick={(e) => {
              e.stopPropagation();
              setSort(col.key);
            }}
          >
            {col.label}
            {sort.key === col.key && (
              <span className={`sortcaret ${sort.dir}`}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
            )}
          </button>
          {col.key !== 'name' && <ColumnResizer column={col.key as keyof ColumnWidths} />}
        </div>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (loading) {
    body = <div className="pane__state">Loading…</div>;
  } else if (error) {
    body = (
      <div className="pane__state pane__state--error">
        <strong>Can’t open this folder</strong>
        <span>{error.message}</span>
      </div>
    );
  } else if (entries.length === 0) {
    body = <div className="pane__state">This folder is empty</div>;
  } else {
    body = (
      <div className="filelist__body" ref={scrollRef}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const entry = entries[vi.index];
            const selected = selection.has(entry.path);
            const editing = renamingPath === entry.path;
            return (
              <div
                key={entry.path}
                draggable
                className={`row${selected ? ' is-selected' : ''}${
                  entry.isHidden ? ' is-hidden' : ''
                }${dropTarget === entry.path ? ' is-droptarget' : ''}`}
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
                <div className="cell col-name">
                  <span className="row__icon">
                    <Icon name={entry.isDirectory ? 'folder' : 'file'} />
                  </span>
                  {editing ? (
                    <RenameInput
                      initial={entry.name}
                      onCommit={(name) => onRenameCommit(entry, name)}
                      onCancel={onRenameCancel}
                    />
                  ) : (
                    <span className="row__name">{entry.name}</span>
                  )}
                </div>
                <div className="cell col-size">
                  {entry.isDirectory ? '—' : formatSize(entry.size)}
                </div>
                <div className="cell col-type">{typeLabel(entry)}</div>
                <div className="cell col-modified">{formatDate(entry.modified)}</div>
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
