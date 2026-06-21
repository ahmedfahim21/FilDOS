import { extname, basename } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { formatRemote } from '@shared/remote';
import type { Entry, FileInfo } from '@shared/types';
import type { Provider } from '../provider';
import type { OAuthToken } from '../oauth';
import * as accountsDb from '../../db/accounts';

const PROVIDER_ID = 'gdrive';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink';

// Google Workspace MIME → export format.
const WORKSPACE_EXPORT: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: '.pptx',
  },
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  parents?: string[];
}

/**
 * Remote path segments use "displayName|driveId" encoding so baseName/breadcrumbs
 * can show the human name while the ID is available for API calls.
 * e.g. "Documents|1BxiM/report.pdf|2CyiN"
 */
function fileId(path: string): string {
  if (!path) return 'root';
  const seg = path.slice(path.lastIndexOf('/') + 1);
  const bar = seg.lastIndexOf('|');
  return bar === -1 ? seg : seg.slice(bar + 1);
}

function childSegment(name: string, id: string): string {
  return `${name}|${id}`;
}

function driveFileToEntry(f: DriveFile, accountId: string, parentPath: string): Entry {
  const isDir = f.mimeType === FOLDER_MIME;
  const seg = childSegment(f.name, f.id);
  const remotePath = parentPath ? `${parentPath}/${seg}` : seg;
  return {
    name: f.name,
    path: formatRemote(PROVIDER_ID, accountId, remotePath),
    isDirectory: isDir,
    isSymlink: false,
    isHidden: false,
    size: parseInt(f.size ?? '0', 10),
    ext: isDir ? '' : extname(f.name).slice(1).toLowerCase(),
    modified: f.modifiedTime ? new Date(f.modifiedTime).getTime() : Date.now(),
    created: f.createdTime ? new Date(f.createdTime).getTime() : Date.now(),
  };
}

function makeAuthError(msg: string): NodeJS.ErrnoException {
  const err = new Error(msg) as NodeJS.ErrnoException;
  err.code = 'EAUTH';
  return err;
}

function throwOnStatus(res: Response): void {
  if (res.ok) return;
  const err = new Error() as NodeJS.ErrnoException;
  switch (res.status) {
    case 401:
      err.code = 'EAUTH';
      err.message = 'Session expired. Please reconnect this account.';
      break;
    case 403:
      err.code = 'EACCES';
      err.message = 'Permission denied by Google Drive.';
      break;
    case 404:
      err.code = 'ENOENT';
      err.message = 'This item no longer exists in Google Drive.';
      break;
    case 429:
      err.code = 'EBUSY';
      err.message = 'Google Drive rate limit exceeded. Try again in a moment.';
      break;
    default:
      err.code = 'EUNKNOWN';
      err.message = `Google Drive error (HTTP ${res.status}).`;
  }
  throw err;
}

