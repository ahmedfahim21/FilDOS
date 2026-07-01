import { useEffect, useState } from 'react';
import type { SupermemoryLlmInput, SupermemoryLlmProvider } from '@shared/types';
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

/**
 * Configure the language model supermemory uses (mandatory — the daemon won't
 * boot without one). Local Ollama needs no key; cloud providers take a key that
 * is sent once to the main process, encrypted, and never read back (the form
 * only learns whether a key is stored). Saving restarts the daemon if active.
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

  useEffect(() => {
    window.memory.getLlm().then((r) => {
      if (!r.ok) return;
      setProvider(r.data.config.provider);
      setModel(r.data.config.model ?? '');
      setBaseUrl(r.data.config.baseUrl ?? '');
      setHasKey(r.data.hasKey);
    });
  }, []);

  const isLocal = provider === 'ollama';
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
        <label className="flex flex-col gap-1">
          <span className="text-foreground text-xs">Server URL</span>
          <input
            className={inputCls}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1"
          />
        </label>
      ) : (
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
      )}

      <label className="flex flex-col gap-1">
        <span className="text-foreground text-xs">Model {isLocal ? '' : '(optional)'}</span>
        <input
          className={inputCls}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={isLocal ? 'e.g. llama3.2:1b' : 'provider default'}
        />
      </label>

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
        The key is encrypted on this device and used only to run supermemory's local daemon; it never
        leaves your machine except to the provider you choose.
      </p>
    </div>
  );
}
