import { createPublicClient, http, type Abi } from "viem";
import { filecoinCalibration } from "viem/chains";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "./contracts";

// Public RPC endpoint for Filecoin Calibration testnet
const CALIBRATION_RPC = "https://api.calibration.node.glif.io/rpc/v1";

const ABI = CONTRACT_ABI as Abi;

/**
 * Fetches folder data from the contract on the server side.
 * Used for generating metadata in Next.js layouts.
 */
export async function getFolderDataForMetadata(
  tokenId: string
): Promise<{ name: string } | null> {
  try {
    const client = createPublicClient({
      chain: filecoinCalibration,
      transport: http(CALIBRATION_RPC),
    });

    const data = (await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "getFolderData",
      args: [BigInt(tokenId)],
    })) as { name: string };

    return {
      name: data.name || `Folder ${tokenId}`,
    };
  } catch (error) {
    console.error("Error fetching folder data for metadata:", error);
    return null;
  }
}
