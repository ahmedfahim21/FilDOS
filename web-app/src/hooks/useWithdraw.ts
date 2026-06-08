import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSynapse } from "@/providers/SynapseProvider";
import { useConnection } from "wagmi";

/**
 * Hook for withdrawing funds from the wallet.
 * Withdraws funds from the wallet using the Synapse SDK.
 * @returns Mutation object for withdrawing funds
 */
export const useWithdraw = () => {
  const [status, setStatus] = useState<string>("");
  const { address, chainId } = useConnection();
  const { getSynapse } = useSynapse();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: ["withdraw", address, chainId],
    mutationFn: async ({ amount }: { amount: bigint }) => {
      // === VALIDATION PHASE ===
      // Ensure all required dependencies are available before proceeding
      if (!address) throw new Error("Address not found");
      if (!chainId) throw new Error("Chain id not found");

      setStatus("Withdrawing your funds...");
      const synapse = await getSynapse();
      const hash = await synapse.payments.withdraw({ amount });
      await synapse.client.waitForTransactionReceipt({ hash });
      setStatus("You successfully withdrew your funds");
      return;
    },
    onSuccess: () => {
      setStatus("Withdrawal was successful!");
      queryClient.invalidateQueries({
        queryKey: ["balances", address, chainId],
      });
    },
    onError: (error) => {
      console.error("Withdrawal failed:", error);
      setStatus(
        `${error.message || "Transaction failed. Please try again."}`
      );
    },
  });

  return { mutation, status };
};
