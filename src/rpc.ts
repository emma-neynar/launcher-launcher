import { http, createPublicClient, defineChain, type PublicClient } from 'viem';
import { CHAIN_ID, DEFAULT_RPC_URL, EXPLORER_URL } from './hoodie';

/**
 * A minimal server-side viem public client for the API routes (signature
 * verification and launch-receipt checks). Deliberately dependency-light —
 * unlike src/launch.ts this never pulls in the clanker-sdk, so importing it
 * from a Next.js route stays cheap.
 */

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL || DEFAULT_RPC_URL;

const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER_URL } },
});

let client: PublicClient | undefined;

export function serverPublicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) });
  }
  return client;
}
