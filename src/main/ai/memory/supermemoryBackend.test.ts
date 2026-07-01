import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempDir } from '../../fs/fixtures';
import { closeDb, initDb } from '../../db';
import * as aiIndex from '../../db/aiIndex';
import { SupermemoryBackend } from './supermemoryBackend';
import { stableId } from './stableId';

const tmp = useTempDir();

/** A stub `fetch` that returns `body` as JSON with `status`, and records the call. */
function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status }),
  );
  return fn as unknown as typeof fetch & { mock: (typeof fn)['mock'] };
}

function backend(fetchFn: typeof fetch, token: string | null = 'sm_test') {
  return new SupermemoryBackend({ baseUrl: 'http://localhost:6767', token: () => token, fetch: fetchFn });
}

/** A `/v3/search` result in the confirmed live shape (score + chunks[] + metadata). */
function result(path: string, score: number, text: string) {
  return { score, chunks: [{ content: text, isRelevant: true, score }], metadata: { path } };
}

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

/** A stub fetch that echoes 200 for uploads/deletes and records calls. */
function okFetch() {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{}', { status: 200 }));
  return fn as unknown as typeof fetch & { mock: (typeof fn)['mock'] };
}

describe('SupermemoryBackend.search', () => {
  it('maps /v3/search results to SemanticHits ranked by similarity', async () => {
    const a = join(tmp(), 'a.txt');
    const b = join(tmp(), 'b.txt');
    await fs.writeFile(a, 'alpha');
    await fs.writeFile(b, 'beta');
    const fetchFn = stubFetch({
      results: [result(b, 0.4, 'beta content'), result(a, 0.9, 'alpha content')],
    });

    const hits = await backend(fetchFn).search('q');

    expect(hits.map((h) => h.path)).toEqual([a, b]); // sorted by score desc
    expect(hits[0].score).toBeCloseTo(0.9);
    expect(hits[0].snippet).toContain('alpha');
  });

  it('POSTs to /v3/search with the bearer token and the query', async () => {
    const fetchFn = stubFetch({ results: [] });
    await backend(fetchFn, 'sm_secret').search('find me');

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:6767/v3/search');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sm_secret');
    expect(JSON.parse(init.body as string)).toMatchObject({ q: 'find me' });
  });

  it('omits the Authorization header when no token is ready', async () => {
    const fetchFn = stubFetch({ results: [] });
    await backend(fetchFn, null).search('q');
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('scopes results to rootPath', async () => {
    await fs.mkdir(join(tmp(), 'docs'));
    await fs.mkdir(join(tmp(), 'other'));
    const inDocs = join(tmp(), 'docs', 'a.txt');
    const outside = join(tmp(), 'other', 'c.txt');
    await fs.writeFile(inDocs, 'in');
    await fs.writeFile(outside, 'out');
    const fetchFn = stubFetch({ results: [result(inDocs, 0.9, 'in'), result(outside, 0.8, 'out')] });

    const hits = await backend(fetchFn).search('q', { rootPath: join(tmp(), 'docs') });

    expect(hits.map((h) => h.path)).toEqual([inDocs]);
    expect(hits[0].relativePath).toBe('a.txt');
  });

  it('drops results with no path in metadata and files gone from disk', async () => {
    const real = join(tmp(), 'real.txt');
    await fs.writeFile(real, 'here');
    const fetchFn = stubFetch({
      results: [
        result(real, 0.9, 'here'),
        result(join(tmp(), 'ghost.txt'), 0.8, 'gone'), // never written to disk
        { score: 0.7, chunks: [{ content: 'no metadata', isRelevant: true }], metadata: null }, // no path
      ],
    });

    const hits = await backend(fetchFn).search('q');

    expect(hits.map((h) => h.path)).toEqual([real]);
  });

  it('resolves a lazy baseUrl and throws when the daemon is not running', async () => {
    const fetchFn = stubFetch({ results: [] });
    // baseUrl resolver returns null → daemon down.
    const down = new SupermemoryBackend({ baseUrl: () => null, token: () => 's', fetch: fetchFn });
    await expect(down.search('q')).rejects.toMatchObject({ code: 'EUNKNOWN' });
    expect(fetchFn.mock.calls).toHaveLength(0);

    // baseUrl resolver returns a URL → used for the request.
    const up = new SupermemoryBackend({
      baseUrl: () => 'http://127.0.0.1:6800',
      token: () => 's',
      fetch: fetchFn,
    });
    await up.search('q');
    expect((fetchFn.mock.calls[0] as [string, RequestInit])[0]).toBe('http://127.0.0.1:6800/v3/search');
  });

  it('returns [] for a blank query without calling the daemon', async () => {
    const fetchFn = stubFetch({ results: [] });
    expect(await backend(fetchFn).search('   ')).toEqual([]);
    expect(fetchFn.mock.calls).toHaveLength(0);
  });

  it('throws EACCES on 401 and EUNKNOWN on other errors', async () => {
    await expect(backend(stubFetch('unauthorized', 401)).search('q')).rejects.toMatchObject({
      code: 'EACCES',
    });
    await expect(backend(stubFetch('boom', 500)).search('q')).rejects.toMatchObject({
      code: 'EUNKNOWN',
    });
  });
});

describe('SupermemoryBackend.ingest / remove', () => {
  it('posts extracted text to /v3/documents with customId + path metadata, and records state', async () => {
    const f = join(tmp(), 'notes.txt');
    await fs.writeFile(f, 'some content to ingest');
    const fetchFn = okFetch();

    await backend(fetchFn).ingest(f);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:6767/v3/documents');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ customId: stableId(f), metadata: { path: f } });
    expect(body.content).toContain('some content to ingest');
    // index_state bookkeeping written for the crawler's change-detection
    expect((await aiIndex.getState(f))?.status).toBe('indexed');
    expect((await aiIndex.getState(f))?.modelId).toBe('supermemory');
  });

  it('strips markup before posting an HTML document', async () => {
    const f = join(tmp(), 'page.html');
    await fs.writeFile(f, '<!DOCTYPE html><html><body><h1>Budget</h1><p>Q3 revenue forecast.</p></body></html>');
    const fetchFn = okFetch();
    await backend(fetchFn).ingest(f);
    const body = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.content).not.toContain('<');
    expect(body.content).toContain('Budget');
    expect(body.content).toContain('Q3 revenue forecast');
  });

  it('records non-extractable files as skipped without posting', async () => {
    const img = join(tmp(), 'pic.png');
    await fs.writeFile(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const fetchFn = okFetch();
    await backend(fetchFn).ingest(img);
    expect(fetchFn.mock.calls).toHaveLength(0);
    expect((await aiIndex.getState(img))?.status).toBe('skipped');
  });

  it('is a no-op for an unchanged file', async () => {
    const f = join(tmp(), 'notes.txt');
    await fs.writeFile(f, 'x');
    const fetchFn = okFetch();
    const b = backend(fetchFn);
    await b.ingest(f);
    await b.ingest(f);
    expect(fetchFn.mock.calls.filter((c) => String(c[0]).endsWith('/v3/documents'))).toHaveLength(1);
  });

  it('drops a file that vanished before upload', async () => {
    const gone = join(tmp(), 'ghost.txt');
    const fetchFn = okFetch();
    await backend(fetchFn).ingest(gone);
    expect(await aiIndex.getState(gone)).toBeNull();
  });

  it('remove DELETEs by customId and clears local state', async () => {
    const f = join(tmp(), 'notes.txt');
    await fs.writeFile(f, 'y');
    const fetchFn = okFetch();
    const b = backend(fetchFn);
    await b.ingest(f);
    await b.remove([f]);

    const del = fetchFn.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE');
    expect(String(del?.[0])).toBe(`http://localhost:6767/v3/documents/${encodeURIComponent(stableId(f))}`);
    expect(await aiIndex.getState(f)).toBeNull();
  });

  it('treats a 404 on delete as already-gone', async () => {
    const f = join(tmp(), 'notes.txt');
    await fs.writeFile(f, 'z');
    await aiIndex.upsertState({ path: f, mtime: 1, size: 1, contentHash: null, modelId: 'supermemory', indexedAt: 1, status: 'indexed' });
    const fetchFn = vi.fn(async () => new Response('missing', { status: 404 })) as unknown as typeof fetch;
    await expect(backend(fetchFn).remove([f])).resolves.toBeUndefined();
    expect(await aiIndex.getState(f)).toBeNull();
  });

  it('fingerprint is the constant supermemory marker', () => {
    expect(backend(okFetch()).fingerprint('/any/path.txt')).toBe('supermemory');
  });
});
