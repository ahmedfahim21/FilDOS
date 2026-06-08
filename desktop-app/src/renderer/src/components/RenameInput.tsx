import { useEffect, useRef, useState } from 'react';

/** Inline name editor used for rename. Commits on Enter/blur, cancels on Escape. */
export function RenameInput({
  initial,
  className = 'row__rename',
  onCommit,
  onCancel,
}: {
  initial: string;
  className?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf('.');
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, [initial]);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== initial) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      className={className}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') {
          committed.current = true;
          onCancel();
        }
      }}
    />
  );
}
