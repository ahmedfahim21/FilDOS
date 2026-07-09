import type { AiModelState } from '@shared/types';
import { fileLogo } from '@/lib/fileLogo';
import type { Icon } from '@/components/Icon';

/**
 * Shared constants and small helpers for the Assistant surfaces (the docked
 * rail and the maximized research page). Kept separate so both compose the same
 * leaf pieces without ChatSidebar owning them.
 */

/** Model lifecycle → status-dot scoop (the one place chat uses non-mint scoops). */
export const STATE_DOT: Record<AiModelState, string> = {
  ready: 'bg-mint',
  downloading: 'bg-mango animate-pulse',
  error: 'bg-strawberry',
  absent: 'bg-muted-foreground/40',
};

/** Icon per file tool (see `@shared/chatTools`). */
export const TOOL_ICONS: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  create_file: 'file-plus',
  create_folder: 'new-folder',
  copy_files: 'copy',
  move_files: 'forward',
  rename_file: 'rename',
  delete_files: 'trash',
  list_folder: 'list',
  read_file: 'eye',
  search_index: 'search',
};

/**
 * Empty-state starters. Each card prefills the composer with a working recipe;
 * the tints follow the scoop-per-meaning rule (mint = AI/search, blueberry =
 * documents, grape = system/insight) — accents only, never body text.
 */
export const SUGGESTIONS = [
  {
    icon: 'folder' as const,
    tint: 'bg-blueberry/10 text-blueberry',
    title: 'Summarize this folder',
    desc: 'A quick gist of everything in view',
    text: '/summarize ',
  },
  {
    icon: 'search' as const,
    tint: 'bg-mint/10 text-mint',
    title: 'Find a file',
    desc: 'Describe what you remember about it',
    text: '/find ',
  },
  {
    icon: 'info' as const,
    tint: 'bg-grape/10 text-grape',
    title: 'Explain a file',
    desc: 'Attach any file with @',
    text: '/explain @',
  },
  {
    icon: 'tool' as const,
    tint: 'bg-strawberry/10 text-strawberry',
    title: 'Perform a file action',
    desc: 'Create, copy, move, rename, or delete files',
    text: 'Create a file called ',
  },
];

/** The folder containing a path (for jumping to a source file). */
export function parentOf(path: string): string {
  const sep = window.platform?.sep ?? '/';
  const ix = path.lastIndexOf(sep);
  return ix > 0 ? path.slice(0, ix) : sep;
}

/** The FilDOS file-type icon for a name we only know as a mention (no Entry). */
export function iconFor(name: string, isDirectory: boolean): string {
  const dot = name.lastIndexOf('.');
  const ext = !isDirectory && dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return fileLogo({
    name,
    path: '',
    isDirectory,
    isSymlink: false,
    isHidden: false,
    size: 0,
    ext,
    modified: 0,
    created: 0,
  });
}
