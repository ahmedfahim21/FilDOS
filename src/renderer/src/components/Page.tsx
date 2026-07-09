import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * DOM slot inside the {@link Toolbar} where the active page portals its own
 * controls (view toggle, Clear / Rename / Delete). Provided by App and filled
 * by the Toolbar's ref; consumed via {@link PageChrome}. This keeps a metadata
 * page's actions on the single toolbar row instead of stacking a second bar.
 */
export const PageChromeSlotContext = createContext<HTMLElement | null>(null);

/** Portals a page's action controls into the Toolbar's page-action slot. */
export function PageChrome({ children }: { children: ReactNode }) {
  const slot = useContext(PageChromeSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/** Animated spinner shown while a page view is loading data. */
export function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <svg
        className="animate-spin text-muted-foreground/50"
        width={20}
        height={20}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="Loading"
      >
        <circle
          cx={10}
          cy={10}
          r={8}
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="18 37"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * In-flow page shell for the Recents / Tag-files views. Fills the main content
 * area in place of the file browser; the shared {@link Toolbar} (Back/Forward +
 * the breadcrumb page name + the page's own controls, portaled via
 * {@link PageChrome}) is the only chrome, so the page itself is just an optional
 * caption over a list.
 */
export function Page({
  note,
  children,
}: {
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-testid="page-view" className="bg-background flex h-full min-h-0 flex-col">
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
  return <div className="flex-1 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">{children}</div>;
}

/** Scrollable grid container for page views in grid mode. */
export function PageGrid({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
      <div className="flex flex-wrap content-start gap-0.5">{children}</div>
    </div>
  );
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
      className="group hover:bg-accent flex items-center gap-2.5 rounded-md px-2.5 py-2 cursor-default"
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
      <div className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap text-2xs">
        {meta}
      </div>
    </div>
  );
}

export function PageRowDate({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground shrink-0 text-2xs">{children}</div>
  );
}

/** Leading entry glyph, brand-colored like the file rows. */
export function PageRowIcon({ children }: { children: ReactNode }) {
  return <span className={cn('text-muted-foreground shrink-0')}>{children}</span>;
}
