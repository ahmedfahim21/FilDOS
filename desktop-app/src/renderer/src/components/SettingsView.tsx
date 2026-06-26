import { useEffect, useState } from 'react';
import type { AiModelStatus } from '@shared/types';
import { AI_MODELS, type AiModality } from '@shared/aiModels';
import { useAi } from '@/state/ai';
import { useIndexing } from '@/state/indexing';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

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

const MODALITY_LABEL: Record<AiModality, string> = {
  text: 'Text',
  code: 'Code',
  image: 'Images',
};

/** A small Azure on/off switch. */
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
      onClick={() => onChange(!checked)}
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

/** Right-aligned per-model state: ready check, live progress, or size hint. */
function ModelState({ status, sizeMb }: { status?: AiModelStatus; sizeMb: number }) {
  if (status?.state === 'ready') {
    return (
      <span className="text-primary flex shrink-0 items-center gap-1 text-[11px]">
        <Icon name="check" size={13} /> Ready
      </span>
    );
  }
  if (status?.state === 'downloading') {
    return (
      <span className="text-muted-foreground shrink-0 text-[11px]">
        {Math.round((status.progress ?? 0) * 100)}%
      </span>
    );
  }
  return <span className="text-muted-foreground shrink-0 text-[11px]">~{sizeMb} MB</span>;
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const ai = useAi();
  const indexing = useIndexing();
  const { notifyError } = useToast();
  const [embedding, setEmbedding] = useState(false);
  const [embedResult, setEmbedResult] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const isCloud = ai.activeProvider === 'cloud';
  const disabled = !ai.enabled || isCloud;
  const activeStatus = ai.status;
  const activeState = activeStatus?.state ?? 'absent';

  const ix = indexing.progress;
  const indexRunning = ix?.state === 'scanning' || ix?.state === 'indexing';
  const indexPct = ix && ix.total > 0 ? Math.round((ix.indexed / ix.total) * 100) : 0;
  const indexLabel =
    ix?.state === 'scanning'
      ? 'Scanning files…'
      : ix?.state === 'indexing'
        ? `Indexing… ${ix.indexed} / ${ix.total}`
        : ix?.state === 'paused'
          ? 'Paused'
          : ix?.state === 'error'
            ? (ix.message ?? 'Indexing failed')
            : 'Idle';

  async function handleDownload() {
    const res = await ai.download();
    if (!res.ok) notifyError(res.error);
  }

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
        <div className="mb-8">
          <h1 className="text-foreground mb-1 text-xl font-medium">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure FilDOS. AI features run on your machine by default.
          </p>
        </div>

        {/* AI section */}
        <section className="border-border bg-card rounded-xl border p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="text-primary">
                <Icon name="sparkles" size={18} />
              </span>
              <div>
                <div className="text-foreground text-sm font-medium">AI features</div>
                <div className="text-muted-foreground text-[11px]">
                  Semantic search and smart organization (foundation)
                </div>
              </div>
            </div>
            <Toggle checked={ai.enabled} onChange={ai.setEnabled} label="Enable AI features" />
          </div>

          {/* Provider selector */}
          <div className={cn('mb-4', !ai.enabled && 'pointer-events-none opacity-50')}>
            <div className="text-muted-foreground mb-2 text-[11px] tracking-[0.06em] uppercase">
              Provider
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  disabled={!p.available}
                  onClick={() => ai.setProvider(p.id)}
                  className={cn(
                    'flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors',
                    ai.activeProvider === p.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent',
                    !p.available && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                  )}
                >
                  <span className="text-foreground text-sm">{p.name}</span>
                  <span className="text-muted-foreground text-[11px]">{p.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Model picker */}
          <div className={cn('mb-4', disabled && 'pointer-events-none opacity-50')}>
            <div className="text-muted-foreground mb-2 text-[11px] tracking-[0.06em] uppercase">
              Embedding model
            </div>
            {isCloud ? (
              <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-3 text-center text-[11px]">
                Switch to On-device to choose a model.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {AI_MODELS.map((m) => {
                  const active = ai.modelId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => ai.setModel(m.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                        active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground truncate text-sm">{m.label}</span>
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                            {MODALITY_LABEL[m.modality]}
                          </span>
                          <span className="text-muted-foreground text-[10px]">{m.dim}-d</span>
                        </div>
                        <div className="text-muted-foreground truncate text-[11px]">
                          {m.description}
                        </div>
                      </div>
                      <ModelState status={ai.statuses[m.id]} sizeMb={m.sizeMb} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active model status + download */}
          <div className={cn('mb-3', disabled && 'pointer-events-none opacity-50')}>
            <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate text-sm">{ai.modelId}</div>
                <div className="text-muted-foreground text-[11px]">
                  {isCloud
                    ? 'Not available for this provider'
                    : activeState === 'ready'
                      ? `Ready · ${activeStatus?.dim ?? ''}-d`
                      : activeState === 'downloading'
                        ? `Downloading… ${Math.round((activeStatus?.progress ?? 0) * 100)}%`
                        : activeState === 'error'
                          ? (activeStatus?.message ?? 'Download failed')
                          : 'Not downloaded'}
                </div>
                {activeState === 'downloading' && (
                  <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${Math.round((activeStatus?.progress ?? 0) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {activeState === 'ready' ? (
                <span className="text-primary shrink-0">
                  <Icon name="check" size={16} />
                </span>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={ai.busy || activeState === 'downloading' || disabled}
                  className="border-primary text-primary hover:bg-primary hover:text-white shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-all disabled:cursor-wait disabled:opacity-60"
                >
                  {activeState === 'downloading'
                    ? 'Downloading…'
                    : activeState === 'error'
                      ? 'Retry'
                      : 'Download'}
                </button>
              )}
            </div>
          </div>

          {/* Test embed */}
          <div className={cn(disabled && 'pointer-events-none opacity-50')}>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestEmbed}
                disabled={embedding || disabled}
                className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-60"
              >
                {embedding ? 'Embedding…' : 'Test embed'}
              </button>
              {embedResult && (
                <code className="text-muted-foreground truncate font-mono text-[11px]">
                  {embedResult}
                </code>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-[11px] leading-snug">
              Embeds a sample string with the selected model to verify it end-to-end. The first run
              downloads the model if needed.
            </p>
          </div>
        </section>

        {/* Indexing section */}
        <section
          className={cn(
            'border-border bg-card mt-5 rounded-xl border p-5',
            !ai.enabled && 'pointer-events-none opacity-50',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="text-primary">
                <Icon name="search" size={18} />
              </span>
              <div>
                <div className="text-foreground text-sm font-medium">Indexing</div>
                <div className="text-muted-foreground text-[11px]">
                  Builds the search index from your files in the background
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {indexRunning ? (
                <button
                  onClick={indexing.pause}
                  className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-sm transition-colors"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={() => void indexing.start()}
                  disabled={activeState !== 'ready'}
                  title={activeState !== 'ready' ? 'Download the embedding model first' : undefined}
                  className="border-primary text-primary hover:bg-primary hover:text-white rounded-lg border px-3 py-1.5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="border-border mb-4 rounded-lg border px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground text-sm">{indexLabel}</span>
              {!!ix?.errors && (
                <span className="text-muted-foreground text-[11px]">{ix.errors} skipped</span>
              )}
            </div>
            {indexRunning && (
              <>
                <div className="bg-muted mt-2 h-1 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${indexPct}%` }}
                  />
                </div>
                {ix?.currentFile && (
                  <div className="text-muted-foreground mt-1.5 truncate font-mono text-[10px]">
                    {ix.currentFile}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Exclusions */}
          <div className="mb-3">
            <div className="text-muted-foreground mb-2 text-[11px] tracking-[0.06em] uppercase">
              Excluded from indexing
            </div>
            {indexing.excludes.length === 0 ? (
              <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-3 text-center text-[11px]">
                Nothing excluded. Right-click a file or folder to exclude it.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {indexing.excludes.map((path) => (
                  <div
                    key={path}
                    className="border-border flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <code className="text-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
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
            className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
          >
            Clear index
          </button>
        </section>
      </div>
    </div>
  );
}
