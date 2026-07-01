import { cn } from '@/lib/utils';

const NODES: ReadonlyArray<readonly [number, number, boolean]> = [
  // [col, row, ghost] on a 0..2 grid; ghost = the 3 faded nodes (bottom-right).
  [0, 0, false],
  [1, 0, false],
  [2, 0, false],
  [0, 1, false],
  [1, 1, false],
  [2, 1, true],
  [0, 2, false],
  [1, 2, true],
  [2, 2, true],
];

/** The node-grid mark. Inherits `currentColor`; ghost nodes are dimmed. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn('size-4', className)}
    >
      {NODES.map(([c, r, ghost]) => (
        <circle
          key={`${c}-${r}`}
          cx={5 + c * 7}
          cy={5 + r * 7}
          r={2.6}
          opacity={ghost ? 0.22 : 1}
        />
      ))}
    </svg>
  );
}

/** The "FilDOS" wordmark. "Fil" follows text colour; "DOS" is always Azure. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline leading-none', className)}>
      <span className="font-sans font-light -tracking-[0.03em]">Fil</span>
      <span className="text-azure font-mono font-normal">DOS</span>
    </span>
  );
}

/** Mark + wordmark, the default horizontal lockup. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark className="text-azure size-[1.1em]" />
      <Wordmark />
    </span>
  );
}
