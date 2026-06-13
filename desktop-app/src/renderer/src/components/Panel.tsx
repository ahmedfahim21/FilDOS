import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Centered modal overlay shell shared by the Trash / Recents / Tag-files panels. */
export function Panel({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-200 grid place-items-center bg-black/45"
      onMouseDown={onClose}
    >
      <div
        className="bg-card border-border flex max-h-[calc(100vh-80px)] w-160 max-w-[calc(100vw-40px)] flex-col rounded-lg border shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-border flex items-center justify-between border-b px-4.5 py-3.5">
      {children}
    </div>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
      {children}
    </h2>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground m-0 px-4.5 py-2.5 text-xs leading-snug">
      {children}
    </p>
  );
}

export function PanelList({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto px-2 pb-2">{children}</div>;
}

export function PanelState({ children }: { children: ReactNode }) {
  return <div className="text-muted-foreground py-10 text-center">{children}</div>;
}

export function PanelRow({
  children,
  onDoubleClick,
}: {
  children: ReactNode;
  onDoubleClick?: () => void;
}) {
  return (
    <div
      className="hover:bg-accent flex items-center gap-2.5 rounded-md px-2.5 py-2"
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}

/** The name + path lines that fill the middle of a panel row. */
export function PanelRowInfo({
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

export function PanelRowDate({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground shrink-0 text-[11px]">{children}</div>
  );
}

/** Leading entry glyph, brand-colored like the file rows. */
export function PanelRowIcon({ children }: { children: ReactNode }) {
  return <span className={cn('text-primary shrink-0')}>{children}</span>;
}
