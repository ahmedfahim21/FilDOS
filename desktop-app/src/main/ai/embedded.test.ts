import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AiModelStatus } from '@shared/types';
import { EmbeddedAiProvider } from './providers/embedded';

/**
 * Fake utilityProcess worker. Replies to each request the way the real
 * modelWorker would, so the provider's request/response plumbing is exercised
 * without loading the (large, network-bound) embedding model.
 */
const DIM = 384;
function fakeWorker(): EventEmitter & { postMessage(msg: unknown): void } {
  const emitter = new EventEmitter() as EventEmitter & { postMessage(msg: unknown): void };
  emitter.postMessage = (msg: { id: number; type: string; modelId: string; texts?: string[]; paths?: string[] }) => {
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
        const rows = (msg.texts ?? []).map(() => Array.from({ length: DIM }, () => 0.1));
        emitter.emit('message', { id: msg.id, ok: true, data: rows });
      } else if (msg.type === 'embedImages') {
        const rows = (msg.paths ?? []).map(() => Array.from({ length: 512 }, () => 0.2));
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
  it('reports the worker status for the requested model', async () => {
    const p = new EmbeddedAiProvider();
    const status = await p.status('Xenova/bge-small-en-v1.5');
    expect(status.state).toBe('ready');
    expect(status.modelId).toBe('Xenova/bge-small-en-v1.5');
  });

  it('embeds text into Float32Array rows of the model dimension', async () => {
    const p = new EmbeddedAiProvider();
    const vecs = await p.embed('Xenova/all-MiniLM-L6-v2', ['a', 'b']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[0]).toHaveLength(DIM);
  });

  it('embeds images into Float32Array rows', async () => {
    const p = new EmbeddedAiProvider();
    const vecs = await p.embedImages('Xenova/clip-vit-base-patch32', ['/a.png', '/b.jpg']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[0]).toHaveLength(512);
  });

  it('streams download progress to subscribers', async () => {
    const p = new EmbeddedAiProvider();
    const seen: AiModelStatus[] = [];
    p.onProgress((s) => seen.push(s));
    await p.download('Xenova/all-MiniLM-L6-v2');
    expect(seen.some((s) => s.state === 'downloading' && s.progress === 0.5)).toBe(true);
  });
});
