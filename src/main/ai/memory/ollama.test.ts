import { describe, expect, it, vi } from 'vitest';
import type { OllamaProgress } from '@shared/types';
import { ollamaStatus, pullOllamaModel, startOllama } from './ollama';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** A Response whose body streams the given NDJSON lines (like /api/pull). */
function streamResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('ollamaStatus', () => {
  it('reports running + installed with the pulled models', async () => {
    const fetch = vi.fn(async () => jsonResponse({ models: [{ name: 'a' }, { name: 'b' }] })) as unknown as typeof globalThis.fetch;
    const status = await ollamaStatus({ fetch, resolveBinary: () => '/bin/ollama' });
    expect(status).toEqual({ installed: true, running: true, models: ['a', 'b'] });
  });

  it('reports installed but not running when the port is dead', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof globalThis.fetch;
    const status = await ollamaStatus({ fetch, resolveBinary: () => '/bin/ollama' });
    expect(status).toMatchObject({ installed: true, running: false, models: [] });
  });

  it('reports not installed when the binary is missing and nothing is serving', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof globalThis.fetch;
    const status = await ollamaStatus({ fetch, resolveBinary: () => null });
    expect(status.installed).toBe(false);
  });
});

describe('startOllama', () => {
  it('throws ENOENT when ollama is not installed', async () => {
    await expect(startOllama({ resolveBinary: () => null })).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('launches ollama and resolves once it is serving', async () => {
    let up = false;
    const launch = vi.fn(() => {
      up = true;
    });
    const fetch = vi.fn(async () => {
      if (!up) throw new Error('down');
      return jsonResponse({ models: [] });
    }) as unknown as typeof globalThis.fetch;

    const status = await startOllama({ resolveBinary: () => '/bin/ollama', launch, fetch, delay: async () => {} });

    expect(launch).toHaveBeenCalledOnce();
    expect(status.running).toBe(true);
  });
});

describe('pullOllamaModel', () => {
  it('streams progress with a computed percent and a terminal done', async () => {
    const lines = [
      JSON.stringify({ status: 'pulling manifest' }),
      JSON.stringify({ status: 'downloading', completed: 50, total: 100 }),
      JSON.stringify({ status: 'downloading', completed: 100, total: 100 }),
    ];
    const fetch = vi.fn(async () => streamResponse(lines)) as unknown as typeof globalThis.fetch;
    const events: OllamaProgress[] = [];

    await pullOllamaModel('m', (p) => events.push(p), { fetch });

    expect(events.some((e) => e.percent === 50)).toBe(true);
    expect(events.at(-1)).toMatchObject({ status: 'success', done: true, percent: 100 });
  });

  it('throws on a non-ok pull response', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(pullOllamaModel('m', () => {}, { fetch })).rejects.toMatchObject({ code: 'EUNKNOWN' });
  });
});
