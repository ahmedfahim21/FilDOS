import type { Entry } from '@shared/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { placeLabel, type Place } from '@/lib/place';
import { useToast } from '@/state/toast';
import { FilePreview } from './FilePreview';

/**
 * A hit opened where it matched: the PDF at its page with the query's words
 * highlighted, or the recording playing from its moment. Default apps mostly
 * can't be told a page or a time, so this is where "page 7" is actually shown.
 * Sized to the window, like Quick Look.
 */
export function PlacePreview({
  entry,
  place,
  words,
  onClose,
}: {
  entry: Entry;
  place: Place;
  /** Lowercased words to highlight. */
  words: string[];
  onClose: () => void;
}) {
  const { notifyError } = useToast();
  const openExternally = () =>
    window.fsapi.open(entry.path).then((r) => {
      if (!r.ok) notifyError(r.error);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(880px,calc(100vw-4rem))] max-w-none gap-4 sm:max-w-none">
        <div className="flex min-w-0 items-baseline gap-3 pr-8">
          <DialogTitle className="text-foreground min-w-0 truncate text-sm font-normal">{entry.name}</DialogTitle>
          <span className="text-muted-foreground shrink-0 font-mono text-3xs">
            {place.kind === 'page' ? `page ${place.page}` : `from ${placeLabel(place)}`}
          </span>
        </div>
        <FilePreview entry={entry} place={place} words={words} autoPlay className="h-[min(600px,calc(100vh-13rem))]" />
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={openExternally}>
            Open
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
