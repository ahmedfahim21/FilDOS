import { useEffect, useState } from 'react';
import type { AppError, FileInfo, Tag } from '@shared/types';
import { canPreview, formatDate, formatSize, typeLabel } from '@/lib/format';
import { fileLogo } from '@/lib/fileLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useThumbnail } from '@/hooks/useThumbnail';
import { Icon } from './Icon';
import { TagDot } from './TagDots';

const ROW = 'mb-2.5';
const ROW_LABEL =
  'text-muted-foreground mb-0.5 text-[11px] tracking-[0.05em] uppercase';
const ROW_VALUE = 'wrap-break-word select-text';

export function InfoPanel({
  path,
  tags,
  getTags,
  onToggleTag,
  onClose,
}: {
  path: string;
  /** All known tags, for the "add" picker. */
  tags: Tag[];
  /** Tags currently attached to a visible path. */
  getTags: (path: string) => Tag[];
  onToggleTag: (path: string, tag: Tag, apply: boolean) => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  // Recursive folder size: null until computed.
  const [folderBytes, setFolderBytes] = useState<number | null>(null);
  // Live preview for images/PDFs/videos; null falls back to the type icon.
  const preview = useThumbnail(path, 256, !!info && canPreview(info));

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setError(null);
    setFolderBytes(null);
    window.fsapi.getInfo(path).then((result) => {
      if (cancelled) return;
      if (result.ok) setInfo(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  // For folders, compute the recursive size in the background.
  useEffect(() => {
    if (!info?.isDirectory) return;
    let cancelled = false;
    window.fsapi.folderSize(path).then((result) => {
      if (!cancelled && result.ok) setFolderBytes(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [path, info?.isDirectory]);

  return (
    <aside className="border-border bg-card flex w-70 shrink-0 flex-col overflow-y-auto border-l">
      <div className="border-border flex items-center justify-between border-b px-3 py-2.5 font-semibold">
        <span>Info</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label="Close info"
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      {error && <div className="text-destructive p-4">{error.message}</div>}

      {info && (
        <div className="p-4">
          <div className="flex flex-col items-center gap-2.5 pt-2 pb-4.5">
            {preview ? (
              <img
                src={preview}
                alt=""
                className="max-h-32 max-w-full rounded-md object-contain"
              />
            ) : (
              <img src={fileLogo(info)} alt="" width={40} height={40} />
            )}
            <div
              className="text-center font-semibold select-text wrap-break-word"
              title={info.name}
            >
              {info.name}
            </div>
          </div>

          <TagsRow
            attached={getTags(path)}
            all={tags}
            onAdd={(tag) => onToggleTag(path, tag, true)}
            onRemove={(tag) => onToggleTag(path, tag, false)}
          />

          <Row label="Type" value={typeLabel(info)} />
          <Row
            label="Size"
            value={
              info.isDirectory
                ? folderBytes === null
                  ? 'Calculating…'
                  : formatSize(folderBytes)
                : formatSize(info.size)
            }
          />
          <Row label="Where" value={info.path} mono />
          {info.realPath && <Row label="Links to" value={info.realPath} mono />}
          <div className="bg-border my-3 h-px" />
          <Row label="Created" value={formatDate(info.created)} />
          <Row label="Modified" value={formatDate(info.modified)} />
          <Row label="Accessed" value={formatDate(info.accessed)} />
          <div className="bg-border my-3 h-px" />
          <Row
            label="Permissions"
            value={`${info.permissions} (${info.mode.toString(8)})`}
            mono
          />
        </div>
      )}
    </aside>
  );
}

/** Tag chips with a picker to attach any not-yet-applied tag. */
function TagsRow({
  attached,
  all,
  onAdd,
  onRemove,
}: {
  attached: Tag[];
  all: Tag[];
  onAdd: (tag: Tag) => void;
  onRemove: (tag: Tag) => void;
}) {
  const attachedIds = new Set(attached.map((t) => t.id));
  const addable = all.filter((t) => !attachedIds.has(t.id));
  if (attached.length === 0 && addable.length === 0) return null;

  const chip =
    'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-[11px]';

  return (
    <div className={ROW}>
      <div className={ROW_LABEL}>Tags</div>
      <div className={cn(ROW_VALUE, 'flex flex-wrap gap-1')}>
        {attached.map((tag) => (
          <span key={tag.id} className={chip}>
            <TagDot color={tag.color} />
            {tag.name}
            <button
              className="text-muted-foreground hover:text-destructive grid place-items-center border-0 bg-transparent p-0"
              title={`Remove “${tag.name}”`}
              onClick={() => onRemove(tag)}
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        ))}
        {addable.length > 0 && (
          <select
            className={cn(
              chip,
              'text-muted-foreground hover:border-foreground/40 hover:text-foreground cursor-pointer appearance-none',
            )}
            value=""
            onChange={(e) => {
              const tag = addable.find((t) => t.id === Number(e.target.value));
              if (tag) onAdd(tag);
            }}
          >
            <option value="" disabled>
              + Add
            </option>
            {addable.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={ROW}>
      <div className={ROW_LABEL}>{label}</div>
      <div className={cn(ROW_VALUE, mono && 'font-mono text-xs')}>{value}</div>
    </div>
  );
}
