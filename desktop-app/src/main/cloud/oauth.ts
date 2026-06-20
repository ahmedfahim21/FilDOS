import { shell } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { callbackPage } from './callbackPage';

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds when the access token expires, if known. */
  expiresAt?: number;
  scope?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Additional static params to include in the authorization URL. */
  extraParams?: Record<string, string>;
  /**
   * Fixed loopback port for providers that require an exact redirect URI match
   * (e.g. Dropbox). Leave undefined to let the OS pick an ephemeral port.
   * Register the matching URI in the provider console:
   *   http://localhost:<callbackPort>/callback
   */
  callbackPort?: number;
}

/**
 * Run a PKCE loopback OAuth flow.
 *
 * 1. Generate a code verifier + S256 challenge.
 * 2. Spin up a one-shot HTTP server on an ephemeral loopback port.
 * 3. Open the authorization URL in the user's default browser.
 * 4. Wait for the redirect callback carrying the auth code.
 * 5. Exchange the code for tokens and return them.
 */
export async function runOAuthFlow(config: OAuthConfig): Promise<OAuthToken> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  const { server, port, codePromise } = await startCallbackServer(state, config.callbackPort);
  const redirectUri = `http://localhost:${port}/callback`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...config.extraParams,
  });

  await shell.openExternal(`${config.authorizationUrl}?${params}`);

  let code: string;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope,
  };
}

function startCallbackServer(
  expectedState: string,
  fixedPort?: number,
): Promise<{ server: ReturnType<typeof createServer>; port: number; codePromise: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackPage(false, 'Authentication failed', error.replace(/_/g, ' ')));
          rejectCode(new Error(`OAuth denied: ${error}`));
          return;
        }

        if (!code || returnedState !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackPage(false, 'Something went wrong', 'Invalid callback. You may close this tab.'));
          rejectCode(new Error('OAuth callback missing code or state mismatch.'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(true, "You're all set", 'Authentication complete. You may close this tab.'));
        resolveCode(code);
      } catch (err) {
        rejectCode(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.listen(fixedPort ?? 0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port, codePromise });
    });

    server.on('error', reject);
  });
}
