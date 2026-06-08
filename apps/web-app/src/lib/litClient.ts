/* eslint-disable @typescript-eslint/no-unused-vars -- intentional: stub
 * functions retain their original signatures so callers don't need updates
 * when this module is re-implemented for Lit Chipotle. */
/**
 * Lit Protocol integration — STUBBED.
 *
 * Background: this module previously implemented client-side file encryption
 * against Lit's Datil (v7) network, gated on the FolderNFT contract's
 * `canRead(tokenId, user)` via `evmContractConditions`. That approach also
 * worked under Lit's Naga (v8) SDK with minor changes.
 *
 * As of 2026-03-25, Lit has fully sunset BOTH Datil and Naga generations.
 * The only live Lit network is "Chipotle", which uses a fundamentally
 * different model:
 *
 *   - Encryption/decryption runs inside a Lit Action in a TEE, not client-side
 *   - Symmetric keys are derived from PKPs (Programmable Key Pairs), not from
 *     access control conditions baked into ciphertext
 *   - Access control is enforced via on-chain group membership configured
 *     through Lit's Dashboard / `AccountConfig` smart contract, not via
 *     runtime evmContractConditions
 *   - Per Lit's own docs, Chipotle's Encrypt/Decrypt is NOT a drop-in for
 *     wallet-authenticated decryption gated on dynamic on-chain conditions
 *
 * Re-enabling encryption for FilDOS therefore requires a redesign that maps
 * the FolderNFT permission model onto Lit Actions + PKPs + on-chain group
 * membership. This is product-level work, not an SDK swap. Until that lands,
 * config.encryptionEnabled gates the encryption UI off and these functions
 * throw if anything calls them.
 *
 * References:
 *   https://developer.litprotocol.com/llms.txt
 *   https://developer.litprotocol.com  (Dashboard for AccountConfig setup)
 */

const ENCRYPTION_DISABLED_MESSAGE =
  "Lit Protocol encryption is currently disabled — Datil/Naga networks are " +
  "sunset and a Chipotle-based redesign is pending. See src/lib/litClient.ts.";

export type EncryptedFileResult = {
  ciphertext: string;
  dataToEncryptHash: string;
  originalFileName: string;
  originalFileSize: number;
  originalFileType: string;
  encryptedAt: number;
};

export async function initLitClient(): Promise<never> {
  throw new Error(ENCRYPTION_DISABLED_MESSAGE);
}

export function getLitClient(): null {
  return null;
}

export async function encryptFileWithLit(
  _file: File,
  _tokenId: string
): Promise<EncryptedFileResult> {
  throw new Error(ENCRYPTION_DISABLED_MESSAGE);
}

export async function decryptFileWithLit(
  _ciphertext: string,
  _dataToEncryptHash: string,
  _metadata: {
    originalFileName: string;
    originalFileSize: number;
    originalFileType: string;
  },
  _tokenId: string,
  _walletClient: unknown
): Promise<File> {
  throw new Error(ENCRYPTION_DISABLED_MESSAGE);
}
