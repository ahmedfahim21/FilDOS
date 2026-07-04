import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import { basename, join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// transfer.ts pulls in `app` (for the cloud→cloud temp bounce); stub it.
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

import type { Entry, FileInfo } from '@shared/types';
import { formatRemote } from '@shared/remote';
import type { Provider } from '../cloud/provider';
import { registerProvider } from '../cloud/registry';
import { createFile, createFolder } from './service';
import { copyAcross, moveAcross } from './transfer';
import { namesIn, useTempDir } from './fixtures';

/**
 * A fake cloud provider backed by real temp directories — one "root" per
 * account — so the orchestrator's download/upload/list calls hit a genuine
 * filesystem. Exercises local↔cloud and cloud↔cloud (cross-account) transfers.
 */
const SCHEME = 'faketest';
const roots: Record<string, string> = {};

function mapped(acc: string, p: string): string {
  return p ? join(roots[acc], p) : roots[acc];
}

async function info(acc: string, p: string): Promise<FileInfo> {
  const st = await fs.stat(mapped(acc, p));
  return {
    name: p ? basename(p) : SCHEME,
    path: formatRemote(SCHEME, acc, p),
    isDirectory: st.isDirectory(),
    isSymlink: false,
    isHidden: false,
    size: st.isDirectory() ? 0 : st.size,
    ext: '',
    modified: st.mtimeMs,
    created: st.ctimeMs,
    accessed: st.atimeMs,
    mode: 0,
    permissions: '',
    realPath: null,
  };
}

const fakeProvider: Provider = {
  getInfo: (acc, p) => info(acc, p),
  async listDir(acc, p) {
    const names = await fs.readdir(mapped(acc, p));
    return Promise.all(names.map((n) => info(acc, p ? `${p}/${n}` : n) as Promise<Entry>));
  },
  async createFolder(acc, parentPath, name) {
    const rel = parentPath ? `${parentPath}/${name}` : name;
    await fs.mkdir(mapped(acc, rel), { recursive: true });
    return info(acc, rel);
  },
  async download(acc, remotePath, localDest) {
    await fs.copyFile(mapped(acc, remotePath), localDest);
    return localDest;
  },
  async upload(acc, localPath, remoteDest) {
    const rel = remoteDest ? `${remoteDest}/${basename(localPath)}` : basename(localPath);
    await fs.copyFile(localPath, mapped(acc, rel));
    return info(acc, rel);
  },
  async trash(acc, paths) {
    for (const p of paths) await fs.rm(mapped(acc, p), { recursive: true, force: true });
  },
  rename: () => Promise.reject(new Error('unused')),
  move: () => Promise.reject(new Error('unused')),
  copy: () => Promise.reject(new Error('unused')),
  thumbnail: () => Promise.resolve(null),
};

registerProvider(SCHEME, fakeProvider);

const uri = (acc: string, p: string) => formatRemote(SCHEME, acc, p);

describe('cross-storage transfer', () => {
  const local = useTempDir();
  const remoteA = useTempDir();
  const remoteB = useTempDir();

  beforeEach(() => {
    roots.accA = remoteA();
    roots.accB = remoteB();
  });

  it('copies a local file up to the cloud', async () => {
    await createFile(local(), 'up.txt');
    const [entry] = await copyAcross([join(local(), 'up.txt')], uri('accA', ''));
    expect(entry.path).toBe(uri('accA', 'up.txt'));
    expect(await namesIn(remoteA())).toContain('up.txt');
  });

  it('copies a cloud file down to local', async () => {
    await fs.writeFile(join(remoteA(), 'down.txt'), 'hi');
    const [entry] = await copyAcross([uri('accA', 'down.txt')], local());
    expect(entry.name).toBe('down.txt');
    expect(await fs.readFile(join(local(), 'down.txt'), 'utf8')).toBe('hi');
  });

  it('copies a local folder up recursively', async () => {
    const dir = await createFolder(local(), 'proj');
    await createFile(dir.path, 'inner.txt');
    await copyAcross([dir.path], uri('accA', ''));
    expect(await namesIn(join(remoteA(), 'proj'))).toEqual(['inner.txt']);
  });

  it('copies a cloud folder down recursively', async () => {
    await fs.mkdir(join(remoteA(), 'docs'));
    await fs.writeFile(join(remoteA(), 'docs', 'a.txt'), 'a');
    await copyAcross([uri('accA', 'docs')], local());
    expect(await namesIn(join(local(), 'docs'))).toEqual(['a.txt']);
  });

  it('moves a local file to the cloud and removes the original', async () => {
    await createFile(local(), 'mv.txt');
    const [entry] = await moveAcross([join(local(), 'mv.txt')], uri('accA', ''));
    expect(entry.path).toBe(uri('accA', 'mv.txt'));
    expect(await namesIn(remoteA())).toContain('mv.txt');
    expect(await namesIn(local())).not.toContain('mv.txt'); // source gone
  });

  it('transfers between two different cloud accounts', async () => {
    await fs.writeFile(join(remoteA(), 'x.txt'), 'payload');
    const [entry] = await copyAcross([uri('accA', 'x.txt')], uri('accB', ''));
    expect(entry.path).toBe(uri('accB', 'x.txt'));
    expect(await fs.readFile(join(remoteB(), 'x.txt'), 'utf8')).toBe('payload');
  });
});
