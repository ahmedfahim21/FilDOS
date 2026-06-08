"use client";

import { type ReactNode, useEffect } from "react";
import { WagmiProvider as WagmiProviderBase, useConnect, useDisconnect, useConnection } from "wagmi";
import { useWeb3Auth } from "@web3auth/modal/react";
import { config, setWeb3AuthProvider } from "@/lib/wagmi";

// Internal component that handles Web3Auth sync
function Web3AuthSync() {
  const { provider, isConnected: web3AuthConnected } = useWeb3Auth();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected: wagmiConnected } = useConnection();

  // Update the provider getter whenever provider changes
  useEffect(() => {
    setWeb3AuthProvider(() => provider);
  }, [provider]);

  useEffect(() => {
    const syncConnection = async () => {
      if (web3AuthConnected && provider && !wagmiConnected) {
        try {
          // Connect wagmi with the web3auth connector
          const web3authConnector = connectors.find(c => c.id === 'web3auth');
          if (web3authConnector) {
            await connectAsync({ connector: web3authConnector });
          }
        } catch (error) {
          console.error("Failed to sync Web3Auth with wagmi:", error);
        }
      } else if (!web3AuthConnected && wagmiConnected) {
        // Web3Auth disconnected, disconnect wagmi too
        disconnect();
      }
    };

    syncConnection();
  }, [web3AuthConnected, provider, wagmiConnected, connectAsync, disconnect, connectors]);

  return null;
}

export function WagmiProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderBase config={config} reconnectOnMount={true}>
      <Web3AuthSync />
      {children}
    </WagmiProviderBase>
  );
}
