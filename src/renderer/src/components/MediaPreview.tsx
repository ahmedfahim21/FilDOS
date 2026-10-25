import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/lib/media';
import { formatMoment } from '@/lib/place';
import { useToast } from '@/state/toast';

/**
 * A recording played in-app from `seconds`. Used by search-hit previews (from
 * the moment that matched) and Quick Look (from the start).
 */
export function MediaPlayer({
  src,
  seconds,
  video,
  className,
}: {
  src: string;
  seconds: number;
  video: boolean;
  /** Replaces the element's default size classes. */
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = () => {
      el.currentTime = seconds;
      el.play().catch((err: unknown) => {
        // Autoplay can be refused; the controls are there to press play.
        console.info('[fildos] media preview did not autoplay:', String(err));
      });
    };
    el.addEventListener('loadedmetadata', start, { once: true });
    return () => el.removeEventListener('loadedmetadata', start);
  }, [src, seconds]);

  const common = {
    ref,
    src,
    controls: true,
    preload: 'metadata' as const,
    onError: () => {
      const message = ref.current?.error?.message || 'this file can’t be played here';
      console.error('[fildos] media preview failed:', src, message);
      setFailed(message);
    },
  };

  if (failed) return <div className="text-muted-foreground w-[480px] p-4 text-xs">Couldn’t play this here — {failed}</div>;
  return video ? (
    <video {...common} className={className ?? 'max-h-[65vh] w-[640px] rounded-md bg-black'} />
  ) : (
    <audio {...common} className={className ?? 'w-[480px]'} />
  );
}

/**
 * A recording a search hit pointed at, playing from the moment that matched.
 * Default apps mostly can't be told where to start, so this is where "the
 * minute where they talk about sleep" is actually heard.
 */
export function MediaPreview({
  path,
  name,
  seconds,
  video,
  onClose,
}: {
  path: string;
  name: string;
  seconds: number;
  video: boolean;
  onClose: () => void;
}) {
  const { notifyError } = useToast();
  const openExternally = () =>
    window.fsapi.open(path).then((r) => {
      if (!r.ok) notifyError(r.error);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-auto max-w-none gap-3 sm:max-w-none">
        <div className="flex items-baseline justify-between gap-6 pr-8">
          <DialogTitle className="text-foreground truncate text-sm font-normal">{name}</DialogTitle>
          <span className="text-muted-foreground shrink-0 font-mono text-3xs">from {formatMoment(seconds)}</span>
        </div>
        <MediaPlayer src={mediaUrl(path)} seconds={seconds} video={video} />
        <div className="flex justify-end">
          <Button size="sm" onClick={openExternally}>
            Open in default app
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
