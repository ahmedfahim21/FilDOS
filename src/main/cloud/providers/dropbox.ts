import { extname, basename } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { formatRemote } from '@shared/remote';
import type { Entry, FileInfo } from '@shared/types';
import type { Provider } from '../provider';
import type { OAuthToken } from '../oauth';
import { cloudCredential } from '../credentials';
import * as accountsDb from '../../db/accounts';

const PROVIDER_ID = 'dropbox';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

interface DbxMetadata {
  '.tag': 'file' | 'folder' | 'deleted';
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
  size?: number;
  client_modified?: string;
  server_modified?: string;
}

/** Dropbox paths start with "/" except root which is "". */
function toDbxPath(path: string): string {
  return path ? `/${path}` : '';
}

/** Strip the leading "/" from a Dropbox path_display to get our ref path. */
function fromDbxPath(dbxPath: string): string {
  return dbxPath.startsWith('/') ? dbxPath.slice(1) : dbxPath;
}

function makeAuthError(msg: string): NodeJS.ErrnoException {
  return Object.assign(new Error(msg), { code: 'EAUTH' });
}

/**
 * Encode an object as JSON safe for HTTP headers (escape all non-ASCII chars).
 * The official Dropbox SDK calls this "httpHeaderSafeJson" — without it, paths
 * containing accented letters or non-Latin scripts produce a malformed header
 * and Dropbox returns HTTP 400.
 */
function headerSafeJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/[-￿]/g, (c) =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

async function checkStatus(res: Response, context?: string): Promise<void> {
  if (res.ok) return;
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error_summary?: string };
      detail = j.error_summary ?? text.slice(0, 200);
    } catch {
      detail = text.slice(0, 200);
    }
  } catch { /* body unreadable */ }
  const err = new Error() as NodeJS.ErrnoException;
  switch (res.status) {
    case 401:
      err.code = 'EAUTH';
      err.message = 'Session expired. Please reconnect this Dropbox account.';
      break;
    case 403:
      err.code = 'EACCES';
      err.message = 'Permission denied by Dropbox.';
      break;
    case 409:
      err.code = 'ENOENT';
      err.message = detail ? `Dropbox: ${detail}` : 'This item no longer exists in Dropbox.';
      break;
    case 429:
      err.code = 'EBUSY';
      err.message = 'Dropbox rate limit exceeded. Try again in a moment.';
      break;
    default:
      err.code = 'EUNKNOWN';
      err.message = `Dropbox error${context ? ` (${context})` : ''}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}.`;
  }
  throw err;
}

/** POST to a content endpoint without a body — avoids fetch adding Content-Length: 0. */
function contentRequest(path: string, token: string, apiArg: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'content.dropboxapi.com',
        path: `/2${path}`,
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': apiArg },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

async function collectChunks(stream: IncomingMessage): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return chunks;
}

async function readStream(stream: IncomingMessage): Promise<string> {
  return (await collectChunks(stream)).join('').slice(0, 200);
}

function metaToEntry(m: DbxMetadata, accountId: string): Entry {
  const isDir = m['.tag'] === 'folder';
  const refPath = fromDbxPath(m.path_display);
  return {
    name: m.name,
    path: formatRemote(PROVIDER_ID, accountId, refPath),
    isDirectory: isDir,
    isSymlink: false,
    isHidden: m.name.startsWith('.'),
    size: m.size ?? 0,
    ext: isDir ? '' : extname(m.name).slice(1).toLowerCase(),
    modified: m.server_modified ? new Date(m.server_modified).getTime() : Date.now(),
    created: m.client_modified ? new Date(m.client_modified).getTime() : Date.now(),
  };
}

export class DropboxProvider implements Provider {
  private async accessToken(accountId: string): Promise<string> {
    const tok = await accountsDb.getToken(accountId);
    if (!tok) throw makeAuthError('No credentials found. Please reconnect this account.');
    if (tok.expiresAt && tok.expiresAt - 60_000 < Date.now()) {
      return this.refreshAccessToken(accountId, tok);
    }
    return tok.accessToken;
  }

