import { useEffect, useState } from 'react';
import type { AiModelStatus } from '@shared/types';
import { getModelDef, INDEX_MODEL_IDS } from '@shared/aiModels';
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
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
            {def?.modality === 'image' ? 'Images' : 'Text & documents'}
          </span>
        </div>
        <div className="text-muted-foreground text-[11px]">
          {state === 'ready'
            ? `Ready · ${status?.dim ?? def?.dim ?? ''}-d`
            : state === 'downloading'
              ? `Downloading… ${pct}%`
              : state === 'error'
                ? (status?.message ?? 'Download failed')
                : `Not downloaded · ~${def?.sizeMb ?? '?'} MB`}
        </div>
        {state === 'downloading' && (
          <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {state === 'ready' ? (
        <span className="text-primary shrink-0">
          <Icon name="check" size={16} />
        </span>
      ) : (
        <button
          onClick={onDownload}
          disabled={state === 'downloading'}
          className="border-primary text-primary hover:bg-primary hover:text-white shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-all disabled:cursor-wait disabled:opacity-60"
        >
          {state === 'downloading' ? 'Downloading…' : state === 'error' ? 'Retry' : 'Download'}
        </button>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const isCloud = ai.activeProvider === 'cloud';
  const disabled = !ai.enabled || isCloud;

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

          {/* Models — managed automatically (no user choice). */}
          <div className={cn('mb-3', disabled && 'pointer-events-none opacity-50')}>
            <div className="text-muted-foreground mb-2 text-[11px] tracking-[0.06em] uppercase">
              Models
            </div>
            {isCloud ? (
              <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-3 text-center text-[11px]">
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
                <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
                  FilDOS picks the right model per file automatically — a text model for documents
                  and CLIP for images. Both download when AI is enabled.
                </p>
              </div>
            )}
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
              Embeds a sample string with the text model to verify it end-to-end. The first run
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
                  disabled={!ai.ready}
                  title={!ai.ready ? 'Download the model first' : undefined}
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

          {/* Rescan cadence */}
          <div className="border-border mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-foreground text-sm">Rescan every</div>
              <div className="text-muted-foreground text-[11px]">
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
