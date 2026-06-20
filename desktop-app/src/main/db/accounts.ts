import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { db } from './index';
import { accounts } from './schema';
import type { AccountRecord } from '@shared/types';
import type { OAuthToken } from '../cloud/oauth';

/** Store a new account; returns the saved record (without the token). */
export async function saveAccount(
  provider: string,
  label: string,
  token: OAuthToken,
): Promise<AccountRecord> {
  const id = randomUUID();
  const encrypted = safeStorage.encryptString(JSON.stringify(token)).toString('base64');
  const createdAt = Date.now();
  await db().insert(accounts).values({ id, provider, label, token: encrypted, createdAt });
  return { id, provider, label, createdAt };
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
  const decrypted = safeStorage.decryptString(Buffer.from(row.token as string, 'base64'));
  return JSON.parse(decrypted) as OAuthToken;
}

/** Overwrite the stored token for an account (called after a successful refresh). */
export async function updateToken(accountId: string, token: OAuthToken): Promise<void> {
  const encrypted = safeStorage.encryptString(JSON.stringify(token)).toString('base64');
  await db().update(accounts).set({ token: encrypted }).where(eq(accounts.id, accountId));
}

/** Remove an account and its encrypted token. */
export async function deleteAccount(accountId: string): Promise<void> {
  await db().delete(accounts).where(eq(accounts.id, accountId));
}
