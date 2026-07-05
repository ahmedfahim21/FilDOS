import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Entry, RecentItem, SearchHit, SemanticHit, Tag } from '@shared/types';
import { useToast } from '@/state/toast';
import { useAi } from '@/state/ai';
import { baseName, parentOf } from '@/lib/path';
import { resolveDroppedPaths } from '@/lib/dragState';
import { fileLogo } from '@/lib/fileLogo';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from './Icon';
import { TagDot } from './TagDots';

type Scope = 'folder' | 'all';
type Modified = 'any' | 'day' | 'week' | 'month';

/** One unified result row, whatever lane it came from. */
interface Row {
  entry: Entry;
  /** Secondary line: snippet (AI) or path. */
  sub: string;
  /** AI relevance in [0,1]; undefined for name/recents rows. */
  score?: number;
}

interface Section {
  title: string;
  /** Small glyph beside the section label. */
  icon: 'sparkles' | 'search' | 'clock';
  iconClass: string;
  /** When set, a TagDot in this colour replaces the icon (tag sections). */
  tagColor?: string;
  rows: Row[];
}

/**
 * Each file type carries one scoop accent — the dot is always coloured (a hint
 * of the palette at rest), and the active chip fills with that colour's tint,
 * Linear-label style.
 */
const TYPE_FILTERS: {
  key: string;
  label: string;
  dot: string;
  active: string;
  match: (e: Entry) => boolean;
}[] = [
  {
    key: 'folders',
    label: 'Folders',
    dot: 'bg-blueberry',
    active: 'border-blueberry/40 bg-blueberry/10 text-blueberry',
    match: (e) => e.isDirectory,
  },
  {
    key: 'documents',
    label: 'Docs',
    dot: 'bg-mango',
    active: 'border-mango/40 bg-mango/10 text-mango',
    match: (e) =>
      ['pdf', 'doc', 'docx', 'txt', 'md', 'markdown', 'rtf', 'odt', 'pages', 'csv', 'tsv',
        'xls', 'xlsx', 'ppt', 'pptx', 'key', 'numbers', 'epub'].includes(e.ext),
  },
  {
    key: 'images',
    label: 'Images',
    dot: 'bg-bubblegum',
    active: 'border-bubblegum/40 bg-bubblegum/10 text-bubblegum',
    match: (e) =>
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif',
        'svg', 'ico', 'raw', 'psd'].includes(e.ext),
  },
  {
    key: 'audio',
    label: 'Audio',
    dot: 'bg-grape',
    active: 'border-grape/40 bg-grape/10 text-grape',
    match: (e) => ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'aiff', 'wma'].includes(e.ext),
  },
  {
    key: 'video',
    label: 'Video',
    dot: 'bg-strawberry',
    active: 'border-strawberry/40 bg-strawberry/10 text-strawberry',
    match: (e) => ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv'].includes(e.ext),
  },
  {
    key: 'code',
    label: 'Code',
    dot: 'bg-mint',
    active: 'border-mint/40 bg-mint/10 text-mint',
    match: (e) =>
      ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c',
        'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'swift', 'scala', 'sh', 'bash', 'zsh', 'lua',
        'pl', 'r', 'dart', 'sql', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'toml',
        'xml', 'vue', 'svelte'].includes(e.ext),
  },
];

const MODIFIED_OPTIONS: { value: Modified; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'day', label: 'Past day' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
];

function modifiedCutoff(m: Modified): number {
  const DAY = 86_400_000;
  if (m === 'day') return Date.now() - DAY;
  if (m === 'week') return Date.now() - 7 * DAY;
  if (m === 'month') return Date.now() - 30 * DAY;
  return 0;
}

/** Minimal Entry for rows that arrive without one (recents). */
function pseudoEntry(path: string, name: string, modified: number): Entry {
  const dot = name.lastIndexOf('.');
  return {
    path,
    name,
    isDirectory: false,
    isSymlink: false,
    isHidden: false,
    size: 0,
    ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
    modified,
    created: 0,
  };
}

