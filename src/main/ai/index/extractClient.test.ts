import { describe, expect, it } from 'vitest';
import { ExtractClient, type ExtractReply, type ExtractRequest, type ExtractWorker } from './extractClient';

type Req = ExtractRequest & { id: number };

/** A fake worker: records requests, answers through `reply`, dies through `exit`. */
class FakeWorker implements ExtractWorker {
  readonly got: Req[] = [];
  killed = false;
  private onMessage: (r: ExtractReply) => void = () => {};
  private onExitCb: (code: number) => void = () => {};
  constructor(private readonly auto?: (req: Req) => ExtractReply | null) {}
  postMessage(req: Req): void {
    this.got.push(req);
    const r = this.auto?.(req);
    if (r) queueMicrotask(() => this.onMessage(r));
  }
  on(event: 'message' | 'exit', listener: never): unknown {
    if (event === 'message') this.onMessage = listener;
    else this.onExitCb = listener;
    return this;
  }
  kill(): boolean {
    this.killed = true;
    queueMicrotask(() => this.onExitCb(0));
    return true;
  }
  exit(code: number): void {
    this.onExitCb(code);
  }
  reply(r: ExtractReply): void {
    this.onMessage(r);
  }
}

function client(make: () => FakeWorker, timeoutMs = 1000, idleMs = 1000) {
  const workers: FakeWorker[] = [];
  const c = new ExtractClient(() => {
    const w = make();
    workers.push(w);
    return w;
  }, { timeoutMs, idleMs });
  return { c, workers };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ExtractClient', () => {
  it('sends each read to one lazily started worker and returns its answer', async () => {
    const { c, workers } = client(
      () => new FakeWorker((req) => ({ id: req.id, ok: true, data: req.op === 'text' ? 'hello' : { total: 3, pages: [] } })),
    );
    expect(workers).toHaveLength(0);
    await expect(c.text('/a.txt')).resolves.toBe('hello');
    await expect(c.pdfPages('/b.pdf', 2, 4)).resolves.toEqual({ total: 3, pages: [] });
    expect(workers).toHaveLength(1);
    expect(workers[0].got).toEqual([
      { id: 1, op: 'text', path: '/a.txt' },
      { id: 2, op: 'pdfPages', path: '/b.pdf', from: 2, to: 4 },
    ]);
    c.close();
  });

  it('rejects with the worker’s error code and message', async () => {
    const { c } = client(() => new FakeWorker((req) => ({ id: req.id, ok: false, error: { code: 'ENOENT', message: 'gone' } })));
    await expect(c.text('/missing')).rejects.toMatchObject({ code: 'ENOENT', message: 'gone' });
    c.close();
  });

  it('kills a read past the time limit, failing it and retrying the others on a fresh worker', async () => {
    const { c, workers } = client(() => new FakeWorker(), 30);
    const slow = c.pdfPages('/huge.pdf');
    const other = c.text('/note.md');
    const slowDone = expect(slow).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await sleep(60);
    await slowDone;
    expect(workers[0].killed).toBe(true);
    // The innocent read went again, alone, to a new worker.
    expect(workers).toHaveLength(2);
    expect(workers[1].got).toEqual([{ id: 2, op: 'text', path: '/note.md' }]);
    workers[1].reply({ id: 2, ok: true, data: 'notes' });
    await expect(other).resolves.toBe('notes');
    c.close();
  });

  it('retries reads once when the worker dies, failing the one that kills it twice', async () => {
    const { c, workers } = client(() => new FakeWorker());
    const bomb = c.text('/bomb.docx');
    const fine = c.text('/fine.txt');
    workers[0].exit(5);
    expect(workers).toHaveLength(2);
    expect(workers[1].got.map((r) => r.path)).toEqual(['/bomb.docx', '/fine.txt']);
    workers[1].reply({ id: 2, ok: true, data: 'fine' });
    await expect(fine).resolves.toBe('fine');
    workers[1].exit(5);
    await expect(bomb).rejects.toMatchObject({ code: 'EEXTRACT', message: expect.stringContaining('exit code 5') });
    expect(workers).toHaveLength(2);
    c.close();
  });

  it('stops the worker once idle, and starts a new one for the next read', async () => {
    const { c, workers } = client(() => new FakeWorker((req) => ({ id: req.id, ok: true, data: 'x' })), 1000, 20);
    await c.text('/a');
    await sleep(40);
    expect(workers[0].killed).toBe(true);
    await c.text('/b');
    expect(workers).toHaveLength(2);
    c.close();
  });
});
