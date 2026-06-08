/**
 * High-precision storage calculations using Decimal.js
 * Handles unit conversions, persistence projections, and cost calculations
 */

import Decimal from "decimal.js";
import { PieceCID, SIZE_CONSTANTS, TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { DataSet, StorageCosts, UnifiedSizeInfo } from "@/types";
import { getSizeFromPieceCID } from "@filoz/synapse-core/piece";

/**
 * Returns the price per TiB per month, depending on CDN usage.
 * @param storageCosts - The storage cost object from WarmStorage service
 * @param withCDN - Whether to use CDN for storage
 * @returns The price per TiB per month as a bigint
 */
export const getPricePerTBPerMonth = (
  storageCosts: StorageCosts,
  withCDN: boolean
): bigint => {
  return withCDN
    ? storageCosts.pricePerTiBPerMonthWithCDN
    : storageCosts.pricePerTiBPerMonthNoCDN;
};

export const getDatasetSizeMessage = (datasetSizeInfo: {
  sizeInBytes: number;
  sizeInKiB: number;
  sizeInMiB: number;
  sizeInGB: number;
}) => {
  if (datasetSizeInfo.sizeInGB > 0.1) {
    return `Dataset size: ${datasetSizeInfo.sizeInGB.toFixed(4)} GB`;
  }
  if (datasetSizeInfo.sizeInMiB > 0.1) {
    return `Dataset size: ${datasetSizeInfo.sizeInMiB.toFixed(4)} MB`;
  }
  if (datasetSizeInfo.sizeInKiB > 0.1) {
    return `Dataset size: ${datasetSizeInfo.sizeInKiB.toFixed(4)} KB`;
  }
  return `Dataset size: ${datasetSizeInfo.sizeInBytes} Bytes`;
};

export const getDatasetsSizes = (datasets: DataSet[]): {
  sizeInGiB: number;
  cdnSizeInGiB: number;
  nonCdnSizeInGiB: number;
} => {
  const sizes = datasets.reduce((acc, dataset) => {
    if (dataset.withCDN) {
      acc.cdnSizeInBytes += Number(dataset.data?.pieces.reduce((acc, piece) => acc + getPieceInfoFromCidBytes(piece.pieceCid).sizeBytes, BigInt(0)));
    } else {
      acc.nonCdnSizeInBytes += Number(dataset.data?.pieces.reduce((acc, piece) => acc + getPieceInfoFromCidBytes(piece.pieceCid).sizeBytes, BigInt(0)));
    }
    acc.sizeInBytes += Number(dataset.data?.pieces.reduce((acc, piece) => acc + getPieceInfoFromCidBytes(piece.pieceCid).sizeBytes, BigInt(0)));
    return acc;
  }, { sizeInBytes: 0, cdnSizeInBytes: 0, nonCdnSizeInBytes: 0 } as {
    sizeInBytes: number;
    cdnSizeInBytes: number;
    nonCdnSizeInBytes: number;
  });
  return {
    sizeInGiB: Number(bytesToGiB(sizes.sizeInBytes).toNumber().toFixed(8)),
    cdnSizeInGiB: Number(bytesToGiB(sizes.cdnSizeInBytes).toNumber().toFixed(8)),
    nonCdnSizeInGiB: Number(bytesToGiB(sizes.nonCdnSizeInBytes).toNumber().toFixed(8)),
  };
}


// Configure Decimal.js: precision 34 handles Solidity uint256 and wei conversions
Decimal.set({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -21,
  toExpPos: 21,
  maxE: 9e15,
  minE: -9e15,
  modulo: Decimal.ROUND_DOWN,
});

// Type for values that can be converted to Decimal
type DecimalLike = bigint | string | number | Decimal;

/** Converts any numeric type to Decimal */
const toDecimal = (value: DecimalLike): Decimal =>
  value instanceof Decimal ? value : new Decimal(value.toString());

/** Converts bytes to KiB */
export const bytesToKiB = (bytes: DecimalLike): Decimal =>
  toDecimal(bytes).div(new Decimal(SIZE_CONSTANTS.KiB.toString()));

/** Converts bytes to MiB */
export const bytesToMiB = (bytes: DecimalLike): Decimal =>
  toDecimal(bytes).div(new Decimal(SIZE_CONSTANTS.MiB.toString()));

/** Converts bytes to GiB */
export const bytesToGiB = (bytes: DecimalLike): Decimal =>
  toDecimal(bytes).div(new Decimal(SIZE_CONSTANTS.GiB.toString()));

/** Converts TiB to bytes */
export const tibToBytes = (tib: DecimalLike): Decimal =>
  toDecimal(tib).mul(new Decimal(SIZE_CONSTANTS.TiB.toString()));

/**
 * Calculates days of storage persistence remaining
 * @returns Infinity if dailyBurnRate is zero
 */
export const calculatePersistenceDays = (
  lockupAllowance: DecimalLike,
  dailyBurnRate: DecimalLike
): Decimal => {
  const allowance = toDecimal(lockupAllowance);
  const rate = toDecimal(dailyBurnRate);
  return rate.isZero() ? new Decimal(Infinity) : allowance.div(rate);
};

/** Calculates persistence days with new vs current storage rates */
export const calculatePersistenceMetrics = (
  remainingLockup: bigint,
  newDailyLockupRate: bigint,
  currentDailyLockupRate: bigint
): {
  daysLeft: number;
  daysLeftAtCurrentRate: number;
} => {
  const remaining = toDecimal(remainingLockup);

  const daysLeft = calculatePersistenceDays(remaining, newDailyLockupRate);
  const daysAtCurrentRate = calculatePersistenceDays(
    remaining,
    currentDailyLockupRate
  );

  return {
    daysLeft: daysLeft.isFinite() ? daysLeft.toNumber() : Infinity,
    daysLeftAtCurrentRate: daysAtCurrentRate.isFinite()
      ? daysAtCurrentRate.toNumber()
      : Infinity,
  };
};

/** Formats ratio (0-1) as percentage with adaptive precision */
export const formatPercentage = (
  ratio: DecimalLike,
  options: {
    minDecimals?: number;
    maxDecimals?: number;
    showZero?: boolean;
  } = {}
): string => {
  const { minDecimals = 0, maxDecimals = 2, showZero = true } = options;
  const ratioD = toDecimal(ratio);

  if (ratioD.isZero()) return showZero ? "0%" : "< 0.01%";

  const percentage = ratioD.mul(100);
  if (percentage.lt(0.01) && !showZero) return "< 0.01%";

  // Adaptive precision: 10+ → 1 decimal, 1-10 → 2 decimals, <1 → max decimals
  const decimals = percentage.gte(10)
    ? Math.max(minDecimals, 1)
    : percentage.gte(1)
      ? Math.max(minDecimals, 2)
      : maxDecimals;

  return `${percentage.toDecimalPlaces(decimals)}%`;
};

/** Calculates GiB capacity from rate allowance and pricing */
export const calculateStorageCapacityGB = (
  rateAllowance: DecimalLike,
  pricePerTiBPerMonth: DecimalLike,
  epochsPerMonth: DecimalLike
): Decimal => {
  const rate = toDecimal(rateAllowance);
  const price = toDecimal(pricePerTiBPerMonth);
  const epochs = toDecimal(epochsPerMonth);

  if (price.isZero()) return new Decimal(0);

  // capacity = (rate * epochs * TiB) / price / GiB
  const monthlyBudget = rate.mul(epochs);
  const capacityBytes = monthlyBudget.mul(tibToBytes(1)).div(price);

  return bytesToGiB(capacityBytes);
};

/** Calculates monthly USDFC cost for storage */
export const calculateMonthlyCost = (
  storageBytes: DecimalLike,
  pricePerTiBPerMonth: DecimalLike
): Decimal => {
  const bytes = toDecimal(storageBytes);
  const price = toDecimal(pricePerTiBPerMonth);
  const storageInTiB = bytes.div(tibToBytes(1));
  return storageInTiB.mul(price);
};

/** Returns remaining lockup allowance (0 if fully used) */
export const calculateRemainingLockupAllowance = (
  currentLockupAllowance: bigint,
  currentLockupUsed: bigint
): bigint => {
  const allowance = toDecimal(currentLockupAllowance);
  const used = toDecimal(currentLockupUsed);
  return allowance.gt(used) ? BigInt(allowance.sub(used).toFixed(0)) : BigInt(0);
};

/** Converts per-epoch rate to daily rate */
export const calculateDailyLockupRate = (
  ratePerEpoch: bigint,
  epochsPerDay: bigint
): bigint => {
  const rate = toDecimal(ratePerEpoch);
  const epochs = toDecimal(epochsPerDay);
  return BigInt(rate.mul(epochs).toFixed(0));
};

/**
 * Checks if allowances + balance meet storage requirements.
 * Considers storage balance when evaluating minimum threshold sufficiency.
 */
export const calculateStorageSufficiency = (
  currentRateAllowance: bigint,
  currentRateUsed: bigint,
  newRateNeeded: bigint,
  remainingLockup: bigint,
  dailyLockupRate: bigint,
  minDaysThreshold: number,
  isAdditionalStorage: boolean = false
): {
  isRateSufficient: boolean;
  isLockupSufficient: boolean;
  isSufficient: boolean;
  totalRateNeeded: bigint;
} => {
  const rateAllowance = toDecimal(currentRateAllowance);
  const rateUsed = toDecimal(currentRateUsed);
  const newRate = toDecimal(newRateNeeded);
  const lockup = toDecimal(remainingLockup);
  const dailyRate = toDecimal(dailyLockupRate);

  const totalRate = isAdditionalStorage ? rateUsed.add(newRate) : newRate;
  const minLockup = dailyRate.mul(minDaysThreshold);

  const isRateSufficient = rateAllowance.gte(totalRate);

  const isLockupSufficient = lockup.gte(minLockup);

  return {
    isRateSufficient,
    isLockupSufficient,
    isSufficient: isRateSufficient && isLockupSufficient,
    totalRateNeeded: BigInt(totalRate.toFixed(0)),
  };
};

/** Calculates deposit, lockup, and rate needed for storage operation */
export const calculateTotalStorageRequirements = (
  currentLockupUsed: bigint,
  currentLockupAllowance: bigint,
  currentRateUsed: bigint,
  currentRateAllowance: bigint,
  newRateNeeded: bigint,
  dailyLockupRate: bigint,
  persistencePeriodDays: number,
  currentBalance: bigint
): {
  totalDepositNeeded: bigint;
  totalLockupNeeded: bigint;
  totalRateNeeded: bigint;
} => {
  const storageCost =
    newRateNeeded *
    BigInt(persistencePeriodDays.toFixed(0)) *
    TIME_CONSTANTS.EPOCHS_PER_DAY;

  const lockupUsed = toDecimal(currentLockupUsed);
  const lockupAllowance = toDecimal(currentLockupAllowance);
  const rateUsed = toDecimal(currentRateUsed);
  const rateAllowance = toDecimal(currentRateAllowance);
  const newRate = toDecimal(newRateNeeded);
  const dailyRate = toDecimal(dailyLockupRate);
  const balance = toDecimal(currentBalance);
  const cost = toDecimal(storageCost);

  // Deposit: difference between storage cost and current balance
  const depositNeeded = balance.gte(cost) ? new Decimal(0) : cost.sub(balance);

  // Lockup: max of (used + persistence cost, current allowance)
  const persistenceCost = dailyRate.mul(persistencePeriodDays);
  const projectedLockup = lockupUsed.add(persistenceCost);
  const lockupNeeded = projectedLockup.gt(lockupAllowance)
    ? projectedLockup
    : lockupAllowance;

  // Rate: max of (used + new, current allowance)
  const totalRate = newRate.add(rateUsed);
  const rateNeeded = totalRate.gt(rateAllowance) ? totalRate : rateAllowance;

  return {
    totalDepositNeeded: BigInt(depositNeeded.toFixed(0)),
    totalLockupNeeded: BigInt(lockupNeeded.toFixed(0)),
    totalRateNeeded: BigInt(rateNeeded.toFixed(0)),
  };
};

/** Calculates GB capacity supported by rate allowance */
export const calculateRateAllowanceGB = (
  rateAllowance: bigint,
  storageCosts: StorageCosts,
  withCDN: boolean
): number => {
  const monthlyRate = toDecimal(rateAllowance).mul(
    TIME_CONSTANTS.EPOCHS_PER_MONTH
  );
  const pricePerTB = new Decimal(getPricePerTBPerMonth(storageCosts, withCDN));

  // bytes = (monthlyRate * TiB) / price, then convert to GB
  const capacityBytes = monthlyRate.mul(tibToBytes(1)).div(pricePerTB);
  return bytesToGiB(capacityBytes).toNumber();
};

/** Calculates GB capacity supported by rate allowance */
export const calculateBytesUsedFromRateUsage = (
  rateUsage: bigint,
  price: bigint
): {
  bytes: number;
  KiB: number;
  MiB: number;
  GiB: number;
} => {
  const cost = toDecimal(price).mul(toDecimal(rateUsage));

  const bytes = toDecimal(cost).div(
    toDecimal(SIZE_CONSTANTS.TiB).div(
      toDecimal(TIME_CONSTANTS.EPOCHS_PER_MONTH)
    )
  );
  const KiB = bytes.div(toDecimal(SIZE_CONSTANTS.KiB));
  const MiB = KiB.div(toDecimal(SIZE_CONSTANTS.MiB));
  const GiB = MiB.div(toDecimal(SIZE_CONSTANTS.GiB));
  return {
    bytes: bytes.toNumber(),
    KiB: KiB.toNumber(),
    MiB: MiB.toNumber(),
    GiB: GiB.toNumber(),
  };
};

/**
 * Extracts piece size and metadata from CommP v2 CID.
 * Matches on-chain calculations exactly for smart contract compatibility.
 * Formula: pieceSize = (1 << (height+5)) - (128*padding)/127
 *
 * @param input - CID as Uint8Array or hex string
 * @returns Piece size info with bytes/KiB/MiB/GiB conversions
 */
export const getPieceInfoFromCidBytes = (
  input: string | PieceCID
): UnifiedSizeInfo => {
  const sizeBytes = BigInt(getSizeFromPieceCID(input));
  return {
    sizeBytes,
    sizeKiB: bytesToKiB(sizeBytes).toNumber(),
    sizeMiB: bytesToMiB(sizeBytes).toNumber(),
    sizeGiB: bytesToGiB(sizeBytes).toNumber(),
  };
};

export const calculatePricePerBytePerEpoch = (
  storageCosts: StorageCosts
): {
  pricePerBytePerEpochWithCDN: Decimal;
  pricePerBytePerEpochNoCDN: Decimal;
} => {
  return {
    pricePerBytePerEpochWithCDN: toDecimal(
      storageCosts.pricePerTiBPerMonthWithCDN
    ).div(
      toDecimal(SIZE_CONSTANTS.TiB).div(
        toDecimal(TIME_CONSTANTS.EPOCHS_PER_MONTH)
      )
    ),
    pricePerBytePerEpochNoCDN: toDecimal(
      storageCosts.pricePerTiBPerMonthNoCDN
    ).div(
      toDecimal(SIZE_CONSTANTS.TiB).div(
        toDecimal(TIME_CONSTANTS.EPOCHS_PER_MONTH)
      )
    ),
  };
};

export const calculateDailyStorageCosts = (
  storageSizeInBytes: number,
  storageCosts: StorageCosts
): {
  dailyStorageCostNoCDN: Decimal;
  dailyStorageCostWithCDN: Decimal;
} => {
  const pricePerBytePerEpochWithCDN =
    calculatePricePerBytePerEpoch(storageCosts).pricePerBytePerEpochWithCDN;
  const pricePerBytePerEpochNoCDN =
    calculatePricePerBytePerEpoch(storageCosts).pricePerBytePerEpochNoCDN;
  const dailyStorageCostNoCDN = toDecimal(storageSizeInBytes)
    .mul(pricePerBytePerEpochNoCDN)
    .mul(TIME_CONSTANTS.EPOCHS_PER_DAY);
  const dailyStorageCostWithCDN = toDecimal(storageSizeInBytes)
    .mul(pricePerBytePerEpochWithCDN)
    .mul(TIME_CONSTANTS.EPOCHS_PER_DAY);
  return { dailyStorageCostNoCDN, dailyStorageCostWithCDN };
};