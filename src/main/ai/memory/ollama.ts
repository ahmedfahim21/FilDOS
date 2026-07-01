import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import type { OllamaProgress, OllamaStatus } from '@shared/types';

/**
 * Best-effort integration with a *local* Ollama, used when the user picks it as
 * supermemory's LLM. FilDOS does not auto-start or auto-download anything — it
 * only reports whether Ollama is installed/running (+ which models are pulled)
 * and, on explicit request, launches `ollama serve`. The base URL is handled
 * automatically (localhost) unless the user overrides it.
 *
 * All OS/network touchpoints are injected so the logic unit-tests without a real
 * Ollama or network.
 */

const DEFAULT_URL = 'http://localhost:11434';

export interface OllamaDeps {
  fetch?: typeof fetch;
  /** Absolute path to the `ollama` binary, or null if not found. */
  resolveBinary?: () => string | null;
  /** Launch `ollama serve` detached. */
  launch?: (binary: string) => void;
  /** Sleep between start polls (injected as a no-op in tests). */
  delay?: (ms: number) => Promise<void>;
  /** Override the base URL (defaults to localhost:11434). */
  baseUrl?: string;
}

/** Is Ollama installed / running, and which models are pulled? */
export async function ollamaStatus(deps: OllamaDeps = {}): Promise<OllamaStatus> {
  const fetchFn = deps.fetch ?? fetch;
  const url = (deps.baseUrl ?? DEFAULT_URL).replace(/\/+$/, '');

  let running = false;
  let models: string[] = [];
  try {
    const res = await fetchFn(`${url}/api/tags`, { method: 'GET' });
    if (res.ok) {
      running = true;
      const data = (await res.json()) as { models?: { name?: string }[] };
      models = (data.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n));
    }
  } catch {
    running = false;
  }

  const resolveBinary = deps.resolveBinary ?? resolveOllamaBinary;
  const installed = running || resolveBinary() !== null;
  return { installed, running, models };
}

/** Launch `ollama serve` (explicit user action) and wait for it to come up. */
export async function startOllama(deps: OllamaDeps = {}): Promise<OllamaStatus> {
  const resolveBinary = deps.resolveBinary ?? resolveOllamaBinary;
  const binary = resolveBinary();
  if (!binary) {
    throw Object.assign(new Error('Ollama is not installed.'), { code: 'ENOENT' });
  }
  (deps.launch ?? launchOllama)(binary);

  const delay = deps.delay ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt < 20; attempt++) {
    const status = await ollamaStatus(deps);
    if (status.running) return status;
    await delay(500);
  }
  return ollamaStatus(deps);
}

/**
 * Pull a model, streaming `/api/pull`'s NDJSON progress to `onProgress`. Each
 * line is `{ status, completed?, total? }`; we add a 0–100 `percent` when the
 * size is known and a terminal `done`/`error`.
 */
export async function pullOllamaModel(
  model: string,
  onProgress: (progress: OllamaProgress) => void,
  deps: OllamaDeps = {},
): Promise<void> {
  const fetchFn = deps.fetch ?? fetch;
  const url = (deps.baseUrl ?? DEFAULT_URL).replace(/\/+$/, '');

  const res = await fetchFn(`${url}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`Ollama pull failed (${res.status})${detail ? `: ${detail}` : ''}`), {
      code: 'EUNKNOWN',
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onProgress(parseProgress(model, line));
    }
  }
  onProgress({ model, status: 'success', percent: 100, done: true });
}

function parseProgress(model: string, line: string): OllamaProgress {
  try {
    const msg = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
    if (msg.error) return { model, status: 'error', error: msg.error, done: true };
    const percent =
      msg.total && msg.completed !== undefined
        ? Math.round((msg.completed / msg.total) * 100)
        : undefined;
    return { model, status: msg.status ?? 'downloading', completed: msg.completed, total: msg.total, percent };
  } catch {
    return { model, status: line };
  }
}

/** Find the `ollama` binary on PATH or in common install locations. */
export function resolveOllamaBinary(): string | null {
  const candidates: string[] = [];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, 'ollama'));
  }
  candidates.push('/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', '/usr/bin/ollama');
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Detached `ollama serve` so it outlives the request (the user owns it). */
function launchOllama(binary: string): void {
  const child = spawn(binary, ['serve'], { detached: true, stdio: 'ignore' });
  child.unref();
}
