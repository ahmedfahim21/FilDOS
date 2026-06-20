import type { Entry, FileInfo } from '@shared/types';

/**
 * Interface every cloud provider must implement. Paths passed to all methods
 * are the `path` component of a parsed RemoteRef (everything after
 * `provider://accountId/`). The account ID is always passed explicitly so
 * providers can load the right credentials from the accounts table.
 *
 * All methods throw on failure; the IPC handler layer wraps them in Result<T>.
 */
export interface Provider {
  listDir(accountId: string, path: string): Promise<Entry[]>;
  getInfo(accountId: string, path: string): Promise<FileInfo>;
  createFolder(accountId: string, parentPath: string, name: string): Promise<Entry>;
  rename(accountId: string, path: string, newName: string): Promise<Entry>;
  move(accountId: string, paths: string[], destPath: string): Promise<Entry[]>;
  copy(accountId: string, paths: string[], destPath: string): Promise<Entry[]>;
  trash(accountId: string, paths: string[]): Promise<void>;
  download(accountId: string, remotePath: string, localDest: string): Promise<void>;
  upload(accountId: string, localPath: string, remoteDest: string): Promise<Entry>;
  thumbnail(accountId: string, path: string, size: number): Promise<string | null>;
}
