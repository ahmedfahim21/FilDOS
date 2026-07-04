import { basename, dirname, extname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Operator } from 'opendal';
import type { Metadata } from 'opendal';
import { formatRemote } from '@shared/remote';
import type { OpenDalBackend } from '@shared/opendalBackends';
import type { Entry, FileInfo } from '@shared/types';
import type { Provider } from '../provider';
import * as accountsDb from '../../db/accounts';

/**
 * A single `Provider` implementation backing every OpenDAL service. One instance
 * is registered per backend (s3, ipfs, onedrive, …) so it knows its own URI
 * scheme and OpenDAL service name. Credentials live in the accounts table as an
 * encrypted OpenDAL options blob; an `Operator` is built lazily per account and
 * cached.
 *
 * OpenDAL is object-store shaped: directories are key prefixes (paths ending in
 * "/"), there is no OS trash (delete is permanent), and permissions/birth-time
 * don't exist — so `trash` maps to a hard delete and `FileInfo` fills those
 * fields with neutral defaults.
 */
export class OpenDalProvider implements Provider {
  private readonly ops = new Map<string, Operator>();

  constructor(private readonly backend: OpenDalBackend) {}

  /** Drop the cached Operator for an account so the next call rebuilds it from
   * freshly stored credentials (called after a reconnect). */
  invalidate(accountId: string): void {
    this.ops.delete(accountId);
  }

  /** Build (or reuse) the Operator for an account from its stored options. */
  private async op(accountId: string): Promise<Operator> {
    const cached = this.ops.get(accountId);
    if (cached) return cached;
    const options = await accountsDb.getConfig(accountId);
    if (!options) {
      throw Object.assign(new Error('No credentials found. Please reconnect this account.'), {
        code: 'EAUTH',
      });
    }
    const op = new Operator(this.backend.scheme, options);
    this.ops.set(accountId, op);
    return op;
  }

  /** OpenDAL dir keys end with "/"; our ref paths never do. */
  private dirKey(path: string): string {
    return path ? `${path}/` : '';
  }

  /** Strip the trailing "/" OpenDAL uses to denote a directory. */
  private stripSlash(path: string): string {
    return path.endsWith('/') ? path.slice(0, -1) : path;
  }

  private toEntry(accountId: string, relPath: string, meta: Metadata): Entry {
    const clean = this.stripSlash(relPath);
    const isDirectory = meta.isDirectory();
    const name = clean ? (clean.split('/').pop() as string) : this.backend.name;
    const lm = meta.lastModified ? new Date(meta.lastModified).getTime() : Date.now();
    return {
      name,
      path: formatRemote(this.backend.id, accountId, clean),
      isDirectory,
      isSymlink: false,
      isHidden: name.startsWith('.'),
      size: isDirectory ? 0 : Number(meta.contentLength ?? 0),
      ext: isDirectory ? '' : extname(name).replace(/^\./, '').toLowerCase(),
      modified: lm,
      created: lm,
    };
  }

  async listDir(accountId: string, path: string): Promise<Entry[]> {
    const op = await this.op(accountId);
    const dir = this.dirKey(path);
    const entries = await op.list(dir);
    const out: Entry[] = [];
    for (const e of entries) {
      const p = e.path();
      if (p === dir || p === '') continue; // skip the listed directory itself
      out.push(this.toEntry(accountId, p, e.metadata()));
    }
    return out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  async getInfo(accountId: string, path: string): Promise<FileInfo> {
    const op = await this.op(accountId);
    let entry: Entry;
    if (!path) {
      // Root: OpenDAL may not stat the empty key; synthesize a directory entry.
      entry = {
        name: this.backend.name,
        path: formatRemote(this.backend.id, accountId, ''),
        isDirectory: true,
        isSymlink: false,
        isHidden: false,
        size: 0,
        ext: '',
        modified: Date.now(),
        created: Date.now(),
      };
    } else {
      // Try the file key first, then the directory key.
      let meta: Metadata;
      try {
        meta = await op.stat(path);
      } catch {
        meta = await op.stat(this.dirKey(path));
      }
      entry = this.toEntry(accountId, path, meta);
    }
    return { ...entry, accessed: entry.modified, mode: 0, permissions: '', realPath: null };
  }

  async createFolder(accountId: string, parentPath: string, name: string): Promise<Entry> {
    const op = await this.op(accountId);
    const rel = parentPath ? `${parentPath}/${name}` : name;
    await op.createDir(this.dirKey(rel));
    return this.getInfo(accountId, rel);
  }

  async rename(accountId: string, path: string, newName: string): Promise<Entry> {
    const op = await this.op(accountId);
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const dest = parent ? `${parent}/${newName}` : newName;
    await this.relocate(op, path, dest);
    return this.getInfo(accountId, dest);
  }

  async move(accountId: string, paths: string[], destPath: string): Promise<Entry[]> {
    const op = await this.op(accountId);
    const out: Entry[] = [];
    for (const p of paths) {
      const dest = destPath ? `${destPath}/${basename(p)}` : basename(p);
      await this.relocate(op, p, dest);
      out.push(await this.getInfo(accountId, dest));
    }
    return out;
  }

  async copy(accountId: string, paths: string[], destPath: string): Promise<Entry[]> {
    const op = await this.op(accountId);
    const out: Entry[] = [];
    for (const p of paths) {
      const dest = destPath ? `${destPath}/${basename(p)}` : basename(p);
      if (op.capability().copy) {
        await op.copy(p, dest);
      } else {
        // Fall back to read+write (files only; object stores have no dir copy).
        await op.write(dest, await op.read(p));
      }
      out.push(await this.getInfo(accountId, dest));
    }
    return out;
  }

  async trash(accountId: string, paths: string[]): Promise<void> {
    const op = await this.op(accountId);
    // No OS trash for object stores — this is a permanent delete.
    for (const p of paths) await op.delete(p);
  }

  async download(accountId: string, remotePath: string, localDest: string): Promise<string> {
    const op = await this.op(accountId);
    const data = await op.read(remotePath);
    await mkdir(dirname(localDest), { recursive: true }).catch(() => undefined);
    await writeFile(localDest, data);
    return localDest;
  }

  async upload(accountId: string, localPath: string, remoteDest: string): Promise<Entry> {
    const op = await this.op(accountId);
    const name = basename(localPath);
    const dest = remoteDest ? `${remoteDest}/${name}` : name;
    await op.write(dest, await readFile(localPath));
    return this.getInfo(accountId, dest);
  }

  async thumbnail(): Promise<string | null> {
    return null;
  }

  /** Rename if the backend supports it, else copy-then-delete. */
  private async relocate(op: Operator, from: string, to: string): Promise<void> {
    if (op.capability().rename) {
      await op.rename(from, to);
    } else {
      await op.write(to, await op.read(from));
      await op.delete(from);
    }
  }
}
