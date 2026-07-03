import { formatSize } from '@/lib/format';

interface StatusBarProps {
  shown: number;
  hidden: number;
  selectedCount: number;
  /** Summed size of selected files (folders excluded). */
  selectedSize: number;
  /** When set, a metadata page is shown — its name replaces the item counts. */
  label?: string;
}

export function StatusBar({ shown, hidden, selectedCount, selectedSize, label }: StatusBarProps) {
  return (
    <footer
      data-testid="statusbar"
      className="border-border bg-card text-muted-foreground flex shrink-0 items-center justify-between gap-4 border-t px-3 py-1 text-2xs"
    >
      <span>
        {label ?? (
          <>
            {shown} item{shown !== 1 ? 's' : ''}
            {hidden > 0 ? ` (${hidden} hidden)` : ''}
          </>
        )}
      </span>
      {!label && selectedCount > 0 && (
        <span>
          {selectedCount} selected
          {selectedSize > 0 ? ` · ${formatSize(selectedSize)}` : ''}
        </span>
      )}
    </footer>
  );
}
