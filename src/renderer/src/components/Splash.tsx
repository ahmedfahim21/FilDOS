import { Wordmark } from './Logo';

/** The six scoop tiles of the mark (warm→cool position order). */
const SCOOPS: ReadonlyArray<readonly [col: number, row: number, fill: string]> = [
  [0, 0, 'fill-strawberry'],
  [1, 0, 'fill-bubblegum'],
  [2, 0, 'fill-mango'],
  [0, 1, 'fill-blueberry'],
  [1, 1, 'fill-mint'],
  [0, 2, 'fill-grape'],
];

/** The three neutral ghost tiles that hold the grid. */
const GHOSTS: ReadonlyArray<readonly [col: number, row: number]> = [
  [2, 1],
  [1, 2],
  [2, 2],
];

/**
 * The boot splash shown while the renderer resolves the starting folder and
 * prefs. The scoop tiles breathe in a staggered wave while the whole mark
 * floats; an indeterminate bar sweeps under the wordmark. Honors
 * prefers-reduced-motion (see global.css).
 */
export function Splash() {
  return (
    <div
      data-splash
      className="bg-background flex h-full flex-col items-center justify-center gap-7"
    >
      <svg
        viewBox="0 0 40 40"
        aria-hidden
        className="size-16"
        style={{ animation: 'splash-float 3s var(--ease-fluid) infinite' }}
      >
        {GHOSTS.map(([c, r]) => (
          <rect
            key={`g-${c}-${r}`}
            x={3 + c * 12}
            y={3 + r * 12}
            width={10}
            height={10}
            rx={2.8}
            className="fill-foreground opacity-[0.08] dark:opacity-[0.16]"
          />
        ))}
        {SCOOPS.map(([c, r, fill], i) => (
          <rect
            key={`s-${c}-${r}`}
            x={3 + c * 12}
            y={3 + r * 12}
            width={10}
            height={10}
            rx={2.8}
            className={fill}
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center',
              animation: 'splash-pulse 1.5s var(--ease-fluid) infinite',
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </svg>

      <div className="flex flex-col items-center gap-3.5">
        <Wordmark className="text-2xl" />
        <div className="bg-muted relative h-0.5 w-28 overflow-hidden rounded-full">
          <div
            className="bg-foreground/40 absolute inset-y-0 left-0 w-1/4 rounded-full"
            style={{ animation: 'splash-sweep 1.4s var(--ease-fluid) infinite' }}
          />
        </div>
      </div>
    </div>
  );
}
