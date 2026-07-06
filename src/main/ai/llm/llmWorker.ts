/**
 * On-device chat LLM worker. Runs in an Electron `utilityProcess` (like the
 * embedding modelWorker) so model download, load and token generation never
 * block the main process.
 *
 * The engine is node-llama-cpp — llama.cpp with prebuilt platform binaries
 * (Metal on Apple Silicon), so chat runs at usable speed with nothing for the
 * user to install. GGUF weights download straight from Hugging Face into
 * `FILDOS_LLM_DIR/<catalogId>/` and everything runs offline afterwards.
 *
 * RAM discipline: exactly one model is resident at a time (switching models
 * disposes the previous one), one chat runs at a time (requests are chained),
 * and each request gets a fresh context so conversations replay their own
 * history and can't leak into each other.
 *
 * Protocol over `process.parentPort`:
 *   in:  { id, type: 'models' }
 *        { id, type: 'download', modelId }
 *        { id, type: 'chat', modelId, requestId, system, history, prompt }
 *        { id, type: 'stopChat', requestId }
 *   out: { id, ok: true, data } | { id, ok: false, error: { code, message } }
 *        { type: 'progress', status: LlmModelStatus }      // during download
 *        { type: 'chunk', requestId, text }                // during generation
 *
 * node-llama-cpp is ESM-only, so this CJS bundle pulls it in with a dynamic
 * import (same pattern as @huggingface/transformers in modelWorker.ts).
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import type { ChatHistoryItem, Llama, LlamaModel } from 'node-llama-cpp';
import type * as LlamaCpp from 'node-llama-cpp';
import type { ChatTurn, LlmModelStatus } from '@shared/types';
import {
  getLlmModelDef,
  LLM_MODELS,
  resolveLlmConfig,
  type LlmModelConfig,
  type LlmSystemSpecs,
} from '@shared/llmModels';

const MODELS_DIR = process.env.FILDOS_LLM_DIR ?? join(__dirname, 'llm-models');

function post(message: unknown): void {
  process.parentPort.postMessage(message);
}

function emit(status: LlmModelStatus): void {
  post({ type: 'progress', status });
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

/** Where one catalog model's GGUF lands (its own folder, so status checks are cheap). */
function modelDir(modelId: string): string {
  return join(MODELS_DIR, modelId);
}

/** The downloaded GGUF for a model, or null when absent. First part of a split file wins. */
function ggufPath(modelId: string): string | null {
  const dir = modelDir(modelId);
  try {
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.gguf'))
      .sort();
    return files.length ? join(dir, files[0]) : null;
  } catch {
    return null;
  }
}

const downloading = new Map<string, number>(); // modelId -> progress [0,1]

function statusFor(modelId: string): LlmModelStatus {
  const progress = downloading.get(modelId);
  if (progress !== undefined) return { modelId, state: 'downloading', progress };
  return { modelId, state: ggufPath(modelId) ? 'ready' : 'absent' };
}

// ---------------------------------------------------------------------------
// Engine + model lifecycle
// ---------------------------------------------------------------------------

type Lib = typeof LlamaCpp;

let libPromise: Promise<{ lib: Lib; llama: Llama }> | null = null;

function engine() {
  if (!libPromise) {
    libPromise = import('node-llama-cpp').then(async (lib) => ({
      lib,
      llama: await lib.getLlama(),
    }));
  }
  return libPromise;
}

/** The one resident model. Switching ids disposes the old weights first. */
let loaded: { modelId: string; model: LlamaModel } | null = null;

async function loadModel(modelId: string): Promise<LlamaModel> {
  if (loaded?.modelId === modelId) return loaded.model;
  const path = ggufPath(modelId);
  if (!path) fail('ENOENT', 'That model has not been downloaded yet.');
  if (loaded) {
    await loaded.model.dispose();
    loaded = null;
  }
  const { llama } = await engine();
  const model = await llama.loadModel({ modelPath: path });
  loaded = { modelId, model };
  return model;
}

/** Probe what this machine can run (GPU backend + memory), for the model picker. */
async function systemSpecs(): Promise<LlmSystemSpecs> {
  const base = {
    ramMb: Math.round(totalmem() / 1_048_576),
    cpus: cpus().length,
    arch: process.arch,
  };
  try {
    const { llama } = await engine();
    const vram = await llama.getVramState();
    return {
      ...base,
      gpu: llama.gpu ? String(llama.gpu) : null,
      vramMb: Math.round(vram.total / 1_048_576),
    };
  } catch {
    // Engine failed to load (unsupported platform) — report CPU-only.
    return { ...base, gpu: null, vramMb: 0 };
  }
}

