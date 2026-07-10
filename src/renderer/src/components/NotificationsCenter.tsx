import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  useNotifications,
  type AppNotification,
  type NotificationStatus,
} from '@/state/notifications';
import { Icon } from './Icon';

/** Opt controls out of the window-drag region so they stay clickable. */
const NO_DRAG = '[-webkit-app-region:no-drag]';

/**
 * The top-bar notifications center — a bell (left of "Ask AI") that opens an
 * in-place panel listing live download + indexing activity. Active rows show a
 * real progress bar; finished ones flip to a "Done" state and can be cleared.
 * Purely a consumer of `useNotifications`, so it reflects actual background
 * work and never fabricates progress.
 */
export function NotificationsCenter() {
  const { items, activeCount, unseen, hasCleared, setOpen, dismiss, clear } = useNotifications();
  const [open, setOpenState] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const next = !open;
    setOpenState(next);
    setOpen(next);
  };
  const close = () => {
    setOpenState(false);
    setOpen(false);
  };

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const badge = activeCount > 0 ? (activeCount > 9 ? '9+' : String(activeCount)) : null;

  return (
    <div ref={rootRef} className={cn('relative', NO_DRAG)}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        aria-expanded={open}
        title="Notifications"
        className={cn(
          'relative grid size-8 place-items-center rounded-sm transition-colors duration-150 ease-snappy active:scale-[0.94]',
          open
            ? 'bg-foreground/[0.09] text-foreground'
            : 'text-muted-foreground hover:bg-foreground/[0.09] hover:text-foreground',
        )}
      >
        <Icon name="bell" size={18} className={activeCount > 0 ? 'text-mint' : undefined} />
        {badge ? (
          <span className="bg-mint text-ink absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[9px] leading-none font-semibold tabular-nums">
            {badge}
          </span>
        ) : unseen ? (
          <span className="bg-mint absolute top-0.5 right-0.5 size-2 rounded-full ring-2 ring-card" />
        ) : null}
      </button>

      {open && (
        <>
          {/* Click-away layer beneath the panel. */}
          <div className="fixed inset-0 z-40" onMouseDown={close} aria-hidden />
          <div
            role="dialog"
            aria-label="Notifications"
            className="material animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none border-border absolute right-0 z-50 mt-2 w-84 origin-top-right overflow-hidden rounded-xl border shadow-xl duration-150 ease-snappy"
          >
            <div className="border-border flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
              <span className="text-sm font-medium">Notifications</span>
              <button
                onClick={clear}
                disabled={!hasCleared}
                className="text-muted-foreground hover:text-foreground rounded-sm text-xs transition-colors disabled:pointer-events-none disabled:opacity-40"
              >
                Clear
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
                  <Icon name="bell" size={20} />
                </span>
                <p className="text-sm font-medium">You're all caught up</p>
                <p className="text-muted-foreground text-2xs max-w-52 leading-snug">
                  Downloads and indexing progress will show up here.
                </p>
              </div>
            ) : (
              <ul className="max-h-96 overflow-y-auto p-1.5">
                {items.map((n) => (
                  <NotificationRow key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_ICON: Record<NotificationStatus, 'download' | 'sparkles' | 'check-circle' | 'alert-circle'> = {
  active: 'download',
  done: 'check-circle',
  error: 'alert-circle',
};

function NotificationRow({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  const active = n.status === 'active';
  const icon = active && n.kind === 'index' ? 'sparkles' : STATUS_ICON[n.status];
  const pct = n.progress != null ? Math.round(n.progress * 100) : null;

  return (
    <li className="group hover:bg-foreground/[0.04] flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors">
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
          active && 'bg-mint/12 text-mint',
          n.status === 'done' && 'bg-success/12 text-success',
          n.status === 'error' && 'bg-destructive/12 text-destructive',
        )}
      >
        <Icon name={icon} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
          {active ? (
            pct != null ? (
              <span className="text-mint text-2xs shrink-0 tabular-nums">{pct}%</span>
            ) : null
          ) : (
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="text-muted-foreground hover:bg-foreground/[0.09] hover:text-foreground -mr-1 grid size-5 shrink-0 place-items-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        <p
          className={cn(
            'text-2xs truncate leading-snug',
            n.status === 'error' ? 'text-destructive/90' : 'text-muted-foreground',
          )}
        >
          {n.status === 'error' && n.message ? n.message : n.detail}
        </p>

        {active && (
          <div className="bg-foreground/[0.08] mt-1.5 h-1 overflow-hidden rounded-full">
            {n.progress != null ? (
              <div
                className="bg-mint h-full rounded-full transition-[width] duration-300 ease-snappy"
                style={{ width: `${Math.max(3, pct ?? 0)}%` }}
              />
            ) : (
              // Indeterminate (e.g. scanning): a gentle sweep, calmed under
              // reduced-motion by the global keyframe guard.
              <div className="notif-indeterminate bg-mint/70 h-full w-1/3 rounded-full" />
            )}
          </div>
        )}
      </div>
    </li>
  );
}
