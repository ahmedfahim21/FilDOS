import { describe, expect, it } from 'vitest';
import type { IndexConfig } from '@shared/types';
import { mergeIndexPrefs } from './indexPrefs';

const config: IndexConfig = {
  enabled: true,
  roots: ['/home/me'],
  excludes: [],
  excludeExtensions: [],
  intervalMinutes: 15,
  ambient: true,
};

describe('mergeIndexPrefs', () => {
  it('keeps fields outside IndexConfig (the fingerprint) and applies only the patch', () => {
    const stored = { ...config, fingerprint: 'model|q8|768|prompts1' };
    expect(mergeIndexPrefs(stored, config, { intervalMinutes: 60 })).toEqual({
      ...config,
      intervalMinutes: 60,
      fingerprint: 'model|q8|768|prompts1',
    });
  });

  it('fills defaults on a fresh profile', () => {
    expect(mergeIndexPrefs(undefined, config, { enabled: false })).toEqual({ ...config, enabled: false });
  });
});
