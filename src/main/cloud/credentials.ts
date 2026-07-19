/**
 * Resolve cloud-provider OAuth client credentials.
 *
 * Local dev reads them from a `.env` file (loaded by `dotenv/config` in
 * `src/main/index.ts`). A packaged build has no `.env` next to the binary, so
 * the client IDs are **inlined at build time** via Vite `define`
 * (see `electron.vite.config.ts`, fed from `GDRIVE_CLIENT_ID`/… — supplied by
 * CI secrets in `.github/workflows/release.yml`). Runtime env always wins, so a
 * developer's `.env` overrides whatever was baked in.
 *
 * Client **secrets** are only inlined if present at build time; public/native
 * desktop OAuth clients leave them blank (see `.env.example`).
 */

type CredentialKind = 'CLIENT_ID' | 'CLIENT_SECRET';

// Replaced by Vite `define` at build time (JSON string literals, '' when unset).
// In unbundled contexts (vitest) these identifiers don't exist, so every read
// is guarded with `typeof` — which is safe on an undeclared name and yields ''.
// The `__NAME__` form is the Vite define convention; it trips naming-convention.
/* eslint-disable @typescript-eslint/naming-convention */
declare const __CLOUD_GDRIVE_CLIENT_ID__: string;
declare const __CLOUD_GDRIVE_CLIENT_SECRET__: string;
declare const __CLOUD_DROPBOX_CLIENT_ID__: string;
declare const __CLOUD_DROPBOX_CLIENT_SECRET__: string;
/* eslint-enable @typescript-eslint/naming-convention */

const BAKED: Record<string, string> = {
  GDRIVE_CLIENT_ID: typeof __CLOUD_GDRIVE_CLIENT_ID__ === 'string' ? __CLOUD_GDRIVE_CLIENT_ID__ : '',
  GDRIVE_CLIENT_SECRET:
    typeof __CLOUD_GDRIVE_CLIENT_SECRET__ === 'string' ? __CLOUD_GDRIVE_CLIENT_SECRET__ : '',
  DROPBOX_CLIENT_ID:
    typeof __CLOUD_DROPBOX_CLIENT_ID__ === 'string' ? __CLOUD_DROPBOX_CLIENT_ID__ : '',
  DROPBOX_CLIENT_SECRET:
    typeof __CLOUD_DROPBOX_CLIENT_SECRET__ === 'string' ? __CLOUD_DROPBOX_CLIENT_SECRET__ : '',
};

/**
 * Return an OAuth credential for a provider, preferring the runtime env (a
 * developer's `.env`) over the build-time baked default. Returns `undefined`
 * when neither is set — callers surface a "set <PREFIX>_<KIND>" error or, for
 * optional secrets, simply omit it.
 *
 * @param prefix provider env prefix, e.g. `GDRIVE`, `DROPBOX`
 */
export function cloudCredential(prefix: string, kind: CredentialKind): string | undefined {
  const key = `${prefix}_${kind}`;
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  return BAKED[key] || undefined;
}
