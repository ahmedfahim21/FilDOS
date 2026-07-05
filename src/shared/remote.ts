/**
 * URI scheme helpers for remote cloud paths. Dependency-free so this module
 * can be imported from any layer (main, preload, renderer, shared).
 *
 * Format:  provider://accountId/path
 * Examples:
 *   gdrive://acc123/             – GDrive account root
 *   gdrive://acc123/folderXYZ    – GDrive folder by file ID
 *   dropbox://acc456/path/to/dir – Dropbox hierarchical path
 */

export interface RemoteRef {
  /** Provider identifier, e.g. 'gdrive', 'dropbox'. */
  provider: string;
  /** Opaque account identifier stored in the accounts table. */
  accountId: string;
  /** Path within the provider root (empty string for the account root). */
  path: string;
}

const REMOTE_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/]+)(?:\/(.*))?$/;

/** True when `p` is a remote cloud URI rather than a local filesystem path. */
export function isRemote(p: string): boolean {
  return REMOTE_RE.test(p);
}

/**
 * Parse a remote URI into its components. Returns null for local paths or
 * malformed URIs — callers should fall back to local handling.
 */
export function parseRemote(uri: string): RemoteRef | null {
  const m = REMOTE_RE.exec(uri);
  if (!m) return null;
  return { provider: m[1], accountId: m[2], path: m[3] ?? '' };
}

/** Reconstruct a remote URI from its parts. */
export function formatRemote(provider: string, accountId: string, path: string): string {
  return path ? `${provider}://${accountId}/${path}` : `${provider}://${accountId}/`;
}

/** Human-friendly names for the known cloud providers. */
const PROVIDER_LABELS: Record<string, string> = {
  gdrive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  s3: 'Amazon S3',
  ipfs: 'IPFS',
  mega: 'Mega',
};

/** A display name for a provider id, falling back to the id itself. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}
