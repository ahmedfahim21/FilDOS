"use client";

import { Web3AuthProvider as Web3AuthProviderBase } from '@web3auth/modal/react';
import { type Web3AuthContextConfig } from '@web3auth/modal/react'
import { CHAIN_NAMESPACES, CONFIRMATION_STRATEGY, walletServicesPlugin, WEB3AUTH_NETWORK, type Web3AuthOptions } from '@web3auth/modal'

const web3AuthOptions: Web3AuthOptions = {
  clientId: process.env.NEXT_PUBLIC_CLIENT_ID || '', 
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  defaultChainId: '0x4cb2f',
  privateKeyProvider: undefined,
  chains: [
    {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: '0x4cb2f', // 314159 in decimal - Filecoin Calibration
      rpcTarget: 'https://api.calibration.node.glif.io/rpc/v1',
      displayName: 'Filecoin Calibration Testnet',
      blockExplorerUrl: 'https://calibration.filfox.info/en',
      ticker: 'tFIL',
      tickerName: 'Filecoin Testnet',
      logo: 'https://cryptologos.cc/logos/filecoin-fil-logo.png?v=024',
    }
  ],
  plugins: [walletServicesPlugin()],
  walletServicesConfig: {
    modalZIndex: 100,
    confirmationStrategy: CONFIRMATION_STRATEGY.AUTO_APPROVE,
  },
  storageType: 'local',

}

const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions,
}

export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <Web3AuthProviderBase config={web3AuthContextConfig}>
      {children}
    </Web3AuthProviderBase>
  );
}
