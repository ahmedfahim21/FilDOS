import { useEffect, useRef } from 'react';
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
  // Background actions
  onNewFolder: () => void;
  onNewFile: () => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
}

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

  // Keep the menu on-screen.
  const style: React.CSSProperties = {
    left: Math.min(state.x, window.innerWidth - 220),
    top: Math.min(state.y, window.innerHeight - 280),
  };

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
