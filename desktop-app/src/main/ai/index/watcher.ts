import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { isIgnored } from './ignore';

/**
 * Keeps the index fresh against on-disk changes with two mechanisms:
 *
 *  - a **recursive watcher** per root for low-latency updates (mac/Windows;
 *    Node doesn't support `recursive` on Linux, so the watch simply fails to
 *    arm there and we lean on the timer), and
 *  - a **periodic reconcile** timer — the cross-platform backbone and the
 *    primary mechanism on Linux.
 *
 * Both nudge a debounced `reconcile()` (the indexer's crawl, which no-ops
 * unchanged files and prunes vanished ones). Change events are filtered through
 * the same ignore rules as the crawl, so noise from caches, dependency trees,
 * excluded paths, and FilDOS's own data dir doesn't spin the indexer — without
 * it, every SQLite WAL write under the watched home dir would re-trigger us in a
 * feedback loop. Separate from the renderer's `fs/watch.ts` (file-list UI).
 */

const DEBOUNCE_MS = 2000;
/** Floor on the rescan interval, so a bad pref can't busy-loop the indexer. */
const MIN_INTERVAL_MINUTES = 1;

export interface WatcherDeps {
  config: () => Promise<{
    enabled: boolean;
    roots: string[];
    excludes: string[];
    intervalMinutes: number;
  }>;
  /** Kick a reconcile (typically `() => void indexer.reconcile()`). */
  reconcile: () => void;
}

export class IndexWatcher {
  private watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private excludes: string[] = [];

  constructor(private readonly deps: WatcherDeps) {}

  /** Arm the recursive watches and the periodic timer from current config. */
  async start(): Promise<void> {
    this.stop();
    const { enabled, roots, excludes, intervalMinutes } = await this.deps.config();
    if (!enabled) return;
    this.excludes = excludes;

    for (const root of roots) {
      try {
        const w = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
          // Drop events for paths we'd never index — chiefly our own DB/model
          // writes under the user-data dir, which else would loop forever.
          if (filename != null && isIgnored(join(root, filename.toString()), this.excludes)) return;
          this.schedule();
        });
        w.on('error', () => {});
        this.watchers.push(w);
      } catch {
        // Recursive watch unsupported (Linux) or root unwatchable — the timer covers it.
      }
    }
    const periodMs = Math.max(MIN_INTERVAL_MINUTES, intervalMinutes) * 60 * 1000;
    this.timer = setInterval(() => this.deps.reconcile(), periodMs);
  }

  /** Tear everything down (call on quit, or before re-arming after a config change). */
  stop(): void {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.timer) clearInterval(this.timer);
    this.debounce = null;
    this.timer = null;
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* already closed */
      }
    }
    this.watchers = [];
  }

  /** Re-read config and reset watches (after the user changes roots/exclusions). */
  async refresh(): Promise<void> {
    await this.start();
  }

  private schedule(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.deps.reconcile(), DEBOUNCE_MS);
  }
}
