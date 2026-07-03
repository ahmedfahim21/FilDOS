import { cn } from '@/lib/utils';

/**
 * The 3×3 mark on a 0..2 grid. Six active tiles form a reversed "F", each fixed
 * to one scoop in warm→cool position order; three ghost tiles (bottom-right)
 * hold the grid in the neutral foreground colour. `fill` is a Tailwind colour
 * utility so the tiles stay token-driven (see .claude/brand-guidelines.md).
 */
const TILES: ReadonlyArray<readonly [col: number, row: number, fill: string]> = [
  [0, 0, 'fill-strawberry'],
  [1, 0, 'fill-bubblegum'],
  [2, 0, 'fill-mango'],
  [0, 1, 'fill-blueberry'],
  [1, 1, 'fill-mint'],
  [0, 2, 'fill-grape'],
  // ghost tiles — neutral, low-opacity (Ink 8% on light, White 16% on dark).
  [2, 1, 'fill-foreground opacity-[0.08] dark:opacity-[0.16]'],
  [1, 2, 'fill-foreground opacity-[0.08] dark:opacity-[0.16]'],
  [2, 2, 'fill-foreground opacity-[0.08] dark:opacity-[0.16]'],
];

/** The scoop-tile mark. Minimum render size 14px. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn('size-4', className)}>
      {TILES.map(([c, r, fill]) => (
        <rect
          key={`${c}-${r}`}
          x={3 + c * 12}
          y={3 + r * 12}
          width={10}
          height={10}
          rx={2.8}
          className={fill}
        />
      ))}
    </svg>
  );
}

/** The "FilDOS" wordmark — fully neutral; colour lives only in the mark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline leading-none', className)}>
      <span className="font-sans font-light tracking-tight">Fil</span>
      <span className="font-mono font-normal">DOS</span>
    </span>
  );
}

/** Mark + wordmark, the default horizontal lockup. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark className="size-[1.1em]" />
      <Wordmark />
    </span>
  );
}
