import type { Entry, SortDir, SortKey } from '@shared/types';

/**
 * Sort a directory listing the way every view expects: folders always lead,
 * then the chosen key/direction. Returns a new array (input untouched). Shared
 * by {@link useDirectory} and the column view so deeper columns match the
 * app-wide sort.
 */
export function sortEntries(
  entries: Entry[],
  sort: { key: SortKey; dir: SortDir },
): Entry[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    // Folders always lead, regardless of sort column/direction.
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    switch (sort.key) {
      case 'size':
        return (a.size - b.size) * dir;
      case 'modified':
        return (a.modified - b.modified) * dir;
      case 'type':
        return a.ext.localeCompare(b.ext) * dir || a.name.localeCompare(b.name) * dir;
      case 'name':
      default:
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) * dir;
    }
  });
}