/** Delete a downloaded model's weights (unloading it first if resident). */
async function removeModel(modelId: string): Promise<void> {
  if (!modelId) fail('EINVAL', 'No model id given.');
  if (downloads.has(modelId)) fail('EBUSY', 'That model is still downloading.');
  if (loaded?.modelId === modelId) {
    await loaded.model.dispose();
    loaded = null;
  }
  rmSync(modelDir(modelId), { recursive: true, force: true });
  emit({ modelId, state: 'absent' });
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

const downloads = new Map<string, Promise<void>>();

/** Download a model's GGUF. `uri` overrides the built-in catalog (custom models). */
function download(modelId: string, uri?: string): Promise<void> {
  const existing = downloads.get(modelId);
  if (existing) return existing;
  if (ggufPath(modelId)) return Promise.resolve();

  const modelUri = uri ?? getLlmModelDef(modelId)?.uri;
  if (!modelUri) fail('EINVAL', `Unknown chat model: ${modelId}`);

  const promise = (async () => {
    const { lib } = await engine();
    const dir = modelDir(modelId);
    mkdirSync(dir, { recursive: true });
    downloading.set(modelId, 0);
    emit({ modelId, state: 'downloading', progress: 0 });
    const downloader = await lib.createModelDownloader({
      modelUri,
      dirPath: dir,
      showCliProgress: false,
      onProgress: ({ totalSize, downloadedSize }) => {
        const progress = totalSize ? downloadedSize / totalSize : 0;
        // Throttle to whole-percent steps so IPC isn't flooded.
        const last = downloading.get(modelId) ?? 0;
        if (progress - last >= 0.01 || progress >= 1) {
          downloading.set(modelId, progress);
          emit({ modelId, state: 'downloading', progress });
        }
      },
    });
    await downloader.download();
    downloading.delete(modelId);
    emit({ modelId, state: 'ready' });
  })().catch((err) => {
    downloading.delete(modelId);
    emit({
      modelId,
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  });

  downloads.set(modelId, promise);
  return promise.finally(() => downloads.delete(modelId));
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const aborts = new Map<string, AbortController>();

/** Chats run one at a time — small machines can't juggle parallel generations. */
let chatChain: Promise<unknown> = Promise.resolve();

interface ChatArgs {
  modelId: string;
  requestId: string;
  system: string;
  history: ChatTurn[];
  prompt: string;
  /** Resolved generation settings (defaults applied by the caller). */
  config?: Partial<LlmModelConfig>;
}

async function runChat({ modelId, requestId, system, history, prompt, config }: ChatArgs): Promise<string> {
  const abort = new AbortController();
  aborts.set(requestId, abort);
  try {
    // Re-resolve here too so a stale caller can never push wild values in.
    // (No catalog check — custom models aren't in it; loadModel verifies the
    // weights exist on disk, which is the check that matters.)
    const cfg = resolveLlmConfig(modelId, config);
    const { lib } = await engine();
    const model = await loadModel(modelId);
    const context = await model.createContext({ contextSize: { max: cfg.contextSize } });
    try {
      const session = new lib.LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: system,
      });
      if (history.length) {
        session.setChatHistory([
          { type: 'system', text: system },
          ...history.map((t): ChatHistoryItem =>
            t.role === 'user'
              ? { type: 'user', text: t.content }
              : { type: 'model', response: [t.content] },
          ),
        ]);
      }
      return await session.prompt(prompt, {
        temperature: cfg.temperature,
        topP: cfg.topP,
        maxTokens: cfg.maxTokens,
        signal: abort.signal,
        // On stop, end generation gracefully and keep the partial answer.
        stopOnAbortSignal: true,
        onTextChunk: (text) => post({ type: 'chunk', requestId, text }),
      });
    } finally {
      await context.dispose();
    }
  } finally {
    aborts.delete(requestId);
  }
}

// ---------------------------------------------------------------------------
// Message loop
// ---------------------------------------------------------------------------

interface InMessage {
  id: number;
  type: 'models' | 'download' | 'remove' | 'specs' | 'chat' | 'stopChat';
  modelId?: string;
  /** All ids to report status for — built-ins plus the user's custom models. */
  modelIds?: string[];
  /** Download source for models outside the built-in catalog. */
  uri?: string;
  requestId?: string;
  system?: string;
  history?: ChatTurn[];
  prompt?: string;
  config?: Partial<LlmModelConfig>;
}

async function handle(msg: InMessage): Promise<unknown> {
  switch (msg.type) {
    case 'models':
      return (msg.modelIds ?? LLM_MODELS.map((m) => m.id)).map(statusFor);
    case 'download':
      await download(msg.modelId ?? '', msg.uri);
      return undefined;
    case 'remove':
      await removeModel(msg.modelId ?? '');
      return undefined;
    case 'specs':
      return systemSpecs();
    case 'chat': {
      const args: ChatArgs = {
        modelId: msg.modelId ?? '',
        requestId: msg.requestId ?? '',
        system: msg.system ?? '',
        history: msg.history ?? [],
        prompt: msg.prompt ?? '',
        config: msg.config,
      };
      const run = chatChain.catch(() => {}).then(() => runChat(args));
      chatChain = run;
      return run;
    }
    case 'stopChat':
      aborts.get(msg.requestId ?? '')?.abort();
      return undefined;
    default:
      fail('EINVAL', `Unknown LLM request: ${(msg as { type: string }).type}`);
  }
}

process.parentPort.on('message', (e: { data: InMessage }) => {
  const { id } = e.data;
  handle(e.data)
    .then((data) => post({ id, ok: true, data }))
    .catch((err: NodeJS.ErrnoException) =>
      post({ id, ok: false, error: { code: err.code ?? 'ELLMFAILED', message: err.message } }),
    );
});
