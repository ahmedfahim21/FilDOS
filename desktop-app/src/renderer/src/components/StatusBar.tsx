import { formatSize } from '@/lib/format';

interface StatusBarProps {
  shown: number;
  hidden: number;
  selectedCount: number;
  /** Summed size of selected files (folders excluded). */
  selectedSize: number;
}

export function StatusBar({ shown, hidden, selectedCount, selectedSize }: StatusBarProps) {
  return (
    <footer
      data-testid="statusbar"
      className="border-border bg-card text-muted-foreground flex shrink-0 items-center justify-between gap-4 border-t px-3 py-1 text-xs"
    >
      <span>
        {shown} item{shown !== 1 ? 's' : ''}
        {hidden > 0 ? ` (${hidden} hidden)` : ''}
      </span>
      {selectedCount > 0 && (
        <span>
          {selectedCount} selected
          {selectedSize > 0 ? ` · ${formatSize(selectedSize)}` : ''}
        </span>
      )}
    </footer>
  );
}
