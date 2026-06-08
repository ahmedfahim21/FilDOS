import type { WebContents } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import { Events } from '@shared/channels';

/**
 * A single active, non-recursive watcher on the currently-viewed directory.
 * Watching one dir keeps things cheap and cross-platform; renderer swaps the
 * watched path as the user navigates. Events are debounced to coalesce bursts.
 */
let current: { path: string; watcher: FSWatcher } | null = null;
let debounce: NodeJS.Timeout | null = null;

export function setWatch(dirPath: string, sender: WebContents): void {
  if (current?.path === dirPath) return;
  closeWatch();
  try {
    const watcher = watch(dirPath, { persistent: false }, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!sender.isDestroyed()) sender.send(Events.dirChanged, dirPath);
      }, 150);
    });
    watcher.on('error', () => closeWatch());
    current = { path: dirPath, watcher };
  } catch {
    // Directory not watchable (permissions, unmounted, …) — ignore.
  }
}

export function closeWatch(): void {
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
  if (current) {
    try {
      current.watcher.close();
    } catch {
      /* already closed */
    }
    current = null;
  }
}
