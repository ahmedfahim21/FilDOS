import type { Tag } from '@shared/types';

/** Compact row of colored dots showing the tags attached to an entry. */
export function TagDots({ tags, max = 3 }: { tags: Tag[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <span className="tagdots" title={tags.map((t) => t.name).join(', ')}>
      {tags.slice(0, max).map((t) => (
        <span key={t.id} className="tagdot" style={{ background: t.color }} />
      ))}
      {tags.length > max && <span className="tagdots__more">+{tags.length - max}</span>}
    </span>
  );
}
