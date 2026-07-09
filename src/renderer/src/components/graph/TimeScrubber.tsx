import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';

/**
 * The Brain view's time scrubber: a histogram of file mtimes with a draggable
 * range brush, plus a replay button that sweeps the window forward so the
 * graph "grows" chronologically. Fractions in [0, 1] map linearly onto
 * [min, max]; a null value means "everything".
 */
export function TimeScrubber({
  counts,
  min,
  max,
  value,
  onChange,
}: {
  counts: number[];
  min: number;
  max: number;
  value: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<'from' | 'to' | null>(null);
  const [playing, setPlaying] = useState(false);

  const span = Math.max(1, max - min);
  const from = value ? (value[0] - min) / span : 0;
  const to = value ? (value[1] - min) / span : 1;
  const peak = Math.max(1, ...counts);

  const fractionAt = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const commit = (f: number, t: number): void => {
    if (f <= 0.001 && t >= 0.999) onChange(null);
    else onChange([min + f * span, min + t * span]);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const f = fractionAt(e.clientX);
    // Grab the nearer handle; a click far from both moves the nearer one there.
    const handle = Math.abs(f - from) <= Math.abs(f - to) ? 'from' : 'to';
    setPlaying(false);
    setDrag(handle);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (handle === 'from') commit(Math.min(f, to), to);
    else commit(from, Math.max(f, from));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag) return;
    const f = fractionAt(e.clientX);
    if (drag === 'from') commit(Math.min(f, to), to);
    else commit(from, Math.max(f, from));
  };

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  // Keyboard control for each handle: arrows nudge (Shift = larger step),
  // Home/End jump to the bound, Escape/Backspace resets the whole range. The
  // "from" handle can't cross "to" and vice versa.
  const onHandleKey =
    (handle: 'from' | 'to') =>
    (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (handle === 'from') commit(clamp(from + dir * step, 0, to), to);
        else commit(from, clamp(to + dir * step, from, 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setPlaying(false);
        if (handle === 'from') commit(0, to);
        else commit(from, from);
      } else if (e.key === 'End') {
        e.preventDefault();
        setPlaying(false);
        if (handle === 'from') commit(to, to);
        else commit(from, 1);
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        setPlaying(false);
        onChange(null);
      }
    };

  // Replay: sweep the right edge from "just past the left edge" to the end.
  // User-initiated, so it animates regardless of prefers-reduced-motion.
  useEffect(() => {
    if (!playing) return;
    const durationMs = 8000;
    const startFrom = from;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const head = startFrom + 0.02 + (1 - startFrom - 0.02) * eased;
      commit(startFrom, head);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intentionally not re-run on from/to churn — the loop itself moves them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const fmt = (t: number): string =>
    new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });

  return (
    <div className="border-border flex shrink-0 items-center gap-2.5 border-t px-3 py-2">
      <button
        className="text-muted-foreground hover:text-foreground hover:bg-accent flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs"
        title={playing ? 'Stop the replay' : 'Watch your files appear in the order you worked on them'}
        onClick={() => setPlaying((p) => !p)}
      >
        <Icon name={playing ? 'pause' : 'play'} size={13} />
        {playing ? 'Stop' : 'Replay'}
      </button>
      <span className="text-muted-foreground w-16 shrink-0 text-right text-3xs tabular-nums">
        {fmt(value ? value[0] : min)}
      </span>
      <div
        ref={barRef}
        role="group"
        aria-label="File time range"
        className="relative h-8 min-w-0 flex-1 cursor-ew-resize touch-none select-none"
        data-testid="time-scrubber"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={() => onChange(null)}
        title="Drag to focus a period; double-click to reset"
      >
        <div className="absolute inset-0 flex items-end gap-px">
          {counts.map((c, i) => {
            const x = (i + 0.5) / counts.length;
            const lit = x >= from && x <= to;
            return (
              <div
                key={i}
                className={cn(
                  'min-w-0 flex-1 rounded-t-[1px] transition-colors',
                  lit ? 'bg-mint/70' : 'bg-muted-foreground/20',
                )}
                style={{ height: `${6 + (c / peak) * 88}%` }}
              />
            );
          })}
        </div>
        {/* Brush window outline */}
        <div
          className="border-mint/60 pointer-events-none absolute inset-y-0 rounded border-x-2"
          style={{ left: `${from * 100}%`, width: `${Math.max(0.5, (to - from) * 100)}%` }}
        />
        {/* Focusable slider handles — one per edge, keyboard-accessible */}
        {([
          ['from', from, value ? value[0] : min, 'Start of time range'] as const,
          ['to', to, value ? value[1] : max, 'End of time range'] as const,
        ]).map(([handle, pos, ts, label]) => (
          <button
            key={handle}
            type="button"
            role="slider"
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={Math.round(ts)}
            aria-valuetext={fmt(ts)}
            className="focus-visible:ring-mint absolute inset-y-0 w-2.5 -translate-x-1/2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
            style={{ left: `${pos * 100}%` }}
            onKeyDown={onHandleKey(handle)}
          />
        ))}
      </div>
      <span className="text-muted-foreground w-16 shrink-0 text-3xs tabular-nums">
        {fmt(value ? value[1] : max)}
      </span>
    </div>
  );
}
