import { useEffect, useRef, useState } from 'react';
// The legacy build: pdfjs 6's modern build needs Uint8Array.prototype.toHex,
// which Electron 37's Chromium (138) doesn't have yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/lib/media';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Page width in CSS pixels; the canvas renders at the device pixel ratio. */
const PAGE_WIDTH = 620;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * One PDF page rendered in-app, `width` px wide, with `words` highlighted where
 * they sit on the page. Controlled: the caller owns the page number (and
 * renders a `<Pager>` wherever its layout wants it). Used by search-hit
 * previews and Quick Look.
 */
export function PdfViewer({
  src,
  page,
  words,
  width = PAGE_WIDTH,
  onTotal,
  className,
  pageClassName,
}: {
  /** A `fildos-media://` URL the renderer may read. */
  src: string;
  page: number;
  /** Lowercased words to highlight. */
  words: string[];
  width?: number;
  /** Called once the document's page count is known. */
  onTotal?: (total: number) => void;
  /** Classes for the scroll box around the page. */
  className?: string;
  /** Classes for the page sheet itself. */
  pageClassName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A notification, not an input: a new callback mustn't reload the page.
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: src });
    (async () => {
      const doc = await task.promise;
      if (cancelled) return;
      onTotalRef.current?.(doc.numPages);
      const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await p.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (cancelled) return;
      setHeight(viewport.height);
      // Highlight text runs that contain a query word.
      const found: Box[] = [];
      if (words.length) {
        const content = await p.getTextContent();
        for (const item of content.items) {
          if (!('str' in item) || !item.str) continue;
          const str = item.str.toLowerCase();
          if (!words.some((w) => str.includes(w))) continue;
          const [a, b, , , e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(a, b);
          found.push({ left: e, top: f - fontHeight, width: item.width * viewport.scale, height: fontHeight * 1.15 });
        }
      }
      setBoxes(found);
    })().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[fildos] page preview failed:', src, message);
      setFailed(message);
    });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [src, page, words, width]);

  return (
    <div className={cn('overflow-x-hidden overflow-y-auto', className)}>
      {failed ? (
        <div className="text-muted-foreground p-6 text-xs">Couldn’t show this page — {failed}</div>
      ) : (
        <div className={cn('relative mx-auto bg-white', pageClassName)} style={{ width, minHeight: height ?? width * 1.294 }}>
          {height === null && <div className="bg-muted/60 absolute inset-0 animate-pulse" />}
          <canvas ref={canvasRef} className={cn('block transition-opacity duration-200', height === null && 'opacity-0')} />
          {boxes.map((b, i) => (
            <span
              key={i}
              className="bg-mango/30 pointer-events-none absolute rounded-[2px]"
              style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Page controls: ‹ 3 / 200 ›. */
export function Pager({ page, total, onPage }: { page: number; total: number | null; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevron" size={14} className="rotate-180" />
      </Button>
      <span className="text-muted-foreground min-w-[5.5rem] text-center font-mono text-3xs tabular-nums">
        {page} / {total ?? '…'}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Next page"
        disabled={total === null || page >= total}
        onClick={() => onPage(page + 1)}
      >
        <Icon name="chevron" size={14} />
      </Button>
    </div>
  );
}

/**
 * A PDF page a search hit pointed at, rendered in-app with the query's words
 * highlighted where they sit on the page. Opening in the default app starts at
 * page one (most viewers can't be told a page), so this is where "the clause
 * on page 7" is actually shown.
 */
export function PagePreview({
  path,
  name,
  page,
  words,
  onClose,
}: {
  path: string;
  name: string;
  page: number;
  /** Lowercased words to highlight. */
  words: string[];
  onClose: () => void;
}) {
  const { notifyError } = useToast();
  const [current, setCurrent] = useState(page);
  const [total, setTotal] = useState<number | null>(null);
  const openExternally = () =>
    window.fsapi.open(path).then((r) => {
      if (!r.ok) notifyError(r.error);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-auto max-w-none gap-3 overflow-hidden sm:max-w-none">
        <div className="pr-8">
          <DialogTitle className="text-foreground truncate text-sm font-normal">{name}</DialogTitle>
        </div>
        <PdfViewer
          src={mediaUrl(path)}
          page={current}
          words={words}
          onTotal={setTotal}
          className="border-border rounded-md border"
        />
        <div className="flex items-center justify-between gap-2">
          <Pager page={current} total={total} onPage={setCurrent} />
          <Button size="sm" onClick={openExternally}>
            Open in default app
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
