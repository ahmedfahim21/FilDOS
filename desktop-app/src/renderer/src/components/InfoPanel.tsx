import { useEffect, useState } from 'react';
import type { AppError, FileInfo } from '@shared/types';
import { formatDate, formatSize, typeLabel } from '@/lib/format';
import { Icon } from './Icon';

export function InfoPanel({ path, onClose }: { path: string; onClose: () => void }) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  // Recursive folder size: null until computed.
  const [folderBytes, setFolderBytes] = useState<number | null>(null);

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
    <aside className="infopanel">
      <div className="infopanel__head">
        <span>Info</span>
        <button className="iconbtn" onClick={onClose} aria-label="Close info">
          <Icon name="close" size={14} />
        </button>
      </div>

      {error && <div className="infopanel__error">{error.message}</div>}

      {info && (
        <div className="infopanel__body">
          <div className="infopanel__hero">
            <Icon name={info.isDirectory ? 'folder' : 'file'} size={40} />
            <div className="infopanel__name" title={info.name}>
              {info.name}
            </div>
          </div>

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
          <div className="infopanel__divider" />
          <Row label="Created" value={formatDate(info.created)} />
          <Row label="Modified" value={formatDate(info.modified)} />
          <Row label="Accessed" value={formatDate(info.accessed)} />
          <div className="infopanel__divider" />
          <Row label="Permissions" value={`${info.permissions} (${info.mode.toString(8)})`} mono />
        </div>
      )}
    </aside>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="inforow">
      <div className="inforow__label">{label}</div>
      <div className={`inforow__value${mono ? ' mono' : ''}`}>{value}</div>
    </div>
  );
}
