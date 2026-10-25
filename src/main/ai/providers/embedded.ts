import { utilityProcess, type UtilityProcess } from 'electron';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import type { AiModelStatus } from '@shared/types';
import type { EmbedRole } from '@shared/aiModels';
import type { EntitySpan } from '@shared/graphTypes';
import type { AiProvider } from './types';

/** Vectors cross the utilityProcess port as Float32Arrays (structured clone keeps typed arrays). */
export function vectors(data: unknown): Float32Array[] {
  if (!Array.isArray(data) || !data.every((v) => v instanceof Float32Array)) {
    throw Object.assign(new Error('The AI worker returned malformed vectors.'), { code: 'EAIFAILED' });
  }
  return data as Float32Array[];
}

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
  /** Model ids whose download was deliberately cancelled, so the worker-exit
   * rejection it causes can be told apart from a real crash. */
  private readonly cancelling = new Set<string>();

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
    // Run inference below normal priority so background indexing never
    // competes with the user's foreground work for CPU time.
    worker.on('spawn', () => {
      try {
        if (worker.pid) setPriority(worker.pid, 10);
      } catch {
        // priority is best-effort (can fail on permission-restricted systems)
      }
    });
    worker.on('message', (msg: WorkerReply) => this.onMessage(msg));
    worker.on('exit', (code) => {
      this.worker = null;
      // 0 after an idle shutdown or a cancel; anything else is a crash worth tracing.
      if (code !== 0 || this.pending.size) {
        console.error(`[fildos] AI worker exited (code ${code}) with ${this.pending.size} request(s) pending`);
      }
      for (const p of this.pending.values()) p.reject(new Error(`The AI worker stopped (exit code ${code}).`));
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
    try {
      await this.request<void>('download', { modelId });
    } catch (err) {
      // A deliberate cancel kills the worker, which rejects this same pending
      // request generically ("The AI worker stopped.") — not a real failure.
      if (this.cancelling.delete(modelId)) return;
      throw err;
    }
  }

  /**
   * Abort an in-flight download. transformers.js's `from_pretrained` exposes no
   * cancellation hook, so the only way to stop a fetch already underway is to
   * kill the worker process doing it — it forks again lazily on the next
   * request. Only acts while the given model is actually downloading, so a
   * stale/late cancel can't kill an unrelated in-flight embed call.
   */
  async cancelDownload(modelId: string): Promise<void> {
    if (!this.worker) return;
    const status = await this.status(modelId).catch(() => null);
    if (status?.state !== 'downloading') return;
    this.cancelling.add(modelId);
    this.worker.kill();
    for (const listener of this.progressListeners) {
      listener({ state: 'absent', modelId, dim: status.dim });
    }
  }

  async embed(modelId: string, texts: string[], role: EmbedRole = 'passage', titles?: string[]): Promise<Float32Array[]> {
    return vectors(await this.request<unknown>('embed', { modelId, texts, role, titles }));
  }

  async embedMedia(modelId: string, kind: 'image', paths: string[], opts?: { budget?: number }): Promise<Float32Array[]> {
    return vectors(await this.request<unknown>('embedMedia', { modelId, kind, paths, budget: opts?.budget }));
  }

  async countTokens(modelId: string, texts: string[]): Promise<number[]> {
    return this.request<number[]>('countTokens', { modelId, texts });
  }

  async extractEntities(modelId: string, texts: string[]): Promise<EntitySpan[][]> {
    return this.request<EntitySpan[][]>('extractEntities', { modelId, texts });
  }
}
