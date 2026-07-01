import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SemanticHit } from '@shared/types';
import { closeDb, initDb } from '../../db';
import { setPrefs } from '../../prefs';
import type { MemoryBackend } from './types';
import {
  activeMemoryBackend,
  getMemoryBackend,
  registeredMemoryBackends,
  registerMemoryBackend,
} from './registry';

function stub(id: string): MemoryBackend {
  return { id, async search(): Promise<SemanticHit[]> { return []; } };
}

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('memory backend registry', () => {
  it('registers and looks up backends by id', () => {
    registerMemoryBackend(stub('local'));
    registerMemoryBackend(stub('supermemory'));
    expect(getMemoryBackend('local')?.id).toBe('local');
    expect(getMemoryBackend('nope')).toBeNull();
    expect(registeredMemoryBackends()).toEqual(expect.arrayContaining(['local', 'supermemory']));
  });

  it('activeMemoryBackend defaults to local', async () => {
    registerMemoryBackend(stub('local'));
    expect((await activeMemoryBackend()).id).toBe('local');
  });

  it('activeMemoryBackend honours prefs.ai.activeBackend', async () => {
    registerMemoryBackend(stub('local'));
    registerMemoryBackend(stub('supermemory'));
    await setPrefs({ ai: { enabled: true, activeProvider: 'embedded', activeBackend: 'supermemory' } });
    expect((await activeMemoryBackend()).id).toBe('supermemory');
  });

  it('throws EINVAL when the selected backend is not registered', async () => {
    await setPrefs({ ai: { enabled: true, activeProvider: 'embedded', activeBackend: 'ghost' } });
    await expect(activeMemoryBackend()).rejects.toMatchObject({ code: 'EINVAL' });
  });
});
