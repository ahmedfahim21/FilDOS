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
  Page,
  PageList,
  PageRow,
  PageRowDate,
  PageRowIcon,
  PageRowInfo,
  PageState,
} from './Page';

/**
 * Page listing every file carrying a tag, with open / locate / untag
 * actions, plus rename and delete for the tag itself. Files deleted outside
 * FilDOS are pruned server-side when the list loads.
 */
export function TagFilesView({
  tag,
  onBack,
  onNavigate,
  onRenameTag,
  onDeleteTag,
  onChanged,
}: {
  tag: Tag;
  onBack: () => void;
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onBack]);

  const open = async (entry: Entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.path);
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
    <Page
      lead={
        renaming && (
          <>
            <TagDot color={tag.color} size={13} />
            <RenameInput
              initial={tag.name}
              onCommit={(name) => {
                setRenaming(false);
                if (name !== tag.name) onRenameTag(tag.id, name);
              }}
              onCancel={() => setRenaming(false)}
            />
          </>
        )
      }
      note="Files don't move when tagged — a tag is just a saved collection you can return to."
      actions={
        <>
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
        </>
      }
    >
      <PageList>
        {loading ? (
          <PageState>Loading…</PageState>
        ) : entries.length === 0 ? (
          <PageState>No files carry this tag yet</PageState>
        ) : (
          entries.map((entry) => (
            <PageRow key={entry.path} onDoubleClick={() => open(entry)}>
              <PageRowIcon>
                <Icon name={entry.isDirectory ? 'folder' : 'file'} size={16} />
              </PageRowIcon>
              <PageRowInfo
                name={entry.name}
                meta={entry.path}
                title={entry.path}
              />
              <PageRowDate>{formatDate(entry.modified)}</PageRowDate>
              <Button variant="outline" size="sm" onClick={() => open(entry)}>
                <Icon name="open" size={14} /> Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Show in Folder"
                onClick={() =>
                  onNavigate(entry.isDirectory ? entry.path : parentOf(entry.path))
                }
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
            </PageRow>
          ))
        )}
      </PageList>
    </Page>
  );
}
