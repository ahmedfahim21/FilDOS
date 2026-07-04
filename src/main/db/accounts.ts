import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { db, rawDb } from './index';
import { accounts } from './schema';
import type { AccountRecord } from '@shared/types';
import type { OAuthToken } from '../cloud/oauth';

/**
 * Guard writes when the OS secure store is unavailable (most often a Linux box
 * with no unlocked keyring). Without it, `safeStorage` silently degrades to weak
 * obfuscation, so we refuse rather than persist credentials that only look
 * protected. macOS (Keychain) and Windows (DPAPI) are always available.
 */
function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw Object.assign(
      new Error(
        'Secure credential storage is unavailable — no OS keyring was detected. ' +
          'Unlock your login keyring and try connecting again.',
      ),
      { code: 'EUNAVAILABLE' },
    );
  }
}

/**
 * Decrypt a stored token blob. Returns null when it can't be decrypted or parsed
 * — e.g. the `safeStorage` backend changed between runs (a Linux keyring swap
 * orphans older ciphertext) or the row is corrupt. Callers treat null as
 * "needs reconnect" rather than crashing.
 */
function tryDecrypt<T>(blob: string): T | null {
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(blob, 'base64'))) as T;
  } catch {
    return null;
  }
}

/**
 * Save an account. If an account with the same provider + label already exists
 * (e.g. the user reconnects to pick up new OAuth scopes), update its token in
 * place rather than creating a duplicate with a new UUID.
 *
 * Uses rawDb() for the SELECT + UPDATE to avoid a Drizzle sqlite-proxy bug
 * where column values returned from `.get()` are mis-encoded in a subsequent
 * `.where(eq(...))`, producing `"id" - ?` instead of `"id" = ?`.
 */
export async function saveAccount(
  provider: string,
  label: string,
  token: OAuthToken,
): Promise<AccountRecord> {
  assertEncryptionAvailable();
  const encrypted = safeStorage.encryptString(JSON.stringify(token)).toString('base64');
  const existing = rawDb()
    .prepare('SELECT id, created_at FROM accounts WHERE provider = ? AND label = ?')
    .get(provider, label) as { id: string; created_at: number } | undefined;
  if (existing) {
    rawDb()
      .prepare('UPDATE accounts SET token = ? WHERE id = ?')
      .run(encrypted, existing.id);
    return { id: existing.id, provider, label, createdAt: existing.created_at };
  }
  const id = randomUUID();
  const createdAt = Date.now();
  await db().insert(accounts).values({ id, provider, label, token: encrypted, createdAt });
  return { id, provider, label, createdAt };
}

/**
 * Save a non-OAuth account whose "credentials" are an OpenDAL options object
 * (S3 keys, an IPFS endpoint, OneDrive tokens, …). Stored in the same encrypted
 * `token` column as OAuth accounts — it's an opaque encrypted JSON blob either
 * way — so no schema change is needed. Reconnecting the same provider+label
 * updates the stored config in place.
 */
export async function saveConfigAccount(
  provider: string,
  label: string,
  options: Record<string, string>,
): Promise<AccountRecord> {
  assertEncryptionAvailable();
  const encrypted = safeStorage.encryptString(JSON.stringify(options)).toString('base64');
  const existing = rawDb()
    .prepare('SELECT id, created_at FROM accounts WHERE provider = ? AND label = ?')
    .get(provider, label) as { id: string; created_at: number } | undefined;
  if (existing) {
    rawDb().prepare('UPDATE accounts SET token = ? WHERE id = ?').run(encrypted, existing.id);
    return { id: existing.id, provider, label, createdAt: existing.created_at };
  }
  const id = randomUUID();
  const createdAt = Date.now();
  await db().insert(accounts).values({ id, provider, label, token: encrypted, createdAt });
  return { id, provider, label, createdAt };
}

/** Decrypt and return the OpenDAL options for a config account, or null if not found. */
export async function getConfig(accountId: string): Promise<Record<string, string> | null> {
  const row = await db()
    .select({ token: accounts.token })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (!row) return null;
  return tryDecrypt<Record<string, string>>(row.token as string);
}

/** All stored accounts, ordered by creation time ascending. */
export async function listAccounts(): Promise<AccountRecord[]> {
  const rows = await db()
    .select({ id: accounts.id, provider: accounts.provider, label: accounts.label, createdAt: accounts.createdAt })
    .from(accounts);
  return rows as AccountRecord[];
}

/** Decrypt and return the OAuth token for a given account, or null if not found. */
export async function getToken(accountId: string): Promise<OAuthToken | null> {
  const row = await db()
    .select({ token: accounts.token })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (!row) return null;
  return tryDecrypt<OAuthToken>(row.token as string);
}

/** Overwrite the stored token for an account (called after a successful refresh). */
export async function updateToken(accountId: string, token: OAuthToken): Promise<void> {
  assertEncryptionAvailable();
  const encrypted = safeStorage.encryptString(JSON.stringify(token)).toString('base64');
  await db().update(accounts).set({ token: encrypted }).where(eq(accounts.id, accountId));
}

/** Remove an account and its encrypted token. */
export async function deleteAccount(accountId: string): Promise<void> {
  await db().delete(accounts).where(eq(accounts.id, accountId));
}
