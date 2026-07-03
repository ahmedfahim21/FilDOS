import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import type { Entry, Prefs, Tag } from '@shared/types';
import {
  NavigationProvider,
  useNavigation,
  type NavInitial,
  type ViewState,
} from '@/state/navigation';
import { ToastProvider, useToast } from '@/state/toast';
import { ClipboardProvider, useClipboard } from '@/state/clipboard';
import { UndoProvider, useUndo } from '@/state/undo';
import { AiProvider, useAi } from '@/state/ai';
import { IndexingProvider, useIndexing } from '@/state/indexing';
import { useDirectory } from '@/hooks/useDirectory';
import { useFileActions } from '@/hooks/useFileActions';
import { useTagState } from '@/hooks/useTags';
import { baseName, parentOf } from '@/lib/path';
import { isRemote } from '@shared/remote';
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
import { RecentsView } from '@/components/RecentsView';
import { SemanticSearchView } from '@/components/SemanticSearchView';
import { TagFilesView } from '@/components/TagFilesView';
import { CloudConnectView } from '@/components/CloudConnectView';
import { SettingsView } from '@/components/SettingsView';
import { Icon } from '@/components/Icon';
import { TagDot } from '@/components/TagDots';
import { Toasts } from '@/components/Toasts';

type DialogState =
  | { kind: 'new-folder' }
  | { kind: 'new-file' }
  | { kind: 'new-tag'; paths: string[] }
  | { kind: 'trash'; entries: Entry[] }
  | null;

