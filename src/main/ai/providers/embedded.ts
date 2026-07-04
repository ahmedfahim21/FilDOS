import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { AiModelStatus } from '@shared/types';
import type { EmbedRole } from '@shared/aiModels';
import type { AiProvider } from './types';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

type WorkerReply =
  | { type: 'progress'; status: AiModelStatus }
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: { code?: string; message?: string } };

/**
 * On-device embedding provider. Lazily forks the model worker (`modelWorker.js`,
 * built beside this file into out/main) and turns each provider call into a
 * request/response message. Serves the whole model catalog — the worker
 * memoizes a pipeline per model id. Mirrors the cloud providers, but talks to a
 * `utilityProcess` instead of a remote API.
 */
export class EmbeddedAiProvider implements AiProvider {
  readonly id = 'embedded';
  readonly capabilities = { embed: true, generate: false, images: true };

  private worker: UtilityProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly progressListeners = new Set<(status: AiModelStatus) => void>();

  /** Subscribe to model download/state progress. Returns an unsubscribe fn. */
  onProgress(cb: (status: AiModelStatus) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  private ensureWorker(): UtilityProcess {
    if (this.worker) return this.worker;
    const worker = utilityProcess.fork(join(__dirname, 'modelWorker.js'), [], {
      serviceName: 'fildos-ai',
    });
    worker.on('message', (msg: WorkerReply) => this.onMessage(msg));
    worker.on('exit', () => {
      this.worker = null;
      for (const p of this.pending.values()) p.reject(new Error('The AI worker stopped.'));
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }

  private onMessage(msg: WorkerReply): void {
    if ('type' in msg && msg.type === 'progress') {
      for (const listener of this.progressListeners) listener(msg.status);
      return;
    }
    if (!('id' in msg)) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) {
      p.resolve(msg.data);
    } else {
      const err = new Error(msg.error?.message ?? 'The AI worker failed.') as NodeJS.ErrnoException;
      err.code = msg.error?.code ?? 'EAIFAILED';
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

  status(modelId: string): Promise<AiModelStatus> {
    return this.request<AiModelStatus>('status', { modelId });
  }

  async download(modelId: string): Promise<void> {
    await this.request<void>('download', { modelId });
  }

  async embed(modelId: string, texts: string[], role: EmbedRole = 'passage'): Promise<Float32Array[]> {
    const rows = await this.request<number[][]>('embed', { modelId, texts, role });
    return rows.map((row) => Float32Array.from(row));
  }

  async embedImages(modelId: string, paths: string[]): Promise<Float32Array[]> {
    const rows = await this.request<number[][]>('embedImages', { modelId, paths });
    return rows.map((row) => Float32Array.from(row));
  }

  async countTokens(modelId: string, texts: string[]): Promise<number[]> {
    return this.request<number[]>('countTokens', { modelId, texts });
  }
}
