import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Keycap primitive for surfacing a keyboard shortcut. Prefer this over a raw
 * `<kbd>` so every shortcut hint shares one look. `default` is the bordered
 * muted keycap used in menus and lists; `raised` adds the printed-key shadow
 * (the composer legend); `ghost` is borderless for keys tucked inside another
 * tinted control. Wrap multi-key combos in `<KbdGroup>` so they space evenly.
 */
const kbdVariants = cva(
  'inline-flex items-center justify-center gap-0.5 whitespace-nowrap font-mono leading-none select-none pointer-events-none [&_svg]:size-2.5',
  {
    variants: {
      variant: {
        default: 'border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5',
        raised:
          'border-border bg-background text-muted-foreground rounded border px-1.5 py-0.5 shadow-[0_1px_0_0_var(--color-border)]',
        ghost: 'text-muted-foreground',
      },
      size: {
        sm: 'text-3xs',
        md: 'text-2xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  },
);

function Kbd({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(kbdVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup, kbdVariants };