  private async refreshAccessToken(accountId: string, tok: OAuthToken): Promise<string> {
    if (!tok.refreshToken) throw makeAuthError('Session expired. Please reconnect this account.');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tok.refreshToken,
      client_id: cloudCredential('DROPBOX', 'CLIENT_ID') ?? '',
    });
    const clientSecret = cloudCredential('DROPBOX', 'CLIENT_SECRET');
    if (clientSecret) body.set('client_secret', clientSecret);
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw makeAuthError('Token refresh failed. Please reconnect this account.');
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    const updated: OAuthToken = {
      ...tok,
      accessToken: data.access_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
    await accountsDb.updateToken(accountId, updated);
    return updated.accessToken;
  }

  private async apiPost<T>(endpoint: string, token: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await checkStatus(res, endpoint);
    return res.json() as Promise<T>;
  }

  async listDir(accountId: string, path: string): Promise<Entry[]> {
    const token = await this.accessToken(accountId);
    const entries: Entry[] = [];
    let data = await this.apiPost<{ entries: DbxMetadata[]; cursor: string; has_more: boolean }>(
      'files/list_folder',
      token,
      { path: toDbxPath(path), recursive: false },
    );
    for (const m of data.entries) {
      if (m['.tag'] !== 'deleted') entries.push(metaToEntry(m, accountId));
    }
    while (data.has_more) {
      data = await this.apiPost<{ entries: DbxMetadata[]; cursor: string; has_more: boolean }>(
        'files/list_folder/continue',
        token,
        { cursor: data.cursor },
      );
      for (const m of data.entries) {
        if (m['.tag'] !== 'deleted') entries.push(metaToEntry(m, accountId));
      }
    }
    return entries;
  }

  async getInfo(accountId: string, path: string): Promise<FileInfo> {
    // Dropbox has no metadata endpoint for the root — synthesize it.
    if (!path) {
      return {
        name: 'Dropbox',
        path: formatRemote(PROVIDER_ID, accountId, ''),
        isDirectory: true,
        isSymlink: false,
        isHidden: false,
        size: 0,
        ext: '',
        modified: Date.now(),
        created: Date.now(),
        accessed: Date.now(),
        mode: 0,
        permissions: '',
        realPath: null,
      };
    }
    const token = await this.accessToken(accountId);
    const m = await this.apiPost<DbxMetadata>('files/get_metadata', token, { path: toDbxPath(path) });
    const entry = metaToEntry(m, accountId);
    return { ...entry, accessed: entry.modified, mode: 0, permissions: '', realPath: null };
  }

  async createFolder(accountId: string, parentPath: string, name: string): Promise<Entry> {
    const token = await this.accessToken(accountId);
    const dbxPath = parentPath ? `/${parentPath}/${name}` : `/${name}`;
    const data = await this.apiPost<{ metadata: DbxMetadata }>('files/create_folder_v2', token, {
      path: dbxPath,
      autorename: false,
    });
    return metaToEntry(data.metadata, accountId);
  }

  async rename(accountId: string, path: string, newName: string): Promise<Entry> {
    const token = await this.accessToken(accountId);
    const fromPath = toDbxPath(path);
    const parentDbxPath = fromPath.slice(0, fromPath.lastIndexOf('/'));
    const data = await this.apiPost<{ metadata: DbxMetadata }>('files/move_v2', token, {
      from_path: fromPath,
      to_path: `${parentDbxPath}/${newName}`,
      autorename: false,
    });
    return metaToEntry(data.metadata, accountId);
  }

  async move(accountId: string, paths: string[], destPath: string): Promise<Entry[]> {
    const token = await this.accessToken(accountId);
    return Promise.all(
      paths.map(async (p) => {
        const name = p.slice(p.lastIndexOf('/') + 1);
        const data = await this.apiPost<{ metadata: DbxMetadata }>('files/move_v2', token, {
          from_path: toDbxPath(p),
          to_path: destPath ? `/${destPath}/${name}` : `/${name}`,
          autorename: false,
        });
        return metaToEntry(data.metadata, accountId);
      }),
    );
  }

  async copy(accountId: string, paths: string[], destPath: string): Promise<Entry[]> {
    const token = await this.accessToken(accountId);
    return Promise.all(
      paths.map(async (p) => {
        const name = p.slice(p.lastIndexOf('/') + 1);
        const data = await this.apiPost<{ metadata: DbxMetadata }>('files/copy_v2', token, {
          from_path: toDbxPath(p),
          to_path: destPath ? `/${destPath}/${name}` : `/${name}`,
          autorename: false,
        });
        return metaToEntry(data.metadata, accountId);
      }),
    );
  }

  async trash(accountId: string, paths: string[]): Promise<void> {
    const token = await this.accessToken(accountId);
    await Promise.all(
      paths.map((p) =>
        this.apiPost<{ metadata: DbxMetadata }>('files/delete_v2', token, { path: toDbxPath(p) }),
      ),
    );
  }

  async download(accountId: string, remotePath: string, localDest: string): Promise<string> {
    const token = await this.accessToken(accountId);
    // Use https.request instead of fetch — undici adds Content-Length: 0 to no-body
    // POSTs, which Dropbox's content endpoint rejects with 400.
    const res = await contentRequest('/files/download', token, headerSafeJson({ path: toDbxPath(remotePath) }));
    if (res.statusCode !== 200) {
      const body = await readStream(res);
      const err = new Error(`Dropbox download failed (HTTP ${res.statusCode}): ${body}`) as NodeJS.ErrnoException;
      err.code = res.statusCode === 401 ? 'EAUTH' : res.statusCode === 403 ? 'EACCES' : 'EUNKNOWN';
      throw err;
    }
    await mkdir(localDest.slice(0, localDest.lastIndexOf('/')), { recursive: true });
    await pipeline(res, createWriteStream(localDest));
    return localDest;
  }

  async upload(accountId: string, localPath: string, remoteDest: string): Promise<Entry> {
    const token = await this.accessToken(accountId);
    const name = basename(localPath);
    const destDbxPath = remoteDest ? `/${remoteDest}/${name}` : `/${name}`;
    const content = await readFile(localPath);
    const res = await fetch(`${CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': headerSafeJson({ path: destDbxPath, mode: 'add', autorename: true }),
      },
      body: content,
    });
    await checkStatus(res, 'upload');
    return metaToEntry((await res.json()) as DbxMetadata, accountId);
  }

  async thumbnail(accountId: string, path: string, size: number): Promise<string | null> {
    try {
      const token = await this.accessToken(accountId);
      const dbxSize = size <= 64 ? 'w64h64' : size <= 128 ? 'w128h128' : size <= 256 ? 'w256h256' : 'w480h320';
      const res = await contentRequest(
        '/files/get_thumbnail_v2',
        token,
        headerSafeJson({
          resource: { '.tag': 'path', path: toDbxPath(path) },
          format: { '.tag': 'jpeg' },
          size: { '.tag': dbxSize },
          mode: { '.tag': 'strict' },
        }),
      );
      if (res.statusCode !== 200) return null;
      const buf = Buffer.concat(await collectChunks(res));
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
