import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
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

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  transports: { [robinhoodChain.id]: http(RPC_URL) },
  // farcasterMiniApp inside a Farcaster client; injected() as a dev fallback
  // when opening the app in a plain browser against the Anvil fork.
  connectors: [farcasterMiniApp(), injected()],
});

export const LAUNCHER_LAUNCHER_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHER_LAUNCHER_ADDRESS ||
  '') as `0x${string}`;

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
