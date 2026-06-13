import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';

export function Toasts() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed right-4 bottom-4 z-300 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Glyph = t.kind === 'error' ? CircleAlert : CircleCheck;
        return (
          <div
            key={t.id}
            className="animate-in fade-in slide-in-from-bottom-2 bg-popover text-popover-foreground border-border flex min-w-72 max-w-96 items-start gap-2.5 rounded-lg border p-3 shadow-lg"
          >
            <Glyph
              className={cn(
                'mt-px size-5 shrink-0',
                t.kind === 'error' ? 'text-destructive' : 'text-success',
              )}
            />
            <span className="flex-1 pt-px text-sm leading-snug">
              {t.message}
            </span>
            <button
              className="text-muted-foreground hover:bg-accent hover:text-foreground -mt-1 -mr-1 grid size-6 shrink-0 place-items-center rounded-sm transition-colors"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
