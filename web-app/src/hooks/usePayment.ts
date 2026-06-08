import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TOKENS, TIME_CONSTANTS } from "@filoz/synapse-sdk";
import type { Address } from "viem";
import { MAX_UINT256 } from "@/utils/constants";
import { config } from "@/config";
import { useConnection } from "wagmi";
import { useSynapse } from "@/providers/SynapseProvider";


/**
 * Custom hook for handling storage payment transactions using EIP-2612 permit signatures
 */
export const usePayment = () => {
  const [status, setStatus] = useState<string>("");
  const { address, chainId } = useConnection();
  const queryClient = useQueryClient();
  const { getSynapse } = useSynapse();
  const mutation = useMutation({
    mutationKey: ["payment", address, chainId],
    mutationFn: async ({
      depositAmount,
    }: {
      depositAmount: bigint;
    }) => {
      // === VALIDATION PHASE ===
      // Ensure all required dependencies are available before proceeding
      if (!address) throw new Error("Address not found");
      if (!chainId) throw new Error("Chain id not found");

      // === SYNAPSE INITIALIZATION ===
      // Create Synapse instance with user's configuration
      const synapse = await getSynapse();

      // Get contract addresses from Synapse for the current network
      const warmStorageAddress = synapse.chain.contracts.fwss.address;

      // === BALANCE VALIDATION ===
      // Check if user has sufficient USDFC tokens for the deposit
      const amount = depositAmount;

      console.log("amount", amount);
      const balance = await synapse.payments.walletBalance({ token: TOKENS.USDFC });

      if (balance < amount) {
        throw new Error("Insufficient tUSDFC balance");
      }

      setStatus("💰 Setting up your storage configuration...");

      const hash = amount > BigInt(0)
        ? await synapse.payments.depositWithPermitAndApproveOperator({
            amount,
            operator: warmStorageAddress,
            rateAllowance: MAX_UINT256,
            lockupAllowance: MAX_UINT256,
            maxLockupPeriod: TIME_CONSTANTS.EPOCHS_PER_MONTH,
          })
        : await synapse.payments.approveService({
            service: warmStorageAddress,
            rateAllowance: MAX_UINT256,
            lockupAllowance: MAX_UINT256,
            maxLockupPeriod: TIME_CONSTANTS.EPOCHS_PER_MONTH,
          });

      await synapse.client.waitForTransactionReceipt({ hash });
      setStatus("You successfully configured your storage");
      return;
    },
    onSuccess: () => {
      setStatus("Payment was successful!");
      queryClient.invalidateQueries({
        queryKey: ["balances", address, config, chainId],
      });
    },
    onError: (error) => {
      console.error("Payment failed:", error);
      setStatus(
        `${error.message || "Transaction failed. Please try again."}`
      );
    },
  });
  return { mutation, status };
};


export const useRevokeService = () => {
  const [status, setStatus] = useState<string>("");
  const { getSynapse } = useSynapse();
  const mutation = useMutation({
    mutationFn: async ({ service }: { service: Address }) => {
      setStatus("Preparing transaction...");
      const synapse = await getSynapse();
      const hash = await synapse.payments.revokeService({
        service,
        token: TOKENS.USDFC,
      });
      await synapse.client.waitForTransactionReceipt({ hash });
      setStatus("Successfully revoked service");
    },
  });
  return { mutation, status };
};