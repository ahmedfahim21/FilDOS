import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/lib/media';
import { useToast } from '@/state/toast';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState(page);
  const [total, setTotal] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: mediaUrl(path) });
    (async () => {
      const doc = await task.promise;
      if (cancelled) return;
      setTotal(doc.numPages);
      const p = await doc.getPage(Math.min(Math.max(1, current), doc.numPages));
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: PAGE_WIDTH / base.width });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setHeight(viewport.height);
      await p.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (cancelled) return;
      // Highlight text runs that contain a query word.
      const content = await p.getTextContent();
      const found: Box[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const str = item.str.toLowerCase();
        if (!words.some((w) => str.includes(w))) continue;
        const [a, b, , , e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(a, b);
        found.push({ left: e, top: f - fontHeight, width: item.width * viewport.scale, height: fontHeight * 1.15 });
      }
      setBoxes(found);
    })().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[fildos] page preview failed:', path, message);
      setFailed(message);
    });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [path, current, words]);

  const openExternally = () =>
    window.fsapi.open(path).then((r) => {
      if (!r.ok) notifyError(r.error);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-auto max-w-none gap-3 overflow-hidden sm:max-w-none">
        <div className="flex items-baseline justify-between gap-6 pr-8">
          <DialogTitle className="text-foreground truncate text-sm font-normal">{name}</DialogTitle>
          <span className="text-muted-foreground shrink-0 font-mono text-3xs">
            Page {current}
            {total ? ` of ${total}` : ''}
          </span>
        </div>
        <div
          className="border-border relative overflow-auto rounded-md border bg-white"
          style={{ width: PAGE_WIDTH, maxHeight: '70vh', minHeight: height ? undefined : 320 }}
        >
          {failed ? (
            <div className="text-muted-foreground p-6 text-xs">Couldn’t show this page — {failed}</div>
          ) : (
            <>
              {!height && <div className="bg-muted/40 absolute inset-0 animate-pulse" />}
              <canvas ref={canvasRef} className="block" />
              {boxes.map((b, i) => (
                <span
                  key={i}
                  className="bg-mango/30 pointer-events-none absolute rounded-[2px]"
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                />
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" disabled={current <= 1} onClick={() => setCurrent((c) => c - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={total !== null && current >= total} onClick={() => setCurrent((c) => c + 1)}>
              Next
            </Button>
          </div>
          <Button size="sm" onClick={openExternally}>
            Open in default app
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
