import { eq, sql } from 'drizzle-orm';
import type { FolderView, IconSize, SortDir, SortKey, ViewMode } from '@shared/types';
import { db } from './index';
import { folderViews } from './schema';

/**
 * Per-folder view settings: a folder remembers the sort, view mode and icon
 * size the user last chose while inside it. Unset fields fall back to the
 * global defaults in prefs.
 */

const SORT_KEYS = ['name', 'size', 'type', 'modified'];
const SORT_DIRS = ['asc', 'desc'];
const VIEW_MODES = ['list', 'grid'];
const ICON_SIZES = ['small', 'medium', 'large'];

/** Keep a renderer-supplied value only when it's one of the known options. */
function only<T extends string>(allowed: string[], value: T | undefined): T | null {
  return value !== undefined && allowed.includes(value) ? value : null;
}

/** The remembered view for a folder, or null if it was never customised. */
export async function getFolderView(path: string): Promise<FolderView | null> {
  const [row] = await db()
    .select({
      sortKey: folderViews.sortKey,
      sortDir: folderViews.sortDir,
      viewMode: folderViews.viewMode,
      iconSize: folderViews.iconSize,
    })
    .from(folderViews)
    .where(eq(folderViews.path, path));
  if (!row) return null;
  return {
    sortKey: (row.sortKey as SortKey) ?? undefined,
    sortDir: (row.sortDir as SortDir) ?? undefined,
    viewMode: (row.viewMode as ViewMode) ?? undefined,
    iconSize: (row.iconSize as IconSize) ?? undefined,
  };
}

/** Merge `view` into the folder's remembered settings (upsert). */
export async function setFolderView(path: string, view: FolderView): Promise<void> {
  await db()
    .insert(folderViews)
    .values({
      path,
      sortKey: only(SORT_KEYS, view.sortKey),
      sortDir: only(SORT_DIRS, view.sortDir),
      viewMode: only(VIEW_MODES, view.viewMode),
      iconSize: only(ICON_SIZES, view.iconSize),
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: folderViews.path,
      set: {
        // COALESCE keeps the previously remembered value for unset fields.
        sortKey: sql`coalesce(excluded.sort_key, sort_key)`,
        sortDir: sql`coalesce(excluded.sort_dir, sort_dir)`,
        viewMode: sql`coalesce(excluded.view_mode, view_mode)`,
        iconSize: sql`coalesce(excluded.icon_size, icon_size)`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