/** True when focus is in a text field, so we don't hijack typing shortcuts. */
function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function Browser({ initialView }: { initialView: ViewState }) {
  const nav = useNavigation();
  const clipboard = useClipboard();
  const undo = useUndo();
  const actions = useFileActions();
  const ai = useAi();
  const indexing = useIndexing();
  const { notify, notifyError } = useToast();
  const { entries, visible, loading, error } = useDirectory();
  const tagState = useTagState(visible);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [infoPath, setInfoPath] = useState<string | null>(null);
  const [sidebarCloudKey, setSidebarCloudKey] = useState(0);

  // The global view defaults: what a folder without remembered settings shows.
  // Updated on every deliberate view change (alongside the prefs row).
  const globalView = useRef<ViewState>(initialView);

  // Persist the non-view-state prefs as they change (best-effort — a failed
  // write must never surface as an unhandled rejection).
  useEffect(() => {
    window.prefs.set({ showHidden: nav.showHidden, columnWidths: nav.columnWidths }).catch(() => {});
  }, [nav.showHidden, nav.columnWidths]);

  useEffect(() => {
    window.prefs.set({ lastPath: nav.currentPath }).catch(() => {});
  }, [nav.currentPath]);

  // A deliberate view change (sort / view mode / icon size) becomes both the
  // new global default and this folder's remembered view. Applying another
  // folder's remembered view doesn't bump viewEdit, so it never lands here.
  useEffect(() => {
    if (nav.viewEdit === 0) return;
    const view: ViewState = { sort: nav.sort, viewMode: nav.viewMode, iconSize: nav.iconSize };
    globalView.current = view;
    window.prefs
      .set({ sort: view.sort, viewMode: view.viewMode, iconSize: view.iconSize })
      .catch(() => {});
    window.views
      .set(nav.currentPath, {
        sortKey: view.sort.key,
        sortDir: view.sort.dir,
        viewMode: view.viewMode,
        iconSize: view.iconSize,
      })
      .catch(() => {});
    // Depends only on viewEdit: the other nav fields are read at edit time,
    // and re-running on their navigation-driven changes would wrongly pin a
    // remembered view onto every visited folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.viewEdit]);

  // Entering a folder restores its remembered view (or the global defaults).
  useEffect(() => {
    let cancelled = false;
    window.views.get(nav.currentPath).then((result) => {
      if (cancelled || !result.ok) return;
      const remembered = result.data;
      const fallback = globalView.current;
      nav.applyView({
        sort:
          remembered?.sortKey != null
            ? { key: remembered.sortKey, dir: remembered.sortDir ?? 'asc' }
            : fallback.sort,
        viewMode: remembered?.viewMode ?? fallback.viewMode,
        iconSize: remembered?.iconSize ?? fallback.iconSize,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.currentPath, nav.applyView]);

  // Selection/cursor are scoped to a directory; reset on navigation.
  useEffect(() => {
    setSelection(new Set());
    setAnchorPath(null);
    setRenamingPath(null);
    setMenu(null);
  }, [nav.currentPath]);

  const selectedEntries = visible.filter((e) => selection.has(e.path));
  const selectedPaths = selectedEntries.map((e) => e.path);
  // The whole selection is already excluded from indexing → offer to re-include.
  const allIndexExcluded =
    selectedPaths.length > 0 && selectedPaths.every((p) => indexing.excludes.includes(p));
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

  // --- Tags ---
  const isTagOnSelection = useCallback(
    (tagId: number) =>
      selectedPaths.length > 0 &&
      selectedPaths.every((p) => tagState.getTags(p).some((t) => t.id === tagId)),
    [selectedPaths, tagState],
  );

  const toggleTagOnPaths = useCallback(
    (paths: string[], tag: Tag, apply: boolean) => {
      if (!paths.length) return;
      if (apply) tagState.assign(paths, tag.id);
      else tagState.unassign(paths, tag.id);
    },
    [tagState],
  );

  const createTagAndAssign = useCallback(
    async (name: string, paths: string[]) => {
      const tag = await tagState.create(name);
      if (tag && paths.length) await tagState.assign(paths, tag.id);
    },
    [tagState],
  );

  /** Resolve the file paths carried by a drag event. */
  const droppedPaths = (e: DragEvent) =>
    Array.from(e.dataTransfer.files)
      .map((f) => window.dnd.pathForFile(f))
      .filter(Boolean);

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
      const paths = droppedPaths(e);
      // Skip items already living in the destination (no-op move).
      const valid = paths.filter((p) => p !== destDir && parentOf(p) !== destDir);
      if (!valid.length) return;
      if (internal && !e.altKey) await actions.moveTo(valid, destDir);
      else await actions.copyTo(valid, destDir);
    },
    [actions],
  );

  const handleDropOnTag = useCallback(
    (tag: Tag, e: DragEvent) => {
      e.preventDefault();
      dragInternal.current = false;
      const paths = droppedPaths(e);
      if (paths.length) {
        tagState.assign(paths, tag.id);
        notify('success', `Tagged ${paths.length} item${paths.length > 1 ? 's' : ''} “${tag.name}”`);
      }
    },
    [tagState, notify],
  );

  // Global keyboard map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While a metadata page (Recents/Trash/tag) is shown the file browser is
      // hidden, so its selection-driven shortcuts must stay inert.
      if (isEditingTarget(e.target) || dialog || nav.page) return;
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
          case 'f':
            e.preventDefault();
            nav.openPage({ kind: 'semantic-search', rootPath: nav.currentPath });
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
    getTags: tagState.getTags,
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

  // The tag a tag-page points at. Falls away if the tag is deleted while open,
  // in which case the effect below leaves the now-defunct page.
  const page = nav.page;
  const pageTag =
    page?.kind === 'tag' ? tagState.tags.find((t) => t.id === page.tagId) : undefined;
  useEffect(() => {
    if (page?.kind === 'tag' && !pageTag) nav.back();
  }, [page, pageTag, nav]);

  // The page's name for the breadcrumb (pageTitle) and status bar (pageLabel).
  let pageTitle: ReactNode = null;
  let pageLabel: string | undefined;
  if (page?.kind === 'recents') {
    pageTitle = (
      <>
        <Icon name="clock" size={15} /> Recents
      </>
    );
    pageLabel = 'Recents';
  } else if (page?.kind === 'trash') {
    pageTitle = (
      <>
        <Icon name="trash" size={15} /> Trash
      </>
    );
    pageLabel = 'Trash';
  } else if (page?.kind === 'cloud-connect') {
    pageTitle = (
      <>
        <Icon name="cloud" size={15} /> Cloud Storage
      </>
    );
    pageLabel = 'Cloud Storage';
  } else if (page?.kind === 'settings') {
    pageTitle = (
      <>
        <Icon name="settings" size={15} /> Settings
      </>
    );
    pageLabel = 'Settings';
  } else if (page?.kind === 'semantic-search') {
    pageTitle = (
      <>
        <Icon name="search" size={15} /> Semantic Search
      </>
    );
    pageLabel = 'Semantic Search';
  } else if (page?.kind === 'tag' && pageTag) {
    pageTitle = (
      <>
        <TagDot color={pageTag.color} size={12} /> {pageTag.name}
      </>
    );
    pageLabel = pageTag.name;
  }

  return (
    <div className="flex h-full" data-testid="app">
      {/* Sidebar spans the full window height so the traffic-light spacer
          at its top sits flush with the top-left corner of the window. */}
      <Sidebar
        tags={tagState.tags}
        activePage={nav.page}
        cloudKey={sidebarCloudKey}
        onDropPath={(path, e) => handleDrop(path, e)}
        onOpenTag={(tag) => nav.openPage({ kind: 'tag', tagId: tag.id })}
        onOpenRecents={() => nav.openPage({ kind: 'recents' })}
        onOpenTrash={() => nav.openPage({ kind: 'trash' })}
        onOpenCloudConnect={() => nav.openPage({ kind: 'cloud-connect' })}
        onOpenSettings={() => nav.openPage({ kind: 'settings' })}
        onDropOnTag={handleDropOnTag}
      />

      {/* Right column: toolbar → content → status bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          onNewFolder={() => setDialog({ kind: 'new-folder' })}
          onNewFile={() => setDialog({ kind: 'new-file' })}
          pageTitle={pageTitle ?? undefined}
          remote={isRemote(nav.currentPath)}
        />

        <div className="flex min-h-0 flex-1">
          <main className="bg-background flex min-w-0 flex-1 flex-col">
            {nav.page?.kind === 'recents' ? (
              <RecentsView onBack={nav.back} onNavigate={nav.navigate} />
            ) : nav.page?.kind === 'trash' ? (
              <TrashView onBack={nav.back} onChanged={() => nav.refresh()} />
            ) : nav.page?.kind === 'cloud-connect' ? (
              <CloudConnectView onAccountsChanged={() => setSidebarCloudKey((k) => k + 1)} />
            ) : nav.page?.kind === 'settings' ? (
              <SettingsView onBack={nav.back} />
            ) : nav.page?.kind === 'semantic-search' ? (
              <SemanticSearchView
                rootPath={nav.page.rootPath}
                onBack={nav.back}
                onNavigate={nav.navigate}
                onInfo={(p) => setInfoPath(p)}
              />
            ) : nav.page?.kind === 'tag' ? (
              pageTag && (
                <TagFilesView
                  tag={pageTag}
                  onBack={nav.back}
                  onNavigate={nav.navigate}
                  onRenameTag={(id, name) => tagState.rename(id, name)}
                  onDeleteTag={(id) => {
                    nav.back();
                    tagState.remove(id);
                  }}
                  onChanged={tagState.refresh}
                />
              )
            ) : nav.viewMode === 'grid' ? (
              <GridView {...viewProps} />
            ) : (
              <FileList {...viewProps} />
            )}
          </main>
          {!nav.page && infoPath && (
            <InfoPanel
              path={infoPath}
              tags={tagState.tags}
              getTags={tagState.getTags}
              onToggleTag={(path, tag, apply) => toggleTagOnPaths([path], tag, apply)}
              onClose={() => setInfoPath(null)}
            />
          )}
        </div>

        <StatusBar
          shown={visible.length}
          hidden={entries.length - visible.length}
          selectedCount={selectedEntries.length}
          selectedSize={selectedSize}
          label={pageLabel}
        />
      </div>

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
          indexExcluded={allIndexExcluded}
          onToggleIndexExclude={
            ai.enabled && !isRemote(nav.currentPath)
              ? async () => {
                  const n = selectedPaths.length;
                  if (allIndexExcluded) {
                    await Promise.all(selectedPaths.map((p) => indexing.removeExclude(p)));
                    notify('success', n > 1 ? `Included ${n} items in indexing` : 'Included in indexing');
                  } else {
                    await Promise.all(selectedPaths.map((p) => indexing.addExclude(p)));
                    notify(
                      'success',
                      n > 1 ? `Excluded ${n} items from indexing` : 'Excluded from indexing',
                    );
                  }
                }
              : undefined
          }
          tags={tagState.tags}
          isTagOnSelection={isTagOnSelection}
          onToggleTag={(tag, apply) => toggleTagOnPaths(selectedPaths, tag, apply)}
          onNewTag={() => setDialog({ kind: 'new-tag', paths: selectedPaths })}
          onNewFolder={() => setDialog({ kind: 'new-folder' })}
          onNewFile={() => setDialog({ kind: 'new-file' })}
          onSelectAll={selectAll}
          onRefresh={nav.refresh}
          onToggleHidden={nav.toggleHidden}
          sortKey={nav.sort.key}
          sortDir={nav.sort.dir}
          onSort={nav.setSort}
          remote={isRemote(nav.currentPath)}
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

      {dialog?.kind === 'new-tag' && (
        <PromptDialog
          title="New Tag"
          label={
            dialog.paths.length
              ? `Tag name (applies to ${dialog.paths.length} selected item${
                  dialog.paths.length > 1 ? 's' : ''
                })`
              : 'Tag name'
          }
          initialValue=""
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            const paths = dialog.paths;
            setDialog(null);
            createTagAndAssign(name, paths);
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
  const initialView: ViewState = {
    sort: initialPrefs.sort ?? { key: 'name', dir: 'asc' },
    viewMode: initialPrefs.viewMode ?? 'list',
    iconSize: initialPrefs.iconSize ?? 'medium',
  };
  const navInitial: NavInitial = {
    showHidden: initialPrefs.showHidden,
    sort: initialView.sort,
    viewMode: initialView.viewMode,
    iconSize: initialView.iconSize,
    columnWidths: initialPrefs.columnWidths,
  };
  return (
    <ToastProvider>
      <ClipboardProvider>
        <UndoProvider>
          <AiProvider>
            <IndexingProvider>
              <NavigationProvider initialPath={initialPath} initial={navInitial}>
                <Browser initialView={initialView} />
              </NavigationProvider>
            </IndexingProvider>
          </AiProvider>
        </UndoProvider>
      </ClipboardProvider>
    </ToastProvider>
  );
}
