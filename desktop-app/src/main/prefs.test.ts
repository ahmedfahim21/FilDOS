import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, initDb } from './db';
import { useTempDir } from './fs/fixtures';
import { getPrefs, importLegacyPrefs, setPrefs } from './prefs';

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

describe('importLegacyPrefs', () => {
  const tmp = useTempDir();

  it('imports prefs.json once and renames it out of the way', async () => {
    const file = join(tmp(), 'prefs.json');
    await fs.writeFile(file, JSON.stringify({ showHidden: true, lastPath: '/old' }));

    await importLegacyPrefs(file);
    expect(await getPrefs()).toEqual({ showHidden: true, lastPath: '/old' });
    await expect(fs.access(file)).rejects.toThrow(); // renamed to *.migrated
    await expect(fs.access(`${file}.migrated`)).resolves.toBeUndefined();
  });

  it('never overwrites prefs that already exist', async () => {
    await setPrefs({ showHidden: false });
    const file = join(tmp(), 'prefs.json');
    await fs.writeFile(file, JSON.stringify({ showHidden: true }));

    await importLegacyPrefs(file);
    expect(await getPrefs()).toEqual({ showHidden: false });
    await expect(fs.access(file)).resolves.toBeUndefined(); // left untouched
  });

  it('is a no-op when there is no legacy file', async () => {
    await importLegacyPrefs(join(tmp(), 'missing.json'));
    expect(await getPrefs()).toEqual({});
  });
});