/** Base classes shared by every filter chip. */
const CHIP_BASE =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-2xs transition-all duration-150 ease-snappy active:scale-[0.97]';
const CHIP_IDLE =
  'border-border/70 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground';

/**
 * The app's primary search surface: a Spotlight-style overlay combining
 * semantic (AI) search, literal name search, tag and type filters, and
 * drag-a-file-in "find similar". Opened with ⌘K / ⌘F or the toolbar search bar.
 */
export function SearchOverlay({
  open,
  rootPath,
  tags,
  seedFile,
  onClose,
  onNavigate,
}: {
  open: boolean;
  /** The folder behind the browser — the "This folder" scope. */
  rootPath: string;
  tags: Tag[];
  /** When opened by dropping a file on the search bar, the file to "find similar" to. */
  seedFile?: string | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const { notifyError } = useToast();
  const ai = useAi();
  const [text, setText] = useState('');
  const [similarFile, setSimilarFile] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [typeKeys, setTypeKeys] = useState<Set<string>>(new Set());
  const [tagId, setTagId] = useState<number | null>(null);
  const [modified, setModified] = useState<Modified>('any');
  const [aiHits, setAiHits] = useState<SemanticHit[]>([]);
  const [nameHits, setNameHits] = useState<SearchHit[]>([]);
  const [tagFiles, setTagFiles] = useState<Entry[]>([]);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [tagMap, setTagMap] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [activeIx, setActiveIx] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [home, setHome] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqRef = useRef(0);

  const isMac = window.platform?.os === 'darwin';
  const modKey = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    window.fsapi.getHome().then((r) => r.ok && setHome(r.data));
  }, []);

  // Reset transient state each time the overlay opens; keep filters sticky
  // within a session but always start from a clean query.
  useEffect(() => {
    if (!open) return;
    setText('');
    // Seed "find similar" when opened by a file dropped on the search bar.
    setSimilarFile(seedFile ?? null);
    setActiveIx(0);
    setAiHits([]);
    setNameHits([]);
    window.recents.list(12).then((r) => r.ok && setRecents(r.data));
    // Focus after the panel mounts.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, seedFile]);

  // Fallback: close on Escape even when focus has left the panel (the panel's
  // own handler stops propagation before this fires).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  const scopePath = scope === 'folder' ? rootPath : undefined;

  // ── Search execution (debounced, race-guarded) ──────────────────────────
  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    const id = ++reqRef.current;

    // Empty query + a tag chip → browse that tag's files.
    if (!q && !similarFile && tagId != null) {
      setLoading(false);
      window.tags.files(tagId).then((r) => {
        if (reqRef.current !== id) return;
        if (r.ok) setTagFiles(r.data);
      });
      return;
    }
    if (!q && !similarFile) {
      setAiHits([]);
      setNameHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const t = setTimeout(async () => {
      if (similarFile) {
        const r = await window.index.searchFile(similarFile, { rootPath: scopePath, k: 30 });
        if (reqRef.current !== id) return;
        setLoading(false);
        setNameHits([]);
        if (r.ok) setAiHits(r.data);
        else {
          setAiHits([]);
          notifyError(r.error);
          setSimilarFile(null);
        }
        return;
      }
      const [semantic, names] = await Promise.all([
        ai.ready
          ? window.index.search(q, { rootPath: scopePath, k: 20 })
          : Promise.resolve(null),
        window.fsapi.search(scopePath ?? home ?? rootPath, q),
      ]);
      if (reqRef.current !== id) return;
      setLoading(false);
      setAiHits(semantic?.ok ? semantic.data : []);
      setNameHits(names.ok ? names.data : []);
    }, 250);
    return () => clearTimeout(t);
  }, [open, text, similarFile, scopePath, ai.ready, home, rootPath, tagId, notifyError]);

  // Tag assignments for the current results, needed only when a tag chip is on.
  useEffect(() => {
    if (tagId == null) return;
    const paths = [...aiHits.map((h) => h.path), ...nameHits.map((h) => h.path)];
    if (!paths.length) {
      setTagMap({});
      return;
    }
    let live = true;
    window.tags.forPaths(paths).then((r) => {
      if (live && r.ok) setTagMap(r.data);
    });
    return () => {
      live = false;
    };
  }, [tagId, aiHits, nameHits]);

  // ── Assemble sections through the client-side filters ───────────────────
  const sections = useMemo<Section[]>(() => {
    const cutoff = modifiedCutoff(modified);
    const passes = (e: Entry) =>
      (typeKeys.size === 0 ||
        TYPE_FILTERS.some((f) => typeKeys.has(f.key) && f.match(e))) &&
      (modified === 'any' || e.modified >= cutoff) &&
      (tagId == null || (tagMap[e.path] ?? []).includes(tagId));

    const q = text.trim();
    if (!q && !similarFile) {
      if (tagId != null) {
        const tag = tags.find((t) => t.id === tagId);
        return [
          {
            title: tag ? `Tagged “${tag.name}”` : 'Tagged',
            icon: 'search' as const,
            iconClass: '',
            tagColor: tag?.color,
            rows: tagFiles
              .filter(
                (e) =>
                  (typeKeys.size === 0 ||
                    TYPE_FILTERS.some((f) => typeKeys.has(f.key) && f.match(e))) &&
                  (modified === 'any' || e.modified >= cutoff),
              )
              .map((e) => ({ entry: e, sub: e.path })),
          },
        ];
      }
      return [
        {
          title: 'Recent',
          icon: 'clock' as const,
          iconClass: 'text-mango',
          rows: recents.map((r) => ({
            entry: pseudoEntry(r.path, r.name, r.openedAt),
            sub: r.path,
          })),
        },
      ];
    }

    const out: Section[] = [];
    const aiRows = aiHits
      .filter((h) => passes(h))
      .map((h) => ({ entry: h, sub: h.snippet || h.relativePath, score: h.score }));
    if (aiRows.length) {
      out.push({
        title: similarFile ? 'Similar files' : 'Best matches',
        icon: 'sparkles',
        iconClass: 'text-mint',
        rows: aiRows,
      });
    }
    const seen = new Set(aiRows.map((r) => r.entry.path));
    const nameRows = nameHits
      .filter((h) => !seen.has(h.path) && passes(h))
      .map((h) => ({ entry: h, sub: h.path }));
    if (nameRows.length) {
      out.push({
        title: 'Name matches',
        icon: 'search',
        iconClass: 'text-blueberry',
        rows: nameRows,
      });
    }
    return out;
  }, [text, similarFile, aiHits, nameHits, tagFiles, recents, typeKeys, tagId, tagMap, modified, tags]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  // Keep the cursor on a real row as results change.
  useEffect(() => {
    setActiveIx((ix) => Math.max(0, Math.min(ix, flat.length - 1)));
  }, [flat.length]);

  // Keep the active row visible while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-ix="${activeIx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIx]);

  const activate = useCallback(
    (row: Row) => {
      onClose();
      if (row.entry.isDirectory) {
        onNavigate(row.entry.path);
      } else {
        window.fsapi.open(row.entry.path).then((r) => !r.ok && notifyError(r.error));
      }
    },
    [onClose, onNavigate, notifyError],
  );

  const showInFolder = useCallback(
    (row: Row) => {
      onClose();
      onNavigate(row.entry.isDirectory ? row.entry.path : parentOf(row.entry.path));
    },
    [onClose, onNavigate],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIx((ix) => Math.min(ix + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIx((ix) => Math.max(ix - 1, 0));
    } else if (e.key === 'Enter' && flat[activeIx]) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) showInFolder(flat[activeIx]);
      else activate(flat[activeIx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // keep the window-level fallback from double-firing
      if (text) setText('');
      else if (similarFile) setSimilarFile(null);
      else onClose();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const paths = resolveDroppedPaths(e);
    if (paths[0]) {
      setSimilarFile(paths[0]);
      setText('');
      inputRef.current?.focus();
    }
  };

  if (!open) return null;

  const topScore = flat.find((r) => r.score !== undefined)?.score || 1;
  const aiReady = ai.enabled && ai.ready;
  const activeTag = tagId != null ? tags.find((t) => t.id === tagId) : undefined;

  let ix = -1; // running flat index across sections

  return (
    <div
      className="animate-in fade-in-0 bg-ink/20 fixed inset-0 z-50 backdrop-blur-[3px] duration-150"
      onMouseDown={onClose}
      role="dialog"
      aria-label="Search"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 relative mx-auto mt-[12vh] w-160 max-w-[92vw] duration-150"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* The scoop comet orbiting the panel edge. */}
        <div className="scoop-trail absolute -inset-px rounded-[14px] -m-px" aria-hidden />

        <div
          className={cn(
            'bg-popover relative flex flex-col overflow-hidden rounded-xl shadow-2xl',
            dragOver && 'ring-mint/50 ring-2 ring-inset',
          )}
        >
          {/* ── Input row ── */}
          <div className="border-border flex h-13 shrink-0 items-center gap-2.5 border-b px-4">
            <Icon
              name="sparkles"
              size={16}
              className={cn('shrink-0', aiReady ? 'text-mint' : 'text-muted-foreground')}
            />
            {similarFile && (
              <span className="bg-mint/10 text-foreground ring-mint/30 flex max-w-56 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1">
                <img
                  src={fileLogo(pseudoEntry(similarFile, baseName(similarFile), 0))}
                  alt=""
                  width={13}
                  height={13}
                />
                <span className="truncate">{baseName(similarFile)}</span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSimilarFile(null)}
                  aria-label="Clear similar-file search"
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            )}
            <input
              ref={inputRef}
              className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 select-text border-0 bg-transparent text-[15px] outline-none"
              placeholder={
                similarFile
                  ? 'Showing files similar to this one'
                  : dragOver
                    ? 'Drop to find similar files…'
                    : 'Search by name, meaning, or tag…'
              }
              value={text}
              readOnly={!!similarFile}
              onChange={(e) => setText(e.target.value)}
            />
            {loading ? (
              <svg
                className="text-mint shrink-0 animate-spin"
                width={15}
                height={15}
                viewBox="0 0 20 20"
                fill="none"
                aria-label="Searching"
              >
                <circle cx={10} cy={10} r={8} stroke="currentColor" strokeWidth={2} strokeDasharray="18 37" strokeLinecap="round" />
              </svg>
            ) : (
              <kbd className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-3xs">
                esc
              </kbd>
            )}
          </div>

          {/* ── Filter chips — wraps, never scrolls ── */}
          <div className="border-border flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3.5 py-2.5">
            {/* Scope: segmented pill */}
            <div className="bg-muted mr-1 flex h-6 shrink-0 items-center rounded-full p-0.5 text-2xs">
              {(['all', 'folder'] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    'ease-snappy h-5 rounded-full px-2 transition-all duration-150',
                    scope === s
                      ? 'bg-background text-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s === 'all' ? 'Everywhere' : 'This folder'}
                </button>
              ))}
            </div>

            {TYPE_FILTERS.map((f) => {
              const active = typeKeys.has(f.key);
              return (
                <button
                  key={f.key}
                  onClick={() =>
                    setTypeKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.key)) next.delete(f.key);
                      else next.add(f.key);
                      return next;
                    })
                  }
                  className={cn(CHIP_BASE, active ? cn(f.active, 'font-medium') : CHIP_IDLE)}
                >
                  <span className={cn('size-1.5 rounded-full', f.dot)} />
                  {f.label}
                </button>
              );
            })}

            {tags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(CHIP_BASE, activeTag ? 'font-medium' : CHIP_IDLE)}
                    style={
                      activeTag
                        ? {
                            color: activeTag.color,
                            borderColor: `${activeTag.color}59`,
                            background: `${activeTag.color}1a`,
                          }
                        : undefined
                    }
                  >
                    {activeTag ? (
                      <>
                        <TagDot color={activeTag.color} size={8} />
                        {activeTag.name}
                      </>
                    ) : (
                      <>
                        <Icon name="tag" size={11} /> Tag
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-40">
                  <DropdownMenuRadioGroup
                    value={String(tagId ?? '')}
                    onValueChange={(v) => setTagId(v ? Number(v) : null)}
                  >
                    <DropdownMenuRadioItem value="">Any tag</DropdownMenuRadioItem>
                    {tags.map((t) => (
                      <DropdownMenuRadioItem key={t.id} value={String(t.id)}>
                        <TagDot color={t.color} size={9} /> {t.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    CHIP_BASE,
                    modified !== 'any'
                      ? 'border-blueberry/40 bg-blueberry/10 text-blueberry font-medium'
                      : CHIP_IDLE,
                  )}
                >
                  <Icon name="clock" size={11} />
                  {MODIFIED_OPTIONS.find((o) => o.value === modified)?.label}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-36">
                <DropdownMenuRadioGroup
                  value={modified}
                  onValueChange={(v) => setModified(v as Modified)}
                >
                  {MODIFIED_OPTIONS.map((o) => (
                    <DropdownMenuRadioItem key={o.value} value={o.value}>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* ── Results ── */}
          <div ref={listRef} className="max-h-[46vh] flex-1 overflow-y-auto py-1.5">
            {flat.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
                <div className="bg-muted flex size-10 items-center justify-center rounded-full">
                  <Icon
                    name={text.trim() || similarFile ? 'search' : 'sparkles'}
                    size={17}
                    className="text-muted-foreground"
                  />
                </div>
                <div className="text-muted-foreground text-sm">
                  {loading
                    ? 'Searching…'
                    : text.trim() || similarFile
                      ? 'No matches.'
                      : 'Type to search — or drop a file here to find similar ones.'}
                </div>
                {!ai.enabled && (
                  <div className="text-muted-foreground text-2xs">
                    Enable AI in Settings to also search by meaning.
                  </div>
                )}
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.title}>
                  <div className="text-muted-foreground flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-3xs font-semibold tracking-wider uppercase">
                    {section.tagColor ? (
                      <TagDot color={section.tagColor} size={8} />
                    ) : (
                      <Icon name={section.icon} size={11} className={section.iconClass} />
                    )}
                    {section.title}
                  </div>
                  {section.rows.map((row, rowIx) => {
                    ix++;
                    const i = ix;
                    const pct = row.score !== undefined
                      ? Math.round((row.score / topScore) * 100)
                      : 0;
                    return (
                      <div
                        key={`${section.title}:${row.entry.path}`}
                        data-ix={i}
                        className={cn(
                          'mx-1.5 flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5',
                          i === activeIx && 'bg-foreground/6',
                        )}
                        onMouseMove={() => setActiveIx(i)}
                        onClick={() => activate(row)}
                      >
                        <img
                          src={fileLogo(row.entry)}
                          alt=""
                          width={18}
                          height={18}
                          draggable={false}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground truncate text-sm" title={row.entry.path}>
                            {row.entry.name}
                          </div>
                          <div className="text-muted-foreground truncate text-2xs">{row.sub}</div>
                        </div>
                        {row.score !== undefined && (
                          <span
                            className={cn(
                              'shrink-0 rounded-sm px-1.5 py-0.5 text-3xs font-medium tabular-nums',
                              rowIx === 0
                                ? 'bg-mint/15 text-mint'
                                : 'bg-muted text-muted-foreground',
                            )}
                            title={
                              rowIx === 0
                                ? 'Strongest semantic match'
                                : `${pct}% as relevant as the top match`
                            }
                          >
                            {rowIx === 0 ? 'Best' : `${pct}`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* ── Footer hints ── */}
          <div className="border-border text-muted-foreground flex shrink-0 items-center justify-between gap-3 border-t px-4 py-1.5 text-3xs">
            <span>
              ↑↓ Navigate · ↵ Open · {modKey}↵ Show in Folder
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  similarFile || aiReady ? 'bg-mint' : 'bg-muted-foreground/40',
                )}
              />
              <span className="truncate">
                {similarFile
                  ? 'Similarity search'
                  : aiReady
                    ? 'Meaning + name search'
                    : 'Name search'}
                {' · '}
                {scope === 'folder' ? baseName(rootPath) || rootPath : 'Everywhere'}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
