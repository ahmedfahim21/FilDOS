import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SortDir, SortKey, Tag } from '@shared/types';
import { Icon } from './Icon';

export interface ContextMenuState {
  x: number;
  y: number;
  /** 'selection' = right-clicked an item; 'background' = right-clicked empty pane. */
  mode: 'selection' | 'background';
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  /** Number of selected items; controls which selection actions are enabled. */
  count: number;
  /** Whether the clipboard has something to paste. */
  canPaste: boolean;
  showHidden: boolean;
  // Selection actions
  onOpen: () => void;
  onReveal: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onTrash: () => void;
  onInfo: () => void;
  // Tags (selection mode)
  tags: Tag[];
  /** True when every selected item carries the tag. */
  isTagOnSelection: (tagId: number) => boolean;
  onToggleTag: (tag: Tag, apply: boolean) => void;
  onNewTag: () => void;
  // Background actions
  onNewFolder: () => void;
  onNewFile: () => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
  // Sorting (background mode)
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'modified', label: 'Modified' },
];

export function ContextMenu(props: ContextMenuProps) {
  const { state, onClose, count, canPaste, showHidden } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const single = count === 1;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // Keep the menu on-screen; open submenus away from the nearest edge.
  const style: React.CSSProperties = {
    left: Math.min(state.x, window.innerWidth - 220),
    top: Math.min(state.y, window.innerHeight - 320),
  };
  const submenuSide: 'left' | 'right' = state.x > window.innerWidth - 420 ? 'left' : 'right';

  const revealLabel = `Reveal in ${window.platform?.os === 'darwin' ? 'Finder' : 'Explorer'}`;

  return (
    <div ref={ref} className="ctxmenu" style={style} role="menu">
      {state.mode === 'selection' ? (
        <>
          <button className="ctxmenu__item" onClick={run(props.onOpen)} disabled={!single}>
            <Icon name="open" size={15} /> Open
          </button>
          <button className="ctxmenu__item" onClick={run(props.onReveal)} disabled={!single}>
            <Icon name="reveal" size={15} /> {revealLabel}
          </button>
          <div className="ctxmenu__sep" />
          <button className="ctxmenu__item" onClick={run(props.onCopy)}>
            <Icon name="copy" size={15} /> Copy{count > 1 ? ` (${count})` : ''}
          </button>
          <button className="ctxmenu__item" onClick={run(props.onCut)}>
            <Icon name="cut" size={15} /> Cut{count > 1 ? ` (${count})` : ''}
          </button>
          <button className="ctxmenu__item" onClick={run(props.onPaste)} disabled={!canPaste}>
            <Icon name="paste" size={15} /> Paste
          </button>
          <button className="ctxmenu__item" onClick={run(props.onDuplicate)} disabled={!single}>
            <Icon name="copy" size={15} /> Duplicate
          </button>
          <div className="ctxmenu__sep" />
          <Submenu side={submenuSide} label="Tags" icon="tag">
            {props.tags.map((tag) => {
              const applied = props.isTagOnSelection(tag.id);
              return (
                <button
                  key={tag.id}
                  className="ctxmenu__item"
                  onClick={run(() => props.onToggleTag(tag, !applied))}
                >
                  <span className="tagdot" style={{ background: tag.color }} />
                  <span className="ctxmenu__grow">{tag.name}</span>
                  {applied && <Icon name="check" size={13} />}
                </button>
              );
            })}
            {props.tags.length > 0 && <div className="ctxmenu__sep" />}
            <button className="ctxmenu__item" onClick={run(props.onNewTag)}>
              <Icon name="plus" size={13} /> New Tag…
            </button>
          </Submenu>
          <div className="ctxmenu__sep" />
          <button className="ctxmenu__item" onClick={run(props.onRename)} disabled={!single}>
            <Icon name="rename" size={15} /> Rename
          </button>
          <button className="ctxmenu__item ctxmenu__item--danger" onClick={run(props.onTrash)}>
            <Icon name="trash" size={15} /> Move to Trash{count > 1 ? ` (${count})` : ''}
          </button>
          <div className="ctxmenu__sep" />
          <button className="ctxmenu__item" onClick={run(props.onInfo)} disabled={!single}>
            <Icon name="info" size={15} /> Get Info
          </button>
        </>
      ) : (
        <>
          <button className="ctxmenu__item" onClick={run(props.onNewFolder)}>
            <Icon name="new-folder" size={15} /> New Folder
          </button>
          <button className="ctxmenu__item" onClick={run(props.onNewFile)}>
            <Icon name="file-plus" size={15} /> New File
          </button>
          <button className="ctxmenu__item" onClick={run(props.onPaste)} disabled={!canPaste}>
            <Icon name="paste" size={15} /> Paste
          </button>
          <div className="ctxmenu__sep" />
          <Submenu side={submenuSide} label="Sort By" icon="list">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className="ctxmenu__item"
                onClick={run(() => props.onSort(opt.key))}
              >
                <span className="ctxmenu__grow">{opt.label}</span>
                {props.sortKey === opt.key && (
                  <span className="ctxmenu__hint">{props.sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </button>
            ))}
          </Submenu>
          <button className="ctxmenu__item" onClick={run(props.onSelectAll)}>
            <Icon name="list" size={15} /> Select All
          </button>
          <button className="ctxmenu__item" onClick={run(props.onToggleHidden)}>
            <Icon name={showHidden ? 'eye-off' : 'eye'} size={15} />{' '}
            {showHidden ? 'Hide Hidden Files' : 'Show Hidden Files'}
          </button>
          <button className="ctxmenu__item" onClick={run(props.onRefresh)}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        </>
      )}
    </div>
  );
}

/** A menu item that reveals a nested panel on hover (or click, for keyboards). */
function Submenu({
  label,
  icon,
  side,
  children,
}: {
  label: string;
  icon: 'tag' | 'list';
  side: 'left' | 'right';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="ctxmenu__subwrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="ctxmenu__item" onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={15} />
        <span className="ctxmenu__grow">{label}</span>
        <Icon name="chevron" size={13} />
      </button>
      {open && (
        <div className={`ctxmenu ctxmenu--sub ctxmenu--${side}`} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}
