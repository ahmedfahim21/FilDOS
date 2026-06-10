import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { Entry, Prefs } from '@shared/types';
import { NavigationProvider, useNavigation, type NavInitial, type SortKey } from '@/state/navigation';
import { ToastProvider, useToast } from '@/state/toast';
import { ClipboardProvider, useClipboard } from '@/state/clipboard';
import { UndoProvider, useUndo } from '@/state/undo';
import { useDirectory } from '@/hooks/useDirectory';
import { useFileActions } from '@/hooks/useFileActions';
import { baseName, parentOf } from '@/lib/path';
import { Sidebar } from '@/components/Sidebar';
import { Toolbar } from '@/components/Toolbar';
import { FileList } from '@/components/FileList';
import { GridView } from '@/components/GridView';
import type { FileViewProps, SelectMods } from '@/components/viewTypes';
import { ContextMenu, type ContextMenuState } from '@/components/ContextMenu';
import { ConfirmDialog, PromptDialog } from '@/components/Dialog';
import { InfoPanel } from '@/components/InfoPanel';
import { StatusBar } from '@/components/StatusBar';
import { TrashView } from '@/components/TrashView';
import { Toasts } from '@/components/Toasts';

type DialogState =
  | { kind: 'new-folder' }
  | { kind: 'new-file' }
  | { kind: 'trash'; entries: Entry[] }
  | null;

