import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useTempDir } from '../../fs/fixtures';
import { SupermemoryBackend } from './supermemoryBackend';

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

/** A `/v3/search` result carrying FilDOS's stored path in metadata. */
function result(path: string, similarity: number, text: string) {
  return { similarity, chunk: text, metadata: { path } };
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
        { similarity: 0.7, chunk: 'no metadata', metadata: null }, // no path
      ],
    });

    const hits = await backend(fetchFn).search('q');

    expect(hits.map((h) => h.path)).toEqual([real]);
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
