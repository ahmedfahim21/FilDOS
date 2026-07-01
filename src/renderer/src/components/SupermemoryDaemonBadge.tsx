import { useEffect, useState } from 'react';
import type { SupermemoryDaemonState, SupermemoryDaemonStatus } from '@shared/types';

const DOT: Record<SupermemoryDaemonState, string> = {
  off: 'text-muted-foreground',
  starting: 'text-amber-500',
  running: 'text-emerald-500',
  error: 'text-red-500',
};

const LABEL: Record<SupermemoryDaemonState, string> = {
  off: 'Daemon off',
  starting: 'Starting',
  running: 'Daemon running',
  error: 'Daemon not running',
};

/**
 * Live badge for the bundled supermemory daemon. Explains the otherwise-silent
 * first boot (it downloads a model before it listens), so "nothing happening"
 * during indexing becomes legible.
 */
export function SupermemoryDaemonBadge() {
  const [status, setStatus] = useState<SupermemoryDaemonStatus>({ state: 'off' });

  useEffect(() => {
    window.memory.daemonStatus().then((r) => {
      if (r.ok) setStatus(r.data);
    });
    return window.memory.onDaemonStatus(setStatus);
  }, []);

  return (
    <div className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
      <span className={DOT[status.state]}>{status.state === 'starting' ? '◐' : '●'}</span>
      <span className="text-foreground">{LABEL[status.state]}</span>
      {status.message && <span className="text-muted-foreground truncate">— {status.message}</span>}
    </div>
  );
}
