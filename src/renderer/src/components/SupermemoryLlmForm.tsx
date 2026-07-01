import { useCallback, useEffect, useState } from 'react';
import type {
  OllamaProgress,
  OllamaStatus,
  SupermemoryLlmInput,
  SupermemoryLlmProvider,
} from '@shared/types';
import { useToast } from '@/state/toast';

const PROVIDERS: { id: SupermemoryLlmProvider; label: string }[] = [
  { id: 'ollama', label: 'Local (Ollama)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'groq', label: 'Groq' },
];

const inputCls =
  'border-border bg-card text-foreground w-full rounded-lg border px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60';
const btnCls =
  'border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50';

/**
 * Configure the language model supermemory uses (mandatory — the daemon won't
 * boot without one). Local Ollama needs no key: FilDOS reports its status,
 * offers to start it (never auto-starts), lists pulled models in a dropdown, and
 * can pull a model with live progress; the URL is handled automatically unless
 * overridden. Cloud providers take a key that's sent once, encrypted, and never
 * read back.
 */
export function SupermemoryLlmForm() {
  const { notifyError } = useToast();
  const [provider, setProvider] = useState<SupermemoryLlmProvider>('ollama');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  // Ollama-specific state.
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [pullName, setPullName] = useState('');
  const [pull, setPull] = useState<OllamaProgress | null>(null);

  const isLocal = provider === 'ollama';

  useEffect(() => {
    window.memory.getLlm().then((r) => {
      if (!r.ok) return;
      setProvider(r.data.config.provider);
      setModel(r.data.config.model ?? '');
      setBaseUrl(r.data.config.baseUrl ?? '');
      setHasKey(r.data.hasKey);
    });
  }, []);

  const refreshOllama = useCallback(async () => {
    const r = await window.memory.ollamaStatus();
    if (r.ok) setOllama(r.data);
  }, []);

  useEffect(() => {
    if (isLocal) refreshOllama();
  }, [isLocal, refreshOllama]);

  // Live pull progress; refresh the model list when a pull finishes.
  useEffect(
    () =>
      window.memory.onOllamaProgress((p) => {
        setPull(p);
        if (p.done) {
          if (p.error) notifyError({ code: 'EUNKNOWN', message: `Pull failed: ${p.error}` });
          else if (p.model) setModel(p.model);
          refreshOllama();
          setTimeout(() => setPull(null), 1500);
        }
      }),
    [refreshOllama, notifyError],
  );

  const startOllama = async () => {
    setStarting(true);
    const r = await window.memory.ollamaStart();
    setStarting(false);
    if (r.ok) setOllama(r.data);
    else notifyError(r.error);
  };

  const doPull = async () => {
    const name = pullName.trim();
    if (!name) return;
    setPull({ model: name, status: 'starting' });
    const r = await window.memory.ollamaPull(name);
    if (!r.ok) {
      notifyError(r.error);
      setPull(null);
    } else {
      setPullName('');
    }
  };

  const needsKey = !isLocal && !hasKey && !apiKey;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const input: SupermemoryLlmInput = {
      provider,
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    };
    if (apiKey.trim()) input.apiKey = apiKey.trim();
    const res = await window.memory.setLlm(input);
    setSaving(false);
    if (!res.ok) {
      notifyError(res.error);
      return;
    }
    if (apiKey.trim()) setHasKey(true);
    setApiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const pulling = pull !== null && !pull.done;

  return (
    <div className="border-border mt-2 flex flex-col gap-2.5 rounded-lg border border-dashed p-3">
      <div className="text-muted-foreground text-[11px] tracking-[0.06em] uppercase">Language model</div>

      <label className="flex flex-col gap-1">
        <span className="text-foreground text-xs">Provider</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as SupermemoryLlmProvider)}
          className={inputCls}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {isLocal ? (
        <>
          {/* Status + start */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs">
              <span
                className={
                  ollama?.running
                    ? 'text-emerald-500'
                    : ollama?.installed
                      ? 'text-amber-500'
                      : 'text-muted-foreground'
                }
              >
                ●
              </span>{' '}
              <span className="text-muted-foreground">
                {!ollama
                  ? 'Checking Ollama…'
                  : ollama.running
                    ? `Ollama running · ${ollama.models.length} model${ollama.models.length === 1 ? '' : 's'}`
                    : ollama.installed
                      ? 'Ollama installed but not running'
                      : 'Ollama not installed'}
              </span>
            </span>
            {ollama && !ollama.running && ollama.installed && (
              <button onClick={startOllama} disabled={starting} className={btnCls}>
                {starting ? 'Starting…' : 'Start Ollama'}
              </button>
            )}
            {ollama && !ollama.installed && (
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                className={btnCls}
              >
                Install Ollama
              </a>
            )}
          </div>

          {/* Model dropdown from installed models */}
          <label className="flex flex-col gap-1">
            <span className="text-foreground text-xs">Model</span>
            {ollama?.running && ollama.models.length > 0 ? (
              <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
                {!ollama.models.includes(model) && <option value="">Select a model…</option>}
                {ollama.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputCls}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. llama3.2:1b"
              />
            )}
          </label>

          {/* Pull a model, with live download progress */}
          {ollama?.running && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={pullName}
                  onChange={(e) => setPullName(e.target.value)}
                  placeholder="Pull a model, e.g. qwen2.5:0.5b"
                  disabled={pulling}
                />
                <button onClick={doPull} disabled={pulling || !pullName.trim()} className={btnCls}>
                  {pulling ? 'Pulling…' : 'Pull'}
                </button>
              </div>
              {pull && (
                <div className="flex flex-col gap-1">
                  <div className="bg-accent h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-[width]"
                      style={{ width: `${pull.percent ?? (pull.done ? 100 : 5)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {pull.model}: {pull.status}
                    {pull.percent !== undefined ? ` · ${pull.percent}%` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* URL handled automatically; override only if asked. */}
          <button
            onClick={() => setShowUrl((v) => !v)}
            className="text-muted-foreground self-start text-[11px] underline-offset-2 hover:underline"
          >
            {showUrl ? 'Hide' : 'Advanced: set server URL'}
          </button>
          {showUrl && (
            <input
              className={inputCls}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
            />
          )}
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-foreground text-xs">API key</span>
            <input
              type="password"
              className={inputCls}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? '•••••••• (stored — leave blank to keep)' : 'Paste your key'}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-foreground text-xs">Model (optional)</span>
            <input
              className={inputCls}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider default"
            />
          </label>
        </>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <button
          onClick={save}
          disabled={saving || needsKey}
          className="border-primary bg-primary/10 text-foreground hover:bg-primary/20 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & apply'}
        </button>
        {saved && <span className="text-muted-foreground text-[11px]">Saved — daemon restarting.</span>}
        {needsKey && <span className="text-muted-foreground text-[11px]">A key is required.</span>}
      </div>
      <p className="text-muted-foreground text-[11px] leading-snug">
        {isLocal
          ? 'Runs entirely on your machine via Ollama — nothing leaves your computer.'
          : 'The key is encrypted on this device and used only to run supermemory locally; it goes only to the provider you choose.'}
      </p>
    </div>
  );
}
