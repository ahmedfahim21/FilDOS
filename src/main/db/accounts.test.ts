import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock Electron's safeStorage with a passthrough "cipher" (encrypt = identity
 * bytes, decrypt = utf8) so the SQLite round-trip is real while the crypto is
 * deterministic. `available` is toggled per test to exercise the guard.
 */
const enc = { available: true };
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => enc.available,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { closeDb, initDb, rawDb } from './index';
import { getConfig, getToken, saveAccount, saveConfigAccount } from './accounts';
import type { OAuthToken } from '../cloud/oauth';

const TOKEN: OAuthToken = { accessToken: 'at', refreshToken: 'rt', expiresAt: 123 };

beforeEach(() => {
  enc.available = true;
  initDb(':memory:');
});
afterEach(() => closeDb());

describe('accounts secret storage', () => {
  it('round-trips an OAuth token', async () => {
    const acc = await saveAccount('gdrive', 'me@example.com', TOKEN);
    expect(await getToken(acc.id)).toEqual(TOKEN);
  });

  it('round-trips an OpenDAL config blob', async () => {
    const opts = { bucket: 'b', access_key_id: 'k' };
    const acc = await saveConfigAccount('s3', 'b', opts);
    expect(await getConfig(acc.id)).toEqual(opts);
  });

  it('returns null (not throws) when a stored blob cannot be decrypted/parsed', async () => {
    const acc = await saveAccount('gdrive', 'me@example.com', TOKEN);
    // Corrupt the ciphertext directly, as a keyring swap or bad row would.
    rawDb().prepare('UPDATE accounts SET token = ? WHERE id = ?').run('!!not-json!!', acc.id);
    expect(await getToken(acc.id)).toBeNull();
  });

  it('returns null for an unknown account id', async () => {
    expect(await getToken('nope')).toBeNull();
    expect(await getConfig('nope')).toBeNull();
  });

  it('refuses to save when secure storage is unavailable', async () => {
    enc.available = false;
    await expect(saveAccount('gdrive', 'x', TOKEN)).rejects.toMatchObject({ code: 'EUNAVAILABLE' });
    await expect(saveConfigAccount('s3', 'b', { bucket: 'b' })).rejects.toMatchObject({
      code: 'EUNAVAILABLE',
    });
  });
});
