import { useEffect, useRef, useState } from 'react';

/**
 * A recording played in-app from `seconds`. Used by search-hit previews (from
 * the moment that matched) and Quick Look (from the start).
 */
export function MediaPlayer({
  src,
  seconds,
  video,
  autoPlay = true,
  className,
}: {
  src: string;
  seconds: number;
  video: boolean;
  /** Start playing once loaded (off where hovering only previews). */
  autoPlay?: boolean;
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
      if (!autoPlay) return;
      el.play().catch((err: unknown) => {
        // Autoplay can be refused; the controls are there to press play.
        console.info('[fildos] media preview did not autoplay:', String(err));
      });
    };
    // Already loaded (another moment of the same recording): seek now.
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      start();
      return;
    }
    el.addEventListener('loadedmetadata', start, { once: true });
    return () => el.removeEventListener('loadedmetadata', start);
  }, [src, seconds, autoPlay]);

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
