import { useCallback, useEffect, useState } from 'react';
import type { Entry, Tag } from '@shared/types';
import { useToast } from '@/state/toast';
import { formatDate } from '@/lib/format';
import { parentOf } from '@/lib/path';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import { RenameInput } from './RenameInput';
import { TagDot } from './TagDots';
import {
  Panel,
  PanelActions,
  PanelHeader,
  PanelList,
  PanelNote,
  PanelRow,
  PanelRowDate,
  PanelRowIcon,
  PanelRowInfo,
  PanelState,
  PanelTitle,
} from './Panel';

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
    <Panel onClose={onClose}>
      <PanelHeader>
        <PanelTitle>
          <TagDot color={tag.color} size={13} />
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
        </PanelTitle>
        <PanelActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRenaming(true)}
            disabled={renaming}
          >
            <Icon name="rename" size={14} /> Rename
          </Button>
          {confirmingDelete ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDeleteTag(tag.id)}
            >
              Delete tag and{' '}
              {entries.length ? `${entries.length} assignment(s)` : 'close'}?
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              <Icon name="trash" size={14} /> Delete
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </Button>
        </PanelActions>
      </PanelHeader>

      <PanelNote>
        Files don&apos;t move when tagged — a tag is just a saved collection you
        can return to.
      </PanelNote>

      <PanelList>
        {loading ? (
          <PanelState>Loading…</PanelState>
        ) : entries.length === 0 ? (
          <PanelState>No files carry this tag yet</PanelState>
        ) : (
          entries.map((entry) => (
            <PanelRow key={entry.path} onDoubleClick={() => open(entry)}>
              <PanelRowIcon>
                <Icon name={entry.isDirectory ? 'folder' : 'file'} size={16} />
              </PanelRowIcon>
              <PanelRowInfo
                name={entry.name}
                meta={entry.path}
                title={entry.path}
              />
              <PanelRowDate>{formatDate(entry.modified)}</PanelRowDate>
              <Button variant="outline" size="sm" onClick={() => open(entry)}>
                <Icon name="open" size={14} /> Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Show in Folder"
                onClick={() => {
                  onNavigate(entry.isDirectory ? entry.path : parentOf(entry.path));
                  onClose();
                }}
              >
                <Icon name="folder" size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Remove tag"
                onClick={() => untag(entry)}
              >
                <Icon name="close" size={12} />
              </Button>
            </PanelRow>
          ))
        )}
      </PanelList>
    </Panel>
  );
}
