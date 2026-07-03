import { Grid02Icon, GridIcon, LayoutGridIcon } from 'hugeicons-react';
import type { IconSize } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { useAi } from '@/state/ai';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { type HugeIcon, Icon } from './Icon';
import { AddressBar } from './AddressBar';

const ICON_SIZES: { size: IconSize; label: string; Glyph: HugeIcon }[] = [
  { size: 'small', label: 'Small', Glyph: GridIcon },
  { size: 'medium', label: 'Medium', Glyph: LayoutGridIcon },
  { size: 'large', label: 'Large', Glyph: Grid02Icon },
];

export function Toolbar({
  onNewFolder,
  onNewFile,
  pageTitle,
  remote,
}: {
  onNewFolder: () => void;
  onNewFile: () => void;
  /** When set, a metadata page is shown — folder-only controls are hidden. */
  pageTitle?: React.ReactNode;
  /** True when browsing remote cloud storage — hides local-only controls. */
  remote?: boolean;
}) {
  const {
    back,
    forward,
    up,
    refresh,
    canGoBack,
    canGoForward,
    showHidden,
    toggleHidden,
    viewMode,
    setViewMode,
    iconSize,
    setIconSize,
    query,
    setQuery,
    searchRecursive,
    setSearchRecursive,
    openPage,
    currentPath,
  } = useNavigation();
  const { enabled: aiEnabled } = useAi();

  return (
    <div className="border-border bg-card flex items-center gap-3 border-b px-3 py-2 [-webkit-app-region:drag]">
      <div className="flex gap-1 [-webkit-app-region:no-drag]">
        <Button variant="ghost" size="icon" className="size-8" onClick={back} disabled={!canGoBack} title="Back">
          <Icon name="back" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={forward} disabled={!canGoForward} title="Forward">
          <Icon name="forward" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={up} title="Up">
          <Icon name="up" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={refresh} title="Refresh">
          <Icon name="refresh" />
        </Button>
      </div>

      <AddressBar pageTitle={pageTitle} />

      {/* Filter + view controls act on a folder; hidden on a metadata page. */}
      {!pageTitle && (
        <div className="border-border bg-background text-muted-foreground flex h-7.5 w-55 shrink-0 items-center gap-1.5 rounded-md border px-2 [-webkit-app-region:no-drag]">
          <Icon name="search" size={14} />
          <input
            className="text-foreground min-w-0 flex-1 select-text border-0 bg-transparent outline-none"
            placeholder={searchRecursive ? 'Search subfolders…' : 'Filter…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
          />
          <button
            className={cn(
              'shrink-0 rounded px-1.5 py-0.75 text-[11px]',
              searchRecursive
                ? 'bg-foreground/[0.09] text-foreground font-medium'
                : 'bg-accent text-muted-foreground',
            )}
            onClick={() => setSearchRecursive(!searchRecursive)}
            title={searchRecursive ? 'Searching subfolders' : 'Filter current folder only'}
          >
            Subfolders
          </button>
        </div>
      )}

      {!pageTitle && aiEnabled && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 [-webkit-app-region:no-drag]"
          title="Search by meaning"
          onClick={() => openPage({ kind: 'semantic-search', rootPath: currentPath })}
        >
          <Icon name="sparkles" />
        </Button>
      )}

      {!pageTitle && (
      <div className="flex gap-1 [-webkit-app-region:no-drag]">
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8', viewMode === 'list' && 'bg-foreground/[0.09] hover:bg-foreground/[0.09]')}
          onClick={() => setViewMode('list')}
          title="List view"
        >
          <Icon name="list" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8', viewMode === 'grid' && 'bg-foreground/[0.09] hover:bg-foreground/[0.09]')}
          onClick={() => setViewMode('grid')}
          title="Grid view"
        >
          <Icon name="grid" />
        </Button>
        {viewMode === 'grid' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title="Icon size"
              >
                {(() => {
                  const Current =
                    ICON_SIZES.find((o) => o.size === iconSize)?.Glyph ??
                    LayoutGridIcon;
                  return <Current />;
                })()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={iconSize}
                onValueChange={(v) => setIconSize(v as IconSize)}
              >
                {ICON_SIZES.map((opt) => (
                  <DropdownMenuRadioItem key={opt.size} value={opt.size}>
                    <opt.Glyph className="size-4" />
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={toggleHidden}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
        >
          <Icon name={showHidden ? 'eye' : 'eye-off'} />
        </Button>
        {!remote && (
          <Button variant="ghost" size="icon" className="size-8" onClick={onNewFile} title="New file">
            <Icon name="file-plus" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" onClick={onNewFolder} title="New folder">
          <Icon name="new-folder" />
        </Button>
      </div>
      )}
    </div>
  );
}
