import { ipcMain } from 'electron';
import { Channels } from '@shared/channels';
import type { AccountRecord, AppError, Result } from '@shared/types';
import { runOAuthFlow, type OAuthConfig } from './oauth';
import * as accountsDb from '../db/accounts';

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
    scopes: [],
    extraParams: { token_access_type: 'offline' },
    profileUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
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

  return providerId;
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
      return accountsDb.saveAccount(providerId, label, token);
    }),
  );

  ipcMain.handle(Channels.cloudListAccounts, () =>
    wrap((): Promise<AccountRecord[]> => accountsDb.listAccounts()),
  );

  ipcMain.handle(Channels.cloudDisconnect, (_e, accountId: string) =>
    wrap((): Promise<void> => accountsDb.deleteAccount(accountId)),
  );
}
