import { useEffect } from 'react';
import type { Entry } from '@shared/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { formatDate, formatSize } from '@/lib/format';
import { useToast } from '@/state/toast';
import { FilePreview } from './FilePreview';

/** Keys that step to the neighbouring file while Quick Look is open. */
const STEP_KEYS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/**
 * Quick Look: a look at the selected file without opening another app. Every
 * file shows on the same fixed stage (`FilePreview`), so stepping through a
 * folder with the arrow keys never makes the window jump. Space or Esc closes it.
 */
export function QuickLook({
  entry,
  onStep,
  onClose,
}: {
  entry: Entry;
  /** Move the selection by `delta` files (Quick Look follows it). */
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
  const { notifyError } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== ' ' && !(e.key in STEP_KEYS)) return;
      // These keys are Quick Look's: nothing else on the page may act on them too.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === ' ') onClose();
      else onStep(STEP_KEYS[e.key]);
    };
    // Capture: the video element and dialog buttons would otherwise take Space and the arrows.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onStep, onClose]);

  const openExternally = () =>
    window.fsapi.open(entry.path).then((r) => {
      if (!r.ok) notifyError(r.error);
    });

  const meta = entry.isDirectory ? formatDate(entry.modified) : `${formatSize(entry.size)} · ${formatDate(entry.modified)}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[min(880px,calc(100vw-4rem))] max-w-none gap-4 sm:max-w-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex min-w-0 items-baseline gap-3 pr-8">
          <DialogTitle className="text-foreground min-w-0 truncate text-sm font-normal">{entry.name}</DialogTitle>
          <span className="text-muted-foreground shrink-0 font-mono text-3xs">{meta}</span>
        </div>
        <FilePreview entry={entry} autoPlay className="h-[min(560px,calc(100vh-13rem))]" />
        <div className="flex h-8 items-center justify-between gap-6">
          <div className="text-muted-foreground flex items-center gap-1.5 text-2xs">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span className="mr-2">next file</span>
            <Kbd>space</Kbd>
            <span>close</span>
          </div>
          <Button size="sm" variant="secondary" onClick={openExternally}>
            Open
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