export class GDriveProvider implements Provider {
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
      client_id: process.env.GDRIVE_CLIENT_ID ?? '',
    });
    if (process.env.GDRIVE_CLIENT_SECRET) body.set('client_secret', process.env.GDRIVE_CLIENT_SECRET);
    const res = await fetch('https://oauth2.googleapis.com/token', {
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

  private async driveGet(url: string, token: string): Promise<Response> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    throwOnStatus(res);
    return res;
  }

  async listDir(accountId: string, path: string): Promise<Entry[]> {
    const token = await this.accessToken(accountId);
    const parent = fileId(path);
    const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
    const fields = encodeURIComponent(`files(${FILE_FIELDS}),nextPageToken`);
    const entries: Entry[] = [];
    let pageToken: string | undefined;
    do {
      let url = `${DRIVE}/files?q=${q}&fields=${fields}&pageSize=1000&orderBy=name`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
      const res = await this.driveGet(url, token);
      const data = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
      for (const f of data.files) entries.push(driveFileToEntry(f, accountId, path));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return entries;
  }

  async getInfo(accountId: string, path: string): Promise<FileInfo> {
    const token = await this.accessToken(accountId);
    const id = fileId(path);
    const res = await this.driveGet(`${DRIVE}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`, token);
    const f = (await res.json()) as DriveFile;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const entry = driveFileToEntry(f, accountId, parentPath);
    // Use the exact path that was requested (not rebuilt from Drive metadata).
    return {
      ...entry,
      path: formatRemote(PROVIDER_ID, accountId, path),
      accessed: entry.modified,
      mode: 0,
      permissions: '',
      realPath: null,
    };
  }

  async createFolder(accountId: string, parentPath: string, name: string): Promise<Entry> {
    const token = await this.accessToken(accountId);
    const res = await fetch(`${DRIVE}/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [fileId(parentPath)] }),
    });
    throwOnStatus(res);
    return driveFileToEntry((await res.json()) as DriveFile, accountId, parentPath);
  }

  async rename(accountId: string, path: string, newName: string): Promise<Entry> {
    const token = await this.accessToken(accountId);
    const id = fileId(path);
    const res = await fetch(
      `${DRIVE}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      },
    );
    throwOnStatus(res);
    const f = (await res.json()) as DriveFile;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    return driveFileToEntry(f, accountId, parentPath);
  }

  async move(accountId: string, paths: string[], destPath: string): Promise<Entry[]> {
    const token = await this.accessToken(accountId);
    const destId = fileId(destPath);
    return Promise.all(
      paths.map(async (p) => {
        const id = fileId(p);
        const infoRes = await this.driveGet(`${DRIVE}/files/${id}?fields=parents`, token);
        const { parents = [] } = (await infoRes.json()) as { parents?: string[] };
        const qs = new URLSearchParams({ addParents: destId, fields: FILE_FIELDS });
        if (parents.length) qs.set('removeParents', parents.join(','));
        const res = await fetch(`${DRIVE}/files/${id}?${qs}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        throwOnStatus(res);
        return driveFileToEntry((await res.json()) as DriveFile, accountId, destPath);
      }),
    );
  }

  async copy(accountId: string, paths: string[], destPath: string): Promise<Entry[]> {
    const token = await this.accessToken(accountId);
    const destId = fileId(destPath);
    return Promise.all(
      paths.map(async (p) => {
        const res = await fetch(
          `${DRIVE}/files/${fileId(p)}/copy?fields=${encodeURIComponent(FILE_FIELDS)}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ parents: [destId] }),
          },
        );
        throwOnStatus(res);
        return driveFileToEntry((await res.json()) as DriveFile, accountId, destPath);
      }),
    );
  }

  async trash(accountId: string, paths: string[]): Promise<void> {
    const token = await this.accessToken(accountId);
    await Promise.all(
      paths.map(async (p) => {
        const res = await fetch(`${DRIVE}/files/${fileId(p)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        });
        throwOnStatus(res);
      }),
    );
  }

  /**
   * Download a Drive file to `localDest`.
   * For Google Workspace files (Docs/Sheets/Slides), exports to an Office format
   * and appends the correct extension. Returns the actual path written.
   */
  async download(accountId: string, remotePath: string, localDest: string): Promise<string> {
    const token = await this.accessToken(accountId);
    const id = fileId(remotePath);

    const metaRes = await this.driveGet(`${DRIVE}/files/${id}?fields=mimeType`, token);
    const { mimeType } = (await metaRes.json()) as { mimeType: string };

    let url: string;
    let outPath = localDest;

    const exportFmt = WORKSPACE_EXPORT[mimeType];
    if (exportFmt) {
      url = `${DRIVE}/files/${id}/export?mimeType=${encodeURIComponent(exportFmt.mime)}`;
      // Replace or append the right extension.
      const base = localDest.replace(/\.[^./\\]*$/, '');
      outPath = base + exportFmt.ext;
    } else {
      url = `${DRIVE}/files/${id}?alt=media`;
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    throwOnStatus(res);
    if (!res.body) throw new Error('Empty response from Google Drive.');

    await mkdir(outPath.slice(0, outPath.lastIndexOf('/')), { recursive: true });
    await pipeline(
      Readable.fromWeb(res.body as NodeReadableStream),
      createWriteStream(outPath),
    );
    return outPath;
  }

  async upload(accountId: string, localPath: string, remoteDest: string): Promise<Entry> {
    const token = await this.accessToken(accountId);
    const name = basename(localPath);
    const content = await readFile(localPath);
    const boundary = `fildos_${Date.now()}`;
    const meta = JSON.stringify({ name, parents: [fileId(remoteDest)] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    throwOnStatus(res);
    return driveFileToEntry((await res.json()) as DriveFile, accountId, remoteDest);
  }

  async thumbnail(accountId: string, path: string, _size: number): Promise<string | null> {
    try {
      const token = await this.accessToken(accountId);
      const res = await this.driveGet(
        `${DRIVE}/files/${fileId(path)}?fields=thumbnailLink`,
        token,
      );
      const { thumbnailLink } = (await res.json()) as { thumbnailLink?: string };
      if (!thumbnailLink) return null;
      const imgRes = await fetch(thumbnailLink);
      if (!imgRes.ok) return null;
      const buf = await imgRes.arrayBuffer();
      const ct = imgRes.headers.get('Content-Type') ?? 'image/jpeg';
      return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
      return null;
    }
  }
}
