import {
  Synapse,
  WarmStorageService,
} from "@filoz/synapse-sdk";
import { ethers } from "ethers";
import { env } from "../config.js";

/**
 * Singleton instance for Synapse SDK
 */
let synapseInstance: Synapse | null = null;
let warmStorageServiceInstance: WarmStorageService | null = null;

/**
 * Configuration for Synapse initialization
 */
export interface SynapseConfig {
  withCDN?: boolean;
  disableNonceManager?: boolean;
}

/**
 * Initialize Synapse SDK with a signer
 * @param signer - Ethers signer instance
 * @param config - Synapse configuration options
 * @returns Object containing synapse and warmStorageService instances
 */
export async function initializeSynapse(
  signer: ethers.Signer,
  config: SynapseConfig = {}
): Promise<{ synapse: Synapse; warmStorageService: WarmStorageService }> {
  try {
    const synapse = await Synapse.create({
      signer,
      withCDN: config.withCDN ?? true,
      disableNonceManager: config.disableNonceManager ?? false,
    });

    const warmStorageService = await WarmStorageService.create(
      synapse.getProvider(),
      synapse.getWarmStorageAddress()
    );

    synapseInstance = synapse;
    warmStorageServiceInstance = warmStorageService;

    return { synapse, warmStorageService };
  } catch (error) {
    console.error("Failed to initialize Synapse:", error);
    throw new Error(`Synapse initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initialize Synapse with a private key (for MCP server usage)
 * @param privateKey - Private key for the wallet
 * @param rpcUrl - RPC URL for the blockchain network
 * @param config - Synapse configuration options
 * @returns Object containing synapse and warmStorageService instances
 */
export async function initializeSynapseFromPrivateKey(
  privateKey: string,
  rpcUrl: string,
  config: SynapseConfig = {}
): Promise<{ synapse: Synapse; warmStorageService: WarmStorageService }> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    return await initializeSynapse(wallet, config);
  } catch (error) {
    console.error("Failed to initialize Synapse from private key:", error);
    throw new Error(`Synapse initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initialize Synapse using environment variables
 * @param config - Synapse configuration options
 * @returns Object containing synapse and warmStorageService instances
 */
export async function initializeSynapseFromEnv(
  config: SynapseConfig = {}
): Promise<{ synapse: Synapse; warmStorageService: WarmStorageService }> {
  return await initializeSynapseFromPrivateKey(
    env.PRIVATE_KEY,
    env.RPC_URL,
    config
  );
}

/**
 * Get the current Synapse instance
 * @throws Error if Synapse hasn't been initialized
 */
export function getSynapse(): Synapse {
  if (!synapseInstance) {
    throw new Error("Synapse not initialized. Call initializeSynapse first.");
  }
  return synapseInstance;
}

/**
 * Get the current WarmStorageService instance
 * @throws Error if WarmStorageService hasn't been initialized
 */
export function getWarmStorageService(): WarmStorageService {
  if (!warmStorageServiceInstance) {
    throw new Error("WarmStorageService not initialized. Call initializeSynapse first.");
  }
  return warmStorageServiceInstance;
}

/**
 * Get both Synapse and WarmStorageService instances
 * @returns Object containing synapse and warmStorageService instances, or null if not initialized
 */
export function getSynapseInstances(): {
  synapse: Synapse | null;
  warmStorageService: WarmStorageService | null;
} {
  return {
    synapse: synapseInstance,
    warmStorageService: warmStorageServiceInstance,
  };
}

/**
 * Reset Synapse instances (useful for testing or re-initialization)
 */
export function resetSynapseInstances(): void {
  synapseInstance = null;
  warmStorageServiceInstance = null;
}