import type { Tag } from '@shared/types';
import { cn } from '@/lib/utils';

/** A single colored tag dot. */
export function TagDot({
  color,
  size = 9,
  className,
}: {
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', className)}
      style={{ background: color, width: size, height: size }}
    />
  );
}

/** Compact row of colored dots showing the tags attached to an entry. */
export function TagDots({
  tags,
  max = 3,
  dotSize = 9,
  className,
}: {
  tags: Tag[];
  max?: number;
  dotSize?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.75', className)}
      title={tags.map((t) => t.name).join(', ')}
    >
      {tags.slice(0, max).map((t) => (
        <TagDot key={t.id} color={t.color} size={dotSize} />
      ))}
      {tags.length > max && (
        <span className="text-muted-foreground text-3xs">
          +{tags.length - max}
        </span>
      )}
    </span>
  );
}
