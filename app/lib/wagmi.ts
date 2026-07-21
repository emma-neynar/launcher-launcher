import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { http, createConfig, type CreateConnectorFn } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { CHAIN_ID, DEFAULT_RPC_URL, EXPLORER_URL } from '@/src/hoodie';

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL;

/** Robinhood Chain (or a local Anvil fork of it — same chain id 4663). */
export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER_URL } },
});

// Primary signing path is an EXTERNAL wallet (injected / WalletConnect) since
// the Farcaster host wallet cannot reach chain 4663 (see components/wallet.tsx).
// WalletConnect needs a (free) project id from https://cloud.reown.com — the
// connector is only registered when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors: CreateConnectorFn[] = [
  injected(),
  ...(WALLETCONNECT_PROJECT_ID
    ? [
        walletConnect({
          projectId: WALLETCONNECT_PROJECT_ID,
          metadata: {
            name: 'Launcher Launcher',
            description: 'Every token pairs with $HOODIE on Robinhood Chain',
            url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            icons: [],
          },
        }),
      ]
    : []),
  farcasterMiniApp(),
];

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  transports: { [robinhoodChain.id]: http(RPC_URL) },
  connectors,
});

export const LAUNCHER_LAUNCHER_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS ||
  '') as `0x${string}`;

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
