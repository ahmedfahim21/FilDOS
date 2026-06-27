import { useEffect, useRef, useState } from 'react';
import type { SemanticHit } from '@shared/types';
import { useToast } from '@/state/toast';
import { useAi } from '@/state/ai';
import { useIndexing } from '@/state/indexing';
import { parentOf } from '@/lib/path';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from './Icon';
import { Page, PageList, PageRow, PageRowIcon, PageState } from './Page';

type Scope = 'folder' | 'all';

/**
 * Semantic search results page. Embeds the query (via the active model) and
 * ranks indexed files by meaning, showing the matching snippet. Opened from the
 * toolbar search box or Cmd/Ctrl+F; the literal filter is left untouched.
 */
export function SemanticSearchView({
  rootPath,
  onBack,
  onNavigate,
  onInfo,
}: {
  /** Folder the search was launched from — the "This folder" scope. */
  rootPath: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onInfo: (path: string) => void;
}) {
  const { notify, notifyError } = useToast();
  const ai = useAi();
  const indexing = useIndexing();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('folder');
  const [results, setResults] = useState<SemanticHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; hit: SemanticHit } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ready = ai.ready;
  // Cosine isn't a probability — show each hit's strength relative to the best
  // match in the set rather than a misleading absolute "confidence %".
  const topScore = results[0]?.score || 1;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !menu && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, menu]);

  async function run() {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const res = await window.index.search(q, {
      rootPath: scope === 'folder' ? rootPath : undefined,
    });
    setLoading(false);
    if (res.ok) setResults(res.data);
    else notifyError(res.error);
  }

  const open = (hit: SemanticHit) => {
    if (hit.isDirectory) {
      onNavigate(hit.path);
      return;
    }
    window.fsapi.open(hit.path).then((r) => !r.ok && notifyError(r.error));
  };

  const note = !ai.enabled
    ? 'Enable AI in Settings to search your files by meaning.'
    : !ready
      ? 'Download the embedding model in Settings to start searching.'
      : 'Finds files by meaning, not just filename — search across your indexed files.';

  return (
    <Page
      lead={
        <div className="flex flex-1 items-center gap-2">
          <div className="border-border bg-background flex h-7.5 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2">
            <Icon name="sparkles" size={14} />
            <input
              ref={inputRef}
              className="text-foreground min-w-0 flex-1 select-text border-0 bg-transparent outline-none"
              placeholder="Search by meaning…"
              value={query}
              disabled={!ready}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') run();
                if (e.key === 'Escape') setQuery('');
              }}
            />
          </div>
          <div className="border-border flex shrink-0 overflow-hidden rounded-md border text-[11px]">
            {(['folder', 'all'] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  'px-2 py-1',
                  scope === s ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {s === 'folder' ? 'This folder' : 'Everywhere'}
              </button>
            ))}
          </div>
        </div>
      }
      actions={
        <Button size="sm" onClick={run} disabled={!ready || loading || !query.trim()}>
          Search
        </Button>
      }
      note={note}
    >
      <PageList>
        {loading ? (
          <PageState>Searching…</PageState>
        ) : !searched ? (
          <PageState>Type a query and press Enter.</PageState>
        ) : results.length === 0 ? (
          <PageState>No matches. Make sure your files are indexed (Settings → Indexing).</PageState>
        ) : (
          results.map((hit) => (
            <PageRow
              key={hit.path}
              onDoubleClick={() => open(hit)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, hit });
              }}
            >
              <PageRowIcon>
                <Icon name={hit.isDirectory ? 'folder' : 'file'} size={16} />
              </PageRowIcon>
              <div className="min-w-0 flex-1">
                <div className="truncate" title={hit.path}>
                  {hit.name}
                </div>
                {hit.snippet && (
                  <div className="text-muted-foreground truncate text-[11px]">{hit.snippet}</div>
                )}
                <div className="text-muted-foreground truncate text-[10px]">{hit.relativePath}</div>
              </div>
              <div
                className="bg-muted h-1.5 w-12 shrink-0 overflow-hidden rounded-full"
                title={`Relevance relative to the top match · cosine ${hit.score.toFixed(2)}`}
              >
                <div
                  className="bg-primary h-full"
                  style={{ width: `${Math.round((hit.score / topScore) * 100)}%` }}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => open(hit)}>
                <Icon name="open" size={14} /> Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Show in Folder"
                onClick={() => onNavigate(hit.isDirectory ? hit.path : parentOf(hit.path))}
              >
                <Icon name="folder" size={14} />
              </Button>
            </PageRow>
          ))
        )}
      </PageList>

      {menu && (
        <DropdownMenu
          key={`${menu.x},${menu.y}`}
          open
          modal={false}
          onOpenChange={(o) => !o && setMenu(null)}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0 }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            <DropdownMenuItem onSelect={() => open(menu.hit)}>
              <Icon name="open" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.fsapi.reveal(menu.hit.path).then((r) => !r.ok && notifyError(r.error))
              }
            >
              <Icon name="reveal" /> Reveal in {window.platform?.os === 'darwin' ? 'Finder' : 'Explorer'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onInfo(menu.hit.path)}>
              <Icon name="info" /> Get Info
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await indexing.addExclude(menu.hit.path);
                setResults((rs) => rs.filter((r) => r.path !== menu.hit.path));
                notify('success', 'Excluded from indexing');
              }}
            >
              <Icon name="eye-off" /> Exclude from AI index
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Page>
  );
}
