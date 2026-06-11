import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, initDb } from './db';
import { getPrefs, setPrefs } from './prefs';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('prefs', () => {
  it('starts empty', async () => {
    expect(await getPrefs()).toEqual({});
  });

  it('merges patches field by field', async () => {
    await setPrefs({ showHidden: true, viewMode: 'grid' });
    await setPrefs({ viewMode: 'list', lastPath: '/home' });

    expect(await getPrefs()).toEqual({
      showHidden: true,
      viewMode: 'list',
      lastPath: '/home',
    });
  });

  it('ignores undefined fields', async () => {
    await setPrefs({ showHidden: true });
    await setPrefs({ showHidden: undefined });
    expect(await getPrefs()).toEqual({ showHidden: true });
  });
});
