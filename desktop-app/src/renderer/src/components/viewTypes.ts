import type { DragEvent } from 'react';
import type { AppError, Entry, Tag } from '@shared/types';

export interface SelectMods {
  /** Cmd/Ctrl held: toggle this item in the selection. */
  toggle: boolean;
  /** Shift held: select the range from the anchor to this item. */
  range: boolean;
}

/** Props shared by the list and grid views so App can render either one. */
export interface FileViewProps {
  entries: Entry[];
  loading: boolean;
  error: AppError | null;
  selection: Set<string>;
  renamingPath: string | null;
  /** Tags attached to an entry, for the tag dots beside its name. */
  getTags: (path: string) => Tag[];
  onSelect: (entry: Entry, mods: SelectMods) => void;
  onActivate: (entry: Entry) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onBackgroundContextMenu: (x: number, y: number) => void;
  onBackgroundClick: () => void;
  onRenameCommit: (entry: Entry, newName: string) => void;
  onRenameCancel: () => void;
  /** Begin an OS/internal drag of an item (selection-aware). */
  onItemDragStart: (entry: Entry, e: DragEvent) => void;
  /** Drop onto a folder row/tile → into that folder. */
  onDropOnFolder: (folder: Entry, e: DragEvent) => void;
  /** Drop onto empty space → into the current folder. */
  onDropOnPane: (e: DragEvent) => void;
}
