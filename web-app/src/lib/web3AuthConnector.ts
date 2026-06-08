"use client";

import { createConnector } from 'wagmi';
import { SwitchChainError, UserRejectedRequestError, getAddress } from 'viem';
import type { IProvider } from '@web3auth/modal';

export interface Web3AuthConnectorOptions {
  getProvider: () => IProvider | null;
}

export function web3AuthConnector(options: Web3AuthConnectorOptions) {
  let provider: IProvider | null = null;

  return createConnector<IProvider>((config) => ({
    id: 'web3auth',
    name: 'Web3Auth',
    type: 'web3Auth',
    
    async setup() {
      provider = options.getProvider();
      if (!provider) return;
      
      this.connect({ chainId: config.chains[0].id }).catch(() => {});
    },

    async connect({ chainId } = {}) {
      try {
        provider = options.getProvider();
        if (!provider) {
          throw new UserRejectedRequestError(new Error('Web3Auth provider not found'));
        }

        const accounts = await this.getAccounts();
        let currentChainId = await this.getChainId();

        if (chainId && currentChainId !== chainId) {
          const chain = await this.switchChain!({ chainId });
          currentChainId = chain.id;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { accounts, chainId: currentChainId } as any;
      } catch (error) {
        if ((error as Error).message?.includes('User rejected')) {
          throw new UserRejectedRequestError(error as Error);
        }
        throw error;
      }
    },

    async disconnect() {
      provider = null;
    },

    async getAccounts() {
      if (!provider) return [];
      
      const accounts = (await provider.request({
        method: 'eth_accounts',
      })) as string[];
      
      return accounts.map((x) => getAddress(x));
    },

    async getChainId() {
      if (!provider) return config.chains[0].id;
      
      const chainId = await provider.request({
        method: 'eth_chainId',
      }) as string;
      
      return parseInt(chainId, 16);
    },

    async isAuthorized() {
      try {
        const accounts = await this.getAccounts();
        return !!accounts.length;
      } catch {
        return false;
      }
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((x) => x.id === chainId);
      if (!chain) throw new SwitchChainError(new Error('Chain not configured'));
      if (!provider) throw new Error('Provider not found');

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainId.toString(16)}` }],
        });
        return chain;
      } catch (error) {
        // Chain not added, try to add it
        const err = error as { code?: number };
        if (err.code === 4902) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${chainId.toString(16)}`,
                  chainName: chain.name,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: [chain.rpcUrls.default.http[0]],
                  blockExplorerUrls: chain.blockExplorers
                    ? [chain.blockExplorers.default.url]
                    : undefined,
                },
              ],
            });
            return chain;
          } catch (addError) {
            throw new UserRejectedRequestError(addError as Error);
          }
        }
        throw new SwitchChainError(error as Error);
      }
    },

    async getProvider() {
      const p = options.getProvider();
      if (!p) throw new Error('Provider not found');
      return p;
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect();
      else {
        config.emitter.emit('change', { accounts: accounts.map((x) => getAddress(x)) });
      }
    },

    onChainChanged(chain) {
      const chainId = parseInt(chain, 16);
      config.emitter.emit('change', { chainId });
    },

    onDisconnect() {
      config.emitter.emit('disconnect');
    },
  }));
}
