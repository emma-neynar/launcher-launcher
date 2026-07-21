/**
 * Live $HOODIE/USD price for the market-cap -> tick conversion.
 *
 * PRICE SOURCE: Dexscreener public API, which indexes the HOODIE/WETH
 * Uniswap v4 pool on Robinhood Chain (the token's only real market):
 *   https://api.dexscreener.com/latest/dex/tokens/<HOODIE>
 * We take the highest-liquidity pair on chainId "robinhood". This is an
 * off-chain convenience for the UI only — nothing on-chain trusts it. If the
 * fetch fails the UI degrades to a $HOODIE-denominated input + manual tick.
 */
import { HOODIE_ADDRESS } from './hoodie';

export type HoodiePrice = {
  priceUsd: number;
  /** Human description of where the price came from, shown in the UI. */
  source: string;
  pairAddress: string;
  liquidityUsd: number;
};

type DexscreenerPair = {
  chainId: string;
  pairAddress: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
};

export async function fetchHoodiePriceUsd(): Promise<HoodiePrice> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${HOODIE_ADDRESS}`);
  if (!res.ok) throw new Error(`Dexscreener HTTP ${res.status}`);
  const body = (await res.json()) as { pairs?: DexscreenerPair[] };

  const pairs = (body.pairs ?? [])
    .filter((p) => p.chainId === 'robinhood' && p.priceUsd)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const best = pairs[0];
  if (!best) throw new Error('No Robinhood Chain $HOODIE pair on Dexscreener');

  const priceUsd = Number(best.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error('Bad $HOODIE price');

  return {
    priceUsd,
    source: 'Dexscreener (HOODIE/WETH Uniswap v4 pool on Robinhood Chain)',
    pairAddress: best.pairAddress,
    liquidityUsd: best.liquidity?.usd ?? 0,
  };
}
