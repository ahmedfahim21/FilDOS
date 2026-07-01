import { describe, expect, it } from 'vitest';
import type { AiProvider } from './providers/types';
import { CloudAiProvider } from './providers/cloud';

describe('CloudAiProvider (deferred stub)', () => {
  const p: AiProvider = new CloudAiProvider();

  it('advertises no capabilities', () => {
    expect(p.capabilities).toEqual({ embed: false, generate: false, images: false });
  });

  it('reports an absent model without throwing', async () => {
    expect((await p.status('Xenova/all-MiniLM-L6-v2')).state).toBe('absent');
  });

  it('throws EUNSUPPORTED from embed', async () => {
    await expect(p.embed('m', ['x'])).rejects.toMatchObject({ code: 'EUNSUPPORTED' });
  });

  it('throws EUNSUPPORTED from embedImages', async () => {
    await expect(p.embedImages('m', ['/x.png'])).rejects.toMatchObject({ code: 'EUNSUPPORTED' });
  });

  it('throws EUNSUPPORTED from download', async () => {
    await expect(p.download('m')).rejects.toMatchObject({ code: 'EUNSUPPORTED' });
  });
});
