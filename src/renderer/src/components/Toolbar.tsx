import { useEffect, useRef, useState } from 'react';
import { Grid02Icon, GridIcon, LayoutGridIcon } from 'hugeicons-react';
import type { IconSize } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { useAi } from '@/state/ai';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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

/** Width below which the right-side controls collapse into the ••• menu. */
const NARROW_THRESHOLD = 680;

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

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < NARROW_THRESHOLD);
    });
    ro.observe(el);
    setNarrow(el.clientWidth < NARROW_THRESHOLD);
    return () => ro.disconnect();
  }, []);

  const activeIconClass = 'bg-foreground/[0.09] text-foreground hover:bg-foreground/[0.09] hover:text-foreground';

  return (
    <div
      ref={toolbarRef}
      className="border-border bg-card flex items-center gap-3 border-b px-3 py-2 [-webkit-app-region:drag]"
    >
      {/* Navigation — always visible */}
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

      {/* Address bar — always visible, grows to fill space */}
      <AddressBar pageTitle={pageTitle} />

      {/* ── Wide layout: individual controls ─────────────────────────── */}
      {!narrow && !pageTitle && (
        <>
          {/* Filter / search bar */}
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
                'shrink-0 rounded px-1.5 py-0.75 text-2xs',
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

          {/* AI semantic search */}
          {aiEnabled && (
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

          {/* View + actions */}
          <div className="flex gap-1 [-webkit-app-region:no-drag]">
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-8', viewMode === 'list' && activeIconClass)}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <Icon name="list" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-8', viewMode === 'grid' && activeIconClass)}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <Icon name="grid" />
            </Button>
            {viewMode === 'grid' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" title="Icon size">
                    {(() => {
                      const Current =
                        ICON_SIZES.find((o) => o.size === iconSize)?.Glyph ?? LayoutGridIcon;
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
              className={cn('size-8', showHidden && activeIconClass)}
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
        </>
      )}

      {/* ── Narrow layout: ••• overflow menu ─────────────────────────── */}
      {narrow && !pageTitle && (
        <div className="[-webkit-app-region:no-drag]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" title="More options">
                <Icon name="more" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Filter input */}
              <div className="border-border flex items-center gap-1.5 border-b px-2 pb-2">
                <Icon name="search" size={14} />
                <input
                  className="text-foreground min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
                  placeholder={searchRecursive ? 'Search subfolders…' : 'Filter…'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setQuery('');
                    }
                  }}
                />
              </div>
              <DropdownMenuCheckboxItem
                checked={searchRecursive}
                onCheckedChange={setSearchRecursive}
              >
                Search subfolders
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />

              {/* View mode */}
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(v) => setViewMode(v as 'list' | 'grid')}
              >
                <DropdownMenuRadioItem value="list">
                  <Icon name="list" size={16} />
                  List view
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="grid">
                  <Icon name="grid" size={16} />
                  Grid view
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              {/* Icon size (grid only) */}
              {viewMode === 'grid' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={iconSize}
                    onValueChange={(v) => setIconSize(v as IconSize)}
                  >
                    {ICON_SIZES.map((opt) => (
                      <DropdownMenuRadioItem key={opt.size} value={opt.size}>
                        <opt.Glyph className="size-4" />
                        {opt.label} icons
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={showHidden} onCheckedChange={toggleHidden}>
                <Icon name={showHidden ? 'eye' : 'eye-off'} size={16} />
                Show hidden files
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {!remote && (
                <DropdownMenuItem onSelect={onNewFile}>
                  <Icon name="file-plus" size={16} />
                  New file
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onNewFolder}>
                <Icon name="new-folder" size={16} />
                New folder
              </DropdownMenuItem>
              {aiEnabled && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => openPage({ kind: 'semantic-search', rootPath: currentPath })}
                  >
                    <Icon name="sparkles" size={16} />
                    Search by meaning
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
