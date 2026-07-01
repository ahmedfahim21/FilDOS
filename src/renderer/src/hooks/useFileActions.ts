import { useCallback } from 'react';
import type { Entry, Result } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { useClipboard } from '@/state/clipboard';
import { useUndo, type UndoEntry } from '@/state/undo';
import { parentOf } from '@/lib/path';

const pluralItems = (n: number) => `${n} item${n > 1 ? 's' : ''}`;

/**
 * Central place for all mutating file operations. Each helper runs the IPC call,
 * toasts on failure (and optionally success), refreshes the view, and pushes an
 * inverse onto the undo stack so the action can be reversed with Cmd+Z.
 */
export function useFileActions() {
  const nav = useNavigation();
  const { notify, notifyError } = useToast();
  const clipboard = useClipboard();
  const undo = useUndo();

  const run = useCallback(
    async <T>(
      op: Promise<Result<T>>,
      successMessage?: (data: T) => string,
      inverse?: (data: T) => UndoEntry,
    ): Promise<Result<T>> => {
      const result = await op;
      if (result.ok) {
        if (successMessage) notify('success', successMessage(result.data));
        if (inverse) undo.push(inverse(result.data));
        nav.refresh();
      } else {
        notifyError(result.error);
      }
      return result;
    },
    [nav, notify, notifyError, undo],
  );

  const open = useCallback(
    async (entry: Entry) => {
      if (entry.isDirectory) {
        nav.navigate(entry.path);
        return;
      }
      const result = await window.fsapi.open(entry.path);
      if (!result.ok) notifyError(result.error);
    },
    [nav, notifyError],
  );

  const reveal = useCallback(
    async (entry: Entry) => {
      const result = await window.fsapi.reveal(entry.path);
      if (!result.ok) notifyError(result.error);
    },
    [notifyError],
  );

  const createFolder = useCallback(
    (name: string) =>
      run(
        window.fsapi.createFolder(nav.currentPath, name),
        () => `Created “${name}”`,
        (entry) => ({ label: 'New folder', run: () => window.fsapi.trash([entry.path]) }),
      ),
    [run, nav.currentPath],
  );

  const createFile = useCallback(
    (name: string) =>
      run(
        window.fsapi.createFile(nav.currentPath, name),
        () => `Created “${name}”`,
        (entry) => ({ label: 'New file', run: () => window.fsapi.trash([entry.path]) }),
      ),
    [run, nav.currentPath],
  );

  const rename = useCallback(
    (entry: Entry, newName: string) => {
      if (newName === entry.name) return Promise.resolve<Result<Entry>>({ ok: true, data: entry });
      return run(
        window.fsapi.rename(entry.path, newName),
        () => `Renamed to “${newName}”`,
        (renamed) => ({
          label: 'Rename',
          run: () => window.fsapi.rename(renamed.path, entry.name),
        }),
      );
    },
    [run],
  );

  const duplicate = useCallback(
    (entry: Entry) =>
      run(
        window.fsapi.duplicate(entry.path),
        () => 'Duplicated',
        (created) => ({ label: 'Duplicate', run: () => window.fsapi.trash([created.path]) }),
      ),
    [run],
  );

  const trash = useCallback(
    (entries: Entry[]) =>
      run(
        window.fsapi.trash(entries.map((e) => e.path)),
        () => `Moved ${pluralItems(entries.length)} to Trash`,
        (items) => ({
          label: 'Trash',
          run: () => window.fsapi.restoreTrashed(items.map((i) => i.id)),
        }),
      ),
    [run],
  );

  const copyTo = useCallback(
    (paths: string[], destDir: string) =>
      run(
        window.fsapi.copy(paths, destDir),
        (d) => `Copied ${pluralItems(d.length)}`,
        (created) => ({
          label: 'Copy',
          run: () => window.fsapi.trash(created.map((e) => e.path)),
        }),
      ),
    [run],
  );

  const moveTo = useCallback(
    (paths: string[], destDir: string) => {
      const origDir = parentOf(paths[0]);
      return run(
        window.fsapi.move(paths, destDir),
        (d) => `Moved ${pluralItems(d.length)}`,
        (moved) => ({
          label: 'Move',
          run: () => window.fsapi.move(moved.map((e) => e.path), origDir),
        }),
      );
    },
    [run],
  );

  /** Paste whatever is on the internal clipboard into the current folder. */
  const paste = useCallback(async () => {
    const clip = clipboard.clip;
    if (!clip) return;
    if (clip.mode === 'copy') {
      await copyTo(clip.paths, nav.currentPath);
    } else {
      const origDir = parentOf(clip.paths[0]);
      const r = await run(
        window.fsapi.move(clip.paths, nav.currentPath),
        (d) => `Moved ${pluralItems(d.length)}`,
        (moved) => ({
          label: 'Move',
          run: () => window.fsapi.move(moved.map((e) => e.path), origDir),
        }),
      );
      if (r.ok) clipboard.clear(); // a cut is consumed by the paste
    }
  }, [clipboard, copyTo, run, nav.currentPath]);

  return {
    open,
    reveal,
    createFolder,
    createFile,
    rename,
    duplicate,
    trash,
    paste,
    copyTo,
    moveTo,
    copy: clipboard.copy,
    cut: clipboard.cut,
  };
}
