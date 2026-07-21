import type { IconSize, SortKey, ViewMode } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CommandIcon } from 'hugeicons-react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { AddressBar } from './AddressBar';

/**
 * The four layouts, each with its own scoop accent (kept consistent app-wide)
 * and a ⌘1–⌘4 shortcut. `activeBg` tints the tile in that scoop when selected.
 */
const VIEW_OPTIONS: {
  mode: ViewMode;
  label: string;
  icon: 'list' | 'grid' | 'gallery' | 'columns';
  color: string;
  activeBg: string;
}[] = [
  { mode: 'list', label: 'List', icon: 'list', color: 'text-blueberry', activeBg: 'bg-blueberry/15' },
  { mode: 'grid', label: 'Grid', icon: 'grid', color: 'text-mint', activeBg: 'bg-mint/15' },
  { mode: 'gallery', label: 'Gallery', icon: 'gallery', color: 'text-bubblegum', activeBg: 'bg-bubblegum/15' },
  { mode: 'column', label: 'Column', icon: 'columns', color: 'text-mango', activeBg: 'bg-mango/15' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'modified', label: 'Date modified' },
];

/** Icon-size steps, indexed by the range slider. */
const SIZES: IconSize[] = ['small', 'medium', 'large'];

const SECTION = 'text-muted-foreground text-2xs font-semibold tracking-wider uppercase';

/**
 * The location row beneath the {@link TopBar}: the breadcrumb path on the left
 * and the folder controls on the right — a single "View" menu (layout, icon
 * size, sort, hidden files) plus the new file/folder actions. Its height and
 * bottom border line up with the sidebar's logo header so the two read as one
 * horizontal band.
 */
export function Toolbar({
  onNewFolder,
  onNewFile,
  pageTitle,
  pageSlotRef,
  remote,
}: {
  onNewFolder: () => void;
  onNewFile: () => void;
  /** When set, a metadata page is shown — folder-only controls are hidden. */
  pageTitle?: React.ReactNode;
  /** Ref callback for the slot a metadata page portals its controls into. */
  pageSlotRef?: (el: HTMLDivElement | null) => void;
  /** True when browsing remote cloud storage — hides local-only controls. */
  remote?: boolean;
}) {
  const {
    showHidden,
    toggleHidden,
    viewMode,
    setViewMode,
    iconSize,
    setIconSize,
    sort,
    setSort,
  } = useNavigation();

  const isMac = window.platform?.os === 'darwin';

  // Icon-size only applies to the tile-based views (grid + gallery).
  const showIconSize = viewMode === 'grid' || viewMode === 'gallery';
  const current = VIEW_OPTIONS.find((o) => o.mode === viewMode) ?? VIEW_OPTIONS[0];
  const sizeIndex = Math.max(0, SIZES.indexOf(iconSize));

  return (
    <div className="border-border bg-card flex h-11 shrink-0 items-center gap-2 border-b px-3">
      {/* Breadcrumb path — left-aligned, grows to fill space */}
      <AddressBar pageTitle={pageTitle} />

      {/* Metadata pages portal their own controls (view toggle, Clear /
          Rename / Delete) into this slot, so they share this one row. */}
      {pageTitle && <div ref={pageSlotRef} className="flex shrink-0 items-center gap-2" />}

      {!pageTitle && (
        <div className="flex shrink-0 items-center gap-1">
          {/* ── Consolidated View menu ── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1.5 px-2" title="View options">
                <Icon name={current.icon} size={16} className={current.color} />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Mode — a 2-column grid of layout tiles */}
              <DropdownMenuLabel className={SECTION}>Mode</DropdownMenuLabel>
              <div className="grid grid-cols-2 gap-1 p-1">
                {VIEW_OPTIONS.map((o, i) => {
                  const active = viewMode === o.mode;
                  return (
                    <button
                      key={o.mode}
                      onClick={() => setViewMode(o.mode)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active ? cn(o.activeBg, 'text-foreground') : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <Icon name={o.icon} size={16} className={cn('shrink-0', o.color)} />
                      <span className="flex-1 text-left">{o.label}</span>
                      <Kbd variant="ghost">
                        {isMac ? <CommandIcon className="size-2.5" /> : 'Ctrl+'}
                        <span className="leading-none">{i + 1}</span>
                      </Kbd>
                    </button>
                  );
                })}
              </div>

              {showIconSize && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={SECTION}>Icon size</DropdownMenuLabel>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Icon name={current.icon} size={12} className="text-muted-foreground shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={SIZES.length - 1}
                      step={1}
                      value={sizeIndex}
                      aria-label="Icon size"
                      onChange={(e) => setIconSize(SIZES[Number(e.target.value)])}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="accent-foreground h-1 flex-1 cursor-pointer"
                    />
                    <Icon name={current.icon} size={18} className="text-muted-foreground shrink-0" />
                  </div>
                </>
              )}

              {/* Sort — key + direction toggle (click the active key to flip) */}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={SECTION}>Sort by</DropdownMenuLabel>
              {SORT_OPTIONS.map((o) => {
                const active = sort.key === o.key;
                return (
                  <DropdownMenuItem
                    key={o.key}
                    className="pl-8"
                    onSelect={(e) => {
                      e.preventDefault();
                      setSort(o.key);
                    }}
                  >
                    <span className="flex-1">{o.label}</span>
                    {active && (
                      <span className="text-muted-foreground text-2xs">
                        {sort.dir === 'asc' ? 'Ascending' : 'Descending'}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}

              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showHidden}
                onCheckedChange={toggleHidden}
                onSelect={(e) => e.preventDefault()}
              >
                Show hidden files
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ── Quick actions ── */}
          {!remote && (
            <Button variant="secondary" size="icon" className="size-8" onClick={onNewFile} title="New file">
              <Icon name="file-plus" />
            </Button>
          )}
          <Button variant="secondary" size="icon" className="size-8" onClick={onNewFolder} title="New folder">
            <Icon name="new-folder" />
          </Button>
        </div>
      )}
    </div>
  );
}
