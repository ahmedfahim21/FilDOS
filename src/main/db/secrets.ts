import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { rawDb } from './index';

/**
 * A tiny encrypted key→value store for main-process secrets (e.g. the
 * supermemory LLM provider key). Values are encrypted with Electron's
 * `safeStorage` (OS keychain-backed) and never leave the main process. It reuses
 * the `accounts` table under a reserved `provider = 'secret'` namespace, so no
 * new migration is needed. Single-statement mutations, like the rest of db/.
 */

const NAMESPACE = 'secret';

/** Store (or overwrite) an encrypted secret by name. */
export function setSecret(name: string, value: string): void {
  const encrypted = safeStorage.encryptString(value).toString('base64');
  const existing = rawDb()
    .prepare('SELECT id FROM accounts WHERE provider = ? AND label = ?')
    .get(NAMESPACE, name) as { id: string } | undefined;
  if (existing) {
    rawDb().prepare('UPDATE accounts SET token = ? WHERE id = ?').run(encrypted, existing.id);
  } else {
    rawDb()
      .prepare('INSERT INTO accounts (id, provider, label, token, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), NAMESPACE, name, encrypted, Date.now());
  }
}

/** Decrypt and return a secret, or null if unset. */
export function getSecret(name: string): string | null {
  const row = rawDb()
    .prepare('SELECT token FROM accounts WHERE provider = ? AND label = ?')
    .get(NAMESPACE, name) as { token: string } | undefined;
  if (!row) return null;
  return safeStorage.decryptString(Buffer.from(row.token, 'base64'));
}

/** Whether a secret exists (without decrypting it). */
export function hasSecret(name: string): boolean {
  return (
    rawDb().prepare('SELECT 1 FROM accounts WHERE provider = ? AND label = ?').get(NAMESPACE, name) !==
    undefined
  );
}

/** Remove a secret. */
export function deleteSecret(name: string): void {
  rawDb().prepare('DELETE FROM accounts WHERE provider = ? AND label = ?').run(NAMESPACE, name);
}
