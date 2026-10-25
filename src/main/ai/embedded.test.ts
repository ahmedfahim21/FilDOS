import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AiModelStatus } from '@shared/types';
import { EmbeddedAiProvider, vectors, WORKER_IDLE_MS } from './providers/embedded';

/**
 * Fake utilityProcess worker. Replies to each request the way the real
 * modelWorker would, so the provider's request/response plumbing is exercised
 * without loading the (large, network-bound) embedding model.
 */
const DIM = 768;
/** Every request the fake worker saw, for asserting what the provider sent. */
const sent: Record<string, unknown>[] = [];
let forks = 0;
function fakeWorker(): EventEmitter & { postMessage(msg: unknown): void; kill(): void } {
  forks++;
  const emitter = new EventEmitter() as EventEmitter & { postMessage(msg: unknown): void; kill(): void };
  emitter.kill = () => queueMicrotask(() => emitter.emit('exit', 0));
  emitter.postMessage = (msg: { id: number; type: string; modelId: string; texts?: string[]; paths?: string[] }) => {
    sent.push(msg);
    queueMicrotask(() => {
      if (msg.type === 'status') {
        const status: AiModelStatus = { state: 'ready', modelId: msg.modelId, dim: DIM };
        emitter.emit('message', { id: msg.id, ok: true, data: status });
      } else if (msg.type === 'download') {
        emitter.emit('message', {
          type: 'progress',
          status: { state: 'downloading', modelId: msg.modelId, dim: DIM, progress: 0.5 },
        });
        emitter.emit('message', { id: msg.id, ok: true, data: undefined });
      } else if (msg.type === 'embed') {
        // The real runtime replies with Float32Arrays (structured clone keeps them).
        const rows = (msg.texts ?? []).map(() => new Float32Array(DIM).fill(0.1));
        emitter.emit('message', { id: msg.id, ok: true, data: rows });
      } else if (msg.type === 'embedMedia') {
        const rows = (msg.paths ?? []).map(() => new Float32Array(DIM).fill(0.2));
        emitter.emit('message', { id: msg.id, ok: true, data: rows });
      }
    });
  };
  return emitter;
}

vi.mock('electron', () => ({
  utilityProcess: { fork: () => fakeWorker() },
}));

describe('EmbeddedAiProvider', () => {
  const MODEL = 'onnx-community/embeddinggemma-2-ONNX';

  it('reports the worker status for the requested model', async () => {
    const p = new EmbeddedAiProvider();
    const status = await p.status(MODEL);
    expect(status).toEqual({ state: 'ready', modelId: MODEL, dim: DIM });
  });

  it('embeds text into Float32Array rows, sending role and titles', async () => {
    const p = new EmbeddedAiProvider();
    const vecs = await p.embed(MODEL, ['a', 'b'], 'passage', ['a.md', 'b.md']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[0]).toHaveLength(DIM);
    expect(sent.at(-1)).toMatchObject({ type: 'embed', modelId: MODEL, texts: ['a', 'b'], role: 'passage', titles: ['a.md', 'b.md'] });
  });

  it('embeds pictures into Float32Array rows, sending the vision budget', async () => {
    const p = new EmbeddedAiProvider();
    const vecs = await p.embedMedia(MODEL, 'image', ['/a.png', '/b.jpg'], { budget: 140 });
    expect(vecs).toHaveLength(2);
    expect(vecs[1]).toBeInstanceOf(Float32Array);
    expect(vecs[1]).toHaveLength(DIM);
    expect(sent.at(-1)).toMatchObject({ type: 'embedMedia', kind: 'image', paths: ['/a.png', '/b.jpg'], budget: 140 });
  });

  it('rejects vectors that did not arrive as Float32Arrays', () => {
    expect(() => vectors([[0.1, 0.2]])).toThrow(expect.objectContaining({ code: 'EAIFAILED' }));
    expect(() => vectors('nope')).toThrow(/malformed/);
    expect(vectors([new Float32Array([1])])).toHaveLength(1);
  });

  it('streams download progress to subscribers', async () => {
    const p = new EmbeddedAiProvider();
    const seen: AiModelStatus[] = [];
    p.onProgress((s) => seen.push(s));
    await p.download(MODEL);
    expect(seen.some((s) => s.state === 'downloading' && s.progress === 0.5)).toBe(true);
  });

  it('shuts the worker down when idle and forks a fresh one on the next request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const p = new EmbeddedAiProvider();
      const before = forks;
      await p.status(MODEL);
      expect(forks).toBe(before + 1);
      // Busy again before the timeout: no restart.
      await vi.advanceTimersByTimeAsync(WORKER_IDLE_MS - 1000);
      await p.status(MODEL);
      expect(forks).toBe(before + 1);
      await vi.advanceTimersByTimeAsync(WORKER_IDLE_MS + 1);
      await p.embed(MODEL, ['a']);
      expect(forks).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });
});
