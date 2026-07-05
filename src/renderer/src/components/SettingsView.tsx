import { useEffect, useState, type ReactNode } from 'react';
import type { AiModelStatus, Theme } from '@shared/types';
import { getModelDef, INDEX_MODEL_IDS, RERANKER_MODEL_ID } from '@shared/aiModels';
import { useAi } from '@/state/ai';
import { useIndexing } from '@/state/indexing';
import { useToast } from '@/state/toast';
import { applyTheme } from '@/lib/theme';
import { playToggle, setSoundsEnabled, soundsEnabled } from '@/lib/sounds';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Button } from '@/components/ui/button';

type IconName = React.ComponentProps<typeof Icon>['name'];

const THEMES: { value: Theme; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

interface ProviderOption {
  id: string;
  name: string;
  blurb: string;
  available: boolean;
}

const PROVIDERS: ProviderOption[] = [
  { id: 'embedded', name: 'On-device', blurb: 'Runs locally — private, no API key', available: true },
  { id: 'cloud', name: 'Hosted', blurb: 'Coming soon', available: false },
];

/** A small on/off switch (Ink/white primary track). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        const next = !checked;
        if (next) playToggle(); // detent only when committing to the active state
        onChange(next);
      }}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

/** A section card with a framed icon tile, title/subtitle, and an optional action. */
function Section({
  icon,
  accent,
  title,
  subtitle,
  action,
  className,
  children,
}: {
  icon: IconName;
  accent?: 'mint';
  title: string;
  subtitle: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('border-border bg-card rounded-xl border p-5', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-muted ring-border/60 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1">
            <Icon name={icon} size={17} className={accent === 'mint' ? 'text-mint' : 'text-foreground'} />
          </div>
          <div className="min-w-0">
            <div className="text-foreground text-sm font-medium">{title}</div>
            <div className="text-muted-foreground text-2xs">{subtitle}</div>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** An uppercase sub-heading inside a section. */
function SubLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground mb-2 text-2xs font-medium tracking-wider uppercase">
      {children}
    </div>
  );
}

/** One of the two managed models, with live status + a download/retry button. */
function ModelRow({
  id,
  status,
  onDownload,
}: {
  id: string;
  status?: AiModelStatus;
  onDownload: () => void;
}) {
  const def = getModelDef(id);
  const state = status?.state ?? 'absent';
  const pct = Math.round((status?.progress ?? 0) * 100);
  return (
    <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-sm">{def?.label ?? id}</span>
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-3xs">
            {def?.modality === 'image' ? 'Images' : 'Text & docs'}
          </span>
        </div>
        <div className="text-muted-foreground mt-0.5 text-2xs">
          {state === 'ready'
            ? `${status?.dim ?? def?.dim ?? ''}-dimensional embeddings`
            : state === 'downloading'
              ? `Downloading… ${pct}%`
              : state === 'error'
                ? (status?.message ?? 'Download failed')
                : `Not downloaded · ~${def?.sizeMb ?? '?'} MB`}
        </div>
        {state === 'downloading' && (
          <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
            <div
              className="bg-foreground/50 h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {state === 'ready' ? (
        <span className="bg-mint/15 text-mint shrink-0 rounded-full px-2 py-0.5 text-3xs font-medium">
          Ready
        </span>
      ) : (
        <Button
          size="sm"
          variant={state === 'error' ? 'secondary' : 'default'}
          onClick={onDownload}
          disabled={state === 'downloading'}
          className={state === 'downloading' ? 'cursor-wait' : undefined}
        >
          {state === 'downloading' ? 'Downloading…' : state === 'error' ? 'Retry' : 'Download'}
        </Button>
      )}
    </div>
  );
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const ai = useAi();
  const indexing = useIndexing();
  const { notifyError } = useToast();
  const [embedding, setEmbedding] = useState(false);
  const [embedResult, setEmbedResult] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('system');
  const [sounds, setSounds] = useState(soundsEnabled());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  useEffect(() => {
    window.prefs.get().then((p) => setTheme(p.theme ?? 'system'));
  }, []);

  function chooseTheme(value: Theme) {
    setTheme(value);
    applyTheme(value);
    window.prefs.set({ theme: value });
  }

  function chooseSounds(value: boolean) {
    setSounds(value);
    setSoundsEnabled(value);
    if (value) playToggle(); // confirm with a pip once sounds are back on
  }

  const isCloud = ai.activeProvider === 'cloud';
  const disabled = !ai.enabled || isCloud;

  const ix = indexing.progress;
  const indexRunning = ix?.state === 'scanning' || ix?.state === 'indexing';
  const indexPct = ix && ix.total > 0 ? Math.round((ix.indexed / ix.total) * 100) : 0;

  const { indexTitle, indexSubtitle } = (() => {
    if (!ix) return { indexTitle: 'Idle', indexSubtitle: null };
    if (ix.state === 'scanning') {
      return {
        indexTitle: 'Walking the file tree…',
        indexSubtitle: ix.scanned > 0 ? `${ix.scanned.toLocaleString()} files found` : null,
      };
    }
    if (ix.state === 'indexing') {
      const ext = ix.currentFile?.split('.').pop()?.toLowerCase() ?? '';
      const verb =
        ext === 'pdf' ? 'Parsing PDF'
        : ['md', 'mdx', 'rst', 'txt'].includes(ext) ? 'Reading document'
        : ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext) ? 'Embedding TypeScript'
        : ext === 'py' ? 'Embedding Python'
        : ['go', 'rs', 'java', 'cpp', 'c', 'cs', 'swift', 'rb', 'kt'].includes(ext) ? 'Embedding source code'
        : ['json', 'yaml', 'yml', 'toml'].includes(ext) ? 'Indexing config'
        : ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext) ? 'Encoding image'
        : 'Building search vectors';
      return {
        indexTitle: `${verb}…`,
        indexSubtitle: `${ix.indexed.toLocaleString()} / ${ix.total.toLocaleString()} files`,
      };
    }
    if (ix.state === 'paused') {
      return {
        indexTitle: 'Paused',
        indexSubtitle: ix.total > 0
          ? `${ix.indexed.toLocaleString()} of ${ix.total.toLocaleString()} done`
          : null,
      };
    }
    if (ix.state === 'error') {
      return {
        indexTitle: ix.message ?? 'Indexing failed',
        indexSubtitle: ix.errors > 0 ? `${ix.errors} file${ix.errors !== 1 ? 's' : ''} skipped` : null,
      };
    }
    // idle
    return {
      indexTitle: 'Idle',
      indexSubtitle: ix.indexed > 0
        ? `${ix.indexed.toLocaleString()} files in the index`
        : 'No files indexed yet — press Start',
    };
  })();

  async function handleTestEmbed() {
    setEmbedding(true);
    setEmbedResult(null);
    const res = await window.ai.embed(['hello world']);
    setEmbedding(false);
    if (!res.ok) {
      notifyError(res.error);
      return;
    }
    const vec = res.data[0] ?? [];
    const preview = vec.slice(0, 4).map((v) => v.toFixed(3)).join(', ');
    setEmbedResult(`dim ${vec.length} · [${preview}${vec.length > 4 ? ', …' : ''}]`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <header className="mb-8">
          <h1 className="text-foreground mb-1 text-xl font-medium">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure FilDOS. AI features run on your machine by default.
          </p>
        </header>

        <div className="flex flex-col gap-5">
          {/* Appearance */}
          <Section icon="sun" title="Appearance" subtitle="Theme and interface feedback">
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => chooseTheme(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-colors',
                    theme === t.value
                      ? 'border-border bg-foreground/[0.08] text-foreground ring-1 ring-inset ring-foreground/20'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon name={t.icon} size={18} />
                  <span className="text-foreground text-sm">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
              <div className="min-w-0">
                <div className="text-foreground text-sm">Interface sounds</div>
                <div className="text-muted-foreground text-2xs">
                  Soft cues for actions, notifications, and toggles
                </div>
              </div>
              <Toggle checked={sounds} onChange={chooseSounds} label="Enable interface sounds" />
            </div>
          </Section>

          {/* AI features */}
          <Section
            icon="sparkles"
            accent="mint"
            title="AI features"
            subtitle="Semantic search and smart organization (foundation)"
            action={<Toggle checked={ai.enabled} onChange={ai.setEnabled} label="Enable AI features" />}
          >
            {/* Provider selector */}
            <div className={cn(!ai.enabled && 'pointer-events-none opacity-50')}>
              <SubLabel>Provider</SubLabel>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    disabled={!p.available}
                    onClick={() => ai.setProvider(p.id)}
                    className={cn(
                      'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors',
                      ai.activeProvider === p.id
                        ? 'border-border bg-foreground/[0.08] ring-1 ring-inset ring-foreground/20'
                        : 'border-border hover:bg-accent',
                      !p.available && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-foreground text-sm">{p.name}</span>
                      {!p.available && (
                        <span className="text-muted-foreground border-border rounded-md border border-dashed px-1.5 py-0.5 text-3xs">
                          Soon
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-2xs">{p.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Models — managed automatically (no user choice). */}
            <div className={cn(disabled && 'pointer-events-none opacity-50')}>
              <SubLabel>Models</SubLabel>
              {isCloud ? (
                <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-3 text-center text-2xs">
                  Switch to On-device to use models.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {INDEX_MODEL_IDS.map((id) => (
                    <ModelRow
                      key={id}
                      id={id}
                      status={ai.statuses[id]}
                      onDownload={() =>
                        ai.downloadModel(id).then((r) => {
                          if (!r.ok) notifyError(r.error);
                          ai.refreshStatuses();
                        })
                      }
                    />
                  ))}
                  <div className="border-border mt-1 border-t pt-1.5">
                    <ModelRow
                      id={RERANKER_MODEL_ID}
                      status={ai.statuses[RERANKER_MODEL_ID]}
                      onDownload={() =>
                        ai.downloadModel(RERANKER_MODEL_ID).then((r) => {
                          if (!r.ok) notifyError(r.error);
                          ai.refreshStatuses();
                        })
                      }
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-2xs leading-snug">
                    FilDOS picks the right model per file automatically — a text model for documents
                    and CLIP for images. Both download when AI is enabled. The reranker is optional
                    and improves search precision when downloaded.
                  </p>
                </div>
              )}
            </div>

            {/* Test embed */}
            <div className={cn('border-border border-t pt-4', disabled && 'pointer-events-none opacity-50')}>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="secondary" onClick={handleTestEmbed} disabled={embedding || disabled}>
                  {embedding ? 'Embedding…' : 'Test embed'}
                </Button>
                {embedResult && (
                  <code className="text-muted-foreground truncate font-mono text-2xs">
                    {embedResult}
                  </code>
                )}
              </div>
              <p className="text-muted-foreground mt-2 text-2xs leading-snug">
                Embeds a sample string with the text model to verify it end-to-end. The first run
                downloads the model if needed.
              </p>
            </div>
          </Section>

          {/* Indexing */}
          <Section
            icon="search"
            title="Indexing"
            subtitle="Builds the search index from your files in the background"
            className={cn(!ai.enabled && 'pointer-events-none opacity-50')}
            action={
              indexRunning ? (
                <Button size="sm" variant="secondary" onClick={indexing.pause}>
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void indexing.start()}
                  disabled={!ai.ready}
                  title={!ai.ready ? 'Download the model first' : undefined}
                >
                  Start
                </Button>
              )
            }
          >
            {/* Progress */}
            <div className="border-border rounded-lg border px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground text-sm">{indexTitle}</div>
                  {indexSubtitle && (
                    <div className="text-muted-foreground mt-0.5 text-2xs">{indexSubtitle}</div>
                  )}
                </div>
                {!!ix?.errors && ix.state !== 'error' && (
                  <span className="text-muted-foreground shrink-0 text-2xs">{ix.errors} skipped</span>
                )}
              </div>
              {indexRunning && (
                <>
                  <div className="bg-muted mt-2 h-1 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-foreground/50 h-full rounded-full transition-all duration-300"
                      style={{ width: `${indexPct}%` }}
                    />
                  </div>
                  {ix?.currentFile && (
                    <div className="text-muted-foreground mt-1.5 truncate font-mono text-3xs">
                      {ix.currentFile}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Rescan cadence */}
            <div className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-foreground text-sm">Rescan every</div>
                <div className="text-muted-foreground text-2xs">
                  How often the background scan checks for new or changed files
                </div>
              </div>
              <select
                value={indexing.intervalMinutes}
                onChange={(e) => indexing.setIntervalMinutes(Number(e.target.value))}
                className="border-border bg-card text-foreground shrink-0 rounded-lg border px-2 py-1 text-sm"
              >
                {[5, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : '1 hour'}
                  </option>
                ))}
              </select>
            </div>

            {/* Exclusions */}
            <div>
              <SubLabel>Excluded from indexing</SubLabel>
              {indexing.excludes.length === 0 ? (
                <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-3 text-center text-2xs">
                  Nothing excluded. Right-click a file or folder to exclude it.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {indexing.excludes.map((path) => (
                    <div
                      key={path}
                      className="border-border flex items-center gap-3 rounded-lg border px-3 py-2"
                    >
                      <code className="text-foreground min-w-0 flex-1 truncate font-mono text-2xs">
                        {path}
                      </code>
                      <button
                        onClick={() => indexing.removeExclude(path)}
                        aria-label={`Stop excluding ${path}`}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => void indexing.clear()}
              className="text-muted-foreground hover:text-foreground text-2xs underline-offset-2 hover:underline"
            >
              Clear index
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}
