/**
 * Market cap <-> initial tick math for a $HOODIE-paired Clanker v4 pool.
 *
 * Uniswap v3/v4 price at tick t is 1.0001^t (token1 per token0). The Clanker
 * factory takes `tickIfToken0IsClanker`, i.e. the price of the NEW token
 * denominated in the paired token ($HOODIE). Both the new token and $HOODIE
 * have 18 decimals (verified on-chain), so no decimal adjustment is needed:
 *
 *   price(HOODIE per token) = marketCapInHoodie / TOTAL_SUPPLY
 *   tick = floor( ln(price) / ln(1.0001) / TICK_SPACING ) * TICK_SPACING
 *
 * The tick math itself is denominated in $HOODIE. A USD target is converted
 * first via the live $HOODIE/USD price (see src/hoodie-price.ts for the price
 * source); both tokens are verified 18-decimal so no decimal adjustment.
 */

export const TICK_SPACING = 200;
/** Clanker v4 fixed total supply: 100 billion tokens. */
export const TOTAL_SUPPLY = 100_000_000_000;
/**
 * Contract fallback tick (must equal Launcher.sol DEFAULT_STARTING_TICK).
 * ≈ 6.2B $HOODIE market cap — roughly $30k when calibrated 2026-07-20 at
 * $HOODIE ≈ $4.8e-6. The UI always computes an explicit tick from the live
 * price instead of relying on this.
 */
export const DEFAULT_TICK = -27800;
/** Default USD starting market cap target (Clanker standard pools open ~$27-30k). */
export const DEFAULT_MARKET_CAP_USD = 30_000;
/** Uniswap v4 usable tick bounds (rounded to spacing). */
export const MIN_TICK = -887200;
export const MAX_TICK = 887200;

export function tickForMarketCap(marketCapHoodie: number): number {
  if (!Number.isFinite(marketCapHoodie) || marketCapHoodie <= 0) {
    throw new Error('Market cap must be a positive number of $HOODIE');
  }
  const price = marketCapHoodie / TOTAL_SUPPLY;
  const rawTick = Math.log(price) / Math.log(1.0001);
  const tick = Math.floor(rawTick / TICK_SPACING) * TICK_SPACING;
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`Market cap out of range (computed tick ${tick})`);
  }
  return tick;
}

export function marketCapForTick(tick: number): number {
  return 1.0001 ** tick * TOTAL_SUPPLY;
}

/** USD market cap -> tick, given the live $HOODIE/USD price. */
export function tickForMarketCapUsd(marketCapUsd: number, hoodiePriceUsd: number): number {
  if (!Number.isFinite(hoodiePriceUsd) || hoodiePriceUsd <= 0) {
    throw new Error('Need a positive $HOODIE/USD price');
  }
  return tickForMarketCap(marketCapUsd / hoodiePriceUsd);
}

/** Tick -> USD market cap, given the live $HOODIE/USD price. */
export function marketCapUsdForTick(tick: number, hoodiePriceUsd: number): number {
  return marketCapForTick(tick) * hoodiePriceUsd;
}
