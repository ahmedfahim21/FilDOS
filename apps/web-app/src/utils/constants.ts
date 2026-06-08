import { mainnet, calibration } from "@filoz/synapse-sdk";

export const getWarmStorageAddress = (network: "mainnet" | "calibration") => {
  return network === "mainnet"
    ? mainnet.contracts.fwss.address
    : calibration.contracts.fwss.address;
};

export const MAX_UINT256 = BigInt(2) ** BigInt(256) - BigInt(1);

export const CDN_DATA_SET_CREATION_COST = BigInt(1 * 10 ** 18); // 1 USDFC for CDN dataset egress credits
