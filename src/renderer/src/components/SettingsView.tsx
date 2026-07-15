import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccountRecord, AiModelStatus, Theme } from '@shared/types';
import { getModelDef, INDEX_MODEL_IDS, NER_MODEL_ID, RERANKER_MODEL_ID } from '@shared/aiModels';
import {
  CLOUD_CONFIG_LIMITS,
  HF_GGUF_MODELS_URL,
  LLM_CONFIG_LIMITS,
  LLM_SYSTEM_PROMPT_MAX,
  resolveLlmConfig,
  type LlmModelDef,
  type LlmModelFamily,
  type LlmSystemSpecs,
} from '@shared/llmModels';
import {
  CLOUD_MODEL_PLACEHOLDER,
  CLOUD_MODEL_SUGGESTIONS,
  CLOUD_PROVIDERS,
  cloudProviderOfAccount,
  getCloudProvider,
  usesProviderDefaultSampling,
  type CloudLlmProviderId,
  type CloudModelDef,
  type CloudProviderDef,
} from '@shared/cloudLlm';
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

/** The Settings pages. Model management gets its own tab — it's the biggest. */
type SettingsTab = 'general' | 'search' | 'assistant' | 'privacy';

const TABS: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'sun' },
  { id: 'search', label: 'Searching', icon: 'search' },
  { id: 'assistant', label: 'Ask AI', icon: 'sparkles' },
  { id: 'privacy', label: 'Privacy', icon: 'eye-off' },
];

