import { useCallback, useEffect, useState } from 'react';
import type { Entry, Tag } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { parentOf } from '@/lib/path';
import { Icon } from './Icon';
import { RenameInput } from './RenameInput';

/**
 * Overlay listing every file carrying a tag, with open / locate / untag
 * actions, plus rename and delete for the tag itself. Files deleted outside
 * FilDOS are pruned server-side when the list loads.
 */
export function TagFilesView({
  tag,
  onClose,
  onNavigate,
  onRenameTag,
  onDeleteTag,
  onChanged,
}: {
  tag: Tag;
  onClose: () => void;
  /** Jump the browser to a folder (used by "Show in Folder"). */
  onNavigate: (path: string) => void;
  onRenameTag: (id: number, name: string) => void;
  onDeleteTag: (id: number) => void;
  /** Called after an untag so the browser refreshes its tag state. */
  onChanged: () => void;
}) {
  const { notifyError } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await window.tags.files(tag.id);
    if (r.ok) setEntries(r.data);
    else notifyError(r.error);
    setLoading(false);
  }, [tag.id, notifyError]);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onClose]);

  const open = async (entry: Entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.path);
      onClose();
      return;
    }
    const r = await window.fsapi.open(entry.path);
    if (!r.ok) notifyError(r.error);
  };

  const untag = async (entry: Entry) => {
    const r = await window.tags.unassign([entry.path], tag.id);
    if (r.ok) {
      load();
      onChanged();
    } else {
      notifyError(r.error);
    }
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="panelview" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panelview__head">
          <h2>
            <span className="tagdot tagdot--lg" style={{ background: tag.color }} />
            {renaming ? (
              <RenameInput
                initial={tag.name}
                onCommit={(name) => {
                  setRenaming(false);
                  if (name !== tag.name) onRenameTag(tag.id, name);
                }}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              tag.name
            )}
          </h2>
          <div className="panelview__actions">
            <button className="btn" onClick={() => setRenaming(true)} disabled={renaming}>
              <Icon name="rename" size={14} /> Rename
            </button>
            {confirmingDelete ? (
              <button className="btn btn--danger" onClick={() => onDeleteTag(tag.id)}>
                Delete tag and {entries.length ? `${entries.length} assignment(s)` : 'close'}?
              </button>
            ) : (
              <button className="btn" onClick={() => setConfirmingDelete(true)}>
                <Icon name="trash" size={14} /> Delete
              </button>
            )}
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <p className="panelview__note">
          Files don't move when tagged — a tag is just a saved collection you can return to.
        </p>

        <div className="panelview__list">
          {loading ? (
            <div className="pane__state">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="pane__state">No files carry this tag yet</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.path} className="panelrow" onDoubleClick={() => open(entry)}>
                <Icon name={entry.isDirectory ? 'folder' : 'file'} size={16} />
                <div className="panelrow__info">
                  <div className="panelrow__name" title={entry.path}>
                    {entry.name}
                  </div>
                  <div className="panelrow__meta">{entry.path}</div>
                </div>
                <div className="panelrow__date">{formatDate(entry.modified)}</div>
                <button className="btn" onClick={() => open(entry)}>
                  <Icon name="open" size={14} /> Open
                </button>
                <button
                  className="iconbtn"
                  title="Show in Folder"
                  onClick={() => {
                    onNavigate(entry.isDirectory ? entry.path : parentOf(entry.path));
                    onClose();
                  }}
                >
                  <Icon name="folder" size={14} />
                </button>
                <button className="iconbtn" title="Remove tag" onClick={() => untag(entry)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
