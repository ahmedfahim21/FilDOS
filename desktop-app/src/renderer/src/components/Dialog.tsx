import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Generic modal shell: backdrop, escape-to-close, focus trap-ish autofocus. */
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="dialog__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** A dialog that collects a single text value (new folder / rename). */
export function PromptDialog({
  title,
  label,
  initialValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Preselect the name portion (without extension) for convenient renaming.
    const dot = initialValue.lastIndexOf('.');
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, [initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <Dialog title={title} onClose={onCancel}>
      <label className="field">
        <span className="field__label">{label}</span>
        <input
          ref={inputRef}
          className="field__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </label>
      <div className="dialog__actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" onClick={submit} disabled={!value.trim()}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/** A confirmation dialog (used for Move to Trash). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="dialog__message">{message}</p>
      <div className="dialog__actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
