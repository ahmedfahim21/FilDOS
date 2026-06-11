import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FolderView } from '@shared/types';
import { closeDb, initDb } from './index';
import { getFolderView, setFolderView } from './views';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('folder views', () => {
  it('returns null for a folder that was never customised', async () => {
    expect(await getFolderView('/somewhere')).toBeNull();
  });

  it('stores and returns a full view', async () => {
    await setFolderView('/p', {
      sortKey: 'size',
      sortDir: 'desc',
      viewMode: 'grid',
      iconSize: 'large',
    });
    expect(await getFolderView('/p')).toEqual({
      sortKey: 'size',
      sortDir: 'desc',
      viewMode: 'grid',
      iconSize: 'large',
    });
  });

  it('merges partial updates, keeping earlier fields', async () => {
    await setFolderView('/p', { viewMode: 'grid' });
    await setFolderView('/p', { sortKey: 'modified', sortDir: 'desc' });

    expect(await getFolderView('/p')).toEqual({
      sortKey: 'modified',
      sortDir: 'desc',
      viewMode: 'grid',
      iconSize: undefined,
    });
  });

  it('drops values outside the known options', async () => {
    await setFolderView('/p', { viewMode: 'kanban', iconSize: 'large' } as unknown as FolderView);
    expect(await getFolderView('/p')).toMatchObject({ viewMode: undefined, iconSize: 'large' });
  });
});
