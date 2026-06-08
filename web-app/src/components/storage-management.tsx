"use client";

import { useBalances } from "@/hooks/useBalances";
import { usePayment, useRevokeService } from "@/hooks/usePayment";
import { useWithdraw } from "@/hooks/useWithdraw";
import { config as defaultConfig } from "@/config";
import { formatUnits } from "viem";
import { AllowanceItemProps, SectionProps } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Wallet,
  HardDrive,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Coins,
  Database,
  Shield
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { StorageConfigDialog, StorageConfig } from "./storage-config-dialog";
import { fetchWarmStorageCosts } from "@/utils/calculateStorageMetrics";
import { getPricePerTBPerMonth } from "@/utils";
import ConnectWalletPrompt from "./not-connected";
import { useConnection } from "wagmi";
import { useSynapse } from "@/providers/SynapseProvider";
import { useDatasets } from "@/hooks/useDataset";
import { CDN_DATA_SET_CREATION_COST } from "@/utils/constants";
import { FILECOIN_MAINNET_ID } from "@/utils/chains";

const STORAGE_CONFIG_KEY = "fildos_user_storage_config";

export const StorageManager = () => {
  const { isConnected } = useConnection();
  const revokeService = useRevokeService();
  const withdrawService = useWithdraw();
  const { getSynapse } = useSynapse();
  const [revokeStatus, setRevokeStatus] = useState<string>("");
  const [withdrawStatus, setWithdrawStatus] = useState<string>("");
  const [pricePerTiBPerMonth, setPricePerTiBPerMonth] = useState<string | null>(null);

  const [userConfig, setUserConfig] = useState<StorageConfig>(() => {
    if (typeof window === "undefined") {
      return {
        storageCapacity: defaultConfig.storageCapacity,
        persistencePeriod: defaultConfig.persistencePeriod,
        minDaysThreshold: defaultConfig.minDaysThreshold,
      };
    }

    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Failed to load storage config from localStorage:", error);
    }

    return {
      storageCapacity: defaultConfig.storageCapacity,
      persistencePeriod: defaultConfig.persistencePeriod,
      minDaysThreshold: defaultConfig.minDaysThreshold,
    };
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(userConfig));
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('storageConfigUpdated'));
      } catch (error) {
        console.error("Failed to save storage config to localStorage:", error);
      }
    }
  }, [userConfig]);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const synapse = await getSynapse();
        const storageCosts = await fetchWarmStorageCosts(synapse);
        const pricePerTiB = getPricePerTBPerMonth(storageCosts, true);

        // Validate that we got a valid bigint price
        if (pricePerTiB && typeof pricePerTiB === 'bigint') {
          const priceInUSDFC = Number(formatUnits(pricePerTiB, 18));
          setPricePerTiBPerMonth(priceInUSDFC.toFixed(2));
        } else {
          console.warn("Invalid price data received from storage service");
        }
      } catch (error) {
        console.error("Failed to fetch storage pricing:", error);
      }
    };
    fetchPricing();
  }, [getSynapse]);

  const config = useMemo(
    () => ({
      ...defaultConfig,
      ...userConfig,
    }),
    [userConfig]
  );

  const {
    data,
    isLoading: isBalanceLoading,
    refetch: refetchBalances,
  } = useBalances(
    config.storageCapacity,
    config.persistencePeriod,
    config.minDaysThreshold
  );
  const balances = data;
  const { mutation: paymentMutation, status } = usePayment();
  const { mutateAsync: handlePayment, isPending: isProcessingPayment } =
    paymentMutation;

  const [isRevoking, setIsRevoking] = useState(false);

  const handleRefetchBalances = async () => {
    await refetchBalances();
  };

  const handleConfigSave = (newConfig: StorageConfig) => {
    setUserConfig(newConfig);
    refetchBalances();
  };

  if (!isConnected) {
    return <ConnectWalletPrompt
      description="Please connect your wallet to manage your storage settings and balances."
    />;
  }

  const handleRevoke = async () => {
    const { mutation, status } = revokeService;
    try {
      setIsRevoking(true);
      setRevokeStatus(status);
      const synapse = await getSynapse();
      await mutation.mutateAsync({
        service: synapse.chain.contracts.fwss.address
      });
      setRevokeStatus(status);
      await refetchBalances();
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: string }).message)
          : "Failed to revoke approval";
      setRevokeStatus(`${message}`);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="w-full space-y-4 sm:space-y-6 p-3 sm:p-6">
        <StorageBalanceHeader
          config={config}
          onConfigSave={handleConfigSave}
          pricePerTiBPerMonth={pricePerTiBPerMonth}
        />

        <CurrentStorageUsage />

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <WalletBalancesSection
            balances={balances}
            isLoading={isBalanceLoading}
          />
          <StorageStatusSection
            balances={balances}
            isLoading={isBalanceLoading}
            config={config}
          />
        </div>

        <AllowanceStatusSection
          balances={balances}
          isLoading={isBalanceLoading}
          onRevoke={handleRevoke}
          isRevoking={isRevoking}
          config={config}
          isProcessingPayment={isProcessingPayment}
          onPayment={handlePayment}
          handleRefetchBalances={handleRefetchBalances}
        />

        <ActionSection
          balances={balances}
          isLoading={isBalanceLoading}
          handleRefetchBalances={handleRefetchBalances}
          config={config}
          withdrawService={withdrawService}
          setWithdrawStatus={setWithdrawStatus}
        />

        {status && (
          <Card className={`${status.includes("❌")
            ? "border-destructive/50 bg-destructive/10"
            : "border-blue-500/50 bg-blue-500/10"
            }`}>
            <CardContent className="pt-6">
              <p className={`text-sm ${status.includes("❌")
                ? "text-destructive"
                : "text-primary"
                }`}>
                {status}
              </p>
            </CardContent>
          </Card>
        )}
        {revokeStatus && (
          <Card className={`${revokeStatus.includes("❌")
            ? "border-destructive/50 bg-destructive/10"
            : "border-blue-500/50 bg-blue-500/10"
            }`}>
            <CardContent className="pt-6">
              <p className={`text-sm ${revokeStatus.includes("❌")
                ? "text-destructive"
                : "text-primary"
                }`}>
                {revokeStatus}
              </p>
            </CardContent>
          </Card>
        )}
        {withdrawStatus && (
          <Card className={`${withdrawStatus.includes("❌")
            ? "border-destructive/50 bg-destructive/10"
            : "border-blue-500/50 bg-blue-500/10"
            }`}>
            <CardContent className="pt-6">
              <p className={`text-sm ${withdrawStatus.includes("❌")
                ? "text-destructive"
                : "text-primary"
                }`}>
                {withdrawStatus}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

/**
 * Section displaying allowance status
 */
const AllowanceStatusSection = ({
  balances,
  isLoading,
  onRevoke,
  isRevoking,
  config,
  isProcessingPayment,
  onPayment,
  handleRefetchBalances,
}: SectionProps & {
  onRevoke?: () => void | Promise<void>;
  isRevoking?: boolean;
  config: StorageConfig & { withCDN: boolean; aiServerUrl: string };
  isProcessingPayment?: boolean;
  onPayment?: (params: { lockupAllowance: bigint; epochRateAllowance: bigint; depositAmount: bigint }) => Promise<void>;
  handleRefetchBalances?: () => Promise<void>;
}) => {
  const depositNeeded = Number(
    formatUnits(balances?.depositNeeded ?? BigInt(0), 18)
  ).toFixed(5);
  const needsDeposit = (balances?.depositNeeded ?? BigInt(0)) > BigInt(0);
  const needsLockup = !balances?.isLockupSufficient;
  const needsRate = !balances?.isRateSufficient;
  const needsAction = !balances?.isSufficient && !isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
          Allowance Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <AllowanceItem
            label="Rate Allowance"
            isSufficient={balances?.isRateSufficient}
            isLoading={isLoading}
          />
          <AllowanceItem
            label="Lockup Allowance"
            isSufficient={balances?.isLockupSufficient}
            isLoading={isLoading}
          />
        </div>

        {needsAction && (
          <Card className="border-amber-500/50 bg-amber-500/10">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-amber-800 dark:text-amber-200 font-medium">Action needed</p>
                  <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc pl-5 space-y-1">
                    {needsDeposit && (
                      <li>
                        Deposit {depositNeeded} USDFC to reach your {config.persistencePeriod}-day target. Current balance covers {balances?.daysLeft?.toFixed(1)} days.
                      </li>
                    )}
                    {needsLockup && !needsDeposit && (
                      <li>
                        Update lockup allowance to meet {config.minDaysThreshold}-day alert threshold (currently at {balances?.daysLeft?.toFixed(1)} days)
                      </li>
                    )}
                    {needsRate && (
                      <li>
                        Update rate allowance to support {config.storageCapacity} GB capacity
                      </li>
                    )}
                  </ul>
                  <div className="mt-3 pt-3 border-t border-amber-500/30">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <strong>Note:</strong> Includes {Number(formatUnits(CDN_DATA_SET_CREATION_COST, 18)).toFixed(2)} USDFC one-time CDN dataset creation cost
                    </p>
                  </div>
                </div>
              </div>
              {onPayment && (
                <Button
                  onClick={async () => {
                    await onPayment({
                      lockupAllowance: balances?.lockupNeeded ?? BigInt(0),
                      epochRateAllowance: balances?.rateNeeded ?? BigInt(0),
                      depositAmount: balances?.depositNeeded ?? BigInt(0),
                    });
                    await handleRefetchBalances?.();
                  }}
                  disabled={isProcessingPayment}
                  className="w-full"
                  size="lg"
                >
                  {isProcessingPayment
                    ? "Processing transaction..."
                    : needsDeposit
                      ? "Deposit to Reach Target"
                      : "Update Allowances"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
      <CardContent>
        <div className="flex justify-start sm:justify-end">
          <Button
            variant="destructive"
            onClick={onRevoke}
            disabled={isLoading || isRevoking}
            className="w-full sm:w-auto"
            size="sm"
          >
            {isRevoking ? "Revoking..." : "Revoke Storage Approval"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Section for payment actions
 */
const ActionSection = ({
  balances,
  isLoading,
  config,
  withdrawService,
  setWithdrawStatus,
  handleRefetchBalances,
}: SectionProps & {
  config: StorageConfig & { withCDN: boolean; aiServerUrl: string };
  withdrawService?: { mutation: { mutateAsync: (params: { amount: bigint }) => Promise<void>; isPending: boolean }; status: string };
  setWithdrawStatus?: (status: string) => void;
  handleRefetchBalances?: () => Promise<void>;
}) => {
  const canWithdraw = (balances?.availableToFreeUp ?? BigInt(0)) > BigInt(0);

  if (isLoading || !balances) return null;

  // Success state - no deposit needed and meets minimum threshold
  if (balances.isSufficient) {
    const daysLeft = balances.daysLeft ?? 0;
    const showThresholdWarning =
      daysLeft < config.minDaysThreshold && daysLeft > 0;

    if (showThresholdWarning) {
      return (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 font-medium">
                  ⚠️ Balance running low: {daysLeft.toFixed(1)} days remaining (alert threshold: {config.minDaysThreshold}d)
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Configured: {config.storageCapacity} GB • {config.persistencePeriod} days target
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Consider depositing USDFC to extend your storage duration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card className="border-green-500/50 bg-green-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-green-800 dark:text-green-300 font-medium">
                  Storage balance is healthy - {daysLeft.toFixed(1)} days remaining
                </p>
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  Configured: {config.storageCapacity} GB • {config.persistencePeriod} days target
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {canWithdraw && (
          <Card className="border-green-500/50 bg-green-500/10">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <p className="text-green-800 dark:text-green-300 font-medium">
                    Excess funds available: {balances.availableToFreeUpFormatted} USDFC
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Withdraw extra balance while maintaining your storage plan
                  </p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  if (withdrawService && balances?.availableToFreeUp) {
                    try {
                      setWithdrawStatus?.("Processing withdrawal...");
                      await withdrawService.mutation.mutateAsync({
                        amount: balances.availableToFreeUp
                      });
                      setWithdrawStatus?.(withdrawService.status);
                      if (handleRefetchBalances) {
                        await handleRefetchBalances();
                      }
                    } catch (error) {
                      console.error("Withdrawal failed:", error);
                      setWithdrawStatus?.(`${error instanceof Error ? error.message : "Withdrawal failed"}`);
                    }
                  }
                }}
                disabled={!withdrawService || withdrawService.mutation.isPending}
                className="w-full"
                size="lg"
              >
                {withdrawService?.mutation.isPending ? "Processing..." : "Withdraw Excess Funds"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Missing tokens
  if (balances.filBalance === BigInt(0) || balances.usdfcBalance === BigInt(0)) {
    return (
      <div className="space-y-4">
        {balances.filBalance === BigInt(0) && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-destructive font-medium">FIL Tokens Required</p>
                  <p className="text-sm text-destructive/90">
                    Add FIL for network fees to complete transactions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {balances.usdfcBalance === BigInt(0) && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-destructive font-medium">USDFC Tokens Required</p>
                  <p className="text-sm text-destructive/90">
                    Add USDFC for storage payments.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return null;
};



/**
 * Header section with title and USDFC faucet button
 */
const StorageBalanceHeader = ({
  config,
  onConfigSave,
  pricePerTiBPerMonth,
}: {
  config: StorageConfig & { withCDN: boolean; aiServerUrl: string };
  onConfigSave: (config: StorageConfig) => void;
  pricePerTiBPerMonth: string | null;
}) => {
  const { chainId } = useConnection();
  const isMainnet = chainId === FILECOIN_MAINNET_ID;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="space-y-2">
            <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
              <Database className="h-5 w-5 sm:h-6 sm:w-6" />
              Storage Management
            </CardTitle>
            <CardDescription className="text-sm">
              Monitor your storage usage and manage USDFC deposits for Filecoin storage
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StorageConfigDialog
              currentConfig={{
                storageCapacity: config.storageCapacity,
                persistencePeriod: config.persistencePeriod,
                minDaysThreshold: config.minDaysThreshold,
              }}
              onSave={onConfigSave}
            />
            {!isMainnet && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open(
                      "https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc",
                      "_blank"
                    );
                  }}
                >
                  <Coins className="h-4 w-4 mr-2" />
                  Get tUSDFC
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open(
                      "https://faucet.calibnet.chainsafe-fil.io/funds.html",
                      "_blank"
                    );
                  }}
                >
                  <Coins className="h-4 w-4 mr-2" />
                  Get tFIL
                </Button>
              </>
            )}
          </div>
        </div>
        {pricePerTiBPerMonth && (
          <div className="flex justify-start sm:justify-end items-center mt-2">
            <Badge variant="outline" className="text-xs">
              Current Pricing:{" "} {pricePerTiBPerMonth} USDFC per TiB/month
            </Badge>
          </div>
        )}
      </CardHeader>
    </Card>
  );
};

/**
 * Section displaying wallet balances
 */
const WalletBalancesSection = ({ balances, isLoading }: SectionProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base sm:text-lg flex items-center gap-2">
        <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
        Wallet Balances
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 sm:space-y-4">
      <div className="grid gap-3 sm:gap-4">
        <div className="flex items-center justify-between p-3 sm:p-4 rounded-sm border bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-medium">FIL Balance</span>
          </div>
          <span className="text-xs sm:text-sm">
            {isLoading ? "..." : `${balances?.filBalanceFormatted?.toLocaleString()} FIL`}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 sm:p-4 rounded-sm border bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-medium">USDFC Balance</span>
          </div>
          <span className="text-xs sm:text-sm">
            {isLoading ? "..." : `${balances?.usdfcBalanceFormatted?.toLocaleString()} USDFC`}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 sm:p-4 rounded-sm border bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-medium">My Storage Balance</span>
          </div>
          <span className="text-xs sm:text-sm">
            {isLoading ? "..." : `${balances?.warmStorageBalanceFormatted?.toLocaleString()} USDFC`}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
);

/**
 * Section displaying storage status
 */
const StorageStatusSection = ({
  balances,
  isLoading,
  config,
}: SectionProps & { config: StorageConfig & { withCDN: boolean; aiServerUrl: string } }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <HardDrive className="h-4 w-4 sm:h-5 sm:w-5" />
          Storage Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm font-medium">Configured Capacity</span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              {isLoading ? "..." : `${balances?.totalConfiguredCapacity?.toLocaleString()} GB`}
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between p-3 rounded-sm border bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm">Days Remaining (Max Capacity)</span>
            </div>
            <Badge variant={balances?.daysLeft && balances.daysLeft > config.minDaysThreshold ? "default" : "destructive"} className="text-xs">
              {isLoading ? "..." : `${balances?.daysLeft.toFixed(1)} days`}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm">Days Remaining (Current Usage)</span>
            </div>
            <Badge variant={balances?.daysLeftAtCurrentRate && balances.daysLeftAtCurrentRate > config.minDaysThreshold ? "default" : "destructive"} className="text-xs">
              {isLoading ? "..." : `${balances?.daysLeftAtCurrentRate === Infinity ? "∞" : balances?.daysLeftAtCurrentRate.toFixed(1)} days`}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-2">
              <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm">Monthly Cost (Current)</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {isLoading ? "..." : `${balances?.monthlyRateFormatted.toFixed(2)} USDFC`}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-2">
              <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm">Monthly Cost (Max Capacity)</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {isLoading ? "..." : `${balances?.maxMonthlyRateFormatted.toFixed(2)} USDFC`}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Section displaying current storage usage from datasets
 */
const CurrentStorageUsage = () => {
  const { data: datasets, isLoading } = useDatasets();
  const { data: balances } = useBalances();

  // Calculate total storage by type
  const { cdnStorageGB, standardStorageGB, totalStorageGB } = (datasets || []).reduce(
    (acc: { cdnStorageGB: number; standardStorageGB: number; totalStorageGB: number }, dataset) => {
      const sizeGB = dataset?.sizeInGB || 0;
      if (dataset?.withCDN) {
        acc.cdnStorageGB += sizeGB;
      } else {
        acc.standardStorageGB += sizeGB;
      }
      acc.totalStorageGB += sizeGB;
      return acc;
    },
    { cdnStorageGB: 0, standardStorageGB: 0, totalStorageGB: 0 }
  );

  const configuredCapacity = balances?.totalConfiguredCapacity || 0;
  const usagePercentage = configuredCapacity > 0 ? (totalStorageGB / configuredCapacity) * 100 : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <HardDrive className="h-4 w-4 sm:h-5 sm:w-5" />
            Current Storage Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-muted/50 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <HardDrive className="h-4 w-4 sm:h-5 sm:w-5" />
          Current Storage Usage
        </CardTitle>
        <CardDescription className="text-sm">
          {totalStorageGB.toFixed(3)} GB / {configuredCapacity.toFixed(0)} GB
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Storage Used</span>
            <span className="text-muted-foreground">{usagePercentage.toFixed(1)}%</span>
          </div>
          <div
            className="group relative w-full h-3 bg-muted/50 rounded-full overflow-hidden cursor-pointer"
            title={`CDN: ${cdnStorageGB.toFixed(3)} GB | Standard: ${standardStorageGB.toFixed(3)} GB`}
          >
            <div
              className="h-full bg-linear-to-r from-primary to-primary/80 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          <div className="flex flex-row mt-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>CDN: {cdnStorageGB.toFixed(3)} GB</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Standard: {standardStorageGB.toFixed(3)} GB</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Component for displaying an allowance status
 */
const AllowanceItem = ({
  label,
  isSufficient,
  isLoading,
}: AllowanceItemProps) => (
  <div className="flex items-center justify-between p-3 sm:p-4 rounded-sm border bg-muted/30">
    <span className="text-xs sm:text-sm font-medium">{label}</span>
    <div className="flex items-center gap-2">
      {isLoading ? (
        <span className="text-xs sm:text-sm text-muted-foreground">...</span>
      ) : isSufficient ? (
        <>
          <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 dark:text-green-400" />
          <Badge variant="outline" className="text-xs">
            Sufficient
          </Badge>
        </>
      ) : (
        <>
          <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
          <Badge variant="destructive" className="text-xs">
            Insufficient
          </Badge>
        </>
      )}
    </div>
  </div>
);
