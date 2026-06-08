import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { segments } from '@/lib/path';

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
        className="addressbar__input"
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
    <div className="breadcrumbs" title={currentPath} onDoubleClick={startEdit}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={crumb.path}>
            {i > 0 && <span className="breadcrumbs__sep">›</span>}
            <button
              className={`breadcrumbs__item${isLast ? ' is-current' : ''}`}
              onClick={() => !isLast && navigate(crumb.path)}
              disabled={isLast}
            >
              {crumb.label}
            </button>
          </Fragment>
        );
      })}
      <button className="breadcrumbs__edit" onClick={startEdit} title="Edit path (⌘L)">
        ⌖
      </button>
    </div>
  );
}
