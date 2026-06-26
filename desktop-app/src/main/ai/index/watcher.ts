import { watch, type FSWatcher } from 'node:fs';

/**
 * Keeps the index fresh against on-disk changes with two mechanisms:
 *
 *  - a **recursive watcher** per root for low-latency updates (mac/Windows;
 *    Node doesn't support `recursive` on Linux, so the watch simply fails to
 *    arm there and we lean on the timer), and
 *  - a **periodic reconcile** timer — the cross-platform backbone and the
 *    primary mechanism on Linux.
 *
 * Both just nudge a debounced `reconcile()` (the indexer's crawl, which no-ops
 * unchanged files and prunes vanished ones). This is separate from the
 * renderer's `fs/watch.ts` (which drives the file-list UI) — different concern.
 */

const DEBOUNCE_MS = 2000;
const PERIOD_MS = 15 * 60 * 1000;

export interface WatcherDeps {
  config: () => Promise<{ enabled: boolean; roots: string[] }>;
  /** Kick a reconcile (typically `() => void indexer.start()`). */
  reconcile: () => void;
}

export class IndexWatcher {
  private watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;
  private debounce: NodeJS.Timeout | null = null;

  constructor(private readonly deps: WatcherDeps) {}

  /** Arm the recursive watches and the periodic timer from current config. */
  async start(): Promise<void> {
    this.stop();
    const { enabled, roots } = await this.deps.config();
    if (!enabled) return;

    for (const root of roots) {
      try {
        const w = watch(root, { recursive: true, persistent: false }, () => this.schedule());
        w.on('error', () => {});
        this.watchers.push(w);
      } catch {
        // Recursive watch unsupported (Linux) or root unwatchable — the timer covers it.
      }
    }
    this.timer = setInterval(() => this.deps.reconcile(), PERIOD_MS);
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
