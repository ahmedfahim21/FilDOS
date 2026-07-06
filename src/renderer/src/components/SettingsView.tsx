import { useEffect, useState, type ReactNode } from 'react';
import type { AiModelStatus, Theme } from '@shared/types';
import { getModelDef, INDEX_MODEL_IDS, RERANKER_MODEL_ID } from '@shared/aiModels';
import {
  LLM_CONFIG_LIMITS,
  LLM_SYSTEM_PROMPT_MAX,
  resolveLlmConfig,
  type LlmModelDef,
  type LlmSystemSpecs,
} from '@shared/llmModels';
import { useAi } from '@/state/ai';
import { useChat } from '@/state/chat';
import { useIndexing } from '@/state/indexing';
import { useToast } from '@/state/toast';
import { applyTheme } from '@/lib/theme';
import { playToggle, setSoundsEnabled, soundsEnabled } from '@/lib/sounds';
import { modelLogo } from '@/lib/modelLogo';
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

/** "Apple Silicon · Metal GPU · 12 GB memory · 8 cores" from the worker's probe. */
function specsLine(specs: LlmSystemSpecs): string {
  const family =
    specs.arch === 'arm64' && window.platform?.os === 'darwin' ? 'Apple Silicon' : specs.arch;
  const gpu = specs.gpu ? `${specs.gpu[0].toUpperCase()}${specs.gpu.slice(1)} GPU` : 'CPU only';
  const memGb = Math.round((specs.gpu ? Math.max(specs.vramMb, 0) : specs.ramMb) / 1024) ||
    Math.round(specs.ramMb / 1024);
  return `${family} · ${gpu} · ${memGb} GB memory · ${specs.cpus} cores`;
}

/** One labelled range slider with a live mono readout. */
function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="text-muted-foreground w-28 shrink-0 text-2xs">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-mint h-1 min-w-0 flex-1"
        aria-label={label}
      />
      <code className="text-foreground w-14 shrink-0 text-right font-mono text-2xs">{display}</code>
    </label>
  );
}

/**
 * One chat model: status + download/remove management, a "Recommended" badge
 * when it fits this machine best, and an expandable panel tuning the
 * generation parameters the model supports (persisted per model). Custom
 * (user-added) models show their source and can be forgotten entirely.
 */
