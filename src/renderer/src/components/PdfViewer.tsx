import { useEffect, useRef, useState } from 'react';
// The legacy build: pdfjs 6's modern build needs Uint8Array.prototype.toHex,
// which Electron 37's Chromium (138) doesn't have yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Button } from '@/components/ui/button';
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
  height,
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
  /** When set, the page also fits this height (the whole page shows, no scrolling). */
  height?: number;
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
  /** The rendered page's size; null until it has painted. */
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
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
      const scale = height ? Math.min(width / base.width, height / base.height) : width / base.width;
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await p.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (cancelled) return;
      setPageSize({ width: viewport.width, height: viewport.height });
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
  }, [src, page, words, width, height]);

  return (
    // A page fitted to a height never needs scrolling; one fitted to a width may.
    <div className={cn(height ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto', className)}>
      {failed ? (
        <div className="text-muted-foreground p-6 text-xs">Couldn’t show this page — {failed}</div>
      ) : (
        <div
          className={cn('relative mx-auto bg-white', pageClassName)}
          // Before the first paint, hold a US-letter-shaped space so nothing jumps.
          style={{ width: pageSize?.width ?? width, minHeight: pageSize?.height ?? height ?? width * 1.294 }}
        >
          {pageSize === null && <div className="bg-muted/60 absolute inset-0 animate-pulse" />}
          <canvas ref={canvasRef} className={cn('block transition-opacity duration-200', pageSize === null && 'opacity-0')} />
          {boxes.map((b, i) => (
            <span
              key={i}
              className="bg-mint/30 pointer-events-none absolute rounded-[2px]"
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
