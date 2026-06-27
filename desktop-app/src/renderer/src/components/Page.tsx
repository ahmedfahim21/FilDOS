import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * In-flow page shell for the Trash / Recents / Tag-files views. Fills the main
 * content area in place of the file browser; the toolbar (Back/Forward + the
 * breadcrumb, which shows the page name) is the navigation chrome, so the page
 * itself is just a thin action bar over a list — mirroring how a folder renders
 * (toolbar + column header + list).
 */
export function Page({
  lead,
  actions,
  note,
  children,
}: {
  /** Left-aligned bar content (e.g. an inline rename field). */
  lead?: ReactNode;
  /** Right-aligned action buttons. */
  actions?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-testid="page-view" className="bg-background flex h-full min-h-0 flex-col">
      {(lead || actions) && (
        <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">{lead}</div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {note && (
        <p className="text-muted-foreground m-0 px-4.5 py-2.5 text-xs leading-snug">
          {note}
        </p>
      )}
      {children}
    </div>
  );
}

export function PageList({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto px-2 pb-2">{children}</div>;
}

export function PageState({ children }: { children: ReactNode }) {
  return <div className="text-muted-foreground py-10 text-center">{children}</div>;
}

export function PageRow({
  children,
  onDoubleClick,
  onContextMenu,
}: {
  children: ReactNode;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="hover:bg-accent flex items-center gap-2.5 rounded-md px-2.5 py-2"
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}

/** The name + path lines that fill the middle of a page row. */
export function PageRowInfo({
  name,
  meta,
  title,
}: {
  name: string;
  meta: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="overflow-hidden text-ellipsis whitespace-nowrap" title={title}>
        {name}
      </div>
      <div className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
        {meta}
      </div>
    </div>
  );
}

export function PageRowDate({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground shrink-0 text-[11px]">{children}</div>
  );
}

/** Leading entry glyph, brand-colored like the file rows. */
export function PageRowIcon({ children }: { children: ReactNode }) {
  return <span className={cn('text-primary shrink-0')}>{children}</span>;
}
