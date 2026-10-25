import { useEffect, useState } from 'react';
import type { AppError, Entry, FilePreview } from '@shared/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { fileLogo } from '@/lib/fileLogo';
import { formatDate, formatSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useToast } from '@/state/toast';
import { MediaPlayer } from './MediaPreview';
import { Pager, PdfViewer } from './PagePreview';

type Loaded = { path: string; preview: FilePreview } | { path: string; error: AppError };

/** Keys that step to the neighbouring file while Quick Look is open. */
const STEP_KEYS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** Width of a PDF page on the stage (the stage is up to 840 px wide inside the dialog). */
const PDF_PAGE_WIDTH = 600;

/**
 * Quick Look: a look at the selected file without opening another app —
 * pictures, PDF pages, recordings, text and code, documents, folders. Every
 * file shows on the same fixed stage, so stepping through a folder with the
 * arrow keys never makes the window jump. Space or Esc closes it.
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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPage(1);
    setPages(null);
    window.fsapi.preview(entry.path).then((r) => {
      if (cancelled) return;
      if (!r.ok) console.error('[fildos] quick look failed:', entry.path, r.error.code, r.error.message);
      setLoaded(r.ok ? { path: entry.path, preview: r.data } : { path: entry.path, error: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

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

  // A result for the previous file is stale while the next one loads.
  const current = loaded?.path === entry.path ? loaded : null;
  const preview = current && 'preview' in current ? current.preview : null;
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

        <div
          className={cn(
            'relative flex h-[min(560px,calc(100vh-13rem))] items-center justify-center overflow-hidden rounded-md',
            preview?.kind === 'text' || preview?.kind === 'document' ? 'border-border bg-background border' : 'bg-muted/60',
            current === null && 'animate-pulse',
          )}
        >
          {current === null ? null : 'error' in current ? (
            <Placeholder entry={entry} caption={`Couldn’t preview this — ${current.error.message}`} />
          ) : (
            <Stage entry={entry} preview={current.preview} page={page} onPages={setPages} />
          )}
        </div>

        <div className="flex h-8 items-center justify-between gap-6">
          {preview?.kind === 'pdf' ? (
            <Pager page={page} total={pages} onPage={setPage} />
          ) : (
            <div className="text-muted-foreground flex items-center gap-1.5 text-2xs">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="mr-2">next file</span>
              <Kbd>space</Kbd>
              <span>close</span>
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={openExternally}>
            Open
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stage({
  entry,
  preview,
  page,
  onPages,
}: {
  entry: Entry;
  preview: FilePreview;
  page: number;
  onPages: (total: number) => void;
}) {
  switch (preview.kind) {
    case 'image':
      return <Picture key={preview.url} src={preview.url} alt={entry.name} />;
    case 'pdf':
      return (
        <PdfViewer
          src={preview.url}
          page={page}
          words={NO_WORDS}
          width={PDF_PAGE_WIDTH}
          onTotal={onPages}
          className="h-full w-full py-6"
          pageClassName="border-border/60 border"
        />
      );
    case 'video':
      return <MediaPlayer src={preview.url} seconds={0} video className="max-h-full max-w-full bg-black" />;
    case 'audio':
      return (
        <div className="flex w-full flex-col items-center gap-6">
          <img src={fileLogo(entry)} alt="" className="size-16" />
          <MediaPlayer src={preview.url} seconds={0} video={false} className="w-[min(440px,80%)]" />
        </div>
      );
    case 'text':
    case 'document':
      return (
        <div className="absolute inset-0 overflow-y-auto px-6 py-5">
          <div
            className={cn(
              'text-foreground break-words whitespace-pre-wrap',
              preview.kind === 'text' ? 'font-mono text-xs leading-relaxed' : 'mx-auto max-w-[62ch] text-sm leading-relaxed',
            )}
          >
            {preview.text}
          </div>
          {preview.truncated && (
            <div className="text-muted-foreground mt-6 text-2xs">Showing the beginning. Open the file to read the rest.</div>
          )}
        </div>
      );
    case 'folder':
      return <Placeholder entry={entry} caption={preview.items === 1 ? '1 item' : `${preview.items.toLocaleString()} items`} />;
    case 'none':
      return <Placeholder entry={entry} caption="No preview for this kind of file" />;
  }
}

/** Stable empty highlight list, so the PDF viewer doesn't reload its page on every render. */
const NO_WORDS: string[] = [];

/** A picture, faded in once decoded (no pop-in mid-paint). */
function Picture({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setReady(true)}
      onError={() => console.error('[fildos] quick look picture failed to load:', alt)}
      className={cn('max-h-full max-w-full object-contain transition-opacity duration-200', ready ? 'opacity-100' : 'opacity-0')}
    />
  );
}

/** The file's own icon and a line about it: folders, unknown types, failures. */
function Placeholder({ entry, caption }: { entry: Entry; caption: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-4 text-xs">
      <img src={fileLogo(entry)} alt="" className="size-20" />
      {caption}
    </div>
  );
}
