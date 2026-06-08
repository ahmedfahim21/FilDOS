"use client";

import { filecoinCalibration, filecoin } from "viem/chains";
import { createConfig, http } from "wagmi";
import { web3AuthConnector } from "./web3AuthConnector";
import type { IProvider } from '@web3auth/modal';

// Provider will be set by WagmiProvider
let web3AuthProviderGetter: (() => IProvider | null) | null = null;

export function setWeb3AuthProvider(getter: () => IProvider | null) {
  web3AuthProviderGetter = getter;
}

export const config = createConfig({
  connectors: [
    web3AuthConnector({
      getProvider: () => web3AuthProviderGetter?.() ?? null,
    }),
  ],
  chains: [{ ...filecoinCalibration, name: "Filecoin testnet" }, { ...filecoin, name: "Filecoin" }],
  transports: {
    [filecoin.id]: http(undefined, {
      batch: true,
    }),
    [filecoinCalibration.id]: http(undefined, {
      batch: true,
    }),
  },
  batch: {
    multicall: true,
  },
});