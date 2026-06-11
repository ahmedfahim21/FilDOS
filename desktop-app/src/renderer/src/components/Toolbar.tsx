import type { IconSize } from '@shared/types';
import { useNavigation } from '@/state/navigation';
import { Icon } from './Icon';
import { AddressBar } from './AddressBar';

const ICON_SIZES: { size: IconSize; label: string; title: string }[] = [
  { size: 'small', label: 'S', title: 'Small icons' },
  { size: 'medium', label: 'M', title: 'Medium icons' },
  { size: 'large', label: 'L', title: 'Large icons' },
];

export function Toolbar({
  onNewFolder,
  onNewFile,
}: {
  onNewFolder: () => void;
  onNewFile: () => void;
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
  } = useNavigation();

  return (
    <div className="toolbar">
      <div className="toolbar__nav">
        <button className="iconbtn" onClick={back} disabled={!canGoBack} title="Back">
          <Icon name="back" />
        </button>
        <button className="iconbtn" onClick={forward} disabled={!canGoForward} title="Forward">
          <Icon name="forward" />
        </button>
        <button className="iconbtn" onClick={up} title="Up">
          <Icon name="up" />
        </button>
        <button className="iconbtn" onClick={refresh} title="Refresh">
          <Icon name="refresh" />
        </button>
      </div>

      <AddressBar />

      <div className="searchbox">
        <Icon name="search" size={14} />
        <input
          className="searchbox__input"
          placeholder={searchRecursive ? 'Search subfolders…' : 'Filter…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
        />
        <button
          className={`searchbox__toggle${searchRecursive ? ' is-active' : ''}`}
          onClick={() => setSearchRecursive(!searchRecursive)}
          title={searchRecursive ? 'Searching subfolders' : 'Filter current folder only'}
        >
          Subfolders
        </button>
      </div>

      <div className="toolbar__actions">
        <button
          className={`iconbtn${viewMode === 'list' ? ' is-active' : ''}`}
          onClick={() => setViewMode('list')}
          title="List view"
        >
          <Icon name="list" />
        </button>
        <button
          className={`iconbtn${viewMode === 'grid' ? ' is-active' : ''}`}
          onClick={() => setViewMode('grid')}
          title="Grid view"
        >
          <Icon name="grid" />
        </button>
        {viewMode === 'grid' && (
          <div className="segmented" role="group" aria-label="Icon size">
            {ICON_SIZES.map((opt) => (
              <button
                key={opt.size}
                className={`segmented__btn${iconSize === opt.size ? ' is-active' : ''}`}
                onClick={() => setIconSize(opt.size)}
                title={opt.title}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <button
          className="iconbtn"
          onClick={toggleHidden}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
        >
          <Icon name={showHidden ? 'eye' : 'eye-off'} />
        </button>
        <button className="iconbtn" onClick={onNewFile} title="New file">
          <Icon name="file-plus" />
        </button>
        <button className="iconbtn" onClick={onNewFolder} title="New folder">
          <Icon name="new-folder" />
        </button>
      </div>
    </div>
  );
}
