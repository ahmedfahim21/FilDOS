"use client";

import React, { createContext, useContext, ReactNode, useCallback } from "react";
import { Synapse, getChain } from "@filoz/synapse-sdk";
import { useConnectorClient, type Config } from "wagmi";
import { custom } from "viem";
import { config } from "@/config";

interface SynapseContextValue {
  getSynapse: () => Promise<Synapse>;
}

const SynapseContext = createContext<SynapseContextValue | undefined>(
  undefined
);

export const SynapseProvider = ({ children }: { children: ReactNode }) => {
  const { data: walletClient } = useConnectorClient<Config>();

  const getSynapse = useCallback(async (): Promise<Synapse> => {
    if (!walletClient) {
      throw new Error("Wallet client not available. Connect a wallet first.");
    }

    // Synapse.create builds its own viem Client. We feed it:
    // - chain: synapse-core's pre-baked Chain (with fwss/filecoinPay/etc. contracts)
    // - transport: the wagmi connector wrapped as an EIP-1193 custom transport
    // - account: the connector's account (json-rpc type, signs via the wallet)
    return Synapse.create({
      chain: getChain(walletClient.chain.id),
      transport: custom(walletClient),
      account: walletClient.account,
      withCDN: config.withCDN,
      source: config.synapseSource,
    });
  }, [walletClient]);

  return (
    <SynapseContext.Provider value={{ getSynapse }}>
      {children}
    </SynapseContext.Provider>
  );
};

export const useSynapse = () => {
  const context = useContext(SynapseContext);
  if (context === undefined) {
    throw new Error("useSynapse must be used within a SynapseProvider");
  }
  return context;
};
