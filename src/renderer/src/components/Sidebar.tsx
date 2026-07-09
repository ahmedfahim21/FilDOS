import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { ConfirmDialog } from './Dialog';
import type { AccountRecord, DriveItem, QuickAccessItem, Tag } from '@shared/types';
import { formatRemote } from '@shared/remote';
import { useNavigation, type NavPage } from '@/state/navigation';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { TagDot } from './TagDots';
import { folderLogo } from '@/lib/fileLogo';
import gdriveLogo from '@/assets/cloud/GDrive.png';
import dropboxLogo from '@/assets/cloud/Dropbox.png';
import onedriveLogo from '@/assets/cloud/OneDrive.png';
import s3Logo from '@/assets/cloud/AmazonS3.webp';
import ipfsLogo from '@/assets/cloud/IPFS.png';
import megaLogo from '@/assets/cloud/mega.webp';

const PROVIDER_NAMES: Record<string, string> = {
  gdrive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  s3: 'Amazon S3',
  ipfs: 'IPFS',
  mega: 'Mega',
};

const PROVIDER_LOGOS: Record<string, string> = {
  gdrive: gdriveLogo,
  dropbox: dropboxLogo,
  onedrive: onedriveLogo,
  s3: s3Logo,
  ipfs: ipfsLogo,
  mega: megaLogo,
};