/** Display heading + order for each model family in the Ask AI tab. */
const FAMILY_LABELS: Record<LlmModelFamily, string> = {
  custom: 'Your models',
  llama: 'Llama — Meta',
  qwen: 'Qwen — Alibaba',
  gemma: 'Gemma — Google',
  phi: 'Phi — Microsoft',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  granite: 'Granite — IBM',
  lfm: 'LFM — Liquid AI',
  smollm: 'SmolLM — Hugging Face',
  // Cloud families never group in the library — models under a BYO-key
  // connection render in the Cloud section — but the Record wants them all.
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  bedrock: 'AWS Bedrock',
  'openai-compat': 'OpenAI-compatible',
};
const FAMILY_ORDER: LlmModelFamily[] = [
  'custom',
  'llama',
  'qwen',
  'gemma',
  'phi',
  'mistral',
  'deepseek',
  'granite',
  'lfm',
  'smollm',
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

/** Text-only vs. vision-capable badge shown beside every chat model. */
function ModalityBadge({ def }: { def: LlmModelDef }) {
  return def.modality === 'vision' ? (
    <span className="bg-blueberry/15 text-blueberry shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-medium">
      Vision
    </span>
  ) : (
    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-medium">
      Text
    </span>
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
              className="bg-foreground/50 h-full rounded-full transition-[width]"
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
 * when it fits this machine best, a text/vision modality badge, and an
 * expandable panel tuning the generation parameters the model supports
 * (persisted per model). Custom (user-added) models show their source and can
 * be forgotten entirely.
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
            <ModalityBadge def={def} />
            {recommended && (
              <span className="bg-mint/15 text-mint shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-medium">
                Recommended
              </span>
            )}
            {customized && state === 'ready' && (
              <span
                className="bg-grape/15 text-grape shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-medium"
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
                className="bg-mint h-full rounded-full transition-[width]"
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

/**
 * The chat-model library: a search box plus modality/downloaded filters over
 * the (large) built-in catalog, grouped by family. Filters are additive; the
 * empty state names the active filters so a "no results" is never a mystery.
 */
function ChatModelBrowser() {
  const chat = useChat();
  const [query, setQuery] = useState('');
  const [modality, setModality] = useState<'all' | 'text' | 'vision'>('all');
  const [onlyDownloaded, setOnlyDownloaded] = useState(false);

  const downloadedCount = chat.allModels.filter(
    (d) => chat.statuses[d.id]?.state === 'ready',
  ).length;

  // The machine's recommended pick, surfaced at the top of the default view.
  // Hidden while searching/filtering (then it's just badged in its family
  // group) so the featured block always reflects an unfiltered "best fit".
  const recDef = chat.recommendedId ? chat.modelDef(chat.recommendedId) : undefined;
  const featured =
    recDef && !query.trim() && modality === 'all' && !onlyDownloaded ? recDef : undefined;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = chat.allModels.filter((def) => {
      if (featured && def.id === featured.id) return false; // shown in the featured block
      if (q && !`${def.label} ${def.description} ${def.family}`.toLowerCase().includes(q)) return false;
      if (modality !== 'all' && (def.modality ?? 'text') !== modality) return false;
      if (onlyDownloaded && chat.statuses[def.id]?.state !== 'ready') return false;
      return true;
    });
    return FAMILY_ORDER.map((family) => ({
      family,
      models: visible.filter((d) => d.family === family),
    })).filter((g) => g.models.length > 0);
  }, [chat.allModels, chat.statuses, query, modality, onlyDownloaded, featured]);

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors',
      active
        ? 'border-border bg-primary/10 text-foreground'
        : 'border-border text-muted-foreground hover:bg-accent',
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SubLabel>Model library</SubLabel>
        <span className="text-muted-foreground text-2xs">
          {downloadedCount} of {chat.allModels.length} on this device
        </span>
      </div>

      {/* Search + filters */}
      <div className="mb-3 space-y-2">
        <div className="border-border bg-background focus-within:border-mint/50 flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
          <Icon name="search" size={13} className="text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            aria-label="Search chat models"
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear model search"
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', 'All'],
              ['text', 'Text'],
              ['vision', 'Vision'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} onClick={() => setModality(value)} className={chip(modality === value)}>
              {label}
            </button>
          ))}
          <span className="bg-border mx-1 h-4 w-px" aria-hidden />
          <button onClick={() => setOnlyDownloaded((v) => !v)} className={chip(onlyDownloaded)}>
            On this device
          </button>
        </div>
      </div>

      {/* Recommended for this machine — the top of the library. Styled like a
          family group (label + card), not a boxed callout, to keep it calm. */}
      {featured && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-2">
            <Icon name="sparkles" size={14} className="text-mint shrink-0" />
            <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">
              Recommended for your machine
            </span>
          </div>
          <ChatModelCard def={featured} recommended />
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-6 text-center text-2xs">
          No models match{query ? ` "${query.trim()}"` : ''}
          {onlyDownloaded ? ' among downloaded models' : ''}
          {modality !== 'all' ? ` in the ${modality} group` : ''}.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.family}>
              <div className="mb-1.5 flex items-center gap-2">
                <img
                  src={modelLogo(group.family)}
                  alt=""
                  className="size-4 shrink-0 object-contain"
                />
                <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">
                  {FAMILY_LABELS[group.family]}
                </span>
                <span className="text-muted-foreground/60 text-3xs">{group.models.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {group.models.map((def) => (
                  <ChatModelCard
                    key={def.id}
                    def={def}
                    recommended={chat.recommendedId === def.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-2xs leading-snug">
        Models in this library run fully on this device through llama.cpp — nothing leaves your
        machine. Downloaded models appear in the Ask AI picker with the parameters you set here.
        Vision-capable models answer text today; image input is coming. Cloud models added below
        are the optional, clearly marked exception.
      </p>
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
      <a
        href={HF_GGUF_MODELS_URL}
        target="_blank"
        rel="noreferrer"
        className="text-mint mt-1.5 inline-flex items-center gap-1 text-2xs font-medium underline-offset-2 hover:underline"
      >
        Browse trending GGUF models on Hugging Face
        <Icon name="open" size={11} />
      </a>
    </div>
  );
}

const cloudChip = (active: boolean) =>
  cn(
    'rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors',
    active
      ? 'border-border bg-primary/10 text-foreground'
      : 'border-border text-muted-foreground hover:bg-accent',
  );

/** Inline outcome of a connection or model test. */
function TestNote({ result }: { result: { ok: boolean; message?: string; unverified?: boolean } }) {
  if (!result.ok) return <p className="text-strawberry mt-1.5 text-2xs">{result.message}</p>;
  if (result.unverified) {
    return <p className="text-mango mt-1.5 text-2xs">{result.message ?? 'Saved without verification.'}</p>;
  }
  return <p className="text-mint mt-1.5 text-2xs">{result.message ?? 'Connection verified.'}</p>;
}

/**
 * The BYO-key connect form: pick a provider, fill the credential fields its
 * catalog entry declares (conditional fields follow the choices made, e.g.
 * Bedrock's keys-vs-profile switch), acknowledge the one-time off-device
 * consent, connect. Credentials go straight to the main process and the OS
 * keychain — they are never echoed back or kept in prefs.
 */
function CloudConnectForm() {
  const chat = useChat();
  const [providerId, setProviderId] = useState<CloudLlmProviderId>('anthropic');
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [consentNeeded, setConsentNeeded] = useState(false);
  const [consenting, setConsenting] = useState(false);

  const provider = getCloudProvider(providerId) as CloudProviderDef;

  useEffect(() => {
    window.prefs.get().then((p) => setConsentNeeded(!p.ai?.cloudConsentAt));
  }, []);

  const pickProvider = (id: CloudLlmProviderId) => {
    setProviderId(id);
    setError(null);
    setNote(null);
    // Choice fields start on their first option so conditionals resolve.
    const defaults: Record<string, string> = {};
    for (const f of getCloudProvider(id)?.fields ?? []) {
      if (f.choices) defaults[f.key] = f.choices[0];
    }
    setForm(defaults);
  };

  const visibleFields = provider.fields.filter(
    (f) => !f.showWhen || form[f.showWhen.key] === f.showWhen.value,
  );
  const complete = visibleFields.every((f) => f.optional || f.choices || form[f.key]?.trim());

  const doConnect = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await chat.connectCloudAccount(providerId, form);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNote(
      res.unverified
        ? 'Saved — the endpoint offered no way to verify the credentials. Use Test on a model to be sure.'
        : `${provider.label} connected. Add a model below to start chatting with it.`,
    );
    pickProvider(providerId); // clear the entered secrets
  };

  const connect = async () => {
    if (consentNeeded) {
      setConsenting(true);
      return;
    }
    await doConnect();
  };

  const acceptConsent = async () => {
    const p = await window.prefs.get();
    await window.prefs.set({
      ai: {
        enabled: p.ai?.enabled ?? false,
        activeProvider: p.ai?.activeProvider ?? 'embedded',
        ...p.ai,
        cloudConsentAt: Date.now(),
      },
    });
    setConsentNeeded(false);
    setConsenting(false);
    await doConnect();
  };

  const choiceLabels: Record<string, string> = { profile: 'AWS profile', keys: 'Access keys' };

  return (
    <div className="border-border rounded-lg border px-3 py-2.5">
      <div className="text-foreground text-sm">Connect a provider</div>
      <div className="text-muted-foreground mb-2 text-2xs">{provider.hint}</div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {CLOUD_PROVIDERS.map((p) => (
          <button key={p.id} onClick={() => pickProvider(p.id)} className={cloudChip(p.id === providerId)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visibleFields.map((field) =>
          field.choices ? (
            <div key={field.key} className="flex items-center gap-3">
              <span className="text-muted-foreground w-28 shrink-0 text-2xs">{field.label}</span>
              <div className="flex items-center gap-1.5">
                {field.choices.map((choice) => (
                  <button
                    key={choice}
                    onClick={() => setForm((f) => ({ ...f, [field.key]: choice }))}
                    className={cloudChip(form[field.key] === choice)}
                  >
                    {choiceLabels[choice] ?? choice}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <label key={field.key} className="flex items-center gap-3">
              <span className="text-muted-foreground w-28 shrink-0 text-2xs">
                {field.label}
                {field.optional ? ' (optional)' : ''}
              </span>
              <input
                type={field.secret ? 'password' : 'text'}
                value={form[field.key] ?? ''}
                onChange={(e) => {
                  setForm((f) => ({ ...f, [field.key]: e.target.value }));
                  setError(null);
                }}
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
                aria-label={`${provider.label} ${field.label}`}
                className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-mint/50 min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs outline-none"
              />
            </label>
          ),
        )}
      </div>

      {consenting ? (
        <div className="border-border bg-muted/40 mt-3 rounded-lg border px-3 py-2.5">
          <p className="text-foreground text-2xs leading-snug">
            Chat messages — including excerpts of files you @mention and files the Assistant's
            tools read — will be sent to {provider.label}. Indexing, semantic search, and
            embeddings never leave this device.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <Button size="sm" onClick={() => void acceptConsent()}>
              I understand, connect
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConsenting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" onClick={() => void connect()} disabled={!complete || busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      )}

      {error && <p className="text-strawberry mt-1.5 text-2xs">{error}</p>}
      {note && !error && <p className="text-mint mt-1.5 text-2xs">{note}</p>}
    </div>
  );
}

/** One cloud model under its account: always ready, testable, tunable. */
function CloudModelRow({ def }: { def: CloudModelDef }) {
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message?: string } | null>(null);

  const stored = chat.configs[def.id];
  const cfg = resolveLlmConfig(def.id, stored, CLOUD_CONFIG_LIMITS);
  const customized = !!stored && Object.keys(stored).length > 0;
  const providerSampling = usesProviderDefaultSampling(def.provider, def.remoteId);
  const L = CLOUD_CONFIG_LIMITS;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const result = await chat.testCloud(def.accountId, def.remoteId);
    setTesting(false);
    setTest(result.ok ? { ok: true, message: `${def.label} answered.` } : result);
  };

  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <img src={modelLogo(def.family)} alt={def.family} className="size-5 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm">{def.label}</span>
            {customized && (
              <span
                className="bg-grape/15 text-grape shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-medium"
                title="Custom parameters are set"
              >
                Customized
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 truncate font-mono text-2xs">{def.remoteId}</div>
        </div>

        {confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground text-2xs">Remove this model?</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setOpen(false);
                chat.removeCloudModel(def.id);
              }}
            >
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => void runTest()} disabled={testing}>
              {testing ? 'Testing…' : 'Test'}
            </Button>
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
              title="Remove this model"
              aria-label={`Remove ${def.label}`}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>

      {test && (
        <div className="px-3 pb-2">
          <TestNote result={test} />
        </div>
      )}

      {open && (
        <div className="border-border space-y-3 border-t px-3 py-3">
          {providerSampling ? (
            <p className="text-muted-foreground text-3xs">
              Claude models run on the provider's default sampling — temperature and top-p are
              not sent.
            </p>
          ) : (
            <>
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
            </>
          )}
          <ParamSlider
            label="Max answer"
            value={cfg.maxTokens}
            min={L.maxTokens.min}
            max={L.maxTokens.max}
            step={L.maxTokens.step}
            display={`${cfg.maxTokens} tok`}
            onChange={(v) => chat.setConfig(def.id, { maxTokens: v })}
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
          {customized && (
            <div className="flex justify-end">
              <button
                onClick={() => chat.setConfig(def.id, null)}
                className="text-muted-foreground hover:text-foreground text-2xs underline-offset-2 hover:underline"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Add a model under a connected account: starter chips + free-text id. */
function AddCloudModelRow({
  account,
  provider,
}: {
  account: AccountRecord;
  provider: CloudLlmProviderId;
}) {
  const chat = useChat();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const existing = new Set(
    chat.cloudModels.filter((m) => m.accountId === account.id).map((m) => m.remoteId),
  );
  const suggestions = CLOUD_MODEL_SUGGESTIONS[provider].filter((s) => !existing.has(s.remoteId));

  const add = async (remoteId: string, label?: string) => {
    const problem = await chat.addCloudModel(account.id, provider, remoteId, label);
    setError(problem);
    if (!problem) setValue('');
  };

  return (
    <div>
      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.remoteId}
              onClick={() => void add(s.remoteId, s.label)}
              className={cloudChip(false)}
              title={s.remoteId}
            >
              + {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && void add(value)}
          placeholder={CLOUD_MODEL_PLACEHOLDER[provider]}
          aria-label="Add a cloud model by id"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-mint/50 min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs outline-none"
        />
        <Button size="sm" variant="secondary" onClick={() => void add(value)} disabled={!value.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="text-strawberry mt-1.5 text-2xs">{error}</p>}
    </div>
  );
}

/** One connected account: header with Test/Disconnect, its models, add-model. */
function CloudAccountCard({ account }: { account: AccountRecord }) {
  const chat = useChat();
  const provider = cloudProviderOfAccount(account.provider);
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message?: string; unverified?: boolean } | null>(
    null,
  );
  if (!provider) return null;
  const def = getCloudProvider(provider) as CloudProviderDef;
  const models = chat.cloudModels.filter((m) => m.accountId === account.id);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const result = await chat.testCloud(account.id);
    setTesting(false);
    setTest(result);
  };

  return (
    <div className="border-border rounded-lg border px-3 py-2.5">
      <div className="flex items-center gap-3">
        <img src={modelLogo(def.family)} alt={def.label} className="size-5 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-sm">{account.label}</div>
          <div className="text-muted-foreground mt-0.5 text-2xs">
            {def.label} · {models.length ? `${models.length} model${models.length > 1 ? 's' : ''}` : 'no models yet'}
          </div>
        </div>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground text-2xs">Remove key and models?</span>
            <Button size="sm" variant="secondary" onClick={() => void chat.disconnectCloudAccount(account.id)}>
              Disconnect
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => void runTest()} disabled={testing}>
              {testing ? 'Testing…' : 'Test'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          </div>
        )}
      </div>
      {test && <TestNote result={test} />}

      <div className="mt-3 space-y-2">
        {models.map((m) => (
          <CloudModelRow key={m.id} def={m} />
        ))}
        <AddCloudModelRow account={account} provider={provider} />
      </div>
    </div>
  );
}

/**
 * "Skip file types" — removable extension chips plus an inline input. Enter,
 * comma, or space commits what's typed; backspace on an empty input removes
 * the last chip. Normalization (lowercase, no dot, dedupe) happens in the main
 * process, which also prunes already-indexed files of the excluded types.
 */
function SkipTypesRow() {
  const indexing = useIndexing();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parts = draft.split(/[\s,]+/).filter(Boolean);
    if (parts.length) {
      void indexing.setExcludeExtensions([...indexing.excludeExtensions, ...parts]);
    }
    setDraft('');
  };

  return (
    <div className="border-border rounded-lg border px-3 py-2.5">
      <div className="text-foreground text-sm">Skip file types</div>
      <div className="text-muted-foreground mb-2 text-2xs">
        The index never reads these extensions; existing entries are removed
      </div>
      <div className="border-border bg-card flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5">
        {indexing.excludeExtensions.map((ext) => (
          <span
            key={ext}
            className="bg-muted text-foreground flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-2xs"
          >
            .{ext}
            <button
              onClick={() =>
                void indexing.setExcludeExtensions(
                  indexing.excludeExtensions.filter((x) => x !== ext),
                )
              }
              aria-label={`Index .${ext} files again`}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !draft && indexing.excludeExtensions.length) {
              void indexing.setExcludeExtensions(indexing.excludeExtensions.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={indexing.excludeExtensions.length ? '' : 'e.g. log, mp3, svg'}
          aria-label="Add a file type to skip"
          className="text-foreground placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}

/**
 * One entry in the "Hide from AI" list: icon + name with its location beneath,
 * and a remove affordance revealed on hover. The folder-vs-file icon comes from
 * a one-shot stat; a path that no longer exists gets a generic file icon.
 */
function HiddenPathRow({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [isDir, setIsDir] = useState(false);
  useEffect(() => {
    let alive = true;
    window.fsapi.getInfo(path).then((r) => {
      if (alive && r.ok) setIsDir(r.data.isDirectory);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  const sepIx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = sepIx >= 0 ? path.slice(sepIx + 1) : path;
  const parent = sepIx > 0 ? path.slice(0, sepIx) : '';

  return (
    <div className="group border-border hover:bg-accent/50 flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors">
      <Icon name={isDir ? 'folder' : 'file'} size={15} className="text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-sm">{name}</div>
        {parent && (
          <div className="text-muted-foreground truncate font-mono text-3xs">{parent}</div>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label={`Stop hiding ${name} from AI`}
        title="Show to AI again"
        className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const ai = useAi();
  const chat = useChat();
  const indexing = useIndexing();
  const { notifyError } = useToast();
  const [tab, setTab] = useState<SettingsTab>('general');
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

  const disabled = !ai.enabled;

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
        indexSubtitle: ix.errors > 0 ? `${ix.errors} file${ix.errors !== 1 ? 's' : ''} failed` : null,
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

  return (
    // `scrollbar-gutter: stable` reserves the scrollbar's width, so switching
    // between a short and a tall tab doesn't shove the centered column sideways
    // when the scrollbar appears/disappears.
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <header className="mb-6">
          <h1 className="text-foreground mb-1 text-xl font-medium">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure FilDOS. AI features run on your machine by default.
          </p>
        </header>

        {/* Page tabs — model management is its own page, it's the biggest. */}
        <nav
          className="border-border mb-6 flex w-full items-center gap-6 border-b"
          role="tablist"
          aria-label="Settings sections"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm transition-colors',
                tab === t.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-5">
          {tab === 'general' && (
            <Section icon="sun" title="Appearance" subtitle="Theme and interface feedback">
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => chooseTheme(t.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-colors',
                      theme === t.value
                        ? 'border-border bg-primary/10 text-foreground'
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
          )}

          {tab === 'search' && (
            <>
              {/* Embeddings */}
              <Section
                icon="sparkles"
                accent="mint"
                title="Embeddings"
                subtitle="On-device models that power semantic search"
                action={<Toggle checked={ai.enabled} onChange={ai.setEnabled} label="Enable embeddings" />}
              >
                {/* Models download automatically once enabled — status only. */}
                <div className={cn('flex flex-col gap-1.5', disabled && 'pointer-events-none opacity-50')}>
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
                    These download automatically when embeddings are enabled. The reranker is optional
                    and sharpens search precision.
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
                      <span
                        className="text-muted-foreground shrink-0 text-2xs"
                        title="Files that couldn't be indexed — see the app log for per-file reasons. They retry on the next scan."
                      >
                        {ix.errors} failed
                      </span>
                    )}
                  </div>
                  {indexRunning && (
                    <>
                      <div className="bg-muted mt-2 h-1 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-foreground/50 h-full rounded-full transition-[width] duration-300"
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

                {/* Ambient mode */}
                <div className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-foreground text-sm">Continue in the background</div>
                    <div className="text-muted-foreground text-2xs">
                      Keep indexing from the menu bar / tray after the last window closes
                    </div>
                  </div>
                  <Toggle
                    checked={indexing.ambient}
                    onChange={(v) => void indexing.setAmbient(v)}
                    label="Continue indexing in the background"
                  />
                </div>

                {/* Extension exclusions */}
                <SkipTypesRow />

                <button
                  onClick={() => void indexing.clear()}
                  className="text-muted-foreground hover:text-foreground text-2xs underline-offset-2 hover:underline"
                >
                  Clear index
                </button>
              </Section>

              {/* Knowledge graph (the Canvas view) */}
              <Section
                icon="brain"
                accent="mint"
                title="Canvas"
                subtitle="The knowledge graph behind the Canvas view — connections by meaning, entities and time"
                className={cn(!ai.enabled && 'pointer-events-none opacity-50')}
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      window.graph.build().then((r) => {
                        if (!r.ok) notifyError(r.error);
                      })
                    }
                    title="Recompute similarity edges and entities from scratch"
                  >
                    Rebuild
                  </Button>
                }
              >
                <div className="flex flex-col gap-1.5">
                  <ModelRow
                    id={NER_MODEL_ID}
                    status={ai.statuses[NER_MODEL_ID]}
                    onDownload={() =>
                      ai.downloadModel(NER_MODEL_ID).then((r) => {
                        if (!r.ok) notifyError(r.error);
                        ai.refreshStatuses();
                      })
                    }
                  />
                  <p className="text-muted-foreground mt-1 text-2xs leading-snug">
                    Optional. Without it the Canvas still maps similarity, tags and work sessions;
                    with it, people, places and organizations appear as their own nodes.
                  </p>
                </div>
              </Section>
            </>
          )}

          {tab === 'assistant' && (
            <>
              <Section
                icon="sparkles"
                accent="mint"
                title="Ask AI"
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

                <ChatModelBrowser />
              </Section>

              <Section
                icon="download"
                title="Add a model from the internet"
                subtitle="Bring any GGUF chat model — Hugging Face repo or direct link"
              >
                <AddModelRow />
              </Section>

              <Section
                icon="cloud"
                title="Cloud models (optional)"
                subtitle="Bring your own API key — chat only; indexing, search and embeddings always stay on this device"
              >
                {chat.cloudAccounts.map((account) => (
                  <CloudAccountCard key={account.id} account={account} />
                ))}
                <CloudConnectForm />
                <p className="text-muted-foreground text-2xs leading-snug">
                  Keys are stored encrypted in your OS keychain and only ever sent to the provider
                  you chose. While a cloud model is selected, the chat shows where your messages go.
                </p>
              </Section>
            </>
          )}

          {tab === 'privacy' && (
            <Section
              icon="eye-off"
              title="Hide from AI"
              subtitle="Files and folders AI features never read, index, or search"
              action={
                <Button size="sm" variant="secondary" onClick={() => void indexing.pickExcludes()}>
                  <Icon name="plus" size={13} /> Add
                </Button>
              }
            >
              {indexing.excludes.length === 0 ? (
                <div className="border-border flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
                  <Icon name="eye-off" size={18} className="text-muted-foreground" />
                  <p className="text-muted-foreground max-w-sm text-2xs leading-snug">
                    Nothing is hidden. Right-click any file or folder and choose{' '}
                    <span className="text-foreground">Hide from AI</span>, or add one here.
                    Hidden items are removed from the index immediately and never re-indexed.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    {indexing.excludes.map((path) => (
                      <HiddenPathRow
                        key={path}
                        path={path}
                        onRemove={() => void indexing.removeExclude(path)}
                      />
                    ))}
                  </div>
                  <p className="text-muted-foreground text-2xs leading-snug">
                    Hidden items are removed from the index immediately and never re-indexed —
                    semantic search and Ask AI can't see them.
                  </p>
                </>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
