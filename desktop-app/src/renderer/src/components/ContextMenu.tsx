import type { SortDir, SortKey, Tag } from '@shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from './Icon';
import { TagDot } from './TagDots';

export interface ContextMenuState {
  x: number;
  y: number;
  /** 'selection' = right-clicked an item; 'background' = right-clicked empty pane. */
  mode: 'selection' | 'background';
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  /** Number of selected items; controls which selection actions are enabled. */
  count: number;
  /** Whether the clipboard has something to paste. */
  canPaste: boolean;
  showHidden: boolean;
  // Selection actions
  onOpen: () => void;
  onReveal: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onTrash: () => void;
  onInfo: () => void;
  /** Exclude the selection from AI indexing; omitted when AI is off or remote. */
  onExcludeFromIndex?: () => void;
  // Tags (selection mode)
  tags: Tag[];
  /** True when every selected item carries the tag. */
  isTagOnSelection: (tagId: number) => boolean;
  onToggleTag: (tag: Tag, apply: boolean) => void;
  onNewTag: () => void;
  // Background actions
  onNewFolder: () => void;
  onNewFile: () => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
  // Sorting (background mode)
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  /** True when the current directory (or selection) is a remote cloud path. */
  remote?: boolean;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'modified', label: 'Modified' },
];

export function ContextMenu(props: ContextMenuProps) {
  const { state, onClose, count, canPaste, showHidden, remote } = props;
  const single = count === 1;
  const revealLabel = `Reveal in ${window.platform?.os === 'darwin' ? 'Finder' : 'Explorer'}`;

  return (
    // Keyed on the cursor position so each right-click remounts the menu at the
    // new spot; Radix then handles collision-flipping and submenu placement.
    <DropdownMenu
      key={`${state.x},${state.y}`}
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: state.x,
            top: state.y,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-52"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {state.mode === 'selection' ? (
          <>
            <DropdownMenuItem onSelect={props.onOpen} disabled={!single}>
              <Icon name="open" /> Open
            </DropdownMenuItem>
            {!remote && (
              <DropdownMenuItem onSelect={props.onReveal} disabled={!single}>
                <Icon name="reveal" /> {revealLabel}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onCopy}>
              <Icon name="copy" /> Copy{count > 1 ? ` (${count})` : ''}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onCut}>
              <Icon name="cut" /> Cut{count > 1 ? ` (${count})` : ''}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onPaste} disabled={!canPaste}>
              <Icon name="paste" /> Paste
            </DropdownMenuItem>
            {!remote && (
              <DropdownMenuItem onSelect={props.onDuplicate} disabled={!single}>
                <Icon name="copy" /> Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icon name="tag" /> <span className="ml-2">Tags</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                {props.tags.map((tag) => {
                  const applied = props.isTagOnSelection(tag.id);
                  return (
                    <DropdownMenuItem
                      key={tag.id}
                      onSelect={() => props.onToggleTag(tag, !applied)}
                    >
                      <TagDot color={tag.color} />
                      <span className="flex-1">{tag.name}</span>
                      {applied && <Icon name="check" size={13} />}
                    </DropdownMenuItem>
                  );
                })}
                {props.tags.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={props.onNewTag}>
                  <Icon name="plus" size={13} /> New Tag…
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onRename} disabled={!single}>
              <Icon name="rename" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={props.onTrash}>
              <Icon name="trash" /> Move to Trash{count > 1 ? ` (${count})` : ''}
            </DropdownMenuItem>
            {props.onExcludeFromIndex && (
              <DropdownMenuItem onSelect={props.onExcludeFromIndex}>
                <Icon name="eye-off" /> Exclude from AI index
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onInfo} disabled={!single}>
              <Icon name="info" /> Get Info
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={props.onNewFolder}>
              <Icon name="new-folder" /> New Folder
            </DropdownMenuItem>
            {!remote && (
              <DropdownMenuItem onSelect={props.onNewFile}>
                <Icon name="file-plus" /> New File
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={props.onPaste} disabled={!canPaste}>
              <Icon name="paste" /> Paste
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icon name="list" /> <span className="ml-2">Sort By</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.key}
                    onSelect={() => props.onSort(opt.key)}
                  >
                    <span className="flex-1">{opt.label}</span>
                    {props.sortKey === opt.key && (
                      <span className="text-muted-foreground ml-auto text-xs">
                        {props.sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={props.onSelectAll}>
              <Icon name="list" /> Select All
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onToggleHidden}>
              <Icon name={showHidden ? 'eye-off' : 'eye'} />{' '}
              {showHidden ? 'Hide Hidden Files' : 'Show Hidden Files'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onRefresh}>
              <Icon name="refresh" /> Refresh
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
