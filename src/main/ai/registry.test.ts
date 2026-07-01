import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, initDb } from '../db';
import { setPrefs } from '../prefs';
import type { AiModelStatus } from '@shared/types';
import type { AiProvider } from './providers/types';
import {
  activeAiProvider,
  getAiProvider,
  registerAiProvider,
  registeredAiProviders,
} from './registry';

function fakeProvider(id: string): AiProvider {
  return {
    id,
    capabilities: { embed: true, generate: false, images: false },
    status: async (modelId: string): Promise<AiModelStatus> => ({ state: 'absent', modelId, dim: 384 }),
    download: async () => {},
    embed: async () => [],
    embedImages: async () => [],
  };
}

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('ai registry', () => {
  it('registers and retrieves providers', () => {
    const p = fakeProvider('embedded');
    registerAiProvider('embedded', p);
    expect(getAiProvider('embedded')).toBe(p);
    expect(registeredAiProviders()).toContain('embedded');
  });

  it('returns null for unknown ids', () => {
    expect(getAiProvider('does-not-exist')).toBeNull();
  });

  it('active defaults to the embedded provider', async () => {
    const p = fakeProvider('embedded');
    registerAiProvider('embedded', p);
    expect(await activeAiProvider()).toBe(p);
  });

  it('active follows prefs.ai.activeProvider', async () => {
    const embedded = fakeProvider('embedded');
    const cloud = fakeProvider('cloud');
    registerAiProvider('embedded', embedded);
    registerAiProvider('cloud', cloud);
    await setPrefs({ ai: { enabled: true, activeProvider: 'cloud', modelId: 'm' } });
    expect(await activeAiProvider()).toBe(cloud);
  });
});
