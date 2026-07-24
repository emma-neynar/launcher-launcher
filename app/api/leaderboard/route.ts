import { NextResponse } from 'next/server';
import { type Launch, loadRegistry } from '@/src/registry';

/**
 * The leaderboard: every token launched through a registered launcher, ranked
 * by live market cap.
 *
 * MARKET DATA SOURCE: Dexscreener's public API — the same source the app
 * already trusts for the $HOODIE price (src/hoodie-price.ts). Clanker's own
 * API (www.clanker.world/api/tokens?includeMarket=true) indexes these tokens
 * but its market data returns 0 for every Robinhood Chain (4663) token, and
 * its /api/marketcap endpoint only understands Uniswap V3 pools (these are
 * v4), so Dexscreener is the source that actually works.
 *
 * Dexscreener batches up to 30 addresses per call; each upstream response is
 * cached for 60s via the fetch data cache so refetch-happy clients never
 * hammer the API. Tokens Dexscreener hasn't indexed yet (no trades) come back
 * with marketCapUsd: null and sort to the bottom, newest first.
 */

export const dynamic = 'force-dynamic';

export type LeaderboardEntry = {
  launch: Launch;
  launcherId: string;
  launcherName: string;
  /** Live market cap in USD, or null when no market data exists yet. */
  marketCapUsd: number | null;
};

const DEXSCREENER_BATCH = 30;

type DexscreenerPair = {
  chainId: string;
  baseToken?: { address?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
};

/** token address (lowercase) → market cap USD, for one batch of addresses. */
async function fetchMarketCaps(addresses: string[]): Promise<Map<string, number>> {
  const caps = new Map<string, number>();
  for (let i = 0; i < addresses.length; i += DEXSCREENER_BATCH) {
    const batch = addresses.slice(i, i + DEXSCREENER_BATCH);
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`,
        { next: { revalidate: 60 } }
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { pairs?: DexscreenerPair[] };
      // A token can have several pairs; keep the highest-liquidity Robinhood
      // Chain one (same rule as src/hoodie-price.ts).
      const bestLiquidity = new Map<string, number>();
      for (const pair of body.pairs ?? []) {
        if (pair.chainId !== 'robinhood') continue;
        const token = pair.baseToken?.address?.toLowerCase();
        const cap = pair.marketCap ?? pair.fdv;
        if (!token || typeof cap !== 'number' || !Number.isFinite(cap)) continue;
        const liquidity = pair.liquidity?.usd ?? 0;
        if (!caps.has(token) || liquidity > (bestLiquidity.get(token) ?? 0)) {
          caps.set(token, cap);
          bestLiquidity.set(token, liquidity);
        }
      }
    } catch {
      // Upstream hiccup — this batch just ranks as "no data".
    }
  }
  return caps;
}

export async function GET() {
  const launchers = await loadRegistry();

  // Every launch across every launcher, deduped by token address (the same
  // token can't meaningfully appear twice on a market-cap board).
  const seen = new Set<string>();
  const rows: { launch: Launch; launcherId: string; launcherName: string }[] = [];
  for (const launcher of launchers) {
    for (const launch of launcher.launches) {
      const key = launch.token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ launch, launcherId: launcher.id, launcherName: launcher.name });
    }
  }

  const caps = await fetchMarketCaps(rows.map((r) => r.launch.token));

  const entries: LeaderboardEntry[] = rows
    .map((row) => ({
      ...row,
      marketCapUsd: caps.get(row.launch.token.toLowerCase()) ?? null,
    }))
    .sort((a, b) => {
      // Ranked tokens by market cap descending; unranked ones last, newest first.
      if (a.marketCapUsd !== null && b.marketCapUsd !== null) {
        return b.marketCapUsd - a.marketCapUsd;
      }
      if (a.marketCapUsd !== null) return -1;
      if (b.marketCapUsd !== null) return 1;
      return b.launch.at.localeCompare(a.launch.at);
    });

  return NextResponse.json(entries);
}