function ChatModelCard({ def, recommended }: { def: LlmModelDef; recommended: boolean }) {
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const custom = def.family === 'custom';
  const status = chat.statuses[def.id];
  const state = status?.state ?? 'absent';
  const pct = Math.round((status?.progress ?? 0) * 100);
  const stored = chat.configs[def.id];
  const cfg = resolveLlmConfig(def.id, stored);
  const customized = !!stored && Object.keys(stored).length > 0;
  const L = LLM_CONFIG_LIMITS;
  const sizeNote = def.sizeMb ? `${(def.sizeMb / 1024).toFixed(1)} GB` : 'size resolved at download';

  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <img
          src={modelLogo(def.family)}
          alt={def.family}
          className="size-5 shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm">{def.label}</span>
            {recommended && (
              <span className="bg-mint/15 text-mint rounded-full px-1.5 py-0.5 text-3xs font-medium">
                Recommended
              </span>
            )}
            {custom && (
              <span className="bg-blueberry/15 text-blueberry rounded-full px-1.5 py-0.5 text-3xs font-medium">
                Custom
              </span>
            )}
            {customized && state === 'ready' && (
              <span
                className="bg-grape/15 text-grape rounded-full px-1.5 py-0.5 text-3xs font-medium"
                title="Custom parameters are set"
              >
                Customized
              </span>
            )}
          </div>
          <div className={cn('text-muted-foreground mt-0.5 truncate text-2xs', custom && 'font-mono')}>
            {state === 'downloading'
              ? `Downloading… ${pct}%`
              : state === 'error'
                ? (status?.message ?? 'Download failed')
                : custom
                  ? def.uri
                  : state === 'ready'
                    ? def.description
                    : `${def.description} · ${sizeNote}`}
          </div>
          {state === 'downloading' && (
            <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
              <div
                className="bg-mint h-full rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        {confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground text-2xs">
              {custom ? 'Remove this model?' : 'Delete weights?'}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setOpen(false);
                void (custom ? chat.forgetCustomModel(def.id) : chat.removeModel(def.id));
              }}
            >
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : state === 'ready' ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="bg-mint/15 text-mint rounded-full px-2 py-0.5 text-3xs font-medium">
              Ready
            </span>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={cn(
                'text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md',
                open && 'bg-accent text-foreground',
              )}
              title="Customize parameters"
              aria-label={`Customize ${def.label}`}
            >
              <Icon name="settings" size={14} />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="text-muted-foreground hover:bg-accent hover:text-strawberry grid size-7 place-items-center rounded-md"
              title={custom ? 'Remove this model' : 'Delete downloaded weights'}
              aria-label={`Remove ${def.label}`}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant={state === 'error' ? 'secondary' : 'default'}
              onClick={() => void chat.download(def.id)}
              disabled={state === 'downloading'}
              className={state === 'downloading' ? 'cursor-wait' : undefined}
            >
              {state === 'downloading' ? 'Downloading…' : state === 'error' ? 'Retry' : 'Download'}
            </Button>
            {custom && state !== 'downloading' && (
              <button
                onClick={() => setConfirming(true)}
                className="text-muted-foreground hover:bg-accent hover:text-strawberry grid size-7 place-items-center rounded-md"
                title="Remove this model"
                aria-label={`Remove ${def.label}`}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {open && state === 'ready' && (
        <div className="border-border space-y-3 border-t px-3 py-3">
          <ParamSlider
            label="Temperature"
            value={cfg.temperature}
            min={L.temperature.min}
            max={L.temperature.max}
            step={L.temperature.step}
            display={cfg.temperature.toFixed(2)}
            onChange={(v) => chat.setConfig(def.id, { temperature: v })}
          />
          <ParamSlider
            label="Top-p"
            value={cfg.topP}
            min={L.topP.min}
            max={L.topP.max}
            step={L.topP.step}
            display={cfg.topP.toFixed(2)}
            onChange={(v) => chat.setConfig(def.id, { topP: v })}
          />
          <ParamSlider
            label="Max answer"
            value={cfg.maxTokens}
            min={L.maxTokens.min}
            max={L.maxTokens.max}
            step={L.maxTokens.step}
            display={`${cfg.maxTokens} tok`}
            onChange={(v) => chat.setConfig(def.id, { maxTokens: v })}
          />
          <ParamSlider
            label="Context window"
            value={cfg.contextSize}
            min={L.contextSize.min}
            max={L.contextSize.max}
            step={L.contextSize.step}
            display={`${(cfg.contextSize / 1024).toFixed(0)}k`}
            onChange={(v) => chat.setConfig(def.id, { contextSize: v })}
          />
          <div>
            <span className="text-muted-foreground mb-1 block text-2xs">Custom instructions</span>
            <textarea
              value={cfg.systemPrompt}
              maxLength={LLM_SYSTEM_PROMPT_MAX}
              rows={2}
              placeholder="e.g. Always answer in bullet points."
              onChange={(e) => chat.setConfig(def.id, { systemPrompt: e.target.value })}
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-mint/50 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-3xs">
              A larger context fits more file content but uses more memory.
            </p>
            {customized && (
              <button
                onClick={() => chat.setConfig(def.id, null)}
                className="text-muted-foreground hover:text-foreground text-2xs underline-offset-2 hover:underline"
              >
                Reset to defaults
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Paste-a-model input: any Hugging Face GGUF repo or direct .gguf URL. */
function AddModelRow() {
  const chat = useChat();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!value.trim()) return;
    const problem = await chat.addCustomModel(value);
    setError(problem);
    if (!problem) setValue('');
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          placeholder="hf:owner/repo:Q4_K_M · owner/repo · https://…/model.gguf"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-mint/50 min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs outline-none"
          aria-label="Add a model from the internet"
        />
        <Button size="sm" variant="secondary" onClick={() => void add()} disabled={!value.trim()}>
          Add
        </Button>
      </div>
      {error ? (
        <p className="text-strawberry mt-1.5 text-2xs">{error}</p>
      ) : (
        <p className="text-muted-foreground mt-1.5 text-2xs leading-snug">
          Any GGUF chat model node-llama-cpp can fetch: a Hugging Face repo (the best quant is
          picked automatically), a repo with an explicit quant, or a direct .gguf link.
        </p>
      )}
    </div>
  );
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const ai = useAi();
  const chat = useChat();
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

          {/* Assistant chat models */}
          <Section
            icon="sparkles"
            accent="mint"
            title="Assistant"
            subtitle="On-device chat models — download, tune, and pick what fits your machine"
          >
            {/* What this machine can run. */}
            <div className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-foreground text-sm">This machine</div>
                <div className="text-muted-foreground mt-0.5 truncate font-mono text-2xs">
                  {chat.specs ? specsLine(chat.specs) : 'Detecting hardware…'}
                </div>
              </div>
              {chat.recommendedId && (
                <span className="bg-mint/15 text-mint shrink-0 rounded-full px-2 py-0.5 text-3xs font-medium">
                  Best fit: {chat.modelDef(chat.recommendedId)?.label}
                </span>
              )}
            </div>

            <div>
              <SubLabel>Chat models</SubLabel>
              <div className="flex flex-col gap-1.5">
                {chat.allModels.map((def) => (
                  <ChatModelCard
                    key={def.id}
                    def={def}
                    recommended={chat.recommendedId === def.id}
                  />
                ))}
              </div>
              <p className="text-muted-foreground mt-2 text-2xs leading-snug">
                Models run fully on this device through llama.cpp — nothing leaves your machine.
                Downloaded models appear in the Assistant's picker with the parameters you set here.
              </p>
            </div>

            <div>
              <SubLabel>Add a model from the internet</SubLabel>
              <AddModelRow />
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