const itemClass = (active = false, drop = false) =>
  cn(
    'flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-foreground [&_svg]:text-muted-foreground hover:bg-accent',
    active && 'bg-foreground/[0.09] font-medium [&_svg]:text-foreground hover:bg-foreground/[0.09]',
    drop && 'bg-accent ring-2 ring-inset ring-foreground/30',
  );

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function Sidebar({
  tags,
  activePage,
  cloudKey,
  onDropPath,
  onOpenTag,
  onOpenRecents,
  onOpenCloudConnect,
  onOpenSettings,
  onDropOnTag,
}: {
  tags: Tag[];
  activePage: NavPage | null;
  /** Bump to force cloud accounts to re-fetch (after connect/disconnect). */
  cloudKey: number;
  onDropPath: (path: string, e: DragEvent) => void;
  onOpenTag: (tag: Tag) => void;
  onOpenRecents: () => void;
  onOpenCloudConnect: () => void;
  onOpenSettings: () => void;
  onDropOnTag: (tag: Tag, e: DragEvent) => void;
}) {
  const { currentPath, navigate } = useNavigation();
  const { notifyError } = useToast();
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [cloudAccounts, setCloudAccounts] = useState<AccountRecord[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [ejectingPath, setEjectingPath] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<AccountRecord | null>(null);

  useEffect(() => {
    window.fsapi.quickAccess().then((result) => {
      if (result.ok) setItems(result.data);
      else notifyError(result.error);
    });
  }, [notifyError]);

  const refreshCloudAccounts = useCallback(() => {
    window.cloud.listAccounts().then((result) => {
      if (result.ok) setCloudAccounts(result.data);
    });
  }, []);

  // Re-fetch on mount and whenever the parent signals a change (connect/disconnect).
  useEffect(() => {
    refreshCloudAccounts();
  }, [refreshCloudAccounts, cloudKey]);

  const refreshDrives = useCallback(() => {
    window.fsapi.drives().then((result) => {
      if (result.ok) setDrives(result.data);
    });
  }, []);

  useEffect(() => {
    refreshDrives();
    window.addEventListener('focus', refreshDrives);
    return () => window.removeEventListener('focus', refreshDrives);
  }, [refreshDrives]);

  async function handleEject(drive: DriveItem, e: React.MouseEvent) {
    e.stopPropagation();
    setEjectingPath(drive.path);
    const result = await window.fsapi.ejectDrive(drive.path);
    setEjectingPath(null);
    if (!result.ok) notifyError(result.error);
    else refreshDrives();
  }

  const title = 'text-muted-foreground px-2 pb-2 text-3xs font-semibold tracking-wider uppercase';

  return (
    <aside className="border-border bg-card flex w-60 shrink-0 flex-col border-r">
      {/* Logo header — matches the location row's height so the sidebar nav and
          the file browser start at the same line. No bottom border here: the
          divider lives only on the content side, keeping the sidebar one
          continuous column. */}
      <div className="flex h-11 shrink-0 items-center px-4">
        <Logo className="text-lg" />
      </div>

      {/* Scrollable navigation body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3 [scrollbar-gutter:stable]">
      <div className={title}>Quick Access</div>
      <nav>
        {items.map((item) => (
          <button
            key={item.path}
            data-testid="quick-access-item"
            className={itemClass(
              !activePage && currentPath === item.path,
              dropTarget === item.path,
            )}
            onClick={() => navigate(item.path)}
            title={item.path}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(item.path);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              setDropTarget(null);
              onDropPath(item.path, e);
            }}
          >
            <img
              src={folderLogo(item.label)}
              alt=""
              className="size-5 shrink-0 object-contain"
            />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {drives.length > 0 && (
        <>
          <div className={cn(title, 'mt-3')}>Drives</div>
          <nav>
            {drives.map((drive) => {
              const used = drive.total > 0 ? drive.total - drive.free : 0;
              const pct = drive.total > 0 ? Math.round((used / drive.total) * 100) : 0;
              const isActive = !activePage && currentPath === drive.path;
              return (
                <button
                  key={drive.path}
                  className={cn(
                    'group relative flex w-full flex-col rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-accent',
                    isActive && 'bg-foreground/[0.09] ring-1 ring-inset ring-foreground/20 hover:bg-foreground/[0.09]',
                    dropTarget === drive.path && 'bg-accent ring-2 ring-inset ring-foreground/30',
                  )}
                  onClick={() => navigate(drive.path)}
                  title={drive.path}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(drive.path);
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => {
                    setDropTarget(null);
                    onDropPath(drive.path, e);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon name="drive" size={16} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground [&_svg]:text-muted-foreground">
                      {drive.name}
                    </span>
                    {drive.removable && (
                      <button
                        className={cn(
                          'text-muted-foreground grid size-6 shrink-0 place-items-center rounded opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100',
                          ejectingPath === drive.path && 'cursor-wait opacity-100',
                        )}
                        title={`Eject ${drive.name}`}
                        onClick={(e) => handleEject(drive, e)}
                        disabled={ejectingPath === drive.path}
                      >
                        <Icon name="eject" size={13} />
                      </button>
                    )}
                  </div>
                  {drive.total > 0 && (
                    <div className="mt-1 pl-6">
                      <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            pct >= 90 ? 'bg-destructive/70' : 'bg-foreground/30',
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-3xs">
                        {formatBytes(used)} of {formatBytes(drive.total)}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </>
      )}

      {/* Cloud accounts */}
      <div className={cn(title, 'mt-3')}>Cloud</div>
      <nav>
        {cloudAccounts.map((account) => {
          const accountRoot = formatRemote(account.provider, account.id, '');
          const isActive = !activePage && currentPath === accountRoot;
          return (
            <div key={account.id} className="group relative flex items-center">
              <button
                className={cn(itemClass(isActive), 'flex-1 pr-6')}
                onClick={() => navigate(accountRoot)}
                title={`${account.label} (${account.provider})`}
              >
                {PROVIDER_LOGOS[account.provider] ? (
                  <img
                    src={PROVIDER_LOGOS[account.provider]}
                    alt=""
                    className="size-4 shrink-0 rounded object-contain"
                  />
                ) : (
                  <Icon name="cloud" size={16} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {PROVIDER_NAMES[account.provider] ?? account.provider}
                  </div>
                  <div className="text-muted-foreground truncate text-3xs">{account.label}</div>
                </div>
              </button>
              <button
                className="text-muted-foreground absolute right-1 grid size-6 shrink-0 place-items-center rounded opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                title={`Disconnect ${account.label}`}
                onClick={() => setPendingDisconnect(account)}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
        <button
          className={itemClass(activePage?.kind === 'cloud-connect')}
          onClick={onOpenCloudConnect}
          title="Connect a cloud account"
        >
          <Icon name="plus" size={16} />
          <span>Connect…</span>
        </button>
      </nav>

      {tags.length > 0 && (
        <>
          <div className={cn(title, 'mt-3')}>Tags</div>
          <nav>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={itemClass(
                  activePage?.kind === 'tag' && activePage.tagId === tag.id,
                  dropTarget === `tag:${tag.id}`,
                )}
                onClick={() => onOpenTag(tag)}
                title={`Files tagged "${tag.name}"`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(`tag:${tag.id}`);
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  setDropTarget(null);
                  onDropOnTag(tag, e);
                }}
              >
                <TagDot color={tag.color} className="mx-0.75" />
                <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis">
                  {tag.name}
                </span>
                {tag.count > 0 && (
                  <span className="text-muted-foreground shrink-0 text-2xs">
                    {tag.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="min-h-3 flex-1" />
      <button
        className={itemClass(activePage?.kind === 'recents')}
        onClick={onOpenRecents}
        title="Recently opened files"
      >
        <Icon name="clock" size={16} />
        <span>Recents</span>
      </button>
      <button
        className={itemClass(activePage?.kind === 'settings')}
        onClick={onOpenSettings}
        title="Settings"
      >
        <Icon name="settings" size={16} />
        <span>Settings</span>
      </button>
      </div>

      {pendingDisconnect && (
        <ConfirmDialog
          title="Disconnect account?"
          message={`"${pendingDisconnect.label}" (${PROVIDER_NAMES[pendingDisconnect.provider] ?? pendingDisconnect.provider}) will be removed. You can reconnect at any time.`}
          confirmLabel="Disconnect"
          danger
          onCancel={() => setPendingDisconnect(null)}
          onConfirm={async () => {
            const account = pendingDisconnect;
            setPendingDisconnect(null);
            const res = await window.cloud.disconnect(account.id);
            if (!res.ok) notifyError(res.error);
            else refreshCloudAccounts();
          }}
        />
      )}
    </aside>
  );
}
