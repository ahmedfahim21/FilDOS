import { EnhancedDataSetInfo } from "@filoz/synapse-sdk";
import type { DataSet as SpDataSet } from "@filoz/synapse-core/sp";

export interface DatasetsSizeInfo {
  sizeInBytes: number;
  sizeInKiB: number;
  sizeInMiB: number;
  sizeInGB: number;
  message: string;
}

export interface DataSet extends EnhancedDataSetInfo, DatasetsSizeInfo {
  serviceURL: string;
  data: SpDataSet | null;
  pieceSizes: Record<string, UnifiedSizeInfo>;
}

export interface UnifiedSizeInfo {
  /** Size in bytes - primary measurement */
  sizeBytes: bigint;
  /** Size in KiB (1024 bytes) */
  sizeKiB: number;
  /** Size in MiB (1024^2 bytes) */
  sizeMiB: number;
  /** Size in GiB (1024^3 bytes) - standardized for calculations */
  sizeGiB: number;
  /** Whether CDN storage is enabled for this item */
  withCDN?: boolean;
  /** Number of merkle tree leaves */
  leafCount?: number;
  /** Number of pieces */
  pieceCount?: number;
  /** User-friendly size message */
  message?: string;
}

export interface DatasetsResponse {
  datasets: DataSet[];
}

/**
 * Interface for formatted balance data returned by useBalances
 */
export interface UseBalancesResponse extends StorageCalculationResult {
  filBalance: bigint;
  usdfcBalance: bigint;
  warmStorageBalance: bigint;
  filBalanceFormatted: number;
  usdfcBalanceFormatted: number;
  warmStorageBalanceFormatted: number;
  availableToFreeUpFormatted: number;
  monthlyRateFormatted: number;
  maxMonthlyRateFormatted: number;
}

export const defaultBalances: UseBalancesResponse = {
  availableToFreeUp: BigInt(0),
  filBalance: BigInt(0),
  usdfcBalance: BigInt(0),
  warmStorageBalance: BigInt(0),
  filBalanceFormatted: 0,
  usdfcBalanceFormatted: 0,
  warmStorageBalanceFormatted: 0,
  availableToFreeUpFormatted: 0,
  daysLeft: 0,
  daysLeftAtCurrentRate: 0,
  isSufficient: false,
  isRateSufficient: false,
  isLockupSufficient: false,
  depositNeeded: BigInt(0),
  totalConfiguredCapacity: 0,
  monthlyRateFormatted: 0,
  maxMonthlyRateFormatted: 0,
  rateNeeded: BigInt(0),
  lockupNeeded: BigInt(0),
  currentMonthlyRate: BigInt(0),
  maxMonthlyRate: BigInt(0),
};

/**
 * Interface representing the Pandora balance data returned from the SDK
 */
export interface WarmStorageBalance {
  rateAllowanceNeeded: bigint;
  lockupAllowanceNeeded: bigint;
  currentRateAllowance: bigint;
  currentLockupAllowance: bigint;
  currentRateUsed: bigint;
  currentLockupUsed: bigint;
  sufficient: boolean;
  message?: string;
  costs: {
    perEpoch: bigint;
    perDay: bigint;
    perMonth: bigint;
  };
  depositAmountNeeded: bigint;
}

/**
 * Interface representing the calculated storage metrics
 */
export interface StorageCalculationResult {
  /** Balance needed to cover storage */
  depositNeeded: bigint;
  /** The available balance to free up */
  availableToFreeUp: bigint;
  /** Number of days left before lockup expires at configured storage capacity(GB) rate */
  daysLeft: number;
  /** Number of days left before lockup expires at current rate */
  daysLeftAtCurrentRate: number;
  /** Whether the rate allowance and lockup allowance are sufficient based on your configuration */
  isSufficient: boolean;
  /** Whether the rate allowance is sufficient based on your configuration */
  isRateSufficient: boolean;
  /** Whether the lockup allowance is sufficient based on your configuration */
  isLockupSufficient: boolean;
  /** The total storage paid for in GB */
  totalConfiguredCapacity: number;
  /** Rate allowance needed per epoch */
  rateNeeded: bigint;
  /** Lockup allowance needed */
  lockupNeeded: bigint;
  /** Current monthly rate */
  currentMonthlyRate: bigint;
  /** Max monthly rate for configured capacity */
  maxMonthlyRate: bigint;
}

export interface PaymentActionProps extends SectionProps {
  isProcessingPayment: boolean;
  onPayment: (params: {
    lockupAllowance: bigint;
    epochRateAllowance: bigint;
    depositAmount: bigint;
  }) => Promise<void>;
  handleRefetchBalances: () => Promise<void>;
}

export interface StatusMessageProps {
  status?: string;
}

export interface SectionProps {
  balances?: UseBalancesResponse;
  isLoading?: boolean;
}

export interface AllowanceItemProps {
  label: string;
  isSufficient?: boolean;
  isLoading?: boolean;
}

export interface StorageCosts {
  pricePerTiBPerMonthNoCDN: bigint;
  pricePerTiBPerMonthWithCDN: bigint;
}

/**
 * 🔧 Shared Types for Storage Manager Components
 *
 * Common interfaces and types used across components.
 * Copy these along with components for full functionality.
 */

// Standard storage metrics interface
export interface StorageMetrics {
  cdnStorageGB: number;
  standardStorageGB: number;
  totalStorageGB: number;
  cdnStorageBytes: bigint;
  standardStorageBytes: bigint;
  totalStorageBytes: bigint;
}

// Balance information interface
export interface BalanceInfo {
  filBalanceFormatted?: number;
  usdfcBalanceFormatted?: number;
  warmStorageBalanceFormatted?: number;
  isSufficient?: boolean;
  filBalance?: bigint;
  usdfcBalance?: bigint;
  depositNeeded?: bigint;
  daysLeft?: number;
}

// Payment action payload
export interface PaymentPayload {
  lockupAllowance: bigint;
  epochRateAllowance: bigint;
  depositAmount: bigint;
}

// Dataset summary
export interface DatasetSummary {
  totalDatasets: number;
  cdnDatasets: number;
  standardDatasets: number;
}

// Contract-related types
export interface FileEntry {
  cid: string;
  filename: string;
  timestamp: bigint;
  owner: string;
  tags: string[];
  encrypted: boolean;
  dataToEncryptHash: string;
  fileType: string;
}

export interface FolderInfo {
  name: string;
  folderType: string;
  isPublic: boolean;
  owner: string;
  createdAt: bigint;
  viewingPrice: bigint; // Price in payment tokens to gain read access
}

export interface FolderAccess {
  canRead: boolean;
  canWrite: boolean;
  isOwner: boolean;
}

export interface Share {
  folderId: bigint;
  grantee: string;
  canRead: boolean;
  canWrite: boolean;
}

export interface FileItem {
  id: string;
  name: string;
  folderType: string;
  type: "folder" | "document" | "image" | "video" | "pdf" | "audio" | "audio" | "pdf" | "presentation" | "spreadsheet" | "other" | "embed";
  size?: string;
  modified: string;
  owner: string;
  shared: boolean;
  tokenId?: string;
  cid?: string;
  tags?: string[];
  encrypted?: boolean;
  dataToEncryptHash?: string;
  fileType?: string;
}
