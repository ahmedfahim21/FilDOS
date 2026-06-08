import { contract, wallet } from '../blockchain.js';

/**
 * Validates if a user owns a specific folder token
 */
export async function validateOwnership(tokenId: string, userAddress?: string): Promise<boolean> {
  try {
    const owner = await contract.ownerOf(tokenId);
    const checkAddress = userAddress || wallet.address;
    return owner.toLowerCase() === checkAddress.toLowerCase();
  } catch (error) {
    console.error("Error validating ownership:", error);
    return false;
  }
}
