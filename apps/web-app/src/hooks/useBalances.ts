import { useQuery } from "@tanstack/react-query";
import { TOKENS } from "@filoz/synapse-sdk";
import { calculateStorageMetrics } from "@/utils/calculateStorageMetrics";
import { formatUnits } from "viem";
import { defaultBalances, UseBalancesResponse } from "@/types";
import { config } from "@/config";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { useSynapse } from "@/providers/SynapseProvider";

const STORAGE_CONFIG_KEY = "fildos_user_storage_config";

/**
 * Hook to fetch and format wallet balances and storage metrics
 * @param storageCapacity - Storage capacity in GB
 * @param persistencePeriod - Persistence period in days
 * @param minDaysThreshold - Minimum days threshold
 */
export const useBalances = (
  storageCapacity?: number,
  persistencePeriod?: number,
  minDaysThreshold?: number
) => {

  const { address, chainId } = useConnection();
  const { getSynapse } = useSynapse();

  // Get user config from localStorage if parameters not provided
  const userConfig = useMemo(() => {
    if (storageCapacity !== undefined && persistencePeriod !== undefined && minDaysThreshold !== undefined) {
      return { storageCapacity, persistencePeriod, minDaysThreshold };
    }

    if (typeof window === "undefined") {
      return {
        storageCapacity: config.storageCapacity,
        persistencePeriod: config.persistencePeriod,
        minDaysThreshold: config.minDaysThreshold,
      };
    }

    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          storageCapacity: parsed.storageCapacity ?? config.storageCapacity,
          persistencePeriod: parsed.persistencePeriod ?? config.persistencePeriod,
          minDaysThreshold: parsed.minDaysThreshold ?? config.minDaysThreshold,
        };
      }
    } catch (error) {
      console.error("Failed to load storage config from localStorage:", error);
    }

    return {
      storageCapacity: config.storageCapacity,
      persistencePeriod: config.persistencePeriod,
      minDaysThreshold: config.minDaysThreshold,
    };
  }, [storageCapacity, persistencePeriod, minDaysThreshold]);

  const query = useQuery({
    queryKey: ["balances", address, chainId, userConfig.storageCapacity, userConfig.persistencePeriod, userConfig.minDaysThreshold],
    enabled: !!address,
    queryFn: async (): Promise<UseBalancesResponse> => {
      const synapse = await getSynapse();

      const [filRaw, usdfcRaw, paymentsRaw] = await Promise.all([
        synapse.payments.walletBalance(),
        synapse.payments.walletBalance({ token: TOKENS.USDFC }),
        synapse.payments.balance({ token: TOKENS.USDFC }),
      ]);

      const usdfcDecimals = synapse.payments.decimals();

      // Calculate storage metrics with user config
      const storageMetrics = await calculateStorageMetrics(
        synapse,
        userConfig
      );

      return {
        filBalance: filRaw,
        usdfcBalance: usdfcRaw,
        warmStorageBalance: paymentsRaw,
        filBalanceFormatted: formatBalance(filRaw, 18),
        usdfcBalanceFormatted: formatBalance(usdfcRaw, usdfcDecimals),
        warmStorageBalanceFormatted: formatBalance(paymentsRaw, usdfcDecimals),
        monthlyRateFormatted: formatBalance(storageMetrics.currentMonthlyRate, usdfcDecimals),
        maxMonthlyRateFormatted: formatBalance(storageMetrics.maxMonthlyRate, usdfcDecimals),
        availableToFreeUpFormatted: formatBalance(storageMetrics.availableToFreeUp, usdfcDecimals),
        ...storageMetrics,
      };
    },
  });

  return {
    ...query,
    data: query.data || defaultBalances,
  };
};

/**
 * Formats a balance value with specified decimals
 */
export const formatBalance = (balance: bigint, decimals: number): number => {
  return Number(Number(formatUnits(balance, decimals)).toFixed(5));
};
