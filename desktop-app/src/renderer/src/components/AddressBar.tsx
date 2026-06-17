import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { segments } from '@/lib/path';
import { cn } from '@/lib/utils';

/**
 * Breadcrumb trail that flips into an editable path field on double-click or
 * Cmd/Ctrl+L. Entering a valid directory navigates; anything else toasts.
 */
export function AddressBar() {
  const { currentPath, navigate } = useNavigation();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setValue(currentPath);
    setEditing(true);
  };

  // Cmd/Ctrl+L focuses the address field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        startEdit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const submit = async () => {
    const p = value.trim();
    setEditing(false);
    if (!p || p === currentPath) return;
    const result = await window.fsapi.getInfo(p);
    if (result.ok && result.data.isDirectory) navigate(p);
    else if (result.ok) notify('error', 'That path is a file, not a folder.');
    else notify('error', result.error.message);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="border-primary bg-background text-foreground flex-1 select-text rounded-md border px-2 py-1.25 outline-none [-webkit-app-region:no-drag]"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  const crumbs = segments(currentPath);
  return (
    <div
      className="group flex flex-1 items-center gap-0.5 overflow-hidden whitespace-nowrap [-webkit-app-region:no-drag]"
      title={currentPath}
      onDoubleClick={startEdit}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={crumb.path}>
            {i > 0 && <span className="text-muted-foreground opacity-60">›</span>}
            <button
              className={cn(
                'max-w-50 overflow-hidden rounded-[5px] border-0 bg-transparent px-1.5 py-1 text-ellipsis',
                isLast
                  ? 'text-foreground cursor-default font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              onClick={() => !isLast && navigate(crumb.path)}
              disabled={isLast}
            >
              {crumb.label}
            </button>
          </Fragment>
        );
      })}
      <button
        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-[5px] border-0 bg-transparent px-1.5 py-0.5 opacity-0 group-hover:opacity-100"
        onClick={startEdit}
        title="Edit path (⌘L)"
      >
        ⌖
      </button>
    </div>
  );
}
