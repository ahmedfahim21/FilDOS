import {
  Synapse,
  TIME_CONSTANTS,
  SIZE_CONSTANTS,
  TOKENS,
} from "@filoz/synapse-sdk";
import Decimal from "decimal.js";

import { MAX_UINT256 } from "@/utils/constants";
import { StorageCosts } from "@/types";

const bigintRatioToNumber = (numerator: bigint, denominator: bigint): number => {
  if (denominator === BigInt(0)) return Infinity;
  return new Decimal(numerator.toString())
    .div(new Decimal(denominator.toString()))
    .toNumber();
};

/**
 * Fetches the current storage costs from the WarmStorage service.
 * @param synapse - The Synapse instance
 * @returns The storage costs object
 */
export const fetchWarmStorageCosts = async (
  synapse: Synapse
): Promise<StorageCosts> => {
  const info = await synapse.storage.getStorageInfo();
  return {
    pricePerTiBPerMonthNoCDN: info.pricing.noCDN.perTiBPerMonth,
    pricePerTiBPerMonthWithCDN: info.pricing.withCDN.perTiBPerMonth,
  };
};
export const calculateStorageMetrics = async (
  synapse: Synapse,
  config: {
    storageCapacity: number;
    persistencePeriod: number;
    minDaysThreshold: number;
  },
  fileSize?: number
) => {

  const bytesToStore: bigint = fileSize !== undefined
    ? BigInt(fileSize)
    : BigInt(config.storageCapacity) * SIZE_CONSTANTS.GiB;

  const warmStorageAddress = synapse.chain.contracts.fwss.address;

  // Fetch approval info, account info, and upload costs in parallel.
  // `getUploadCosts` computes the *exact* additional deposit required given
  // current balance, rate-based lockup, CDN fixed lockup (when withCDN+isNewDataSet),
  // debt, runway and buffer epochs. Defaults to isNewDataSet=true — conservative,
  // matching the SDK's actual lockup check at upload time.
  //
  // `extraRunwayEpochs` forces a real time buffer: the SDK's default buffer is
  // skipped for first-time users (currentLockupRate === 0 && isNewDataSet),
  // which yields a deposit sized to the exact minimum — and by the time the
  // deposit tx settles, rate-based lockup has accrued past it and the upload
  // reverts with InsufficientLockupFunds. 240 epochs ≈ 2 hours at 30s/epoch.
  const [allowance, accountInfo, uploadCosts] = await Promise.all([
    synapse.payments.serviceApproval({ service: warmStorageAddress }),
    synapse.payments.accountInfo({ token: TOKENS.USDFC }),
    synapse.storage.getUploadCosts({
      dataSize: bytesToStore,
      withCDN: true,
      extraRunwayEpochs: BigInt(240),
    }),
  ]);

  const availableFunds = accountInfo.availableFunds;

  const currentMonthlyRate = allowance.rateUsage * TIME_CONSTANTS.EPOCHS_PER_MONTH;
  const currentDailyRate = allowance.rateUsage * TIME_CONSTANTS.EPOCHS_PER_DAY;

  const maxMonthlyRate = uploadCosts.rate.perMonth;
  const perDay = uploadCosts.rate.perEpoch * TIME_CONSTANTS.EPOCHS_PER_DAY;

  const daysLeft = bigintRatioToNumber(availableFunds, perDay);
  const daysLeftAtCurrentRate = bigintRatioToNumber(availableFunds, currentDailyRate);

  const depositNeeded = uploadCosts.depositNeeded;

  const targetCoverage = perDay * BigInt(config.persistencePeriod);
  const availableToFreeUp =
    availableFunds > targetCoverage ? availableFunds - targetCoverage : BigInt(0);

  const isRateSufficient = allowance.rateAllowance >= MAX_UINT256 / BigInt(2);
  const isLockupSufficient = allowance.lockupAllowance >= MAX_UINT256 / BigInt(2);

  const isSufficient =
    isRateSufficient &&
    isLockupSufficient &&
    depositNeeded === BigInt(0) &&
    daysLeft >= config.minDaysThreshold;

  return {
    rateNeeded: MAX_UINT256,
    depositNeeded,
    availableToFreeUp,
    lockupNeeded: MAX_UINT256,
    daysLeft,
    daysLeftAtCurrentRate,
    isRateSufficient,
    isLockupSufficient,
    isSufficient,
    totalConfiguredCapacity: config.storageCapacity,
    currentMonthlyRate,
    maxMonthlyRate,
  };
};
