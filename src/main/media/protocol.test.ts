import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexState } from '@shared/types';
import { closeDb, initDb } from '../db';
import { upsertState } from '../db/aiIndex';

vi.mock('electron', () => ({ net: {}, protocol: {}, session: {}, WebContentsView: class {} }));
const { mayServe, pathOfMediaUrl, MEDIA_SCHEME } = await import('./protocol');

const state = (path: string, status: IndexState['status'] = 'indexed'): IndexState => ({
  path,
  mtime: 1,
  size: 1,
  contentHash: null,
  modelId: 'm',
  indexVersion: 4,
  indexedAt: 1,
  status,
});

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('fildos-media protocol', () => {
  it('round-trips an encoded absolute path', () => {
    const p = '/Users/me/Books/field guide (2nd ed).pdf';
    expect(pathOfMediaUrl(`${MEDIA_SCHEME}://file/${encodeURIComponent(p)}`)).toBe(p);
    expect(pathOfMediaUrl(`${MEDIA_SCHEME}://other/x`)).toBeNull();
    expect(pathOfMediaUrl('https://example.com/a.pdf')).toBeNull();
  });

  it('serves only previewable files that are in the index', async () => {
    await upsertState(state('/docs/lease.pdf'));
    await upsertState(state('/docs/notes.md'));
    await upsertState(state('/docs/broken.pdf', 'error'));
    expect(await mayServe('/docs/lease.pdf')).toBe(true);
    expect(await mayServe('/docs/LEASE.PDF')).toBe(false); // not indexed under that name
    expect(await mayServe('/docs/notes.md')).toBe(false); // not a previewable type
    expect(await mayServe('/docs/broken.pdf')).toBe(false); // errored: never read
    expect(await mayServe('/etc/secret.pdf')).toBe(false); // not in the index
    await upsertState(state('/music/talk.mp3'));
    expect(await mayServe('/music/talk.mp3')).toBe(true); // media plays from its moment
    expect(await mayServe('/music/other.mp3')).toBe(false);
  });
});