/** True when focus is in a text field, so we don't hijack typing shortcuts. */
function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function Browser() {
  const nav = useNavigation();
  const clipboard = useClipboard();
  const undo = useUndo();
  const actions = useFileActions();
  const { notify, notifyError } = useToast();
  const { entries, visible, loading, error } = useDirectory();

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [infoPath, setInfoPath] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  // Persist view preferences and last folder.
  useEffect(() => {
    window.prefs.set({
      showHidden: nav.showHidden,
      sort: nav.sort,
      viewMode: nav.viewMode,
      columnWidths: nav.columnWidths,
    });
  }, [nav.showHidden, nav.sort, nav.viewMode, nav.columnWidths]);

  useEffect(() => {
    window.prefs.set({ lastPath: nav.currentPath });
  }, [nav.currentPath]);

  // Selection/cursor are scoped to a directory; reset on navigation.
  useEffect(() => {
    setSelection(new Set());
    setAnchorPath(null);
    setRenamingPath(null);
    setMenu(null);
  }, [nav.currentPath]);

  const selectedEntries = visible.filter((e) => selection.has(e.path));
  const selectedPaths = selectedEntries.map((e) => e.path);
  const selectedSize = selectedEntries.reduce(
    (sum, e) => sum + (e.isDirectory ? 0 : e.size),
    0,
  );

  const select = useCallback(
    (entry: Entry, mods: SelectMods) => {
      const idx = visible.findIndex((e) => e.path === entry.path);
      if (mods.range && anchorPath) {
        const a = visible.findIndex((e) => e.path === anchorPath);
        if (a !== -1 && idx !== -1) {
          const [lo, hi] = a < idx ? [a, idx] : [idx, a];
          setSelection(new Set(visible.slice(lo, hi + 1).map((e) => e.path)));
          return; // keep existing anchor
        }
      }
      if (mods.toggle) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
      } else {
        setSelection(new Set([entry.path]));
      }
      setAnchorPath(entry.path);
    },
    [visible, anchorPath],
  );

  const selectAll = useCallback(() => {
    setSelection(new Set(visible.map((e) => e.path)));
  }, [visible]);

  const moveCursor = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const cur = anchorPath ? visible.findIndex((e) => e.path === anchorPath) : -1;
      let next = cur === -1 ? (delta > 0 ? 0 : visible.length - 1) : cur + delta;
      next = Math.max(0, Math.min(visible.length - 1, next));
      const entry = visible[next];
      setSelection(new Set([entry.path]));
      setAnchorPath(entry.path);
    },
    [visible, anchorPath],
  );

  const trash = useCallback(
    async (entries: Entry[]) => {
      setDialog(null);
      const result = await actions.trash(entries);
      if (result.ok) {
        setSelection(new Set());
        if (infoPath && entries.some((e) => e.path === infoPath)) setInfoPath(null);
      }
    },
    [actions, infoPath],
  );

  const startRename = useCallback((entry: Entry) => {
    setSelection(new Set([entry.path]));
    setAnchorPath(entry.path);
    setRenamingPath(entry.path);
  }, []);

  const handleUndo = useCallback(async () => {
    const entry = undo.pop();
    if (!entry) return;
    const result = await entry.run();
    if (result.ok) {
      notify('success', 'Undone');
      nav.refresh();
    } else {
      notifyError(result.error);
    }
  }, [undo, nav, notify, notifyError]);

  // --- Drag and drop ---
  // Tracks whether the in-progress drag originated inside FilDOS (→ default move)
  // vs. from another app (→ default copy). Any click resets it before a new drag.
  const dragInternal = useRef(false);
  useEffect(() => {
    const clear = () => {
      dragInternal.current = false;
    };
    window.addEventListener('mousedown', clear);
    return () => window.removeEventListener('mousedown', clear);
  }, []);

  const onItemDragStart = useCallback(
    (entry: Entry, e: DragEvent) => {
      e.preventDefault(); // suppress the HTML5 ghost; use the OS drag instead
      const paths = selection.has(entry.path) ? selectedPaths : [entry.path];
      dragInternal.current = true;
      window.dnd.startDrag(paths);
    },
    [selection, selectedPaths],
  );

  const handleDrop = useCallback(
    async (destDir: string, e: DragEvent) => {
      e.preventDefault();
      const internal = dragInternal.current;
      dragInternal.current = false;
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => window.dnd.pathForFile(f))
        .filter(Boolean);
      // Skip items already living in the destination (no-op move).
      const valid = paths.filter((p) => p !== destDir && parentOf(p) !== destDir);
      if (!valid.length) return;
      if (internal && !e.altKey) await actions.moveTo(valid, destDir);
      else await actions.copyTo(valid, destDir);
    },
    [actions],
  );

  // Global keyboard map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target) || dialog) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      if (mod) {
        switch (key.toLowerCase()) {
          case 'a':
            e.preventDefault();
            selectAll();
            return;
          case 'c':
            if (selectedPaths.length) clipboard.copy(selectedPaths);
            return;
          case 'x':
            if (selectedPaths.length) clipboard.cut(selectedPaths);
            return;
          case 'v':
            actions.paste();
            return;
          case 'd':
            if (selectedEntries.length === 1) {
              e.preventDefault();
              actions.duplicate(selectedEntries[0]);
            }
            return;
          case 'n':
            e.preventDefault();
            setDialog({ kind: 'new-folder' });
            return;
          case 'z':
            e.preventDefault();
            handleUndo();
            return;
        }
        if (key === 'ArrowUp') {
          e.preventDefault();
          nav.up();
          return;
        }
        if (key === 'Backspace' && selectedEntries.length) {
          e.preventDefault();
          setDialog({ kind: 'trash', entries: selectedEntries });
          return;
        }
      }

      switch (key) {
        case 'ArrowDown':
          e.preventDefault();
          moveCursor(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveCursor(-1);
          break;
        case 'Enter':
          if (selectedEntries.length === 1) actions.open(selectedEntries[0]);
          break;
        case 'Backspace':
          e.preventDefault();
          nav.up();
          break;
        case 'Delete':
          if (selectedEntries.length) setDialog({ kind: 'trash', entries: selectedEntries });
          break;
        case 'F2':
          if (selectedEntries.length === 1) startRename(selectedEntries[0]);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    dialog,
    selectedEntries,
    selectedPaths,
    clipboard,
    actions,
    nav,
    selectAll,
    moveCursor,
    startRename,
    handleUndo,
  ]);

  const viewProps: FileViewProps = {
    entries: visible,
    loading,
    error,
    selection,
    renamingPath,
    onSelect: select,
    onActivate: actions.open,
    onBackgroundClick: () => setSelection(new Set()),
    onContextMenu: (_entry, x, y) => setMenu({ x, y, mode: 'selection' }),
    onBackgroundContextMenu: (x, y) => setMenu({ x, y, mode: 'background' }),
    onRenameCommit: (entry, name) => {
      setRenamingPath(null);
      actions.rename(entry, name);
    },
    onRenameCancel: () => setRenamingPath(null),
    onItemDragStart,
    onDropOnFolder: (folder, e) => handleDrop(folder.path, e),
    onDropOnPane: (e) => handleDrop(nav.currentPath, e),
  };

  return (
    <div className="app">
      <Toolbar
        onNewFolder={() => setDialog({ kind: 'new-folder' })}
        onNewFile={() => setDialog({ kind: 'new-file' })}
      />
      <div className="app__body">
        <Sidebar
          onDropPath={(path, e) => handleDrop(path, e)}
          onOpenTrash={() => setShowTrash(true)}
        />
        <main className="pane">
          {nav.viewMode === 'grid' ? <GridView {...viewProps} /> : <FileList {...viewProps} />}
        </main>
        {infoPath && <InfoPanel path={infoPath} onClose={() => setInfoPath(null)} />}
      </div>

      <StatusBar
        shown={visible.length}
        hidden={entries.length - visible.length}
        selectedCount={selectedEntries.length}
        selectedSize={selectedSize}
      />

      {menu && (menu.mode === 'background' || selectedEntries.length > 0) && (
        <ContextMenu
          state={menu}
          count={selectedEntries.length}
          canPaste={!!clipboard.clip}
          showHidden={nav.showHidden}
          onClose={() => setMenu(null)}
          onOpen={() => actions.open(selectedEntries[0])}
          onReveal={() => actions.reveal(selectedEntries[0])}
          onCopy={() => clipboard.copy(selectedPaths)}
          onCut={() => clipboard.cut(selectedPaths)}
          onPaste={() => actions.paste()}
          onDuplicate={() => actions.duplicate(selectedEntries[0])}
          onRename={() => startRename(selectedEntries[0])}
          onTrash={() => setDialog({ kind: 'trash', entries: selectedEntries })}
          onInfo={() => setInfoPath(selectedEntries[0].path)}
          onNewFolder={() => setDialog({ kind: 'new-folder' })}
          onNewFile={() => setDialog({ kind: 'new-file' })}
          onSelectAll={selectAll}
          onRefresh={nav.refresh}
          onToggleHidden={nav.toggleHidden}
        />
      )}

      {dialog?.kind === 'new-folder' && (
        <PromptDialog
          title="New Folder"
          label="Folder name"
          initialValue="untitled folder"
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            setDialog(null);
            actions.createFolder(name);
          }}
        />
      )}

      {dialog?.kind === 'new-file' && (
        <PromptDialog
          title="New File"
          label="File name"
          initialValue="untitled.txt"
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            setDialog(null);
            actions.createFile(name);
          }}
        />
      )}

      {dialog?.kind === 'trash' && (
        <ConfirmDialog
          title="Move to Trash"
          message={
            dialog.entries.length === 1
              ? `Move “${baseName(dialog.entries[0].path)}” to the Trash?`
              : `Move ${dialog.entries.length} items to the Trash?`
          }
          confirmLabel="Move to Trash"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => trash(dialog.entries)}
        />
      )}

      {showTrash && (
        <TrashView onClose={() => setShowTrash(false)} onChanged={() => nav.refresh()} />
      )}

      <Toasts />
    </div>
  );
}

export default function App({
  initialPath,
  initialPrefs,
}: {
  initialPath: string;
  initialPrefs: Prefs;
}) {
  const navInitial: NavInitial = {
    showHidden: initialPrefs.showHidden,
    sort: initialPrefs.sort
      ? { key: initialPrefs.sort.key as SortKey, dir: initialPrefs.sort.dir }
      : undefined,
    viewMode: initialPrefs.viewMode,
    columnWidths: initialPrefs.columnWidths,
  };
  return (
    <ToastProvider>
      <ClipboardProvider>
        <UndoProvider>
          <NavigationProvider initialPath={initialPath} initial={navInitial}>
            <Browser />
          </NavigationProvider>
        </UndoProvider>
      </ClipboardProvider>
    </ToastProvider>
  );
}
