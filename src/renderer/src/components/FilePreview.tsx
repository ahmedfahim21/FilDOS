import { useEffect, useRef, useState } from 'react';
import type { AppError, Entry, FilePreview as Preview } from '@shared/types';
import { fileLogo } from '@/lib/fileLogo';
import { markWords } from '@/lib/marks';
import type { Place } from '@/lib/place';
import { cn } from '@/lib/utils';
import { MediaPlayer } from './MediaPlayer';
import { Pager, PdfViewer } from './PdfViewer';

type Loaded = { path: string; preview: Preview } | { path: string; error: AppError };

/** Widest a PDF page renders, however wide the stage. */
const PDF_MAX_WIDTH = 640;
/** Vertical room the page leaves for its padding (20 + 56, the pager sits in the bottom pad) and its hairline border. */
const PDF_CHROME_PX = 78;

/** Stable empty highlight list, so the PDF viewer doesn't reload its page on every render. */
const NO_WORDS: string[] = [];

/**
 * A file shown on a stage of the caller's size (`className`): pictures fitted,
 * PDF pages with a pager, recordings, text and documents, folders, or the
 * file's icon when there's nothing to show. With a `place` it opens where a
 * search hit points — the page, or the moment — and `words` light up on PDF
 * pages and in text. Shared by Quick Look and the search panel.
 */
export function FilePreview({
  entry,
  place,
  words = NO_WORDS,
  autoPlay = false,
  className,
}: {
  entry: Entry;
  place?: Place;
  /** Lowercased words to highlight. */
  words?: string[];
  /** Start playing recordings as soon as they load. */
  autoPlay?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const startPage = place?.kind === 'page' ? place.page : 1;
  const [page, setPage] = useState(startPage);
  const [pages, setPages] = useState<number | null>(null);
  // PDF pages render to the stage's width (it changes with the window).
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setStage({ width: Math.round(e.contentRect.width), height: Math.round(e.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPage(startPage);
    setPages(null);
    window.fsapi.preview(entry.path).then((r) => {
      if (cancelled) return;
      if (!r.ok) console.error('[fildos] preview failed:', entry.path, r.error.code, r.error.message);
      setLoaded(r.ok ? { path: entry.path, preview: r.data } : { path: entry.path, error: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [entry.path, startPage]);

  // A result for the previous file is stale while the next one loads.
  const current = loaded?.path === entry.path ? loaded : null;
  const preview = current && 'preview' in current ? current.preview : null;
  const sheet = preview?.kind === 'text' || preview?.kind === 'document';

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-md',
        sheet ? 'border-border bg-background border' : 'bg-muted/60',
        current === null && 'animate-pulse',
        className,
      )}
    >
      {current === null ? null : 'error' in current ? (
        <Placeholder entry={entry} caption={`Couldn’t preview this — ${current.error.message}`} />
      ) : preview?.kind === 'pdf' ? (
        stage !== null && (
          <>
            <PdfViewer
              src={preview.url}
              page={page}
              words={words}
              // The whole page fits: within the stage's width and its height above the pager.
              width={Math.max(160, Math.min(PDF_MAX_WIDTH, stage.width - 32))}
              height={Math.max(160, stage.height - PDF_CHROME_PX)}
              onTotal={setPages}
              className="h-full w-full px-4 pt-5 pb-14"
              pageClassName="border-border/60 border"
            />
            <div className="border-border bg-card/95 absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border px-1 shadow-sm">
              <Pager page={page} total={pages} onPage={setPage} />
            </div>
          </>
        )
      ) : (
        <Stage entry={entry} preview={preview!} place={place} words={words} autoPlay={autoPlay} />
      )}
    </div>
  );
}

function Stage({
  entry,
  preview,
  place,
  words,
  autoPlay,
}: {
  entry: Entry;
  preview: Exclude<Preview, { kind: 'pdf' }>;
  place?: Place;
  words: string[];
  autoPlay: boolean;
}) {
  const seconds = place?.kind === 'moment' ? place.seconds : 0;
  switch (preview.kind) {
    case 'image':
      return <Picture key={preview.url} src={preview.url} alt={entry.name} />;
    case 'video':
      return (
        <MediaPlayer
          src={preview.url}
          seconds={seconds}
          video
          autoPlay={autoPlay}
          className="max-h-full max-w-full bg-black"
        />
      );
    case 'audio':
      return (
        <div className="flex w-full flex-col items-center gap-6">
          <img src={fileLogo(entry)} alt="" className="size-16" />
          <MediaPlayer
            src={preview.url}
            seconds={seconds}
            video={false}
            autoPlay={autoPlay}
            className="w-[min(440px,80%)]"
          />
        </div>
      );
    case 'text':
    case 'document':
      return (
        <TextSheet
          key={entry.path}
          text={preview.text}
          truncated={preview.truncated}
          mono={preview.kind === 'text'}
          words={words}
        />
      );
    case 'folder':
      return (
        <Placeholder
          entry={entry}
          caption={preview.items === 1 ? '1 item' : `${preview.items.toLocaleString()} items`}
        />
      );
    case 'none':
      return <Placeholder entry={entry} caption="No preview for this kind of file" />;
  }
}

/** Text or a document's words, with `words` marked and the first one scrolled into view. */
function TextSheet({
  text,
  truncated,
  mono,
  words,
}: {
  text: string;
  truncated: boolean;
  mono: boolean;
  words: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const parts = markWords(text, words);

  useEffect(() => {
    const box = scrollRef.current;
    const first = box?.querySelector('mark');
    // Land the first match a third of the way down, so the lines before it give context.
    if (box && first instanceof HTMLElement) box.scrollTop = Math.max(0, first.offsetTop - box.clientHeight / 3);
  }, [text, words]);

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-6 py-5">
      <div
        className={cn(
          'text-foreground relative break-words whitespace-pre-wrap',
          mono ? 'font-mono text-xs leading-relaxed' : 'mx-auto max-w-[62ch] text-sm leading-relaxed',
        )}
      >
        {parts.map((p, i) =>
          p.marked ? (
            <mark key={i} className="bg-mint/25 text-foreground rounded-[2px]">
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
      {truncated && (
        <div className="text-muted-foreground mt-6 text-2xs">
          Showing the beginning. Open the file to read the rest.
        </div>
      )}
    </div>
  );
}

/** A picture, faded in once decoded (no pop-in mid-paint). */
function Picture({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setReady(true)}
      onError={() => console.error('[fildos] preview picture failed to load:', alt)}
      className={cn(
        'max-h-full max-w-full object-contain transition-opacity duration-200',
        ready ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/** The file's own icon and a line about it: folders, unknown types, failures. */
function Placeholder({ entry, caption }: { entry: Entry; caption: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-4 px-6 text-center text-xs">
      <img src={fileLogo(entry)} alt="" className="size-20" />
      {caption}
    </div>
  );
}
