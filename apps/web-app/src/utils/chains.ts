import { filecoin, filecoinCalibration } from "viem/chains";

export const FILECOIN_MAINNET_ID = filecoin.id;
export const FILECOIN_CALIBRATION_ID = filecoinCalibration.id;

export const SUPPORTED_CHAIN_IDS = [
  FILECOIN_MAINNET_ID,
  FILECOIN_CALIBRATION_ID,
] as const;

export const isSupportedChain = (chainId: number | undefined): boolean =>
  chainId !== undefined && (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
