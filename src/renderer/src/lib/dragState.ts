import type { DragEvent } from 'react';

/**
 * The file paths of an in-app drag, stashed at dragstart. OS-native drags
 * (started via `webContents.startDrag`) usually surface again as
 * `dataTransfer.files` on drop, but not on every platform/target — so any drop
 * target can fall back to this stash to learn what's being dragged. Cleared on
 * the next `mousedown`, before a new drag can begin.
 */
let dragged: string[] = [];

export const dragPaths = {
  set: (paths: string[]) => {
    dragged = paths;
  },
  clear: () => {
    dragged = [];
  },
  current: () => dragged,
};

/**
 * Resolve the file paths carried by a drop: prefer the real dropped files, and
 * fall back to the in-app drag stash when the browser hands us none.
 */
export function resolveDroppedPaths(e: DragEvent): string[] {
  const fromFiles = Array.from(e.dataTransfer.files)
    .map((f) => window.dnd.pathForFile(f))
    .filter(Boolean);
  return fromFiles.length ? fromFiles : dragPaths.current();
}
