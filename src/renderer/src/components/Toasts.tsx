import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export function Toasts() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed right-4 bottom-4 z-300 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'material text-popover-foreground border-border flex min-w-72 max-w-96 items-start gap-2.5 rounded-lg border p-3 shadow-lg duration-200 ease-snappy',
            t.exiting
              ? 'animate-out fade-out-0 slide-out-to-bottom-2'
              : 'animate-in fade-in slide-in-from-bottom-2',
          )}
        >
          <span
            className={cn(
              'mt-px shrink-0',
              t.kind === 'error' ? 'text-destructive' : 'text-success',
            )}
          >
            <Icon name={t.kind === 'error' ? 'alert-circle' : 'check-circle'} size={20} />
          </span>
          <span className="flex-1 pt-px text-sm leading-snug">
            {t.message}
          </span>
          <button
            className="text-muted-foreground hover:bg-accent hover:text-foreground -mt-1 -mr-1 grid size-6 shrink-0 place-items-center rounded-sm transition-colors"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
