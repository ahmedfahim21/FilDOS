import { ipcMain } from 'electron';
import { Operator } from 'opendal';
import { Channels } from '@shared/channels';
import type { AccountRecord, AppError, Result } from '@shared/types';
import { findBackend } from '@shared/opendalBackends';
import { isLlmAccountProvider } from '@shared/cloudLlm';
import { runOAuthFlow, type OAuthConfig } from './oauth';
import { getProvider } from './registry';
import * as accountsDb from '../db/accounts';

/** Evict an OpenDAL provider's cached Operator for an account after its config changes. */
function evictOperator(providerId: string, accountId: string): void {
  const p = getProvider(providerId) as { invalidate?: (id: string) => void } | null;
  p?.invalidate?.(accountId);
}

/** OAuth config for each supported provider (credentials supplied via env). */
const PROVIDER_OAUTH: Record<
  string,
  Omit<OAuthConfig, 'clientId' | 'clientSecret'> & { profileUrl: string }
> = {
  gdrive: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  dropbox: {
    authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: [
      'files.metadata.read',
      'files.metadata.write',
      'files.content.read',
      'files.content.write',
      'account_info.read',
    ],
    extraParams: { token_access_type: 'offline', force_reapprove: 'true' },
    profileUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
    // Dropbox requires an exact redirect URI match (no port wildcard).
    // Register http://localhost:47823/callback in the Dropbox app console.
    callbackPort: 47823,
  },
  // OneDrive is served by OpenDAL: OAuth here, then stored as an OpenDAL config
  // blob (see connect handler) so the operator can auto-refresh the token.
  onedrive: {
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Files.ReadWrite.All', 'offline_access', 'User.Read'],
    profileUrl: 'https://graph.microsoft.com/v1.0/me',
  },
};

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = err as Error & { code?: string };
    const error: AppError = { code: e.code ?? 'EUNKNOWN', message: e.message ?? 'Something went wrong.' };
    return { ok: false, error };
  }
}

