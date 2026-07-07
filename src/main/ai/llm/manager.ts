import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { ChatTurn, LlmModelStatus } from '@shared/types';
import type { LlmModelConfig, LlmSystemSpecs } from '@shared/llmModels';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

type WorkerReply =
  | { type: 'progress'; status: LlmModelStatus }
  | { type: 'chunk'; requestId: string; text: string }
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: { code?: string; message?: string } };

/**
 * Bridge to the chat LLM worker (`llmWorker.js`, built beside this file into
 * out/main). Lazily forks the utilityProcess and turns each call into a
 * request/response message, mirroring `providers/embedded.ts` — plus a second
 * unsolicited stream (`onChunk`) for tokens as they generate.
 */
export class LlmManager {
  private worker: UtilityProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly progressListeners = new Set<(status: LlmModelStatus) => void>();
  private readonly chunkListeners = new Set<(requestId: string, text: string) => void>();

  onProgress(cb: (status: LlmModelStatus) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  onChunk(cb: (requestId: string, text: string) => void): () => void {
    this.chunkListeners.add(cb);
    return () => this.chunkListeners.delete(cb);
  }

  private ensureWorker(): UtilityProcess {
    if (this.worker) return this.worker;
    const worker = utilityProcess.fork(join(__dirname, 'llmWorker.js'), [], {
      serviceName: 'fildos-llm',
    });
    worker.on('message', (msg: WorkerReply) => this.onMessage(msg));
    worker.on('exit', () => {
      this.worker = null;
      for (const p of this.pending.values()) p.reject(new Error('The chat model stopped.'));
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }

  private onMessage(msg: WorkerReply): void {
    if ('type' in msg) {
      if (msg.type === 'progress') {
        for (const listener of this.progressListeners) listener(msg.status);
      } else if (msg.type === 'chunk') {
        for (const listener of this.chunkListeners) listener(msg.requestId, msg.text);
      }
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) {
      p.resolve(msg.data);
    } else {
      const err = new Error(msg.error?.message ?? 'The chat model failed.') as NodeJS.ErrnoException;
      err.code = msg.error?.code ?? 'ELLMFAILED';
      p.reject(err);
    }
  }

  private request<T>(type: string, payload?: Record<string, unknown>): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, type, ...payload });
    });
  }

  /** Status for the given ids (built-ins + custom); defaults to the catalog. */
  models(modelIds?: string[]): Promise<LlmModelStatus[]> {
    return this.request<LlmModelStatus[]>('models', { modelIds });
  }

  /** Download a model; `uri` overrides the catalog for custom models. */
  async download(modelId: string, uri?: string): Promise<void> {
    await this.request<void>('download', { modelId, uri });
  }

  /** Delete a downloaded model's weights from disk. */
  async remove(modelId: string): Promise<void> {
    await this.request<void>('remove', { modelId });
  }

  /** GPU backend + memory this machine offers (probed by the worker). */
  specs(): Promise<LlmSystemSpecs> {
    return this.request<LlmSystemSpecs>('specs');
  }

  /** Run one generation; tokens stream via `onChunk`, resolves with the full text. */
  chat(args: {
    modelId: string;
    requestId: string;
    system: string;
    history: ChatTurn[];
    prompt: string;
    config?: Partial<LlmModelConfig>;
  }): Promise<string> {
    return this.request<string>('chat', { ...args });
  }

  async stopChat(requestId: string): Promise<void> {
    await this.request<void>('stopChat', { requestId });
  }
}