/** Fetch the user's display label (email / account name) after token exchange. */
async function fetchLabel(providerId: string, accessToken: string): Promise<string> {
  const cfg = PROVIDER_OAUTH[providerId];
  if (!cfg) return providerId;

  if (providerId === 'gdrive') {
    const res = await fetch(cfg.profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return 'Google Drive';
    const data = (await res.json()) as { email?: string; name?: string };
    return data.email ?? data.name ?? 'Google Drive';
  }

  if (providerId === 'dropbox') {
    const res = await fetch(cfg.profileUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: 'null',
    });
    if (!res.ok) return 'Dropbox';
    const data = (await res.json()) as { email?: string; name?: { display_name?: string } };
    return data.email ?? data.name?.display_name ?? 'Dropbox';
  }

  if (providerId === 'onedrive') {
    const res = await fetch(cfg.profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return 'OneDrive';
    const data = (await res.json()) as { userPrincipalName?: string; mail?: string; displayName?: string };
    return data.mail ?? data.userPrincipalName ?? data.displayName ?? 'OneDrive';
  }

  return providerId;
}

/** A short account label derived from an OpenDAL config account's options. */
function configLabel(providerId: string, options: Record<string, string>): string {
  switch (providerId) {
    case 's3':
      return options.bucket || 'S3 bucket';
    case 'ipfs':
      return options.endpoint || 'IPFS';
    default:
      return findBackend(providerId)?.name ?? providerId;
  }
}

export function registerCloudHandlers(): void {
  /**
   * Kick off the OAuth loopback flow for a provider and store the resulting
   * account. Returns the saved AccountRecord on success.
   * Requires <PROVIDER>_CLIENT_ID (and optionally <PROVIDER>_CLIENT_SECRET)
   * environment variables to be set.
   */
  ipcMain.handle(Channels.cloudConnect, (_e, providerId: string) =>
    wrap(async (): Promise<AccountRecord> => {
      const base = PROVIDER_OAUTH[providerId];
      if (!base) {
        const err = new Error(`Unknown cloud provider: '${providerId}'.`) as NodeJS.ErrnoException;
        err.code = 'EINVAL';
        throw err;
      }

      const envPrefix = providerId.toUpperCase();
      const clientId = process.env[`${envPrefix}_CLIENT_ID`];
      if (!clientId) {
        const err = new Error(
          `Set ${envPrefix}_CLIENT_ID (and optionally ${envPrefix}_CLIENT_SECRET) to connect ${providerId}.`,
        ) as NodeJS.ErrnoException;
        err.code = 'EINVAL';
        throw err;
      }
      const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];

      const { profileUrl: _unused, ...oauthBase } = base;
      const config: OAuthConfig = { ...oauthBase, clientId, clientSecret };
      const token = await runOAuthFlow(config);
      const label = await fetchLabel(providerId, token.accessToken);

      // OpenDAL-backed OAuth providers (OneDrive) store their tokens as an
      // OpenDAL options blob so the operator can auto-refresh; the plain
      // gdrive/dropbox providers keep the raw OAuthToken.
      const backend = findBackend(providerId);
      if (backend?.auth === 'oauth') {
        const options: Record<string, string> = {
          access_token: token.accessToken,
          client_id: clientId,
          root: '/',
        };
        if (token.refreshToken) options.refresh_token = token.refreshToken;
        if (clientSecret) options.client_secret = clientSecret;
        const record = await accountsDb.saveConfigAccount(providerId, label, options);
        evictOperator(providerId, record.id); // reconnect: drop the stale Operator
        return record;
      }
      return accountsDb.saveAccount(providerId, label, token);
    }),
  );

  /**
   * Connect a config-based OpenDAL backend (S3, IPFS, …) from a plain options
   * object. The credentials are validated by opening the operator and doing a
   * shallow list before they're stored encrypted.
   */
  ipcMain.handle(Channels.cloudConnectConfig, (_e, providerId: string, options: Record<string, string>) =>
    wrap(async (): Promise<AccountRecord> => {
      const backend = findBackend(providerId);
      if (!backend || backend.auth !== 'config') {
        throw Object.assign(new Error(`Unknown storage backend: '${providerId}'.`), { code: 'EINVAL' });
      }
      if (!backend.available) {
        throw Object.assign(
          new Error(backend.unavailableReason ?? `${backend.name} is not available.`),
          { code: 'EINVAL' },
        );
      }
      // Keep only non-empty values so optional fields don't override defaults.
      const opts: Record<string, string> = {};
      for (const [k, v] of Object.entries(options)) {
        if (typeof v === 'string' && v.trim()) opts[k] = v.trim();
      }
      // Validate connectivity/credentials before persisting.
      try {
        const op = new Operator(backend.scheme, opts);
        await op.list('');
      } catch (err) {
        const raw = (err as Error).message ?? '';
        // A read-only IPFS gateway (e.g. ipfs.io) rejects the MFS write API.
        const msg =
          providerId === 'ipfs' && /read only|405|not allowed/i.test(raw)
            ? 'This endpoint is read-only. IPFS needs a write-capable Kubo RPC API (e.g. http://127.0.0.1:5001), not a public gateway.'
            : `Could not connect: ${raw}`;
        throw Object.assign(new Error(msg), { code: 'EAUTH' });
      }
      const record = await accountsDb.saveConfigAccount(providerId, configLabel(providerId, opts), opts);
      evictOperator(providerId, record.id); // re-entered creds: drop any stale Operator
      return record;
    }),
  );

  ipcMain.handle(Channels.cloudListAccounts, () =>
    wrap(async (): Promise<AccountRecord[]> => {
      // BYO-key LLM connections share the accounts table but are not drives —
      // without this filter an Anthropic key would render in the sidebar.
      const accounts = await accountsDb.listAccounts();
      return accounts.filter((a) => !isLlmAccountProvider(a.provider));
    }),
  );

  ipcMain.handle(Channels.cloudDisconnect, (_e, accountId: string) =>
    wrap((): Promise<void> => accountsDb.deleteAccount(accountId)),
  );
}
